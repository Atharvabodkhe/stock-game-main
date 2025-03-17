/*
  # Fix room players policies

  1. Changes
    - Fix infinite recursion in room_players policies
    - Simplify room_players policies to prevent circular references
    - Add policy for users to view game rooms
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admin full access" ON room_players;
DROP POLICY IF EXISTS "View own and same room players" ON room_players;
DROP POLICY IF EXISTS "Join open rooms" ON room_players;

-- Create simplified policies without circular references
CREATE POLICY "Admin access room players"
  ON room_players
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "View room players"
  ON room_players
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    room_id IN (
      SELECT id FROM game_rooms
      WHERE status = 'open'
    )
  );

CREATE POLICY "Insert room players"
  ON room_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    room_id IN (
      SELECT id FROM game_rooms
      WHERE status = 'open'
    )
  );

-- Fix game_rooms policies to ensure users can view them
DROP POLICY IF EXISTS "Users can view open rooms" ON game_rooms;

CREATE POLICY "Users can view rooms"
  ON game_rooms
  FOR SELECT
  TO authenticated
  USING (true);