/*
  # Fix Admin User Privileges

  1. Changes
    - Drop existing admin_users policies
    - Create new optimized policies
    - Add admin user record for existing user
*/

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "admin_users_select_policy" ON admin_users;
DROP POLICY IF EXISTS "admin_users_insert_policy" ON admin_users;

-- Create new simplified policies
CREATE POLICY "admin_users_select"
  ON admin_users
  FOR SELECT
  USING (true);

CREATE POLICY "admin_users_insert"
  ON admin_users
  FOR INSERT
  WITH CHECK (true);

-- Insert admin user if not exists
DO $$ 
DECLARE
  v_user_id uuid;
BEGIN
  -- Get the user ID for the email
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'atharva@gmail.com';

  -- If user exists, add admin privileges
  IF v_user_id IS NOT NULL THEN
    INSERT INTO admin_users (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;