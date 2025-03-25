-- IMMEDIATE FIX FOR INVISIBLE ACTIVE ROOMS
-- This script fixes rooms that have in-game players but aren't showing in the admin dashboard
-- Doesn't change any existing functionality - only ensures data consistency

-- Start transaction
BEGIN;

-- Step 1: Diagnostic query to identify the problem rooms
-- These are rooms with in-game players that should be visible but aren't
WITH problem_rooms AS (
    SELECT 
        gr.id,
        gr.name,
        gr.status,
        gr.all_players_completed,
        COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') AS in_game_players
    FROM 
        game_rooms gr
    JOIN 
        room_players rp ON gr.id = rp.room_id
    GROUP BY 
        gr.id, gr.name, gr.status, gr.all_players_completed
    HAVING 
        COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') > 0
        AND (gr.status != 'in_progress' OR gr.all_players_completed = TRUE)
)
SELECT 
    id, 
    name, 
    status, 
    all_players_completed, 
    in_game_players,
    'Room has ' || in_game_players || ' players in game but is not visible in dashboard' AS diagnosis
FROM 
    problem_rooms;

-- Step 2: Fix the room status for rooms with in-game players
-- Set status to 'in_progress' and all_players_completed to FALSE
UPDATE game_rooms
SET 
    status = 'in_progress',
    all_players_completed = FALSE
WHERE 
    id IN (
        SELECT DISTINCT gr.id
        FROM game_rooms gr
        JOIN room_players rp ON gr.id = rp.room_id
        WHERE rp.status = 'in_game'
        AND (gr.status != 'in_progress' OR gr.all_players_completed = TRUE)
    );
    
-- Step 3: Show which rooms were fixed
WITH fixed_rooms AS (
    SELECT 
        gr.id,
        gr.name,
        gr.status,
        gr.all_players_completed,
        COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') AS in_game_players
    FROM 
        game_rooms gr
    JOIN 
        room_players rp ON gr.id = rp.room_id
    WHERE 
        gr.status = 'in_progress' 
        AND gr.all_players_completed = FALSE
    GROUP BY 
        gr.id, gr.name, gr.status, gr.all_players_completed
    HAVING 
        COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') > 0
)
SELECT 
    id, 
    name, 
    status, 
    all_players_completed, 
    in_game_players,
    'Room fixed and now visible in dashboard with ' || in_game_players || ' players in game' AS status
FROM 
    fixed_rooms;

-- Commit changes
COMMIT;

-- Final verification query - shows all rooms that should appear in the admin dashboard
-- This matches exactly what the AdminDashboard.tsx component is querying
SELECT 
    gr.id,
    gr.name,
    gr.status,
    gr.all_players_completed,
    COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') AS in_game_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'joined') AS joined_players,
    'Visible in Admin Dashboard' AS visibility
FROM 
    game_rooms gr
LEFT JOIN 
    room_players rp ON gr.id = rp.room_id
WHERE 
    gr.status = 'open' 
    OR (
        gr.status = 'in_progress' 
        AND gr.all_players_completed = FALSE
    )
GROUP BY 
    gr.id, gr.name, gr.status, gr.all_players_completed
ORDER BY 
    gr.created_at DESC; 