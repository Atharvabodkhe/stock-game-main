/*
  # Add room_id to game_sessions table

  1. Changes
    - Add `room_id` column to `game_sessions` table to link sessions to game rooms
    - This allows tracking which game session belongs to which room
*/

-- Add room_id column to game_sessions table
ALTER TABLE IF EXISTS game_sessions 
ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES game_rooms(id);

-- Update RLS policies to allow admins to manage game sessions
CREATE POLICY "Admins can manage game sessions"
  ON game_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE admin_users.user_id = auth.uid()
    )
  );