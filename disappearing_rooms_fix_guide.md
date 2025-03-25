# Fix for Disappearing Rooms After Game Start

## Issue Description

When an admin creates a room and starts the game, the room disappears from the active rooms list in the Admin Dashboard. This is happening because of an issue with how the room status is being managed during the game start process.

## Root Cause

The Admin Dashboard uses this query to load active rooms:
```
.eq('status', 'open')
.or('status.eq.in_progress,all_players_completed.eq.false')
```

This means a room must meet one of these criteria to appear:
1. Status is 'open', OR
2. Status is 'in_progress' AND all_players_completed is FALSE

The issue occurs when a room is started and somehow gets `all_players_completed = TRUE` while still in progress, causing it to disappear from the dashboard.

## Solution

The fix implemented in `fix_disappearing_rooms.sql` addresses this by:

1. **Adding a preventive trigger** that ensures whenever a room changes to 'preparing' or 'in_progress' status, the `all_players_completed` flag is set to FALSE.

2. **Creating a fix function** that identifies and corrects any rooms with active game players that aren't visible in the dashboard due to incorrect status flags.

3. **Adding diagnostic tools** to help identify and troubleshoot any visibility issues in the future.

## How to Apply the Fix

1. Log in to your Supabase dashboard
2. Go to the SQL Editor
3. Copy the entire contents of `fix_disappearing_rooms.sql`
4. Run the script
5. Check the output to verify rooms are now properly visible

## Verifying the Fix

After applying the script, it will show a table of all rooms with their current visibility status. You should see:

- Rooms with in-game players marked as "Visible as In Progress Room"
- Open rooms marked as "Visible as Open Room"
- Completed rooms marked as "Visible in Completed Rooms"

## Fixing a Specific Room

If you know the ID of a specific room that has disappeared, you can use this command to fix it:

```sql
-- Replace with your room ID
SELECT make_room_visible('00000000-0000-0000-0000-000000000000');
```

This function will:
1. Analyze the current state of the room and its players
2. Apply the appropriate status update to make it visible again
3. Return a message confirming what action was taken

## Ongoing Monitoring

The script creates a view named `room_visibility_status` that you can query at any time to check the visibility of rooms:

```sql
-- View all rooms and their visibility status
SELECT * FROM room_visibility_status;

-- Find rooms that might not be visible
SELECT * FROM room_visibility_status WHERE visibility_status LIKE 'NOT VISIBLE%';

-- Find rooms with status inconsistencies
SELECT * FROM room_visibility_status WHERE status_consistency != 'OK';
```

## Notes

This fix:
- Does not change any existing functionality in the room_completions schema
- Does not modify any frontend code
- Only ensures that room status flags are correctly set to maintain visibility
- Is compatible with the previous fixes for room_completions integration 