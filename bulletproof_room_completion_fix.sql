-- SIMPLIFIED BULLETPROOF ROOM COMPLETION FIX
-- This solution focuses on what matters most: marking rooms as completed when all players complete

-- Step 1: Fix any existing rooms first
UPDATE game_rooms gr
SET 
    status = 'completed',
    all_players_completed = TRUE,
    completion_time = COALESCE(completion_time, NOW())
FROM (
    SELECT 
        rp.room_id,
        COUNT(*) FILTER (WHERE rp.status != 'left') AS total_active,
        COUNT(*) FILTER (WHERE rp.status = 'completed') AS total_completed
    FROM room_players rp
    GROUP BY rp.room_id
    HAVING 
        COUNT(*) FILTER (WHERE rp.status != 'left') > 0
        AND COUNT(*) FILTER (WHERE rp.status != 'left') = COUNT(*) FILTER (WHERE rp.status = 'completed')
) AS completed_rooms
WHERE gr.id = completed_rooms.room_id
AND (gr.all_players_completed = FALSE OR gr.all_players_completed IS NULL OR gr.status != 'completed');

-- Step 2: Create a function that prevents players from changing from 'completed' to another status
CREATE OR REPLACE FUNCTION prevent_uncompletions()
RETURNS TRIGGER AS $$
BEGIN
    -- If player status is trying to change from 'completed' to something else (except 'left')
    IF OLD.status = 'completed' AND NEW.status != 'completed' AND NEW.status != 'left' THEN
        RAISE LOG 'Preventing player % from changing from completed to %', NEW.id, NEW.status;
        NEW.status := 'completed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the trigger to prevent status changes
DROP TRIGGER IF EXISTS prevent_completed_status_changes ON room_players;
CREATE TRIGGER prevent_completed_status_changes
BEFORE UPDATE ON room_players
FOR EACH ROW
EXECUTE FUNCTION prevent_uncompletions();

-- Step 3: Create a reliable room completion checker function
CREATE OR REPLACE FUNCTION auto_complete_rooms()
RETURNS TRIGGER AS $$
DECLARE
    room_id_var UUID;
    total_active INTEGER;
    total_completed INTEGER;
BEGIN
    -- Get room_id from the player that was updated
    room_id_var := NEW.room_id;
    
    -- Count active and completed players
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'completed')
    INTO
        total_active,
        total_completed
    FROM room_players
    WHERE room_id = room_id_var;
    
    -- If all active players have completed, mark room as completed
    IF total_active > 0 AND total_completed = total_active THEN
        RAISE LOG 'All players in room % have completed (%/%)', room_id_var, total_completed, total_active;
        
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW())
        WHERE id = room_id_var
        AND (all_players_completed = FALSE OR all_players_completed IS NULL OR status != 'completed');
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE LOG 'Error in auto_complete_rooms: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the trigger to auto-complete rooms
DROP TRIGGER IF EXISTS auto_complete_rooms_trigger ON room_players;
CREATE TRIGGER auto_complete_rooms_trigger
AFTER UPDATE OR INSERT ON room_players
FOR EACH ROW
EXECUTE FUNCTION auto_complete_rooms();

-- Step 4: Add a scheduled job to catch any missed rooms
-- This will run every minute to check for rooms that should be completed
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('complete-rooms-check', '* * * * *', $$
    UPDATE game_rooms gr
    SET 
        status = 'completed',
        all_players_completed = TRUE,
        completion_time = COALESCE(completion_time, NOW())
    FROM (
        SELECT 
            rp.room_id,
            COUNT(*) FILTER (WHERE rp.status != 'left') AS total_active,
            COUNT(*) FILTER (WHERE rp.status = 'completed') AS total_completed
        FROM room_players rp
        GROUP BY rp.room_id
        HAVING 
            COUNT(*) FILTER (WHERE rp.status != 'left') > 0
            AND COUNT(*) FILTER (WHERE rp.status != 'left') = COUNT(*) FILTER (WHERE rp.status = 'completed')
    ) AS completed_rooms
    WHERE gr.id = completed_rooms.room_id
    AND (gr.all_players_completed = FALSE OR gr.all_players_completed IS NULL OR gr.status != 'completed');
$$);

-- Step 5: Create a function to manually check a specific room
CREATE OR REPLACE FUNCTION check_specific_room(room_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    updated BOOLEAN := FALSE;
    total_active INTEGER;
    total_completed INTEGER;
BEGIN
    -- Get counts for this room
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'completed')
    INTO
        total_active,
        total_completed
    FROM room_players
    WHERE room_id = room_id_param;
    
    -- If all active players have completed, mark room as completed
    IF total_active > 0 AND total_completed = total_active THEN
        UPDATE game_rooms
        SET 
            status = 'completed',
            all_players_completed = TRUE,
            completion_time = COALESCE(completion_time, NOW())
        WHERE id = room_id_param
        AND (all_players_completed = FALSE OR all_players_completed IS NULL OR status != 'completed');
        
        GET DIAGNOSTICS total_active = ROW_COUNT;
        IF total_active > 0 THEN
            updated := TRUE;
        END IF;
    END IF;
    
    RETURN updated;
END;
$$ LANGUAGE plpgsql;

-- For the specific room in your screenshot - immediate fix
SELECT check_specific_room('d681281f-eb18-421b-9350-9a40f485142c'); 