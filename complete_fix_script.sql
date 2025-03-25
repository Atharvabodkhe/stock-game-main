-- COMPLETE ROOM COMPLETION TRACKING FIX SCRIPT
-- Run this in the Supabase SQL Editor to fix the room completion functionality

-- Step 1: Fix the statistics function to query room completion data
CREATE OR REPLACE FUNCTION get_room_completion_status(room_id UUID)
RETURNS TABLE (
    total_players INTEGER,
    completed_players INTEGER,
    is_completed BOOLEAN,
    completion_time TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(CASE WHEN rp.status != 'left' THEN 1 END)::INTEGER as total_players,
        COUNT(CASE WHEN rp.status = 'completed' THEN 1 END)::INTEGER as completed_players,
        gr.all_players_completed as is_completed,
        gr.completion_time
    FROM game_rooms gr
    LEFT JOIN room_players rp ON rp.room_id = gr.id
    WHERE gr.id = room_id
    GROUP BY gr.all_players_completed, gr.completion_time;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Fix the trigger function to detect when all players have completed
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
        
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = NOW(),
            ended_at = NOW()
        WHERE id = room_id_var;
        
        -- Also ensure any players in this room who aren't already marked as completed are fixed
        -- This handles potential edge cases where a player might have been missed
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

-- Step 3: Fix the trigger definition
DROP TRIGGER IF EXISTS check_room_completion_trigger ON room_players;
CREATE TRIGGER check_room_completion_trigger
AFTER UPDATE OR INSERT
ON room_players
FOR EACH ROW
EXECUTE FUNCTION check_room_completion();

-- Step 4: Create a manual function to force check room completion
CREATE OR REPLACE FUNCTION force_check_room_completion(room_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    total_players INTEGER;
    completed_players INTEGER;
    active_players INTEGER;
    affected_rows INTEGER := 0;
    current_status TEXT;
BEGIN
    -- Get lock on the game_rooms row to prevent concurrent updates
    SELECT status INTO current_status
    FROM game_rooms
    WHERE id = room_id_param
    FOR UPDATE NOWAIT; -- Get lock immediately or fail
    
    IF current_status IS NULL THEN
        RAISE NOTICE '[ERROR] Room % not found', room_id_param;
        RETURN FALSE;
    END IF;
    
    -- Already completed, no need to update
    IF current_status = 'completed' THEN
        RAISE NOTICE '[INFO] Room % is already marked as completed', room_id_param;
        RETURN TRUE;
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
        -- Update game room status
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW()),
            ended_at = COALESCE(ended_at, NOW())
        WHERE id = room_id_param
        AND (status != 'completed' OR all_players_completed = FALSE);
        
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        
        IF affected_rows > 0 THEN
            RAISE NOTICE '[SUCCESS] Room % marked as completed', room_id_param;
            
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
            RAISE NOTICE '[INFO] Room % already correctly marked as completed', room_id_param;
            RETURN TRUE;
        END IF;
    ELSE
        RAISE NOTICE '[INFO] Room % has %/% completed players - not all completed yet', 
            room_id_param, completed_players, total_players;
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Run a maintenance function to fix any inconsistent room statuses
DO $$
DECLARE
    room_record RECORD;
BEGIN
    -- Find all rooms where all players are completed but room is not marked completed
    FOR room_record IN 
        SELECT 
            gr.id,
            COUNT(rp.id) FILTER (WHERE rp.status != 'left') AS total_players,
            COUNT(rp.id) FILTER (WHERE rp.status = 'completed') AS completed_players
        FROM game_rooms gr
        JOIN room_players rp ON rp.room_id = gr.id
        WHERE gr.status != 'completed'
        GROUP BY gr.id
        HAVING COUNT(rp.id) FILTER (WHERE rp.status != 'left') > 0 
            AND COUNT(rp.id) FILTER (WHERE rp.status != 'left') = COUNT(rp.id) FILTER (WHERE rp.status = 'completed')
    LOOP
        RAISE NOTICE 'Fixing inconsistent room: %, with % players completed out of %', 
            room_record.id, room_record.completed_players, room_record.total_players;
            
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW()),
            ended_at = COALESCE(ended_at, NOW())
        WHERE id = room_record.id;
    END LOOP;
    
    -- Find all completed rooms and ensure all players are marked correctly
    FOR room_record IN 
        SELECT gr.id
        FROM game_rooms gr
        WHERE gr.status = 'completed'
    LOOP
        UPDATE room_players
        SET 
            status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            completion_status = 'completed'
        WHERE room_id = room_record.id
        AND status != 'left'
        AND status != 'completed';
    END LOOP;
END $$;

-- Step 6: Test the functions
-- Check a random room's completion status
SELECT * FROM get_room_completion_status((SELECT id FROM game_rooms LIMIT 1));

-- Output test message
DO $$
BEGIN
    RAISE NOTICE 'Room completion fix script completed successfully!';
END $$; 