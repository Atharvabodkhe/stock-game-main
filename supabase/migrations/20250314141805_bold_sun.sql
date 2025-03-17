/*
  # Add Database Triggers for Realtime Events

  1. New Functions
    - Create functions to handle:
      - Room creation/deletion/updates
      - Player joining/leaving
      - Game status changes
    
  2. Triggers
    - Add triggers for game_rooms table
    - Add triggers for room_players table
    
  3. Security
    - Ensure proper access control
    - Maintain data integrity
*/

-- Function to handle room events
CREATE OR REPLACE FUNCTION handle_room_event()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_notify(
      'room_created',
      json_build_object(
        'room_id', NEW.id,
        'name', NEW.name,
        'created_at', NEW.created_at
      )::text
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM pg_notify(
      'room_deleted',
      json_build_object(
        'room_id', OLD.id,
        'name', OLD.name
      )::text
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
    IF NEW.status = 'in_progress' THEN
      PERFORM pg_notify(
        'game_started',
        json_build_object(
          'room_id', NEW.id,
          'name', NEW.name,
          'started_at', NEW.started_at
        )::text
      );
    ELSIF NEW.status = 'completed' THEN
      PERFORM pg_notify(
        'game_completed',
        json_build_object(
          'room_id', NEW.id,
          'name', NEW.name,
          'ended_at', NEW.ended_at
        )::text
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle player events
CREATE OR REPLACE FUNCTION handle_player_event()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_notify(
      'player_joined',
      json_build_object(
        'room_id', NEW.room_id,
        'user_id', NEW.user_id,
        'joined_at', NEW.joined_at
      )::text
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
    IF NEW.status = 'left' OR NEW.status = 'kicked' THEN
      PERFORM pg_notify(
        'player_left',
        json_build_object(
          'room_id', NEW.room_id,
          'user_id', NEW.user_id,
          'status', NEW.status
        )::text
      );
    END IF;
  END IF;
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