# Game Data Repair Guide

This guide will help you fix issues with game data not being properly stored in the level-wise action tracking system. The repair process is non-invasive and won't affect any existing functionality.

## Problem

You may encounter one of these issues:
- You played a game but your actions aren't showing up in the level statistics
- The "Advanced Level Statistics" section is missing when viewing player reports
- Game actions are stored but not properly aggregated by level

## Solution

We've created a repair script that will:
1. Diagnose the root cause of the issue
2. Fix missing level values in existing actions
3. Synchronize data between game_sessions and the action tracking tables
4. Recreate any missing database triggers
5. Provide tools to verify the repair worked

## How to Run the Repair

### Step 1: Access your database

First, access your Supabase SQL Editor or database management tool.

### Step 2: Run the repair script

Copy and paste the entire contents of the `game_data_repair.sql` file into your SQL editor and execute it.

The script will:
- Run diagnostic checks to identify the issue
- Apply multiple fixes to ensure data integrity
- Report on what it found and fixed
- Automatically synchronize missing data from recent games

### Step 3: Verify the results

After running the script, you'll see several result sets:

1. Diagnostic results showing action counts before/after
2. A list of any games that are still missing action data
3. A summary of the synchronization process that was run

If you see your game in the list of games still missing data, you can fix it specifically by running:

```sql
SELECT fix_specific_result('your-result-id-uuid-here');
```

(Replace 'your-result-id-uuid-here' with the actual UUID from the results table)

### Step 4: Check the data in the Leaderboard

Return to the Admin Dashboard, find your completed game, and click "View Results" to see the Leaderboard. When you view a player report, you should now see:

1. A complete Trading Activity section showing actions grouped by level
2. The new Advanced Level Statistics section with detailed metrics
3. Level-based trading charts and visualizations

## Troubleshooting

If you still don't see level data after running the repair:

1. Check if your game has any trading actions:
   ```sql
   SELECT COUNT(*) FROM game_action WHERE result_id = 'your-result-id';
   ```

2. Verify trading history exists in the game session:
   ```sql
   SELECT trading_history FROM game_sessions 
   JOIN game_results ON game_sessions.id = game_results.session_id
   WHERE game_results.id = 'your-result-id';
   ```

3. If trading history exists but actions aren't imported, manually run:
   ```sql
   SELECT fix_specific_result('your-result-id');
   ```

4. If no trading history exists, you may need to add some test actions:
   ```sql
   SELECT add_test_game_action(
     'your-result-id',  -- UUID of the game result
     'buy',             -- action type: buy, sell, or hold
     'AAPL',            -- stock name
     150.25,            -- price
     10,                -- quantity
     1                  -- level (optional, defaults to 1)
   );
   ```

## Need More Help?

If you've followed these steps and still have issues, check the `log_events` table for any error messages:

```sql
SELECT * FROM log_events ORDER BY timestamp DESC LIMIT 10;
```

This will show the most recent diagnostic and repair attempts, which can help identify any underlying issues. 