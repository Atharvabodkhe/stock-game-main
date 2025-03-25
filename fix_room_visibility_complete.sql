-- COMPREHENSIVE ROOM VISIBILITY FIX
-- This script ensures rooms ALWAYS stay visible in the Game Rooms section until truly completed
-- It targets both existing rooms and prevents future issues

-- PART 1: Database Fixes

-- First, show all rooms and their current visibility status
SELECT 
    id, 
    name, 
    status, 
    all_players_completed,
    created_at,
    CASE 
        WHEN status = 'open' THEN 'VISIBLE in dashboard'
        WHEN status = 'in_progress' AND all_players_completed = FALSE THEN 'VISIBLE in dashboard'
        ELSE 'NOT VISIBLE in dashboard'
    END AS visibility
FROM 
    game_rooms
ORDER BY 
    created_at DESC;

-- Fix 1: Make ALL in-progress rooms visible by setting all_players_completed to FALSE
UPDATE game_rooms
SET 
    all_players_completed = FALSE
WHERE 
    status = 'in_progress';

-- Fix 2: Fix preparing rooms that might be invisible too
UPDATE game_rooms
SET 
    all_players_completed = FALSE,
    status = 'in_progress'  -- Ensure any stuck "preparing" rooms move to in_progress
WHERE 
    status = 'preparing';

-- Fix 3: Create a robust trigger that prevents rooms from disappearing in the future
CREATE OR REPLACE FUNCTION ensure_room_visibility()
RETURNS TRIGGER AS $$
BEGIN
    -- Case 1: Starting a game - ensure room stays visible
    IF (NEW.status IN ('preparing', 'in_progress')) THEN
        NEW.all_players_completed := FALSE;
        RAISE NOTICE 'Ensuring room % stays visible with status % and all_players_completed = FALSE', NEW.id, NEW.status;
    END IF;
    
    -- Case 2: If room has in-game players, force it to stay visible
    IF EXISTS (
        SELECT 1 FROM room_players 
        WHERE room_id = NEW.id AND status = 'in_game'
    ) THEN
        -- Only override if attempt is made to make room invisible
        IF NEW.status = 'in_progress' AND NEW.all_players_completed = TRUE THEN
            NEW.all_players_completed := FALSE;
            RAISE NOTICE 'Preventing room % with in-game players from disappearing', NEW.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the improved trigger
DROP TRIGGER IF EXISTS ensure_room_visibility_trigger ON game_rooms;
CREATE TRIGGER ensure_room_visibility_trigger
BEFORE UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION ensure_room_visibility();

-- Fix 4: Fix any player status inconsistencies that might be causing problems
UPDATE room_players
SET status = 'in_game'
WHERE 
    status = 'joined' AND
    room_id IN (SELECT id FROM game_rooms WHERE status = 'in_progress');

-- Verify that our fixes worked
SELECT 
    id, 
    name, 
    status, 
    all_players_completed,
    CASE 
        WHEN status = 'open' THEN 'VISIBLE in dashboard'
        WHEN status = 'in_progress' AND all_players_completed = FALSE THEN 'VISIBLE in dashboard'
        ELSE 'NOT VISIBLE in dashboard'
    END AS visibility,
    'FIXED - Should now appear in Game Rooms' AS result
FROM 
    game_rooms
WHERE 
    status IN ('open', 'in_progress', 'preparing')
ORDER BY 
    created_at DESC;

-- PART 2: Monitor Player Status
-- Create a view to help admins monitor room and player status
CREATE OR REPLACE VIEW room_player_status AS
SELECT
    gr.id AS room_id,
    gr.name AS room_name,
    gr.status AS room_status,
    gr.all_players_completed,
    COUNT(rp.id) AS total_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') AS in_game_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'completed') AS completed_players,
    CASE 
        WHEN gr.status = 'open' THEN 'VISIBLE in dashboard'
        WHEN gr.status = 'in_progress' AND gr.all_players_completed = FALSE THEN 'VISIBLE in dashboard'
        ELSE 'NOT VISIBLE in dashboard'
    END AS dashboard_visibility
FROM 
    game_rooms gr
LEFT JOIN 
    room_players rp ON gr.id = rp.room_id
GROUP BY 
    gr.id, gr.name, gr.status, gr.all_players_completed
ORDER BY 
    gr.created_at DESC; 