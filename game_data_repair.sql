-- Game Data Repair Script
-- This script diagnoses and fixes issues with the level-wise action tracking

-- First, let's diagnose the problem
-- 1. Check if there are any game actions in the main table
DO $$
DECLARE
    action_count INTEGER;
    level_action_count INTEGER;
    missing_level_count INTEGER;
BEGIN
    -- Check game_action table
    SELECT COUNT(*) INTO action_count FROM game_action;
    
    -- Check player_level_actions table
    SELECT COUNT(*) INTO level_action_count FROM player_level_actions;
    
    -- Check for actions with NULL or 0 level
    SELECT COUNT(*) INTO missing_level_count FROM game_action WHERE level IS NULL OR level = 0;
    
    RAISE NOTICE 'Diagnostic results:';
    RAISE NOTICE '- Total game actions: %', action_count;
    RAISE NOTICE '- Total level action records: %', level_action_count;
    RAISE NOTICE '- Actions with missing level data: %', missing_level_count;
    
    -- Log the results
    INSERT INTO log_events(event_type, description, details)
    VALUES('DIAGNOSTIC', 'Game action tracking diagnostic', 
           format('{"action_count": %s, "level_action_count": %s, "missing_level_count": %s}', 
                  action_count, level_action_count, missing_level_count))
    ON CONFLICT DO NOTHING;
    
END $$;

-- Fix 1: Make sure all actions have a level value (set default to 1 if missing)
UPDATE game_action 
SET level = 1 
WHERE level IS NULL OR level = 0;

-- Fix 2: Re-run the population function to make sure all actions are properly tracked
SELECT populate_player_level_actions();

-- Fix 3: Check if the trigger exists and recreate it if necessary
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'after_game_action_insert'
    ) THEN
        -- Recreate the trigger if it doesn't exist
        EXECUTE 'DROP TRIGGER IF EXISTS after_game_action_insert ON game_action';
        EXECUTE 'CREATE TRIGGER after_game_action_insert
                 AFTER INSERT ON game_action
                 FOR EACH ROW
                 EXECUTE FUNCTION update_player_level_actions()';
        
        RAISE NOTICE 'Trigger was missing and has been recreated';
    ELSE
        RAISE NOTICE 'Trigger exists and is properly configured';
    END IF;
END $$;

-- Fix 4: Extract trading history from game sessions and populate the game_action table
CREATE OR REPLACE FUNCTION sync_missing_actions()
RETURNS TEXT AS $$
DECLARE
    result_record RECORD;
    action_record JSONB;
    trading_history JSONB;
    actions_count INTEGER := 0;
    processed_count INTEGER := 0;
    recent_games_cursor CURSOR FOR
        SELECT 
            gr.id AS result_id, 
            gr.user_id, 
            gr.room_id,
            gs.trading_history
        FROM 
            game_results gr
            JOIN game_sessions gs ON gr.session_id = gs.id
        WHERE 
            gs.trading_history IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 FROM game_action ga WHERE ga.result_id = gr.id
            )
        ORDER BY 
            gs.created_at DESC
        LIMIT 10;
BEGIN
    -- Open cursor and start processing
    OPEN recent_games_cursor;
    
    LOOP
        -- Fetch the next result record
        FETCH recent_games_cursor INTO result_record;
        EXIT WHEN NOT FOUND;
        
        processed_count := processed_count + 1;
        RAISE NOTICE 'Processing result % for user %', 
                     result_record.result_id, result_record.user_id;
        
        -- Parse the trading history
        BEGIN
            trading_history := result_record.trading_history::JSONB;
            
            -- Loop through each action in the trading history
            FOR action_record IN SELECT * FROM jsonb_array_elements(trading_history)
            LOOP
                -- Insert into game_action table
                INSERT INTO game_action(
                    result_id,
                    action_type,
                    stock_name,
                    price,
                    quantity,
                    timestamp,
                    level
                ) VALUES (
                    result_record.result_id,
                    action_record->>'action',
                    action_record->>'stock_name',
                    (action_record->>'price')::numeric,
                    (action_record->>'quantity')::integer,
                    (action_record->>'timestamp')::timestamp,
                    COALESCE((action_record->>'level')::integer, 1)
                )
                ON CONFLICT DO NOTHING;
                
                actions_count := actions_count + 1;
            END LOOP;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error processing trading history for result %: %', 
                         result_record.result_id, SQLERRM;
        END;
    END LOOP;
    
    CLOSE recent_games_cursor;
    
    -- Update the player_level_actions table with the newly added actions
    PERFORM populate_player_level_actions();
    
    RETURN format('Processed %s games, imported %s actions', processed_count, actions_count);
END;
$$ LANGUAGE plpgsql;

-- Function to specifically fix a known result by ID
CREATE OR REPLACE FUNCTION fix_specific_result(p_result_id UUID)
RETURNS TEXT AS $$
DECLARE
    trading_history JSONB;
    action_record JSONB;
    actions_count INTEGER := 0;
    user_id UUID;
    room_id UUID;
BEGIN
    -- Get the trading history for this result
    SELECT 
        gr.user_id, gr.room_id, gs.trading_history::JSONB
    INTO
        user_id, room_id, trading_history
    FROM 
        game_results gr
        JOIN game_sessions gs ON gr.session_id = gs.id
    WHERE 
        gr.id = p_result_id;
        
    IF trading_history IS NULL THEN
        RETURN 'No trading history found for this result';
    END IF;
    
    -- Remove existing actions for this result to avoid duplicates
    DELETE FROM game_action WHERE result_id = p_result_id;
    
    -- Insert all actions from the trading history
    FOR action_record IN SELECT * FROM jsonb_array_elements(trading_history)
    LOOP
        -- Insert into game_action table
        INSERT INTO game_action(
            result_id,
            action_type,
            stock_name,
            price,
            quantity,
            timestamp,
            level
        ) VALUES (
            p_result_id,
            action_record->>'action',
            action_record->>'stock_name',
            (action_record->>'price')::numeric,
            (action_record->>'quantity')::integer,
            (action_record->>'timestamp')::timestamp,
            COALESCE((action_record->>'level')::integer, 1)
        );
        
        actions_count := actions_count + 1;
    END LOOP;
    
    -- Update the player_level_actions table
    DELETE FROM player_level_actions WHERE result_id = p_result_id;
    PERFORM populate_player_level_actions();
    
    RETURN format('Fixed result %s for user %s: imported %s actions', 
                 p_result_id, user_id, actions_count);
END;
$$ LANGUAGE plpgsql;

-- Fix 5: Find recent completed games without action data
CREATE OR REPLACE FUNCTION find_games_missing_action_data()
RETURNS TABLE (
    result_id UUID,
    user_id UUID,
    user_name TEXT,
    room_id UUID,
    room_name TEXT,
    final_balance NUMERIC,
    has_trading_history BOOLEAN,
    session_id UUID,
    completed_at TIMESTAMP WITH TIME ZONE,
    action_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        gr.id AS result_id,
        gr.user_id,
        u.name AS user_name,
        gr.room_id,
        groom.name AS room_name,
        gr.final_balance,
        CASE WHEN gs.trading_history IS NOT NULL THEN TRUE ELSE FALSE END AS has_trading_history,
        gr.session_id,
        groom.ended_at AS completed_at,
        COALESCE((SELECT COUNT(*) FROM game_action ga WHERE ga.result_id = gr.id), 0) AS action_count
    FROM 
        game_results gr
        JOIN game_rooms groom ON gr.room_id = groom.id
        JOIN users u ON gr.user_id = u.id
        LEFT JOIN game_sessions gs ON gr.session_id = gs.id
    WHERE 
        groom.status = 'completed'
        AND (
            NOT EXISTS (SELECT 1 FROM game_action ga WHERE ga.result_id = gr.id)
            OR NOT EXISTS (SELECT 1 FROM player_level_actions pla WHERE pla.result_id = gr.id)
        )
    ORDER BY 
        groom.ended_at DESC
    LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Fix 4: Create a function to handle manual data insertion for testing
CREATE OR REPLACE FUNCTION add_test_game_action(
    p_result_id UUID,
    p_action_type TEXT,
    p_stock_name TEXT,
    p_price NUMERIC,
    p_quantity INTEGER,
    p_level INTEGER DEFAULT 1
)
RETURNS TEXT AS $$
DECLARE
    timestamp_val TIMESTAMP;
    inserted_id UUID;
BEGIN
    -- Generate a timestamp
    timestamp_val := NOW();
    
    -- Insert the action
    INSERT INTO game_action(
        result_id, 
        action_type, 
        stock_name, 
        price, 
        quantity, 
        timestamp, 
        level
    ) 
    VALUES (
        p_result_id,
        p_action_type,
        p_stock_name,
        p_price,
        p_quantity,
        timestamp_val,
        p_level
    )
    RETURNING id INTO inserted_id;
    
    -- Return success message
    RETURN 'Action added successfully with ID: ' || inserted_id;
END;
$$ LANGUAGE plpgsql;

-- Verification query - show current state after fixes
SELECT 
    'Action counts' AS description,
    (SELECT COUNT(*) FROM game_action) AS total_actions,
    (SELECT COUNT(*) FROM player_level_actions) AS total_level_records,
    (SELECT COUNT(DISTINCT result_id) FROM game_action) AS distinct_results,
    (SELECT COUNT(DISTINCT result_id) FROM player_level_actions) AS tracked_results;

-- Add a special logging table if it doesn't exist
CREATE TABLE IF NOT EXISTS log_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    details JSONB,
    UNIQUE(event_type, description)
);

-- Log the repair attempt
INSERT INTO log_events(event_type, description, details)
VALUES('REPAIR', 'Game action tracking repair', 
       jsonb_build_object(
           'timestamp', now(),
           'actions_before', (SELECT COUNT(*) FROM game_action),
           'level_actions_before', (SELECT COUNT(*) FROM player_level_actions),
           'actions_after', (SELECT COUNT(*) FROM game_action),
           'level_actions_after', (SELECT COUNT(*) FROM player_level_actions)
       ))
ON CONFLICT (event_type, description) 
DO UPDATE SET 
    timestamp = now(),
    details = jsonb_build_object(
        'timestamp', now(),
        'actions_before', (SELECT COUNT(*) FROM game_action),
        'level_actions_before', (SELECT COUNT(*) FROM player_level_actions),
        'actions_after', (SELECT COUNT(*) FROM game_action),
        'level_actions_after', (SELECT COUNT(*) FROM player_level_actions)
    );

-- Usage instructions
COMMENT ON FUNCTION add_test_game_action IS 
'This function can be used to manually add test actions if needed.
Example usage:
  SELECT add_test_game_action(
    ''your-result-id-here'', -- UUID of the game result
    ''buy'',                  -- action type: buy, sell, or hold
    ''AAPL'',                 -- stock name
    150.25,                  -- price
    10,                      -- quantity
    1                        -- level (optional, defaults to 1)
  );';

-- Run the synchronization to fix missing data
SELECT sync_missing_actions();

-- Find games that need fixing
SELECT * FROM find_games_missing_action_data();

-- For any specific game found above, you can run:
-- SELECT fix_specific_result('your-result-id-here');

-- Show specific player data if result_id is known
-- Example: SELECT * FROM get_player_result_level_actions('your-result-id-here'); 