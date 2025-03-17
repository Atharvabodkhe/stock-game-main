/*
  # Fix user registration RLS policies

  1. Changes
    - Drop existing user policies
    - Add new policies that allow:
      - Anonymous users to insert during registration
      - Authenticated users to read/update their own data
    
  2. Security
    - Maintains data privacy
    - Allows proper user registration flow
    - Restricts users to only accessing their own data
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can insert own data during registration" ON users;
DROP POLICY IF EXISTS "Users can insert their own data" ON users;
DROP POLICY IF EXISTS "Users can read own data" ON users;
DROP POLICY IF EXISTS "Users can update own data" ON users;

-- Create new policies
CREATE POLICY "Allow registration"
  ON users
  FOR INSERT
  TO anon
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