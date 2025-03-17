/*
  # Add RLS policies for game_results table

  1. Security Changes
    - Enable RLS on game_results table
    - Add policies for:
      - Admins to manage all results
      - Users to insert their own results
      - Users to view results for their games and rooms they participated in
*/

-- Enable RLS
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

-- Policy for admins to manage all results
CREATE POLICY "Admins can manage all results"
ON game_results
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admin_users 
    WHERE admin_users.user_id = auth.uid()
  )
);

-- Policy for users to insert their own results
CREATE POLICY "Users can insert own results"
ON game_results
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Policy for users to view results
CREATE POLICY "Users can view results for their games and rooms"
ON game_results
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR
  room_id IN (
    SELECT room_id 
    FROM room_players 
    WHERE user_id = auth.uid()
  )
);