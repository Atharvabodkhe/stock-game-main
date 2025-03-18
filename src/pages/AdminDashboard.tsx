import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { useGameStore } from '../store/gameStore';
import { 
  Plus, 
  Trash2, 
  Users, 
  LogOut, 
  Play, 
  Pause, 
  X, 
  Edit, 
  Check, 
  AlertTriangle, 
  Trophy, 
  FileText, 
  TrendingUp, 
  TrendingDown
} from 'lucide-react';

interface GameRoom {
  id: string;
  name: string;
  min_players: number;
  max_players: number;
  status: string;
  created_at: string;
  started_at?: string;
  ended_at?: string;
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
  user_id: string;
  final_balance: number;
  rank: number;
  user: {
    name: string | null;
    email: string | null;
  } | null;
  game_session: {
    personality_report: string | null;
  } | null;
}

function AdminDashboard() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [newRoom, setNewRoom] = useState({
    name: '',
    min_players: 2,
    max_players: 5,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [startingGame, setStartingGame] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [results, setResults] = useState<GameResult[]>([]);
  const [showReport, setShowReport] = useState<string | null>(null);
  const [editingStock, setEditingStock] = useState<string | null>(null);
  const [newStockPrice, setNewStockPrice] = useState<string>('');
  const [editingLevel, setEditingLevel] = useState<number | null>(null);
  const [editedLevelNews, setEditedLevelNews] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<number>(0);
  const [editingLevelStock, setEditingLevelStock] = useState<{name: string, level: number} | null>(null);
  const [newLevelStockPrice, setNewLevelStockPrice] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const [showCompletedRooms, setShowCompletedRooms] = useState(false);
  const [completedRooms, setCompletedRooms] = useState<GameRoom[]>([]);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isPausingOrResuming, setIsPausingOrResuming] = useState(false);
  const [userNames, setUserNames] = useState<{[key: string]: string}>({});

  const { 
    stocks, 
    stockPerformance,
    levelStocks,
    isPaused,
    news,
    updateStockPrice,
    updateNewsForLevel,
    setPaused
  } = useGameStore();

  const { isSubscribed } = useRealtimeSubscription({
    channelName: 'admin_dashboard',
    tables: [
      { name: 'game_rooms', event: '*' },
      { name: 'room_players', event: '*' },
      {
        name: 'game_results',
        event: '*',
        filter: selectedRoom ? `room_id=eq.${selectedRoom}` : undefined
      }
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
        
        // Implement optimistic UI updates for immediate feedback
        if (table === 'game_rooms') {
          // Direct state manipulation based on event type
          if (eventType === 'INSERT' && newRecord) {
            // For new room, immediately add to state without refetching
            console.log('Optimistically adding new room to UI');
            setRooms(prevRooms => {
              // Check if this room already exists to avoid duplicates
              if (prevRooms.some(room => room.id === newRecord.id)) {
                return prevRooms;
              }
              
              // Add the new room with an empty players array
              return [{ ...newRecord, players: [] } as GameRoom, ...prevRooms];
            });
            
            // Then fetch just the players for this room
            const { data: playersData, error: playersError } = await supabase
              .from('room_players')
              .select(`
                id,
                user_id,
                status,
                session_id,
                user:users(name, email)
              `)
              .eq('room_id', newRecord.id);
              
            // Update the room with players once available
            if (playersData) {
              // Convert incoming data to safe RoomPlayer format
              const safePlayersData: RoomPlayer[] = (playersData || []).map(player => {
                // Use the helper function to safely extract user info
                const userInfo = safeUserExtract(player.user);
                
                // Ensure each player has the correct properties and shape
                return {
                  id: player.id || '',
                  user_id: player.user_id || '',
                  status: player.status || '',
                  session_id: player.session_id,
                  user: userInfo
                };
              });
              
              // Now update the rooms state with properly typed data
              setRooms(prevRooms => {
                return prevRooms.map(room => 
                  room.id === newRecord.id 
                    ? { ...room, players: safePlayersData }
                    : room
                );
              });
            }
          } 
          else if (eventType === 'UPDATE' && newRecord) {
            // For updated room, immediately update in state
            console.log('Optimistically updating room in UI');
            setRooms(prevRooms => 
              prevRooms.map(room => 
                room.id === newRecord.id 
                  ? { ...room, ...newRecord, players: room.players } as GameRoom
                  : room
              )
            );
          }
          else if (eventType === 'DELETE' && oldRecord) {
            // For deleted room, immediately remove from state
            console.log('Optimistically removing room from UI');
            setRooms(prevRooms => 
              prevRooms.filter(room => room.id !== oldRecord.id)
            );
          }
        } 
        else if (table === 'room_players') {
          if ((eventType === 'INSERT' || eventType === 'UPDATE') && newRecord) {
            // For player changes, update the specific player in the specific room
            console.log('Optimistically updating player in room');
            
            if (eventType === 'INSERT') {
              // For new players, we need to fetch user data first
              const { data: userData } = await supabase
                .from('users')
                .select('name, email')
                .eq('id', newRecord.user_id)
                .single();
                
              // Now update with the fetched user data
              setRooms(prevRooms => {
                return prevRooms.map(room => {
                  if (room.id === newRecord.room_id) {
                    // Check if player already exists (avoid duplicates)
                    if (room.players.some(p => p.id === newRecord.id)) {
                      return room;
                    }
                    
                    // Add the new player with user data
                    return {
                      ...room,
                      players: [...room.players, {
                        ...newRecord,
                        user: userData || { name: 'Loading...', email: '' }
                      }]
                    } as GameRoom;
                  }
                  return room;
                });
              });
            }
            else if (eventType === 'UPDATE') {
              // For updated players, just update the existing player
              setRooms(prevRooms => {
                return prevRooms.map(room => {
                  if (room.id === newRecord.room_id) {
                    return {
                      ...room,
                      players: room.players.map(player => 
                        player.id === newRecord.id
                          ? { ...player, ...newRecord }
                          : player
                      )
                    } as GameRoom;
                  }
                  return room;
                });
              });
            }
          }
          else if (eventType === 'DELETE' && oldRecord) {
            // For deleted player, remove from state
            console.log('Optimistically removing player from room');
            setRooms(prevRooms => {
              return prevRooms.map(room => {
                if (room.id === oldRecord.room_id) {
                  return {
                    ...room,
                    players: room.players.filter(p => p.id !== oldRecord.id)
                  } as GameRoom;
                }
                return room;
              });
            });
          }
        }
        else if (table === 'game_results' && selectedRoom) {
          console.log('Game results update detected, reloading results...');
          await loadResults(selectedRoom);
        }
        
        // For major state changes that might affect other aspects, refresh in background
        if (table === 'game_rooms' || table === 'room_players') {
          setTimeout(() => {
            loadRoomsFast().catch(e => console.error('Background refresh error:', e));
          }, 1000); // Refresh after 1 second to ensure data consistency
        }
      } catch (error) {
        console.error('Error handling realtime update:', error);
        
        // Try recovery silently in the background
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

  // Set up a periodic refresh as a backup for realtime (reduced from 30 seconds to 5 seconds)
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log('Performing backup periodic refresh');
      if (isAdmin) {
        loadRooms().catch((err: any) => {
          console.error('Error in periodic refresh:', err);
        });
      }
    }, 5000); // Refresh every 5 seconds as a fallback (reduced from 30s)
    
    return () => clearInterval(refreshInterval);
  }, [isAdmin]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          navigate('/');
          return;
        }
        checkAuth();
      } catch (error) {
        console.error('Error initializing auth:', error);
        navigate('/');
      }
    };

    initAuth();
  }, [navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadInitialData();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (error && retryCount < maxRetries) {
      const timer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        loadInitialData();
      }, Math.min(1000 * Math.pow(2, retryCount), 10000));

      return () => clearTimeout(timer);
    }
  }, [error, retryCount]);

  const initGameData = async () => {
    try {
      console.log('Initializing game data in database...');
      
      // Check if stocks table has data
      const { count: stocksCount, error: stocksError } = await supabase
        .from('stocks')
        .select('*', { count: 'exact', head: true });

      if (stocksError) {
        console.error('Error checking stocks table:', stocksError);
        return;
      }

      // If no stocks exist in the database, initialize with default values
      if (stocksCount === 0) {
        console.log('No stocks found in database, initializing with default values');
        
        // Get the stock data from the local store
        const defaultStocks = stocks.map(stock => ({
          name: stock.name,
          price: stock.price,
          created_at: new Date().toISOString()
        }));
        
        // Insert default stocks
        const { error: insertError } = await supabase
          .from('stocks')
          .insert(defaultStocks);
          
        if (insertError) {
          console.error('Error initializing stocks data:', insertError);
        }
      }

      // Check if level_stocks table has data
      const { count: levelStocksCount, error: levelStocksError } = await supabase
        .from('level_stocks')
        .select('*', { count: 'exact', head: true });

      if (levelStocksError) {
        console.error('Error checking level_stocks table:', levelStocksError);
        return;
      }

      // If no level stocks exist in the database, initialize with default values
      if (levelStocksCount === 0) {
        console.log('No level stocks found in database, initializing with default values');
        
        // Prepare level stocks data
        const defaultLevelStocks = levelStocks.flatMap(level => 
          level.stocks.map(stock => ({
            level: level.level,
            stock_name: stock.name,
            price: stock.price,
            created_at: new Date().toISOString()
          }))
        );
        
        // Insert default level stocks
        const { error: insertError } = await supabase
          .from('level_stocks')
          .insert(defaultLevelStocks);
          
        if (insertError) {
          console.error('Error initializing level stocks data:', insertError);
        }
      }

      // Check if news table has data
      const { count: newsCount, error: newsError } = await supabase
        .from('news')
        .select('*', { count: 'exact', head: true });

      if (newsError) {
        console.error('Error checking news table:', newsError);
        return;
      }

      // If no news exist in the database, initialize with default values
      if (newsCount === 0) {
        console.log('No news found in database, initializing with default values');
        
        // Prepare news data
        const defaultNews = news.map((content, level) => ({
          level,
          content,
          created_at: new Date().toISOString()
        }));
        
        // Insert default news
        const { error: insertError } = await supabase
          .from('news')
          .insert(defaultNews);
          
        if (insertError) {
          console.error('Error initializing news data:', insertError);
        }
      }
      
      console.log('Game data initialization complete');
    } catch (error) {
      console.error('Error initializing game data:', error);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      await Promise.all([
        loadRooms(),
        loadCompletedRooms(),
        initGameData(), // Initialize game data in the database
      ]);
      
      // Fetch the game state directly instead of using get()
      await supabase
        .from('game_state')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching game state:', error);
          } else if (data) {
            // Update the isPaused state based on the database value
            setPaused(data.is_paused);
          }
        });
      
      setLoading(false);
      setRetryCount(0);
    } catch (error) {
      console.error('Error loading initial data:', error);
      setError('Failed to load data. Retrying...');
      
      if (retryCount < maxRetries) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          loadInitialData();
        }, 2000 * Math.pow(2, retryCount));
      } else {
        setLoading(false);
      }
    }
  };

  const checkAuth = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        throw new Error('Authentication error. Please sign in again.');
      }

      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (adminError || !adminData) {
        throw new Error('Unauthorized access. Admin privileges required.');
      }

      setIsAdmin(true);
    } catch (error) {
      console.error('Error checking admin status:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadRooms = async () => {
    try {
      console.log('Loading rooms...');
      const { data: roomsData, error: roomsError } = await supabase
        .from('game_rooms')
        .select('*')
        .order('created_at', { ascending: false });

      if (roomsError) throw roomsError;

      if (roomsData) {
        console.log('Fetched rooms:', roomsData.length);
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
                .eq('room_id', room.id);

              if (playersError) throw playersError;

              console.log(`Loaded ${playersData?.length || 0} players for room ${room.id}`);
              return {
                ...room,
                players: playersData || [],
              };
            } catch (error) {
              console.error(`Error loading players for room ${room.id}:`, error);
              return { ...room, players: [] };
            }
          })
        );

        console.log('Setting rooms with players:', roomsWithPlayers.length);
        setRooms(roomsWithPlayers);
        setError(null);
      }
    } catch (error) {
      console.error('Error loading rooms:', error);
      setError('Failed to load game rooms');
      throw error;
    }
  };

  const createRoom = async () => {
    try {
      setError(null);
      console.log('Creating new room:', newRoom);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data: adminData } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!adminData) {
        throw new Error('Admin privileges required');
      }

      const { data: roomData, error } = await supabase
        .from('game_rooms')
        .insert([
          {
            ...newRoom,
            created_by: adminData.id,
            status: 'open',
          },
        ])
        .select()
        .single();

      if (error) throw error;

      console.log('Room created successfully:', roomData);
      setNewRoom({
        name: '',
        min_players: 2,
        max_players: 5,
      });
    } catch (error) {
      console.error('Error creating room:', error);
      setError(error instanceof Error ? error.message : 'Failed to create room');
    }
  };

  const deleteRoom = async (roomId: string) => {
    try {
      setError(null);
      console.log('Deleting room:', roomId);

      // First, delete all players in the room
      const { error: playersError } = await supabase
        .from('room_players')
        .delete()
        .eq('room_id', roomId);

      if (playersError) {
        console.error('Error deleting room players:', playersError);
      }

      // Then delete the room
      const { error: roomError } = await supabase
        .from('game_rooms')
        .delete()
        .eq('id', roomId);

      if (roomError) throw roomError;

      console.log('Room deleted successfully:', roomId);
      setDeleteConfirmation(null);
    } catch (error) {
      console.error('Error deleting room:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete room');
    }
  };

  const startGame = async (roomId: string) => {
    try {
      console.log(`Starting game for room ${roomId}`);
      setStartingGame(true);
      setError(null);

      const room = rooms.find(r => r.id === roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      const joinedPlayers = room.players.filter(p => p.status === 'joined');
      if (joinedPlayers.length < room.min_players) {
        throw new Error(`Need at least ${room.min_players} players to start`);
      }

      // Step 1: Create game sessions for each player first
      // This ensures sessions exist before we update room status
      console.log(`Creating game sessions for ${joinedPlayers.length} players`);
      const playerSessions = await Promise.all(joinedPlayers.map(async (player) => {
        try {
          // Create session
          const { data: session, error: sessionError } = await supabase
            .from('game_sessions')
            .insert([
              {
                user_id: player.user_id,
                final_balance: 10000,
                room_id: roomId,
              }
            ])
            .select()
            .single();

          if (sessionError) throw sessionError;
          if (!session) throw new Error('No session created');
          
          console.log(`Created session ${session.id} for player ${player.user_id}`);

          return {
            id: player.id,
            user_id: player.user_id,
            session_id: session.id,
          };
        } catch (error) {
          console.error(`Error creating session for player ${player.user_id}:`, error);
          throw error;
        }
      }));
      
      // Step 2: Mark the room as in preparation state
      // This lets clients know a game is about to start
      console.log('Setting room status to preparing');
      const { error: prepError } = await supabase
        .from('game_rooms')
        .update({
          status: 'preparing',
        })
        .eq('id', roomId);

      if (prepError) {
        console.error('Error updating room to preparing state:', prepError);
      }
      
      // Short pause to allow clients to prepare
      await new Promise(resolve => setTimeout(resolve, 200));

      // Step 3: Update all player statuses at once for a synchronized start
      // This batched update helps ensure all players get updated close together
      console.log('Updating all players to in_game status');
      const updatePromises = playerSessions.map(player => {
        return supabase
          .from('room_players')
          .update({
            status: 'in_game',
            session_id: player.session_id,
          })
          .eq('id', player.id);
      });
      
      await Promise.all(updatePromises);
      
      // Step 4: Finally update room status to in_progress
      // Players should already be redirected by their session updates
      console.log('Setting room status to in_progress');
      const { error: roomError } = await supabase
        .from('game_rooms')
        .update({
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', roomId);

      if (roomError) throw roomError;
      
      console.log('Game started successfully for room', roomId);
    } catch (error) {
      console.error('Error starting game:', error);
      setError(error instanceof Error ? error.message : 'Failed to start game');
      
      // Attempt to revert room to open state if there was an error
      try {
        await supabase
          .from('game_rooms')
          .update({ status: 'open' })
          .eq('id', roomId);
      } catch (revertError) {
        console.error('Error reverting room status:', revertError);
      }
    } finally {
      setStartingGame(false);
    }
  };

  const loadResults = async (roomId: string) => {
    try {
      setError(null);
      console.log('Loading game results for room:', roomId);
      
      // First, check if the room is completed
      const { data: roomData, error: roomError } = await supabase
        .from('game_rooms')
        .select('status, ended_at')
        .eq('id', roomId)
        .single();
        
      if (roomError) {
        console.error('Error checking room status:', roomError);
      } else if (roomData && roomData.status !== 'completed') {
        console.log('Room is not completed yet, status:', roomData.status);
      }
      
      // Fetch results regardless of room status
      const { data, error } = await supabase
        .from('game_results')
        .select(`
          *,
          user:users(name, email),
          game_session:game_sessions(personality_report)
        `)
        .eq('room_id', roomId)
        .order('final_balance', { ascending: false });

      if (error) throw error;
      
      // If we have results, update the ranks based on final_balance
      if (data && data.length > 0) {
        console.log(`Found ${data.length} results for room ${roomId}`);
        
        // Sort by final balance and assign ranks
        const sortedResults = [...data].sort((a, b) => b.final_balance - a.final_balance);
        
        for (let i = 0; i < sortedResults.length; i++) {
          sortedResults[i].rank = i + 1;
        }
        
        setResults(sortedResults);
      } else {
        console.log('No results found for room:', roomId);
        setResults([]);
      }
      
      setSelectedRoom(roomId);
    } catch (error) {
      console.error('Error loading results:', error);
      setError('Failed to load game results');
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

  const handleStockPriceUpdate = (stockName: string) => {
    const price = parseFloat(newStockPrice);
    if (!isNaN(price) && price > 0) {
      // Pass the exact price directly to updateStockPrice without formatting
      updateStockPrice(stockName, price);
      setEditingStock(null);
      setNewStockPrice('');
      
      // Show feedback that the price was updated
      setFeedbackMessage(`${stockName} price updated to $${price}`);
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const handleLevelStockPriceUpdate = (stockName: string, level: number) => {
    const price = parseFloat(newLevelStockPrice);
    if (!isNaN(price) && price > 0) {
      // Pass the exact price directly to updateStockPrice without formatting
      updateStockPrice(stockName, price, level);
      setEditingLevelStock(null);
      setNewLevelStockPrice('');
      
      // Show feedback that the price was updated
      setFeedbackMessage(`Level ${level+1} ${stockName} price updated to $${price}`);
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const handleNewsUpdate = (level: number) => {
    if (editedLevelNews.trim()) {
      updateNewsForLevel(level, editedLevelNews);
      setEditingLevel(null);
      setEditedLevelNews('');
    }
  };

  const handleMinPlayersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? '' : parseInt(e.target.value, 10);
    setNewRoom(prev => ({
      ...prev,
      min_players: value === '' ? 2 : Math.max(2, Math.min(5, value))
    }));
  };

  const handleMaxPlayersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? '' : parseInt(e.target.value, 10);
    setNewRoom(prev => ({
      ...prev,
      max_players: value === '' ? 5 : Math.max(prev.min_players, Math.min(5, value))
    }));
  };

  const handlePauseResumeGame = async () => {
    try {
      setError(null);
      setIsPausingOrResuming(true);
      
      console.log(`${isPaused ? 'Resuming' : 'Pausing'} game...`);
      await setPaused(!isPaused);
      
      // Show feedback to the admin that the action was successful
      const message = !isPaused 
        ? 'Game paused. All players are now waiting for you to resume.' 
        : 'Game resumed. Players can continue playing.';
      
      setFeedbackMessage(message);
      
      // Clear feedback after 3 seconds
      setTimeout(() => {
        setFeedbackMessage(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error toggling game pause state:', error);
      setError('Failed to update game state. Please try again.');
    } finally {
      setIsPausingOrResuming(false);
    }
  };

  // Function to fetch user name when it's not available in the player data
  const fetchUserName = async (userId: string): Promise<string> => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('name')
        .eq('id', userId)
        .single();

      if (error || !data || !data.name) {
        console.error('Error fetching user name:', error);
        return 'Unknown';
      }

      return data.name;
    } catch (error) {
      console.error('Exception fetching user name:', error);
      return 'Unknown';
    }
  };

  // Add a priority data loader function for critical updates
  const loadRoomsFast = async () => {
    try {
      console.log('Fast-loading rooms...');
      // Skip detailed logging to reduce overhead
      const { data: roomsData, error: roomsError } = await supabase
        .from('game_rooms')
        .select('*')
        .order('created_at', { ascending: false });

      if (roomsError) throw roomsError;

      if (roomsData) {
        // Fast load of players - parallel fetch
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
                .eq('room_id', room.id);

              if (playersError) throw playersError;

              return {
                ...room,
                players: playersData || [],
              };
            } catch (error) {
              return { ...room, players: [] };
            }
          })
        );

        // Use functional update to avoid dependency on current state
        setRooms(roomsWithPlayers);
        setError(null);
      }
    } catch (error) {
      console.error('Error fast-loading rooms:', error);
      // Don't set error state to avoid UI disruption during fast updates
    }
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

  // Add a function to load completed rooms
  const loadCompletedRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('game_rooms')
        .select(`
          *,
          players:room_players(
            id,
            user_id,
            status,
            session_id,
            user:users(name, email)
          )
        `)
        .eq('status', 'completed')
        .order('ended_at', { ascending: false });

      if (error) throw error;
      setCompletedRooms(data || []);
    } catch (error) {
      console.error('Error loading completed rooms:', error);
    }
  };

  // Effect to load completed rooms
  useEffect(() => {
    loadCompletedRooms();

    const completedRoomsSubscription = supabase
      .channel('completed_rooms_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_rooms',
          filter: 'status=eq.completed'
        },
        (payload) => {
          console.log('Completed room change received:', payload);
          loadCompletedRooms();
        }
      )
      .subscribe();

    return () => {
      completedRoomsSubscription.unsubscribe();
    };
  }, []);

  // Effect to fetch missing user names
  useEffect(() => {
    const fetchMissingUserNames = async () => {
      const missingUserIds: string[] = [];
      
      // Get all player user_ids that need names
      rooms.forEach(room => {
        room.players.forEach(player => {
          if (!player.user?.name && player.user_id && !userNames[player.user_id]) {
            missingUserIds.push(player.user_id);
          }
        });
      });
      
      // If no missing user IDs, no need to fetch
      if (missingUserIds.length === 0) return;
      
      console.log(`Fetching names for ${missingUserIds.length} users`);
      
      // Fetch each user's name and update the state
      const newNames: {[key: string]: string} = {...userNames};
      
      await Promise.all(
        missingUserIds.map(async (userId) => {
          const name = await fetchUserName(userId);
          newNames[userId] = name;
        })
      );
      
      setUserNames(newNames);
    };
    
    fetchMissingUserNames();
  }, [rooms, userNames]);

  // Modify the results section to only show for admins
  const renderResults = () => {
    if (!isAdmin) {
      return (
        <div className="text-center text-gray-400 mt-4">
          Only administrators can view detailed game results.
        </div>
      );
    }

    return (
      <div className="mt-8">
        <h3 className="text-xl font-semibold mb-4">Game Results</h3>
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700">
                <th className="py-3 px-4 text-left">Rank</th>
                <th className="py-3 px-4 text-left">Player</th>
                <th className="py-3 px-4 text-right">Final Balance</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result.id} className="border-t border-gray-700">
                  <td className="py-3 px-4">
                    {result.rank === 1 ? '🥇' : 
                     result.rank === 2 ? '🥈' : 
                     result.rank === 3 ? '🥉' : 
                     `#${result.rank}`}
                  </td>
                  <td className="py-3 px-4">{result.user?.name || (result.user_id && userNames[result.user_id]) || 'Unknown Player'}</td>
                  <td className="py-3 px-4 text-right">${result.final_balance.toFixed(2)}</td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => setShowReport(result.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Modify the completed rooms section to show real-time updates
  const renderCompletedRooms = () => {
    if (!isAdmin) return null;

    return (
      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Completed Rooms</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {completedRooms.map((room) => (
            <div key={room.id} className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-2">{room.name}</h3>
              <p className="text-gray-400 mb-2">Completed at: {room.ended_at ? new Date(room.ended_at).toLocaleString() : 'Unknown'}</p>
              <button
                onClick={() => {
                  setSelectedRoom(room.id);
                  loadResults(room.id);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors w-full"
              >
                View Results
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <Users className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <p className="text-xl">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Users className="text-blue-500" size={32} />
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>

        {error && (
          <div className="bg-red-500 text-white p-4 rounded-lg mb-8 flex items-center gap-3">
            <AlertTriangle size={24} />
            <div>
              <p className="font-semibold">{error}</p>
              {retryCount > 0 && retryCount < maxRetries && (
                <p className="text-sm mt-1">Retrying... ({retryCount}/{maxRetries})</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold">Stock Control</h2>
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(parseInt(e.target.value))}
                className="bg-gray-700 text-white px-3 py-2 rounded-lg"
              >
                {levelStocks.map((_, index) => (
                  <option key={index} value={index}>Level {index + 1}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handlePauseResumeGame}
                disabled={isPausingOrResuming}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  isPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'
                } ${isPausingOrResuming ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isPaused ? (
                  <>
                    <Play size={20} />
                    Resume Game
                  </>
                ) : (
                  <>
                    <Pause size={20} />
                    Pause Game
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {levelStocks[selectedLevel].stocks.map((stock) => {
              const currentStock = stocks.find(s => s.name === stock.name);
              const performance = stockPerformance.find(p => p.name === stock.name);
              const change = performance?.change || 0;

              return (
                <div key={stock.name} className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">{stock.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${
                        change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-white'
                      }`}>
                        ${stock.price.toFixed(2)}
                      </span>
                      {change > 0 ? (
                        <TrendingUp className="text-green-500" size={20} />
                      ) : (
                        <TrendingDown className="text-red-500" size={20} />
                      )}
                    </div>
                  </div>

                  {editingLevelStock?.name === stock.name && editingLevelStock?.level === selectedLevel ? (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={newLevelStockPrice}
                        onChange={(e) => setNewLevelStockPrice(e.target.value)}
                        className="flex-1 bg-gray-600 text-white px-3 py-1 rounded"
                        placeholder="New price..."
                        min="0.01"
                        step="0.01"
                      />
                      <button
                        onClick={() => handleLevelStockPriceUpdate(stock.name, selectedLevel)}
                        className="text-green-500 hover:text-green-400"
                      >
                        <Check size={20} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingLevelStock(null);
                          setNewLevelStockPrice('');
                        }}
                        className="text-red-500 hover:text-red-400"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingLevelStock({ name: stock.name, level: selectedLevel });
                        setNewLevelStockPrice(stock.price.toString());
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
                    >
                      Update Level {selectedLevel + 1} Price
                    </button>
                  )}

                  {selectedLevel === 0 && (
                    <div className="mt-2 text-sm text-gray-400">
                      Change: <span className={change > 0 ? 'text-green-500' : 'text-red-500'}>
                        {change > 0 ? '+' : ''}{change.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-semibold mb-4">Level News Management</h2>
          <div className="space-y-4">
            {news.map((newsItem, index) => (
              <div key={index} className="bg-gray-700 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold mb-2">Level {index + 1}</h3>
                  {editingLevel === index ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleNewsUpdate(index)}
                        className="text-green-500 hover:text-green-400"
                      >
                        <Check size={20} />
                      </button>
                      <button
                        onClick={() => {
                          setEditingLevel(null);
                          setEditedLevelNews('');
                        }}
                        className="text-red-500 hover:text-red-400"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingLevel(index);
                        setEditedLevelNews(newsItem);
                      }}
                      className="text-blue-500 hover:text-blue-400"
                    >
                      <Edit size={20} />
                    </button>
                  )}
                </div>
                {editingLevel === index ? (
                  <textarea
                    value={editedLevelNews}
                    onChange={(e) => setEditedLevelNews(e.target.value)}
                    className="w-full bg-gray-600 text-white px-3 py-2 rounded mt-2"
                    rows={3}
                    placeholder="Enter news for this level..."
                  />
                ) : (
                  <p className="text-gray-300">{newsItem}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-white">Game Rooms</h2>
          </div>

          <div className="flex gap-4 mb-6">
            <input
              type="text"
              value={newRoom.name}
              onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
              placeholder="Room name..."
              className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg"
            />
            <input
              type="number"
              value={newRoom.min_players}
              onChange={handleMinPlayersChange}
              min="2"
              max="5"
              className="w-24 bg-gray-700 text-white px-4 py-2 rounded-lg"
              placeholder="Min"
            />
            <input
              type="number"
              value={newRoom.max_players}
              onChange={handleMaxPlayersChange}
              min="2"
              max="5"
              className="w-24 bg-gray-700 text-white px-4 py-2 rounded-lg"
              placeholder="Max"
            />
            <button
              onClick={createRoom}
              disabled={!newRoom.name || newRoom.min_players < 2 || newRoom.max_players < newRoom.min_players}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg disabled:bg-gray-600"
            >
              <Plus size={20} />
              Create Room
            </button>
          </div>

          <div className="space-y-6">
            {rooms.map((room) => (
              <div key={room.id} className="bg-gray-700 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{room.name}</h3>
                    <p className="text-sm text-gray-400">
                      Players: {room.players.length} / {room.max_players}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {room.status === 'open' && (
                      <button
                        onClick={() => startGame(room.id)}
                        disabled={startingGame || room.players.filter(p => p.status === 'joined').length < room.min_players}
                        className={`flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg disabled:bg-gray-600`}
                      >
                        <Play size={20}/>
                        Start Game
                      </button>
                    )}
                    {deleteConfirmation === room.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => deleteRoom(room.id)}
                          className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirmation(null)}
                          className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmation(room.id)}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
                      >
                        <Trash2 size={20} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {room.status === 'completed' && (
                  <button
                    onClick={() => loadResults(room.id)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg mb-4"
                  >
                    <Trophy size={20} />
                    View Results
                  </button>
                )}

                {selectedRoom === room.id && results.length > 0 && (
                  <div className="mt-4 bg-gray-800 p-4 rounded-lg">
                    <h4 className="text-lg font-semibold mb-4">Game Results</h4>
                    <div className="space-y-4">
                      {results.map((result) => (
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
                              <div>
                                <p className="font-semibold">{result.user?.name || (result.user_id && userNames[result.user_id]) || 'Loading...'}</p>
                                <p className="text-sm text-gray-400">{result.user?.email || ''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-green-500 font-bold">
                                ${result.final_balance.toFixed(2)}
                              </div>
                              <button
                                onClick={() => setShowReport(result.id)}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
                              >
                                <FileText size={16} />
                                Report
                              </button>
                            </div>
                          </div>
                          {showReport === result.id && (
                            <div className="mt-4 bg-gray-800 p-4 rounded-lg">
                              <div className="flex justify-between items-center mb-2">
                                <h4 className="font-semibold">Trading Analysis</h4>
                                <button
                                  onClick={() => setShowReport(null)}
                                  className="text-gray-400 hover:text-white"
                                >
                                  <X size={20} />
                                </button>
                              </div>
                              <p className="text-gray-300 whitespace-pre-wrap">
                                {result.game_session?.personality_report || 'No analysis available'}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <h4 className="font-semibold mb-2">Players</h4>
                  <div className="space-y-2">
                    {room.players.map((player) => (
                      <div
                        key={player.id}
                        className="flex justify-between items-center bg-gray-600 p-2 rounded"
                      >
                        <div>
                          <p className="font-medium">{player.user?.name || (player.user_id && userNames[player.user_id]) || 'Loading...'}</p>
                          <p className="text-sm text-gray-400">{player.user?.email || ''}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-sm ${
                            player.status === 'joined' ? 'bg-green-600' :
                            player.status === 'in_game' ? 'bg-blue-600' :
                            player.status === 'completed' ? 'bg-purple-600' :
                            'bg-gray-600'
                          }`}>
                            {player.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;