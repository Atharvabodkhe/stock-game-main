-- Create stocks table
CREATE TABLE IF NOT EXISTS public.stocks (
    id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
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

CREATE POLICY "Allow update for admins"
ON public.news FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  )
);

-- Enable realtime for these tables
COMMENT ON TABLE public.stocks IS 'schema_name="public",table_name="stocks"';
COMMENT ON TABLE public.level_stocks IS 'schema_name="public",table_name="level_stocks"';
COMMENT ON TABLE public.news IS 'schema_name="public",table_name="news"'; 