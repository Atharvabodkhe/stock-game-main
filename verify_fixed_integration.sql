-- Verification script to confirm the fixed integration is working
-- Run this after applying the room_completions_integration_fixed.sql script

-- 1. Check that rooms are being properly moved to room_completions
SELECT 
    'Rooms by status' as check_type,
    status, 
    COUNT(*) as room_count,
    COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM room_completions rc WHERE rc.room_id = game_rooms.id
    )) as in_room_completions
FROM 
    game_rooms
GROUP BY 
    status
ORDER BY 
    status;

-- 2. Check for any completed rooms missing from room_completions
SELECT 
    'Missing from room_completions' as check_type,
    gr.id as room_id,
    gr.name as room_name,
    gr.status,
    gr.all_players_completed
FROM 
    game_rooms gr
WHERE 
    (gr.status = 'completed' OR gr.all_players_completed = true)
    AND NOT EXISTS (
        SELECT 1 FROM room_completions rc WHERE rc.room_id = gr.id
    );

-- 3. Show completion metrics for rooms in room_completions
SELECT 
    'Room completion metrics' as check_type,
    gr.name as room_name,
    rc.player_count,
    rc.completed_player_count,
    rc.completion_time,
    rc.average_player_balance
FROM 
    room_completions rc
JOIN 
    game_rooms gr ON rc.room_id = gr.id
ORDER BY 
    rc.completion_time DESC
LIMIT 10;

-- 4. Verify that the get_completed_rooms_with_players function works
SELECT 
    'Completed rooms function count' as check_type,
    COUNT(*) as function_rooms_count,
    (SELECT COUNT(*) FROM room_completions) as table_rows_count
FROM 
    get_completed_rooms_with_players();

-- 5. Force-complete a test room to verify the trigger
-- UNCOMMENT TO USE (creates and then deletes a test room)
/*
DO $$
DECLARE
    test_room_id UUID;
BEGIN
    -- Create a test room
    INSERT INTO game_rooms (
        name, 
        min_players, 
        max_players, 
        status,
        started_at
    ) VALUES (
        'VERIFY TEST Room ' || NOW(), 
        2, 
        4, 
        'in_progress',
        NOW() - INTERVAL '30 minutes'
    ) RETURNING id INTO test_room_id;
    
    RAISE NOTICE 'Created test room with ID: %', test_room_id;
    
    -- Check if it exists in room_completions (should not)
    RAISE NOTICE 'Room exists in room_completions (before): %', 
        EXISTS(SELECT 1 FROM room_completions WHERE room_id = test_room_id);
    
    -- Mark as completed
    UPDATE game_rooms
    SET 
        status = 'completed',
        all_players_completed = true,
        completion_time = NOW()
    WHERE id = test_room_id;
    
    -- Check if it was added to room_completions (should be)
    RAISE NOTICE 'Room exists in room_completions (after): %', 
        EXISTS(SELECT 1 FROM room_completions WHERE room_id = test_room_id);
    
    -- Show the completion metrics
    SELECT * FROM room_completions WHERE room_id = test_room_id;
    
    -- Clean up test room
    DELETE FROM game_rooms WHERE id = test_room_id;
    RAISE NOTICE 'Deleted test room';
END $$;
*/

-- 6. Verify what rooms are shown in the Admin Dashboard
-- Count completed rooms in the dashboard display
SELECT 
    'Admin dashboard display' as check_type,
    COUNT(*) as dashboard_rooms_count
FROM
    get_completed_rooms_with_players();

-- 7. Check for any oddities in the data
SELECT 
    'Data consistency check' as check_type,
    COUNT(*) as inconsistent_rooms
FROM 
    room_completions rc
JOIN 
    game_rooms gr ON rc.room_id = gr.id
WHERE
    gr.status != 'completed' OR gr.all_players_completed = false; 