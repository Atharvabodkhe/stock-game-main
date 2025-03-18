-- GAME PAUSE FEATURE MIGRATION
-- Run this script in your Supabase SQL Editor to set up pause functionality

--------------------------------------------
-- STEP 1: CREATE GAME STATE TABLE
--------------------------------------------

-- Create game_state table to track global game state
CREATE TABLE IF NOT EXISTS public.game_state (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    is_paused BOOLEAN NOT NULL DEFAULT false,
    paused_at TIMESTAMP WITH TIME ZONE,
    resumed_at TIMESTAMP WITH TIME ZONE,
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_game_state_updated_at ON public.game_state;
CREATE TRIGGER update_game_state_updated_at
BEFORE UPDATE ON public.game_state
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

--------------------------------------------
-- STEP 2: SET SECURITY POLICIES
--------------------------------------------

-- Enable row-level security (RLS)
ALTER TABLE public.game_state ENABLE ROW LEVEL SECURITY;

-- Create policies for game_state
CREATE POLICY "Allow read for authenticated users"
ON public.game_state FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow update for admins"
ON public.game_state FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Allow insert for admins"
ON public.game_state FOR INSERT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

--------------------------------------------
-- STEP 3: ENABLE REALTIME
--------------------------------------------

-- Enable realtime for game_state table
COMMENT ON TABLE public.game_state IS 'schema_name="public",table_name="game_state"';

-- Add table to realtime publication if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_publication
        WHERE pubname = 'supabase_realtime'
    ) THEN
        -- Add table to the publication if not already included
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'game_state') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE game_state;
            RAISE NOTICE 'Added game_state table to supabase_realtime publication';
        END IF;
    ELSE
        RAISE NOTICE 'The supabase_realtime publication does not exist. Please make sure realtime is enabled in your Supabase project settings.';
    END IF;
END $$;

--------------------------------------------
-- STEP 4: INITIALIZE DATA
--------------------------------------------

-- Insert initial game state if not exists
INSERT INTO public.game_state (is_paused, updated_at)
SELECT false, NOW()
WHERE NOT EXISTS (SELECT 1 FROM public.game_state LIMIT 1);

--------------------------------------------
-- STEP 5: HELPER FUNCTIONS
--------------------------------------------

-- Create function to pause game
CREATE OR REPLACE FUNCTION pause_game(admin_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
    result BOOLEAN;
BEGIN
    -- Check if user is admin
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = admin_id
    ) INTO is_admin;
    
    IF NOT is_admin THEN
        RETURN false;
    END IF;
    
    -- Update game state to paused
    UPDATE public.game_state
    SET 
        is_paused = true,
        paused_at = NOW(),
        resumed_at = NULL,
        updated_by = admin_id
    WHERE id = (SELECT id FROM public.game_state LIMIT 1)
    RETURNING true INTO result;
    
    RETURN COALESCE(result, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to resume game
CREATE OR REPLACE FUNCTION resume_game(admin_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
    result BOOLEAN;
BEGIN
    -- Check if user is admin
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = admin_id
    ) INTO is_admin;
    
    IF NOT is_admin THEN
        RETURN false;
    END IF;
    
    -- Update game state to resumed
    UPDATE public.game_state
    SET 
        is_paused = false,
        resumed_at = NOW(),
        updated_by = admin_id
    WHERE id = (SELECT id FROM public.game_state LIMIT 1)
    RETURNING true INTO result;
    
    RETURN COALESCE(result, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 