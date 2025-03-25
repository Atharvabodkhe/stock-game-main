-- Installation Script for Room Completion Schema
-- This script safely applies the room completion schema to your database

-- Begin transaction
BEGIN;

-- Check if uuid-ossp extension is available (needed for UUID generation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  END IF;
END $$;

-- Create room_completions table if it doesn't exist
CREATE TABLE IF NOT EXISTS room_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL,
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_room_id FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE
);

-- Check and create indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_room_completions_room_id'
  ) THEN
    CREATE INDEX idx_room_completions_room_id ON room_completions(room_id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_room_completions_completion_time'
  ) THEN
    CREATE INDEX idx_room_completions_completion_time ON room_completions(completion_time);
  END IF;
END $$;

-- Create or replace function for room completion records
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

-- Drop the trigger if it exists, then recreate it
DROP TRIGGER IF EXISTS room_completion_trigger ON game_rooms;

CREATE TRIGGER room_completion_trigger
AFTER UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION create_room_completion_record();

-- Create or replace function to get room completion stats
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

-- Function to backfill room completion data for existing completed rooms
CREATE OR REPLACE FUNCTION backfill_room_completions()
RETURNS INTEGER AS $$
DECLARE
  room_record RECORD;
  affected_count INTEGER := 0;
BEGIN
  FOR room_record IN
    SELECT * FROM game_rooms 
    WHERE (status = 'completed' OR all_players_completed = true)
    AND NOT EXISTS (SELECT 1 FROM room_completions WHERE room_id = game_rooms.id)
  LOOP
    -- Trigger the completion record creation by "updating" the room
    -- This reuses the same logic as the trigger
    UPDATE game_rooms 
    SET all_players_completed = room_record.all_players_completed
    WHERE id = room_record.id;
    
    affected_count := affected_count + 1;
  END LOOP;
  
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'room_completions') THEN
    -- Enable RLS on the table
    ALTER TABLE room_completions ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    -- Allow admins to view all room completions
    DROP POLICY IF EXISTS admin_view_room_completions ON room_completions;
    CREATE POLICY admin_view_room_completions ON room_completions
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM admin_users
          WHERE admin_users.user_id = auth.uid()
        )
      );
      
    -- Allow admins to insert/update room completions
    DROP POLICY IF EXISTS admin_modify_room_completions ON room_completions;
    CREATE POLICY admin_modify_room_completions ON room_completions
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM admin_users
          WHERE admin_users.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Grant permissions to the authenticated role
GRANT SELECT ON TABLE room_completions TO authenticated;
GRANT EXECUTE ON FUNCTION get_room_completion_stats TO authenticated;

-- Commit the transaction
COMMIT;

-- To backfill existing room completions, run this separately:
-- SELECT backfill_room_completions(); 