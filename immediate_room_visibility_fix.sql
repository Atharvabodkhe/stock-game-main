-- IMMEDIATE FIX FOR ROOM VISIBILITY
-- This script fixes the issue where rooms disappear from the Admin Dashboard after game start
-- It does NOT change any other functionality

-- STEP 1: Find your recently created room that disappeared
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
ORDER BY 
    created_at DESC
LIMIT 10;

-- STEP 2: Fix your room's visibility by setting all_players_completed to FALSE
-- Replace the room ID below with your room's ID from the query above
UPDATE game_rooms
SET 
    all_players_completed = FALSE
WHERE 
    id = 'YOUR-ROOM-ID-HERE' AND
    status = 'in_progress';

-- STEP 3: Verify that the fix worked
SELECT 
    id, 
    name, 
    status, 
    all_players_completed,
    'SHOULD NOW BE VISIBLE in dashboard' AS new_visibility
FROM 
    game_rooms
WHERE 
    id = 'YOUR-ROOM-ID-HERE';

-- STEP 4: Fix the underlying cause to prevent future occurrences
-- Adding a trigger to automatically set all_players_completed to FALSE when a game starts
CREATE OR REPLACE FUNCTION ensure_started_games_are_visible()
RETURNS TRIGGER AS $$
BEGIN
    -- When a room changes status to preparing or in_progress, ensure it's visible
    IF (NEW.status = 'preparing' OR NEW.status = 'in_progress') THEN
        NEW.all_players_completed := FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create or replace the trigger on the game_rooms table
DROP TRIGGER IF EXISTS ensure_game_visibility ON game_rooms;
CREATE TRIGGER ensure_game_visibility
BEFORE UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION ensure_started_games_are_visible(); 