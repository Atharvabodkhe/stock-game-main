-- First, drop the existing function
DROP FUNCTION IF EXISTS get_room_completion_status(uuid);

-- Then recreate the function with the renamed parameter
CREATE OR REPLACE FUNCTION get_room_completion_status(input_room_id UUID)
RETURNS TABLE (
    total_players INTEGER,
    completed_players INTEGER,
    is_completed BOOLEAN,
    completion_time TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(CASE WHEN rp.status != 'left' THEN 1 END)::INTEGER as total_players,
        COUNT(CASE WHEN rp.status = 'completed' THEN 1 END)::INTEGER as completed_players,
        gr.all_players_completed as is_completed,
        gr.completion_time
    FROM game_rooms gr
    LEFT JOIN room_players rp ON rp.room_id = gr.id
    WHERE gr.id = input_room_id
    GROUP BY gr.all_players_completed, gr.completion_time;
END;
$$ LANGUAGE plpgsql;

-- Test the function
SELECT * FROM get_room_completion_status((SELECT id FROM game_rooms LIMIT 1)); 