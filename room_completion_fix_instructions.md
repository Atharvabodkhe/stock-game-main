# Room Completion Functionality Fix

This document provides instructions on how to fix the room completion functionality in your stock-game application. The fix ensures that all three required components are properly implemented and working together:

1. The statistics function (`get_room_completion_status`)
2. The trigger function (`check_room_completion`)
3. The trigger definition that runs automatically when player status changes

## Issue Being Fixed

The current implementation of room completion tracking has an issue where the last player's completion status is not correctly updating the room status and other player statuses. This fix ensures that:

- When a player is marked as completed, the system checks if all players in the room are now completed
- If all players are completed, the room is automatically marked as completed
- The admin dashboard can query room completion status accurately

## How to Apply the Fix

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy and paste the entire contents of the `fix_room_completion.sql` file into the SQL Editor
4. Run the SQL script by clicking the "Run" button
5. The script will:
   - Create or replace the `get_room_completion_status` function
   - Create or replace the `check_room_completion` trigger function
   - Set up the trigger to run automatically when player status changes
   - Create or replace the `force_check_room_completion` function for manual use

## Testing the Fix

After applying the fix, you can test it using these SQL commands:

```sql
-- Test the get_room_completion_status function with an active room
-- Replace 'your-room-id-here' with an actual room ID from your database
SELECT * FROM get_room_completion_status('your-room-id-here');

-- You can also force check a room's completion status with:
SELECT force_check_room_completion('your-room-id-here');
```

## Component Details

### 1. Statistics Function (`get_room_completion_status`)

This function allows querying room completion data when needed. It returns:
- The total number of players in the room (excluding those who left)
- The number of players who have completed the game
- Whether the room is marked as completed
- The completion timestamp if the room is completed

### 2. Trigger Function (`check_room_completion`)

This function contains the logic to detect when all players have completed the game. It:
- Counts the total number of active players in a room
- Counts how many players are marked as completed
- If all players are completed, it marks the room as completed
- Updates any inconsistent player statuses

### 3. Trigger Definition

This ensures the function runs automatically when player status changes:
```sql
CREATE TRIGGER check_room_completion_trigger
AFTER UPDATE OR INSERT
ON room_players
FOR EACH ROW
EXECUTE FUNCTION check_room_completion();
```

The trigger activates after any insert or update to the `room_players` table, ensuring that room completion is checked whenever a player's status changes.

## Manual Room Completion Check

The `force_check_room_completion` function allows you to manually check and update a room's completion status. This is useful for:
- Fixing inconsistent data
- Testing the completion logic
- Manually triggering completion checks for debugging

## No Application Code Changes Required

This fix only updates the database functions and does not require any changes to your application code. 