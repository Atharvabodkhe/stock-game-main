-- Add completion tracking columns to room_players table
ALTER TABLE room_players
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS completion_status TEXT CHECK (completion_status IN ('pending', 'completed')) DEFAULT 'pending';

-- Add completion tracking columns to game_rooms table
ALTER TABLE game_rooms
ADD COLUMN IF NOT EXISTS all_players_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS completion_time TIMESTAMP WITH TIME ZONE;

-- Create function to check and update room completion status
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
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for room completion check - make it respond to ALL updates, not just status
DROP TRIGGER IF EXISTS check_room_completion_trigger ON room_players;
CREATE TRIGGER check_room_completion_trigger
AFTER UPDATE OR INSERT
ON room_players
FOR EACH ROW
EXECUTE FUNCTION check_room_completion();

-- Create function to mark player completion - keep this simple
CREATE OR REPLACE FUNCTION mark_player_completed(player_id UUID)
RETURNS VOID AS $$
BEGIN
    -- Simple update
    UPDATE room_players
    SET 
        status = 'completed',
        completed_at = NOW(),
        completion_status = 'completed'
    WHERE id = player_id;
    
    RAISE NOTICE 'Player % marked as completed', player_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to get room completion status - keep this simple too
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

-- Add a new function to force check and update room completion
CREATE OR REPLACE FUNCTION force_check_room_completion(room_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    total_players INTEGER;
    completed_players INTEGER;
    update_success BOOLEAN := FALSE;
BEGIN
    -- Get exact counts directly from the database
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'completed')
    INTO 
        total_players, completed_players
    FROM room_players
    WHERE room_id = room_id_param;
    
    RAISE NOTICE 'FORCE CHECK: Room % has % completed out of % active players', 
        room_id_param, completed_players, total_players;
    
    -- If all players have completed, force update the room status
    IF total_players > 0 AND completed_players = total_players THEN
        RAISE NOTICE 'FORCE UPDATE: All players in room % have completed, forcing room status update', room_id_param;
        
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = NOW(),
            ended_at = NOW()
        WHERE id = room_id_param;
        
        GET DIAGNOSTICS update_success = ROW_COUNT;
        
        IF update_success THEN
            RAISE NOTICE 'FORCE UPDATE SUCCESS: Room % marked as completed', room_id_param;
            RETURN TRUE;
        ELSE
            RAISE NOTICE 'FORCE UPDATE FAILED: Room % could not be updated', room_id_param;
            RETURN FALSE;
        END IF;
    ELSE
        RAISE NOTICE 'FORCE UPDATE SKIPPED: Not all players in room % have completed (%/%)', 
            room_id_param, completed_players, total_players;
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql; 