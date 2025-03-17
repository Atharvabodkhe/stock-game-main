/*
  # Initial Schema Setup

  1. New Tables
    - users
      - id (uuid, primary key)
      - email (text, unique)
      - name (text)
      - age (integer)
      - gender (text)
      - created_at (timestamp)
    
    - game_sessions
      - id (uuid, primary key)
      - user_id (uuid, foreign key)
      - final_balance (numeric)
      - personality_report (jsonb)
      - created_at (timestamp)
    
    - game_actions
      - id (uuid, primary key)
      - session_id (uuid, foreign key)
      - level (integer)
      - stock_name (text)
      - action (text)
      - price (numeric)
      - timestamp (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT auth.uid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  age integer,
  gender text,
  created_at timestamptz DEFAULT now()
);

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  final_balance numeric NOT NULL,
  personality_report jsonb,
  created_at timestamptz DEFAULT now()
);

-- Game actions table
CREATE TABLE IF NOT EXISTS game_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES game_sessions(id),
  level integer NOT NULL,
  stock_name text NOT NULL,
  action text NOT NULL,
  price numeric NOT NULL,
  timestamp timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can read own data"
  ON users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
  ON users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can read own game sessions"
  ON game_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own game sessions"
  ON game_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own game actions"
  ON game_actions
  FOR SELECT
  TO authenticated
  USING (session_id IN (
    SELECT id FROM game_sessions WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own game actions"
  ON game_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (session_id IN (
    SELECT id FROM game_sessions WHERE user_id = auth.uid()
  ));