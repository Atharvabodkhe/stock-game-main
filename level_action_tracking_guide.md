# Level-wise Action Tracking System

This guide explains the new level-wise action tracking system that stores and analyzes player actions at each game level.

## Overview

The system enables tracking and analysis of player actions on a per-level basis, providing insights into how players behave at different stages of the game. The implementation includes:

1. A new database table (`player_level_actions`) to store aggregated action data
2. Database functions and triggers for automatic data collection
3. Integration with the existing Leaderboard interface

## Database Schema

### New Table: `player_level_actions`

This table stores aggregated statistics for each player at each game level:

| Column            | Type    | Description                              |
|-------------------|---------|------------------------------------------|
| id                | UUID    | Primary key                              |
| room_id           | UUID    | Reference to game room                   |
| user_id           | UUID    | Reference to user                        |
| result_id         | UUID    | Reference to game result                 |
| level             | INTEGER | Game level number                        |
| buy_count         | INTEGER | Number of buy actions at this level      |
| sell_count        | INTEGER | Number of sell actions at this level     |
| hold_count        | INTEGER | Number of hold actions at this level     |
| total_trades      | INTEGER | Total number of actions at this level    |
| avg_buy_price     | NUMERIC | Average buy price at this level          |
| avg_sell_price    | NUMERIC | Average sell price at this level         |
| total_buy_quantity| INTEGER | Total quantity bought at this level      |
| total_sell_quantity| INTEGER| Total quantity sold at this level        |
| created_at        | TIMESTAMP| Creation timestamp                      |

### Key Database Functions

1. `populate_player_level_actions()` - Aggregates existing data into the new table
2. `get_player_level_actions(room_id)` - Gets all players' level data for a room
3. `get_player_result_level_actions(result_id)` - Gets level data for a specific player
4. `get_level_actions_json(result_id)` - Gets JSON-formatted level data for frontend
5. `migrate_existing_game_actions()` - Migrates existing data to the new structure

## Using The System

### Setup

1. Run the SQL script to create the database structures:
   ```sql
   -- From your database management tool, run:
   \i level_actions_schema.sql
   ```

2. Migrate existing action data:
   ```sql
   SELECT migrate_existing_game_actions();
   ```

### Querying Level Data

To view level-wise actions for all players in a room:
```sql
SELECT * FROM get_player_level_actions('your-room-id');
```

To view level-wise actions for a specific player result:
```sql
SELECT * FROM get_player_result_level_actions('player-result-id');
```

To get JSON-formatted data (similar to what the frontend uses):
```sql
SELECT get_level_actions_json('player-result-id');
```

### Automatic Data Collection

The system automatically collects level data when:
1. New actions are recorded via the `game_action` table (trigger-based)
2. Existing actions are processed via the migration function

## Frontend Integration

The Leaderboard component now includes:
- A new data fetching function `fetchLevelActionData(resultId)`
- Integration with existing player reports
- Automatic level-wise data retrieval when viewing reports

## Data Analysis Possibilities

With this new system, you can:
1. Compare player behavior across different game levels
2. Identify patterns in how strategies evolve throughout the game
3. Determine which levels cause the most buy/sell/hold decisions
4. Calculate performance metrics by level (e.g., profit per level)

## Troubleshooting

If level data isn't appearing:
1. Verify the data exists in the `game_action` table with valid level values
2. Run the migration function: `SELECT migrate_existing_game_actions();`
3. Check for errors in the database logs
4. Ensure the player has completed at least one action in the game

## Technical Notes

- The system leverages PostgreSQL's aggregation and JSON functions
- Database triggers ensure data is always up-to-date
- The implementation minimizes redundant storage while maximizing query performance
- All existing functionality remains unchanged 