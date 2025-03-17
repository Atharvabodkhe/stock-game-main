/*
  # Add Admin User

  1. Changes
    - Insert admin user record for the specified email
    - Ensure user exists before adding admin privileges
*/

DO $$ 
DECLARE
  v_user_id uuid;
BEGIN
  -- Get the user ID for the email
  SELECT id INTO v_user_id
  FROM users
  WHERE email = 'atharva@gmail.com';

  -- If user exists, add admin privileges
  IF v_user_id IS NOT NULL THEN
    INSERT INTO admin_users (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;