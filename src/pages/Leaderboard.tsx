import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { 
  Users, 
  ArrowLeft, 
  Trophy, 
  FileText, 
  X,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface GameResult {
  id: string;
  user_id: string;
  final_balance: number;
  rank: number;
  profit_percentage?: number;
  user: {
    name: string | null;
    email: string | null;
  } | null;
  game_session: {
    personality_report: string | null;
    trading_history?: string | null;
  } | null;
}

interface GameRoom {
  id: string;
  name: string;
  status: string;
}

const Leaderboard: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [results, setResults] = useState<GameResult[]>([]);
  const [roomInfo, setRoomInfo] = useState<GameRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState<string | null>(null);

  useEffect(() => {
    if (roomId) {
      loadResults(roomId);
      loadRoomInfo(roomId);
    }
  }, [roomId]);

  const loadRoomInfo = async (roomId: string) => {
    try {
      const { data, error } = await supabase
        .from('game_rooms')
        .select('id, name, status')
        .eq('id', roomId)
        .single();

      if (error) throw error;
      setRoomInfo(data);
    } catch (error) {
      console.error('Error loading room info:', error);
      setError('Failed to load room information');
    }
  };

  const loadResults = async (roomId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading game results for room:', roomId);
      
      // First, check if the room exists and get its information
      const { data: roomData, error: roomError } = await supabase
        .from('game_rooms')
        .select('id, name, status, ended_at')
        .eq('id', roomId)
        .single();
        
      if (roomError) {
        console.error('Error fetching room information:', roomError);
      } else {
        console.log('Room info loaded:', roomData);
        setRoomInfo(roomData);
      }
      
      // Fetch results with related data
      console.log('Fetching game results from database...');
      const { data, error } = await supabase
        .from('game_results')
        .select(`
          *,
          user:users(name, email),
          game_session:game_sessions(personality_report, trading_history)
        `)
        .eq('room_id', roomId)
        .order('final_balance', { ascending: false });

      if (error) {
        console.error('Error fetching game results:', error);
        throw error;
      }
      
      console.log(`Fetched ${data?.length || 0} results for room ${roomId}`);
      
      if (data && data.length > 0) {
        // Sort by final balance
        const sortedResults = [...data].sort((a, b) => b.final_balance - a.final_balance);
        
        // Process results to match expected format
        const processedResults = sortedResults.map((result, index) => {
          const startingBalance = 10000;
          const profit = ((result.final_balance - startingBalance) / startingBalance) * 100;
          
          // Create a safe user object
          const userObj = {
            name: result.user && typeof result.user === 'object' && 'name' in result.user 
              ? result.user.name || `User-${result.user_id.substring(0, 8)}`
              : `User-${result.user_id.substring(0, 8)}`,
            email: result.user && typeof result.user === 'object' && 'email' in result.user
              ? result.user.email || ''
              : ''
          };
          
          // Create a safe game_session object
          const gameSessionObj = {
            personality_report: result.game_session && typeof result.game_session === 'object' && 'personality_report' in result.game_session
              ? result.game_session.personality_report
              : null,
            trading_history: result.game_session && typeof result.game_session === 'object' && 'trading_history' in result.game_session
              ? result.game_session.trading_history
              : null
          };
          
          return {
            ...result,
            rank: index + 1,
            profit_percentage: profit,
            user: userObj,
            game_session: gameSessionObj
          };
        });
        
        console.log('Processed results:', processedResults);
        setResults(processedResults);
      } else {
        console.log('No results found for room');
        setResults([]);
      }
    } catch (error) {
      console.error('Error loading results:', error);
      setError('Failed to load game results');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to safely get profit percentage
  const getProfit = (result: GameResult): number => {
    return result.profit_percentage !== undefined ? result.profit_percentage : 0;
  };

  // Helper function to safely extract user info
  const safeUserExtract = (user: GameResult['user']) => {
    return {
      name: user?.name || 'Unknown Player',
      email: user?.email || ''
    };
  };

  // Function to get trophy color based on rank
  const getTrophyColor = (rank: number): string => {
    switch(rank) {
      case 1: return 'text-yellow-500';
      case 2: return 'text-gray-400';
      case 3: return 'text-amber-700';
      default: return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <p className="text-xl">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg"
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </button>
          
          <h1 className="text-3xl font-bold text-white flex-1">
            Leaderboard
            {roomInfo && <span className="text-blue-400 ml-2">: {roomInfo.name}</span>}
          </h1>
        </div>

        {error && (
          <div className="bg-red-500 text-white p-4 rounded-lg mb-8">
            <p className="font-semibold">{error}</p>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-lg">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Trophy className="text-yellow-500" />
              Player Rankings by Profit
            </h2>
          </div>

          {results.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No results available for this game room.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map(result => (
                <div key={result.id} className="bg-gray-700 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className={`flex items-center justify-center w-10 h-10 ${getTrophyColor(result.rank)} bg-gray-800 rounded-full`}>
                        {result.rank <= 3 ? (
                          <Trophy size={20} />
                        ) : (
                          <span className="font-bold">{result.rank}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold">{safeUserExtract(result.user).name}</p>
                        <p className="text-sm text-gray-400">{safeUserExtract(result.user).email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-lg font-bold">
                          ${result.final_balance.toFixed(2)}
                        </div>
                        <div className="flex items-center gap-1">
                          {getProfit(result) >= 0 ? (
                            <TrendingUp size={16} className="text-green-500" />
                          ) : (
                            <TrendingDown size={16} className="text-red-500" />
                          )}
                          <span className={`${getProfit(result) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {getProfit(result) >= 0 ? '+' : ''}{getProfit(result).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowReport(result.id)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
                      >
                        <FileText size={16} />
                        View Report
                      </button>
                    </div>
                  </div>
                  
                  {showReport === result.id && (
                    <div className="mt-6 bg-gray-800 p-6 rounded-lg">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold">Player Report</h3>
                        <button
                          onClick={() => setShowReport(null)}
                          className="text-gray-400 hover:text-white"
                        >
                          <X size={24} />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div className="bg-gray-700 p-4 rounded-lg">
                          <h4 className="text-lg font-semibold text-blue-400 mb-3">Performance Summary</h4>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span>Final Balance:</span>
                              <span className="font-bold">${result.final_balance.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Starting Balance:</span>
                              <span>$10,000.00</span>
                            </div>
                            <div className="flex justify-between border-t border-gray-600 pt-2 mt-2">
                              <span>Profit/Loss:</span>
                              <span className={`font-bold ${getProfit(result) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {getProfit(result) >= 0 ? '+' : ''}${(result.final_balance - 10000).toFixed(2)} 
                                ({getProfit(result) >= 0 ? '+' : ''}{getProfit(result).toFixed(2)}%)
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="bg-gray-700 p-4 rounded-lg">
                          <h4 className="text-lg font-semibold text-blue-400 mb-3">Ranking</h4>
                          <div className="flex items-center gap-3">
                            <div className={`flex items-center justify-center w-16 h-16 ${getTrophyColor(result.rank)} bg-gray-800 rounded-full`}>
                              {result.rank <= 3 ? (
                                <Trophy size={32} />
                              ) : (
                                <span className="text-2xl font-bold">{result.rank}</span>
                              )}
                            </div>
                            <div>
                              <p className="text-lg font-semibold">
                                {result.rank === 1 ? '1st Place' : 
                                 result.rank === 2 ? '2nd Place' : 
                                 result.rank === 3 ? '3rd Place' : 
                                 `${result.rank}th Place`}
                              </p>
                              <p className="text-sm text-gray-400">
                                {result.rank === 1 ? 'Top Performer' : 
                                 result.rank <= 3 ? 'Top Performer' : 
                                 'Participant'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-gray-700 p-4 rounded-lg">
                        <h4 className="text-lg font-semibold text-blue-400 mb-3">Personality Analysis</h4>
                        <div className="max-h-64 overflow-y-auto">
                          <p className="text-gray-300 whitespace-pre-wrap">
                            {result.game_session?.personality_report || 'No personality analysis available for this player.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Leaderboard; 