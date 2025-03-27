import React from 'react';
import { Plus } from 'lucide-react';
import { NewRoom } from './types';

interface RoomCreatorProps {
  newRoom: NewRoom;
  setNewRoom: React.Dispatch<React.SetStateAction<NewRoom>>;
  createRoom: () => void;
  handleMinPlayersChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMaxPlayersChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const RoomCreator: React.FC<RoomCreatorProps> = ({
  newRoom,
  setNewRoom,
  createRoom,
  handleMinPlayersChange,
  handleMaxPlayersChange
}) => {
  return (
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
  );
};

export default RoomCreator; 