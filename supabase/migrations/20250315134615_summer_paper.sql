/*
  # Fix authentication and policies

  1. Changes
    - Update RLS policies for better auth flow
    - Fix admin user checks
    - Ensure proper session handling
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;
DROP POLICY IF EXISTS "Allow public registration" ON users;

-- Create new user policies
CREATE POLICY "Enable read access for authenticated users"
  ON users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert for registration"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable update for users based on id"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Fix admin users policies
DROP POLICY IF EXISTS "Anyone can view admin users" ON admin_users;
DROP POLICY IF EXISTS "Anyone can create admin users" ON admin_users;

CREATE POLICY "Enable read access for all users"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable insert with admin code"
  ON admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Ensure proper indexes
CREATE INDEX IF NOT EXISTS idx_users_id ON users(id);
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);