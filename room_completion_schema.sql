-- Room Completion Schema
-- This schema adds a dedicated table for tracking detailed room completion data
-- without modifying any existing functionality

-- Create the room_completions table
CREATE TABLE room_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES game_rooms(id) ON DELETE CASCADE,
  completion_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  all_players_completed BOOLEAN NOT NULL DEFAULT false,
  player_count INT NOT NULL,
  completed_player_count INT NOT NULL,
  completion_duration INTERVAL, -- Time from room start to completion
  fastest_player_completion INTERVAL, -- Fastest individual player completion time
  slowest_player_completion INTERVAL, -- Slowest individual player completion time
  average_player_balance DECIMAL(10, 2), -- Average final balance across all players
  highest_player_balance DECIMAL(10, 2), -- Highest final balance across all players
  lowest_player_balance DECIMAL(10, 2), -- Lowest final balance across all players
  metadata JSONB, -- Additional metadata about the completion
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for efficient lookups
CREATE INDEX idx_room_completions_room_id ON room_completions(room_id);
CREATE INDEX idx_room_completions_completion_time ON room_completions(completion_time);

-- Create a function to automatically populate the room_completions table
-- whenever a game room is marked as completed
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
     (OLD.status != 'completed' AND OLD.all_players_completed != true)) THEN
    
    -- Calculate completion duration if started_at is available
    IF NEW.started_at IS NOT NULL THEN
      completion_duration := NEW.completion_time - NEW.started_at;
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
        
        IF player_data.final_balance < lowest_balance THEN
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
      NEW.completion_time,
      NEW.all_players_completed,
      player_count,
      completed_count,
      completion_duration,
      fastest_completion,
      slowest_completion,
      total_balance / player_count,
      highest_balance,
      lowest_balance,
      jsonb_build_object(
        'room_name', NEW.name,
        'min_players', NEW.min_players,
        'max_players', NEW.max_players
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on game_rooms table
CREATE TRIGGER room_completion_trigger
AFTER UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION create_room_completion_record();

-- Create a function to get comprehensive completion statistics
CREATE OR REPLACE FUNCTION get_room_completion_stats(room_id_param UUID)
RETURNS TABLE (
  room_id UUID,
  room_name TEXT,
  completion_time TIMESTAMPTZ,
  player_count INT,
  completed_player_count INT,
  completion_duration INTERVAL,
  fastest_player_time INTERVAL,
  slowest_player_time INTERVAL,
  average_balance DECIMAL(10, 2),
  highest_balance DECIMAL(10, 2),
  lowest_balance DECIMAL(10, 2),
  player_results JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rc.room_id,
    (rc.metadata->>'room_name')::TEXT as room_name,
    rc.completion_time,
    rc.player_count,
    rc.completed_player_count,
    rc.completion_duration,
    rc.fastest_player_completion,
    rc.slowest_player_completion,
    rc.average_player_balance,
    rc.highest_player_balance,
    rc.lowest_player_balance,
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'player_id', rp.user_id,
          'player_name', u.name,
          'status', rp.status,
          'final_balance', COALESCE(gr.final_balance, 0),
          'rank', gr.rank,
          'completed_at', rp.completed_at
        )
      )
      FROM room_players rp
      LEFT JOIN users u ON rp.user_id = u.id
      LEFT JOIN game_results gr ON rp.session_id = gr.session_id
      WHERE rp.room_id = rc.room_id AND rp.status != 'left'
    ) as player_results
  FROM room_completions rc
  WHERE rc.room_id = room_id_param;
END;
$$ LANGUAGE plpgsql; 