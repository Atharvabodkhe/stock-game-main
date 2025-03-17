/*
  # Fix room players policies and add cascade delete

  1. Changes
    - Drop existing policies
    - Create new optimized policies for room players
    - Add cascade delete for room-related records
    - Ensure proper access control for all operations

  2. Security
    - Maintains row level security
    - Ensures proper access control
    - Prevents duplicate policy names
*/

-- Drop all existing policies to start fresh
DO $$ 
BEGIN
  -- Drop all existing policies for room_players
  DROP POLICY IF EXISTS "Admin full access to room players" ON room_players;
  DROP POLICY IF EXISTS "Users can view room players" ON room_players;
  DROP POLICY IF EXISTS "Users can join rooms" ON room_players;
  DROP POLICY IF EXISTS "Public view access" ON room_players;
  DROP POLICY IF EXISTS "Admin full access" ON room_players;
  DROP POLICY IF EXISTS "Users can update own status" ON room_players;
  DROP POLICY IF EXISTS "room_players_view_policy" ON room_players;
  DROP POLICY IF EXISTS "room_players_join_policy" ON room_players;
  DROP POLICY IF EXISTS "room_players_admin_policy" ON room_players;
  DROP POLICY IF EXISTS "room_players_update_policy" ON room_players;
END $$;

-- Create new policies with unique names
CREATE POLICY "room_players_view_policy"
  ON room_players
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "room_players_join_policy"
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

CREATE POLICY "room_players_admin_policy"
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

CREATE POLICY "room_players_update_policy"
  ON room_players
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add cascade delete for room-related records
ALTER TABLE room_players DROP CONSTRAINT IF EXISTS room_players_room_id_fkey;
ALTER TABLE room_players 
  ADD CONSTRAINT room_players_room_id_fkey 
  FOREIGN KEY (room_id) 
  REFERENCES game_rooms(id) 
  ON DELETE CASCADE;