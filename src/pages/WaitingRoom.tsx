import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { Users, Timer, AlertTriangle, PlayCircle } from 'lucide-react';

interface Player {
  id: string;
  user_id: string;
  status: string;
  session_id?: string;
  user: {
    name: string | null;
    email: string | null;
  };
}

interface Room {
  id: string;
  name: string;
  min_players: number;
  max_players: number;
  status: string;
  players: Player[];
}

export default function WaitingRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [gameStarting, setGameStarting] = useState(false);
  const [sessionCheckAttempts, setSessionCheckAttempts] = useState(0);
  const maxSessionCheckAttempts = 10;

  useEffect(() => {
    const roomId = location.state?.roomId;
    if (!roomId) {
      console.error('No room ID provided');
      navigate('/dashboard');
      return;
    }

    // Get current user on component mount
    const getCurrentUser = async () => {
      const { data } = await supabase.auth.getUser();
      setCurrentUser(data.user);
    };
    
    getCurrentUser();
    loadRoom(roomId);
  }, [navigate, location.state]);

  const roomId = location.state?.roomId;
  const { isSubscribed, reconnect } = useRealtimeSubscription({
    channelName: `waiting_room_${roomId}`,
    tables: [
      {
        name: 'game_rooms',
        event: '*',
        filter: roomId ? `id=eq.${roomId}` : undefined
      },
      {
        name: 'room_players',
        event: '*',
        filter: roomId ? `room_id=eq.${roomId}` : undefined
      }
    ],
    onMessage: async (payload) => {
      console.log('Realtime update:', payload);
      
      if (!roomId || !currentUser) return;

      try {
        // Extract data from the payload
        const { table, eventType, new: newRecord, old: oldRecord } = payload;
        
        console.log(`Received ${eventType} event for ${table}:`, { newRecord, oldRecord });
        
        if (table === 'game_rooms') {
          // Handle room status changes with visual feedback
          if (newRecord) {
            if (newRecord.status === 'preparing') {
              console.log('Game is preparing to start...');
              setGameStarting(true);
              reconnect(); // Force refresh of subscription to get all updates
              
              // Check for session immediately and repeatedly
              checkGameSession(roomId, true);
            }
            else if (newRecord.status === 'in_progress') {
              console.log('Game room started, checking for session');
              setGameStarting(true);
              // Reset attempts counter and begin frequent session checks
              setSessionCheckAttempts(0);
              await checkGameSession(roomId, true);
            } else {
              // For other room changes, update the local state directly
              setRoom(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  ...newRecord,
                  players: prev.players
                };
              });
            }
          }
        }
        else if (table === 'room_players') {
          if (newRecord) {
            // Check for own player status first - highest priority
            if (newRecord.user_id === currentUser.id) {
              if (newRecord.status === 'in_game' && newRecord.session_id) {
                console.log('Current player moved to game, navigating immediately');
                // Begin redirect sequence for smooth transition
                setGameStarting(true);
                setTimeout(() => {
                  navigate('/game', { state: { sessionId: newRecord.session_id } });
                }, 200);
                return;
              }
            }
            
            // For player changes, update optimistically
            setRoom(prev => {
              if (!prev) return prev;
              
              // Find if player already exists in our local state
              const playerExists = prev.players.some(p => p.id === newRecord.id);
              
              if (playerExists) {
                // Update existing player
                return {
                  ...prev,
                  players: prev.players.map(p => 
                    p.id === newRecord.id 
                      ? { ...p, ...newRecord }
                      : p
                  )
                };
              } else {
                // Add new player if they're joining
                // Fetch the user data on the next tick to avoid blocking the update
                setTimeout(async () => {
                  try {
                    const { data: userData } = await supabase
                      .from('users')
                      .select('name, email')
                      .eq('id', newRecord.user_id)
                      .single();
                    
                    setRoom(prev => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        players: [
                          ...prev.players.filter(p => p.id !== newRecord.id),
                          {
                            ...newRecord,
                            user: userData || { name: 'Loading...', email: null }
                          }
                        ]
                      };
                    });
                  } catch (error) {
                    console.error('Error fetching user data:', error);
                  }
                }, 0);
                
                // Return immediately with placeholder data
                return {
                  ...prev,
                  players: [
                    ...prev.players,
                    {
                      ...newRecord,
                      user: { name: 'Loading...', email: null }
                    }
                  ]
                };
              }
            });
          } else if (oldRecord) {
            // For deleted players, remove from UI
            setRoom(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                players: prev.players.filter(p => p.id !== oldRecord.id)
              };
            });
          }
        }
      } catch (error) {
        console.error('Error processing realtime update:', error);
      }
    },
    onError: (error) => {
      console.error('Realtime subscription error:', error);
      setError(error.message);
    },
    onStatusChange: (status) => {
      console.log('Realtime status change:', status);
      if (status === 'SUBSCRIBED') {
        if (error) setError(null);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.log('Channel error, reloading room data');
        loadRoom(roomId);
      }
    }
  });

  const loadRoom = async (roomId: string) => {
    if (!roomId) {
      console.error('Invalid room ID');
      setError('Room not found');
      navigate('/dashboard');
      return;
    }

    try {
      console.log('Loading room data for', roomId);
      const { data: roomData, error: roomError } = await supabase
        .from('game_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (roomError) {
        console.error('Error loading room:', roomError);
        setError('Failed to load room information');
        return;
      }

      if (!roomData) {
        setError('Room not found');
        navigate('/dashboard');
        return;
      }

      const { data: playersData, error: playersError } = await supabase
        .from('room_players')
        .select(`
          id,
          user_id,
          status,
          session_id,
          user:users(name, email)
        `)
        .eq('room_id', roomId);

      if (playersError) {
        console.error('Error loading players:', playersError);
        setError('Failed to load player information');
        return;
      }

      console.log('Loaded room with status:', roomData.status);
      
      // If the room is preparing or in progress, check for game session
      if (roomData.status === 'preparing' || roomData.status === 'in_progress') {
        setGameStarting(true);
        const { data: { user } } = await supabase.auth.getUser();
        const currentPlayer = playersData?.find(p => p.user_id === user?.id);
        
        console.log('Room in progress, current player:', currentPlayer);
        
        if (currentPlayer?.status === 'in_game' && currentPlayer?.session_id) {
          console.log('Player is in game, redirecting to game with session:', currentPlayer.session_id);
          navigate('/game', { state: { sessionId: currentPlayer.session_id } });
          return;
        }
        
        // Even if we don't have a session yet, check again in case it's being created
        await checkGameSession(roomId, true);
      }

      setRoom({
        ...roomData,
        players: playersData || []
      });
    } catch (error) {
      console.error('Error in loadRoom:', error);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const checkGameSession = useCallback(async (roomId: string, isAggressiveCheck = false) => {
    if (!roomId) {
      console.error('Invalid room ID for game session check');
      return;
    }

    try {
      console.log('Checking for game session in room', roomId);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/');
        return;
      }

      const { data: playerData, error: playerError } = await supabase
        .from('room_players')
        .select('session_id, status')
        .eq('user_id', user.id)
        .eq('room_id', roomId)
        .single();

      if (playerError && playerError.code !== 'PGRST116') {
        console.error('Error checking game session:', playerError);
        return;
      }

      console.log('Player data for session check:', playerData);
      
      if (playerData?.status === 'in_game' && playerData?.session_id) {
        console.log('Found active game session, redirecting to game');
        setGameStarting(true);
        setTimeout(() => {
          navigate('/game', { state: { sessionId: playerData.session_id } });
        }, 200);
        return true;
      } else {
        // If room is in progress or preparing but we're not yet in_game, check again quickly
        const { data: roomData } = await supabase
          .from('game_rooms')
          .select('status')
          .eq('id', roomId)
          .single();
          
        if (roomData?.status === 'in_progress' || roomData?.status === 'preparing') {
          console.log('Room is in progress but player not ready yet, checking again soon');
          
          // If aggressive checking (during game start) use faster intervals
          if (isAggressiveCheck) {
            if (sessionCheckAttempts < maxSessionCheckAttempts) {
              setSessionCheckAttempts(prev => prev + 1);
              
              // Use decreasing intervals for a more responsive experience
              const delay = Math.max(200, 1000 - (sessionCheckAttempts * 100)); 
              setTimeout(() => checkGameSession(roomId, true), delay);
            } else {
              console.log('Max session check attempts reached');
              // If we've checked many times and still no session, refresh room data
              loadRoom(roomId);
            }
          } else {
            // Standard interval for regular checks
            setTimeout(() => checkGameSession(roomId), 1000);
          }
        } else {
          // If room is no longer in progress, reset game starting state
          setGameStarting(false);
        }
        return false;
      }
    } catch (error) {
      console.error('Error checking game session:', error);
      return false;
    }
  }, [navigate, sessionCheckAttempts, maxSessionCheckAttempts]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-xl">Loading waiting room...</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <div className={`bg-gray-800 rounded-lg p-8 ${gameStarting ? 'border-2 border-green-500 shadow-lg shadow-green-500/20' : ''}`}>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">{room.name}</h1>
            {gameStarting ? (
              <div className="animate-pulse text-green-400 font-bold text-xl mb-4 flex items-center justify-center gap-2">
                <PlayCircle className="animate-pulse" />
                Game is starting...
              </div>
            ) : (
              <p className="text-gray-400">
                Waiting for players ({room.players.filter(p => p.status === 'joined').length} / {room.max_players})
              </p>
            )}
            {!gameStarting && room.players.filter(p => p.status === 'joined').length < room.min_players && (
              <div className="flex items-center justify-center gap-2 mt-4 text-yellow-500">
                <AlertTriangle size={20} />
                <p>Need at least {room.min_players} players to start</p>
              </div>
            )}
          </div>

          <div className="bg-gray-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Users className="text-green-500" />
              Players in Room
            </h2>
            <div className="space-y-4">
              {room.players
                .filter(player => player.status === 'joined' || player.status === 'in_game')
                .map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between bg-gray-800 p-4 rounded-lg ${
                    player.status === 'in_game' ? 'border border-green-500' : ''
                  }`}
                >
                  <div>
                    <p className="font-semibold">{player.user?.name || 'Anonymous Player'}</p>
                    <p className="text-sm text-gray-400">{player.user?.email || 'No email'}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    player.status === 'joined' ? 'bg-green-600' :
                    player.status === 'in_game' ? 'bg-blue-600' :
                    'bg-gray-600'
                  }`}>
                    {player.status === 'in_game' ? 'Ready' : player.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center text-gray-400">
            {!gameStarting ? (
              <div className="flex items-center justify-center gap-2">
                <Timer className="animate-pulse" />
                <p>Waiting for admin to start the game...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mb-3"></div>
                <p className="text-green-400">Preparing game environment...</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-900/50 border border-red-500 rounded-lg">
              <p className="text-red-200 flex items-center gap-2">
                <AlertTriangle size={20} />
                {error}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}