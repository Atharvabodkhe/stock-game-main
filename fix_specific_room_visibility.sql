-- DIRECT FIX FOR SPECIFIC ROOM VISIBILITY
-- This script directly fixes a specific room to ensure it shows in the admin dashboard
-- Simply replace the room_id value with your specific room ID

-- Start transaction
BEGIN;

-- Set this to the ID of your room that should be visible but isn't
-- IMPORTANT: Replace this with your actual room ID
DECLARE room_id_to_fix UUID := '00000000-0000-0000-0000-000000000000';

-- Step 1: Check if the room exists and get its current status
DO $$
DECLARE
    room_name TEXT;
    room_status TEXT;
    all_completed BOOLEAN;
    in_game_count INTEGER;
    room_id_param UUID := '00000000-0000-0000-0000-000000000000'; -- Replace with your room ID
BEGIN
    -- Get room information
    SELECT 
        name, 
        status, 
        all_players_completed
    INTO 
        room_name, 
        room_status, 
        all_completed
    FROM 
        game_rooms
    WHERE 
        id = room_id_param;
    
    -- Get player count
    SELECT 
        COUNT(*)
    INTO 
        in_game_count
    FROM 
        room_players
    WHERE 
        room_id = room_id_param
        AND status = 'in_game';
    
    IF room_name IS NULL THEN
        RAISE EXCEPTION 'Room with ID % not found', room_id_param;
    END IF;
    
    RAISE NOTICE 'Found room: % (ID: %)', room_name, room_id_param;
    RAISE NOTICE 'Current status: %, all_players_completed: %, players in game: %', 
        room_status, all_completed, in_game_count;
    
    -- Check if the room should be visible but isn't
    IF in_game_count > 0 AND (room_status != 'in_progress' OR all_completed = TRUE) THEN
        RAISE NOTICE 'Room needs to be fixed to show in dashboard';
    ELSE
        RAISE NOTICE 'Room status appears correct. If still not showing, the issue may be elsewhere.';
    END IF;
END $$;

-- Step 2: Force the room status to be visible in the admin dashboard
-- This directly sets the status to 'in_progress' and all_players_completed to FALSE
UPDATE game_rooms
SET 
    status = 'in_progress',
    all_players_completed = FALSE
WHERE 
    id = '00000000-0000-0000-0000-000000000000'; -- Replace with your room ID

-- Step 3: Make sure player statuses are consistent with the room status
UPDATE room_players
SET 
    status = 'in_game'
WHERE 
    room_id = '00000000-0000-0000-0000-000000000000' -- Replace with your room ID
    AND status != 'left'
    AND status != 'completed'
    AND status != 'in_game';

-- Step 4: Verification - check if the room should now be visible
DO $$
DECLARE
    room_name TEXT;
    room_status TEXT;
    all_completed BOOLEAN;
    total_players INTEGER;
    in_game_count INTEGER;
    room_id_param UUID := '00000000-0000-0000-0000-000000000000'; -- Replace with your room ID
BEGIN
    -- Get updated room information
    SELECT 
        name, 
        status, 
        all_players_completed
    INTO 
        room_name, 
        room_status, 
        all_completed
    FROM 
        game_rooms
    WHERE 
        id = room_id_param;
    
    -- Get updated player counts
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'in_game')
    INTO 
        total_players,
        in_game_count
    FROM 
        room_players
    WHERE 
        room_id = room_id_param;
    
    RAISE NOTICE 'AFTER FIX - Room: % (ID: %)', room_name, room_id_param;
    RAISE NOTICE 'Updated status: %, all_players_completed: %, players in game: %', 
        room_status, all_completed, in_game_count;
    
    -- Confirm if it should now be visible in the dashboard
    IF room_status = 'in_progress' AND all_completed = FALSE THEN
        RAISE NOTICE 'CONFIRMED: Room should now be visible in the admin dashboard.';
        RAISE NOTICE 'Please refresh your browser to see the change.';
    ELSE
        RAISE NOTICE 'WARNING: Room may still not show in dashboard. Contact support for assistance.';
    END IF;
END $$;

-- Commit the changes
COMMIT;

-- Final query to check all rooms that should be visible in the dashboard
SELECT 
    gr.id,
    gr.name,
    gr.status,
    gr.all_players_completed,
    COUNT(rp.id) FILTER (WHERE rp.status = 'in_game') AS in_game_players,
    COUNT(rp.id) FILTER (WHERE rp.status != 'left') AS active_players,
    CASE 
        WHEN gr.status = 'open' OR (gr.status = 'in_progress' AND gr.all_players_completed = FALSE)
        THEN 'VISIBLE in Admin Dashboard'
        ELSE 'NOT VISIBLE in Admin Dashboard'
    END AS dashboard_visibility
FROM 
    game_rooms gr
LEFT JOIN 
    room_players rp ON gr.id = rp.room_id
GROUP BY 
    gr.id, gr.name, gr.status, gr.all_players_completed
ORDER BY 
    gr.created_at DESC; 