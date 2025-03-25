-- Room Completions Integration Script
-- This script integrates the room_completions schema with the existing Admin Dashboard 
-- without changing any existing functionality or UI code

-- Start a transaction to ensure all changes are applied together
BEGIN;

-- 1. Create or replace the get_completed_rooms_with_players function
-- This function is used by the Admin Dashboard to display completed rooms
-- We'll modify it to pull data from room_completions instead of directly from game_rooms
CREATE OR REPLACE FUNCTION get_completed_rooms_with_players()
RETURNS SETOF json AS $$
DECLARE
    room_record RECORD;
    result_json json;
BEGIN
    -- Get all completed rooms from the room_completions table
    FOR room_record IN 
        SELECT 
            gr.id,
            gr.name, 
            gr.status,
            gr.min_players,
            gr.max_players,
            gr.created_at,
            gr.started_at,
            gr.ended_at,
            rc.completion_time,
            gr.all_players_completed,
            rc.player_count,
            rc.completed_player_count,
            rc.average_player_balance,
            rc.highest_player_balance
        FROM room_completions rc
        JOIN game_rooms gr ON rc.room_id = gr.id
        ORDER BY rc.completion_time DESC
    LOOP
        -- For each room, get the players
        SELECT 
            json_build_object(
                'id', room_record.id,
                'name', room_record.name,
                'status', room_record.status,
                'min_players', room_record.min_players,
                'max_players', room_record.max_players,
                'created_at', room_record.created_at,
                'started_at', room_record.started_at,
                'ended_at', room_record.ended_at,
                'completion_time', room_record.completion_time,
                'all_players_completed', room_record.all_players_completed,
                'players', (
                    SELECT json_agg(
                        json_build_object(
                            'id', rp.id,
                            'user_id', rp.user_id,
                            'status', rp.status,
                            'session_id', rp.session_id,
                            'user', json_build_object(
                                'name', u.name,
                                'email', u.email
                            )
                        )
                    )
                    FROM room_players rp
                    LEFT JOIN users u ON rp.user_id = u.id
                    WHERE rp.room_id = room_record.id
                )
            ) INTO result_json;
            
        RETURN NEXT result_json;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- 2. Enhance room completion trigger to handle deleting completed rooms from the active list
-- This keeps the original row in game_rooms but adds a completion flag that the UI can use
CREATE OR REPLACE FUNCTION create_room_completion_record()
RETURNS TRIGGER AS $$
DECLARE
  player_data RECORD;
  total_balance DECIMAL(10, 2) := 0;
  player_count INT := 0;
  completed_count INT := 0;
  highest_balance DECIMAL(10, 2) := 0;
  lowest_balance DECIMAL(10, 2) := 999999999;
  completion_duration INTERVAL := NULL;
  fastest_completion INTERVAL := NULL;
  slowest_completion INTERVAL := NULL;
BEGIN
  -- Only proceed if the room is being marked as completed
  IF (TG_OP = 'UPDATE' AND 
     (NEW.status = 'completed' OR NEW.all_players_completed = true) AND
     (OLD.status != 'completed' AND (OLD.all_players_completed IS NULL OR OLD.all_players_completed = false))) THEN
    
    -- Calculate completion duration if started_at is available
    IF NEW.started_at IS NOT NULL THEN
      completion_duration := COALESCE(NEW.completion_time, NOW()) - NEW.started_at;
    END IF;
    
    -- Get player stats
    FOR player_data IN (
      SELECT 
        p.status,
        p.completed_at,
        COALESCE(r.final_balance, 0) as final_balance,
        CASE WHEN p.completed_at IS NOT NULL AND p.started_at IS NOT NULL 
             THEN p.completed_at - p.started_at 
             ELSE NULL 
        END as player_duration
      FROM room_players p
      LEFT JOIN game_results r ON p.session_id = r.session_id
      WHERE p.room_id = NEW.id AND p.status != 'left'
    ) LOOP
      player_count := player_count + 1;
      
      -- Count completed players
      IF player_data.status = 'completed' THEN
        completed_count := completed_count + 1;
      END IF;
      
      -- Track balance stats
      IF player_data.final_balance IS NOT NULL THEN
        total_balance := total_balance + player_data.final_balance;
        
        IF player_data.final_balance > highest_balance THEN
          highest_balance := player_data.final_balance;
        END IF;
        
        IF player_data.final_balance < lowest_balance AND player_data.final_balance >= 0 THEN
          lowest_balance := player_data.final_balance;
        END IF;
      END IF;
      
      -- Track completion duration stats
      IF player_data.player_duration IS NOT NULL THEN
        IF fastest_completion IS NULL OR player_data.player_duration < fastest_completion THEN
          fastest_completion := player_data.player_duration;
        END IF;
        
        IF slowest_completion IS NULL OR player_data.player_duration > slowest_completion THEN
          slowest_completion := player_data.player_duration;
        END IF;
      END IF;
    END LOOP;
    
    -- Avoid division by zero
    IF player_count = 0 THEN
      player_count := 1;
    END IF;
    
    -- If no players have balances, reset lowest balance
    IF lowest_balance = 999999999 THEN
      lowest_balance := 0;
    END IF;
    
    -- Check if a record already exists for this room (to avoid duplicates)
    IF NOT EXISTS (SELECT 1 FROM room_completions WHERE room_id = NEW.id) THEN
      -- Insert the completion record
      INSERT INTO room_completions (
        room_id,
        completion_time,
        all_players_completed,
        player_count,
        completed_player_count,
        completion_duration,
        fastest_player_completion,
        slowest_player_completion,
        average_player_balance,
        highest_player_balance,
        lowest_player_balance,
        metadata
      ) VALUES (
        NEW.id,
        COALESCE(NEW.completion_time, NOW()),
        COALESCE(NEW.all_players_completed, completed_count = player_count),
        player_count,
        completed_count,
        completion_duration,
        fastest_completion,
        slowest_completion,
        CASE WHEN player_count > 0 THEN total_balance / player_count ELSE 0 END,
        highest_balance,
        lowest_balance,
        jsonb_build_object(
          'room_name', NEW.name,
          'min_players', NEW.min_players,
          'max_players', NEW.max_players
        )
      );
      
      -- Make sure the original room record is properly marked as completed
      -- This ensures it will be filtered out of active rooms in the UI
      -- We don't modify any existing logic, we just make sure the flags are set correctly
      IF NEW.status != 'completed' OR NOT NEW.all_players_completed THEN
        UPDATE game_rooms
        SET 
          status = 'completed',
          all_players_completed = TRUE,
          completion_time = COALESCE(NEW.completion_time, NOW())
        WHERE id = NEW.id;
      END IF;
    ELSE
      -- Update existing record
      UPDATE room_completions
      SET 
        completion_time = COALESCE(NEW.completion_time, completion_time),
        all_players_completed = COALESCE(NEW.all_players_completed, completed_count = player_count),
        player_count = player_count,
        completed_player_count = completed_count,
        completion_duration = completion_duration,
        fastest_player_completion = fastest_completion,
        slowest_player_completion = slowest_completion,
        average_player_balance = CASE WHEN player_count > 0 THEN total_balance / player_count ELSE 0 END,
        highest_player_balance = highest_balance,
        lowest_player_balance = lowest_balance,
        metadata = jsonb_build_object(
          'room_name', NEW.name,
          'min_players', NEW.min_players,
          'max_players', NEW.max_players
        )
      WHERE room_id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Make sure our trigger is properly installed
DROP TRIGGER IF EXISTS room_completion_trigger ON game_rooms;

CREATE TRIGGER room_completion_trigger
AFTER UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION create_room_completion_record();

-- 4. Create an index to optimize the completed rooms queries
CREATE INDEX IF NOT EXISTS idx_game_rooms_completed ON game_rooms(status, all_players_completed);

-- 5. Run backfill to ensure all existing completed rooms are in the room_completions table
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  SELECT backfill_room_completions() INTO affected_count;
  RAISE NOTICE 'Backfilled % completed rooms into room_completions table', affected_count;
END $$;

-- Commit the transaction
COMMIT; 