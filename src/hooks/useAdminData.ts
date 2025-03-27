import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { GameRoom, GameResult } from '../components/admin/types';
import { useNavigate } from 'react-router-dom';

export const useAdminData = (isAdmin: boolean) => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [completedRooms, setCompletedRooms] = useState<GameRoom[]>([]);
  const [results, setResults] = useState<GameResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const maxRetries = 3;

  const loadRooms = useCallback(async () => {
    try {
      console.log('Loading game rooms...');
      
      // Only load rooms that are not completed
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
  }, []);

  const loadRoomsFast = useCallback(async () => {
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
                  user: player.user
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
  }, [rooms]);

  const loadCompletedRooms = useCallback(async () => {
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
  }, []);

  const loadResults = useCallback(async (roomId: string) => {
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
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/');
        return;
      }

      // Load open rooms
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
  }, [loadRooms, loadCompletedRooms, navigate]);

  // Initialize data when admin status is confirmed
  useEffect(() => {
    if (isAdmin) {
      loadInitialData();
    }
  }, [isAdmin, loadInitialData]);

  // Handle retries for data loading errors
  useEffect(() => {
    if (error && retryCount < maxRetries) {
      const timer = setTimeout(() => {
        setRetryCount(prev => prev + 1);
        loadInitialData();
      }, Math.min(1000 * Math.pow(2, retryCount), 10000));

      return () => clearTimeout(timer);
    }
  }, [error, retryCount, loadInitialData, maxRetries]);

  // Set up a periodic refresh as a backup for realtime
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log('Performing backup periodic refresh');
      if (isAdmin) {
        loadRooms().catch((err: any) => {
          console.error('Error in periodic refresh:', err);
        });
      }
    }, 5000); // Refresh every 5 seconds as a fallback
    
    return () => clearInterval(refreshInterval);
  }, [isAdmin, loadRooms]);

  return {
    rooms,
    setRooms,
    completedRooms,
    setCompletedRooms,
    results,
    loading,
    error,
    setError,
    retryCount,
    maxRetries,
    selectedRoom,
    setSelectedRoom,
    loadRooms,
    loadRoomsFast,
    loadCompletedRooms,
    loadResults,
    loadInitialData
  };
}; 