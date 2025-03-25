# Room Completions Dashboard Troubleshooting Guide

This guide provides solutions to common issues with the display of completed rooms in the Admin Dashboard.

## Quick Fix Application

1. Log in to your Supabase dashboard
2. Go to the SQL Editor
3. Copy the entire contents of `fetch_completed_rooms_fix.sql`
4. Run the script
5. Check the output to verify the fixes were successful

## Common Issues and Solutions

### 1. Completed Rooms Not Showing in Dashboard

**Symptoms:**
- The Admin Dashboard shows no completed rooms despite rooms being completed
- The "Show Completed Rooms" button doesn't reveal any rooms

**Solution:**
- Run the `fetch_completed_rooms_fix.sql` script to ensure all completed rooms are properly transferred to the `room_completions` table
- The script fixes the `get_completed_rooms_with_players()` function that the dashboard uses to display completed rooms
- It also backfills any completed rooms that weren't properly tracked

### 2. Missing Player Data in Completed Rooms

**Symptoms:**
- Completed rooms appear but show "Unknown" for player names
- Player counts appear incorrect

**Solution:**
- The fix script includes improvements to handle missing player data
- For rooms with specific issues, you can use the `force_room_completion()` function:

```sql
-- Replace with your room ID
SELECT force_room_completion('00000000-0000-0000-0000-000000000000');
```

### 3. Inconsistent Room Status

**Symptoms:**
- Rooms appear in both active and completed sections
- Some completed rooms don't show with the "completed" status

**Solution:**
- The fix script includes status consistency updates to ensure rooms are properly flagged
- It forces all rooms in `room_completions` to have `status = 'completed'` and `all_players_completed = TRUE`

### 4. Manual Room Completion

If you need to manually move a room to completed status and ensure it appears in the dashboard:

```sql
-- Replace with the actual room ID
SELECT force_room_completion('00000000-0000-0000-0000-000000000000');
```

This function:
1. Marks the room as completed in the `game_rooms` table
2. Adds it to the `room_completions` table with proper metrics
3. Returns `TRUE` if successful

### 5. Verifying Dashboard Display

To quickly check which rooms will appear in the dashboard:

```sql
-- Count rooms that will show in the Admin Dashboard
SELECT COUNT(*) FROM get_completed_rooms_with_players();

-- Show sample data of rooms that will appear
SELECT 
    (json_array_elements(get_completed_rooms_with_players()))->>'name' as room_name,
    (json_array_elements(get_completed_rooms_with_players()))->>'completion_time' as completed_at
LIMIT 5;
```

## Data Consistency Check

To verify data consistency between `game_rooms` and `room_completions`:

```sql
-- Count completed rooms in game_rooms
SELECT COUNT(*) FROM game_rooms WHERE status = 'completed';

-- Count rooms in room_completions
SELECT COUNT(*) FROM room_completions;

-- These counts should match
```

## Need Additional Help?

If issues persist after applying these fixes, the specific problem may be:

1. **Database permissions**: Ensure the authenticated role has SELECT permission on `room_completions`
2. **UI refresh**: Try clearing browser cache or force-refreshing the Admin Dashboard
3. **Data corruption**: Use the verification scripts to identify any corrupted data

For persistent issues, you can implement direct debugging in the Admin Dashboard by adding console logs to the room loading function. 