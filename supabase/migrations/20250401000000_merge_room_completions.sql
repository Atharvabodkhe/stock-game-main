-- Migration to merge room_completions table into game_rooms
-- This migration assumes that if room_completions exists, it might have additional data
-- that needs to be preserved when merging into game_rooms

-- Step 1: Check if room_completions table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'room_completions'
    ) THEN
        -- Step 2: Add any missing columns from room_completions to game_rooms
        -- We'll add these columns if they don't already exist
        
        -- These checks ensure we don't fail if columns already exist
        BEGIN
            ALTER TABLE game_rooms 
            ADD COLUMN IF NOT EXISTS completion_status text;
        EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'Column completion_status already exists in game_rooms';
        END;

        BEGIN
            ALTER TABLE game_rooms 
            ADD COLUMN IF NOT EXISTS completion_metadata jsonb;
        EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'Column completion_metadata already exists in game_rooms';
        END;
        
        BEGIN
            ALTER TABLE game_rooms 
            ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id);
        EXCEPTION WHEN duplicate_column THEN
            RAISE NOTICE 'Column completed_by already exists in game_rooms';
        END;

        -- Step 3: Migrate data from room_completions to game_rooms
        UPDATE game_rooms g
        SET 
            completion_status = rc.completion_status,
            completion_metadata = rc.completion_metadata,
            completed_by = rc.completed_by,
            -- Only update completion_time if it's not already set
            completion_time = COALESCE(g.completion_time, rc.completion_time),
            -- Only update all_players_completed if it's not already set to true
            all_players_completed = COALESCE(g.all_players_completed, true),
            -- If the room is completed in room_completions, make sure game_rooms reflects this
            status = CASE 
                      WHEN rc.completion_time IS NOT NULL THEN 'completed' 
                      ELSE g.status 
                    END
        FROM room_completions rc
        WHERE g.id = rc.room_id;

        -- Step 4: Check if any completion records exist that didn't have a matching game room
        INSERT INTO game_rooms (
            id, 
            name,
            status,
            min_players, 
            max_players,
            all_players_completed,
            completion_time,
            completion_status,
            completion_metadata,
            completed_by,
            created_at
        )
        SELECT 
            rc.room_id,
            'Recovered Room ' || rc.room_id,
            'completed',
            1,
            10,
            true,
            rc.completion_time,
            rc.completion_status,
            rc.completion_metadata,
            rc.completed_by,
            COALESCE(rc.completion_time, NOW())
        FROM room_completions rc
        LEFT JOIN game_rooms g ON rc.room_id = g.id
        WHERE g.id IS NULL;

        -- Step 5: Create a view to maintain backward compatibility if needed
        CREATE OR REPLACE VIEW public.room_completions_view AS
        SELECT 
            id as completion_id,
            id as room_id,
            completion_status,
            completion_metadata,
            completed_by,
            completion_time,
            all_players_completed
        FROM game_rooms
        WHERE completion_time IS NOT NULL OR all_players_completed = true OR status = 'completed';

        -- Step 6: Create a trigger to handle inserts to the view
        CREATE OR REPLACE FUNCTION update_game_rooms_from_completions_view()
        RETURNS TRIGGER AS $$
        BEGIN
            UPDATE game_rooms
            SET 
                completion_status = NEW.completion_status,
                completion_metadata = NEW.completion_metadata,
                completed_by = NEW.completed_by,
                completion_time = NEW.completion_time,
                all_players_completed = NEW.all_players_completed,
                status = 'completed'
            WHERE id = NEW.room_id;
            
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        -- Drop the trigger if it exists
        DROP TRIGGER IF EXISTS update_game_rooms_trigger ON public.room_completions_view;
        
        -- Create the trigger
        CREATE TRIGGER update_game_rooms_trigger
        INSTEAD OF INSERT OR UPDATE ON public.room_completions_view
        FOR EACH ROW
        EXECUTE FUNCTION update_game_rooms_from_completions_view();

        -- Additional step: We can drop the room_completions table
        -- But first make sure we've migrated all data
        IF NOT EXISTS (
            SELECT FROM room_completions rc
            LEFT JOIN game_rooms g ON rc.room_id = g.id
            WHERE g.id IS NULL
        ) THEN
            -- Only drop if all data is migrated - we'll just rename it for safety
            ALTER TABLE room_completions RENAME TO room_completions_backup;
            RAISE NOTICE 'All data migrated from room_completions to game_rooms. Table renamed to room_completions_backup.';
        ELSE
            RAISE NOTICE 'Some data could not be migrated. Please check manually before removing the room_completions table.';
        END IF;
    ELSE
        RAISE NOTICE 'room_completions table does not exist - nothing to merge.';
        
        -- Ensure game_rooms has the right columns even if room_completions doesn't exist
        ALTER TABLE game_rooms 
        ADD COLUMN IF NOT EXISTS all_players_completed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS completion_time TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS completion_status text,
        ADD COLUMN IF NOT EXISTS completion_metadata jsonb,
        ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id);
    END IF;
END $$;

-- Update existing functions to ensure they use game_rooms
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
            completion_status = 'completed',
            ended_at = NOW()
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

-- Update force_check_room_completion function
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
            completion_status = 'completed',
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
            SET completed_at = NOW()
            WHERE room_id = room_id_param
            AND completed_at IS NULL;
            
            RETURN TRUE;
        ELSE
            RAISE NOTICE '[INFO] No update needed for room %', room_id_param;
            RETURN TRUE; -- No update needed, which is ok
        END IF;
    ELSIF total_players > 0 AND active_players = 0 THEN
        -- If there are no active players but not all are completed,
        -- we should still mark the room as completed
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW()),
            completion_status = 'forced_completion',
            ended_at = COALESCE(ended_at, NOW())
        WHERE id = room_id_param
        AND status != 'completed';
        
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        
        IF affected_rows > 0 THEN
            RAISE NOTICE '[SUCCESS] Room % marked as completed (forced)', room_id_param;
            
            -- Force stragglers to completed state
            UPDATE room_players
            SET 
                status = 'completed',
                completed_at = COALESCE(completed_at, NOW()),
                completion_status = 'forced_completion'
            WHERE room_id = room_id_param
            AND status != 'left'
            AND status != 'completed';
            
            -- Mark related game sessions as completed
            UPDATE game_sessions
            SET completed_at = NOW()
            WHERE room_id = room_id_param
            AND completed_at IS NULL;
            
            RETURN TRUE;
        ELSE
            RAISE NOTICE '[INFO] No update needed for room %', room_id_param;
            RETURN TRUE;
        END IF;
    ELSE
        RAISE NOTICE '[INFO] Room % not yet ready for completion (total=%, completed=%)', 
            room_id_param, total_players, completed_players;
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Update mark_player_completed function
CREATE OR REPLACE FUNCTION mark_player_completed(player_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    player_room_id UUID;
    completed_count INTEGER;
    total_count INTEGER;
BEGIN
    -- First update the player's status to completed
    UPDATE room_players
    SET 
        status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        completion_status = 'completed'
    WHERE id = player_id
    AND status != 'completed'
    RETURNING room_id INTO player_room_id;
    
    -- If we didn't update anything, check if player exists
    IF player_room_id IS NULL THEN
        -- Try to get the room_id anyway
        SELECT room_id INTO player_room_id
        FROM room_players
        WHERE id = player_id;
        
        -- If player doesn't exist at all, return false
        IF player_room_id IS NULL THEN
            RAISE NOTICE 'Player % not found', player_id;
            RETURN FALSE;
        END IF;
    END IF;
    
    -- Now check if all players in the room are completed
    SELECT 
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status != 'left')
    INTO
        completed_count,
        total_count
    FROM room_players
    WHERE room_id = player_room_id;
    
    -- If all players are completed, mark the room as completed too
    IF total_count > 0 AND completed_count = total_count THEN
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW()),
            completion_status = 'completed',
            ended_at = COALESCE(ended_at, NOW())
        WHERE id = player_room_id
        AND (status != 'completed' OR all_players_completed = FALSE);
        
        -- Mark all game sessions for this room as completed
        UPDATE game_sessions
        SET completed_at = NOW()
        WHERE room_id = player_room_id
        AND completed_at IS NULL;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql; 