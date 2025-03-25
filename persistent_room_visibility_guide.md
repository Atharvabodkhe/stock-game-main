# Fixing Disappearing Game Rooms in Admin Dashboard

## Problem Description

Administrators are currently experiencing an issue where game rooms disappear from the Admin Dashboard after the admin creates a room and starts a game. This causes confusion as it appears the room has been deleted when in fact it's still active with players in the game.

## Root Cause Analysis

The issue occurs because:

1. The Admin Dashboard only shows rooms that match specific criteria:
   - Either `status = 'open'` OR
   - `status = 'in_progress' AND all_players_completed = FALSE`

2. When a game is started, a series of status changes occur:
   - The room status is set to "preparing"
   - Then player statuses are updated to "in_game"
   - Finally, the room status is set to "in_progress"

3. During this process, due to race conditions or database trigger conflicts, the `all_players_completed` flag might incorrectly be set to `TRUE` when it should be `FALSE`. When this happens, the room disappears from the active rooms list in the Admin Dashboard.

## Fix Description

Our fix implements multiple layers of protection to ensure rooms remain visible in the Admin Dashboard until they are truly completed:

1. **Enhanced Room Status Trigger** - Ensures rooms with in-game players always have:
   - `status = 'in_progress'`
   - `all_players_completed = FALSE`

2. **Player Status Change Protection** - When players change status to "in_game", the room is forced to be visible in the dashboard.

3. **Automatic Validation Functions** - Detects and fixes inconsistencies in room and player statuses automatically.

4. **Manual Recovery Functions** - Provides tools to fix specific rooms that might have disappeared.

## How to Apply the Fix

Follow these steps to implement the fix:

1. Log in to your Supabase dashboard at https://app.supabase.com

2. Navigate to the SQL Editor section

3. Copy the entire contents of the `fix_persistent_room_visibility.sql` script

4. Paste the script into the SQL Editor and run it

5. Check the output to verify rooms have been fixed and are now visible

The script will automatically:
- Fix any existing rooms with visibility issues
- Install triggers to prevent future visibility problems
- Provide diagnostic tools to help identify and troubleshoot any remaining issues

## Verifying the Fix

After applying the fix:

1. **Check the diagnostic output** - The SQL script will display a table showing all rooms and their visibility status

2. **Verify active rooms** - Any rooms with players in "in_game" status should show a visibility status of "Visible in Active Rooms (In Progress)"

3. **Test the fix** - Create a new room, add players, and start the game. The room should remain visible in the Admin Dashboard

## Fixing Specific Rooms

If you know the ID of a specific room that has disappeared, you can run this command to force it to be visible:

```sql
-- Replace with your room's UUID
SELECT force_room_visibility('00000000-0000-0000-0000-000000000000');
```

## Ongoing Maintenance

The fix includes a maintenance function that can be run manually anytime to ensure all rooms are correctly visible:

```sql
SELECT maintain_room_visibility();
```

For continuous monitoring, you can check the visibility status of all rooms with:

```sql
SELECT * FROM room_visibility_detailed_status;
```

## Important Notes

- This fix preserves all existing functionality, including the `room_completions` schema
- No changes to the frontend code are required
- The fix works by ensuring database state accurately reflects the actual game and player statuses
- Rooms will automatically move to the "Completed Rooms" section only when all players have truly completed the game 