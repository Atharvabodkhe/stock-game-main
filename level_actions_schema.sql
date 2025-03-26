-- This is a schema for storing player level-wise action data

-- Create a new table for storing level-wise action aggregations
CREATE TABLE IF NOT EXISTS player_level_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  user_id UUID NOT NULL,
  result_id UUID NOT NULL,
  level INTEGER NOT NULL,
  buy_count INTEGER DEFAULT 0,
  sell_count INTEGER DEFAULT 0,
  hold_count INTEGER DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  avg_buy_price NUMERIC(10,2) DEFAULT 0,
  avg_sell_price NUMERIC(10,2) DEFAULT 0,
  total_buy_quantity INTEGER DEFAULT 0,
  total_sell_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (result_id, level)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_player_level_actions_result_level 
ON player_level_actions (result_id, level);

CREATE INDEX IF NOT EXISTS idx_player_level_actions_room_user 
ON player_level_actions (room_id, user_id);

-- Function to populate the level-wise actions table from existing game_action data
CREATE OR REPLACE FUNCTION populate_player_level_actions()
RETURNS void AS $$
BEGIN
  -- Insert aggregated data by result_id and level
  INSERT INTO player_level_actions (
    room_id,
    user_id,
    result_id,
    level,
    buy_count,
    sell_count,
    hold_count,
    total_trades,
    avg_buy_price,
    avg_sell_price,
    total_buy_quantity,
    total_sell_quantity
  )
  SELECT 
    gr.room_id,
    gr.user_id,
    ga.result_id,
    ga.level,
    COUNT(*) FILTER (WHERE ga.action_type = 'buy') AS buy_count,
    COUNT(*) FILTER (WHERE ga.action_type = 'sell') AS sell_count,
    COUNT(*) FILTER (WHERE ga.action_type = 'hold') AS hold_count,
    COUNT(*) AS total_trades,
    CASE WHEN COUNT(*) FILTER (WHERE ga.action_type = 'buy') > 0 
         THEN AVG(ga.price) FILTER (WHERE ga.action_type = 'buy') 
         ELSE 0 END AS avg_buy_price,
    CASE WHEN COUNT(*) FILTER (WHERE ga.action_type = 'sell') > 0 
         THEN AVG(ga.price) FILTER (WHERE ga.action_type = 'sell') 
         ELSE 0 END AS avg_sell_price,
    COALESCE(SUM(ga.quantity) FILTER (WHERE ga.action_type = 'buy'), 0) AS total_buy_quantity,
    COALESCE(SUM(ga.quantity) FILTER (WHERE ga.action_type = 'sell'), 0) AS total_sell_quantity
  FROM 
    game_action ga
    JOIN game_results gr ON ga.result_id = gr.id
  GROUP BY 
    gr.room_id, gr.user_id, ga.result_id, ga.level
  ON CONFLICT (result_id, level) 
  DO UPDATE SET
    buy_count = EXCLUDED.buy_count,
    sell_count = EXCLUDED.sell_count,
    hold_count = EXCLUDED.hold_count,
    total_trades = EXCLUDED.total_trades,
    avg_buy_price = EXCLUDED.avg_buy_price,
    avg_sell_price = EXCLUDED.avg_sell_price,
    total_buy_quantity = EXCLUDED.total_buy_quantity,
    total_sell_quantity = EXCLUDED.total_sell_quantity;
END;
$$ LANGUAGE plpgsql;

-- Function to get player actions by level for a specific room
CREATE OR REPLACE FUNCTION get_player_level_actions(room_id_param UUID)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  result_id UUID,
  level INTEGER,
  buy_count INTEGER,
  sell_count INTEGER,
  hold_count INTEGER,
  total_trades INTEGER,
  avg_buy_price NUMERIC,
  avg_sell_price NUMERIC,
  final_balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pla.user_id,
    u.name AS user_name,
    pla.result_id,
    pla.level,
    pla.buy_count,
    pla.sell_count,
    pla.hold_count,
    pla.total_trades,
    pla.avg_buy_price,
    pla.avg_sell_price,
    gr.final_balance
  FROM 
    player_level_actions pla
    JOIN game_results gr ON pla.result_id = gr.id
    LEFT JOIN users u ON pla.user_id = u.id
  WHERE 
    pla.room_id = room_id_param
  ORDER BY 
    pla.user_id, pla.level;
END;
$$ LANGUAGE plpgsql;

-- Function to get level actions for a specific player result
CREATE OR REPLACE FUNCTION get_player_result_level_actions(result_id_param UUID)
RETURNS TABLE (
  level INTEGER,
  buy_count INTEGER,
  sell_count INTEGER,
  hold_count INTEGER,
  total_trades INTEGER,
  avg_buy_price NUMERIC,
  avg_sell_price NUMERIC,
  total_buy_quantity INTEGER,
  total_sell_quantity INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pla.level,
    pla.buy_count,
    pla.sell_count,
    pla.hold_count,
    pla.total_trades,
    pla.avg_buy_price,
    pla.avg_sell_price,
    pla.total_buy_quantity,
    pla.total_sell_quantity
  FROM 
    player_level_actions pla
  WHERE 
    pla.result_id = result_id_param
  ORDER BY 
    pla.level;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically update player_level_actions when new game_actions are added
CREATE OR REPLACE FUNCTION update_player_level_actions()
RETURNS TRIGGER AS $$
BEGIN
  -- Get room_id and user_id from game_results based on result_id
  WITH result_data AS (
    SELECT user_id, room_id FROM game_results WHERE id = NEW.result_id
  )
  INSERT INTO player_level_actions (
    room_id, 
    user_id,
    result_id, 
    level, 
    buy_count, 
    sell_count, 
    hold_count, 
    total_trades, 
    avg_buy_price, 
    avg_sell_price, 
    total_buy_quantity, 
    total_sell_quantity
  )
  SELECT 
    rd.room_id,
    rd.user_id,
    NEW.result_id, 
    NEW.level, 
    CASE WHEN NEW.action_type = 'buy' THEN 1 ELSE 0 END, 
    CASE WHEN NEW.action_type = 'sell' THEN 1 ELSE 0 END, 
    CASE WHEN NEW.action_type = 'hold' THEN 1 ELSE 0 END, 
    1, 
    CASE WHEN NEW.action_type = 'buy' THEN NEW.price ELSE 0 END,
    CASE WHEN NEW.action_type = 'sell' THEN NEW.price ELSE 0 END,
    CASE WHEN NEW.action_type = 'buy' THEN NEW.quantity ELSE 0 END,
    CASE WHEN NEW.action_type = 'sell' THEN NEW.quantity ELSE 0 END
  FROM result_data rd
  ON CONFLICT (result_id, level)
  DO UPDATE SET
    buy_count = CASE WHEN NEW.action_type = 'buy' 
                     THEN player_level_actions.buy_count + 1 
                     ELSE player_level_actions.buy_count END,
    sell_count = CASE WHEN NEW.action_type = 'sell' 
                      THEN player_level_actions.sell_count + 1 
                      ELSE player_level_actions.sell_count END,
    hold_count = CASE WHEN NEW.action_type = 'hold' 
                      THEN player_level_actions.hold_count + 1 
                      ELSE player_level_actions.hold_count END,
    total_trades = player_level_actions.total_trades + 1,
    avg_buy_price = CASE WHEN NEW.action_type = 'buy' 
                         THEN (player_level_actions.avg_buy_price * player_level_actions.buy_count + NEW.price) / (player_level_actions.buy_count + 1)
                         ELSE player_level_actions.avg_buy_price END,
    avg_sell_price = CASE WHEN NEW.action_type = 'sell' 
                          THEN (player_level_actions.avg_sell_price * player_level_actions.sell_count + NEW.price) / (player_level_actions.sell_count + 1) 
                          ELSE player_level_actions.avg_sell_price END,
    total_buy_quantity = CASE WHEN NEW.action_type = 'buy' 
                             THEN player_level_actions.total_buy_quantity + NEW.quantity 
                             ELSE player_level_actions.total_buy_quantity END,
    total_sell_quantity = CASE WHEN NEW.action_type = 'sell' 
                              THEN player_level_actions.total_sell_quantity + NEW.quantity 
                              ELSE player_level_actions.total_sell_quantity END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS after_game_action_insert ON game_action;
CREATE TRIGGER after_game_action_insert
AFTER INSERT ON game_action
FOR EACH ROW
EXECUTE FUNCTION update_player_level_actions();

-- Helper function to create JSON representation of level actions for a result
CREATE OR REPLACE FUNCTION get_level_actions_json(result_id_param UUID)
RETURNS JSONB AS $$
DECLARE
  level_data JSONB;
BEGIN
  SELECT 
    jsonb_agg(
      jsonb_build_object(
        'level', level,
        'totalTrades', total_trades,
        'buyOrders', buy_count,
        'sellOrders', sell_count,
        'holdActions', hold_count,
        'avgBuyPrice', avg_buy_price,
        'avgSellPrice', avg_sell_price,
        'totalBuyQuantity', total_buy_quantity,
        'totalSellQuantity', total_sell_quantity
      )
    )
  INTO level_data
  FROM get_player_result_level_actions(result_id_param);
  
  RETURN COALESCE(level_data, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- Migration function to populate the table with existing data
CREATE OR REPLACE FUNCTION migrate_existing_game_actions()
RETURNS TEXT AS $$
DECLARE
  action_count INTEGER;
  migrated_count INTEGER;
BEGIN
  -- Check how many actions exist
  SELECT COUNT(*) INTO action_count FROM game_action;
  
  -- Call the population function
  PERFORM populate_player_level_actions();
  
  -- Check how many were migrated
  SELECT COUNT(*) INTO migrated_count FROM player_level_actions;
  
  RETURN 'Migration complete. Processed ' || action_count || ' actions, created ' || migrated_count || ' level records.';
END;
$$ LANGUAGE plpgsql;

-- Example queries:

-- Initialize table with existing data (run this once):
-- SELECT migrate_existing_game_actions();

-- Get all level actions for a specific room:
-- SELECT * FROM get_player_level_actions('your-room-id-uuid-here');

-- Get level-wise actions for a specific player result:
-- SELECT * FROM get_player_result_level_actions('result-id-uuid-here');

-- Get JSON representation of level actions (for frontend use):
-- SELECT get_level_actions_json('result-id-uuid-here');
