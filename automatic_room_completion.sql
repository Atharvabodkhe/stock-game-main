-- FULLY AUTOMATIC ROOM COMPLETION FIX
-- This solution works automatically for ALL rooms without manual intervention

-- Step 1: Fix existing incorrect rooms (one-time fix for current data)
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

-- Step 2: Create an automatic trigger that marks rooms as completed 
-- This runs EVERY TIME a player status changes
CREATE OR REPLACE FUNCTION auto_complete_room_on_player_update()
RETURNS TRIGGER AS $$
DECLARE
    active_players INTEGER;
    completed_players INTEGER;
BEGIN
    -- Only run this logic when a player status changes to 'completed'
    IF (TG_OP = 'INSERT' AND NEW.status = 'completed') OR 
       (TG_OP = 'UPDATE' AND NEW.status = 'completed' AND OLD.status != 'completed') THEN
        
        -- Count active and completed players in this room
        SELECT 
            COUNT(*) FILTER (WHERE status != 'left'),
            COUNT(*) FILTER (WHERE status = 'completed')
        INTO
            active_players,
            completed_players
        FROM room_players
        WHERE room_id = NEW.room_id;
        
        -- If all active players have completed, mark the room as completed
        IF active_players > 0 AND completed_players = active_players THEN
            -- Mark the room as completed
            UPDATE game_rooms
            SET 
                status = 'completed',
                all_players_completed = TRUE,
                completion_time = COALESCE(completion_time, NOW())
            WHERE id = NEW.room_id
            AND (all_players_completed = FALSE OR all_players_completed IS NULL OR status != 'completed');
        END IF;
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Don't let errors stop the transaction
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the automatic trigger on room_players
DROP TRIGGER IF EXISTS auto_complete_room_trigger ON room_players;
CREATE TRIGGER auto_complete_room_trigger
AFTER INSERT OR UPDATE ON room_players
FOR EACH ROW
EXECUTE FUNCTION auto_complete_room_on_player_update();

-- Step 3: Prevent player status from changing from 'completed' to another status
CREATE OR REPLACE FUNCTION prevent_completed_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- If attempting to change a player from 'completed' to another status
    IF OLD.status = 'completed' AND NEW.status != 'completed' AND NEW.status != 'left' THEN
        -- Prevent the change by keeping the status as 'completed'
        NEW.status := 'completed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the prevent status change trigger
DROP TRIGGER IF EXISTS prevent_status_change_trigger ON room_players;
CREATE TRIGGER prevent_status_change_trigger
BEFORE UPDATE ON room_players
FOR EACH ROW
EXECUTE FUNCTION prevent_completed_status_change();

-- Step 4: Create an additional trigger on game_rooms to ensure consistency
-- This catches cases where game_rooms is updated directly
CREATE OR REPLACE FUNCTION auto_complete_room_on_room_update()
RETURNS TRIGGER AS $$
DECLARE
    active_players INTEGER;
    completed_players INTEGER;
BEGIN
    -- Check if room should be completed based on player statuses
    SELECT 
        COUNT(*) FILTER (WHERE status != 'left'),
        COUNT(*) FILTER (WHERE status = 'completed')
    INTO
        active_players,
        completed_players
    FROM room_players
    WHERE room_id = NEW.id;
    
    -- If all active players have completed, ensure room is marked as completed
    IF active_players > 0 AND completed_players = active_players THEN
        NEW.status := 'completed';
        NEW.all_players_completed := TRUE;
        NEW.completion_time := COALESCE(NEW.completion_time, NOW());
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Don't let errors stop the transaction
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install the room update trigger
DROP TRIGGER IF EXISTS auto_complete_room_on_update_trigger ON game_rooms;
CREATE TRIGGER auto_complete_room_on_update_trigger
BEFORE UPDATE ON game_rooms
FOR EACH ROW
EXECUTE FUNCTION auto_complete_room_on_room_update(); 