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
      
      // First approach: Try to get data from game_results
      console.log('Fetching game results from database...');
      
      // Get the raw results first
      const { data: resultsRaw, error: resultsError } = await supabase
        .from('game_results')
        .select('id, user_id, room_id, session_id, final_balance')
        .eq('room_id', roomId)
        .order('final_balance', { ascending: false });
        
      if (resultsError) {
        console.error('Error fetching basic game results:', resultsError);
        throw resultsError;
      }
      
      console.log(`Fetched ${resultsRaw?.length || 0} raw results:`, resultsRaw);
      
      if (resultsRaw && resultsRaw.length > 0) {
        // Then fetch the related data separately
        // 1. Get user data
        const userIds = resultsRaw.map(r => r.user_id);
        const { data: usersData } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', userIds);
          
        console.log('User data:', usersData);
        
        // 2. Get session data
        const sessionIds = resultsRaw.map(r => r.session_id).filter(id => id !== null);
        const { data: sessionsData } = await supabase
          .from('game_sessions')
          .select('id, personality_report, trading_history')
          .in('id', sessionIds);
          
        console.log('Session data:', sessionsData);
        
        // Now combine the data
        const processedResults = resultsRaw.map((result, index) => {
          // Find associated user and session
          const user = usersData?.find(u => u.id === result.user_id);
          const session = sessionsData?.find(s => s.id === result.session_id);
          
          // Calculate profit
          const startingBalance = 10000;
          const profit = ((result.final_balance - startingBalance) / startingBalance) * 100;
          
          return {
            id: result.id,
            user_id: result.user_id,
            final_balance: result.final_balance,
            rank: index + 1,
            profit_percentage: profit,
            user: {
              name: user?.name || `User-${result.user_id.substring(0, 8)}`,
              email: user?.email || ''
            },
            game_session: {
              personality_report: session?.personality_report || null,
              trading_history: session?.trading_history || null
            }
          };
        });
        
        console.log('Final processed results:', processedResults);
        setResults(processedResults);
      } else {
        // If no results from direct query, try using a stored procedure if available
        console.log('No direct results found, trying alternative approach...');
        
        try {
          const { data: altData, error: altError } = await supabase.rpc(
            'get_game_results_for_room',
            { room_id_param: roomId }
          );
          
          if (altError) {
            console.error('Error in alternative query:', altError);
            setResults([]);
          } else if (altData && altData.length > 0) {
            console.log('Retrieved results using RPC method:', altData);
            
            // Process the RPC results
            const mappedResults = altData.map((item: any, index: number) => ({
              id: item.id || `result-${index}`,
              user_id: item.user_id || '',
              final_balance: item.final_balance || 10000,
              rank: index + 1,
              profit_percentage: item.final_balance ? ((item.final_balance - 10000) / 10000) * 100 : 0,
              user: {
                name: item.user_name || `User-${(item.user_id || '').substring(0, 8)}`,
                email: item.user_email || ''
              },
              game_session: {
                personality_report: item.personality_report || null,
                trading_history: item.trading_history || null
              }
            }));
            
            setResults(mappedResults);
          } else {
            console.log('No results found with either method');
            setResults([]);
          }
        } catch (rpcError) {
          console.error('RPC method failed, checking last method:', rpcError);
          
          // Last resort - try to get data from game_sessions directly
          try {
            const { data: sessionData } = await supabase
              .from('game_sessions')
              .select('id, user_id, final_balance, personality_report')
              .eq('room_id', roomId)
              .order('final_balance', { ascending: false });
              
            if (sessionData && sessionData.length > 0) {
              console.log('Found data from game_sessions:', sessionData);
              
              const fallbackResults = sessionData.map((session: any, index: number) => ({
                id: session.id,
                user_id: session.user_id,
                final_balance: session.final_balance || 10000,
                rank: index + 1,
                profit_percentage: ((session.final_balance || 10000) - 10000) / 10000 * 100,
                user: { name: `User-${session.user_id.substring(0, 8)}`, email: '' },
                game_session: { 
                  personality_report: session.personality_report,
                  trading_history: null
                }
              }));
              
              setResults(fallbackResults);
            } else {
              console.log('No data available from any source');
              setResults([]);
            }
          } catch (finalError) {
            console.error('All data fetch methods failed:', finalError);
            setResults([]);
          }
        }
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