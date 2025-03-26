import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { generatePersonalityReport } from '../lib/groq';
import { 
  Users, 
  ArrowLeft, 
  Trophy, 
  FileText, 
  X,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Search,
  AnchorIcon,
  Frame,
  BadgeAlert,
  Eye,
  BarChart,
  ArrowUpCircle,
  ArrowDownCircle,
  Pause
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

interface TradingAction {
  action: 'buy' | 'sell' | 'hold';
  stock_name: string;
  price: number;
  quantity: number;
  timestamp: string;
  level?: number;
}

interface LevelActionData {
  level: number;
  totalTrades: number;
  buyOrders: number;
  sellOrders: number;
  holdActions: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
}

interface TradingStats {
  totalTrades: number;
  buyOrders: number;
  sellOrders: number;
  holdActions: number;
  levelStats?: Record<number, {
    totalTrades: number;
    buyOrders: number;
    sellOrders: number;
    holdActions: number;
  }>;
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
  const [personalityReports, setPersonalityReports] = useState<Record<string, string>>({});
  const [loadingReport, setLoadingReport] = useState<Record<string, boolean>>({});
  const [tradingActions, setTradingActions] = useState<Record<string, TradingAction[]>>({});
  const [tradingStats, setTradingStats] = useState<Record<string, TradingStats>>({});
  const [levelActions, setLevelActions] = useState<Record<string, LevelActionData[]>>({});

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
        
        // ADDED: Deduplicate by user_id, keeping only the first (highest) result for each user
        const userIdsSeen = new Set<string>();
        const deduplicatedResults = processedResults.filter(result => {
          // If we've seen this user_id before, filter it out
          if (userIdsSeen.has(result.user_id)) {
            return false;
          }
          // Otherwise, add it to our set and keep it
          userIdsSeen.add(result.user_id);
          return true;
        });
        
        // Re-assign ranks after deduplication
        deduplicatedResults.forEach((result, index) => {
          result.rank = index + 1;
        });
        
        console.log('Final processed results (deduplicated):', deduplicatedResults);
        setResults(deduplicatedResults);
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
            
            // Deduplicate by user_id, keeping only the first/best result for each user
            const userIdsSeen = new Set<string>();
            const deduplicatedResults = mappedResults.filter((result: GameResult) => {
              if (userIdsSeen.has(result.user_id)) {
                return false;
              }
              userIdsSeen.add(result.user_id);
              return true;
            });
            
            // Re-assign ranks after deduplication
            deduplicatedResults.forEach((result: GameResult, index: number) => {
              result.rank = index + 1;
            });
            
            console.log('Alternative results (deduplicated):', deduplicatedResults);
            setResults(deduplicatedResults);
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
              
              // Deduplicate the fallback results
              const fallbackUserIdsSeen = new Set<string>();
              const deduplicatedFallbackResults = fallbackResults.filter((result: GameResult) => {
                if (fallbackUserIdsSeen.has(result.user_id)) {
                  return false;
                }
                fallbackUserIdsSeen.add(result.user_id);
                return true;
              });
              
              // Re-assign ranks after deduplication
              deduplicatedFallbackResults.forEach((result: GameResult, index: number) => {
                result.rank = index + 1;
              });
              
              console.log('Fallback results (deduplicated):', deduplicatedFallbackResults);
              setResults(deduplicatedFallbackResults);
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

  // Function to load personality report for a player
  const loadPersonalityReport = async (result: GameResult) => {
    try {
      setLoadingReport(prev => ({ ...prev, [result.id]: true }));
      
      // First check if there's already a personality report in the database
      if (result.game_session?.personality_report) {
        try {
          // Try to parse it as a markdown format first
          const existingReport = result.game_session.personality_report;
          
          // If it already has our format, use it directly
          if (existingReport.includes('Trading Bias Analysis') || 
              existingReport.includes('Confirmation Bias') || 
              existingReport.includes('Anchoring')) {
            
            setPersonalityReports(prev => ({ ...prev, [result.id]: existingReport }));
            return existingReport;
          }
        } catch (e) {
          console.error('Error processing existing report:', e);
        }
      }
      
      // Parse trading history if it exists
      let tradingActions = [];
      if (result.game_session?.trading_history) {
        try {
          tradingActions = typeof result.game_session.trading_history === 'string' 
            ? JSON.parse(result.game_session.trading_history)
            : result.game_session.trading_history;
        } catch (e) {
          console.error('Error parsing trading history:', e);
        }
      }
      
      // If no trading history or empty array, create default analysis
      if (!tradingActions || tradingActions.length === 0) {
        const defaultReport = generateDefaultReport(result);
        setPersonalityReports(prev => ({ ...prev, [result.id]: defaultReport }));
        return defaultReport;
      }
      
      // Generate the report using GROQ
      const report = await generatePersonalityReport(tradingActions);
      
      // Save it to state
      setPersonalityReports(prev => ({ ...prev, [result.id]: report }));
      return report;
    } catch (error) {
      console.error('Error generating personality report:', error);
      // If all else fails, generate a default report
      const fallbackReport = generateDefaultReport(result);
      setPersonalityReports(prev => ({ ...prev, [result.id]: fallbackReport }));
      return fallbackReport;
    } finally {
      setLoadingReport(prev => ({ ...prev, [result.id]: false }));
    }
  };
  
  // Generate a default personality report when data is missing
  const generateDefaultReport = (result: GameResult): string => {
    const profit = getProfit(result);
    const isProfit = profit >= 0;
    const profitMagnitude = Math.abs(profit);
    const username = safeUserExtract(result.user).name;
    
    // Determine risk profile based on profit/loss
    let riskProfile = 'moderate';
    if (profitMagnitude > 15) riskProfile = 'high';
    else if (profitMagnitude < 5) riskProfile = 'conservative';
    
    return `# Trading Bias Analysis

## Confirmation Bias
${isProfit ? 
  `${username} appears to have a balanced approach to information gathering. While there's limited trading data, the positive performance suggests an ability to consider multiple viewpoints and avoid echo chambers.` :
  `${username} may be susceptible to confirmation bias, as indicated by the trading outcome. Without more trading data, it's difficult to determine the extent, but losses might indicate seeking information that confirms existing beliefs.`}

## Anchoring and Adjustment Bias
${profitMagnitude < 5 ? 
  `${username} shows signs of moderate anchoring bias. The minimal movement from the starting position suggests a tendency to anchor to initial price points rather than adjusting to new market information.` :
  `${username} demonstrates flexibility with price anchors, willing to adjust positions based on market conditions rather than anchoring to initial price points.`}

## Framing Bias
${isProfit ?
  `${username} appears to maintain consistent decision-making regardless of how information is presented. This resistance to framing effects is a strength in volatile markets.` :
  `${username} may be influenced by how trading information is framed. The performance suggests decisions might be affected by presentation format rather than fundamental data.`}

## Overconfidence Bias
${profitMagnitude > 10 ?
  `${username} displays a ${isProfit ? 'well-calibrated' : 'potential'} overconfidence bias. ${isProfit ? 'The significant gains suggest confidence backed by skill.' : 'The significant losses may indicate excessive risk-taking without appropriate caution.'}` :
  `${username} shows a balanced confidence level, neither overly cautious nor excessively risk-seeking.`}

## Hindsight Bias
${username} has limited trading history to analyze for hindsight bias. As trading experience grows, it will be important to maintain awareness that past results don't guarantee future performance, regardless of outcomes.

Note: This is a preliminary analysis based on limited trading data. More active trading will provide deeper insights into trading psychology and decision patterns.`;
  };

  // Function to get a bias icon
  const getBiasIcon = (biasType: string) => {
    switch (biasType.toLowerCase()) {
      case 'confirmation bias':
        return <Search size={18} />;
      case 'anchoring and adjustment bias':
        return <AnchorIcon size={18} />;
      case 'framing bias':
        return <Frame size={18} />;
      case 'overconfidence bias':
        return <BadgeAlert size={18} />;
      case 'hindsight bias':
        return <Eye size={18} />;
      default:
        return <AlertCircle size={18} />;
    }
  };

  // Function to get icon for trade action
  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'buy':
        return <ArrowUpCircle size={16} className="text-green-500" />;
      case 'sell':
        return <ArrowDownCircle size={16} className="text-red-500" />;
      case 'hold':
        return <Pause size={16} className="text-yellow-500" />;
      default:
        return <AlertCircle size={16} />;
    }
  };

  // New function to fetch level-wise action data
  const fetchLevelActionData = async (resultId: string) => {
    try {
      console.log('Fetching level action data for result:', resultId);
      
      // First check if we already have the data
      if (levelActions[resultId]) {
        console.log('Using cached level action data');
        return levelActions[resultId];
      }
      
      // Try to fetch from the new function
      const { data, error } = await supabase.rpc(
        'get_level_actions_json',
        { result_id_param: resultId }
      );
      
      if (error) {
        console.error('Error fetching level action data:', error);
        return null;
      }
      
      if (data && Array.isArray(data)) {
        console.log('Received level action data:', data);
        
        // Store in state
        setLevelActions(prev => ({ ...prev, [resultId]: data }));
        return data;
      } else {
        // If the RPC call returns empty or invalid data, handle appropriately
        console.log('No level action data found or invalid format');
        return null;
      }
    } catch (error) {
      console.error('Error in fetchLevelActionData:', error);
      return null;
    }
  };

  // Parse trading history into actions and stats
  const parseTradingHistory = (result: GameResult) => {
    if (!result.game_session?.trading_history || tradingActions[result.id]) {
      return;
    }

    try {
      // Try to parse the trading history
      let actions: TradingAction[] = [];
      try {
        actions = typeof result.game_session.trading_history === 'string'
          ? JSON.parse(result.game_session.trading_history)
          : result.game_session.trading_history;
      } catch (e) {
        console.error('Error parsing trading history:', e);
        actions = [];
      }

      // Store actions in game_action schema if not already stored
      storeActionsInDatabase(result.id, actions);

      // Try to fetch level-wise action data from our new table
      fetchLevelActionData(result.id).then(levelData => {
        if (levelData) {
          console.log('Using server-side aggregated level data');
          // We could use this data directly instead of calculating it client-side
        } else {
          console.log('Falling back to client-side calculation');
          // Continue with existing client-side calculation
        }
      });

      // Calculate statistics
      const stats: TradingStats = {
        totalTrades: actions.length,
        buyOrders: actions.filter(a => a.action === 'buy').length,
        sellOrders: actions.filter(a => a.action === 'sell').length,
        holdActions: actions.filter(a => a.action === 'hold').length,
        levelStats: {}
      };

      // Calculate per-level statistics
      const levels = [...new Set(actions.map(a => a.level || 0))].sort((a, b) => a - b);
      
      levels.forEach(level => {
        const levelActions = actions.filter(a => (a.level || 0) === level);
        stats.levelStats![level] = {
          totalTrades: levelActions.length,
          buyOrders: levelActions.filter(a => a.action === 'buy').length,
          sellOrders: levelActions.filter(a => a.action === 'sell').length,
          holdActions: levelActions.filter(a => a.action === 'hold').length
        };
      });

      // Store in state
      setTradingActions(prev => ({ ...prev, [result.id]: actions }));
      setTradingStats(prev => ({ ...prev, [result.id]: stats }));
    } catch (error) {
      console.error('Error processing trading actions:', error);
    }
  };

  // Function to store trading actions in the database
  const storeActionsInDatabase = async (resultId: string, actions: TradingAction[]) => {
    try {
      // Check if actions are already stored
      const { data: existingActions } = await supabase
        .from('game_action')
        .select('id')
        .eq('result_id', resultId)
        .limit(1);
        
      if (existingActions && existingActions.length > 0) {
        console.log('Actions already stored for this result');
        return;
      }
      
      // Prepare actions for database storage
      const actionsToStore = actions.map(action => ({
        result_id: resultId,
        action_type: action.action,
        stock_name: action.stock_name,
        price: action.price,
        quantity: action.quantity,
        timestamp: action.timestamp,
        level: action.level || 0
      }));
      
      // Store in game_action table
      if (actionsToStore.length > 0) {
        const { error } = await supabase
          .from('game_action')
          .insert(actionsToStore);
          
        if (error) {
          console.error('Error storing actions in database:', error);
        } else {
          console.log(`Stored ${actionsToStore.length} actions in database`);
        }
      }
    } catch (error) {
      console.error('Error in storeActionsInDatabase:', error);
    }
  };

  // Function to get a level tag color
  const getLevelColor = (level: number): string => {
    const colors = [
      'bg-blue-600', 'bg-green-600', 'bg-yellow-600', 
      'bg-purple-600', 'bg-pink-600', 'bg-indigo-600'
    ];
    return colors[level % colors.length] || colors[0];
  };

  // Load personality report when viewing a player's report
  useEffect(() => {
    if (showReport) {
      const result = results.find(r => r.id === showReport);
      if (result && !personalityReports[result.id]) {
        loadPersonalityReport(result);
      }
    }
  }, [showReport, results]);

  // Load both trading history and level data when viewing a report
  useEffect(() => {
    if (showReport) {
      const result = results.find(r => r.id === showReport);
      if (result) {
        parseTradingHistory(result);
        fetchLevelActionData(result.id);
      }
    }
  }, [showReport, results]);

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
                        
                        {loadingReport[result.id] ? (
                          <div className="flex items-center justify-center py-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                            <span className="ml-3 text-gray-300">Generating analysis...</span>
                          </div>
                        ) : personalityReports[result.id] ? (
                          <div className="space-y-4 max-h-80 overflow-y-auto">
                            {personalityReports[result.id].includes('# Trading Bias Analysis') ? (
                              <>
                                {/* Handle markdown format from GROQ or local analysis */}
                                {personalityReports[result.id].split('##').slice(1).map((section, i) => {
                                  if (!section.trim()) return null;
                                  
                                  const title = section.split('\n')[0].trim();
                                  const content = section.split('\n').slice(1).join('\n').trim();
                                  
                                  return (
                                    <div key={i} className="bg-gray-800 p-3 rounded-md">
                                      <div className="flex items-center gap-2 mb-2">
                                        {getBiasIcon(title)}
                                        <h5 className="font-semibold text-blue-300">{title}</h5>
                                      </div>
                                      <p className="text-gray-300 text-sm whitespace-pre-wrap">{content}</p>
                                    </div>
                                  );
                                })}
                              </>
                            ) : (
                              <div className="max-h-64 overflow-y-auto">
                                {tradingActions[result.id]?.length > 0 ? (
                                  <div className="space-y-4">
                                    {/* Group actions by level */}
                                    {[...new Set(tradingActions[result.id].map(a => a.level || 0))]
                                      .sort((a, b) => a - b)
                                      .map(level => (
                                        <div key={`level-${level}`} className="mb-4">
                                          <div className="flex items-center gap-2 mb-2">
                                            <span className={`${getLevelColor(level)} text-white text-xs px-2 py-1 rounded`}>
                                              Level {level || 1}
                                            </span>
                                            <span className="text-sm text-gray-400">
                                              {tradingStats[result.id]?.levelStats?.[level]?.totalTrades || 0} actions
                                            </span>
                                          </div>
                                          <div className="space-y-2">
                                            {tradingActions[result.id]
                                              .filter(action => (action.level || 0) === level)
                                              .map((action, index) => (
                                                <div key={index} className="bg-gray-800 p-2 rounded flex items-center justify-between">
                                                  <div className="flex items-center gap-2">
                                                    {getActionIcon(action.action)}
                                                    <span className="font-medium">{action.action.toUpperCase()}</span>
                                                    <span className="text-gray-400">{action.stock_name}</span>
                                                  </div>
                                                  <div className="flex items-center gap-4">
                                                    <span>{action.quantity} shares</span>
                                                    <span className="font-semibold">${action.price?.toFixed(2)}</span>
                                                  </div>
                                                </div>
                                              ))
                                            }
                                          </div>
                                        </div>
                                      ))
                                    }
                                  </div>
                                ) : (
                                  <div className="text-center py-6 text-gray-400">
                                    <BarChart className="mx-auto mb-2 opacity-50" size={32} />
                                    <p>No trading activity recorded</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center py-4">
                            <button 
                              onClick={() => loadPersonalityReport(result)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                            >
                              Generate Personality Analysis
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {/* Trading Activity Section */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <div className="bg-gray-700 p-4 rounded-lg">
                          <h4 className="text-lg font-semibold text-blue-400 mb-3">Trading Activity</h4>
                          <div className="max-h-64 overflow-y-auto">
                            {tradingActions[result.id]?.length > 0 ? (
                              <div className="space-y-4">
                                {/* Group actions by level */}
                                {[...new Set(tradingActions[result.id].map(a => a.level || 0))]
                                  .sort((a, b) => a - b)
                                  .map(level => (
                                    <div key={`level-${level}`} className="mb-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className={`${getLevelColor(level)} text-white text-xs px-2 py-1 rounded`}>
                                          Level {level || 1}
                                        </span>
                                        <span className="text-sm text-gray-400">
                                          {tradingStats[result.id]?.levelStats?.[level]?.totalTrades || 0} actions
                                        </span>
                                      </div>
                                      <div className="space-y-2">
                                        {tradingActions[result.id]
                                          .filter(action => (action.level || 0) === level)
                                          .map((action, index) => (
                                            <div key={index} className="bg-gray-800 p-2 rounded flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                {getActionIcon(action.action)}
                                                <span className="font-medium">{action.action.toUpperCase()}</span>
                                                <span className="text-gray-400">{action.stock_name}</span>
                                              </div>
                                              <div className="flex items-center gap-4">
                                                <span>{action.quantity} shares</span>
                                                <span className="font-semibold">${action.price?.toFixed(2)}</span>
                                              </div>
                                            </div>
                                          ))
                                        }
                                      </div>
                                    </div>
                                  ))
                                }
                              </div>
                            ) : (
                              <div className="text-center py-6 text-gray-400">
                                <BarChart className="mx-auto mb-2 opacity-50" size={32} />
                                <p>No trading activity recorded</p>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="bg-gray-700 p-4 rounded-lg">
                          <h4 className="text-lg font-semibold text-blue-400 mb-3">Action Distribution</h4>
                          <div className="h-64 flex items-center justify-center">
                            {tradingStats[result.id]?.totalTrades > 0 ? (
                              <div className="w-full h-full">
                                <div className="flex items-end justify-around pb-4 h-3/4">
                                  {tradingStats[result.id].buyOrders > 0 && (
                                    <div className="flex flex-col items-center">
                                      <div className="bg-green-500 w-12" style={{ 
                                        height: `${(tradingStats[result.id].buyOrders / tradingStats[result.id].totalTrades) * 100}%` 
                                      }}></div>
                                      <span className="mt-2">Buy</span>
                                    </div>
                                  )}
                                  {tradingStats[result.id].sellOrders > 0 && (
                                    <div className="flex flex-col items-center">
                                      <div className="bg-red-500 w-12" style={{ 
                                        height: `${(tradingStats[result.id].sellOrders / tradingStats[result.id].totalTrades) * 100}%` 
                                      }}></div>
                                      <span className="mt-2">Sell</span>
                                    </div>
                                  )}
                                  {tradingStats[result.id].holdActions > 0 && (
                                    <div className="flex flex-col items-center">
                                      <div className="bg-yellow-500 w-12" style={{ 
                                        height: `${(tradingStats[result.id].holdActions / tradingStats[result.id].totalTrades) * 100}%` 
                                      }}></div>
                                      <span className="mt-2">Hold</span>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Level breakdown */}
                                <div className="mt-4">
                                  <h5 className="text-sm text-gray-400 mb-2">Actions per level:</h5>
                                  <div className="flex gap-2 flex-wrap">
                                    {tradingStats[result.id]?.levelStats && 
                                      Object.entries(tradingStats[result.id].levelStats || {})
                                        .sort(([a], [b]) => Number(a) - Number(b))
                                        .map(([level, stats]) => (
                                          <div key={`level-stats-${level}`} 
                                               className={`${getLevelColor(Number(level))} px-2 py-1 rounded text-xs flex items-center gap-1`}>
                                            <span>L{level}:</span>
                                            <span>{stats.totalTrades}</span>
                                          </div>
                                        ))
                                    }
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center text-gray-400">
                                <BarChart className="mx-auto mb-2 opacity-50" size={32} />
                                <p>No action data available</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Trading Statistics */}
                      <div className="bg-gray-700 p-4 rounded-lg mt-6">
                        <h4 className="text-lg font-semibold text-blue-400 mb-3">Trading Statistics</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <h5 className="text-gray-400 mb-2">Total Trades</h5>
                            <p className="text-4xl font-bold">{tradingStats[result.id]?.totalTrades || 0}</p>
                          </div>
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <h5 className="text-gray-400 mb-2">Buy Orders</h5>
                            <p className="text-4xl font-bold text-green-500">{tradingStats[result.id]?.buyOrders || 0}</p>
                          </div>
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <h5 className="text-gray-400 mb-2">Sell Orders</h5>
                            <p className="text-4xl font-bold text-red-500">{tradingStats[result.id]?.sellOrders || 0}</p>
                          </div>
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <h5 className="text-gray-400 mb-2">Hold Actions</h5>
                            <p className="text-4xl font-bold text-yellow-500">{tradingStats[result.id]?.holdActions || 0}</p>
                          </div>
                        </div>
                        
                        {/* Add advanced level statistics section */}
                        {levelActions[result.id] && levelActions[result.id].length > 0 && (
                          <div className="mt-6">
                            <h5 className="text-lg font-semibold text-blue-300 mb-3">Advanced Level Statistics</h5>
                            <div className="bg-gray-800 p-4 rounded-lg">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                  <thead>
                                    <tr className="border-b border-gray-700">
                                      <th className="py-2 px-3">Level</th>
                                      <th className="py-2 px-3">Total</th>
                                      <th className="py-2 px-3">Buy</th>
                                      <th className="py-2 px-3">Sell</th>
                                      <th className="py-2 px-3">Hold</th>
                                      <th className="py-2 px-3">Avg Buy Price</th>
                                      <th className="py-2 px-3">Avg Sell Price</th>
                                      <th className="py-2 px-3">Buy Quantity</th>
                                      <th className="py-2 px-3">Sell Quantity</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {levelActions[result.id].map((levelData) => (
                                      <tr key={`level-${levelData.level}`} className="border-b border-gray-700">
                                        <td className="py-2 px-3">
                                          <span className={`${getLevelColor(levelData.level)} text-white text-xs px-2 py-1 rounded`}>
                                            Level {levelData.level}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3">{levelData.totalTrades}</td>
                                        <td className="py-2 px-3 text-green-500">{levelData.buyOrders}</td>
                                        <td className="py-2 px-3 text-red-500">{levelData.sellOrders}</td>
                                        <td className="py-2 px-3 text-yellow-500">{levelData.holdActions}</td>
                                        <td className="py-2 px-3">${levelData.avgBuyPrice?.toFixed(2) || '0.00'}</td>
                                        <td className="py-2 px-3">${levelData.avgSellPrice?.toFixed(2) || '0.00'}</td>
                                        <td className="py-2 px-3">{levelData.totalBuyQuantity}</td>
                                        <td className="py-2 px-3">{levelData.totalSellQuantity}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            
                            {/* Level-based trading performance chart */}
                            <div className="mt-4 bg-gray-800 p-4 rounded-lg">
                              <h5 className="text-gray-400 mb-3">Level-based Trading Intensity</h5>
                              <div className="h-40 flex items-end justify-around">
                                {levelActions[result.id].map((levelData) => (
                                  <div key={`bar-${levelData.level}`} className="flex flex-col items-center">
                                    <div 
                                      className={`${getLevelColor(levelData.level)} w-12`}
                                      style={{ height: `${Math.min(100, (levelData.totalTrades / Math.max(...levelActions[result.id].map(d => d.totalTrades))) * 100)}%` }}
                                    ></div>
                                    <span className="mt-2 text-xs">Level {levelData.level}</span>
                                    <span className="text-xs text-gray-400">{levelData.totalTrades}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
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