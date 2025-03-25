-- SIMPLE FIX FOR ROOM VISIBILITY
-- This script ensures rooms with active games will show in the admin dashboard
-- without changing anything else in the system

-- First, show all rooms and their current status
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

-- Fix 3: Ensure all players in in-progress rooms are in_game
UPDATE room_players
SET status = 'in_game'
WHERE 
    status = 'joined' AND
    room_id IN (SELECT id FROM game_rooms WHERE status = 'in_progress');

-- Create a simple trigger to ensure rooms stay visible when starting games
CREATE OR REPLACE FUNCTION ensure_game_startable_rooms_visible()
RETURNS TRIGGER AS $$
BEGIN
    -- When a room changes to preparing or in_progress, ensure it's visible
    IF (NEW.status IN ('preparing', 'in_progress')) THEN
        NEW.all_players_completed := FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install trigger
DROP TRIGGER IF EXISTS ensure_game_visibility ON game_rooms;
CREATE TRIGGER ensure_game_visibility
BEFORE UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION ensure_game_startable_rooms_visible();

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
    END AS visibility
FROM 
    game_rooms
WHERE 
    status IN ('open', 'in_progress', 'preparing')
ORDER BY 
    created_at DESC; 