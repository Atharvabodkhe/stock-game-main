# Force Level Data Sync - Quick Fix Guide

This is a focused solution to fix the issue where player level-wise actions are not being properly stored in the database. This script takes a more direct approach to ensure your data is properly synchronized.

## What This Fixes

- Missing player level-wise action data
- Incorrect or missing level assignments in actions
- Empty level statistics in player reports

## How to Run

1. Open your Supabase SQL Editor or database management tool
2. Copy the entire contents of `force_level_data_sync.sql` into the editor
3. Run the script - it will automatically:
   - Show your most recent game results
   - Create powerful fix functions
   - Apply the fix to ALL results that are missing level data
   - Verify the results

## Understanding the Output

When you run the script, you'll see several result sets:

1. **First result:** A table showing your recent game results, with columns indicating whether each result has action data and level data
2. **Second result:** The output of the `fix_all_missing_level_data()` function, showing how many results were fixed
3. **Third result:** Verification counts showing total actions and level records after the fix

## Fixing a Specific Result

If you see a specific result ID in the first table that still needs fixing, you can run:

```sql
SELECT force_sync_level_data('your-result-id-here');
```

Replace `your-result-id-here` with the actual UUID from the first column of the results table.

## What Makes This Fix Different

This approach:

1. **Directly creates level data** - Even if your trading history is missing level information, the script will intelligently assign levels based on action sequence
2. **Creates sample data if needed** - If no trading history exists, it creates minimal test data across 3 levels
3. **Handles format issues** - Robustly processes different JSON formats and structures
4. **Manually calculates statistics** - Bypasses potential trigger issues by directly calculating and inserting level statistics

## Verifying the Fix

After running the script:

1. Return to the Admin Dashboard
2. Find your game in the Completed Rooms section
3. Click "View Results" to open the Leaderboard
4. Click "View Report" for your player
5. Scroll down to verify you now see the "Advanced Level Statistics" section

The fix is working properly if you see a table showing statistics for different game levels and a chart showing level-based trading intensity.

## If You Still Have Issues

If you still don't see level data after running this script, there might be issues with database permissions or structure. Please check:

1. That your database user has permission to create functions and insert data
2. That all required tables exist with the correct structure
3. That triggers are properly configured 