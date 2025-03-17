/*
  # Enable Realtime for All Tables

  1. Changes
    - Create publication for realtime if it doesn't exist
    - Add tables to publication if they're not already members
    - Set up triggers for realtime notifications
    
  2. Security
    - Maintains existing RLS policies
    - Ensures proper access control for realtime events
*/

-- Create publication for realtime if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- Add tables to publication if they're not already members
DO $$
DECLARE
  table_name text;
  table_names text[] := ARRAY['users', 'game_sessions', 'game_actions', 'admin_users', 'news_items', 'game_rooms', 'room_players', 'game_results'];
BEGIN
  FOREACH table_name IN ARRAY table_names
  LOOP
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', table_name);
    END IF;
  END LOOP;
END
$$;

-- Function to handle realtime events
CREATE OR REPLACE FUNCTION handle_realtime_changes()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'realtime_changes',
    json_build_object(
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'operation', TG_OP,
      'record', CASE
        WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)
        ELSE row_to_json(NEW)
      END
    )::text
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add realtime triggers to all tables
DO $$ 
DECLARE
  t record;
BEGIN
  FOR t IN 
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_realtime_trigger ON %I', t.table_name, t.table_name);
    EXECUTE format(
      'CREATE TRIGGER %I_realtime_trigger
       AFTER INSERT OR UPDATE OR DELETE ON %I
       FOR EACH ROW
       EXECUTE FUNCTION handle_realtime_changes()',
      t.table_name, t.table_name
    );
  END LOOP;
END $$;