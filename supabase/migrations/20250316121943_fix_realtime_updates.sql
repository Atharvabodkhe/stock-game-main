-- First, let's ensure the publication exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- Drop the tables from the publication if they already exist to avoid errors
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS game_rooms;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS room_players;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS game_results;

-- Add tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_results;

-- Make sure the realtime extension is enabled
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- Update the trigger functions to include notification logic (backup mechanism)
CREATE OR REPLACE FUNCTION handle_room_event()
RETURNS trigger AS $$
BEGIN
    -- Primary realtime updates are handled by the publication
    -- This is a secondary notification mechanism as a backup
    IF TG_OP = 'INSERT' THEN
        PERFORM pg_notify(
            'realtime:game_rooms',
            json_build_object(
                'type', 'INSERT',
                'table', 'game_rooms',
                'schema', 'public',
                'record', row_to_json(NEW)
            )::text
        );
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM pg_notify(
            'realtime:game_rooms',
            json_build_object(
                'type', 'DELETE',
                'table', 'game_rooms',
                'schema', 'public',
                'old_record', row_to_json(OLD)
            )::text
        );
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM pg_notify(
            'realtime:game_rooms',
            json_build_object(
                'type', 'UPDATE',
                'table', 'game_rooms',
                'schema', 'public',
                'record', row_to_json(NEW),
                'old_record', row_to_json(OLD)
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_player_event()
RETURNS trigger AS $$
BEGIN
    -- Primary realtime updates are handled by the publication
    -- This is a secondary notification mechanism as a backup
    IF TG_OP = 'INSERT' THEN
        PERFORM pg_notify(
            'realtime:room_players',
            json_build_object(
                'type', 'INSERT',
                'table', 'room_players',
                'schema', 'public',
                'record', row_to_json(NEW)
            )::text
        );
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM pg_notify(
            'realtime:room_players',
            json_build_object(
                'type', 'UPDATE',
                'table', 'room_players',
                'schema', 'public',
                'record', row_to_json(NEW),
                'old_record', row_to_json(OLD)
            )::text
        );
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM pg_notify(
            'realtime:room_players',
            json_build_object(
                'type', 'DELETE',
                'table', 'room_players',
                'schema', 'public',
                'old_record', row_to_json(OLD)
            )::text
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure triggers exist and are properly configured
DROP TRIGGER IF EXISTS room_event_trigger ON game_rooms;
DROP TRIGGER IF EXISTS player_event_trigger ON room_players;

CREATE TRIGGER room_event_trigger
  AFTER INSERT OR UPDATE OR DELETE ON game_rooms
  FOR EACH ROW
  EXECUTE FUNCTION handle_room_event();

CREATE TRIGGER player_event_trigger
  AFTER INSERT OR UPDATE OR DELETE ON room_players
  FOR EACH ROW
  EXECUTE FUNCTION handle_player_event();

-- Make sure room_players has a trigger for DELETE events too
CREATE TRIGGER player_delete_event_trigger
  AFTER DELETE ON room_players
  FOR EACH ROW
  EXECUTE FUNCTION handle_player_event();

-- Ensure row level security is properly set up
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow all users to view rooms" ON game_rooms;
DROP POLICY IF EXISTS "Allow all users to view players" ON room_players;
DROP POLICY IF EXISTS "Allow all users to view results" ON game_results;

-- Create comprehensive RLS policies
CREATE POLICY "Allow all users to view rooms" ON game_rooms
  FOR SELECT USING (true);

CREATE POLICY "Allow admin users to modify rooms" ON game_rooms
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM admin_users au
    WHERE au.user_id = auth.uid()
  ));

CREATE POLICY "Allow all users to view players" ON room_players
  FOR SELECT USING (true);

CREATE POLICY "Allow users to modify their own player records" ON room_players
  FOR ALL
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM admin_users au
    WHERE au.user_id = auth.uid()
  ));

CREATE POLICY "Allow all users to view results" ON game_results
  FOR SELECT USING (true);

-- Grant necessary permissions
GRANT SELECT ON game_rooms TO anon, authenticated;
GRANT SELECT ON room_players TO anon, authenticated;
GRANT SELECT ON game_results TO anon, authenticated;
