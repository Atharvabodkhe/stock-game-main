-- COMPREHENSIVE FIX FOR PERSISTENT ROOM VISIBILITY
-- This script ensures rooms ALWAYS remain visible in the admin dashboard
-- until they are truly completed, without changing other functionality

-- Start transaction for safety
BEGIN;

-- 1. Create a more robust function to handle room visibility
CREATE OR REPLACE FUNCTION ensure_room_visibility()
RETURNS TRIGGER AS $$
BEGIN
    -- Step 1: Handle room status changes that could affect visibility
    
    -- For "preparing" or "in_progress" rooms: ensure they're visible in active rooms
    IF NEW.status IN ('preparing', 'in_progress') THEN
        -- Force all_players_completed to FALSE for in-progress games
        NEW.all_players_completed := FALSE;
        
        -- Log for debugging
        RAISE NOTICE 'Room % transitioning to % status. Ensuring visibility in active rooms list.', 
            NEW.id, NEW.status;
    
    -- For rooms that are being marked as completed
    ELSIF NEW.status = 'completed' OR NEW.all_players_completed = TRUE THEN
        -- If someone is trying to mark it completed, first verify all players are actually completed
        IF EXISTS (
            SELECT 1 FROM room_players
            WHERE room_id = NEW.id
            AND status = 'in_game'  -- Still has active players
        ) THEN
            -- Don't allow marking as completed if players are still in game
            NEW.status := 'in_progress';
            NEW.all_players_completed := FALSE;
            
            RAISE NOTICE 'Prevented room % from being marked completed while players are still in game', NEW.id;
        ELSE
            -- It's truly completed, make sure both flags are consistent
            NEW.status := 'completed';
            NEW.all_players_completed := TRUE;
            
            -- Ensure completion time is set
            IF NEW.completion_time IS NULL THEN
                NEW.completion_time := NOW();
            END IF;
            
            RAISE NOTICE 'Room % confirmed as completed', NEW.id;
        END IF;
    END IF;
    
    -- Step 2: Special case for "open" rooms that might have in-game players
    -- This can happen with manual intervention or race conditions
    IF NEW.status = 'open' AND EXISTS (
        SELECT 1 FROM room_players
        WHERE room_id = NEW.id
        AND status = 'in_game'
    ) THEN
        -- If there are players in-game, force it to in_progress
        NEW.status := 'in_progress';
        NEW.all_players_completed := FALSE;
        
        RAISE NOTICE 'Room % has in-game players but was marked open. Setting to in_progress.', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install this as a BEFORE trigger on game_rooms to ensure visibility on ALL updates
DROP TRIGGER IF EXISTS ensure_room_visibility_trigger ON game_rooms;

CREATE TRIGGER ensure_room_visibility_trigger
BEFORE UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION ensure_room_visibility();

-- 2. Fix room visibility when players change status
-- This ensures room status accurately reflects player statuses
CREATE OR REPLACE FUNCTION sync_room_visibility_with_players()
RETURNS TRIGGER AS $$
DECLARE
    room_status TEXT;
    has_in_game_players BOOLEAN;
    all_completed BOOLEAN;
    player_count INTEGER;
    completed_count INTEGER;
BEGIN
    -- Only relevant for player status changes
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        -- Get player counts in this room
        SELECT 
            COUNT(*) FILTER (WHERE status != 'left'),
            COUNT(*) FILTER (WHERE status = 'completed')
        INTO
            player_count,
            completed_count
        FROM room_players
        WHERE room_id = NEW.room_id;
        
        -- If this player is transitioning to in_game
        IF NEW.status = 'in_game' THEN
            -- Force room to in_progress with all_players_completed = FALSE
            UPDATE game_rooms 
            SET 
                status = 'in_progress',
                all_players_completed = FALSE
            WHERE id = NEW.room_id
            AND (status != 'in_progress' OR all_players_completed = TRUE);
            
            RAISE NOTICE 'Player % transitioned to in_game. Ensuring room % is visible as in_progress.', 
                NEW.id, NEW.room_id;
        
        -- If this player is completing
        ELSIF NEW.status = 'completed' AND OLD.status = 'in_game' THEN
            -- Check if all non-left players are now completed
            IF player_count > 0 AND completed_count = player_count THEN
                -- All players completed, mark room as completed
                UPDATE game_rooms 
                SET 
                    status = 'completed',
                    all_players_completed = TRUE,
                    completion_time = COALESCE(completion_time, NOW())
                WHERE id = NEW.room_id;
                
                RAISE NOTICE 'All players in room % are now completed. Marking room as completed.',
                    NEW.room_id;
            ELSE
                -- Some players still in game, ensure room stays visible
                UPDATE game_rooms 
                SET 
                    status = 'in_progress',
                    all_players_completed = FALSE
                WHERE id = NEW.room_id
                AND status != 'completed'
                AND all_players_completed != TRUE;
                
                RAISE NOTICE 'Player % completed, but % of % players still active in room %',
                    NEW.id, (player_count - completed_count), player_count, NEW.room_id;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install this trigger on room_players
DROP TRIGGER IF EXISTS sync_room_visibility_trigger ON room_players;

CREATE TRIGGER sync_room_visibility_trigger
AFTER UPDATE ON room_players
FOR EACH ROW
EXECUTE FUNCTION sync_room_visibility_with_players();

-- 3. Fix existing rooms with visibility issues
DO $$
DECLARE
    fixed_count INTEGER := 0;
BEGIN
    -- Fix rooms with in-game players that should be visible
    UPDATE game_rooms 
    SET 
        status = 'in_progress',
        all_players_completed = FALSE
    WHERE 
        id IN (
            SELECT DISTINCT room_id 
            FROM room_players 
            WHERE status = 'in_game'
        )
        AND (status != 'in_progress' OR all_players_completed = TRUE)
        AND NOT (status = 'completed' AND EXISTS (
            SELECT 1 FROM room_completions WHERE room_id = game_rooms.id
        ));
    
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE 'Fixed % rooms with in-game players', fixed_count;
    
    -- Fix rooms marked as completed but with active players
    UPDATE game_rooms
    SET
        status = 'in_progress',
        all_players_completed = FALSE
    WHERE 
        (status = 'completed' OR all_players_completed = TRUE)
        AND EXISTS (
            SELECT 1 FROM room_players
            WHERE room_id = game_rooms.id
            AND status = 'in_game'
        );
    
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE 'Fixed % rooms incorrectly marked as completed with active players', fixed_count;
    
    -- Fix rooms with all players completed that aren't marked as completed
    UPDATE game_rooms
    SET
        status = 'completed',
        all_players_completed = TRUE,
        completion_time = COALESCE(completion_time, NOW())
    WHERE
        (status != 'completed' OR all_players_completed = FALSE)
        AND EXISTS (
            SELECT 1 FROM room_players
            WHERE room_id = game_rooms.id
            AND status != 'left'
        )
        AND NOT EXISTS (
            SELECT 1 FROM room_players
            WHERE room_id = game_rooms.id
            AND status != 'left'
            AND status != 'completed'
        );
        
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE 'Fixed % rooms with all players completed that weren't marked completed', fixed_count;
END $$;

-- 4. Create a 'visibility guard' periodic task that can be run to ensure consistency
CREATE OR REPLACE FUNCTION maintain_room_visibility()
RETURNS TEXT AS $$
DECLARE
    fixed_in_progress INTEGER := 0;
    fixed_completed INTEGER := 0;
    fixed_empty INTEGER := 0;
    result TEXT;
BEGIN
    -- Fix in-progress rooms
    UPDATE game_rooms 
    SET 
        status = 'in_progress',
        all_players_completed = FALSE
    WHERE 
        id IN (
            SELECT DISTINCT room_id 
            FROM room_players 
            WHERE status = 'in_game'
        )
        AND (status != 'in_progress' OR all_players_completed = TRUE);
    
    GET DIAGNOSTICS fixed_in_progress = ROW_COUNT;
    
    -- Fix completed rooms
    WITH completed_rooms AS (
        SELECT room_id
        FROM room_players
        WHERE status != 'left'
        GROUP BY room_id
        HAVING COUNT(*) > 0 
        AND COUNT(*) = COUNT(*) FILTER (WHERE status = 'completed')
    )
    UPDATE game_rooms
    SET
        status = 'completed',
        all_players_completed = TRUE,
        completion_time = COALESCE(completion_time, NOW())
    WHERE
        id IN (SELECT room_id FROM completed_rooms)
        AND (status != 'completed' OR all_players_completed = FALSE);
        
    GET DIAGNOSTICS fixed_completed = ROW_COUNT;
    
    -- Fix empty rooms
    UPDATE game_rooms
    SET
        status = 'open',
        all_players_completed = FALSE
    WHERE
        status != 'open'
        AND NOT EXISTS (
            SELECT 1 FROM room_players
            WHERE room_id = game_rooms.id
            AND status != 'left'
        )
        -- Don't touch completed rooms in room_completions
        AND NOT EXISTS (
            SELECT 1 FROM room_completions
            WHERE room_id = game_rooms.id
        );
        
    GET DIAGNOSTICS fixed_empty = ROW_COUNT;
    
    -- Create result message
    result := 'Room visibility check completed. ' ||
              'Fixed: ' || fixed_in_progress || ' in-progress rooms, ' ||
              fixed_completed || ' completed rooms, ' ||
              fixed_empty || ' empty rooms.';
              
    RAISE NOTICE '%', result;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 5. Add extended diagnostic views
CREATE OR REPLACE VIEW room_visibility_detailed_status AS
SELECT
    gr.id,
    gr.name,
    gr.status AS room_status,
    gr.all_players_completed,
    COUNT(rp.id) FILTER (WHERE rp.status != 'left') AS active_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'joined') AS joined_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') AS in_game_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'completed') AS completed_players,
    CASE
        WHEN gr.status = 'open' THEN 'Visible in Active Rooms (Open)'
        WHEN gr.status = 'in_progress' AND gr.all_players_completed = FALSE THEN 'Visible in Active Rooms (In Progress)'
        WHEN gr.status = 'completed' OR gr.all_players_completed = TRUE THEN 
            CASE 
                WHEN EXISTS (SELECT 1 FROM room_completions rc WHERE rc.room_id = gr.id) 
                THEN 'Visible in Completed Rooms'
                ELSE 'Should be visible in Completed Rooms but missing from room_completions'
            END
        ELSE 'NOT VISIBLE - Incorrect Status Configuration'
    END AS visibility_status,
    CASE
        -- Inconsistency checks
        WHEN gr.status = 'in_progress' AND gr.all_players_completed = TRUE THEN 'VISIBILITY ISSUE: In progress room marked all_players_completed'
        WHEN gr.status = 'completed' AND gr.all_players_completed = FALSE THEN 'INCONSISTENT: Completed but not marked all_players_completed'
        WHEN gr.status = 'open' AND EXISTS (SELECT 1 FROM room_players rp WHERE rp.room_id = gr.id AND rp.status = 'in_game') THEN 'VISIBILITY ISSUE: Open room with in_game players'
        WHEN gr.status = 'completed' AND EXISTS (SELECT 1 FROM room_players rp WHERE rp.room_id = gr.id AND rp.status = 'in_game') THEN 'VISIBILITY ISSUE: Completed room with in_game players'
        
        -- Validation checks
        WHEN COUNT(rp.id) FILTER (WHERE rp.status != 'left') = 0 AND gr.status != 'open' AND NOT EXISTS (SELECT 1 FROM room_completions rc WHERE rc.room_id = gr.id) 
            THEN 'VALIDATION: Empty room not marked as open'
        WHEN COUNT(rp.id) FILTER (WHERE rp.status != 'left') > 0 
            AND COUNT(rp.id) FILTER (WHERE rp.status != 'left') = COUNT(rp.id) FILTER (WHERE rp.status = 'completed')
            AND gr.status != 'completed' THEN 'VALIDATION: All players completed but room not marked completed'
        ELSE 'OK'
    END AS status_issues
FROM 
    game_rooms gr
LEFT JOIN 
    room_players rp ON gr.id = rp.room_id
GROUP BY 
    gr.id, gr.name, gr.status, gr.all_players_completed
ORDER BY 
    gr.created_at DESC;

-- 6. Add manual fix function for specific rooms
CREATE OR REPLACE FUNCTION force_room_visibility(room_id_param UUID)
RETURNS TEXT AS $$
DECLARE
    fixed TEXT;
    players_status TEXT;
    in_game_count INTEGER;
    completed_count INTEGER;
    total_count INTEGER;
BEGIN
    -- Get player counts for this room
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'in_game'),
        COUNT(*) FILTER (WHERE status = 'completed')
    INTO
        total_count,
        in_game_count,
        completed_count
    FROM room_players
    WHERE room_id = room_id_param;
    
    players_status := total_count || ' total players: ' || 
                      in_game_count || ' in game, ' ||
                      completed_count || ' completed';
    
    -- Determine appropriate action based on player status
    IF in_game_count > 0 THEN
        -- Has active players - should be in_progress and visible in active rooms
        UPDATE game_rooms
        SET
            status = 'in_progress',
            all_players_completed = FALSE
        WHERE id = room_id_param;
        
        fixed := 'Room set to in_progress and will be visible in active rooms. ' || players_status;
    ELSIF total_count > 0 AND total_count = completed_count THEN
        -- All players completed - should be completed and in room_completions
        UPDATE game_rooms
        SET
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW())
        WHERE id = room_id_param;
        
        -- Ensure it's in room_completions via backfill function (if it exists)
        BEGIN
            PERFORM backfill_room_completions();
        EXCEPTION WHEN OTHERS THEN
            -- Ignore errors if the function doesn't exist
        END;
        
        fixed := 'Room set to completed and will be visible in completed rooms. ' || players_status;
    ELSE
        -- No players or only left players - set to open
        UPDATE game_rooms
        SET
            status = 'open',
            all_players_completed = FALSE
        WHERE id = room_id_param;
        
        fixed := 'Room set to open and will be visible in active rooms. ' || players_status;
    END IF;
    
    RETURN fixed;
END;
$$ LANGUAGE plpgsql;

-- 7. Create a permanent scheduled check (runs every minute) to maintain consistency
-- This requires pg_cron extension to be enabled, which may not be available in all Supabase instances
-- Comment this out if pg_cron is not available
/*
-- Install pg_cron if needed
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the maintenance function to run every minute
SELECT cron.schedule('room_visibility_guard', '* * * * *', 'SELECT maintain_room_visibility()');
*/

-- Commit the transaction
COMMIT;

-- Run an immediate maintenance check and show detailed status
SELECT maintain_room_visibility();

-- Show detailed diagnostic information
SELECT * FROM room_visibility_detailed_status; 