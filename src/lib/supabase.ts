import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Configure Supabase client with enhanced realtime settings
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Ensure we're using localStorage for session storage
    storage: {
      getItem: (key) => {
        try {
          const value = localStorage.getItem(key);
          console.log(`Retrieving auth key ${key} from storage:`, value ? 'Found' : 'Not found');
          return value;
        } catch (error) {
          console.error('Error getting item from localStorage:', error);
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          console.log(`Storing auth key ${key} to localStorage`);
          localStorage.setItem(key, value);
        } catch (error) {
          console.error('Error setting item in localStorage:', error);
        }
      },
      removeItem: (key) => {
        try {
          console.log(`Removing auth key ${key} from localStorage`);
          localStorage.removeItem(key);
        } catch (error) {
          console.error('Error removing item from localStorage:', error);
        }
      }
    }
  },
  realtime: {
    params: {
      eventsPerSecond: 100,
      // Set to 'extended' for complete database events
      replication_mode: 'extended',
      // Set to true to receive messages that were initiated by the client
      // This ensures local changes also trigger realtime events
      broadcast: {
        self: true
      },
      // Include other options for improved reliability and speed
      timeout_ms: 2000,
      retry_interval_ms: 250,
      max_retries: 3
    }
  },
  // Global fetch configuration
  global: {
    fetch: async (...args) => {
      // Set fetch timeout to 5 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        // Add high priority headers
        const [input, init = {}] = args;
        const headers = new Headers(init.headers || {});
        headers.set('X-Priority', 'high');
        
        // Make the fetch request with timeout
        const response = await fetch(input, {
          ...init,
          headers,
          signal: controller.signal
        });
        return response;
      } catch (error) {
        console.error('Supabase fetch error:', error);
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    // Add headers to all Supabase requests
    headers: {
      'X-Priority': 'high',
      'X-Client-Info': 'react-app-optimized'
    }
  },
  // Reduce HTTP request timeout
  db: {
    schema: 'public'
  }
});

// Initialize session recovery
(async () => {
  try {
    // Try to retrieve and set session on initial load
    console.log('Initializing session recovery');
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error recovering session:', error);
    } else if (data?.session) {
      console.log('Successfully recovered session for user:', data.session.user.id);
    } else {
      console.log('No session to recover');
    }
  } catch (error) {
    console.error('Session recovery failed:', error);
  }
})();

// Initialize database functions
export async function initDatabaseFunctions() {
  try {
    console.log('Initializing essential database functions...');
    
    // SQL for force_update_balance function - this is critical for fixing balance update issues
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
    
    // SQL for fixing game_action insert issues
    const fixGameActionSQL = `
    -- Fix game_action table insertion issues

    -- Create a robust function that can handle schema variations
    CREATE OR REPLACE FUNCTION safe_insert_game_action(
        p_session_id UUID,
        p_room_id UUID DEFAULT NULL,
        p_user_id UUID DEFAULT NULL,
        p_stock_name TEXT DEFAULT NULL,
        p_action_type TEXT DEFAULT NULL,
        p_price NUMERIC DEFAULT NULL,
        p_quantity INTEGER DEFAULT 1,
        p_level INTEGER DEFAULT NULL
    ) RETURNS BOOLEAN AS $$
    DECLARE
        result_id UUID;
        cols TEXT[] := '{}';
        vals TEXT[] := '{}';
        query_text TEXT;
    BEGIN
        -- Always include id
        cols := array_append(cols, 'id');
        vals := array_append(vals, quote_literal(gen_random_uuid()));
        
        -- Always include session_id
        cols := array_append(cols, 'session_id');
        vals := array_append(vals, quote_literal(p_session_id));
        
        -- Conditionally include other fields if provided
        IF p_room_id IS NOT NULL THEN
            cols := array_append(cols, 'room_id');
            vals := array_append(vals, quote_literal(p_room_id));
        END IF;
        
        IF p_user_id IS NOT NULL THEN
            cols := array_append(cols, '"user_id"');
            vals := array_append(vals, quote_literal(p_user_id));
        END IF;
        
        -- Handle stock name - check for both stock_name and stock columns
        IF p_stock_name IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_action' AND column_name = 'stock_name') THEN
                cols := array_append(cols, 'stock_name');
                vals := array_append(vals, quote_literal(p_stock_name));
            END IF;
            
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_action' AND column_name = 'stock') THEN
                cols := array_append(cols, 'stock');
                vals := array_append(vals, quote_literal(p_stock_name));
            END IF;
        END IF;
        
        -- Handle action type - check for both action_type and action columns
        IF p_action_type IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_action' AND column_name = 'action_type') THEN
                cols := array_append(cols, 'action_type');
                vals := array_append(vals, quote_literal(p_action_type));
            END IF;
            
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_action' AND column_name = 'action') THEN
                cols := array_append(cols, 'action');
                vals := array_append(vals, quote_literal(p_action_type));
            END IF;
        END IF;
        
        -- Always include price
        IF p_price IS NOT NULL THEN
            cols := array_append(cols, 'price');
            vals := array_append(vals, p_price::TEXT);
        END IF;
        
        -- Include quantity if it exists in the table
        IF p_quantity IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_action' AND column_name = 'quantity') THEN
                cols := array_append(cols, 'quantity');
                vals := array_append(vals, p_quantity::TEXT);
            END IF;
        END IF;
        
        -- Handle level column based on what exists
        IF p_level IS NOT NULL THEN
            IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_action' AND column_name = 'level') THEN
                cols := array_append(cols, 'level');
                vals := array_append(vals, p_level::TEXT);
            END IF;
        END IF;
        
        -- Handle timestamp/action_time column based on what exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_action' AND column_name = 'timestamp') THEN
            cols := array_append(cols, '"timestamp"'); -- quote to handle reserved keyword
            vals := array_append(vals, quote_literal(NOW()));
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_action' AND column_name = 'action_time') THEN
            cols := array_append(cols, 'action_time');
            vals := array_append(vals, quote_literal(NOW()));
        ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'game_action' AND column_name = 'created_at') THEN
            cols := array_append(cols, 'created_at');
            vals := array_append(vals, quote_literal(NOW()));
        END IF;
        
        -- Build and execute dynamic query
        query_text := 'INSERT INTO public.game_action (' || array_to_string(cols, ', ') || ') VALUES (' || array_to_string(vals, ', ') || ') RETURNING id';
        
        EXECUTE query_text INTO result_id;
        
        RETURN result_id IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error in safe_insert_game_action: %', SQLERRM;
        RETURN FALSE;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Create a simpler fallback function
    CREATE OR REPLACE FUNCTION save_game_action(
        p_session_id UUID,
        p_stock_name TEXT,
        p_action_type TEXT,
        p_price NUMERIC,
        p_level INTEGER DEFAULT 0
    ) RETURNS BOOLEAN AS $$
    DECLARE
        result BOOLEAN;
    BEGIN
        -- Try to call our more robust function first
        SELECT safe_insert_game_action(
            p_session_id,
            NULL,
            auth.uid(),
            p_stock_name,
            p_action_type,
            p_price,
            1,
            p_level
        ) INTO result;
        
        RETURN result;
    EXCEPTION WHEN OTHERS THEN
        -- If that fails, do a minimal direct insert
        BEGIN
            INSERT INTO public.game_action (
                id,
                session_id,
                stock_name,
                action_type,
                price,
                level,
                timestamp
            ) VALUES (
                gen_random_uuid(),
                p_session_id,
                p_stock_name,
                p_action_type,
                p_price,
                p_level,
                NOW()
            );
            
            RETURN TRUE;
        EXCEPTION WHEN OTHERS THEN
            RETURN FALSE;
        END;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- Grant execute privileges
    GRANT EXECUTE ON FUNCTION safe_insert_game_action TO authenticated;
    GRANT EXECUTE ON FUNCTION save_game_action TO authenticated;
    `;
    
    // Try to create the functions through a direct SQL execution
    try {
      // First deploy the balance function
      const { error: balanceError } = await supabase.rpc('exec_sql', { sql: forceUpdateBalanceSQL });
      
      if (balanceError) {
        console.warn('Could not deploy force_update_balance via exec_sql RPC:', balanceError.message);
        console.log('Will rely on manual function creation in the database');
      } else {
        console.log('force_update_balance function deployed successfully');
      }
      
      // Now deploy the game_action fix
      const { error: gameActionError } = await supabase.rpc('exec_sql', { sql: fixGameActionSQL });
      
      if (gameActionError) {
        console.warn('Could not deploy game_action fixes via exec_sql RPC:', gameActionError.message);
        console.log('Will rely on manual function creation in the database');
      } else {
        console.log('game_action functions deployed successfully');
      }
    } catch (rpcError) {
      console.warn('exec_sql RPC not available:', rpcError);
    }
  } catch (err) {
    console.error('Error initializing database functions:', err);
  }
}

// Call initDatabaseFunctions when the app starts
initDatabaseFunctions();

// Optimize realtime connection setup
const initRealtimeSubscription = async () => {
  try {
    await supabase.removeAllChannels();
    console.log('Setting up global realtime subscription with optimized settings');
    
    // Pre-connect to critical tables
    const criticalTables = ['game_rooms', 'room_players'];
    
    // Create a specialized high-performance channel for critical updates
    const criticalChannel = supabase.channel('critical_updates', {
      config: {
        broadcast: { self: true },
        presence: { key: '' }
      }
    });
    
    // Add listeners for critical tables
    criticalTables.forEach(table => {
      criticalChannel.on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table
        },
        (payload) => {
          console.log(`Critical update for ${table}:`, payload);
        }
      );
    });
    
    // Subscribe to the channel
    criticalChannel.subscribe(status => {
      console.log(`Critical channel status: ${status}`);
    });
  } catch (error) {
    console.error('Error initializing realtime subscription:', error);
  }
};

// Initialize realtime subscription on client load
initRealtimeSubscription();

// Create a session tracker variable
let currentSession = null;

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth state changed:', event, session ? 'Session exists' : 'No session');
  
  if (session) {
    // We have a session, make sure it's properly stored
    console.log('User is authenticated with ID:', session.user.id);
    currentSession = session;
    
    // Store session in localStorage as a backup
    try {
      localStorage.setItem('supabase_auth_token_backup', JSON.stringify({
        currentSession: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          user: {
            id: session.user.id,
            email: session.user.email
          }
        }
      }));
      console.log('Backed up session to localStorage');
    } catch (e) {
      console.error('Error backing up session:', e);
    }
    
    // Re-initialize realtime subscription when auth state changes
    initRealtimeSubscription();
  } else {
    // No session
    console.log('No active session');
    currentSession = null;
  }
});

// Export a helper function to get the current session
export const getCurrentSession = async () => {
  try {
    // First try to get session from Supabase
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('Error getting session:', error);
      return null;
    }
    
    if (data?.session) {
      return data.session;
    }
    
    // If no session, try to recover from backup
    try {
      const backupStr = localStorage.getItem('supabase_auth_token_backup');
      if (backupStr) {
        const backup = JSON.parse(backupStr);
        if (backup.currentSession?.access_token) {
          console.log('Found backup session, attempting to restore');
          // Try to restore the session
          const { data: restoreData, error: restoreError } = await supabase.auth.setSession({
            access_token: backup.currentSession.access_token,
            refresh_token: backup.currentSession.refresh_token
          });
          
          if (restoreError) {
            console.error('Error restoring session:', restoreError);
            return null;
          }
          
          if (restoreData?.session) {
            console.log('Successfully restored session');
            return restoreData.session;
          }
        }
      }
    } catch (e) {
      console.error('Error recovering from backup session:', e);
    }
    
    return null;
  } catch (e) {
    console.error('Error in getCurrentSession:', e);
    return null;
  }
};

// Connection status monitoring for faster reconnection
let connectionHealthCheck = setInterval(() => {
  const channels = supabase.getChannels();
  const hasHealthyChannels = channels.some((channel: any) => 
    channel.state === 'joined' || channel.state === 'joining');
    
  if (!hasHealthyChannels && channels.length > 0) {
    console.log('No healthy channels detected, reinitializing...');
    initRealtimeSubscription();
  }
}, 5000); // Check every 5 seconds

// Export the health check interval for cleanup
export const cleanupSupabase = () => {
  if (connectionHealthCheck) {
    clearInterval(connectionHealthCheck);
  }
};