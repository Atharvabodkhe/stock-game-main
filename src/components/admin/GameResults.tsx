import React, { useState } from 'react';
import { FileText, Trophy, X } from 'lucide-react';
import { GameResult } from './types';

interface GameResultsProps {
  results: GameResult[];
  safeUserExtract: (user: GameResult['user']) => { name: string; email: string };
  getProfit: (result: GameResult) => number;
}

const GameResults: React.FC<GameResultsProps> = ({ 
  results, 
  safeUserExtract, 
  getProfit 
}) => {
  const [showReport, setShowReport] = useState<string | null>(null);

  return (
    <div className="mt-4 bg-gray-800 p-4 rounded-lg">
      <h4 className="text-lg font-semibold mb-4">Game Results</h4>
      <div className="space-y-4">
        {results.map((result) => (
          <div key={result.id} className="bg-gray-700 p-4 rounded-lg">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className={`text-2xl font-bold ${
                  result.rank === 1 ? 'text-yellow-500' :
                  result.rank === 2 ? 'text-gray-400' :
                  result.rank === 3 ? 'text-amber-700' :
                  'text-gray-500'
                }`}>
                  #{result.rank}
                </div>
                <div>
                  <p className="font-semibold">{safeUserExtract(result.user).name}</p>
                  <p className="text-sm text-gray-400">{safeUserExtract(result.user).email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-green-500 font-bold">
                    ₹{result.final_balance.toFixed(2)}
                  </div>
                  <div className={`text-xs ${getProfit(result) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {getProfit(result) >= 0 ? '+' : ''}{getProfit(result).toFixed(2)}%
                  </div>
                </div>
                <button
                  onClick={() => setShowReport(result.id)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
                >
                  <FileText size={16} />
                  Report
                </button>
              </div>
            </div>
            {showReport === result.id && (
              <div className="mt-4 bg-gray-800 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold">Trading Analysis</h4>
                  <button
                    onClick={() => setShowReport(null)}
                    className="text-gray-400 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="mb-4">
                  <h5 className="text-sm font-medium text-blue-400 mb-1">Performance Summary</h5>
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy size={16} className={getProfit(result) >= 0 ? 'text-green-500' : 'text-red-500'} />
                    <span className="text-white">Final Balance: <span className="font-bold">₹{result.final_balance.toFixed(2)}</span></span>
                    <span className={`text-sm ${getProfit(result) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ({getProfit(result) >= 0 ? '+' : ''}{getProfit(result).toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div>
                  <h5 className="text-sm font-medium text-blue-400 mb-1">Personality Analysis</h5>
                  <p className="text-gray-300 whitespace-pre-wrap mb-3">
                    {result.game_session?.personality_report || 'No analysis available'}
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default GameResults; 