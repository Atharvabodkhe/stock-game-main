-- Enable replication for realtime
ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms, room_players, game_results;

-- Function to handle room events
CREATE OR REPLACE FUNCTION handle_room_event()
RETURNS trigger AS $$
BEGIN
  -- This function is intentionally left mostly empty as Supabase handles
  -- the realtime notifications automatically through the publication
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle player events
CREATE OR REPLACE FUNCTION handle_player_event()
RETURNS trigger AS $$
BEGIN
  -- This function is intentionally left mostly empty as Supabase handles
  -- the realtime notifications automatically through the publication
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS room_event_trigger ON game_rooms;
DROP TRIGGER IF EXISTS player_event_trigger ON room_players;

-- Create trigger for room events
CREATE TRIGGER room_event_trigger
  AFTER INSERT OR UPDATE OR DELETE ON game_rooms
  FOR EACH ROW
  EXECUTE FUNCTION handle_room_event();

-- Create trigger for player events
CREATE TRIGGER player_event_trigger
  AFTER INSERT OR UPDATE ON room_players
  FOR EACH ROW
  EXECUTE FUNCTION handle_player_event();

-- Enable row level security
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

-- Create policies for realtime
CREATE POLICY "Allow all users to view rooms" ON game_rooms
  FOR SELECT USING (true);

CREATE POLICY "Allow all users to view players" ON room_players
  FOR SELECT USING (true);

CREATE POLICY "Allow all users to view results" ON game_results
  FOR SELECT USING (true);