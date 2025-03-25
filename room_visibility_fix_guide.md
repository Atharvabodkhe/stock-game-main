# Fixing Disappearing Game Rooms - Step-by-Step Guide

This guide will resolve the issue where rooms disappear from the "Game Rooms" section after clicking the Start button.

## The Root Cause

After careful analysis, we've identified the exact issue:

1. The query used to load rooms for the Admin Dashboard wasn't correctly filtering for visible rooms
2. The UI was looking for rooms where:
   - `status = 'open'` OR
   - (`status = 'in_progress'` AND `all_players_completed = FALSE`)
3. But the actual database query was structured incorrectly, causing in-progress rooms to disappear

## The Solution

Apply these two simple fixes:

### Step 1: Fix the Database State

1. Log in to your Supabase dashboard
2. Go to the SQL Editor
3. Copy and paste the contents of `fix_room_visibility_simple.sql`
4. Run the script

This will:
- Fix all existing in-progress rooms to make them visible
- Create a database trigger to keep rooms visible in the future

### Step 2: Fix the UI Query

1. Open `src/pages/AdminDashboard.tsx`
2. Find both `loadRooms` and `loadRoomsFast` functions
3. Replace the query filtering with this corrected version:
   ```typescript
   .or('status.eq.open,and(status.eq.in_progress,all_players_completed.eq.false)')
   ```
   Instead of:
   ```typescript
   .eq('status', 'open')
   .or('status.eq.in_progress,all_players_completed.eq.false')
   ```

## Testing the Fix

1. Apply both fixes
2. Create a new room in the Admin Dashboard
3. Add players
4. Click Start Game
5. The room should now remain visible in the Game Rooms section

## Why This Works

The original query had a syntax issue with how it expressed the OR condition. The new query correctly tells Supabase to:
- Show rooms where status is 'open', OR
- Show rooms where status is 'in_progress' AND all_players_completed is FALSE

Combined with the database triggers ensuring the correct flag values, this approach solves the issue without changing any other functionality. 