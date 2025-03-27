import React from 'react';
import { GameRoom, GameResult, NewRoom } from './types';
import RoomCreator from './RoomCreator';
import RoomItem from './RoomItem';

interface GameRoomsListProps {
  rooms: GameRoom[];
  results: GameResult[];
  selectedRoom: string | null;
  startingGame: boolean;
  newRoom: NewRoom;
  deleteConfirmation: string | null;
  setNewRoom: React.Dispatch<React.SetStateAction<NewRoom>>;
  createRoom: () => void;
  handleMinPlayersChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMaxPlayersChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  safeUserExtract: (user: any) => { name: string; email: string };
  getProfit: (result: GameResult) => number;
  startGame: (roomId: string) => void;
  loadResults: (roomId: string) => void;
  setDeleteConfirmation: (roomId: string | null) => void;
  deleteRoom: (roomId: string) => void;
}

const GameRoomsList: React.FC<GameRoomsListProps> = ({
  rooms,
  results,
  selectedRoom,
  startingGame,
  newRoom,
  deleteConfirmation,
  setNewRoom,
  createRoom,
  handleMinPlayersChange,
  handleMaxPlayersChange,
  safeUserExtract,
  getProfit,
  startGame,
  loadResults,
  setDeleteConfirmation,
  deleteRoom
}) => {
  return (
    <div className="bg-gray-800 p-6 rounded-lg mb-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-white">Game Rooms</h2>
      </div>

      <RoomCreator 
        newRoom={newRoom}
        setNewRoom={setNewRoom}
        createRoom={createRoom}
        handleMinPlayersChange={handleMinPlayersChange}
        handleMaxPlayersChange={handleMaxPlayersChange}
      />

      <div className="space-y-6">
        {rooms.map((room) => (
          <RoomItem 
            key={room.id}
            room={room}
            results={results}
            selectedRoom={selectedRoom}
            startingGame={startingGame}
            safeUserExtract={safeUserExtract}
            getProfit={getProfit}
            startGame={startGame}
            loadResults={loadResults}
            setDeleteConfirmation={setDeleteConfirmation}
            deleteConfirmation={deleteConfirmation}
            deleteRoom={deleteRoom}
          />
        ))}
      </div>
    </div>
  );
};

export default GameRoomsList; 