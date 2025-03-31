import { createClient } from '@supabase/supabase-js';

// Function to initialize database functions
export async function initDatabaseFunctions(supabase: any) {
  try {
    console.log('Checking and deploying database functions...');
    
    // SQL for force_update_balance function
    const forceUpdateBalanceSQL = `
    create or replace function force_update_balance(session_id_param uuid, new_balance_param numeric)
    returns boolean
    language plpgsql
    security definer
    as $$
    declare
      updated_rows int;
    begin
      -- Direct SQL update of the final_balance field
      update game_sessions
      set final_balance = new_balance_param
      where id = session_id_param;
      
      GET DIAGNOSTICS updated_rows = ROW_COUNT;
      
      -- Also update the game_results table if it exists
      update game_results
      set final_balance = new_balance_param
      where session_id = session_id_param;
      
      -- Return true if at least one row was updated
      return updated_rows > 0;
    end;
    $$;
    `;
    
    // Execute the SQL to create or update the function
    const { error } = await supabase.rpc('exec_sql', { sql: forceUpdateBalanceSQL });
    
    if (error) {
      // If the exec_sql RPC isn't available, we'll log but not fail the app
      console.warn('Could not deploy database functions:', error.message);
      console.warn('Balance updates may not work properly. Please contact support.');
    } else {
      console.log('Database functions deployed successfully');
    }
  } catch (err) {
    console.error('Error initializing database functions:', err);
  }
} 