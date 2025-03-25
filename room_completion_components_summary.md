# Room Completion Components Summary

## Overview

The room completion functionality in your stock-game application consists of three main components that work together to ensure accurate tracking of game completion:

## 1. Statistics Function: `get_room_completion_status`

This function provides a way to query room completion data when needed.

### Function Signature
```sql
CREATE OR REPLACE FUNCTION get_room_completion_status(room_id UUID)
RETURNS TABLE (
    total_players INTEGER,
    completed_players INTEGER,
    is_completed BOOLEAN,
    completion_time TIMESTAMP WITH TIME ZONE
)
```

### What It Does
- Takes a room ID as input
- Returns a table with information about room completion status:
  - `total_players`: Number of active players in the room (excluding those who left)
  - `completed_players`: Number of players who have completed the game
  - `is_completed`: Boolean indicating if the room is marked as completed
  - `completion_time`: Timestamp when the room was marked as completed (if applicable)

### How It Works
- Joins the `game_rooms` and `room_players` tables
- Filters by the provided room ID
- Counts players in different states
- Returns the aggregated information

### When It's Used
- Called from the Admin Dashboard to check room completion status
- Used in administrative functions to verify if a room should be marked as completed
- Can be manually called for debugging or data analysis

## 2. Trigger Function: `check_room_completion`

This function contains the actual logic to detect when all players have completed a game and should mark the room as completed.

### Function Signature
```sql
CREATE OR REPLACE FUNCTION check_room_completion()
RETURNS TRIGGER
```

### What It Does
- Runs automatically when player statuses change
- Checks if all players in a room have completed the game
- If all players have completed, marks the room as completed
- Updates any inconsistent player statuses

### How It Works
1. Gets the room ID from the inserted or updated record
2. Counts the total number of active players (excluding left players)
3. Counts the number of players marked as completed
4. If all active players are completed:
   - Updates the room status to 'completed'
   - Sets `all_players_completed` to TRUE
   - Records the completion time
   - Ensures all players in the room are marked as completed

### Key Enhancements
- Includes console logging for better debugging
- Updates all player statuses when a room is marked as completed
- Uses direct database queries for accurate counts

## 3. Trigger Definition

The trigger definition ensures the `check_room_completion` function runs automatically when player statuses change.

### Trigger Definition
```sql
CREATE TRIGGER check_room_completion_trigger
AFTER UPDATE OR INSERT
ON room_players
FOR EACH ROW
EXECUTE FUNCTION check_room_completion();
```

### What It Does
- Monitors the `room_players` table for changes
- Activates after any insert or update operation
- Executes the `check_room_completion` function for each affected row

### How It Works
- When a player's status changes (like completing a game), the trigger fires
- The trigger runs the `check_room_completion` function with the updated data
- This ensures that room completion is checked automatically whenever player statuses change

### Key Points
- Runs for both INSERT and UPDATE operations
- Works at the row level (FOR EACH ROW)
- Automatically applies the completion logic without requiring manual intervention

## Additional Utility: `force_check_room_completion`

This function allows manually triggering a room completion check.

### Function Signature
```sql
CREATE OR REPLACE FUNCTION force_check_room_completion(room_id_param UUID)
RETURNS BOOLEAN
```

### What It Does
- Takes a room ID as input
- Manually checks if all players in the room have completed the game
- Updates room status if necessary
- Returns TRUE if the operation was successful, FALSE otherwise

### How It Works
1. Locks the room record to prevent concurrent updates
2. Checks if the room is already marked as completed
3. Counts players in different statuses
4. If all active players are completed:
   - Updates the room status to 'completed'
   - Ensures all players are marked as completed
   - Updates related game sessions

### When It's Used
- Called manually for fixing inconsistent data
- Used by administrative functions to force a completion check
- Called after batch operations that might affect room completion status

## Interaction Between Components

1. When a player completes a game:
   - Their status is updated to 'completed' in the `room_players` table
   - This triggers the `check_room_completion` function via the trigger
   - The function checks if all players are now completed
   - If so, it marks the room as completed

2. The Admin Dashboard:
   - Uses `get_room_completion_status` to display accurate completion information
   - May use `force_check_room_completion` for manual updates
   - Shows room and player statuses based on the data maintained by these functions

This integrated system ensures that room completion is tracked accurately and automatically, with manual intervention options when needed. 