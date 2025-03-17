/*
  # Add admin and room management features

  1. New Tables
    - `admin_users`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references users)
      - `created_at` (timestamp)
    
    - `news_items`
      - `id` (uuid, primary key)
      - `content` (text)
      - `created_by` (uuid, references admin_users)
      - `created_at` (timestamp)
      - `active` (boolean)

    - `game_rooms`
      - `id` (uuid, primary key)
      - `name` (text)
      - `created_by` (uuid, references admin_users)
      - `min_players` (integer)
      - `max_players` (integer)
      - `status` (text)
      - `created_at` (timestamp)
      - `started_at` (timestamp)
      - `ended_at` (timestamp)

    - `room_players`
      - `id` (uuid, primary key)
      - `room_id` (uuid, references game_rooms)
      - `user_id` (uuid, references users)
      - `status` (text)
      - `joined_at` (timestamp)
      - `kicked_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for admin and user access
*/

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- News items table
CREATE TABLE IF NOT EXISTS news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  created_by uuid REFERENCES admin_users(id) NOT NULL,
  created_at timestamptz DEFAULT now(),
  active boolean DEFAULT true
);

-- Game rooms table
CREATE TABLE IF NOT EXISTS game_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES admin_users(id) NOT NULL,
  min_players integer NOT NULL DEFAULT 2,
  max_players integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  CHECK (min_players >= 2),
  CHECK (max_players <= 5),
  CHECK (max_players >= min_players),
  CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled'))
);

-- Room players table
CREATE TABLE IF NOT EXISTS room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES game_rooms(id) NOT NULL,
  user_id uuid REFERENCES users(id) NOT NULL,
  status text NOT NULL DEFAULT 'joined',
  joined_at timestamptz DEFAULT now(),
  kicked_at timestamptz,
  CHECK (status IN ('joined', 'kicked', 'left')),
  UNIQUE(room_id, user_id)
);

-- Enable RLS
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;

-- Admin users policies
CREATE POLICY "Public can view admin users"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (true);

-- News items policies
CREATE POLICY "Admins can manage news"
  ON news_items
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Everyone can view active news"
  ON news_items
  FOR SELECT
  TO authenticated
  USING (active = true);

-- Game rooms policies
CREATE POLICY "Admins can manage rooms"
  ON game_rooms
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view open rooms"
  ON game_rooms
  FOR SELECT
  TO authenticated
  USING (status = 'open' OR EXISTS (
    SELECT 1 FROM room_players 
    WHERE room_id = game_rooms.id 
    AND user_id = auth.uid()
    AND status = 'joined'
  ));

-- Room players policies
CREATE POLICY "Admins can manage room players"
  ON room_players
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      INNER JOIN game_rooms ON game_rooms.created_by = admin_users.id
      WHERE admin_users.user_id = auth.uid()
      AND game_rooms.id = room_players.room_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_users 
      INNER JOIN game_rooms ON game_rooms.created_by = admin_users.id
      WHERE admin_users.user_id = auth.uid()
      AND game_rooms.id = room_players.room_id
    )
  );

CREATE POLICY "Users can view their room memberships"
  ON room_players
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM room_players rp2
    WHERE rp2.room_id = room_players.room_id
    AND rp2.user_id = auth.uid()
    AND rp2.status = 'joined'
  ));

CREATE POLICY "Users can join open rooms"
  ON room_players
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM game_rooms
      WHERE id = room_players.room_id
      AND status = 'open'
    )
    AND user_id = auth.uid()
  );