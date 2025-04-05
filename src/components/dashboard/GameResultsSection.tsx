import React, { useState } from 'react';
import { Trophy, FileText } from 'lucide-react';

interface GameResult {
  id: string;
  rank: number;
  final_balance: number;
  user: {
    name: string | null;
    email: string | null;
  };
  game_session: {
    personality_report: string;
  };
}

interface GameResultsSectionProps {
  gameResults: GameResult[];
}

const GameResultsSection: React.FC<GameResultsSectionProps> = ({ gameResults }) => {
  const [selectedResult, setSelectedResult] = useState<string | null>(null);

  if (gameResults.length === 0) return null;

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-8">
      <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <Trophy className="text-yellow-500" />
        Your Game Results
      </h2>
      <div className="space-y-4">
        {gameResults.map((result) => (
          <div key={result.id} className="bg-gray-700 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div
                  className={`text-2xl font-bold ${
                    result.rank === 1
                      ? "text-yellow-500"
                      : result.rank === 2
                        ? "text-gray-400"
                        : result.rank === 3
                          ? "text-amber-700"
                          : "text-gray-500"
                  }`}
                >
                  #{result.rank}
                </div>
                <div className="text-green-500 font-bold">
                  ₹{result.final_balance.toFixed(2)}
                </div>
              </div>
              <button
                onClick={() =>
                  setSelectedResult(
                    selectedResult === result.id ? null : result.id,
                  )
                }
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
              >
                <FileText size={20} />
                View Report
              </button>
            </div>
            {selectedResult === result.id && (
              <div className="mt-4 bg-gray-800 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Trading Analysis</h3>
                <p className="text-gray-300 whitespace-pre-wrap">
                  {result.game_session.personality_report}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default GameResultsSection; 