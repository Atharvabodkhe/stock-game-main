/*
  # Fix admin user policies

  1. Changes
    - Add policy for admin users to manage news items
    - Fix policy for admin registration
    - Add policy for admin users to view all users
*/

-- Fix admin users policies
DROP POLICY IF EXISTS "Allow admin registration" ON admin_users;

CREATE POLICY "Admin users can view all admin users"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can register as admin"
  ON admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Fix news items policies
DROP POLICY IF EXISTS "Admins can manage news" ON news_items;

CREATE POLICY "Admins can insert news"
  ON news_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update news"
  ON news_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can delete news"
  ON news_items
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    )
  );