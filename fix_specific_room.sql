-- DIRECT FIX FOR ROOM WITH ID 60e7c776-53b5-4371-b3a8-f3b776c27573
-- This will update the all_players_completed flag for this specific room

-- Step 1: Update the specific room directly
UPDATE game_rooms
SET 
    all_players_completed = TRUE,
    status = 'completed',
    completion_time = COALESCE(completion_time, NOW())
WHERE id = '60e7c776-53b5-4371-b3a8-f3b776c27573';

-- Step 2: Make sure all players in this room are marked as completed
UPDATE room_players
SET 
    status = 'completed',
    completed_at = COALESCE(completed_at, NOW()),
    completion_status = 'completed'
WHERE room_id = '60e7c776-53b5-4371-b3a8-f3b776c27573'
AND status != 'left'
AND status != 'completed';

-- Step 3: Add a trigger to prevent player status from reverting from 'completed'
CREATE OR REPLACE FUNCTION prevent_status_revert()
RETURNS TRIGGER AS $$
BEGIN
    -- If this is trying to change a player from 'completed' to something else
    IF OLD.status = 'completed' AND NEW.status != 'completed' AND NEW.status != 'left' THEN
        RAISE NOTICE 'Prevented status change from completed to % for player %', NEW.status, NEW.id;
        -- Keep the status as 'completed'
        NEW.status := 'completed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create or replace the trigger on room_players
DROP TRIGGER IF EXISTS prevent_status_revert_trigger ON room_players;
CREATE TRIGGER prevent_status_revert_trigger
BEFORE UPDATE ON room_players
FOR EACH ROW
EXECUTE FUNCTION prevent_status_revert();

-- Step 4: Report the current status after the update
SELECT 
    gr.id as room_id,
    gr.status as room_status,
    gr.all_players_completed,
    COUNT(rp.id) FILTER (WHERE rp.status != 'left') AS total_players,
    COUNT(rp.id) FILTER (WHERE rp.status = 'completed') AS completed_players
FROM game_rooms gr
LEFT JOIN room_players rp ON rp.room_id = gr.id
WHERE gr.id = '60e7c776-53b5-4371-b3a8-f3b776c27573'
GROUP BY gr.id, gr.status, gr.all_players_completed; 