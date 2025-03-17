/*
  # Add cascade delete constraints

  1. Changes
    - Add ON DELETE CASCADE to all foreign key constraints referencing game_rooms and game_sessions
    - This ensures automatic cleanup of all related records when a room or session is deleted

  2. Tables Modified
    - room_players
    - game_sessions
    - game_results
    - game_actions

  3. Security
    - No changes to RLS policies
    - Maintains existing security model
*/

-- Drop existing foreign key constraints
ALTER TABLE room_players DROP CONSTRAINT IF EXISTS room_players_room_id_fkey;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_room_id_fkey;
ALTER TABLE game_results DROP CONSTRAINT IF EXISTS game_results_room_id_fkey;
ALTER TABLE game_results DROP CONSTRAINT IF EXISTS game_results_session_id_fkey;
ALTER TABLE game_actions DROP CONSTRAINT IF EXISTS game_actions_session_id_fkey;

-- Re-create constraints with CASCADE delete for room_players
ALTER TABLE room_players
ADD CONSTRAINT room_players_room_id_fkey
FOREIGN KEY (room_id)
REFERENCES game_rooms(id)
ON DELETE CASCADE;

-- Re-create constraints with CASCADE delete for game_sessions
ALTER TABLE game_sessions
ADD CONSTRAINT game_sessions_room_id_fkey
FOREIGN KEY (room_id)
REFERENCES game_rooms(id)
ON DELETE CASCADE;

-- Re-create constraints with CASCADE delete for game_results
ALTER TABLE game_results
ADD CONSTRAINT game_results_room_id_fkey
FOREIGN KEY (room_id)
REFERENCES game_rooms(id)
ON DELETE CASCADE;

ALTER TABLE game_results
ADD CONSTRAINT game_results_session_id_fkey
FOREIGN KEY (session_id)
REFERENCES game_sessions(id)
ON DELETE CASCADE;

-- Re-create constraints with CASCADE delete for game_actions
ALTER TABLE game_actions
ADD CONSTRAINT game_actions_session_id_fkey
FOREIGN KEY (session_id)
REFERENCES game_sessions(id)
ON DELETE CASCADE;