/*
  # Reset Database Schema

  1. Changes
    - Drop all existing data
    - Reset sequences
    - Ensure proper foreign key constraints
    - Re-enable RLS policies
    
  2. Security
    - Maintains existing security model
    - Ensures proper access control
*/

-- Disable row level security temporarily
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions DISABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE news_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_results DISABLE ROW LEVEL SECURITY;

-- Clear all data
TRUNCATE TABLE game_results CASCADE;
TRUNCATE TABLE room_players CASCADE;
TRUNCATE TABLE game_rooms CASCADE;
TRUNCATE TABLE news_items CASCADE;
TRUNCATE TABLE game_actions CASCADE;
TRUNCATE TABLE game_sessions CASCADE;
TRUNCATE TABLE admin_users CASCADE;
TRUNCATE TABLE users CASCADE;

-- Re-enable row level security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

-- Verify and update foreign key constraints
ALTER TABLE game_sessions
  DROP CONSTRAINT IF EXISTS game_sessions_user_id_fkey,
  ADD CONSTRAINT game_sessions_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

ALTER TABLE game_actions
  DROP CONSTRAINT IF EXISTS game_actions_session_id_fkey,
  ADD CONSTRAINT game_actions_session_id_fkey
  FOREIGN KEY (session_id)
  REFERENCES game_sessions(id)
  ON DELETE CASCADE;

ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_user_id_fkey,
  ADD CONSTRAINT admin_users_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

ALTER TABLE news_items
  DROP CONSTRAINT IF EXISTS news_items_created_by_fkey,
  ADD CONSTRAINT news_items_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES admin_users(id)
  ON DELETE CASCADE;

ALTER TABLE game_rooms
  DROP CONSTRAINT IF EXISTS game_rooms_created_by_fkey,
  ADD CONSTRAINT game_rooms_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES admin_users(id)
  ON DELETE CASCADE;

ALTER TABLE room_players
  DROP CONSTRAINT IF EXISTS room_players_room_id_fkey,
  ADD CONSTRAINT room_players_room_id_fkey
  FOREIGN KEY (room_id)
  REFERENCES game_rooms(id)
  ON DELETE CASCADE;

ALTER TABLE room_players
  DROP CONSTRAINT IF EXISTS room_players_user_id_fkey,
  ADD CONSTRAINT room_players_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

ALTER TABLE room_players
  DROP CONSTRAINT IF EXISTS room_players_session_id_fkey,
  ADD CONSTRAINT room_players_session_id_fkey
  FOREIGN KEY (session_id)
  REFERENCES game_sessions(id)
  ON DELETE CASCADE;

ALTER TABLE game_results
  DROP CONSTRAINT IF EXISTS game_results_room_id_fkey,
  ADD CONSTRAINT game_results_room_id_fkey
  FOREIGN KEY (room_id)
  REFERENCES game_rooms(id)
  ON DELETE CASCADE;

ALTER TABLE game_results
  DROP CONSTRAINT IF EXISTS game_results_session_id_fkey,
  ADD CONSTRAINT game_results_session_id_fkey
  FOREIGN KEY (session_id)
  REFERENCES game_sessions(id)
  ON DELETE CASCADE;

ALTER TABLE game_results
  DROP CONSTRAINT IF EXISTS game_results_user_id_fkey,
  ADD CONSTRAINT game_results_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

-- Verify constraints and indexes
DO $$ 
BEGIN
  -- Ensure email uniqueness on users table
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'users_email_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;

  -- Ensure user_id uniqueness on admin_users table
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'admin_users_user_id_key'
  ) THEN
    ALTER TABLE admin_users ADD CONSTRAINT admin_users_user_id_key UNIQUE (user_id);
  END IF;

  -- Ensure room_id and user_id uniqueness on room_players table
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'room_players_room_id_user_id_key'
  ) THEN
    ALTER TABLE room_players ADD CONSTRAINT room_players_room_id_user_id_key UNIQUE (room_id, user_id);
  END IF;
END $$;