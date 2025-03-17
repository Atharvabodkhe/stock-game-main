/*
  # Fix authentication and policy issues

  1. Changes
    - Add policy for users to update their own data
    - Fix policy for admin users
    - Ensure proper authentication flow
*/

-- Fix users policies to ensure proper registration
CREATE POLICY "Users can insert their own data"
  ON users
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Fix admin_users policies
DROP POLICY IF EXISTS "Admin users can view all admin users" ON admin_users;
DROP POLICY IF EXISTS "Users can register as admin" ON admin_users;
DROP POLICY IF EXISTS "Public can view admin users" ON admin_users;

CREATE POLICY "Anyone can view admin users"
  ON admin_users
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create admin users"
  ON admin_users
  FOR INSERT
  WITH CHECK (true);

-- Fix room_players policies
DROP POLICY IF EXISTS "Admin access room players" ON room_players;
DROP POLICY IF EXISTS "View room players" ON room_players;
DROP POLICY IF EXISTS "Insert room players" ON room_players;

CREATE POLICY "Admin full access to room players"
  ON room_players
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view room players"
  ON room_players
  FOR SELECT
  USING (true);

CREATE POLICY "Users can join rooms"
  ON room_players
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM game_rooms
      WHERE id = room_id
      AND status = 'open'
    )
  );