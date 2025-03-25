-- FIND AND FIX INVISIBLE ROOM ISSUE
-- This script first shows all your game rooms, then lets you fix the specific one

-- STEP 1: Run this query to see ALL your rooms and their visibility status
SELECT 
    gr.id,
    gr.name,
    gr.status,
    gr.all_players_completed,
    COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') AS in_game_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'joined') AS joined_players,
    CASE 
        WHEN gr.status = 'open' OR (gr.status = 'in_progress' AND gr.all_players_completed = FALSE)
        THEN 'VISIBLE in dashboard'
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

-- STEP 2: Copy the ID of the room you need to fix, then uncomment and run this section
/*
-- Replace this with the room ID you need to fix
UPDATE game_rooms
SET 
    status = 'in_progress',
    all_players_completed = FALSE
WHERE 
    id = 'paste-your-room-id-here';
*/

-- STEP 3: If your players are in 'joined' status but should be 'in_game', uncomment and run this
/*
-- Replace this with the room ID you need to fix
UPDATE room_players
SET 
    status = 'in_game'
WHERE 
    room_id = 'paste-your-room-id-here'
    AND status = 'joined';
*/

-- STEP 4: Verify the fix worked by running STEP 1 again. Your room should now show as VISIBLE. 