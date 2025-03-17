/*
  # Clean up database schema

  1. Changes
    - Remove unused tables and columns
    - Keep only essential tables and relationships
    - Simplify schema to core functionality

  2. Tables Kept
    - users (core user data)
    - admin_users (admin privileges)
    - game_sessions (game progress)
    - game_actions (trading actions)
    - game_rooms (multiplayer rooms)
    - room_players (room participants)
    - game_results (final rankings)

  3. Tables Removed
    - news_items (unused news feature)
*/

-- Drop unused tables
DROP TABLE IF EXISTS news_items CASCADE;

-- Clean up game_sessions table
ALTER TABLE game_sessions
DROP COLUMN IF EXISTS personality_report;

-- Clean up game_rooms table
ALTER TABLE game_rooms
DROP COLUMN IF EXISTS ended_at;

-- Clean up room_players table
ALTER TABLE room_players
DROP COLUMN IF EXISTS kicked_at;

-- Update status constraints
ALTER TABLE room_players 
DROP CONSTRAINT IF EXISTS room_players_status_check;

ALTER TABLE room_players 
ADD CONSTRAINT room_players_status_check 
CHECK (status IN ('joined', 'in_game', 'completed'));

-- Update game_rooms status constraint
ALTER TABLE game_rooms 
DROP CONSTRAINT IF EXISTS game_rooms_status_check;

ALTER TABLE game_rooms 
ADD CONSTRAINT game_rooms_status_check 
CHECK (status IN ('open', 'in_progress', 'completed'));

-- Recreate essential indexes
CREATE INDEX IF NOT EXISTS idx_game_sessions_user_id ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_actions_session_id ON game_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_results_room_id ON game_results(room_id);
CREATE INDEX IF NOT EXISTS idx_game_results_user_id ON game_results(user_id);