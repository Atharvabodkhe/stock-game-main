# Database Update Instructions

To update the Supabase database with the new Indian stocks, follow these steps:

1. Log in to your Supabase dashboard
2. Navigate to the SQL Editor
3. Create a new query
4. Copy and paste the following SQL:

```sql
-- First, delete all existing stocks
DELETE FROM level_stocks;
DELETE FROM stocks;

-- Insert the 6 new stocks
INSERT INTO stocks (name, price) VALUES 
('Reliance Industries', 2500),
('Tata Motors', 600),
('HDFC Bank', 1500),
('Infosys', 1400),
('Adani Enterprises', 2000),
('Zomato', 100);

-- Insert level data for each stock (10 levels, 6 stocks)
-- Level 1 (index 0) - Same as initial prices
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(0, 'Reliance Industries', 2500),
(0, 'Tata Motors', 600),
(0, 'HDFC Bank', 1500),
(0, 'Infosys', 1400),
(0, 'Adani Enterprises', 2000),
(0, 'Zomato', 100);

-- Level 2 (index 1) - Slight price changes
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(1, 'Reliance Industries', 2550),
(1, 'Tata Motors', 620),
(1, 'HDFC Bank', 1520),
(1, 'Infosys', 1380),
(1, 'Adani Enterprises', 2050),
(1, 'Zomato', 105);

-- Level 3 (index 2)
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(2, 'Reliance Industries', 2600),
(2, 'Tata Motors', 640),
(2, 'HDFC Bank', 1550),
(2, 'Infosys', 1420),
(2, 'Adani Enterprises', 1950),
(2, 'Zomato', 110);

-- Level 4 (index 3)
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(3, 'Reliance Industries', 2650),
(3, 'Tata Motors', 630),
(3, 'HDFC Bank', 1570),
(3, 'Infosys', 1450),
(3, 'Adani Enterprises', 2100),
(3, 'Zomato', 108);

-- Level 5 (index 4)
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(4, 'Reliance Industries', 2700),
(4, 'Tata Motors', 650),
(4, 'HDFC Bank', 1600),
(4, 'Infosys', 1500),
(4, 'Adani Enterprises', 2150),
(4, 'Zomato', 115);

-- Level 6 (index 5)
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(5, 'Reliance Industries', 2750),
(5, 'Tata Motors', 670),
(5, 'HDFC Bank', 1620),
(5, 'Infosys', 1480),
(5, 'Adani Enterprises', 2200),
(5, 'Zomato', 120);

-- Level 7 (index 6)
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(6, 'Reliance Industries', 2800),
(6, 'Tata Motors', 690),
(6, 'HDFC Bank', 1650),
(6, 'Infosys', 1520),
(6, 'Adani Enterprises', 2250),
(6, 'Zomato', 125);

-- Level 8 (index 7)
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(7, 'Reliance Industries', 2850),
(7, 'Tata Motors', 710),
(7, 'HDFC Bank', 1680),
(7, 'Infosys', 1550),
(7, 'Adani Enterprises', 2300),
(7, 'Zomato', 130);

-- Level 9 (index 8)
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(8, 'Reliance Industries', 2900),
(8, 'Tata Motors', 730),
(8, 'HDFC Bank', 1710),
(8, 'Infosys', 1580),
(8, 'Adani Enterprises', 2350),
(8, 'Zomato', 135);

-- Level 10 (index 9)
INSERT INTO level_stocks (level, stock_name, price) VALUES 
(9, 'Reliance Industries', 2950),
(9, 'Tata Motors', 750),
(9, 'HDFC Bank', 1750),
(9, 'Infosys', 1600),
(9, 'Adani Enterprises', 2400),
(9, 'Zomato', 140);
```

5. Execute the query
6. Verify that the stocks table contains the 6 new stocks by running:

```sql
SELECT * FROM stocks;
```

7. Verify that the level_stocks table contains the new stock data for all levels by running:

```sql
SELECT level, stock_name, price FROM level_stocks ORDER BY level, stock_name;
```

After completing these steps, restart your application to ensure it loads the new stock data from the database. 