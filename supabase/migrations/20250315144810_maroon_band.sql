/*
  # Revert Recent Changes and Restore Original State

  1. Changes
    - Drop existing policies
    - Restore original policies and constraints
    - Re-enable RLS
    - Clean up any temporary changes
*/

-- First drop all existing policies to avoid conflicts
DROP POLICY IF EXISTS "admin_users_select" ON admin_users;
DROP POLICY IF EXISTS "admin_users_insert" ON admin_users;
DROP POLICY IF EXISTS "Public can view admin users" ON admin_users;
DROP POLICY IF EXISTS "Users can register as admin" ON admin_users;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON users;
DROP POLICY IF EXISTS "Enable insert for registration" ON users;
DROP POLICY IF EXISTS "Enable update for users based on id" ON users;

-- Restore original policies with new names to avoid conflicts
CREATE POLICY "admin_users_view_policy"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_users_register_policy"
  ON admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "users_read_policy"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users_update_policy"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users_register_policy"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Re-enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

-- Restore original constraints
ALTER TABLE room_players 
DROP CONSTRAINT IF EXISTS room_players_status_check;

ALTER TABLE room_players 
ADD CONSTRAINT room_players_status_check 
CHECK (status IN ('joined', 'kicked', 'left', 'in_game', 'completed'));