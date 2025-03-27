import { useEffect } from 'react';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import { GameRoom } from '../components/admin/types';

export const useRealtime = (
  selectedRoom: string | null,
  loadRoomsFast: () => Promise<void>,
  loadCompletedRooms: () => Promise<any>,
  loadResults: (roomId: string) => Promise<void>,
  setRooms: React.Dispatch<React.SetStateAction<GameRoom[]>>,
  setCompletedRooms: React.Dispatch<React.SetStateAction<GameRoom[]>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  rooms: GameRoom[]
) => {
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
        
        // Handle game rooms events
        if (table === 'game_rooms') {
          handleGameRoomEvent(eventType, newRecord, oldRecord);
        } 
        // Handle room players events
        else if (table === 'room_players') {
          handleRoomPlayerEvent(eventType, newRecord);
        }
        // Handle game results events
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

  const handleGameRoomEvent = (eventType: string, newRecord: any, oldRecord: any) => {
    if (eventType === 'UPDATE' && newRecord) {
      console.log('Room update detected:', newRecord);
      
      if (newRecord.status === 'completed' || newRecord.all_players_completed === true) {
        console.log(`Room ${newRecord.id} is now completed, moving to completed section`);
        
        setRooms(prevRooms => prevRooms.filter(room => room.id !== newRecord.id));
        
        loadCompletedRooms().then(completedRooms => {
          setCompletedRooms(completedRooms);
        });
      } else {
        // For rooms that should be visible in the Game Rooms section
        setRooms(prevRooms => 
          prevRooms.map(room => 
            room.id === newRecord.id 
                ? { ...room, ...newRecord } 
              : room
          )
        );
      }
    }
  };

  const handleRoomPlayerEvent = (eventType: string, newRecord: any) => {
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
              
              // Update this player's status
              const updatedPlayers = room.players.map(player => 
                  player.id === newRecord.id
                  ? { ...player, status: 'completed' } 
                    : player
              );
              
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
  };

  return { isSubscribed };
}; 