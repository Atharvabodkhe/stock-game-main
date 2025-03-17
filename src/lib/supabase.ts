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