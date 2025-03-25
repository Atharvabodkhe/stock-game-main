-- PERMANENT REAL-TIME FIX FOR ROOM COMPLETION STATUS
-- This ensures ALL rooms are properly marked as completed when all joined players finish

-- Step 1: Fix any existing rooms with incorrect completion status
DO $$
DECLARE
    room_record RECORD;
    total_players INTEGER;
    completed_players INTEGER;
    updated_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'INITIAL FIX: Scanning for rooms where all joined players completed but room not marked as completed';
    
    -- Find rooms that are not marked as completed
    FOR room_record IN 
        SELECT 
            gr.id,
            gr.status,
            gr.all_players_completed,
            gr.max_players
        FROM game_rooms gr
        WHERE (gr.all_players_completed = FALSE OR gr.all_players_completed IS NULL)
          AND gr.status != 'completed'
    LOOP
        -- For each room, count joined players and completed players
        SELECT 
            COUNT(*) FILTER (WHERE status != 'left'),
            COUNT(*) FILTER (WHERE status = 'completed')
        INTO
            total_players,
            completed_players
        FROM room_players
        WHERE room_id = room_record.id;
        
        -- Check if there are any players and all joined players have completed
        IF total_players > 0 AND completed_players = total_players THEN
            RAISE NOTICE 'INITIAL FIX: Room % has all players completed (%/%) but not marked as completed', 
                room_record.id, completed_players, total_players;
                
            -- Update the room status
            UPDATE game_rooms
            SET 
                status = 'completed',
                all_players_completed = TRUE,
                completion_time = COALESCE(completion_time, NOW())
            WHERE id = room_record.id;
            
            -- Also ensure all players in this room are marked as completed
            UPDATE room_players
            SET 
                status = 'completed',
                completed_at = COALESCE(completed_at, NOW()),
                completion_status = 'completed'
            WHERE room_id = room_record.id
            AND status != 'left'
            AND status != 'completed';
            
            updated_count := updated_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'INITIAL FIX: Updated % rooms to completed status', updated_count;
END $$;

-- Step 2: Create a function to manually check room completion
-- This can be called to force a room check if needed
CREATE OR REPLACE FUNCTION force_check_room_completion(room_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    total_players INTEGER;
    completed_players INTEGER;
    updated BOOLEAN := FALSE;
BEGIN
    -- Count joined players and completed players
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'completed')
    INTO
        total_players,
        completed_players
    FROM room_players
    WHERE room_id = room_id_param;
    
    RAISE NOTICE 'MANUAL CHECK: Room % has %/% players completed', 
        room_id_param, completed_players, total_players;
    
    -- If all joined players have completed, update room status
    IF total_players > 0 AND completed_players = total_players THEN
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW())
        WHERE id = room_id_param
        AND (all_players_completed = FALSE OR all_players_completed IS NULL OR status != 'completed');
        
        GET DIAGNOSTICS total_players = ROW_COUNT;
        
        IF total_players > 0 THEN
            RAISE NOTICE 'MANUAL CHECK: Updated room % to completed', room_id_param;
            
            -- Also ensure all players are marked as completed
            UPDATE room_players
            SET 
                status = 'completed',
                completed_at = COALESCE(completed_at, NOW()),
                completion_status = 'completed'
            WHERE room_id = room_id_param
            AND status != 'left'
            AND status != 'completed';
            
            updated := TRUE;
        END IF;
    END IF;
    
    RETURN updated;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Add a player-completion trigger to ensure player status is consistent
-- This will ensure a player with completed_at is always marked as 'completed'
CREATE OR REPLACE FUNCTION ensure_player_completed_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If player has completed_at timestamp but isn't marked as completed
    IF NEW.completed_at IS NOT NULL AND NEW.status != 'completed' AND NEW.status != 'left' THEN
        RAISE NOTICE 'PLAYER STATUS FIX: Player % has completed_at but status is %, fixing to completed', 
            NEW.id, NEW.status;
            
        NEW.status := 'completed';
        NEW.completion_status := 'completed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the player status trigger
DROP TRIGGER IF EXISTS ensure_player_completed_status_trigger ON room_players;
CREATE TRIGGER ensure_player_completed_status_trigger
BEFORE UPDATE OR INSERT
ON room_players
FOR EACH ROW
EXECUTE FUNCTION ensure_player_completed_status();

-- Step 4: Create a more robust check_room_completion trigger function
CREATE OR REPLACE FUNCTION check_room_completion()
RETURNS TRIGGER AS $$
DECLARE
    total_joined_players INTEGER;
    completed_players INTEGER;
    left_players INTEGER;
    room_id_var UUID;
    room_status TEXT;
    room_all_completed BOOLEAN;
BEGIN
    -- Make sure we have the room_id
    IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
        room_id_var := NEW.room_id;
    ELSIF TG_OP = 'DELETE' THEN
        room_id_var := OLD.room_id;
    ELSE
        -- Unknown operation, exit
        RETURN NEW;
    END IF;
    
    -- Get current room status
    SELECT status, all_players_completed 
    INTO room_status, room_all_completed
    FROM game_rooms
    WHERE id = room_id_var;
    
    -- If room is already marked as completed, exit early
    IF room_status = 'completed' AND room_all_completed = TRUE THEN
        RAISE NOTICE 'ROOM ALREADY COMPLETED: Room % is already marked as completed', room_id_var;
        RETURN NEW;
    END IF;

    -- Count players by status
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status = 'left')
    INTO
        total_joined_players,
        completed_players,
        left_players
    FROM room_players
    WHERE room_id = room_id_var;

    -- Log status for debugging
    RAISE NOTICE 'ROOM COMPLETION CHECK: Room % has % completed out of % active players (% left)', 
        room_id_var, completed_players, total_joined_players, left_players;

    -- Critical fix: Compare completed players against active players (joined, not left)
    -- Room is complete when all non-left players have completed
    IF total_joined_players > 0 AND completed_players = total_joined_players THEN
        RAISE NOTICE 'ROOM COMPLETION UPDATE: All active players (%) completed in room %. Marking as completed', 
            total_joined_players, room_id_var;
        
        -- Mark the room as completed
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW())
        WHERE id = room_id_var
        AND (all_players_completed = FALSE OR all_players_completed IS NULL OR status != 'completed');
        
        -- Also ensure all non-left players are marked as completed
        UPDATE room_players
        SET 
            status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            completion_status = 'completed'
        WHERE room_id = room_id_var
        AND status != 'left'
        AND status != 'completed';
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block the transaction
    RAISE NOTICE 'ERROR in check_room_completion: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the room completion trigger
DROP TRIGGER IF EXISTS check_room_completion_trigger ON room_players;
CREATE TRIGGER check_room_completion_trigger
AFTER UPDATE OR INSERT OR DELETE
ON room_players
FOR EACH ROW
EXECUTE FUNCTION check_room_completion();

-- Step 5: Create a trigger that also runs when the game_rooms table is updated
-- This ensures room completion is checked when a game session ends
CREATE OR REPLACE FUNCTION check_room_completion_on_room_update()
RETURNS TRIGGER AS $$
DECLARE
    total_joined_players INTEGER;
    completed_players INTEGER;
BEGIN
    -- Check if this room has all players completed
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'completed')
    INTO
        total_joined_players,
        completed_players
    FROM room_players
    WHERE room_id = NEW.id;
    
    RAISE NOTICE 'ROOM UPDATE TRIGGER: Room % has % completed out of % active players', 
        NEW.id, completed_players, total_joined_players;
    
    -- If all active players have completed, ensure room is marked completed
    IF total_joined_players > 0 AND completed_players = total_joined_players 
       AND (NEW.all_players_completed = FALSE OR NEW.all_players_completed IS NULL OR NEW.status != 'completed') THEN
        
        RAISE NOTICE 'ROOM UPDATE TRIGGER: Marking room % as completed', NEW.id;
        
        NEW.all_players_completed := TRUE;
        NEW.status := 'completed';
        NEW.completion_time := COALESCE(NEW.completion_time, NOW());
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't block the transaction
    RAISE NOTICE 'ERROR in check_room_completion_on_room_update: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the room update trigger
DROP TRIGGER IF EXISTS check_room_completion_room_update_trigger ON game_rooms;
CREATE TRIGGER check_room_completion_room_update_trigger
BEFORE UPDATE
ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION check_room_completion_on_room_update();

-- Final step: Report any rooms that still need fixing
SELECT 
    gr.id as room_id,
    gr.status as room_status,
    gr.all_players_completed,
    COUNT(rp.id) FILTER (WHERE rp.status != 'left') AS total_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'completed') AS completed_players
FROM game_rooms gr
LEFT JOIN room_players rp ON rp.room_id = gr.id
WHERE 
    (gr.all_players_completed = FALSE OR gr.all_players_completed IS NULL)
    AND gr.status != 'completed'
GROUP BY gr.id, gr.status, gr.all_players_completed
HAVING 
    COUNT(rp.id) FILTER (WHERE rp.status != 'left') > 0 
    AND COUNT(rp.id) FILTER (WHERE rp.status != 'left') = COUNT(rp.id) FILTER (WHERE rp.status = 'completed'); 