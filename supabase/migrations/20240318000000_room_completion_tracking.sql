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

-- Create function to mark player completion
CREATE OR REPLACE FUNCTION mark_player_completed(player_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    affected_rows INTEGER := 0;
    room_id_var UUID;
    current_status TEXT;
    orig_xact_level INTEGER;
    session_id_var UUID;
BEGIN
    -- Store original transaction level to handle nested transactions properly
    orig_xact_level := txid_current();
    RAISE NOTICE '[TRANSACTION] Starting operation for player % at transaction level %', player_id, orig_xact_level;
    
    -- Check if player is already marked as completed to avoid redundant updates
    SELECT status, room_id, session_id INTO current_status, room_id_var, session_id_var
    FROM room_players
    WHERE id = player_id
    FOR UPDATE NOWAIT; -- Lock the row to prevent concurrent updates, fail immediately if locked
    
    IF room_id_var IS NULL THEN
        RAISE NOTICE '[ERROR] Cannot find room_id for player %', player_id;
        RETURN FALSE;
    END IF;
    
    -- Update player status with completed_at timestamp if not already completed
    UPDATE room_players
    SET 
        status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),  -- Only set if null
        completion_status = 'completed'
    WHERE id = player_id
    AND (status != 'completed' OR completed_at IS NULL);
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    
    -- Log whether we made an update or player was already completed
    IF affected_rows > 0 THEN
        RAISE NOTICE '[SUCCESS] Player % marked as completed in room %', player_id, room_id_var;
        
        -- Also update the game_sessions completed_at field if session_id exists
        IF session_id_var IS NOT NULL THEN
            RAISE NOTICE '[INFO] Updating completed_at for session %', session_id_var;
            UPDATE game_sessions
            SET completed_at = NOW()
            WHERE id = session_id_var
            AND (completed_at IS NULL OR TRUE); -- Always update to ensure consistency
        END IF;
    ELSE
        IF current_status = 'completed' THEN
            RAISE NOTICE '[INFO] Player % was already marked as completed', player_id;
            
            -- Still update the session even if player was already completed
            IF session_id_var IS NOT NULL THEN
                RAISE NOTICE '[INFO] Ensuring completed_at for session %', session_id_var;
                UPDATE game_sessions
                SET completed_at = COALESCE(completed_at, NOW())
                WHERE id = session_id_var;
            END IF;
        ELSE
            RAISE NOTICE '[WARNING] Player % status update had no effect (status=%)', player_id, current_status;
        END IF;
    END IF;
    
    -- Ensure transaction for player update is committed before checking room state
    -- This ensures visibility of player status updates
    RAISE NOTICE '[TRANSACTION] Committing player update for %', player_id;
    COMMIT;
    
    -- Force check room completion status in a new transaction
    BEGIN
        RAISE NOTICE '[CHECK] Forcing room completion check for room %', room_id_var;
        PERFORM force_check_room_completion(room_id_var);
        RETURN TRUE;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '[ERROR] Exception in room completion check: %', SQLERRM;
        RETURN FALSE;
    END;
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

-- Create a function to force check room completion status
-- This can be called explicitly when needed
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
        AND (status != 'completed' OR completion_time IS NULL);
        
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
            RAISE NOTICE '[NO CHANGE] Room % was already properly marked', room_id_param;
            RETURN TRUE;
        END IF;
    ELSE
        RAISE NOTICE '[INFO] Not all players are completed in room % (%/%), skipping update', 
            room_id_param, completed_players, total_players;
        RETURN FALSE;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[ERROR] Exception updating room %: %', room_id_param, SQLERRM;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Add function to update game_session.completed_at when a player's status is marked as completed
CREATE OR REPLACE FUNCTION update_game_session_on_player_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if the player's status is being changed to 'completed'
  IF (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed')) 
     OR (NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL) THEN
    
    -- Find the session_id and room_id for this player
    DECLARE
      player_session_id UUID;
      player_room_id UUID;
      total_players INTEGER;
      completed_players INTEGER;
      active_players INTEGER;
      current_room_status TEXT;
    BEGIN
      -- Get both session_id and room_id
      SELECT session_id, room_id INTO player_session_id, player_room_id 
      FROM room_players WHERE id = NEW.id;
      
      IF player_session_id IS NOT NULL THEN
        -- Update the game_sessions.completed_at if not already set
        UPDATE game_sessions
        SET completed_at = COALESCE(completed_at, NOW())
        WHERE id = player_session_id;
        
        RAISE LOG 'Updated game_session.completed_at for session %', player_session_id;
      END IF;
      
      -- If we have a room_id, check if all players are now completed
      IF player_room_id IS NOT NULL THEN
        -- First check if room is already completed
        SELECT status INTO current_room_status
        FROM game_rooms
        WHERE id = player_room_id;
        
        IF current_room_status = 'completed' THEN
          RAISE LOG 'Room % is already marked as completed, no further action needed', player_room_id;
          RETURN NEW;
        END IF;
      
        -- Count total active players and completed players
        SELECT 
          COUNT(*) FILTER (WHERE status != 'left'),
          COUNT(*) FILTER (WHERE status = 'completed'),
          COUNT(*) FILTER (WHERE status IN ('in_game', 'joined'))
        INTO
          total_players,
          completed_players,
          active_players
        FROM room_players
        WHERE room_id = player_room_id;
        
        RAISE LOG 'Room completion check: %/% players completed in room %, % active players remaining', 
          completed_players, total_players, player_room_id, active_players;
        
        -- Force completion in these cases:
        -- 1. If all players are completed
        -- 2. If all but one player is completed 
        -- 3. If there are no more active players but the room isn't marked completed
        IF (total_players > 0 AND completed_players = total_players) OR
           (total_players > 1 AND completed_players >= (total_players - 1)) OR
           (total_players > 0 AND active_players = 0) THEN
          
          RAISE LOG 'Condition met for completion: total=%/completed=%/active=%, marking room % as completed', 
            total_players, completed_players, active_players, player_room_id;
          
          -- Mark the room as completed
          UPDATE game_rooms
          SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW()),
            ended_at = COALESCE(ended_at, NOW())
          WHERE id = player_room_id
          AND status != 'completed';
          
          -- Mark any remaining players as completed
          UPDATE room_players
          SET 
            status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            completion_status = 'completed'
          WHERE room_id = player_room_id
          AND status != 'left'
          AND status != 'completed';
          
          -- Ensure all sessions are marked as completed
          UPDATE game_sessions
          SET completed_at = COALESCE(completed_at, NOW())
          WHERE room_id = player_room_id
          AND completed_at IS NULL;
          
          RAISE LOG 'Marked room % and all players as completed', player_room_id;
        END IF;
      END IF;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run after player status updates
DROP TRIGGER IF EXISTS update_session_on_player_completion ON room_players;
CREATE TRIGGER update_session_on_player_completion
AFTER UPDATE OF status, completed_at ON room_players
FOR EACH ROW
EXECUTE FUNCTION update_game_session_on_player_completion(); 