import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { GameRoom, NewRoom } from '../components/admin/types';

export const useRoomActions = (
  rooms: GameRoom[],
  setRooms: React.Dispatch<React.SetStateAction<GameRoom[]>>,
  setCompletedRooms: React.Dispatch<React.SetStateAction<GameRoom[]>>,
  loadRoomsFast: () => Promise<void>,
  loadCompletedRooms: () => Promise<any>,
  setError: React.Dispatch<React.SetStateAction<string | null>>
) => {
  const [newRoom, setNewRoom] = useState<NewRoom>({
    name: '',
    min_players: 2,
    max_players: 5,
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);
  const [startingGame, setStartingGame] = useState(false);
  const [endingGameConfirmation, setEndingGameConfirmation] = useState<string | null>(null);
  const [showCompletedRooms, setShowCompletedRooms] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);

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
      
      // Update local state to remove the deleted room
      // Remove from active rooms if present
      setRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
      
      // Remove from completed rooms if present
      setCompletedRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
      
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

  return {
    newRoom,
    setNewRoom,
    deleteConfirmation,
    setDeleteConfirmation,
    startingGame,
    setStartingGame,
    endingGameConfirmation,
    setEndingGameConfirmation,
    showCompletedRooms,
    setShowCompletedRooms,
    showCreateRoom,
    setShowCreateRoom,
    createRoom,
    deleteRoom,
    startGame,
    endGame,
    handleMinPlayersChange,
    handleMaxPlayersChange
  };
}; 