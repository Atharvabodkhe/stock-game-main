# Game Pause Feature Guide

This guide explains how to set up the pause feature for the Stock Game, allowing admins to pause and resume games for all players in real-time.

## Overview

The pause feature allows admins to:
1. Pause the game from the Admin Dashboard
2. Resume the game when ready
3. Make stock and news updates while the game is paused

When the game is paused:
1. Players see a "Game Paused" overlay
2. The game timer stops
3. All player interactions (buy, sell, hold, next level) are disabled
4. Admin changes to stocks and news are still visible in real-time

## Implementation Steps

### Step 1: Run the Database Migration

1. Log in to your Supabase dashboard
2. Navigate to the **SQL Editor** section
3. Copy the entire contents of the `game-pause-migration.sql` file
4. Create a new query in the SQL Editor
5. Paste the migration script
6. Click "Run" to execute the script

The script will:
- Create a `game_state` table to track pause status
- Set up security policies for the table
- Add helper functions for pausing and resuming
- Initialize the table with an "active" (not paused) state
- Add the table to the realtime publication

### Step 2: Verify Migration Success

1. Go to the **Table Editor** in Supabase
2. Confirm that the `game_state` table was created
3. Check that it contains one row with `is_paused` set to `false`
4. Navigate to **Database** → **Functions** and verify that both `pause_game` and `resume_game` functions are present

### Step 3: Testing the Pause Feature

To test the pause feature:

1. Open the stock game in two browser windows:
   - Login as an admin in one window
   - Login as a player in the other window

2. In the player window:
   - Start a new game
   - Begin trading (buy/sell/hold)

3. In the admin window:
   - Navigate to the Admin Dashboard
   - Click the "Pause Game" button

4. Verify in the player window:
   - The "Game Paused" overlay appears
   - The timer stops
   - All action buttons are disabled

5. In the admin window:
   - Make a change to a stock price
   - Update the news for a level

6. Verify in the player window:
   - The stock price and news updates are reflected in real-time, even while paused

7. In the admin window:
   - Click the "Resume Game" button

8. Verify in the player window:
   - The pause overlay disappears
   - The timer resumes
   - Buttons become interactive again

## Troubleshooting

### Pause Button Not Working

If clicking the pause button has no effect:

1. Check browser console for errors
2. Verify that the admin user has the correct permissions
3. Ensure the `game_state` table is properly set up with the required fields
4. Check that realtime is enabled for the `game_state` table

### Paused State Not Syncing

If the pause state isn't syncing between admin and players:

1. Ensure the `game_state` table is included in the Supabase realtime publication
2. Check for any subscription errors in the browser console
3. Verify that the client is correctly subscribing to updates

### Timer Not Stopping When Paused

If the timer continues to run when the game is paused:

1. Check that the isPaused state is correctly being updated in the Game component
2. Ensure the timer effect in Game.tsx depends on the isPaused state
3. Verify that the timer interval is cleared when isPaused becomes true

## Technical Details

The pause feature works through:

1. A `game_state` table in Supabase that stores the current pause state
2. Realtime subscriptions that notify all clients when the state changes
3. Database functions (`pause_game` and `resume_game`) that can only be called by admins
4. UI modifications in both the Game and AdminDashboard components

The changes are minimal and do not affect existing game mechanics, only adding an overlay layer of control for administrators. 