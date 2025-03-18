-- STOCK GAME DATABASE MIGRATION SCRIPT
-- Run this script in your Supabase SQL Editor to set up all required tables

--------------------------------------------
-- STEP 1: CREATE REQUIRED TABLES
--------------------------------------------

-- Create stocks table
CREATE TABLE IF NOT EXISTS public.stocks (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create level_stocks table
CREATE TABLE IF NOT EXISTS public.level_stocks (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    level INTEGER NOT NULL,
    stock_name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_level_stock UNIQUE (level, stock_name)
);

-- Create news table
CREATE TABLE IF NOT EXISTS public.news (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    level INTEGER NOT NULL UNIQUE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

--------------------------------------------
-- STEP 2: CREATE TRIGGER FOR UPDATED_AT
--------------------------------------------

-- Create function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for each table
DROP TRIGGER IF EXISTS update_stocks_updated_at ON public.stocks;
CREATE TRIGGER update_stocks_updated_at
BEFORE UPDATE ON public.stocks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_level_stocks_updated_at ON public.level_stocks;
CREATE TRIGGER update_level_stocks_updated_at
BEFORE UPDATE ON public.level_stocks
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_news_updated_at ON public.news;
CREATE TRIGGER update_news_updated_at
BEFORE UPDATE ON public.news
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

--------------------------------------------
-- STEP 3: SECURITY POLICIES
--------------------------------------------

-- Enable row-level security (RLS)
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users and admins
-- Stocks policies
CREATE POLICY "Allow read for authenticated users"
ON public.stocks FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow insert for admins"
ON public.stocks FOR INSERT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Allow update for admins"
ON public.stocks FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

-- Level stocks policies
CREATE POLICY "Allow read for authenticated users"
ON public.level_stocks FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow insert for admins"
ON public.level_stocks FOR INSERT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Allow update for admins"
ON public.level_stocks FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

-- News policies
CREATE POLICY "Allow read for authenticated users"
ON public.news FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow insert for admins"
ON public.news FOR INSERT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Allow update for admins"
ON public.news FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

--------------------------------------------
-- STEP 4: ENABLE REALTIME
--------------------------------------------

-- Enable realtime for these tables
COMMENT ON TABLE public.stocks IS 'schema_name="public",table_name="stocks"';
COMMENT ON TABLE public.level_stocks IS 'schema_name="public",table_name="level_stocks"';
COMMENT ON TABLE public.news IS 'schema_name="public",table_name="news"';

--------------------------------------------
-- STEP 5: INITIALIZE DATA
--------------------------------------------

-- Make sure we don't insert duplicate data
DO $$
BEGIN
    -- Only insert default data if tables are empty
    
    -- Initialize stocks if empty
    IF NOT EXISTS (SELECT 1 FROM public.stocks LIMIT 1) THEN
        INSERT INTO public.stocks (name, price)
        VALUES
            ('TECH Corp', 100.00),
            ('GREEN Energy', 75.00),
            ('HEALTH Plus', 50.00);
    END IF;
    
    -- Initialize level stocks if empty
    IF NOT EXISTS (SELECT 1 FROM public.level_stocks LIMIT 1) THEN
        -- Create level 0 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (0, 'TECH Corp', 100.00),
            (0, 'GREEN Energy', 75.00),
            (0, 'HEALTH Plus', 50.00);
            
        -- Create level 1 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (1, 'TECH Corp', 105.00),
            (1, 'GREEN Energy', 78.00),
            (1, 'HEALTH Plus', 52.00);
            
        -- Create level 2 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (2, 'TECH Corp', 110.00),
            (2, 'GREEN Energy', 80.00),
            (2, 'HEALTH Plus', 55.00);
            
        -- Create level 3 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (3, 'TECH Corp', 108.00),
            (3, 'GREEN Energy', 85.00),
            (3, 'HEALTH Plus', 58.00);
            
        -- Create level 4 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (4, 'TECH Corp', 112.00),
            (4, 'GREEN Energy', 82.00),
            (4, 'HEALTH Plus', 60.00);
            
        -- Create level 5 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (5, 'TECH Corp', 120.00),
            (5, 'GREEN Energy', 88.00),
            (5, 'HEALTH Plus', 62.00);
            
        -- Create level 6 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (6, 'TECH Corp', 125.00),
            (6, 'GREEN Energy', 92.00),
            (6, 'HEALTH Plus', 65.00);
            
        -- Create level 7 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (7, 'TECH Corp', 130.00),
            (7, 'GREEN Energy', 95.00),
            (7, 'HEALTH Plus', 68.00);
            
        -- Create level 8 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (8, 'TECH Corp', 135.00),
            (8, 'GREEN Energy', 98.00),
            (8, 'HEALTH Plus', 70.00);
            
        -- Create level 9 stocks
        INSERT INTO public.level_stocks (level, stock_name, price)
        VALUES
            (9, 'TECH Corp', 140.00),
            (9, 'GREEN Energy', 100.00),
            (9, 'HEALTH Plus', 75.00);
    END IF;
    
    -- Initialize news if empty
    IF NOT EXISTS (SELECT 1 FROM public.news LIMIT 1) THEN
        INSERT INTO public.news (level, content)
        VALUES
            (0, 'Breaking: TECH Corp announces revolutionary quantum computing breakthrough, market anticipates major shift'),
            (1, 'GREEN Energy secures massive government contract for renewable infrastructure'),
            (2, 'HEALTH Plus releases promising clinical trial results for new treatment'),
            (3, 'Market volatility increases as global economic tensions rise'),
            (4, 'Tech sector faces regulatory challenges in key markets'),
            (5, 'Renewable energy sector receives major investment boost'),
            (6, 'Healthcare companies see surge in demand for innovative solutions'),
            (7, 'Market analysts predict significant shifts in tech valuations'),
            (8, 'Energy sector transformation accelerates amid policy changes'),
            (9, 'Healthcare innovation drives market optimism in final trading session');
    END IF;
    
END $$;

--------------------------------------------
-- STEP 6: CHECK PUBLICATION STATUS
--------------------------------------------

-- Check if publication exists
DO $$
DECLARE
    publication_exists boolean;
BEGIN
    SELECT EXISTS(
        SELECT 1
        FROM pg_publication
        WHERE pubname = 'supabase_realtime'
    ) INTO publication_exists;

    IF publication_exists THEN
        -- Add tables to the publication if they aren't already included
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stocks') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE stocks;
            RAISE NOTICE 'Added stocks table to supabase_realtime publication';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'level_stocks') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE level_stocks;
            RAISE NOTICE 'Added level_stocks table to supabase_realtime publication';
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'news') THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE news;
            RAISE NOTICE 'Added news table to supabase_realtime publication';
        END IF;
    ELSE
        RAISE NOTICE 'The supabase_realtime publication does not exist. Please make sure realtime is enabled in your Supabase project settings.';
    END IF;
END $$; 