-- ROOM COMPLETIONS FETCH FIX
-- This script ensures completed rooms from room_completions table are properly displayed
-- in the Admin Dashboard's completed rooms section without changing other functionality

-- Start transaction for safety
BEGIN;

-- 1. Fix the get_completed_rooms_with_players function to correctly fetch from room_completions
CREATE OR REPLACE FUNCTION get_completed_rooms_with_players()
RETURNS SETOF json AS $$
DECLARE
    room_record RECORD;
    result_json json;
BEGIN
    -- Get all rooms from room_completions with required data for dashboard display
    FOR room_record IN 
        SELECT 
            gr.id,
            gr.name, 
            gr.status,
            gr.min_players,
            gr.max_players,
            gr.created_at,
            gr.started_at,
            gr.ended_at,
            rc.completion_time,
            COALESCE(gr.all_players_completed, true) as all_players_completed,
            rc.player_count,
            rc.completed_player_count,
            rc.average_player_balance,
            rc.highest_player_balance
        FROM room_completions rc
        JOIN game_rooms gr ON rc.room_id = gr.id
        ORDER BY rc.completion_time DESC NULLS LAST
    LOOP
        -- Build the exact JSON structure expected by the Admin Dashboard
        SELECT 
            json_build_object(
                'id', room_record.id,
                'name', room_record.name,
                'status', 'completed', -- Force status to be 'completed' for consistency
                'min_players', room_record.min_players,
                'max_players', room_record.max_players,
                'created_at', room_record.created_at,
                'started_at', room_record.started_at,
                'ended_at', room_record.ended_at,
                'completion_time', room_record.completion_time,
                'all_players_completed', room_record.all_players_completed,
                'players', (
                    SELECT COALESCE(
                        json_agg(
                            json_build_object(
                                'id', rp.id,
                                'user_id', rp.user_id,
                                'status', rp.status,
                                'session_id', rp.session_id,
                                'user', json_build_object(
                                    'name', COALESCE(u.name, 'Unknown'),
                                    'email', COALESCE(u.email, '')
                                )
                            )
                        ),
                        '[]'::json
                    )
                    FROM room_players rp
                    LEFT JOIN users u ON rp.user_id = u.id
                    WHERE rp.room_id = room_record.id
                )
            ) INTO result_json;
            
        RETURN NEXT result_json;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- 2. Make sure any completed rooms missing from room_completions are added
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    -- This uses the backfill function we previously created
    -- to ensure all completed rooms are in the room_completions table
    SELECT backfill_room_completions() INTO affected_count;
    
    IF affected_count > 0 THEN
        RAISE NOTICE 'Added % missing completed rooms to room_completions table', affected_count;
    ELSE
        RAISE NOTICE 'No missing completed rooms found, all data is in sync';
    END IF;
END $$;

-- 3. Ensure room status consistency so the dashboard filter works correctly
UPDATE game_rooms
SET 
    status = 'completed',
    all_players_completed = TRUE
FROM 
    room_completions
WHERE 
    game_rooms.id = room_completions.room_id
    AND (game_rooms.status != 'completed' OR game_rooms.all_players_completed IS NOT TRUE);

-- 4. Quick fix for any room_completions records with null player counts
UPDATE room_completions rc
SET 
    player_count = COALESCE(
        (SELECT COUNT(*) FROM room_players rp WHERE rp.room_id = rc.room_id AND rp.status != 'left'),
        0
    ),
    completed_player_count = COALESCE(
        (SELECT COUNT(*) FROM room_players rp WHERE rp.room_id = rc.room_id AND rp.status = 'completed'),
        0
    )
WHERE
    player_count IS NULL OR completed_player_count IS NULL;

-- 5. Validate that the dashboard function is working correctly
DO $$
DECLARE
    dashboard_count INTEGER;
    completions_count INTEGER;
BEGIN
    -- Count rooms from the get_completed_rooms_with_players function
    SELECT COUNT(*) INTO dashboard_count FROM get_completed_rooms_with_players();
    
    -- Count rooms in the room_completions table
    SELECT COUNT(*) INTO completions_count FROM room_completions;
    
    -- Report results
    RAISE NOTICE 'Room completions table contains % rooms', completions_count;
    RAISE NOTICE 'Admin dashboard will display % completed rooms', dashboard_count;
    
    -- Alert if there's a discrepancy
    IF dashboard_count != completions_count THEN
        RAISE WARNING 'Discrepancy detected: dashboard shows % rooms, but room_completions has % rooms',
            dashboard_count, completions_count;
    ELSE
        RAISE NOTICE 'Validation successful: dashboard will correctly show all % completed rooms', completions_count;
    END IF;
END $$;

-- 6. Create supplementary function to help with any manual fixes if needed
CREATE OR REPLACE FUNCTION force_room_completion(room_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    success BOOLEAN := false;
BEGIN
    -- Update the room status in game_rooms
    UPDATE game_rooms
    SET 
        status = 'completed',
        all_players_completed = TRUE,
        completion_time = COALESCE(completion_time, ended_at, NOW())
    WHERE id = room_id_param;
    
    -- Run backfill to ensure it appears in room_completions
    PERFORM backfill_room_completions();
    
    -- Check if it worked
    SELECT EXISTS(
        SELECT 1 FROM room_completions WHERE room_id = room_id_param
    ) INTO success;
    
    RETURN success;
END;
$$ LANGUAGE plpgsql;

-- Commit all changes
COMMIT;

-- Show a sample of the completed rooms that will appear in the dashboard
SELECT 
    gr.name as room_name,
    gr.status as room_status,
    gr.all_players_completed,
    rc.completion_time,
    rc.player_count,
    rc.completed_player_count
FROM room_completions rc
JOIN game_rooms gr ON rc.room_id = gr.id
ORDER BY rc.completion_time DESC
LIMIT 5; 