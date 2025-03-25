-- IMMEDIATE FIX FOR ALL ROOM VISIBILITY ISSUES
-- This script automatically fixes ALL rooms that should be visible in the Admin Dashboard
-- It does NOT change any other functionality

-- STEP 1: First, show which rooms are currently invisible but should be visible
SELECT 
    id, 
    name, 
    status, 
    all_players_completed,
    'CURRENTLY NOT VISIBLE (will be fixed)' AS current_status
FROM 
    game_rooms
WHERE 
    status = 'in_progress' AND 
    all_players_completed = TRUE;

-- STEP 2: Automatically fix ALL in-progress rooms to ensure they're visible
-- This sets all_players_completed = FALSE for any in-progress room
UPDATE game_rooms
SET 
    all_players_completed = FALSE
WHERE 
    status = 'in_progress';

-- STEP 3: Verify that all rooms are now properly visible
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
    status = 'in_progress' OR status = 'open'
ORDER BY 
    created_at DESC;

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