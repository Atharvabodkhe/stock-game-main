-- DIRECT ROOM VISIBILITY FIX
-- This script directly fixes a specific room to make it visible in the admin dashboard
-- INSTRUCTIONS: Replace '00000000-0000-0000-0000-000000000000' with your actual room ID in all 3 places

-- First, find your room ID by running this query:
-- SELECT id, name FROM game_rooms ORDER BY created_at DESC LIMIT 10;

-- Force the room status to be in_progress with all_players_completed = FALSE
UPDATE game_rooms
SET 
    status = 'in_progress',
    all_players_completed = FALSE
WHERE 
    id = '00000000-0000-0000-0000-000000000000'; -- Replace with your room ID

-- Make sure all players who should be in game are properly marked as in_game
UPDATE room_players
SET 
    status = 'in_game'
WHERE 
    room_id = '00000000-0000-0000-0000-000000000000' -- Replace with your room ID
    AND status = 'joined'; -- Only update joined players to in_game

-- Verify the fix worked by checking if the room now matches the dashboard visibility criteria
SELECT 
    gr.id,
    gr.name,
    gr.status,
    gr.all_players_completed,
    COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') AS in_game_players,
    'Should now be VISIBLE in Admin Dashboard' AS result
FROM 
    game_rooms gr
LEFT JOIN 
    room_players rp ON gr.id = rp.room_id
WHERE 
    gr.id = '00000000-0000-0000-0000-000000000000' -- Replace with your room ID
GROUP BY 
    gr.id, gr.name, gr.status, gr.all_players_completed; 