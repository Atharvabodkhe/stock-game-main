/*
  # Fix user registration policies

  1. Changes
    - Add INSERT policy for users table to allow registration
    - Modify existing policies to be more specific

  2. Security
    - Maintains RLS protection while allowing necessary operations
    - Ensures users can only access their own data
*/

-- Add policy to allow users to insert their own data during registration
CREATE POLICY "Users can insert own data during registration"
  ON users
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Make the existing select policy more specific
DROP POLICY IF EXISTS "Users can read own data" ON users;
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Make the existing update policy more specific
DROP POLICY IF EXISTS "Users can update own data" ON users;
CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);