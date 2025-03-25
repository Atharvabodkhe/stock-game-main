-- CREATE A DEDICATED VIEW FOR COMPLETED ROOMS
-- This provides a centralized view of all completed game rooms

-- First create a convenient view for completed rooms
CREATE OR REPLACE VIEW completed_game_rooms AS
SELECT 
    gr.id,
    gr.name,
    gr.min_players,
    gr.max_players,
    gr.status,
    gr.created_at,
    gr.started_at,
    gr.completion_time,
    gr.all_players_completed,
    COUNT(rp.id) FILTER (WHERE rp.status != 'left') AS active_player_count,
    COUNT(rp.id) FILTER (WHERE rp.status = 'completed') AS completed_player_count,
    ARRAY_AGG(DISTINCT rp.user_id) FILTER (WHERE rp.status != 'left') AS player_ids,
    ARRAY_AGG(DISTINCT u.name) FILTER (WHERE rp.status != 'left' AND u.name IS NOT NULL) AS player_names
FROM 
    game_rooms gr
LEFT JOIN 
    room_players rp ON gr.id = rp.room_id
LEFT JOIN 
    users u ON rp.user_id = u.id
WHERE 
    gr.status = 'completed' OR gr.all_players_completed = TRUE
GROUP BY 
    gr.id, gr.name, gr.min_players, gr.max_players, gr.status, gr.created_at, gr.started_at, gr.completion_time, gr.all_players_completed
ORDER BY 
    gr.completion_time DESC NULLS LAST;

-- Create RLS policies to allow admin access to this view
CREATE POLICY "Allow admin users to view completed rooms"
    ON completed_game_rooms
    FOR SELECT
    USING (
        auth.uid() IN (SELECT user_id FROM admin_users)
    );

-- If needed, create a function to fetch completed rooms with player data
CREATE OR REPLACE FUNCTION get_completed_rooms_with_players()
RETURNS TABLE (
    id UUID,
    name TEXT,
    min_players INTEGER,
    max_players INTEGER,
    status TEXT, 
    created_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completion_time TIMESTAMPTZ,
    all_players_completed BOOLEAN,
    player_count INTEGER,
    players JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gr.id,
        gr.name,
        gr.min_players,
        gr.max_players,
        gr.status,
        gr.created_at,
        gr.started_at,
        gr.completion_time,
        gr.all_players_completed,
        COUNT(rp.id) FILTER (WHERE rp.status != 'left')::INTEGER AS player_count,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', rp.id,
                    'user_id', rp.user_id,
                    'status', rp.status,
                    'completed_at', rp.completed_at,
                    'user', jsonb_build_object(
                        'name', u.name,
                        'email', u.email
                    )
                )
            ) FILTER (WHERE rp.id IS NOT NULL),
            '[]'::jsonb
        ) AS players
    FROM 
        game_rooms gr
    LEFT JOIN 
        room_players rp ON gr.id = rp.room_id
    LEFT JOIN 
        users u ON rp.user_id = u.id
    WHERE 
        gr.status = 'completed' OR gr.all_players_completed = TRUE
    GROUP BY 
        gr.id, gr.name, gr.min_players, gr.max_players, gr.status, gr.created_at, gr.started_at, gr.completion_time, gr.all_players_completed
    ORDER BY 
        gr.completion_time DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions to use this function
GRANT EXECUTE ON FUNCTION get_completed_rooms_with_players() TO authenticated; 