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
  completion_time?: string;
  all_players_completed?: boolean;
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
  profit_percentage?: number;
  user: {
    name: string | null;
    email: string | null;
  } | null;
  game_session: {
    personality_report: string | null;
    trading_history?: string | null;
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
  const [endingGameConfirmation, setEndingGameConfirmation] = useState<string | null>(null);
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
        const { table, payload } = message;
        const eventType = payload.eventType || (payload.type as string);
        const newRecord = payload.new || payload.record;
        const oldRecord = payload.old || payload.old_record;
        
        console.log(`Received ${eventType} event for ${table}:`, { newRecord, oldRecord });
        
        if (!newRecord && !oldRecord) {
          console.log('Received event without data payload, ignoring');
          return;
        }
        
        if (table === 'game_rooms') {
          if (eventType === 'UPDATE' && newRecord) {
            console.log('Room update detected:', newRecord);
            
            if (newRecord.status === 'completed' || newRecord.all_players_completed === true) {
              console.log(`Room ${newRecord.id} is now completed, moving to completed section`);
              
              setRooms(prevRooms => prevRooms.filter(room => room.id !== newRecord.id));
              
              loadCompletedRooms().then(completedRooms => {
                setCompletedRooms(completedRooms);
              });
            } else {
              // For rooms that should be visible in the Game Rooms section,
              // ensure all_players_completed is FALSE for room status 'preparing' or 'in_progress'
              if (newRecord.status === 'preparing' || newRecord.status === 'in_progress') {
                if (newRecord.all_players_completed === true) {
                  console.log(`Room ${newRecord.id} has status ${newRecord.status} but all_players_completed is TRUE. Fixing locally to ensure visibility.`);
                  newRecord.all_players_completed = false;
                  
                  // Also fix in database to ensure consistency
                  (async () => {
                    try {
                      await supabase.from('game_rooms')
                        .update({ all_players_completed: false })
                        .eq('id', newRecord.id);
                      console.log(`Fixed all_players_completed for room ${newRecord.id} in database`);
                    } catch (error) {
                      console.error(`Error fixing room ${newRecord.id} visibility in database:`, error);
                    }
                  })();
                }
              }
              
            setRooms(prevRooms => 
              prevRooms.map(room => 
                room.id === newRecord.id 
                    ? { ...room, ...newRecord } 
                  : room
              )
            );
          }
          } else if (eventType === 'INSERT' && newRecord) {
            // Handle new room
            // ... existing code ...
          } else if (eventType === 'DELETE' && oldRecord) {
            // Handle room deletion
            // ... existing code ...
          }
        } else if (table === 'room_players') {
          if ((eventType === 'UPDATE' || eventType === 'INSERT') && newRecord) {
            console.log('Player update detected:', newRecord);
            
            // If a player status changed to completed, check if all players in that room are now completed
            if (newRecord.status === 'completed') {
              // Get room ID from the player record
              const roomId = newRecord.room_id;
              
              // Find the current room in state
              const existingRoom = rooms.find(room => room.id === roomId);
              if (existingRoom) {
                // Update the player in the current UI state first
                setRooms(prevRooms => 
                  prevRooms.map(room => {
                    if (room.id !== roomId) return room;
                    
                    // Update this player's status and check if all are completed
                    const updatedPlayers = room.players.map(player => 
                        player.id === newRecord.id
                        ? { ...player, status: 'completed' } 
                          : player
                    );
                    
                    // Check if all non-left players are now completed
                    const activePlayers = updatedPlayers.filter(p => p.status !== 'left');
                    const allCompleted = activePlayers.length > 0 && 
                                       activePlayers.every(p => p.status === 'completed');
                    
                    if (allCompleted) {
                      console.log(`All players in room ${roomId} are now completed`);
                      
                      // Update the room in the database
                      supabase
                        .from('game_rooms')
                        .update({ 
                          status: 'completed',
                          all_players_completed: true,
                          completion_time: new Date().toISOString()
                        })
                        .eq('id', roomId)
                        .then(() => {
                          // Remove from active rooms list
                          setRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
                          
                          // Refresh completed rooms list
                          loadCompletedRooms().then(completedRooms => {
                            setCompletedRooms(completedRooms);
                });
              });
            }
                    
                    return { ...room, players: updatedPlayers };
                  })
                );
              }
            }
            // Regular player update handling (for non-completed players)
            else {
              // Update the player in the current UI state
              setRooms(prevRooms => 
                prevRooms.map(room => {
                  if (room.id !== newRecord.room_id) return room;
                  
                  const updatedPlayers = room.players.map(player => 
                    player.id === newRecord.id 
                      ? { ...player, status: newRecord.status } 
                      : player
                  );
                  
                  return { ...room, players: updatedPlayers };
                })
              );
            }
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
        setTimeout(() => {
          loadRoomsFast();
          loadCompletedRooms();
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

  const loadInitialData = async () => {
    try {
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/');
        return;
      }

      // Load open rooms as before
      await loadRooms();
      
      // Also load completed rooms
      const completedRoomsResult = await loadCompletedRooms();
      setCompletedRooms(completedRoomsResult);
      
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
      console.log('Loading game rooms...');
      
      // Only load rooms that are not completed - FIX: Corrected query syntax
      const { data: roomsData, error: roomsError } = await supabase
        .from('game_rooms')
        .select('*')
        .or('status.eq.open,and(status.eq.in_progress,all_players_completed.eq.false)')
        .order('created_at', { ascending: false });

      if (roomsError) throw roomsError;

      console.log(`Loaded ${roomsData?.length || 0} active rooms`);

      if (roomsData) {
        // Process rooms to include player data
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

              return { ...room, players: playersData || [] };
            } catch (error) {
              console.error('Error loading players for room:', error);
              return { ...room, players: [] };
            }
          })
        );

        setRooms(roomsWithPlayers);
      }
    } catch (error) {
      console.error('Error loading rooms:', error);
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
          all_players_completed: false // Explicitly set to false to ensure room visibility
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

  const endGame = async (roomId: string) => {
    try {
      console.log(`Ending game for room ${roomId}`);
      setError(null);

      const room = rooms.find(r => r.id === roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Get all in-game players in the room
      const inGamePlayers = room.players.filter(p => p.status === 'in_game');
      if (inGamePlayers.length === 0) {
        console.log('No active players found in this room');
      } else {
        console.log(`Found ${inGamePlayers.length} active players to mark as completed`);
      }

      // Mark all players as completed
      const updatePromises = inGamePlayers.map(player => {
        return supabase
          .from('room_players')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            completion_status: 'completed'
          })
          .eq('id', player.id);
      });
      
      await Promise.all(updatePromises);
      
      // Update all game sessions for this room
      const { error: sessionsError } = await supabase
        .from('game_sessions')
        .update({
          completed_at: new Date().toISOString()
        })
        .eq('room_id', roomId)
        .is('completed_at', null);
        
      if (sessionsError) {
        console.error('Error updating game sessions:', sessionsError);
      }

      // Finally, mark the room as completed
      const { error: roomError } = await supabase
        .from('game_rooms')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          completion_time: new Date().toISOString()
        })
        .eq('id', roomId);

      if (roomError) throw roomError;
      
      console.log('Game successfully ended for room', roomId);
      
      // Reset confirmation state
      setEndingGameConfirmation(null);
      
      // Refresh the rooms list
      loadRoomsFast();
    } catch (error) {
      console.error('Error ending game:', error);
      setError(error instanceof Error ? error.message : 'Failed to end game');
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
      
      // Fetch results regardless of room status - include personality_report and trading_history
      const { data, error } = await supabase
        .from('game_results')
        .select(`
          *,
          user:users!user_id(name, email),
          game_session:game_sessions!session_id(personality_report, trading_history)
        `)
        .eq('room_id', roomId)
        .order('final_balance', { ascending: false });

      if (error) throw error;
      
      // If we have results, update the ranks based on final_balance
      if (data && data.length > 0) {
        console.log(`Found ${data.length} results for room ${roomId}`);
        
        // Sort by final balance and assign ranks
        const sortedResults = [...data].sort((a, b) => b.final_balance - a.final_balance);
        
        // Calculate profit percentage for each result
        for (let i = 0; i < sortedResults.length; i++) {
          sortedResults[i].rank = i + 1;
          
          // Calculate profit percentage (starting balance is 10000)
          const startingBalance = 10000;
          sortedResults[i].profit_percentage = ((sortedResults[i].final_balance - startingBalance) / startingBalance) * 100;
          
          // Process user data for each result
          if (sortedResults[i].user_id && !sortedResults[i].user) {
            console.log('Result missing user object but has user_id:', sortedResults[i].user_id);
            // Try to use the user_id as a fallback for display
            sortedResults[i].user = { 
              name: `User-${sortedResults[i].user_id.substring(0, 8)}`,
              email: '' 
            };
          }
        }
        
        console.log('Processed results:', sortedResults);
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
      updateStockPrice(stockName, price);
      setEditingStock(null);
      setNewStockPrice('');
    }
  };

  const handleLevelStockPriceUpdate = (stockName: string, level: number) => {
    const price = parseFloat(newLevelStockPrice);
    if (!isNaN(price) && price > 0) {
      updateStockPrice(stockName, price, level);
      setEditingLevelStock(null);
      setNewLevelStockPrice('');
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

  // Add a priority data loader function for critical updates
  const loadRoomsFast = async () => {
    try {
      // Only load rooms that are not completed
      const { data: roomsData, error: roomsError } = await supabase
        .from('game_rooms')
        .select('*')
        .or('status.eq.open,and(status.eq.in_progress,all_players_completed.eq.false)')
        .order('created_at', { ascending: false });

      if (roomsError) throw roomsError;

      if (roomsData) {
        // Track previously completed players to preserve their status
        const prevCompletedPlayerMap = new Map();
        rooms.forEach(room => {
          room.players.forEach(player => {
            if (player.status === 'completed') {
              prevCompletedPlayerMap.set(player.id, true);
            }
          });
        });
        
        console.log(`Fast loading ${roomsData.length} rooms with previously completed players: ${prevCompletedPlayerMap.size}`);

        const roomsWithPlayers = await Promise.all(
          roomsData.map(async (room) => {
            try {
              const { data: playersData, error: playersError } = await supabase
                .from('room_players')
                .select(`
                  id,
                  user_id,
                  status,
                  completed_at,
                  session_id,
                  user:users(name, email)
                `)
                .eq('room_id', room.id);

              if (playersError) throw playersError;
              
              // Process player data to ensure consistency
              const processedPlayers = playersData?.map(player => {
                // Convert any user object to consistent format
                const userInfo = safeUserExtract(player.user as unknown as GameResult['user']);
                
                // Safety check for previously completed players
                let status = player.status;
                if (prevCompletedPlayerMap.has(player.id) && status !== 'left' && status !== 'completed') {
                  console.warn(`Player ${player.id} was previously completed but now has status ${status}, fixing to completed`);
                  status = 'completed';
                }
                
                // Check if player has completed_at timestamp but not marked as completed
                if (player.completed_at && status !== 'completed' && status !== 'left') {
                  console.warn(`Player ${player.id} has completed_at timestamp but status is ${status}, fixing to completed`);
                  status = 'completed';
                }
                
                return {
                  ...player,
                  status,
                  user: userInfo
                };
              }) || [];

              // Are all non-left players completed?
              const nonLeftPlayers = processedPlayers.filter(p => p.status !== 'left');
              const allCompleted = nonLeftPlayers.length > 0 && 
                                 nonLeftPlayers.every(p => p.status === 'completed');
              
              // If all players are completed, move this room to completed section
              if (allCompleted && room.status !== 'completed') {
                console.log(`All players in room ${room.id} are completed, updating room status`);
                
                // Update the room status in the database
                await supabase
                  .from('game_rooms')
                  .update({ 
                    status: 'completed',
                    all_players_completed: true,
                    completion_time: new Date().toISOString()
                  })
                  .eq('id', room.id);
                  
                // Remove this room from the active rooms list and refresh completed rooms
                loadCompletedRooms().then(completedRooms => {
                  setCompletedRooms(completedRooms);
                });
                
                // Skip adding this room to active rooms
                return null;
              }

              return {
                ...room,
                players: processedPlayers
              };
            } catch (error) {
              console.error('Error in room processing:', error);
              return { ...room, players: [] };
            }
          })
        );

        // Filter out null entries (rooms that were moved to completed)
        const validRooms = roomsWithPlayers.filter(room => room !== null);
        
        setRooms(validRooms);
      }
    } catch (error) {
      console.error('Error in fast room loading:', error);
      // Avoid setting error state for fast updates to prevent UI disruptions
    }
  };

  // Helper function to safely get profit percentage
  const getProfit = (result: GameResult): number => {
    return result.profit_percentage !== undefined ? result.profit_percentage : 0;
  };

  // Helper function to safely extract user info
  const safeUserExtract = (user: GameResult['user']) => {
    return {
      name: user?.name || 'Unknown Player',
      email: user?.email || ''
    };
  };

  // Helper function to handle load errors with retry logic
  const handleLoadError = (error: any) => {
    console.error('Error loading data:', error);
    setError(`Failed to load data: ${error.message || 'Unknown error'}`);
    
    // Implement retry logic with backoff
    if (retryCount < maxRetries) {
      const nextRetry = retryCount + 1;
      setRetryCount(nextRetry);
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, nextRetry - 1) * 1000;
      console.log(`Retrying in ${delay}ms (attempt ${nextRetry}/${maxRetries})...`);
      
      setTimeout(() => {
        loadRoomsFast();
      }, delay);
    }
  };

  // Add this new function to load completed rooms
  const loadCompletedRooms = async () => {
    try {
      console.log('Loading completed rooms...');
      
      // Use the function we created in the database
      const { data: completedRoomsData, error: completedRoomsError } = await supabase
        .rpc('get_completed_rooms_with_players');

      if (completedRoomsError) {
        console.error('Error loading completed rooms:', completedRoomsError);
        return [];
      }

      console.log(`Loaded ${completedRoomsData?.length || 0} completed rooms`);
      return completedRoomsData || [];
    } catch (error) {
      console.error('Error in loadCompletedRooms:', error);
      return [];
    }
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
                onClick={() => setPaused(!isPaused)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  isPaused ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
                }`}
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
                                <p className="font-semibold">{safeUserExtract(result.user).name}</p>
                                <p className="text-sm text-gray-400">{safeUserExtract(result.user).email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div>
                              <div className="text-green-500 font-bold">
                                ${result.final_balance.toFixed(2)}
                                </div>
                                <div className={`text-xs ${getProfit(result) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {getProfit(result) >= 0 ? '+' : ''}{getProfit(result).toFixed(2)}%
                                </div>
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
                              <div className="mb-4">
                                <h5 className="text-sm font-medium text-blue-400 mb-1">Performance Summary</h5>
                                <div className="flex items-center gap-2 mb-2">
                                  <Trophy size={16} className={getProfit(result) >= 0 ? 'text-green-500' : 'text-red-500'} />
                                  <span className="text-white">Final Balance: <span className="font-bold">${result.final_balance.toFixed(2)}</span></span>
                                  <span className={`text-sm ${getProfit(result) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ({getProfit(result) >= 0 ? '+' : ''}{getProfit(result).toFixed(2)}%)
                                  </span>
                                </div>
                              </div>
                              <div>
                                <h5 className="text-sm font-medium text-blue-400 mb-1">Personality Analysis</h5>
                                <p className="text-gray-300 whitespace-pre-wrap mb-3">
                                {result.game_session?.personality_report || 'No analysis available'}
                              </p>
                              </div>
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
                          <p className="font-medium">{safeUserExtract(player.user).name}</p>
                          <p className="text-sm text-gray-400">{safeUserExtract(player.user).email}</p>
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

        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Completed Rooms</h2>
            <button
              onClick={() => setShowCompletedRooms(!showCompletedRooms)}
              className="flex items-center bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
            >
              {showCompletedRooms ? 'Hide Completed Rooms' : 'Show Completed Rooms'}
            </button>
          </div>
          
          {showCompletedRooms && (
            <div className="mt-8 bg-gray-800 p-6 rounded-lg">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Check className="text-green-500" />
                  Completed Rooms
                </h2>
              </div>

              <div className="space-y-6">
                {completedRooms.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>No completed rooms found.</p>
                  </div>
                ) : (
                  completedRooms.map((room) => (
                    <div key={room.id} className="bg-gray-700 p-4 rounded-lg">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="text-lg font-semibold">{room.name}</h3>
                          <p className="text-sm text-gray-400">
                            Completed {room.ended_at ? new Date(room.ended_at).toLocaleString() : 'Unknown'}
                          </p>
                          <p className="text-sm text-gray-400">
                            {room.players?.length || 0} player(s)
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/leaderboard/${room.id}`)}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
                          >
                            <Trophy size={16} />
                            View Results
                          </button>
                          <button
                            onClick={() => deleteRoom(room.id)}
                            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-3 py-1 rounded"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;