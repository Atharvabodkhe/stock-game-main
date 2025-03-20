import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/gameStore';
import { generatePersonalityReport } from '../lib/groq';
import { TrendingUp, TrendingDown, Minus, RotateCcw, Timer, DollarSign, AlertTriangle } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';

interface Stock {
  name: string;
  price: number;
  previousPrice: number;
  history: number[];
  quantity?: number;
}

const PauseOverlay = () => (
  <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
    <div className="bg-gray-800 p-8 rounded-xl shadow-lg max-w-md text-center">
      <h2 className="text-2xl font-bold text-white mb-4">Game Paused</h2>
      <p className="text-gray-300 mb-6">
        The admin has paused the game. Please wait while the game is resumed.
      </p>
      <div className="animate-pulse text-yellow-500 flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    </div>
  </div>
);

function Game() {
  const navigate = useNavigate();
  const location = useLocation();
  const [timeLeft, setTimeLeft] = useState(60);
  const [loading, setLoading] = useState(true);
  const [actionsCount, setActionsCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomPlayerId, setRoomPlayerId] = useState<string | null>(null);
  const [savingAttempts, setSavingAttempts] = useState(0);
  const [levelAdvanceLock, setLevelAdvanceLock] = useState(false);
  const [displayLevel, setDisplayLevel] = useState(1);
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<Array<{id: string, name: string, balance: number, rank: number, isCurrentPlayer: boolean}>>([]);
  const [personalityReport, setPersonalityReport] = useState<string | null>(null);
  
  const lastLevelAdvanceTime = useRef(Date.now());
  const initComplete = useRef(false);
  const loadingTimeout = useRef<NodeJS.Timeout | null>(null);
  const [completionProcessStarted, setCompletionProcessStarted] = useState(false);
  
  const [recentUpdates, setRecentUpdates] = useState<{[key: string]: boolean}>({});

  const {
    currentLevel,
    balance,
    stocks: gameStocks,
    stockPerformance,
    news,
    gameActions,
    gameCompleted,
    autoUpdateEnabled,
    isLoading,
    isPaused,
    pausedAt,
    playerHoldings,
    updateStocks,
    addAction,
    updateBalance,
    nextLevel,
    resetGame,
    setGameCompleted,
    fetchInitialData,
    setupRealtimeSubscriptions,
    cleanupRealtimeSubscriptions,
    buyStock,
    sellStock,
    getStockAvgPrice,
    getStockQuantity
  } = useGameStore();

  const [stockQuantities, setStockQuantities] = useState<{[key: string]: number}>({});

  const setLoadingWithDebounce = useCallback((isLoading: boolean) => {
    if (loadingTimeout.current) {
      clearTimeout(loadingTimeout.current);
      loadingTimeout.current = null;
    }
    
    if (!isLoading) {
      loadingTimeout.current = setTimeout(() => {
        setLoading(false);
        initComplete.current = true;
      }, 300);
    } else if (!initComplete.current || !loading) {
      setLoading(true);
    }
  }, [loading]);

  useEffect(() => {
    setDisplayLevel(currentLevel + 1);
  }, [currentLevel]);

  useEffect(() => {
    fetchInitialData();
    setupRealtimeSubscriptions();
    
    return () => {
      cleanupRealtimeSubscriptions();
    };
  }, [fetchInitialData, setupRealtimeSubscriptions, cleanupRealtimeSubscriptions]);

  useEffect(() => {
    setLoadingWithDebounce(isLoading);
  }, [isLoading, setLoadingWithDebounce]);

  const handleNextLevel = useCallback(() => {
    if (isPaused || gameCompleted || levelAdvanceLock) {
      console.log('Game paused or locked, ignoring level advancement request');
      return;
    }
    
    if (levelAdvanceLock) {
      console.log('Level advance locked, ignoring advancement request');
      return;
    }
    
    const now = Date.now();
    if (now - lastLevelAdvanceTime.current < 500) {
      console.log('Advancing too quickly, ignoring request');
      return;
    }
    
    console.log(`Current level before progression: ${currentLevel} (displayed as Level ${currentLevel + 1})`);
    
    if (currentLevel >= 9) {
      console.log('Reached final level or Complete Game button clicked, completing game');
      setGameCompleted(true);
      return;
    }
    
    setLevelAdvanceLock(true);
    lastLevelAdvanceTime.current = now;
    
    setActionsCount(0);
    setTimeLeft(60);
    
    console.log(`Advancing to next level: ${currentLevel + 1} (will display as Level ${currentLevel + 2})`);
    nextLevel();
    
    setTimeout(() => {
      setLevelAdvanceLock(false);
    }, 1000);
  }, [currentLevel, nextLevel, setGameCompleted, levelAdvanceLock, isPaused, gameCompleted]);

  const checkAuth = useCallback(async () => {
    try {
      setError(null);
      console.log('Game: Checking authentication and game session');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Authentication error:', sessionError);
        throw new Error('Authentication error. Please sign in again.');
      }

      if (!session) {
        console.log('No authentication session, redirecting to login');
        navigate('/');
        return;
      }

      const sessionIdFromState = location.state?.sessionId;
      let finalSessionId = sessionIdFromState;
      
      console.log('Session ID from navigation state:', sessionIdFromState);
      
      if (!sessionIdFromState) {
        console.log('No session ID in state, checking for active sessions');
        
        const { data: activePlayerData, error: playerError } = await supabase
          .from('room_players')
          .select('id, room_id, session_id, status')
          .eq('user_id', session.user.id)
          .eq('status', 'in_game')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (playerError) {
          console.error('Error checking for active game sessions:', playerError);
        } else if (activePlayerData?.session_id) {
          console.log('Found active game session:', activePlayerData.session_id);
          finalSessionId = activePlayerData.session_id;
          setRoomId(activePlayerData.room_id);
          setRoomPlayerId(activePlayerData.id);
        } else {
          console.log('No active game sessions found');
        }
      }
      
      if (finalSessionId) {
        console.log('Using game session ID:', finalSessionId);
        setSessionId(finalSessionId);
        
        const { data: playerData, error: playerError } = await supabase
          .from('room_players')
          .select('id, room_id, status')
          .eq('user_id', session.user.id)
          .eq('session_id', finalSessionId)
          .eq('status', 'in_game')
          .maybeSingle();
          
        if (playerError) {
          console.error('Error validating game session:', playerError);
        } else if (playerData) {
          console.log('Session validated, player is in game:', playerData);
          setRoomId(playerData.room_id);
          setRoomPlayerId(playerData.id);
          
          console.log('Resetting game state to initial values');
          resetGame();
        } else {
          console.log('Session ID exists but is not valid for this user or game is not active');
          
          const { data: anyPlayerData } = await supabase
            .from('room_players')
            .select('id, status')
            .eq('user_id', session.user.id)
            .eq('session_id', finalSessionId)
            .maybeSingle();
            
          if (anyPlayerData) {
            console.log('Player found but status is not in_game:', anyPlayerData.status);
            
            if (anyPlayerData.status === 'joined') {
              console.log('Attempting to update player status to in_game');
              
              const { error: updateError } = await supabase
                .from('room_players')
                .update({ status: 'in_game' })
                .eq('id', anyPlayerData.id);
                
              if (updateError) {
                console.error('Error updating player status:', updateError);
              } else {
                console.log('Player status updated to in_game');
                setRoomPlayerId(anyPlayerData.id);
                
                const { data: updatedPlayerData } = await supabase
                  .from('room_players')
                  .select('room_id')
                  .eq('id', anyPlayerData.id)
                  .single();
                  
                if (updatedPlayerData) {
                  setRoomId(updatedPlayerData.room_id);
                }
              }
            }
          }
        }
      } else {
        console.log('No valid game session found');
        
        try {
          console.log('Creating new game session for solo play');
          const { data: newSession, error: newSessionError } = await supabase
            .from('game_sessions')
            .insert([
              {
                user_id: session.user.id,
                final_balance: 10000,
                created_at: new Date().toISOString()
              }
            ])
            .select()
            .single();
            
          if (newSessionError) {
            console.error('Error creating new game session:', newSessionError);
            throw new Error('Failed to create new game session');
          }
          
          if (newSession) {
            console.log('New game session created:', newSession.id);
            setSessionId(newSession.id);
            
            console.log('Resetting game state for new solo session');
            resetGame();
            
            setLoadingWithDebounce(false);
            return;
          }
        } catch (newSessionError) {
          console.error('Error creating new session:', newSessionError);
          setError('Failed to create a new game session. Please try again.');
          setTimeout(() => navigate('/dashboard'), 3000);
          return;
        }
        
        setError('No active game session found. Please return to the dashboard.');
        setTimeout(() => navigate('/dashboard'), 3000);
        return;
      }

      setLoadingWithDebounce(false);
    } catch (error) {
      console.error('Error in checkAuth:', error);
      setError('An unexpected error occurred. Please try again.');
      setLoadingWithDebounce(false);
      setTimeout(() => navigate('/'), 3000);
    }
  }, [navigate, location.state, setLoadingWithDebounce]);

  useEffect(() => {
    checkAuth();
    
    const safetyTimeout = setTimeout(() => {
      if (loading && !initComplete.current) {
        console.log('Safety timeout triggered to prevent infinite loading');
        setLoadingWithDebounce(false);
        setError('Game took too long to load. Please try refreshing the page.');
      }
    }, 15000);
    
    return () => {
      clearTimeout(safetyTimeout);
      if (loadingTimeout.current) {
        clearTimeout(loadingTimeout.current);
      }
    };
  }, [checkAuth, loading, setLoadingWithDebounce]);

  useEffect(() => {
    console.log('Game component mounted, ensuring game is not marked as completed');
    if (!showCompletionScreen) {
      setGameCompleted(false);
    }
  }, [setGameCompleted, showCompletionScreen]);

  useEffect(() => {
    if (gameCompleted) {
      try {
        if (gameActions.length === 0 && currentLevel < 9) {
          console.log('Game marked as completed but no actions taken, resetting game state');
          setGameCompleted(false);
          return;
        }
        
        setShowCompletionScreen(true);
        
        handleGameCompletion();
      } catch (error) {
        console.error('Error in handleGameCompletion:', error);
        setError('Error completing game. Your progress has been saved.');
        setLoadingWithDebounce(false);
        setShowCompletionScreen(true);
      }
    }
  }, [gameCompleted, setLoadingWithDebounce, currentLevel, gameActions]);

  useEffect(() => {
    if (gameCompleted && !showCompletionScreen && !loading) {
      console.log('Game completed but completion screen not shown, showing it now');
      setTimeout(() => {
        setShowCompletionScreen(true);
        if (sessionId) {
          localStorage.setItem(`game_completed_${sessionId}`, 'true');
        }
      }, 100);
    }
  }, [gameCompleted, showCompletionScreen, loading, sessionId]);

  useEffect(() => {
    if (showCompletionScreen) {
      console.log('Completion screen is now visible, ensuring it stays visible');
      setGameCompleted(true);
      setLoadingWithDebounce(false);
    }
  }, [showCompletionScreen, setGameCompleted, setLoadingWithDebounce]);

  useEffect(() => {
    let safetyTimeout: NodeJS.Timeout | null = null;
    
    if (gameCompleted && loading) {
      console.log('Game completed but still loading, setting safety timeout');
      
      if (!personalityReport) {
        setPersonalityReport("Your trading analysis is being generated. Your final balance shows your trading performance.");
      }
      
      safetyTimeout = setTimeout(() => {
        console.log('Safety timeout triggered for game completion');
        setLoadingWithDebounce(false);
        setShowCompletionScreen(true);
      }, 5000);
    }
    
    return () => {
      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
      }
    };
  }, [gameCompleted, loading, setLoadingWithDebounce, personalityReport]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (!gameCompleted && !levelAdvanceLock && !loading) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (!levelAdvanceLock && currentLevel < 9) {
              handleNextLevel();
            }
            return 60;
          }
          return prev - 1;
        });

        if (autoUpdateEnabled) {
          updateStocks();
        }
      }, 1000);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [gameCompleted, autoUpdateEnabled, updateStocks, handleNextLevel, levelAdvanceLock, loading, currentLevel]);

  const [canAdvance, setCanAdvance] = useState(false);
  
  useEffect(() => {
    if (actionsCount === 3 && !gameCompleted && !levelAdvanceLock && currentLevel < 9) {
      console.log(`All 3 actions completed on level ${currentLevel}, player can advance to next level`);
      setCanAdvance(true);
    } else {
      setCanAdvance(false);
    }
  }, [actionsCount, gameCompleted, currentLevel, levelAdvanceLock]);

  const handleAction = async (stockName: string, action: string, price: number) => {
    if (isPaused || gameCompleted || levelAdvanceLock) return;

    try {
      setError(null);
      
      let amount = 0;
      let transactionPrice = price;
      const quantity = stockQuantities[stockName] || 1;
      
      if (action === 'buy') {
        const totalCost = buyStock(stockName, quantity);
        if (totalCost > balance) {
          setError(`Insufficient funds. You need $${totalCost.toFixed(2)} to buy ${quantity} shares of ${stockName}.`);
          return;
        }
        amount = -totalCost;
        transactionPrice = totalCost / quantity;
      } else if (action === 'sell') {
        if (getStockQuantity(stockName) < quantity) {
          setError(`You don't own enough shares of ${stockName} to sell.`);
          return;
        }
        
        const saleValue = sellStock(stockName, quantity);
        amount = saleValue;
        transactionPrice = saleValue / quantity;
      }
      
      updateBalance(amount);
      
      const actionData = {
        level: currentLevel,
        stock_name: stockName,
        action,
        price: transactionPrice,
        quantity,
        avg_price: getStockAvgPrice(stockName),
        owned_quantity: getStockQuantity(stockName),
        timestamp: new Date().toISOString(),
      };
      
      addAction(actionData);

      if (sessionId) {
        const { error: actionError } = await supabase
          .from('game_actions')
          .insert([
            {
              ...actionData,
              session_id: sessionId
            }
          ]);
          
        if (actionError) {
          console.error('Error saving action:', actionError);
        }
        
        const { error: sessionError } = await supabase
          .from('game_sessions')
          .update({ final_balance: balance + amount })
          .eq('id', sessionId);
          
        if (sessionError) {
          console.error('Error updating session balance:', sessionError);
        }
      }

      setActionsCount(prev => Math.min(prev + 1, 3));
      
    } catch (error) {
      console.error('Error handling action:', error);
      setError('Error processing action. Please try again.');
    }
  };

  const handleGameCompletion = async () => {
    if (completionProcessStarted) {
      console.log('Game completion process already started, skipping duplicate execution');
      return;
    }
    
    setCompletionProcessStarted(true);
    
    if (gameActions.length === 0 && currentLevel < 9) {
      console.log('Game completion triggered but no actions taken yet, resetting game state');
      setGameCompleted(false);
      setLoadingWithDebounce(false);
      setCompletionProcessStarted(false);
      return;
    }
    
    if (savingAttempts >= 3) {
      console.error(`Maximum save attempts (${savingAttempts}) reached, stopping retries`);
      setError('Failed to save game results after multiple attempts. Your final score is saved locally.');
      
      setLoadingWithDebounce(false);
      setShowCompletionScreen(true);
      return;
    }

    const forceCompletionTimeout = setTimeout(() => {
      console.log('Force completion screen after delay');
      setLoadingWithDebounce(false);
      setShowCompletionScreen(true);
    }, 2000);

    try {
      setLoadingWithDebounce(true);
      setError(null);
      console.log('Starting game completion process...');
      
      const completionTimeout = setTimeout(() => {
        console.log('Completion safety timeout triggered');
        setLoadingWithDebounce(false);
        setShowCompletionScreen(true);
      }, 10000);
      
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error during game completion:', sessionError);
        throw new Error('Authentication error. Please sign in again.');
      }

      if (!session) {
        console.error('No authenticated session found during game completion');
        throw new Error('No authenticated session found');
      }

      let report = null;
      try {
        console.log(`Generating personality report based on ${gameActions.length} game actions...`);
        
        if (gameActions.length === 0) {
          console.warn('No game actions found, generating default report');
          report = "Not enough trading activity to generate a detailed analysis.";
        } else {
          try {
            const actionsCopy = JSON.parse(JSON.stringify(gameActions));
            report = await generatePersonalityReport(actionsCopy);
            
            if (!report || typeof report !== 'string' || report.trim() === '') {
              throw new Error('Empty or invalid report received');
            }
          } catch (reportGenError) {
            console.error('Error generating report:', reportGenError);
            report = "Unable to generate detailed trading analysis due to technical difficulties. Your trading style shows a mix of strategic decisions based on market conditions.";
          }
        }
        
        console.log('Personality report generated:', report ? 'Success' : 'Failed');
      } catch (reportError) {
        console.error('Error during report generation:', reportError);
        report = "Unable to generate detailed trading analysis due to technical difficulties. Your trading style shows a mix of strategic decisions based on market conditions.";
      }

      if (!report) {
        console.warn('Failed to generate personality report, using fallback');
        report = "Trading analysis unavailable. Thank you for playing! Your final balance shows your trading performance.";
      }

      setPersonalityReport(report);

      console.log('Game completion state:', {
        currentLevel,
        balance,
        sessionId,
        roomId,
        roomPlayerId,
        actionsCount: gameActions.length,
        reportLength: report ? report.length : 0
      });

      if (sessionId) {
        console.log(`Updating existing game session (${sessionId}) with final results`);
        
        try {
          const { error: sessionUpdateError } = await supabase
            .from('game_sessions')
            .update({
              final_balance: balance,
              personality_report: report,
              completed_at: new Date().toISOString()
            })
            .eq('id', sessionId);
            
          if (sessionUpdateError) {
            console.error('Error updating game session:', sessionUpdateError);
            throw sessionUpdateError;
          }
          console.log('Game session updated successfully');
        } catch (error) {
          console.error('Failed to update game session:', error);
          throw new Error(`Failed to update game session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        if (roomPlayerId) {
          try {
            console.log(`Updating room player status (${roomPlayerId}) to completed`);
            const { error: playerError } = await supabase
              .from('room_players')
              .update({ 
                status: 'completed',
                completed_at: new Date().toISOString()
              })
              .eq('id', roomPlayerId);
              
            if (playerError) {
              console.error('Error updating player status:', playerError);
              throw playerError;
            }
            console.log('Player status updated successfully');
          } catch (playerUpdateError) {
            console.error('Failed to update player status:', playerUpdateError);
          }
        }
        
        try {
          console.log('Adding game result record');
          const { data: resultData, error: resultError } = await supabase
            .from('game_results')
            .insert([
              {
                room_id: roomId,
                session_id: sessionId,
                user_id: session.user.id,
                final_balance: balance,
                created_at: new Date().toISOString()
              }
            ])
            .select();

          if (resultError) {
            console.error('Error inserting game result:', resultError);
            throw resultError;
          }
          console.log('Game result added successfully:', resultData?.[0]?.id || 'unknown ID');
        } catch (error) {
          console.error('Failed to add game result:', error);
          throw new Error(`Failed to save game result: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        if (roomId) {
          try {
            console.log(`Checking if all players in room ${roomId} have completed`);
            const { data: playersData, error: playersError } = await supabase
              .from('room_players')
              .select('status')
              .eq('room_id', roomId)
              .eq('status', 'in_game');
              
            if (playersError) {
              console.error('Error checking remaining players:', playersError);
              throw playersError;
            }

            console.log(`Found ${playersData?.length || 0} players still in game`);
            
            if (!playersData || playersData.length === 0 || currentLevel >= 9) {
              console.log('All players completed or final level reached, updating room status');
              const { error: roomError } = await supabase
                .from('game_rooms')
                .update({ 
                  status: 'completed',
                  ended_at: new Date().toISOString()
                })
                .eq('id', roomId);
                
              if (roomError) {
                console.error('Error updating room status:', roomError);
                throw roomError;
              }
              console.log('Room status updated to completed');

              try {
                console.log('Calculating final rankings');
                const { data: results, error: ranksError } = await supabase
                  .from('game_results')
                  .select('id, final_balance, user_id')
                  .eq('room_id', roomId)
                  .order('final_balance', { ascending: false });

                if (ranksError) {
                  console.error('Error fetching results for ranking:', ranksError);
                  throw ranksError;
                }

                if (results && results.length > 0) {
                  console.log(`Updating ranks for ${results.length} players`);
                  for (let i = 0; i < results.length; i++) {
                    const { error: updateRankError } = await supabase
                      .from('game_results')
                      .update({ 
                        rank: i + 1,
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', results[i].id);

                    if (updateRankError) {
                      console.error(`Error updating rank for result ${results[i].id}:`, updateRankError);
                    }
                  }
                  console.log('All player ranks updated successfully');
                }
              } catch (rankingError) {
                console.error('Error updating rankings:', rankingError);
              }
            }
          } catch (roomUpdateError) {
            console.error('Error updating room status:', roomUpdateError);
          }
        }
        
        if (roomId) {
          try {
            console.log('Fetching leaderboard data');
            const { data: leaderboardData, error: leaderboardError } = await supabase
              .from('game_results')
              .select(`
                id,
                rank,
                final_balance,
                user:users(id, name, email)
              `)
              .eq('room_id', roomId)
              .order('final_balance', { ascending: false });
              
            if (leaderboardError) {
              console.error('Error fetching leaderboard:', leaderboardError);
            } else if (leaderboardData) {
              console.log('Leaderboard data:', leaderboardData);
              const formattedLeaderboard = leaderboardData.map(entry => {
                let playerName = 'Unknown Player';
                let isCurrentPlayer = false;
                
                if (entry.user && typeof entry.user === 'object' && 'name' in entry.user && typeof entry.user.name === 'string') {
                  playerName = entry.user.name;
                  
                  if (session && 'id' in entry.user && entry.user.id === session.user.id) {
                    isCurrentPlayer = true;
                  }
                }
                
                return {
                  id: entry.id,
                  name: playerName,
                  balance: Number(entry.final_balance) || 0,
                  rank: Number(entry.rank) || 0,
                  isCurrentPlayer
                };
              });
              
              formattedLeaderboard.sort((a, b) => b.balance - a.balance);
              
              setLeaderboard(formattedLeaderboard);
              
              try {
                await supabase.rpc('notify_leaderboard_update', { 
                  room_id: roomId 
                });
                console.log('Notified about leaderboard update');
              } catch (notifyError) {
                console.error('Error notifying about leaderboard update:', notifyError);
              }
            }
          } catch (leaderboardError) {
            console.error('Error processing leaderboard:', leaderboardError);
          }
        }
      } else {
        try {
          console.log('Creating new game session for solo game');
          const { data: gameSession, error: sessionError } = await supabase
            .from('game_sessions')
            .insert([
              {
                user_id: session.user.id,
                final_balance: balance,
                personality_report: report,
                completed_at: new Date().toISOString()
              }
            ])
            .select()
            .single();

          if (sessionError) {
            console.error('Error creating solo game session:', sessionError);
            throw sessionError;
          }
          console.log('Solo game session created successfully:', gameSession?.id || 'unknown ID');

          if (gameSession) {
            try {
              console.log(`Saving ${gameActions.length} game actions`);
              const { error: actionsError } = await supabase
                .from('game_actions')
                .insert(
                  gameActions.map(action => ({
                    ...action,
                    session_id: gameSession.id,
                  }))
                );

              if (actionsError) {
                console.error('Error saving game actions:', actionsError);
                throw actionsError;
              }
              console.log('Game actions saved successfully');
            } catch (actionsError) {
              console.error('Failed to save game actions:', actionsError);
            }
          }
        } catch (error) {
          console.error('Error handling solo game completion:', error);
          throw new Error(`Failed to save solo game: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      console.log('Game completion process successful');
      clearTimeout(completionTimeout);
      clearTimeout(forceCompletionTimeout);
      setLoadingWithDebounce(false);
      setShowCompletionScreen(true);
    } catch (error) {
      console.error('Error saving game data:', error);
      
      clearTimeout(forceCompletionTimeout);
      
      const newAttemptCount = savingAttempts + 1;
      setSavingAttempts(newAttemptCount);
      
      setError(`Error saving game results. Retrying... (Attempt ${newAttemptCount}/3)`);
      setLoadingWithDebounce(false);
      
      const retryDelay = Math.min(1000 * Math.pow(2, savingAttempts), 4000);
      console.log(`Will retry in ${retryDelay}ms (attempt ${newAttemptCount})`);
      
      if (newAttemptCount >= 3) {
        console.log('Final retry attempt failed, showing completion screen anyway');
        if (!personalityReport) {
          setPersonalityReport("Unable to generate trading analysis due to connection issues. Your final balance reflects your trading performance.");
        }
        setShowCompletionScreen(true);
        setCompletionProcessStarted(false);
        return;
      }
      
      setTimeout(() => {
        setCompletionProcessStarted(false);
        handleGameCompletion();
      }, retryDelay);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const price = payload[0].value;
      const data = payload[0].payload;
      return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
          {data.level && <p className="text-gray-400 text-xs mb-1">Level {data.level}</p>}
          <p className="text-green-500 font-semibold">
            ${typeof price === 'number' ? price.toFixed(2) : price}
          </p>
        </div>
      );
    }
    return null;
  };

  const handleCompleteGame = useCallback(() => {
    console.log('Complete Game button clicked, completing game');
    
    setGameCompleted(true);
    setShowCompletionScreen(true);
    
    if (sessionId) {
      localStorage.setItem(`game_completed_${sessionId}`, 'true');
    }
    
    if (roomId) {
      const updateRoomStatus = async (attempt = 1) => {
        try {
          console.log(`Directly updating room ${roomId} status to completed (attempt ${attempt})`);
          const { error: roomError } = await supabase
            .from('game_rooms')
            .update({ 
              status: 'completed',
              ended_at: new Date().toISOString()
            })
            .eq('id', roomId);
            
          if (roomError) {
            console.error('Error directly updating room status:', roomError);
            if (attempt < 3) {
              const delay = Math.pow(2, attempt) * 1000;
              console.log(`Will retry updating room status in ${delay}ms`);
              setTimeout(() => updateRoomStatus(attempt + 1), delay);
            }
          } else {
            console.log('Room status successfully updated to completed');
          }
          
          if (roomPlayerId) {
            const { error: playerError } = await supabase
              .from('room_players')
              .update({ 
                status: 'completed',
                completed_at: new Date().toISOString()
              })
              .eq('id', roomPlayerId);
              
            if (playerError) {
              console.error('Error updating player status:', playerError);
            } else {
              console.log('Player status successfully updated to completed');
            }
          }
          
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && sessionId) {
              console.log('Adding game result record');
              await supabase
                .from('game_results')
                .insert([
                  {
                    room_id: roomId,
                    session_id: sessionId,
                    user_id: session.user.id,
                    final_balance: balance,
                    created_at: new Date().toISOString()
                  }
                ]);
              console.log('Game result record added');
            }
          } catch (resultError) {
            console.error('Error adding game result:', resultError);
          }
        } catch (error) {
          console.error('Error in direct room update:', error);
        }
      };
      
      updateRoomStatus();
    }
    
    setTimeout(() => {
      console.log('Forcing completion screen to show after Complete Game button click');
      setLoadingWithDebounce(false);
      setShowCompletionScreen(true);
    }, 500);
  }, [setGameCompleted, setLoadingWithDebounce, roomId, roomPlayerId, sessionId, balance]);

  useEffect(() => {
    if (sessionId) {
      const savedCompletion = localStorage.getItem(`game_completed_${sessionId}`);
      if (savedCompletion === 'true') {
        console.log('Found saved completion state in localStorage, restoring...');
        setGameCompleted(true);
        setShowCompletionScreen(true);
        setLoadingWithDebounce(false);
      }
    }
  }, [sessionId, setGameCompleted, setLoadingWithDebounce]);

  const shouldShowCompletionScreen = showCompletionScreen || 
    (gameCompleted && sessionId && localStorage.getItem(`game_completed_${sessionId}`) === 'true');

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (!isPaused && !gameCompleted && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (timer) clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [timeLeft, isPaused, gameCompleted]);

  useEffect(() => {
    fetchInitialData();
    setupRealtimeSubscriptions();
    
    const handleStockUpdate = (updatedStock: any) => {
      if (updatedStock && updatedStock.name) {
        setRecentUpdates(prev => ({
          ...prev,
          [updatedStock.name]: true
        }));
        
        setTimeout(() => {
          setRecentUpdates(prev => ({
            ...prev,
            [updatedStock.name]: false
          }));
        }, 3000);
      }
    };
    
    window.addEventListener('stock-price-updated', (e: any) => handleStockUpdate(e.detail));
    
    return () => {
      cleanupRealtimeSubscriptions();
      window.removeEventListener('stock-price-updated', (e: any) => handleStockUpdate(e.detail));
    };
  }, [fetchInitialData, setupRealtimeSubscriptions, cleanupRealtimeSubscriptions]);

  if (shouldShowCompletionScreen) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
        <div className="max-w-4xl w-full bg-gray-800 rounded-lg p-8 shadow-lg">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-green-500 mb-4">Congratulations!</h1>
            <p className="text-2xl">You've completed the trading game!</p>
            <div className="mt-6 flex items-center justify-center gap-2 text-3xl">
              <DollarSign className="text-green-500" size={32} />
              <span className="text-green-500 font-bold">${balance.toFixed(2)}</span>
            </div>
            <p className="text-gray-400 mt-2">Final Balance</p>
          </div>

          {leaderboard && leaderboard.length > 0 && (
            <div className="mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-center">Leaderboard</h2>
              <div className="bg-gray-700 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-600">
                      <th className="py-3 px-4 text-left">Rank</th>
                      <th className="py-3 px-4 text-left">Player</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((player, index) => (
                      <tr 
                        key={index} 
                        className={`border-t border-gray-600 ${
                          player.isCurrentPlayer ? 'bg-green-900 bg-opacity-30' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          {player.rank === 1 ? '🥇' : 
                           player.rank === 2 ? '🥈' : 
                           player.rank === 3 ? '🥉' : 
                           `#${player.rank}`}
                        </td>
                        <td className="py-3 px-4">{player.name} {player.isCurrentPlayer ? '(You)' : ''}</td>
                        <td className="py-3 px-4 text-right">${player.balance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              Return to Dashboard
            </button>
          </div>

          {error === personalityReport && (
            <div className="mt-8 bg-gray-700 p-6 rounded-lg">
              <h3 className="text-xl font-semibold mb-4">Trading Analysis</h3>
              <div className="text-gray-300 whitespace-pre-wrap">
                {personalityReport}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-xl">Loading game...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Level {displayLevel}</h1>
            <div className="flex items-center gap-2 text-xl">
              <DollarSign className="text-green-500" />
              <span className="text-green-500 font-bold">${balance.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-4 min-w-[300px]">
            <div className="bg-gray-800 p-4 rounded-lg">
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingUp className="text-green-500" size={20} />
                Top Gainers
              </h2>
              <div className="space-y-2">
                {stockPerformance
                  .filter(stock => stock.change > 0)
                  .sort((a, b) => b.change - a.change)
                  .map(stock => (
                    <div key={stock.name} className="flex justify-between items-center">
                      <span className="text-white">{stock.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-green-500">+{stock.change}%</span>
                        <span className="text-gray-400">${stock.currentPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg">
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <TrendingDown className="text-red-500" size={20} />
                Top Losers
              </h2>
              <div className="space-y-2">
                {stockPerformance
                  .filter(stock => stock.change < 0)
                  .sort((a, b) => a.change - b.change)
                  .map(stock => (
                    <div key={stock.name} className="flex justify-between items-center">
                      <span className="text-white">{stock.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-red-500">{stock.change}%</span>
                        <span className="text-gray-400">${stock.currentPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-lg">
                <Timer className="text-yellow-500" />
                <span className="text-white font-mono text-xl">{timeLeft}s</span>
              </div>
              <button
                onClick={() => {
                  resetGame();
                  setActionsCount(0);
                }}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-white"
                disabled={gameCompleted}
              >
                <RotateCcw size={20} />
                Restart
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500 text-white p-4 rounded-lg mb-8 flex items-center gap-2">
            <AlertTriangle size={24} />
            <div>
              <p className="font-semibold">{error}</p>
              {savingAttempts > 0 && savingAttempts < 3 && (
                <p className="text-sm mt-1">Attempt {savingAttempts + 1} of 3</p>
              )}
            </div>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Market News</h2>
          <p className="text-gray-300 text-lg">{news[currentLevel]}</p>
          <p className="text-gray-400 mt-2">Actions remaining: {3 - actionsCount}</p>
          {canAdvance && (
            <div className="mt-4 bg-green-700 text-white p-3 rounded-lg">
              <p className="font-semibold">You've completed all actions for this level!</p>
              <p>Click the "Advance to Level {displayLevel + 1}" button below when you're ready to continue.</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {gameStocks.map((stock) => {
            const hasActed = gameActions.some(
              action => action.level === currentLevel && action.stock_name === stock.name
            );
            
            const wasRecentlyUpdated = recentUpdates[stock.name];

            return (
              <div key={stock.name} className={`bg-gray-800 rounded-lg p-6 ${wasRecentlyUpdated ? 'ring-2 ring-blue-500 transition-all duration-500' : ''}`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white">{stock.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-xl font-bold ${
                      wasRecentlyUpdated ? 'text-blue-400' :
                      stock.price > stock.previousPrice
                        ? 'text-green-500'
                        : stock.price < stock.previousPrice
                        ? 'text-red-500'
                        : 'text-white'
                    }`}>
                      ${stock.price.toFixed(2)}
                      {wasRecentlyUpdated && (
                        <span className="ml-2 text-xs text-blue-400 animate-pulse">
                          Updated
                        </span>
                      )}
                    </span>
                    {stock.price > stock.previousPrice ? (
                      <TrendingUp className="text-green-500" size={20} />
                    ) : stock.price < stock.previousPrice ? (
                      <TrendingDown className="text-red-500" size={20} />
                    ) : (
                      <Minus className="text-gray-400" size={20} />
                    )}
                  </div>
                </div>

                <div className="h-[150px] mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stock.history.map((price, index) => ({ 
                      price, 
                      index,
                      level: Math.min(index, currentLevel) + 1
                    }))}>
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke={
                          wasRecentlyUpdated ? '#3B82F6' :
                          stock.price > stock.previousPrice
                            ? '#10B981'
                            : stock.price < stock.previousPrice
                            ? '#EF4444'
                            : '#9CA3AF'
                        }
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#6B7280' }}
                        activeDot={{ r: 6, fill: '#FBBF24' }}
                      />
                      <Tooltip 
                        content={CustomTooltip}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center items-center text-xs text-gray-400 mt-1">
                    <div className="flex flex-wrap justify-center gap-2">
                      <span className="flex items-center">
                        <span className="h-2 w-2 rounded-full bg-gray-500 inline-block mr-1"></span>
                        Price Points
                      </span>
                      <span className="flex items-center">
                        <span className="h-2 w-2 rounded-full bg-yellow-400 inline-block mr-1"></span>
                        Selected Point
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mb-4 px-2 py-1 rounded bg-gray-700 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Holdings:</span>
                    <span className="text-white font-semibold">{getStockQuantity(stock.name)} shares</span>
                  </div>
                  {getStockQuantity(stock.name) > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-300">Avg. Cost:</span>
                      <span className="text-white font-semibold">${getStockAvgPrice(stock.name).toFixed(2)}</span>
                    </div>
                  )}
                  {getStockQuantity(stock.name) > 0 && (
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-300">Gain/Loss:</span>
                      <span className={`font-semibold ${
                        stock.price > getStockAvgPrice(stock.name) ? 'text-green-400' : 
                        stock.price < getStockAvgPrice(stock.name) ? 'text-red-400' : 'text-white'
                      }`}>
                        {((stock.price - getStockAvgPrice(stock.name)) / getStockAvgPrice(stock.name) * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    <label className="text-gray-300 text-sm">Quantity:</label>
                    <input
                      type="number"
                      min="1"
                      value={stockQuantities[stock.name] || 1}
                      onChange={(e) => {
                        const newQuantity = Math.max(1, parseInt(e.target.value) || 1);
                        setStockQuantities(prev => ({
                          ...prev,
                          [stock.name]: newQuantity
                        }));
                      }}
                      className="w-20 px-2 py-1 rounded bg-gray-600 text-white text-sm"
                      disabled={hasActed || actionsCount >= 3 || loading || gameCompleted || isPaused}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAction(stock.name, 'buy', stock.price)}
                    disabled={hasActed || actionsCount >= 3 || loading || gameCompleted || isPaused}
                    className={`py-2 rounded-lg font-medium ${
                      hasActed || actionsCount >= 3 || loading || gameCompleted || isPaused
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => handleAction(stock.name, 'sell', stock.price)}
                    disabled={hasActed || actionsCount >= 3 || loading || gameCompleted || isPaused || getStockQuantity(stock.name) < (stockQuantities[stock.name] || 1)}
                    className={`py-2 rounded-lg font-medium ${
                      hasActed || actionsCount >= 3 || loading || gameCompleted || isPaused || getStockQuantity(stock.name) < (stockQuantities[stock.name] || 1)
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    Sell
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <button
            onClick={currentLevel >= 9 ? handleCompleteGame : handleNextLevel}
            disabled={loading || gameCompleted || levelAdvanceLock || isPaused}
            className={`px-8 py-3 rounded-lg text-lg font-semibold ${
              loading || gameCompleted || levelAdvanceLock || isPaused
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : canAdvance
                  ? 'bg-green-600 hover:bg-green-700 text-white animate-pulse'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {loading ? 'Saving...' : 
             gameCompleted ? 'Finish Game' : 
             currentLevel >= 9 ? 'Complete Game' : 
             canAdvance ? `Advance to Level ${displayLevel + 1}` :
             `Skip to Level ${displayLevel + 1}`}
          </button>
        </div>

        {isPaused && <PauseOverlay />}
      </div>
    </div>
  );
}

export default Game;