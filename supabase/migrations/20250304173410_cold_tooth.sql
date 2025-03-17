/*
  # Add session_id to room_players table

  1. Changes
    - Add `session_id` column to `room_players` table to link players to their game sessions
    - This allows tracking which player is in which game session
    - Add 'in_game' status to the status check constraint
*/

-- Add session_id column to room_players table
ALTER TABLE IF EXISTS room_players 
ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES game_sessions(id);

-- Update the status check constraint to include 'in_game'
ALTER TABLE room_players DROP CONSTRAINT IF EXISTS room_players_status_check;
ALTER TABLE room_players ADD CONSTRAINT room_players_status_check 
  CHECK (status IN ('joined', 'kicked', 'left', 'in_game', 'completed'));