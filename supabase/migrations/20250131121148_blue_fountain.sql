/*
  # Add admin registration policy

  1. Changes
    - Add policy to allow authenticated users to insert into admin_users table during registration
    - Keep existing policies intact
    - Maintain security by requiring admin code verification in application logic

  2. Security
    - Only allows insertion, not modification or deletion
    - Application-level validation of admin code remains the primary security measure
*/

-- Add policy for admin registration
CREATE POLICY "Allow admin registration"
  ON admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);