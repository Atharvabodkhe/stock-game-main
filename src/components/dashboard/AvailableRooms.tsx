import React from 'react';
import { Users } from 'lucide-react';

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

interface GameRoom {
  id: string;
  name: string;
  min_players: number;
  max_players: number;
  status: string;
  players: RoomPlayer[];
  completion_time?: string;
}

interface AvailableRoomsProps {
  rooms: GameRoom[];
  onJoinRoom: (roomId: string) => void;
}

const AvailableRooms: React.FC<AvailableRoomsProps> = ({ rooms, onJoinRoom }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-8">
      <h2 className="text-xl font-semibold text-white mb-4">
        Available Rooms
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {rooms.map((room) => (
          <div key={room.id} className="bg-gray-700 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-semibold">{room.name}</h3>
              <div className="flex items-center gap-2">
                <Users size={18} className="text-gray-400" />
                <span className="text-gray-400">
                  {room.players.filter((p) => p.status === "joined").length}{" "}
                  / {room.max_players}
                </span>
              </div>
            </div>
            <button
              onClick={() => onJoinRoom(room.id)}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition-colors"
              disabled={
                room.players.filter((p) => p.status === "joined").length >=
                room.max_players
              }
            >
              Join Room
            </button>
          </div>
        ))}
        {rooms.length === 0 && (
          <p className="text-gray-400">
            No rooms available. Wait for an admin to create one.
          </p>
        )}
      </div>
    </div>
  );
};

export default AvailableRooms; 