/*
  # Fix room players RLS policies

  1. Changes
    - Drop existing problematic policies
    - Create new simplified policies that allow:
      - Users to join open rooms
      - Users to view room players
      - Admins to manage all room players
    
  2. Security
    - Maintains proper access control
    - Fixes policy violations
    - Ensures users can only join open rooms
*/

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Admin full access to room players" ON room_players;
DROP POLICY IF EXISTS "Users can view room players" ON room_players;
DROP POLICY IF EXISTS "Users can join rooms" ON room_players;

-- Create new simplified policies
CREATE POLICY "Public view access"
  ON room_players
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can join rooms"
  ON room_players
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM game_rooms
      WHERE id = room_id
      AND status = 'open'
    )
  );

CREATE POLICY "Admin full access"
  ON room_players
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid()
    )
  );

-- Add policy for users to update their own status
CREATE POLICY "Users can update own status"
  ON room_players
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());