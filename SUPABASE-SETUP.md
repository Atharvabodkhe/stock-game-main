# Supabase Setup for Stock Game

This guide explains how to set up the necessary database tables in Supabase to enable real-time stock and news data for the Stock Game.

## Required Tables

The application needs three new tables:
1. `stocks` - Stores the current stock information
2. `level_stocks` - Stores stock prices for each game level
3. `news` - Stores news items for each game level

## Setup Steps

### 1. Run SQL Script

In the Supabase dashboard, navigate to the SQL Editor and run the SQL script provided in the `supabase-setup.sql` file in this repository. This script will:

- Create the required tables
- Set up triggers to update timestamp columns
- Configure Row Level Security (RLS) policies
- Enable realtime subscriptions for the tables

### 2. Enable Realtime

Make sure realtime is enabled for your Supabase project:

1. Go to the Supabase dashboard
2. Navigate to Database → Replication
3. Ensure that the Publication includes the tables `stocks`, `level_stocks`, and `news`
4. If not present, add them to the publication

### 3. Set Up Admin Access

The application uses the `admin_users` table to determine who can modify stock prices and news. Make sure this table exists and has appropriate entries.

1. Create an admin user entry in the `admin_users` table for any user who should have admin access
2. Example query:
   ```sql
   INSERT INTO public.admin_users (user_id)
   VALUES ('your-auth-user-id');
   ```

## Data Initialization

The first time an admin logs into the application, it will automatically initialize the database with default stock and news data if the tables are empty.

## Realtime Updates

When an admin updates stock prices or news from the Admin Dashboard:

1. Changes are immediately saved to the Supabase database
2. Realtime subscriptions broadcast these changes to all active games
3. Players will see the updates in real-time without needing to refresh

## Troubleshooting

If realtime updates aren't working:

1. Check browser console for any subscription errors
2. Verify that the publication includes all required tables
3. Ensure RLS policies allow your users to read from these tables
4. Check that your Supabase client in the app has the correct configuration for realtime

## Testing Real-time Updates

To test that real-time updates are working correctly:

1. Open two browser windows or tabs
2. Log in as an admin in one window and as a regular user in the other
3. Start a game as the regular user
4. Use the admin dashboard to update stock prices or news
5. Verify that the changes appear in the player's game without refreshing 