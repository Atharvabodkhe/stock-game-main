import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, LogOut, ChevronDown, ChevronUp, Users, Trophy, FileText, AlertTriangle } from 'lucide-react';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';

interface GameSession {
  id: string;
  final_balance: number;
  personality_report: string;
  created_at: string;
  actions?: GameAction[];
}

interface GameAction {
  stock_name: string;
  action: string;
  price: number;
  timestamp: string;
}

interface GameRoom {
  id: string;
  name: string;
  min_players: number;
  max_players: number;
  status: string;
  players: RoomPlayer[];
}

interface RoomPlayer {
    id: string;
    user_id: string;
    status: string;
    session_id?: string;
    user: {
      name: string;
      email: string;
    };
}

interface GameResult {
  id: string;
  rank: number;
  final_balance: number;
  user: {
    name: string | null;
    email: string | null;
  };
  game_session: {
    personality_report: string;
  };
}

interface StockPerformance {
  name: string;
  change: number;
  currentPrice: number;
}

// Define payload types for Supabase realtime subscriptions
interface PlayerChangePayload {
  new: {
    status: string;
    user_id: string;
    session_id?: string;
  };
}

function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGameSession, setActiveGameSession] = useState<string | null>(null);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const retryDelay = 2000;

  const { isSubscribed } = useRealtimeSubscription({
    channelName: 'user_dashboard',
    tables: [
      { name: 'game_rooms', event: '*', filter: 'status=eq.open' },
      { name: 'room_players', event: '*' },
      { name: 'game_results', event: '*' }
    ],
    onMessage: async (message) => {
      console.log('Realtime update received:', message);
      
      try {
        // Extract data from the payload
        const { table, payload } = message;
        
        // Support both payload formats for backward compatibility
        const eventType = payload.eventType || (payload.type as string);
        const newRecord = payload.new || payload.record;
        const oldRecord = payload.old || payload.old_record;
        
        console.log(`Received ${eventType} event for ${table}:`, { newRecord, oldRecord });
        
        // Only process data if there's an actual update
        if (!newRecord && !oldRecord) {
          console.log('Received event without data payload, ignoring');
          return;
        }
        
        // Immediately acknowledge the message to speed up perceived responsiveness
        console.log(`Processing ${table} update with type ${eventType}`);
        
        if (table === 'game_rooms') {
          // Handle game room status changes - important for when games start
          if (newRecord && newRecord.status === 'in_progress') {
            console.log('Game room has started, checking if player is in this room');
            
            // Check if current user is in this room that just started
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: playerData } = await supabase
                .from('room_players')
                .select('id, status, session_id')
                .eq('room_id', newRecord.id)
                .eq('user_id', user.id)
                .single();
                
              if (playerData && playerData.session_id) {
                console.log('Player found in started room with session:', playerData.session_id);
                setActiveGameSession(playerData.session_id);
                
                // If player is already in game state, redirect immediately
                if (playerData.status === 'in_game') {
                  console.log('Player is in game state, redirecting to game session');
                  navigate('/game', { state: { sessionId: playerData.session_id } });
                  return;
                }
              }
            }
          }
          
          // Direct state manipulation for room updates
          if (eventType === 'INSERT' && newRecord && newRecord.status === 'open') {
            console.log('Optimistically adding new room to UI');
            
            // Cast the new room with players property using type assertion
            const newRoomWithPlayers = {
              ...newRecord,
              players: []
            } as unknown as GameRoom;
            
            setRooms(prevRooms => {
              // Check if this room already exists to avoid duplicates
              if (prevRooms.some(room => room.id === newRecord.id)) {
                return prevRooms;
              }
              
              // Add the new room with empty players array
              return [newRoomWithPlayers, ...prevRooms];
            });
            
            // Then fetch just the players for this room
            const { data: playersData } = await supabase
              .from('room_players')
              .select(`
                id,
                user_id,
                status,
                session_id,
                user:users(name, email)
              `)
              .eq('room_id', newRecord.id)
              .eq('status', 'joined');
              
            // Update the room with players once available
            if (playersData) {
              // Convert players data to proper format
              const typedPlayers: RoomPlayer[] = (playersData || []).map(player => {
                const userInfo = safeUserExtract(player.user);
                return {
                  id: player.id || '',
                  user_id: player.user_id || '',
                  status: player.status || '',
                  session_id: player.session_id,
                  user: userInfo
                };
              });
              
              setRooms(prevRooms => 
                prevRooms.map(room => 
                  room.id === newRecord.id 
                    ? { ...room, players: typedPlayers }
                    : room
                )
              );
            }
          } 
          else if (eventType === 'UPDATE' && newRecord) {
            console.log('Optimistically updating room in UI');
            // Only update open rooms that should be displayed
            if (newRecord.status === 'open') {
              setRooms(prevRooms => 
                prevRooms.map(room => 
                  room.id === newRecord.id 
                    ? { ...room, ...newRecord } as GameRoom
                    : room
                )
              );
            } else {
              // If room is no longer open, remove it from the view
              setRooms(prevRooms => 
                prevRooms.filter(room => room.id !== newRecord.id)
              );
            }
          }
          else if (eventType === 'DELETE' && oldRecord) {
            console.log('Optimistically removing room from UI');
            setRooms(prevRooms => 
              prevRooms.filter(room => room.id !== oldRecord.id)
            );
          }
        } 
        else if (table === 'room_players') {
          if (eventType === 'INSERT' || eventType === 'UPDATE') {
            if (!newRecord) return;
            
            // Handle player transitions to game immediately - high priority
            if (newRecord.status === 'in_game') {
              const { data: { user } } = await supabase.auth.getUser();
              if (user && newRecord.user_id === user.id && newRecord.session_id) {
                console.log('Player has been moved to in_game state with session:', newRecord.session_id);
                setActiveGameSession(newRecord.session_id);
                
                // Small delay to ensure the room state is fully updated
                setTimeout(() => {
                  console.log('Navigating to game session');
                  navigate('/game', { state: { sessionId: newRecord.session_id } });
                }, 200);
                return; // Stop processing as we're navigating away
              }
            }
              
            // For player changes in open rooms, update the state
            if (eventType === 'INSERT') {
              const { data: roomData } = await supabase
                .from('game_rooms')
                .select('status')
                .eq('id', newRecord.room_id)
                .single();
                
              // Only update UI for open rooms and joined players
              if (roomData?.status === 'open' && newRecord.status === 'joined') {
                console.log('Optimistically adding player to room');
                
                // Get user data first
                const { data: userData } = await supabase
                  .from('users')
                  .select('name, email')
                  .eq('id', newRecord.user_id)
                  .single();
                  
                const playerUser = userData || { name: 'Loading...', email: '' };
                
                // Then update rooms state with it
                setRooms(prevRooms => {
                  return prevRooms.map(room => {
                    if (room.id !== newRecord.room_id) return room;
                    
                    // Check if player already exists (avoid duplicates)
                    if (room.players.some(p => p.id === newRecord.id)) {
                      return room;
                    }
                    
                    // Create proper player object with correct types
                    const newPlayer: RoomPlayer = {
                      id: newRecord.id,
                      user_id: newRecord.user_id,
                      status: newRecord.status,
                      session_id: newRecord.session_id,
                      user: {
                        name: playerUser.name,
                        email: playerUser.email
                      }
                    };
                    
                    // Return updated room with the new player
                    return {
                      ...room,
                      players: [...room.players, newPlayer]
                    };
                  });
                });
              }
            }
            else if (eventType === 'UPDATE') {
              console.log('Player update detected:', newRecord);
              
              // For open rooms, update the player status
              setRooms(prevRooms => {
                return prevRooms.map(room => {
                  if (room.id !== newRecord.room_id) return room;
                  
                  // For joined players, update in UI
                  if (newRecord.status === 'joined') {
                    const playerExists = room.players.some(p => p.id === newRecord.id);
                    
                    if (playerExists) {
                      return {
                        ...room,
                        players: room.players.map(p => 
                          p.id === newRecord.id 
                            ? {
                                ...p,
                                status: newRecord.status,
                                session_id: newRecord.session_id
                              }
                            : p
                        )
                      };
                    } else {
                      // Return unchanged for now, we'll refresh in background
                      return room;
                    }
                  } else {
                    // For non-joined players, remove from UI
                    return {
                      ...room,
                      players: room.players.filter(p => p.id !== newRecord.id)
                    };
                  }
                });
              });
            }
          }
          else if (eventType === 'DELETE' && oldRecord) {
            console.log('Optimistically removing player from room');
            setRooms(prevRooms => {
              return prevRooms.map(room => {
                if (room.id === oldRecord.room_id) {
                  return {
                    ...room,
                    players: room.players.filter(p => p.id !== oldRecord.id)
                  };
                }
                return room;
              });
            });
          }
        } 
        else if (table === 'game_results') {
          console.log('Game results update detected, reloading results...');
          await loadGameResults();
        }
        
        // For potentially complex updates, do a fast refresh in the background
        // but with a slight delay to not interfere with the immediate UI updates
        if (table === 'game_rooms' || table === 'room_players') {
          setTimeout(() => {
            loadRoomsFast().catch(e => console.error('Background refresh error:', e));
          }, 1000); // Refresh after 1s to ensure data consistency
        }
      } catch (error) {
        console.error('Error handling realtime update:', error);
        
        // Attempt silent recovery
        setTimeout(() => {
          loadRoomsFast();
        }, 1000);
      }
    },
    onError: (error) => {
      console.error('Realtime subscription error:', error);
      setError('Lost connection to realtime updates. Attempting to reconnect...');
    },
    onStatusChange: (status) => {
      console.log('Realtime subscription status:', status);
      if (status === 'SUBSCRIBED') {
        setError(null);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        loadRoomsFast(); // Use fast loader for recovery
      }
    }
  });

  // Restore the auth check useEffect
  useEffect(() => {
    checkAuth();
  }, []);

  // Set up a periodic refresh as a backup for realtime
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log('Performing backup periodic refresh');
      loadRooms().catch((err: any) => {
        console.error('Error in periodic refresh:', err);
      });
    }, 5000); // Refresh every 5 seconds as a fallback (reduced from 30s)
    
    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    if (error && retryCount < maxRetries) {
      const timer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        loadInitialData();
      }, retryDelay * Math.pow(2, retryCount));

      return () => clearTimeout(timer);
    }
  }, [error, retryCount]);

  const loadInitialData = async () => {
    try {
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/');
        return;
      }

      await Promise.all([
        loadSessions(),
        loadRooms(),
        loadGameResults(),
        checkForActiveGame()
      ]);
      
      setRetryCount(0);
      setLoading(false);
    } catch (error) {
      console.error('Error loading initial data:', error);
      setError('Failed to load some data. Retrying...');
      setLoading(false);
    }
  };

  const checkAuth = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        navigate('/');
        return;
      }

      const { data: adminData } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      setIsAdmin(!!adminData);
      loadInitialData();
    } catch (error) {
      console.error('Error checking auth:', error);
      navigate('/');
    }
  };

  const loadGameResults = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/');
        return;
      }

      const { data, error } = await supabase
        .from('game_results')
        .select(`
          *,
          user:users(name, email),
          game_session:game_sessions(personality_report)
        `)
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setGameResults(data || []);
    } catch (error) {
      console.error('Error loading game results:', error);
      setError('Failed to load game results');
    }
  };

  const checkForActiveGame = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/');
        return;
      }

      // Check if player has an active game in progress
      const { data: playerData, error: playerError } = await supabase
        .from('room_players')
        .select(`
          id,
          room_id,
          status,
          session_id,
          game_rooms(status)
        `)
        .eq('user_id', session.user.id)
        .eq('status', 'in_game')
        .maybeSingle();

      if (playerError && playerError.code !== 'PGRST116') throw playerError;

      if (playerData?.session_id) {
        // Store the session ID but don't navigate automatically
        setActiveGameSession(playerData.session_id);
        
        // Show a notification instead of redirecting
        console.log('You have an active game. You can resume from the dashboard.');
        return;
      }

      // Check if player is in a waiting room
      const { data: waitingData } = await supabase
        .from('room_players')
        .select('room_id')
        .eq('user_id', session.user.id)
        .eq('status', 'joined')
        .maybeSingle();

      if (waitingData) {
        // Store the waiting room info but don't navigate automatically
        console.log('You are in a waiting room. You can join from the dashboard.');
      }
    } catch (error) {
      console.error('Error checking active game:', error);
    }
  };

  const loadSessions = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No authenticated user');
      }

      const { data: sessionsData, error: sessionsError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      const sessionsWithActions = await Promise.all(
        (sessionsData || []).map(async (session) => {
          try {
            const { data: actions, error: actionsError } = await supabase
              .from('game_actions')
              .select('*')
              .eq('session_id', session.id)
              .order('timestamp', { ascending: true });

            if (actionsError) {
              console.error(`Error loading actions for session ${session.id}:`, actionsError);
              return {
                ...session,
                actions: []
              };
            }

            return {
              ...session,
              actions: actions || []
            };
          } catch (error) {
            console.error(`Error loading actions for session ${session.id}:`, error);
            return {
              ...session,
              actions: []
            };
          }
        })
      );

      setSessions(sessionsWithActions);
    } catch (error) {
      console.error('Error loading sessions:', error);
      throw new Error('Failed to load game sessions');
    }
  };

  const loadRooms = async () => {
    try {
      console.log('Loading all open game rooms...');
      const { data: roomsData, error: roomsError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (roomsError) throw roomsError;

      console.log('Fetched rooms:', roomsData?.length || 0);

      if (roomsData) {
        const roomsWithPlayers = await Promise.all(
          roomsData.map(async (room) => {
            try {
              console.log(`Loading players for room ${room.id}...`);
              const { data: playersData, error: playersError } = await supabase
                .from('room_players')
                .select(`
                  id,
                  user_id,
                  status,
                  session_id,
                  user:users(name, email)
                `)
                .eq('room_id', room.id)
                .eq('status', 'joined');

              if (playersError) throw playersError;

              console.log(`Loaded ${playersData?.length || 0} players for room ${room.id}`);
              
              // Convert players data to proper format
              const typedPlayers: RoomPlayer[] = (playersData || []).map(player => {
                const userInfo = safeUserExtract(player.user);
                return {
                  id: player.id || '',
                  user_id: player.user_id || '',
                  status: player.status || '',
                  session_id: player.session_id,
                  user: userInfo
                };
              });
              
              return { 
                ...room, 
                players: typedPlayers
              };
            } catch (error) {
              console.error('Error loading players for room:', room.id, error);
              return { ...room, players: [] };
            }
          })
        );

        console.log('Setting rooms with players:', roomsWithPlayers.length);
        setRooms(roomsWithPlayers);
      }
    } catch (error) {
      console.error('Error loading rooms:', error);
      setError('Failed to load game rooms');
      throw error;
    }
  };

  // Fast room loading for immediate UI updates
  const loadRoomsFast = async () => {
    try {
      const { data: roomsData, error: roomsError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (roomsError) throw roomsError;

      if (roomsData) {
        const roomsWithPlayers = await Promise.all(
          roomsData.map(async (room) => {
            try {
              const { data: playersData, error: playersError } = await supabase
                .from('room_players')
                .select(`
                  id,
                  user_id,
                  status,
                  session_id,
                  user:users(name, email)
                `)
                .eq('room_id', room.id)
                .eq('status', 'joined');

              if (playersError) throw playersError;

              return { ...room, players: playersData || [] };
            } catch (error) {
              return { ...room, players: [] };
            }
          })
        );

        setRooms(roomsWithPlayers);
      }
    } catch (error) {
      console.error('Error in fast room loading:', error);
      // Avoid setting error state for fast updates to prevent UI disruptions
    }
  };

  const joinRoom = async (roomId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/');
        return;
      }

      const { data: existingPlayer } = await supabase
        .from('room_players')
        .select('id')
        .eq('room_id', roomId)
        .eq('user_id', session.user.id)
        .eq('status', 'joined')
        .maybeSingle();

      if (existingPlayer) {
        setError('You are already in this room');
        return;
      }

      const { error } = await supabase
        .from('room_players')
        .insert([
          {
            room_id: roomId,
            user_id: session.user.id,
            status: 'joined'
          }
        ]);

      if (error) throw error;

      navigate('/waiting-room', { state: { roomId } });
    } catch (error) {
      console.error('Error joining room:', error);
      setError('Failed to join room');
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
      setError('Failed to sign out');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionStats = (actions: GameAction[] = []) => {
    const stats = {
      buy: 0,
      sell: 0,
      hold: 0,
      totalTrades: actions.length,
    };

    actions.forEach((action) => {
      if (action.action === 'buy') stats.buy++;
      else if (action.action === 'sell') stats.sell++;
      else if (action.action === 'hold') stats.hold++;
    });

    return stats;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
          <p className="text-green-500 font-semibold">${payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  // Helper function to safely extract user info
  const safeUserExtract = (userObj: any): { name: string, email: string } => {
    // If it's null or undefined
    if (!userObj) return { name: 'Unknown', email: '' };
    
    // If it's an array (handle the error case)
    if (Array.isArray(userObj)) {
      return { name: 'Unknown', email: '' };
    }
    
    // If it's an object with the right properties
    if (typeof userObj === 'object') {
      return {
        name: typeof userObj.name === 'string' ? userObj.name : 'Unknown',
        email: typeof userObj.email === 'string' ? userObj.email : ''
      };
    }
    
    // Default case
    return { name: 'Unknown', email: '' };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-xl">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-center gap-4">
            <TrendingUp className="text-green-500" size={32} />
            <h1 className="text-3xl font-bold text-white">Trading History</h1>
          </div>

          <div className="flex flex-col gap-4 min-w-[300px]">
            {isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Admin Dashboard
              </button>
            )}
            <button
              onClick={() => navigate('/game')}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                New Game
              </button>
            {activeGameSession && (
              <button
                onClick={() => navigate('/game', { state: { sessionId: activeGameSession } })}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Resume Active Game
              </button>
            )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                <LogOut size={20} />
                Logout
              </button>
            </div>
          </div>
  
          {error && retryCount < maxRetries && (
            <div className="bg-red-500 text-white p-4 rounded-lg mb-8 flex items-center gap-3">
              <AlertTriangle size={24} />
              <div>
                <p className="font-semibold">{error}</p>
                <p className="text-sm mt-1">
                  Retrying... Attempt {retryCount + 1} of {maxRetries}
                </p>
              </div>
            </div>
          )}
  
          {error && retryCount >= maxRetries && (
            <div className="bg-red-500 text-white p-4 rounded-lg mb-8 flex items-center gap-3">
              <AlertTriangle size={24} />
              <div>
                <p className="font-semibold">Failed to load data after multiple attempts</p>
                <button
                  onClick={() => {
                    setRetryCount(0);
                    loadInitialData();
                  }}
                  className="text-sm mt-2 bg-white text-red-500 px-3 py-1 rounded hover:bg-red-100 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
  
          {gameResults.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-6 mb-8">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Trophy className="text-yellow-500" />
                Your Game Results
              </h2>
              <div className="space-y-4">
                {gameResults.map((result) => (
                  <div key={result.id} className="bg-gray-700 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-4">
                        <div className={`text-2xl font-bold ${
                          result.rank === 1 ? 'text-yellow-500' :
                          result.rank === 2 ? 'text-gray-400' :
                          result.rank === 3 ? 'text-amber-700' :
                          'text-gray-500'
                        }`}>
                          #{result.rank}
                        </div>
                        <div className="text-green-500 font-bold">
                          ${result.final_balance.toFixed(2)}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedResult(selectedResult === result.id ? null : result.id)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
                      >
                        <FileText size={20} />
                        View Report
                      </button>
                    </div>
                    {selectedResult === result.id && (
                      <div className="mt-4 bg-gray-800 p-4 rounded-lg">
                        <h3 className="font-semibold mb-2">Trading Analysis</h3>
                        <p className="text-gray-300 whitespace-pre-wrap">
                          {result.game_session.personality_report}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
  
          <div className="bg-gray-800 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-white mb-4">Available Rooms</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {rooms.map((room) => (
                <div key={room.id} className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold">{room.name}</h3>
                    <div className="flex items-center gap-2">
                      <Users size={18} className="text-gray-400" />
                      <span className="text-gray-400">
                        {room.players.filter(p => p.status === 'joined').length} / {room.max_players}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => joinRoom(room.id)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition-colors"
                    disabled={room.players.filter(p => p.status === 'joined').length >= room.max_players}
                  >
                    Join Room
                  </button>
                </div>
              ))}
              {rooms.length === 0 && (
                <p className="text-gray-400">No rooms available. Wait for an admin to create one.</p>
              )}
            </div>
          </div>
  
          <div className="space-y-8">
            {sessions.map((session) => (
              <div key={session.id} className="bg-gray-800 rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white">
                    Game Session - {formatDate(session.created_at)}
                  </h2>
                  <div className="flex items-center gap-4">
                    <span className="text-green-500 font-semibold text-lg">
                      Final Balance: ${session.final_balance.toFixed(2)}
                    </span>
                    <button
                      onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      {expandedSession === session.id ? (
                        <ChevronUp size={24} />
                      ) : (
                        <ChevronDown size={24} />
                      )}
                    </button>
                  </div>
                </div>
                
                {expandedSession === session.id && session.actions && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-gray-700 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-white mb-4">Trading Activity</h3>
                        <div className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={session.actions}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis dataKey="timestamp" stroke="#9CA3AF" />
                              <YAxis stroke="#9CA3AF" />
                              <Tooltip content={<CustomTooltip />} />
                              <Line
                                type="monotone"
                                dataKey="price"
                                stroke="#10B981"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 6 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
  
                      <div className="bg-gray-700 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-white mb-4">Action Distribution</h3>
                        <div className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={[getActionStats(session.actions)]}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis stroke="#9CA3AF" />
                              <YAxis stroke="#9CA3AF" />
                              <Tooltip />
                              <Bar dataKey="buy" fill="#10B981" name="Buy" />
                              <Bar dataKey="sell" fill="#EF4444" name="Sell" />
                              <Bar dataKey="hold" fill="#F59E0B" name="Hold" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
  
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-white mb-4">Trading Statistics</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <p className="text-gray-400">Total Trades</p>
                          <p className="text-2xl font-bold text-white">
                            {getActionStats(session.actions).totalTrades}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <p className="text-gray-400">Buy Orders</p>
                          <p className="text-2xl font-bold text-green-500">
                            {getActionStats(session.actions).buy}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <p className="text-gray-400">Sell Orders</p>
                          <p className="text-2xl font-bold text-red-500">
                            {getActionStats(session.actions).sell}
                          </p>
                        </div>
                        <div className="bg-gray-800 p-4 rounded-lg">
                          <p className="text-gray-400">Hold Actions</p>
                          <p className="text-2xl font-bold text-yellow-500">
                            {getActionStats(session.actions).hold}
                          </p>
                        </div>
                      </div>
                    </div>
  
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <h3 className="text-lg font-semibold text-white mb-2">Personality Analysis</h3>
                      <div className="text-gray-300 whitespace-pre-wrap">
                        {session.personality_report}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="text-center text-gray-400">
                No trading history available. Start a new game to begin trading!
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  export default Dashboard;