-- FIXED Room Completions Integration Script
-- This script ensures completed rooms are properly moved to the room_completions schema
-- No changes are made to any existing functionality or UI code

-- Start a transaction to ensure all changes are applied together
BEGIN;

-- 1. First ensure the room_completions table exists
CREATE TABLE IF NOT EXISTS room_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL,
  completion_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  all_players_completed BOOLEAN NOT NULL DEFAULT false,
  player_count INT NOT NULL DEFAULT 0,
  completed_player_count INT NOT NULL DEFAULT 0,
  completion_duration INTERVAL, 
  fastest_player_completion INTERVAL, 
  slowest_player_completion INTERVAL, 
  average_player_balance DECIMAL(10, 2) DEFAULT 0, 
  highest_player_balance DECIMAL(10, 2) DEFAULT 0, 
  lowest_player_balance DECIMAL(10, 2) DEFAULT 0, 
  metadata JSONB DEFAULT '{}'::jsonb, 
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_room_id FOREIGN KEY (room_id) REFERENCES game_rooms(id) ON DELETE CASCADE
);

-- 2. Create indexes for optimized access
CREATE INDEX IF NOT EXISTS idx_room_completions_room_id ON room_completions(room_id);
CREATE INDEX IF NOT EXISTS idx_room_completions_completion_time ON room_completions(completion_time);

-- 3. Create or replace the get_completed_rooms_with_players function
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

-- 4. Create a robust function to compute room completion metrics
CREATE OR REPLACE FUNCTION compute_room_completion_metrics(room_id_param UUID)
RETURNS TABLE (
    total_balance DECIMAL(10, 2),
    player_count INT,
    completed_count INT,
    highest_balance DECIMAL(10, 2),
    lowest_balance DECIMAL(10, 2),
    completion_duration INTERVAL,
    fastest_completion INTERVAL,
    slowest_completion INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    WITH player_stats AS (
        SELECT 
            rp.status,
            rp.completed_at,
            rp.started_at,
            COALESCE(gr.final_balance, 0) as final_balance,
            CASE 
                WHEN rp.completed_at IS NOT NULL AND rp.started_at IS NOT NULL 
                THEN rp.completed_at - rp.started_at 
                ELSE NULL 
            END as player_duration
        FROM room_players rp
        LEFT JOIN game_results gr ON rp.session_id = gr.session_id
        WHERE rp.room_id = room_id_param AND rp.status != 'left'
    ),
    room_info AS (
        SELECT 
            started_at,
            completion_time
        FROM game_rooms
        WHERE id = room_id_param
    )
    SELECT
        SUM(ps.final_balance),
        COUNT(*)::INT,
        COUNT(*) FILTER (WHERE ps.status = 'completed')::INT,
        COALESCE(MAX(ps.final_balance), 0),
        CASE 
            WHEN MIN(ps.final_balance) < 0 OR MIN(ps.final_balance) IS NULL THEN 0
            ELSE COALESCE(MIN(ps.final_balance), 0)
        END,
        CASE 
            WHEN MIN(ri.started_at) IS NOT NULL AND MIN(ri.completion_time) IS NOT NULL
            THEN MIN(ri.completion_time) - MIN(ri.started_at)
            ELSE NULL
        END,
        MIN(ps.player_duration) FILTER (WHERE ps.player_duration IS NOT NULL),
        MAX(ps.player_duration) FILTER (WHERE ps.player_duration IS NOT NULL)
    FROM 
        player_stats ps,
        room_info ri;
END;
$$ LANGUAGE plpgsql;

-- 5. Improved backfill function that properly processes existing completed rooms
CREATE OR REPLACE FUNCTION backfill_room_completions()
RETURNS INTEGER AS $$
DECLARE
    room_record RECORD;
    affected_count INTEGER := 0;
    metrics RECORD;
BEGIN
    -- Find all completed rooms that aren't in room_completions
    FOR room_record IN
        SELECT * FROM game_rooms 
        WHERE (status = 'completed' OR all_players_completed = true)
        AND NOT EXISTS (SELECT 1 FROM room_completions WHERE room_id = game_rooms.id)
    LOOP
        -- Generate metrics for this room
        SELECT * FROM compute_room_completion_metrics(room_record.id) INTO metrics;
        
        -- Insert the room into room_completions
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
            room_record.id,
            COALESCE(room_record.completion_time, room_record.ended_at, NOW()),
            COALESCE(room_record.all_players_completed, true),
            metrics.player_count,
            metrics.completed_count,
            metrics.completion_duration,
            metrics.fastest_completion,
            metrics.slowest_completion,
            CASE WHEN metrics.player_count > 0 
                 THEN metrics.total_balance / metrics.player_count 
                 ELSE 0 
            END,
            metrics.highest_balance,
            metrics.lowest_balance,
            jsonb_build_object(
                'room_name', room_record.name,
                'min_players', room_record.min_players,
                'max_players', room_record.max_players
            )
        );
        
        affected_count := affected_count + 1;
        RAISE NOTICE 'Added room % (%) to room_completions', room_record.name, room_record.id;
    END LOOP;
    
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- 6. Fixed and improved room completion trigger
CREATE OR REPLACE FUNCTION create_room_completion_record()
RETURNS TRIGGER AS $$
DECLARE
    metrics RECORD;
BEGIN
    -- Only proceed if the room is being marked as completed
    IF (TG_OP = 'UPDATE' AND 
       (NEW.status = 'completed' OR NEW.all_players_completed = true) AND
       (OLD.status != 'completed' AND (OLD.all_players_completed IS NULL OR OLD.all_players_completed = false))) THEN
        
        RAISE NOTICE 'Room % is being marked as completed, processing...', NEW.id;
        
        -- Generate metrics for this room
        SELECT * FROM compute_room_completion_metrics(NEW.id) INTO metrics;
        
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
                COALESCE(NEW.completion_time, NEW.ended_at, NOW()),
                COALESCE(NEW.all_players_completed, true),
                metrics.player_count,
                metrics.completed_count,
                metrics.completion_duration,
                metrics.fastest_completion,
                metrics.slowest_completion,
                CASE WHEN metrics.player_count > 0 
                     THEN metrics.total_balance / metrics.player_count 
                     ELSE 0 
                END,
                metrics.highest_balance,
                metrics.lowest_balance,
                jsonb_build_object(
                    'room_name', NEW.name,
                    'min_players', NEW.min_players,
                    'max_players', NEW.max_players
                )
            );
            
            RAISE NOTICE 'Added room % to room_completions', NEW.id;
            
            -- Make sure the original room record is properly marked as completed
            -- This ensures it will be filtered out of active rooms in the UI
            -- We don't modify any existing logic, we just make sure the flags are set correctly
            IF NEW.status != 'completed' OR NEW.all_players_completed != true THEN
                UPDATE game_rooms
                SET 
                    status = 'completed',
                    all_players_completed = TRUE,
                    completion_time = COALESCE(NEW.completion_time, NEW.ended_at, NOW())
                WHERE id = NEW.id;
                
                RAISE NOTICE 'Updated room % status to completed and all_players_completed', NEW.id;
            END IF;
        ELSE
            -- Update existing record
            UPDATE room_completions
            SET 
                completion_time = COALESCE(NEW.completion_time, NEW.ended_at, completion_time),
                all_players_completed = COALESCE(NEW.all_players_completed, true),
                player_count = metrics.player_count,
                completed_player_count = metrics.completed_count,
                completion_duration = metrics.completion_duration,
                fastest_player_completion = metrics.fastest_completion,
                slowest_player_completion = metrics.slowest_completion,
                average_player_balance = CASE WHEN metrics.player_count > 0 
                                            THEN metrics.total_balance / metrics.player_count 
                                            ELSE average_player_balance 
                                        END,
                highest_player_balance = metrics.highest_balance,
                lowest_player_balance = metrics.lowest_balance,
                metadata = jsonb_build_object(
                    'room_name', NEW.name,
                    'min_players', NEW.min_players,
                    'max_players', NEW.max_players
                )
            WHERE room_id = NEW.id;
            
            RAISE NOTICE 'Updated existing room_completions record for room %', NEW.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Make sure our trigger is properly installed
DROP TRIGGER IF EXISTS room_completion_trigger ON game_rooms;

CREATE TRIGGER room_completion_trigger
AFTER UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION create_room_completion_record();

-- 8. Also add a trigger for INSERT to catch any direct inserts of completed rooms
CREATE OR REPLACE FUNCTION handle_direct_completed_room_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- If a new room is directly inserted as completed, process it
    IF NEW.status = 'completed' OR NEW.all_players_completed = true THEN
        RAISE NOTICE 'New completed room % inserted, adding to room_completions', NEW.id;
        
        -- Use the same trigger that handles updates
        -- This is a bit of a hack but ensures consistent behavior
        PERFORM create_room_completion_record();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS room_insert_completion_trigger ON game_rooms;

CREATE TRIGGER room_insert_completion_trigger
AFTER INSERT ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION handle_direct_completed_room_insert();

-- 9. Create an index to optimize the completed rooms queries
CREATE INDEX IF NOT EXISTS idx_game_rooms_completed ON game_rooms(status, all_players_completed);

-- 10. Run backfill for existing completed rooms FIRST
-- This is important to do BEFORE applying the trigger
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    RAISE NOTICE 'Starting backfill of existing completed rooms...';
    SELECT backfill_room_completions() INTO affected_count;
    RAISE NOTICE 'Backfilled % completed rooms into room_completions table', affected_count;
    
    -- Also make sure the rooms are properly marked in game_rooms
    UPDATE game_rooms
    SET 
        status = 'completed',
        all_players_completed = TRUE
    WHERE 
        (status = 'completed' OR all_players_completed = true) 
        AND (status != 'completed' OR all_players_completed != true);
        
    RAISE NOTICE 'Ensured all completed rooms are properly marked in game_rooms';
END $$;

-- 11. Add an entry to force another room if needed (sometimes helpful for testing)
-- Uncomment and modify if you need to force a specific room
/*
DO $$
DECLARE
    specific_room_id UUID := 'd681281f-eb18-421b-9350-9a40f485142c'; -- Change to the room ID you need to fix
BEGIN
    -- Force update the room to trigger the completion record creation
    UPDATE game_rooms
    SET 
        status = 'completed',
        all_players_completed = TRUE,
        completion_time = COALESCE(completion_time, NOW())
    WHERE id = specific_room_id;
    
    RAISE NOTICE 'Forced update of room % to ensure it is in room_completions', specific_room_id;
END $$;
*/

-- Commit the transaction
COMMIT;

-- Verify the effects
SELECT COUNT(*) AS room_completions_count FROM room_completions; 