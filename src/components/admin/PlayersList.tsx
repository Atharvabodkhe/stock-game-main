import React from 'react';
import { RoomPlayer } from './types';

interface PlayersListProps {
  players: RoomPlayer[];
  safeUserExtract: (user: any) => { name: string; email: string };
}

const PlayersList: React.FC<PlayersListProps> = ({ players, safeUserExtract }) => {
  return (
    <div className="mt-4">
      <h4 className="font-semibold mb-2">Players</h4>
      <div className="space-y-2">
        {players.map((player) => {
          const userInfo = safeUserExtract(player.user);
          return (
            <div
              key={player.id}
              className="flex justify-between items-center bg-gray-600 p-2 rounded"
            >
              <div>
                <p className="font-medium">{userInfo.name || player.user?.name || `Player ${player.id.substring(0, 5)}`}</p>
                <p className="text-sm text-gray-400">{userInfo.email}</p>
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
          );
        })}
      </div>
    </div>
  );
};

export default PlayersList; 