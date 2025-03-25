-- TARGETED FIX FOR all_players_completed NOT UPDATING
-- Run this in the Supabase SQL Editor

-- Step 1: Update any existing rooms where all players have completed but flag is not set
DO $$
DECLARE
    room_record RECORD;
    updated_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Beginning scan for rooms with incorrect all_players_completed flag';
    
    -- Find all rooms where all players are completed but the flag is not set
    FOR room_record IN 
        SELECT 
            gr.id,
            gr.status,
            gr.all_players_completed,
            COUNT(rp.id) FILTER (WHERE rp.status != 'left') AS total_players,
            COUNT(rp.id) FILTER (WHERE rp.status = 'completed') AS completed_players
        FROM game_rooms gr
        JOIN room_players rp ON rp.room_id = gr.id
        WHERE (gr.all_players_completed = FALSE OR gr.all_players_completed IS NULL)
        GROUP BY gr.id, gr.status, gr.all_players_completed
        HAVING COUNT(rp.id) FILTER (WHERE rp.status != 'left') > 0 
            AND COUNT(rp.id) FILTER (WHERE rp.status != 'left') = COUNT(rp.id) FILTER (WHERE rp.status = 'completed')
    LOOP
        RAISE NOTICE 'Found room % with incorrect completion status: all_players_completed=%, status=%, %/% players completed', 
            room_record.id, room_record.all_players_completed, room_record.status, 
            room_record.completed_players, room_record.total_players;
            
        -- Update the room status and flag
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW())
        WHERE id = room_record.id;
        
        updated_count := updated_count + 1;
        
        -- Also ensure all players are marked as completed
        UPDATE room_players
        SET 
            status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            completion_status = 'completed'
        WHERE room_id = room_record.id
        AND status != 'left'
        AND status != 'completed';
    END LOOP;
    
    -- Output summary message
    IF updated_count > 0 THEN
        RAISE NOTICE 'Fixed % rooms with incorrect all_players_completed flag', updated_count;
    ELSE
        RAISE NOTICE 'No rooms found with incorrect all_players_completed flag';
    END IF;
END $$;

-- Step 2: Verify the trigger function exists and is correct
-- This will replace the check_room_completion function if it exists
CREATE OR REPLACE FUNCTION check_room_completion()
RETURNS TRIGGER AS $$
DECLARE
    total_players INTEGER;
    completed_players INTEGER;
    room_id_var UUID;
BEGIN
    -- Make sure we have the room_id
    IF TG_OP = 'UPDATE' THEN
        room_id_var := NEW.room_id;
    ELSE
        -- For operations like INSERT
        room_id_var := NEW.room_id;
    END IF;

    -- Simple direct count of players (excluding left players)
    SELECT COUNT(*)
    INTO total_players
    FROM room_players
    WHERE room_id = room_id_var
    AND status != 'left';

    -- Simple direct count of completed players
    SELECT COUNT(*)
    INTO completed_players
    FROM room_players
    WHERE room_id = room_id_var
    AND status = 'completed';

    -- Log status for debugging
    RAISE NOTICE 'TRIGGER COMPLETION CHECK: Room % has % completed out of % total players', 
        room_id_var, completed_players, total_players;

    -- Very straightforward completion check - if all players completed, mark room completed
    IF total_players > 0 AND completed_players = total_players THEN
        RAISE NOTICE 'TRIGGER UPDATE: All players completed in room %. Marking as completed', room_id_var;
        
        -- CRITICAL FIX: Explicitly set all_players_completed to TRUE
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW())
        WHERE id = room_id_var;
        
        -- Also ensure any players in this room who aren't already marked as completed are fixed
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
END;
$$ LANGUAGE plpgsql;

-- Step 3: Make sure the trigger is properly set up
DROP TRIGGER IF EXISTS check_room_completion_trigger ON room_players;
CREATE TRIGGER check_room_completion_trigger
AFTER UPDATE OR INSERT
ON room_players
FOR EACH ROW
EXECUTE FUNCTION check_room_completion();

-- Step 4: Force check for a specific room (uncomment and update with your room id if needed)
-- SELECT * FROM force_check_room_completion('YOUR_ROOM_ID_HERE');

-- Step 5: Create or update the force_check function for manual fixes
CREATE OR REPLACE FUNCTION force_check_room_completion(room_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    total_players INTEGER;
    completed_players INTEGER;
    active_players INTEGER;
    affected_rows INTEGER := 0;
    current_status TEXT;
    current_all_players_completed BOOLEAN;
BEGIN
    -- Get lock on the game_rooms row to prevent concurrent updates
    SELECT status, all_players_completed INTO current_status, current_all_players_completed
    FROM game_rooms
    WHERE id = room_id_param
    FOR UPDATE NOWAIT; -- Get lock immediately or fail
    
    RAISE NOTICE '[INFO] Room % current status: %, all_players_completed: %', 
        room_id_param, current_status, current_all_players_completed;
    
    IF current_status IS NULL THEN
        RAISE NOTICE '[ERROR] Room % not found', room_id_param;
        RETURN FALSE;
    END IF;
    
    -- Count players with different statuses
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status IN ('in_game', 'joined'))
    INTO
        total_players,
        completed_players,
        active_players
    FROM room_players
    WHERE room_id = room_id_param;
    
    RAISE NOTICE '[CHECK] Room %: total=%, completed=%, active=%', 
        room_id_param, total_players, completed_players, active_players;
    
    -- Update room status if all players have completed
    IF total_players > 0 AND completed_players = total_players THEN
        RAISE NOTICE '[INFO] All players are completed, updating room status';
        
        -- CRITICAL FIX: Explicitly set all_players_completed to TRUE
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW())
        WHERE id = room_id_param;
        
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        
        IF affected_rows > 0 THEN
            RAISE NOTICE '[SUCCESS] Room % marked as completed with all_players_completed=TRUE', room_id_param;
            
            -- Also mark any straggler players as completed
            UPDATE room_players
            SET 
                status = 'completed',
                completed_at = COALESCE(completed_at, NOW()),
                completion_status = 'completed'
            WHERE room_id = room_id_param
            AND status != 'left'
            AND (status != 'completed' OR completed_at IS NULL);
            
            -- Mark related game sessions as completed
            UPDATE game_sessions
            SET completed_at = COALESCE(completed_at, NOW())
            WHERE room_id = room_id_param
            AND completed_at IS NULL;
            
            RETURN TRUE;
        ELSE
            RAISE NOTICE '[INFO] No updates needed for room %', room_id_param;
            RETURN TRUE;
        END IF;
    ELSE
        RAISE NOTICE '[INFO] Not all players are completed (% of %), no changes made', 
            completed_players, total_players;
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Output completion message
DO $$
BEGIN
    RAISE NOTICE 'Fix script for all_players_completed completed successfully!';
END $$; 