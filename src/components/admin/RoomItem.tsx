import React from 'react';
import { Trash2, Play, Trophy } from 'lucide-react';
import { GameRoom } from './types';
import PlayersList from './PlayersList';
import GameResults from './GameResults';

interface RoomItemProps {
  room: GameRoom;
  results: any[];
  selectedRoom: string | null;
  startingGame: boolean;
  safeUserExtract: (user: any) => { name: string; email: string };
  getProfit: (result: any) => number;
  startGame: (roomId: string) => void;
  loadResults: (roomId: string) => void;
  setDeleteConfirmation: (roomId: string | null) => void;
  deleteConfirmation: string | null;
  deleteRoom: (roomId: string) => void;
}

const RoomItem: React.FC<RoomItemProps> = ({
  room,
  results,
  selectedRoom,
  startingGame,
  safeUserExtract,
  getProfit,
  startGame,
  loadResults,
  setDeleteConfirmation,
  deleteConfirmation,
  deleteRoom
}) => {
  return (
    <div className="bg-gray-700 p-4 rounded-lg">
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
        <GameResults 
          results={results} 
          safeUserExtract={safeUserExtract} 
          getProfit={getProfit} 
        />
      )}

      <PlayersList players={room.players} safeUserExtract={safeUserExtract} />
    </div>
  );
};

export default RoomItem; 