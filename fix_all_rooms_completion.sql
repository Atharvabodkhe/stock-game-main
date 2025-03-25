-- FIX FOR ALL ROOMS WHERE JOINED PLAYERS COMPLETED BUT ROOMS NOT MARKED AS COMPLETED

-- Step 1: Find and update ALL rooms where all joined players have completed but room is not marked completed
DO $$
DECLARE
    room_record RECORD;
    total_players INTEGER;
    completed_players INTEGER;
    updated_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Beginning scan for ALL rooms where all joined players completed but room not marked as completed';
    
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
            RAISE NOTICE 'Room % has all players completed (%/%) but not marked as completed', 
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
    
    RAISE NOTICE 'Updated % rooms to completed status', updated_count;
END $$;

-- Step 2: Update/fix the check_room_completion trigger function to compare against joined players
CREATE OR REPLACE FUNCTION check_room_completion()
RETURNS TRIGGER AS $$
DECLARE
    total_joined_players INTEGER;
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

    -- Count only players who have joined or are in_game or completed (not left)
    SELECT COUNT(*)
    INTO total_joined_players
    FROM room_players
    WHERE room_id = room_id_var
    AND status != 'left';

    -- Count completed players
    SELECT COUNT(*)
    INTO completed_players
    FROM room_players
    WHERE room_id = room_id_var
    AND status = 'completed';

    -- Log status for debugging
    RAISE NOTICE 'ROOM COMPLETION CHECK: Room % has % completed out of % joined players', 
        room_id_var, completed_players, total_joined_players;

    -- Critical fix: Check against JOINED players, not max_players
    -- If there are players and all of them completed, mark room as completed
    IF total_joined_players > 0 AND completed_players = total_joined_players THEN
        RAISE NOTICE 'All joined players (%) completed in room %. Marking as completed', 
            total_joined_players, room_id_var;
        
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW())
        WHERE id = room_id_var;
        
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
END;
$$ LANGUAGE plpgsql;

-- Make sure the trigger is properly set up
DROP TRIGGER IF EXISTS check_room_completion_trigger ON room_players;
CREATE TRIGGER check_room_completion_trigger
AFTER UPDATE OR INSERT
ON room_players
FOR EACH ROW
EXECUTE FUNCTION check_room_completion();

-- Step 3: Report all rooms that are still not properly completed (should be none after fix)
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