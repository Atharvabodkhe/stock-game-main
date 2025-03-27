import React from 'react';
import { Check, Trophy, Trash2 } from 'lucide-react';
import { GameRoom } from './types';

interface CompletedRoomsProps {
  showCompletedRooms: boolean;
  setShowCompletedRooms: (show: boolean) => void;
  completedRooms: GameRoom[];
  navigate: (path: string) => void;
  deleteRoom: (roomId: string) => void;
}

const CompletedRooms: React.FC<CompletedRoomsProps> = ({
  showCompletedRooms,
  setShowCompletedRooms,
  completedRooms,
  navigate,
  deleteRoom
}) => {
  return (
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
  );
};

export default CompletedRooms; 