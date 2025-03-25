-- FIX FOR DISAPPEARING ROOMS AFTER GAME START
-- This script ensures rooms remain visible in the admin dashboard after the game starts
-- It does not change any existing functionality related to room_completions

-- Start transaction for safety
BEGIN;

-- 1. Examine the loadRooms query in AdminDashboard.tsx to ensure proper visibility
-- The dashboard uses this query to fetch active rooms:
--   .eq('status', 'open')
--   .or('status.eq.in_progress,all_players_completed.eq.false')

-- 2. Fix the room state after game start to ensure it matches the dashboard query
-- Create a check function that verifies and fixes any rooms with incorrect status
CREATE OR REPLACE FUNCTION fix_in_progress_room_visibility()
RETURNS INTEGER AS $$
DECLARE
    fixed_count INTEGER := 0;
BEGIN
    -- Find all rooms that should be visible but might be incorrectly configured
    -- These are rooms with players in in_game status but room not showing correctly
    UPDATE game_rooms 
    SET 
        status = 'in_progress',
        all_players_completed = FALSE
    WHERE 
        -- Room has in_game players but incorrect status
        id IN (
            SELECT DISTINCT room_id 
            FROM room_players 
            WHERE status = 'in_game'
        )
        -- Only fix rooms that would be invisible in the dashboard
        AND (status != 'in_progress' OR all_players_completed = TRUE)
        -- Don't touch truly completed rooms
        AND NOT (
            status = 'completed' 
            AND all_players_completed = TRUE
            AND EXISTS (SELECT 1 FROM room_completions rc WHERE rc.room_id = game_rooms.id)
        );
    
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    
    RAISE NOTICE 'Fixed % rooms that were in progress but not visible in dashboard', fixed_count;
    
    RETURN fixed_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Fix the startGame function behavior to ensure rooms remain visible
-- Create a trigger that ensures proper status flags when a game is started
CREATE OR REPLACE FUNCTION maintain_started_game_visibility()
RETURNS TRIGGER AS $$
BEGIN
    -- If the room is changing to 'preparing' or 'in_progress'
    -- Make sure all_players_completed is FALSE to ensure dashboard visibility
    IF (NEW.status = 'preparing' OR NEW.status = 'in_progress') THEN
        NEW.all_players_completed := FALSE;
        
        -- Log the change for debugging
        RAISE NOTICE 'Room % status changing to %. Ensuring all_players_completed = FALSE for dashboard visibility.', 
            NEW.id, NEW.status;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the trigger on game_rooms table
DROP TRIGGER IF EXISTS game_start_visibility_trigger ON game_rooms;

CREATE TRIGGER game_start_visibility_trigger
BEFORE UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION maintain_started_game_visibility();

-- 4. Fix any existing in-progress games that might be hidden
SELECT fix_in_progress_room_visibility();

-- 5. Add a view to help troubleshoot room visibility issues
CREATE OR REPLACE VIEW room_visibility_status AS
SELECT
    gr.id,
    gr.name,
    gr.status,
    gr.all_players_completed,
    gr.created_at,
    gr.started_at,
    COUNT(rp.id) FILTER (WHERE rp.status = 'joined') AS joined_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') AS in_game_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'completed') AS completed_players,
    CASE
        WHEN gr.status = 'open' THEN 'Visible as Open Room'
        WHEN gr.status = 'in_progress' AND gr.all_players_completed = FALSE THEN 'Visible as In Progress Room'
        WHEN gr.status = 'completed' OR gr.all_players_completed = TRUE THEN 
            CASE 
                WHEN EXISTS (SELECT 1 FROM room_completions rc WHERE rc.room_id = gr.id) 
                THEN 'Visible in Completed Rooms (via room_completions)'
                ELSE 'Should be visible in Completed Rooms but missing from room_completions'
            END
        ELSE 'NOT VISIBLE - Incorrect Status Configuration'
    END AS visibility_status,
    CASE
        WHEN gr.status = 'in_progress' AND gr.all_players_completed = TRUE THEN 'Warning: In progress but marked all_players_completed'
        WHEN gr.status = 'completed' AND gr.all_players_completed = FALSE THEN 'Warning: Completed but not marked all_players_completed'
        WHEN gr.status = 'open' AND EXISTS (SELECT 1 FROM room_players rp WHERE rp.room_id = gr.id AND rp.status = 'in_game') THEN 'Warning: Open but has in_game players'
        ELSE 'OK'
    END AS status_consistency
FROM 
    game_rooms gr
LEFT JOIN 
    room_players rp ON gr.id = rp.room_id
GROUP BY 
    gr.id, gr.name, gr.status, gr.all_players_completed, gr.created_at, gr.started_at
ORDER BY 
    gr.created_at DESC;

-- 6. Create a quick fix function for any specific room that disappears
CREATE OR REPLACE FUNCTION make_room_visible(room_id_param UUID)
RETURNS TEXT AS $$
DECLARE
    room_status TEXT;
    has_in_game_players BOOLEAN;
    all_completed BOOLEAN;
BEGIN
    -- Get room status info
    SELECT 
        gr.status,
        EXISTS (SELECT 1 FROM room_players WHERE room_id = room_id_param AND status = 'in_game') AS has_in_game,
        NOT EXISTS (SELECT 1 FROM room_players WHERE room_id = room_id_param AND status != 'left' AND status != 'completed') AS all_completed
    INTO
        room_status,
        has_in_game_players,
        all_completed
    FROM 
        game_rooms gr
    WHERE 
        gr.id = room_id_param;
        
    -- If room has in-game players, it should be visible as in_progress
    IF has_in_game_players THEN
        UPDATE game_rooms
        SET 
            status = 'in_progress',
            all_players_completed = FALSE
        WHERE id = room_id_param;
        
        RETURN 'Room updated to in_progress status and will be visible in active rooms';
    -- If all non-left players are completed, it should be in completed section
    ELSIF all_completed AND room_status != 'completed' THEN
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE
        WHERE id = room_id_param;
        
        -- Ensure it's in room_completions
        PERFORM backfill_room_completions();
        
        RETURN 'Room marked as completed and moved to completed rooms section';
    -- Otherwise, make sure it's visible as an open room
    ELSE
        UPDATE game_rooms
        SET 
            status = CASE WHEN room_status = 'completed' THEN 'open' ELSE room_status END,
            all_players_completed = FALSE
        WHERE id = room_id_param;
        
        RETURN 'Room status updated to ensure visibility';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Commit the changes
COMMIT;

-- Show current rooms and their visibility status
SELECT * FROM room_visibility_status; 