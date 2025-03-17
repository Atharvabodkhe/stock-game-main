/*
  # Add game results tracking

  1. New Tables
    - `game_results` table to store final rankings and results
      - `id` (uuid, primary key)
      - `room_id` (uuid, references game_rooms)
      - `session_id` (uuid, references game_sessions)
      - `user_id` (uuid, references users)
      - `final_balance` (numeric)
      - `rank` (integer)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on game_results table
    - Add policies for reading and inserting results
*/

DO $$ BEGIN
  -- Create game results table if it doesn't exist
  CREATE TABLE IF NOT EXISTS game_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid REFERENCES game_rooms(id),
    session_id uuid REFERENCES game_sessions(id),
    user_id uuid REFERENCES users(id),
    final_balance numeric NOT NULL,
    rank integer,
    created_at timestamptz DEFAULT now()
  );

  -- Enable RLS if not already enabled
  IF NOT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = 'game_results'
      AND rowsecurity = true
  ) THEN
    ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;
  END IF;

  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can read results for their rooms" ON game_results;
  DROP POLICY IF EXISTS "Admins can insert results" ON game_results;

  -- Create new policies
  CREATE POLICY "Users can read results for their rooms"
    ON game_results
    FOR SELECT
    TO authenticated
    USING (
      user_id = auth.uid() OR
      room_id IN (
        SELECT room_id 
        FROM room_players 
        WHERE user_id = auth.uid()
      ) OR
      EXISTS (
        SELECT 1 
        FROM admin_users 
        WHERE user_id = auth.uid()
      )
    );

  CREATE POLICY "Admins can insert results"
    ON game_results
    FOR INSERT
    TO authenticated
    WITH CHECK (
      EXISTS (
        SELECT 1 
        FROM admin_users 
        WHERE user_id = auth.uid()
      )
    );
END $$;