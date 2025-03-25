-- ANTI-FLICKERING FIX FOR ROOM STATUS
-- This solution specifically prevents any room status flickering while preserving other functionality

-- Step 1: Immediately fix any rooms where all players have completed
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

-- Step 2: Create strong prevention mechanism against room status changes
-- This function prevents any room from changing OUT of 'completed' status
CREATE OR REPLACE FUNCTION prevent_room_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- If trying to change from completed to another status and all players are completed
    IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
        -- Check if all players are actually completed
        DECLARE
            active_count INTEGER;
            completed_count INTEGER;
        BEGIN
            SELECT 
                COUNT(*) FILTER (WHERE status != 'left'),
                COUNT(*) FILTER (WHERE status = 'completed')
            INTO
                active_count,
                completed_count
            FROM room_players
            WHERE room_id = NEW.id;
            
            -- If all active players are completed, prevent the status change
            IF active_count > 0 AND completed_count = active_count THEN
                RAISE LOG 'Preventing room % from changing from completed to %', NEW.id, NEW.status;
                NEW.status := 'completed';
                NEW.all_players_completed := TRUE;
            END IF;
        END;
    END IF;
    
    -- Another check: If all_players_completed is TRUE, always ensure status is 'completed'
    IF OLD.all_players_completed = TRUE AND NEW.all_players_completed = TRUE AND NEW.status != 'completed' THEN
        RAISE LOG 'Ensuring room % with all_players_completed=TRUE has status=completed', NEW.id;
        NEW.status := 'completed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the room status protection trigger
DROP TRIGGER IF EXISTS prevent_room_status_change_trigger ON game_rooms;
CREATE TRIGGER prevent_room_status_change_trigger
BEFORE UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION prevent_room_status_change();

-- Step 3: Add a super strong player status protection with locking to prevent race conditions
CREATE OR REPLACE FUNCTION lock_completed_player_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If trying to change from completed to another status (except left)
    IF OLD.status = 'completed' AND NEW.status != 'completed' AND NEW.status != 'left' THEN
        -- First, apply a row-level lock to prevent race conditions
        PERFORM 1 FROM room_players WHERE id = NEW.id FOR UPDATE;
        
        -- Check if the room is marked as completed
        DECLARE
            room_completed BOOLEAN;
        BEGIN
            SELECT 
                status = 'completed' OR all_players_completed = TRUE 
            INTO 
                room_completed
            FROM game_rooms
            WHERE id = NEW.room_id;
            
            -- If the room is completed or player has completed_at timestamp, lock status
            IF room_completed OR NEW.completed_at IS NOT NULL OR OLD.completed_at IS NOT NULL THEN
                RAISE LOG 'Preventing player % status change from completed to %', NEW.id, NEW.status;
                NEW.status := 'completed';
                NEW.completion_status := 'completed';
                NEW.completed_at := COALESCE(OLD.completed_at, NEW.completed_at, NOW());
            END IF;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the player status lock trigger
DROP TRIGGER IF EXISTS lock_completed_player_status_trigger ON room_players;
CREATE TRIGGER lock_completed_player_status_trigger
BEFORE UPDATE ON room_players
FOR EACH ROW
EXECUTE FUNCTION lock_completed_player_status();

-- Step 4: Create a room checker function that can be called periodically by the application
-- This ensures any flickering is quickly corrected
CREATE OR REPLACE FUNCTION check_and_fix_room_status()
RETURNS VOID AS $$
BEGIN
    -- Find and fix any rooms where status doesn't match player completion
    UPDATE game_rooms gr
    SET 
        status = 'completed',
        all_players_completed = TRUE,
        completion_time = COALESCE(gr.completion_time, NOW())
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
END;
$$ LANGUAGE plpgsql; 