/*
  # Fix admin authentication policies

  1. Changes
    - Update admin_users policies to ensure proper access control
    - Add indexes for better query performance
    - Fix policy naming conflicts
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for all users" ON admin_users;
DROP POLICY IF EXISTS "Enable insert with admin code" ON admin_users;

-- Create new admin policies
CREATE POLICY "admin_users_select_policy"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_users_insert_policy"
  ON admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM admin_users
      WHERE user_id = auth.uid()
    )
  );

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id_unique 
  ON admin_users(user_id);

-- Ensure proper constraints
ALTER TABLE admin_users
  DROP CONSTRAINT IF EXISTS admin_users_user_id_key,
  ADD CONSTRAINT admin_users_user_id_key 
  UNIQUE (user_id);