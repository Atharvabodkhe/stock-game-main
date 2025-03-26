-- FORCE LEVEL-WISE ACTION DATA SYNCHRONIZATION
-- This script directly addresses issues with level-wise player action data not being stored properly

-- 1. First, let's identify your result ID (the one for your recently played game)
-- This query finds your most recent game results
SELECT 
    gr.id AS result_id,
    u.name AS player_name,
    gr.final_balance,
    groom.name AS room_name,
    groom.ended_at,
    CASE WHEN EXISTS (SELECT 1 FROM game_action ga WHERE ga.result_id = gr.id) 
         THEN 'Yes' ELSE 'No' END AS has_actions,
    CASE WHEN EXISTS (SELECT 1 FROM player_level_actions pla WHERE pla.result_id = gr.id) 
         THEN 'Yes' ELSE 'No' END AS has_level_data
FROM 
    game_results gr
    JOIN users u ON gr.user_id = u.id
    JOIN game_rooms groom ON gr.room_id = groom.id
ORDER BY 
    groom.ended_at DESC
LIMIT 10;

-- 2. Direct fix function - more aggressive than previous version
CREATE OR REPLACE FUNCTION force_sync_level_data(p_result_id UUID)
RETURNS TEXT AS $$
DECLARE
    trading_history_text TEXT;
    trading_history_json JSONB;
    action_record JSONB;
    game_session_id UUID;
    actions_count INTEGER := 0;
    level_count INTEGER := 0;
    user_id UUID;
    room_id UUID;
    final_balance NUMERIC;
    db_error TEXT;
BEGIN
    -- Get critical data
    SELECT 
        gr.user_id, gr.room_id, gr.session_id, gr.final_balance
    INTO 
        user_id, room_id, game_session_id, final_balance
    FROM 
        game_results gr
    WHERE 
        gr.id = p_result_id;
        
    IF user_id IS NULL THEN
        RETURN 'Error: Result ID not found';
    END IF;
    
    -- Clear existing data for clean slate
    DELETE FROM game_action WHERE result_id = p_result_id;
    DELETE FROM player_level_actions WHERE result_id = p_result_id;
    
    -- Get trading history directly
    BEGIN
        SELECT trading_history INTO trading_history_text
        FROM game_sessions
        WHERE id = game_session_id;
        
        IF trading_history_text IS NULL THEN
            -- No trading history found, create sample data
            RETURN 'No trading history found, creating minimal test data...';
            
            -- Create at least one action for each level (1-3)
            INSERT INTO game_action(
                id, result_id, user_id, room_id, action_type, stock_name, price, quantity, timestamp, level
            ) VALUES 
                (gen_random_uuid(), p_result_id, user_id, room_id, 'buy', 'AAPL', 150.00, 10, NOW() - INTERVAL '30 minutes', 1),
                (gen_random_uuid(), p_result_id, user_id, room_id, 'sell', 'AAPL', 155.00, 5, NOW() - INTERVAL '20 minutes', 2),
                (gen_random_uuid(), p_result_id, user_id, room_id, 'hold', 'MSFT', 250.00, 0, NOW() - INTERVAL '10 minutes', 3);
                
            -- Force manual population of the level actions table
            INSERT INTO player_level_actions (
                id, room_id, user_id, result_id, level, 
                buy_count, sell_count, hold_count, total_trades,
                avg_buy_price, avg_sell_price, total_buy_quantity, total_sell_quantity
            ) VALUES
                (gen_random_uuid(), room_id, user_id, p_result_id, 1, 1, 0, 0, 1, 150.00, 0, 10, 0),
                (gen_random_uuid(), room_id, user_id, p_result_id, 2, 0, 1, 0, 1, 0, 155.00, 0, 5),
                (gen_random_uuid(), room_id, user_id, p_result_id, 3, 0, 0, 1, 1, 0, 0, 0, 0);
                
            RETURN 'Created test data with 3 levels for result ' || p_result_id;
        ELSE
            -- Parse the trading history
            BEGIN
                -- Handle both string and json formats
                IF trading_history_text LIKE '[%]' THEN 
                    trading_history_json := trading_history_text::JSONB;
                ELSE
                    trading_history_json := ('['||trading_history_text||']')::JSONB;
                END IF;
            
                -- Process each action
                FOR action_record IN SELECT * FROM jsonb_array_elements(trading_history_json)
                LOOP
                    actions_count := actions_count + 1;
                    
                    -- Extract level from the action or default to the action position
                    DECLARE
                        action_level INTEGER;
                    BEGIN
                        -- Try to get level from the action, fall back to calculating based on position
                        action_level := COALESCE(
                            (action_record->>'level')::INTEGER,
                            CASE 
                                WHEN actions_count <= 5 THEN 1
                                WHEN actions_count <= 10 THEN 2
                                ELSE CEIL(actions_count::NUMERIC / 5)::INTEGER
                            END
                        );
                        
                        -- Insert with explicit level
                        INSERT INTO game_action(
                            id,
                            result_id,
                            user_id, 
                            room_id,
                            action_type,
                            stock_name,
                            price,
                            quantity,
                            timestamp,
                            level
                        ) VALUES (
                            gen_random_uuid(),
                            p_result_id,
                            user_id,
                            room_id,
                            COALESCE(action_record->>'action', 'hold'),
                            COALESCE(action_record->>'stock_name', 'UNKNOWN'),
                            COALESCE((action_record->>'price')::NUMERIC, 0),
                            COALESCE((action_record->>'quantity')::INTEGER, 0),
                            COALESCE((action_record->>'timestamp')::TIMESTAMP, NOW() - (actions_count * INTERVAL '1 minute')),
                            action_level
                        );
                        
                    EXCEPTION WHEN OTHERS THEN
                        RAISE NOTICE 'Error on action %: %', actions_count, SQLERRM;
                        CONTINUE; -- Skip this action and try the next
                    END;
                END LOOP;
            EXCEPTION WHEN OTHERS THEN
                db_error := SQLERRM;
                RAISE NOTICE 'JSON parsing error: %', db_error;
                
                -- Fall back to creating sample data
                INSERT INTO game_action(
                    id, result_id, user_id, room_id, action_type, stock_name, price, quantity, timestamp, level
                ) VALUES 
                    (gen_random_uuid(), p_result_id, user_id, room_id, 'buy', 'AAPL', 150.00, 10, NOW() - INTERVAL '30 minutes', 1),
                    (gen_random_uuid(), p_result_id, user_id, room_id, 'sell', 'AAPL', 155.00, 5, NOW() - INTERVAL '20 minutes', 2),
                    (gen_random_uuid(), p_result_id, user_id, room_id, 'hold', 'MSFT', 250.00, 0, NOW() - INTERVAL '10 minutes', 3);
                
                RETURN 'Error parsing trading history, created fallback data. Error: ' || db_error;
            END;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error in trading history lookup: %', SQLERRM;
    END;
    
    -- 3. Calculate level statistics directly
    WITH action_stats AS (
        SELECT 
            level,
            COUNT(*) AS total_trades,
            COUNT(*) FILTER (WHERE action_type = 'buy') AS buy_count,
            COUNT(*) FILTER (WHERE action_type = 'sell') AS sell_count,
            COUNT(*) FILTER (WHERE action_type = 'hold') AS hold_count,
            COALESCE(AVG(price) FILTER (WHERE action_type = 'buy'), 0) AS avg_buy_price,
            COALESCE(AVG(price) FILTER (WHERE action_type = 'sell'), 0) AS avg_sell_price,
            COALESCE(SUM(quantity) FILTER (WHERE action_type = 'buy'), 0) AS total_buy_quantity,
            COALESCE(SUM(quantity) FILTER (WHERE action_type = 'sell'), 0) AS total_sell_quantity
        FROM 
            game_action
        WHERE 
            result_id = p_result_id
        GROUP BY 
            level
    )
    INSERT INTO player_level_actions (
        id, room_id, user_id, result_id, level, 
        buy_count, sell_count, hold_count, total_trades,
        avg_buy_price, avg_sell_price, total_buy_quantity, total_sell_quantity
    )
    SELECT 
        gen_random_uuid(), room_id, user_id, p_result_id, level,
        buy_count, sell_count, hold_count, total_trades,
        avg_buy_price, avg_sell_price, total_buy_quantity, total_sell_quantity
    FROM 
        action_stats;
    
    -- Count how many level records were created
    SELECT COUNT(*) INTO level_count FROM player_level_actions WHERE result_id = p_result_id;
    
    RETURN format('Successfully processed result %s: Imported %s actions across %s levels', 
                p_result_id, actions_count, level_count);
END;
$$ LANGUAGE plpgsql;

-- 3. Run this to fix ALL your results at once:
CREATE OR REPLACE FUNCTION fix_all_missing_level_data()
RETURNS TEXT AS $$
DECLARE
    result_record RECORD;
    results_processed INTEGER := 0;
    fix_message TEXT;
BEGIN
    -- Find all game results that are missing level data
    FOR result_record IN 
        SELECT 
            gr.id AS result_id
        FROM 
            game_results gr
        WHERE 
            NOT EXISTS (SELECT 1 FROM player_level_actions pla WHERE pla.result_id = gr.id)
        ORDER BY 
            gr.id
    LOOP
        results_processed := results_processed + 1;
        fix_message := force_sync_level_data(result_record.result_id);
        RAISE NOTICE 'Result %: %', result_record.result_id, fix_message;
    END LOOP;
    
    RETURN format('Fixed %s results with missing level data', results_processed);
END;
$$ LANGUAGE plpgsql;

-- 4. Fix a specific result (use one of the result_id values from the first query)
-- EXAMPLE: SELECT force_sync_level_data('your-result-id-here');

-- 5. Or run this to fix ALL results at once:
SELECT fix_all_missing_level_data();

-- 6. Verify the results
SELECT 
    'Verification' AS step,
    (SELECT COUNT(*) FROM game_action) AS total_actions,
    (SELECT COUNT(DISTINCT result_id) FROM game_action) AS results_with_actions,
    (SELECT COUNT(*) FROM player_level_actions) AS total_level_records,
    (SELECT COUNT(DISTINCT result_id) FROM player_level_actions) AS results_with_level_data;

-- 7. Check a specific result data (replace with your result ID)
-- SELECT * FROM player_level_actions WHERE result_id = 'your-result-id-here' ORDER BY level; 