/*
  # Fix room players policies v2

  This migration updates the room players policies to use simpler joins
  and avoid recursive policy checks.

  1. Changes
    - Drop existing policies
    - Create new optimized policies
  
  2. Security
    - Maintains row level security
    - Ensures proper access control
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage room players" ON room_players;
DROP POLICY IF EXISTS "Users can view room players" ON room_players;
DROP POLICY IF EXISTS "Users can join open rooms" ON room_players;

-- Create new optimized policies
CREATE POLICY "Admin full access"
  ON room_players
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE admin_users.user_id = auth.uid()
    )
  );

CREATE POLICY "View own and same room players"
  ON room_players
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM game_rooms
      WHERE game_rooms.id = room_players.room_id
      AND game_rooms.status = 'open'
    )
  );

CREATE POLICY "Join open rooms"
  ON room_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM game_rooms
      WHERE game_rooms.id = room_id
      AND game_rooms.status = 'open'
      AND NOT EXISTS (
        SELECT 1 FROM room_players rp
        WHERE rp.room_id = room_players.room_id
        AND rp.user_id = auth.uid()
        AND rp.status = 'joined'
      )
    )
  );