# Room Completion Schema Documentation

## Overview

This schema adds a dedicated table and supporting functions to track detailed information about completed game rooms without modifying any existing functionality in the system. The schema automatically captures rich analytics data about room completions, player performance, and game statistics.

## Schema Components

### 1. `room_completions` Table

A dedicated table that stores comprehensive data about completed game rooms:

- **Basic Information**:
  - `id`: Unique identifier for the completion record
  - `room_id`: Reference to the game room
  - `completion_time`: When the room was marked as completed
  - `all_players_completed`: Whether all players completed the game
  - `created_at`: When the record was created

- **Player Statistics**:
  - `player_count`: Total number of players in the room
  - `completed_player_count`: Number of players who completed the game

- **Time Measurements**:
  - `completion_duration`: Time from room start to completion
  - `fastest_player_completion`: Fastest individual player completion time
  - `slowest_player_completion`: Slowest individual player completion time

- **Financial Statistics**:
  - `average_player_balance`: Average final balance across all players
  - `highest_player_balance`: Highest final balance among players
  - `lowest_player_balance`: Lowest final balance among players

- **Additional Data**:
  - `metadata`: JSON object with additional room data (name, min/max players, etc.)

### 2. Database Trigger

The schema includes an automatic trigger that fires whenever a game room is marked as completed. This trigger:

1. Collects statistics from players in the room
2. Calculates aggregated metrics
3. Creates a comprehensive room completion record

### 3. Helper Function

The `get_room_completion_stats` function provides an easy way to retrieve detailed completion statistics for a specific room, including player-level results.

## How It Works

1. **Automatic Data Collection**: When a room is marked as completed (either by setting `status = 'completed'` or `all_players_completed = true`), the trigger automatically creates a detailed completion record.

2. **No Changes to Existing Code**: This schema works alongside your existing system without requiring any code changes. The current game flow continues to operate exactly as before.

3. **Rich Analytics**: The schema captures comprehensive statistics about game completions, which can be used for:
   - Performance analytics
   - Player behavior analysis
   - Game balance evaluation
   - Historical tracking

## How to Use

### Retrieving Completion Data

To retrieve detailed statistics for a completed room:

```sql
SELECT * FROM get_room_completion_stats('room-uuid-here');
```

This returns comprehensive data about the room completion and all players' results.

### Simple Queries

For basic reporting:

```sql
-- Get all room completions
SELECT * FROM room_completions;

-- Get average completion duration across all rooms
SELECT AVG(completion_duration) FROM room_completions;

-- Find rooms where all players completed the game
SELECT * FROM room_completions WHERE all_players_completed = true;

-- Find top 10 rooms by average player balance
SELECT room_id, average_player_balance 
FROM room_completions 
ORDER BY average_player_balance DESC 
LIMIT 10;
```

## Integration

This schema works automatically without requiring any changes to your application code. The trigger handles all data collection and storage in the background whenever a room is completed.

If you want to explicitly access the completion data in your application, you can query the `room_completions` table or use the `get_room_completion_stats` function. 