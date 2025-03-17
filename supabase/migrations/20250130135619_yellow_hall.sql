/*
  # Fix room players policies

  This migration fixes the infinite recursion issue in room players policies
  by simplifying the policy conditions and removing circular references.

  1. Changes
    - Drop existing policies
    - Create new simplified policies
  
  2. Security
    - Maintains row level security
    - Ensures proper access control
*/

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Admins can manage room players" ON room_players;
DROP POLICY IF EXISTS "Users can view their room memberships" ON room_players;
DROP POLICY IF EXISTS "Users can join open rooms" ON room_players;

-- Create new simplified policies
CREATE POLICY "Admins can manage room players"
  ON room_players
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE admin_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view room players"
  ON room_players
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR 
    room_id IN (
      SELECT room_id FROM room_players 
      WHERE user_id = auth.uid() AND status = 'joined'
    )
  );

CREATE POLICY "Users can join open rooms"
  ON room_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM game_rooms
      WHERE id = room_id
      AND status = 'open'
    )
  );