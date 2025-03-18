# Stock Game Supabase Migration Guide

This guide explains how to set up the stock game with real-time data from Supabase. The changes will allow admins to modify stock prices and news in real-time while players are playing the game.

## Migration Steps

### Step 1: Run the Migration Script

1. Log in to your Supabase dashboard
2. Navigate to the **SQL Editor** section
3. Copy the entire contents of the `stock-game-migration.sql` file
4. Create a new query in the SQL Editor
5. Paste the migration script
6. Click "Run" to execute the script

The script will:
- Create all necessary tables (`stocks`, `level_stocks`, `news`)
- Set up triggers to update timestamps
- Configure security policies
- Initialize default data
- Add the tables to the realtime publication

### Step 2: Verify Table Creation

After running the script, verify that the tables were created successfully:

1. Go to the **Table Editor** in your Supabase dashboard
2. You should see the following new tables:
   - `stocks`
   - `level_stocks`
   - `news`
3. Verify that each table contains the initial data

### Step 3: Check Realtime Configuration

1. Navigate to **Database** → **Replication** in your Supabase dashboard
2. Ensure that the supabase_realtime publication exists and includes the tables:
   - `stocks`
   - `level_stocks`
   - `news`
3. If the tables are not included, add them manually to the publication

### Step 4: Ensure Admin Access

Make sure your admin user has proper access to update the stock data:

1. Check if the `admin_users` table exists in your database
2. If it doesn't exist, create it:

```sql
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins can view admin_users"
ON public.admin_users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);
```

3. Add your user to the admin_users table:

```sql
-- Replace YOUR_AUTH_USER_ID with your Supabase user ID
INSERT INTO public.admin_users (user_id)
VALUES ('YOUR_AUTH_USER_ID');
```

## Testing the Integration

1. Launch your stock game application
2. Log in with an admin account in one browser window
3. Log in with a regular user account in another browser window
4. Start a game as the regular user
5. In the admin window, navigate to the Admin Dashboard
6. Update a stock price or news item
7. Verify that the changes appear immediately in the game window without requiring a refresh

## Common Issues and Troubleshooting

### Realtime Updates Not Working

If updates aren't appearing in real-time:

1. Check your browser console for any errors
2. Verify that the tables are properly added to the supabase_realtime publication
3. Ensure that your RLS policies are correctly configured
4. Check if your client is properly connected to the realtime service

### Admin Cannot Update Stocks

If admins cannot update stocks:

1. Verify that the user is properly added to the admin_users table
2. Check the RLS policies to ensure they're correctly configured
3. Look for any errors in the browser console when trying to update stocks

### Data Not Loading in Game

If the game isn't loading stock data:

1. Check if the tables contain the necessary data
2. Verify that the fetchInitialData function in gameStore.ts is being called
3. Check for any errors in the browser console during data fetching

## Maintenance

The application is now set up to automatically:

1. Load stock data from Supabase at startup
2. Subscribe to real-time updates for stocks, level stocks, and news
3. Update the UI whenever changes occur to any of these tables

If you need to add new stocks or change the defaults, you can modify them directly in the database, or update the initial values in the gameStore.ts file and AdminDashboard.tsx's initialization function. 