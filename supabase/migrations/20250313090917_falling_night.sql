/*
  # Fix RLS policies for users table

  1. Changes
    - Drop all existing policies to avoid conflicts
    - Create new simplified policies that allow:
      - Anonymous registration
      - Authenticated users to read/update their own data
    - Fix the registration flow by allowing anon inserts
*/

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Allow registration" ON users;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;

-- Create new simplified policies
CREATE POLICY "Allow public registration"
  ON users
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);