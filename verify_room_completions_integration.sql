-- Verification Script for Room Completions Integration
-- Run this after applying the integration to verify everything is working correctly

-- 1. Check that the room_completions table exists and has the correct structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM 
    information_schema.columns
WHERE 
    table_name = 'room_completions'
ORDER BY 
    ordinal_position;

-- 2. Check that the get_completed_rooms_with_players function exists
SELECT 
    pg_proc.proname as function_name,
    pg_proc.pronargs as num_args,
    pg_proc.prorettype::regtype as return_type
FROM 
    pg_proc
JOIN 
    pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
WHERE 
    pg_proc.proname = 'get_completed_rooms_with_players' 
    AND pg_namespace.nspname = 'public';

-- 3. Count all rooms by status to verify data consistency
SELECT 
    'game_rooms' as source,
    status, 
    count(*) as count, 
    all_players_completed
FROM 
    game_rooms
GROUP BY 
    status, all_players_completed
ORDER BY 
    status;

-- 4. Count completed rooms in the room_completions table
SELECT 
    'room_completions' as source,
    count(*) as completed_rooms_count
FROM 
    room_completions;

-- 5. Verify that all rooms marked as completed in game_rooms are in room_completions
SELECT 
    'Missing from room_completions' as issue,
    gr.id as room_id,
    gr.name as room_name,
    gr.status
FROM 
    game_rooms gr
WHERE 
    (gr.status = 'completed' OR gr.all_players_completed = true)
    AND NOT EXISTS (
        SELECT 1 FROM room_completions rc WHERE rc.room_id = gr.id
    );

-- 6. Test the get_room_completion_stats function by getting stats for the most recent completed room
WITH recent_completion AS (
    SELECT room_id 
    FROM room_completions 
    ORDER BY completion_time DESC 
    LIMIT 1
)
SELECT * FROM get_room_completion_stats((SELECT room_id FROM recent_completion));

-- 7. Verify that the get_completed_rooms_with_players function returns the same count as room_completions
SELECT 
    COUNT(*) as completed_rooms_from_function
FROM 
    get_completed_rooms_with_players();

-- 8. Test completions trigger with a sample room update
-- WARNING: Only run this in a test environment or comment it out with /* */ in production
/*
-- Create a test room
INSERT INTO game_rooms (
    name, 
    min_players, 
    max_players, 
    status
) VALUES (
    'Test Room for Completion Trigger', 
    2, 
    4, 
    'in_progress'
) RETURNING id;

-- Get the ID of the test room (replace with actual ID from above)
DO $$
DECLARE
    test_room_id UUID := '00000000-0000-0000-0000-000000000000'; -- Replace with actual ID
BEGIN
    -- Mark the room as completed
    UPDATE game_rooms
    SET 
        status = 'completed',
        all_players_completed = true,
        completion_time = NOW()
    WHERE
        id = test_room_id;
        
    -- Check if it was added to room_completions
    RAISE NOTICE 'Room added to room_completions: %', 
        EXISTS(SELECT 1 FROM room_completions WHERE room_id = test_room_id);
        
    -- Clean up (optional)
    DELETE FROM game_rooms WHERE id = test_room_id;
END $$;
*/ 