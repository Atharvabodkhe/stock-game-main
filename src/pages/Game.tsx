import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/gameStore';
import { generatePersonalityReport } from '../lib/groq';
import { TrendingUp, TrendingDown, Minus, RotateCcw, Timer, DollarSign, AlertTriangle, LogOut } from 'lucide-react';
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
  const [insufficientFunds, setInsufficientFunds] = useState<{[key: string]: boolean}>({});

  const [activeGameSession, setActiveGameSession] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

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

  const validateStockQuantity = (stockName: string, quantity: number) => {
    const stock = gameStocks.find(s => s.name === stockName);
    if (!stock) return;
    
    const totalCost = stock.price * quantity;
    const isInsufficient = totalCost > balance;
    
    setInsufficientFunds(prev => ({
      ...prev,
      [stockName]: isInsufficient
    }));
  };

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

    // Store the final balance before completing the game
    const finalBalance = balance;
    localStorage.setItem('final_game_balance', finalBalance.toString());

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
        balance: finalBalance,
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
              final_balance: finalBalance,
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
            console.log(`Marking player ${roomPlayerId} as completed - GAME COMPLETION FLOW`);
            
            // CRITICAL: First update player status directly in the database
            const { error: directUpdateError } = await supabase
              .from('room_players')
              .update({ 
                status: 'completed',
                completed_at: new Date().toISOString(),
                completion_status: 'completed'
              })
              .eq('id', roomPlayerId);
              
            if (directUpdateError) {
              console.error('Error directly updating player status:', directUpdateError);
            } else {
              console.log('Player directly marked as completed in database');
            }
            
            // Then also call the function as a backup
            const { error: playerError } = await supabase
              .rpc('mark_player_completed', { player_id: roomPlayerId });
              
            if (playerError) {
              console.error('Error marking player as completed:', playerError);
              throw playerError;
            }
            console.log('Player marked as completed via RPC function');

            // CRITICAL NEW STEP: Wait longer to ensure database consistency
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // ADDITIONAL VERIFICATION: Double-check the player's status to make sure it was updated
            try {
              // Check if our player status was really updated
              const { data: playerStatus } = await supabase
                .from('room_players')
                .select('status, completed_at')
                .eq('id', roomPlayerId)
                .single();
                
              if (playerStatus && playerStatus.status !== 'completed') {
                console.log('CRITICAL: Player status still not marked as completed after update. Forcing another update.');
                await supabase
                  .from('room_players')
                  .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    completion_status: 'completed'
                  })
                  .eq('id', roomPlayerId);
              } else {
                console.log('Verified player status is properly set to completed:', playerStatus);
              }
              
              // Always update the game_sessions to make sure it's marked as completed
              if (sessionId) {
                await supabase
                  .from('game_sessions')
                  .update({
                    completed_at: new Date().toISOString()
                  })
                  .eq('id', sessionId);
                console.log('Ensured game session is marked as completed');
              }
            } catch (verifyError) {
              console.error('Error verifying player status:', verifyError);
            }
            
            // Check room completion status and force update if needed
        if (roomId) {
              console.log(`Force checking room ${roomId} completion status - GAME COMPLETION FLOW`);
              
              // First check if this is the last player to complete
          try {
                const { data: playerCounts, error: countsError } = await supabase
              .from('room_players')
                  .select('id, status, completion_status, completed_at')
              .eq('room_id', roomId)
                  .neq('status', 'left');
                  
                if (countsError) {
                  console.error('Error getting player counts:', countsError);
                } else if (playerCounts) {
                  const totalPlayers = playerCounts.length;
                  const completedPlayers = playerCounts.filter(p => p.status === 'completed').length;
                  
                  console.log(`GAME COMPLETION: ${completedPlayers} out of ${totalPlayers} players completed`);
                  console.log('Player details:', JSON.stringify(playerCounts));
                  
                  // If all players are now completed, we're the last one and should force the update
                  if (totalPlayers > 0 && completedPlayers === totalPlayers) {
                    console.log('We appear to be the last player! Using multiple strategies to ensure room completion.');
                    
                    // Try multiple approaches to ensure the room gets marked as completed
                    
                    // 1. Try using the force_check_room_completion function
                    try {
                      console.log('Strategy 1: Using force_check_room_completion function');
                      const { data: forceCheckResult, error: forceCheckError } = await supabase
                        .rpc('force_check_room_completion', { room_id_param: roomId });
                        
                      if (forceCheckError) {
                        console.error('Error force checking room completion:', forceCheckError);
                      } else {
                        console.log(`Force check result: ${forceCheckResult ? 'Room updated' : 'No update needed'}`);
                      }
                    } catch (forceError) {
                      console.error('Exception in force check:', forceError);
                    }
                    
                    // Wait briefly before second attempt
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // 2. Directly update the room as a failsafe
                    try {
                      console.log('Strategy 2: Direct database update of room status');
                      const { error: roomUpdateError } = await supabase
                .from('game_rooms')
                .update({ 
                  status: 'completed',
                          all_players_completed: true,
                          completion_time: new Date().toISOString(),
                  ended_at: new Date().toISOString()
                })
                .eq('id', roomId);
                
                      if (roomUpdateError) {
                        console.error('Error updating room status:', roomUpdateError);
                      } else {
                        console.log('SUCCESS: Room directly marked as completed');
                      }
                    } catch (directUpdateError) {
                      console.error('Exception in direct room update:', directUpdateError);
                    }
                    
                    // 3. Verify the room status after our updates
                    try {
                      await new Promise(resolve => setTimeout(resolve, 500));
                      console.log('Verifying room status after updates...');
                      const { data: roomData } = await supabase
                        .from('game_rooms')
                        .select('status, all_players_completed')
                        .eq('id', roomId)
                        .single();
                        
                      console.log('Final room status:', roomData);
                      
                      // If room is still not completed, try one last desperate update
                      if (roomData && roomData.status !== 'completed') {
                        console.log('CRITICAL: Room still not marked as completed, trying one final update');
                        await supabase
                          .from('game_rooms')
                          .update({
                            status: 'completed',
                            all_players_completed: true,
                            completion_time: new Date().toISOString(),
                            ended_at: new Date().toISOString()
                          })
                          .eq('id', roomId);
                      }
                      
                      // Also double-check our own player status to make sure it's properly saved
                      const { data: playerStatus } = await supabase
                        .from('room_players')
                        .select('status, completed_at')
                        .eq('id', roomPlayerId)
                        .single();
                        
                      if (playerStatus && playerStatus.status !== 'completed') {
                        console.log('CRITICAL: Our player status is still not completed, forcing update');
                        await supabase
                          .from('room_players')
                          .update({
                            status: 'completed',
                            completed_at: new Date().toISOString(),
                            completion_status: 'completed'
                          })
                          .eq('id', roomPlayerId);
                          
                        await supabase.rpc('mark_player_completed', { player_id: roomPlayerId });
                      }
                      
                      // Also ensure our session is properly marked as completed
                      await supabase
                        .from('game_sessions')
                        .update({
                          completed_at: new Date().toISOString()
                        })
                        .eq('id', sessionId);
                        
                    } catch (verifyError) {
                      console.error('Error verifying room status:', verifyError);
                    }
                  } else {
                    console.log('Not all players have completed yet, will let other players trigger room completion');
                  }
                }
              } catch (forceError) {
                console.error('Exception in completion check flow:', forceError);
              }
            }
            
            // FINAL SAFETY CHECK: If we're the last player, make sure all other players are properly marked
            try {
              // Get total count of players
              const { data: playerCount, error: countError } = await supabase
                .from('room_players')
                .select('id, status')
                  .eq('room_id', roomId)
                .neq('status', 'left');
                
              if (!countError && playerCount) {
                const totalPlayers = playerCount.length;
                const inGamePlayers = playerCount.filter(p => p.status === 'in_game').length;
                const completedPlayers = playerCount.filter(p => p.status === 'completed').length;
                
                // If all players except possibly 1 are completed, and we have more than 1 player total
                if (totalPlayers > 1 && completedPlayers >= totalPlayers - 1) {
                  console.log('FINAL CHECK: Almost all players completed, ensuring room and all players are marked properly');
                  
                  // Force mark any stragglers as completed
                  if (inGamePlayers > 0) {
                    await supabase
                      .from('room_players')
                      .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        completion_status: 'completed'
                      })
                      .eq('room_id', roomId)
                      .eq('status', 'in_game');
                      
                    console.log('Marked all remaining in_game players as completed');
                  }
                  
                  // Force the room to be completed
                  await supabase
                    .from('game_rooms')
                      .update({ 
                      status: 'completed',
                      all_players_completed: true,
                      completion_time: new Date().toISOString(),
                      ended_at: new Date().toISOString()
                    })
                    .eq('id', roomId);
                    
                  console.log('Ensured room is marked as completed');
                  
                  // Update all associated game sessions
                  await supabase
                    .from('game_sessions')
                    .update({
                      completed_at: new Date().toISOString()
                    })
                    .eq('room_id', roomId);
                    
                  console.log('Ensured all game sessions for this room are marked as completed');
                }
              }
            } catch (finalCheckError) {
              console.error('Error in final safety check:', finalCheckError);
            }
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
                final_balance: finalBalance,
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
                final_balance: finalBalance,
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
    
    // Store the final balance before completing the game
    const finalBalance = balance;
    localStorage.setItem('final_game_balance', finalBalance.toString());
    
    setGameCompleted(true);
    setShowCompletionScreen(true);
    
    if (sessionId) {
      localStorage.setItem(`game_completed_${sessionId}`, 'true');
    }
    
    if (roomId) {
      const updateRoomStatus = async (attempt = 1) => {
        try {
          // First, update player status to completed
          if (roomPlayerId) {
            console.log(`Marking player ${roomPlayerId} as completed (attempt ${attempt})`);
            // First direct update
            const { error: playerUpdateError } = await supabase
              .from('room_players')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                completion_status: 'completed'
              })
              .eq('id', roomPlayerId);
              
            if (playerUpdateError) {
              console.error('Error updating player status:', playerUpdateError);
            } else {
              console.log('Player status directly updated to completed');
            }
            
            // Then call the RPC function for additional processing
            const { error: playerError } = await supabase
              .rpc('mark_player_completed', { player_id: roomPlayerId });
              
            if (playerError) {
              console.error('Error updating player status via RPC:', playerError);
            } else {
              console.log('Player status successfully updated to completed via RPC');
            }

            // Add a delay to ensure database consistency before checking player counts
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // Check if all players are completed
          const { data: playerCounts, error: countsError } = await supabase
            .from('room_players')
            .select('id, status')
            .eq('room_id', roomId)
            .neq('status', 'left');
            
          if (countsError) {
            console.error('Error checking player counts:', countsError);
          } else if (playerCounts) {
            const totalPlayers = playerCounts.length;
            const completedPlayers = playerCounts.filter(p => p.status === 'completed').length;
            const inGamePlayers = playerCounts.filter(p => p.status === 'in_game').length;
            
            console.log(`Room status check: ${completedPlayers}/${totalPlayers} completed, ${inGamePlayers} still in game`);
            
            // Check room status directly
            const { data: roomData, error: roomCheckError } = await supabase
              .from('game_rooms')
              .select('status, all_players_completed')
              .eq('id', roomId)
              .single();
              
            const roomAlreadyCompleted = roomData?.status === 'completed';
            console.log('Current room status:', roomData?.status, 'All players completed flag:', roomData?.all_players_completed);
            
            // Force room completion if all players except at most 1 are completed OR if this is the last player
            if ((totalPlayers > 0 && completedPlayers >= totalPlayers - 1) || 
                (totalPlayers > 0 && inGamePlayers === 0 && !roomAlreadyCompleted)) {
              console.log('All or almost all players completed, updating room status');
              
              // Update any remaining in-game players to completed
              if (inGamePlayers > 0) {
                const inGamePlayerIds = playerCounts
                  .filter(p => p.status === 'in_game')
                  .map(p => p.id);
                  
                console.log(`Marking remaining players as completed: ${inGamePlayerIds.join(', ')}`);
                
                for (const playerId of inGamePlayerIds) {
                  await supabase
                    .from('room_players')
                    .update({
                      status: 'completed',
                      completed_at: new Date().toISOString(),
                      completion_status: 'completed'
                    })
                    .eq('id', playerId);
                    
                  await supabase.rpc('mark_player_completed', { player_id: playerId });
                }
              }
              
              // Try force_check_room_completion function first
              console.log('Calling force_check_room_completion RPC function');
              const { data: forceCheckResult, error: forceCheckError } = await supabase
                .rpc('force_check_room_completion', { room_id_param: roomId });
                
              if (forceCheckError) {
                console.error('Error in force_check_room_completion:', forceCheckError);
              } else {
                console.log('force_check_room_completion result:', forceCheckResult);
              }
              
              // Mark the room as completed directly as well
              console.log('Directly updating room status to completed');
          const { error: roomError } = await supabase
            .from('game_rooms')
            .update({ 
              status: 'completed',
                  all_players_completed: true,
                  completion_time: new Date().toISOString(),
              ended_at: new Date().toISOString()
            })
            .eq('id', roomId);
            
          if (roomError) {
                console.error('Error updating room status:', roomError);
                if (attempt < 5) { // Increase max attempts to 5
              const delay = Math.pow(2, attempt) * 1000;
                  console.log(`Will retry updating room status in ${delay}ms (attempt ${attempt + 1}/5)`);
              setTimeout(() => updateRoomStatus(attempt + 1), delay);
            }
          } else {
            console.log('Room status successfully updated to completed');
          }
          
              // Verify the room status was updated
              const { data: verifyRoom } = await supabase
                .from('game_rooms')
                .select('status, all_players_completed')
                .eq('id', roomId)
                .single();
                
              if (verifyRoom?.status !== 'completed') {
                console.error('VERIFICATION FAILED: Room status still not completed after update, will retry');
                if (attempt < 5) {
                  const delay = 2000;
                  console.log(`Immediate retry attempt ${attempt + 1}/5`);
                  setTimeout(() => updateRoomStatus(attempt + 1), delay);
                }
              } else {
                console.log('VERIFICATION SUCCESS: Room status correctly set to completed');
              }
              
              // Update all game sessions for this room
              await supabase
                .from('game_sessions')
              .update({ 
                completed_at: new Date().toISOString()
              })
                .eq('room_id', roomId)
                .is('completed_at', null);
            }
          }
          
          // Add game result record
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
                    final_balance: finalBalance,
                    created_at: new Date().toISOString()
                  }
                ]);
              console.log('Game result record added');
            }
          } catch (resultError) {
            console.error('Error adding game result:', resultError);
          }
        } catch (error) {
          console.error('Error in room update process:', error);
          // Retry on error
          if (attempt < 5) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`Error occurred, retrying room status update in ${delay}ms (attempt ${attempt + 1}/5)`);
            setTimeout(() => updateRoomStatus(attempt + 1), delay);
          }
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

  // Add effect to restore final balance when showing completion screen
  useEffect(() => {
    if (shouldShowCompletionScreen) {
      const storedBalance = localStorage.getItem('final_game_balance');
      if (storedBalance) {
        const finalBalance = parseFloat(storedBalance);
        if (!isNaN(finalBalance)) {
          updateBalance(finalBalance - balance);
        }
      }
    }
  }, [shouldShowCompletionScreen, balance, updateBalance]);

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const handleReturnToDashboard = useCallback(async () => {
    if (!supabase || !roomPlayerId) return;

    try {
      console.log('Updating player status to completed...');
      
      // First, directly update the player status
      const { error: updateError } = await supabase
        .from('room_players')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completion_status: 'completed'
        })
        .eq('id', roomPlayerId);
      
      if (updateError) {
        console.error('Error updating player status:', updateError);
      } else {
        console.log('Successfully updated player status to completed');
      }
      
      // Second, call the mark_player_completed RPC function for redundancy
      try {
        console.log('Calling mark_player_completed RPC function...');
        const { data: rpcData, error: rpcError } = await supabase
          .rpc('mark_player_completed', {
            player_id: roomPlayerId
          });
          
        if (rpcError) {
          console.error('Error calling mark_player_completed:', rpcError);
        } else {
          console.log('Successfully called mark_player_completed RPC function:', rpcData);
        }
      } catch (e) {
        console.error('Exception in mark_player_completed call:', e);
      }
      
      // Check if we're the last player to complete
      const { data: roomPlayers, error: playersError } = await supabase
        .from('room_players')
        .select('status')
        .eq('room_id', roomId)
        .neq('status', 'left');
      
      if (!playersError && roomPlayers) {
        const totalPlayers = roomPlayers.length;
        const completedPlayers = roomPlayers.filter(p => p.status === 'completed').length;
        
        console.log(`Room completion check: ${completedPlayers}/${totalPlayers} players completed`);
        
        if (totalPlayers > 0 && completedPlayers === totalPlayers) {
          console.log('All players have completed, ensuring room is marked as completed');
          
          // Force update room status directly as final fallback
          const { error: roomUpdateError } = await supabase
            .from('game_rooms')
            .update({
              status: 'completed',
              all_players_completed: true,
              completion_time: new Date().toISOString(),
              ended_at: new Date().toISOString()
            })
            .eq('id', roomId);
          
          if (roomUpdateError) {
            console.error('Error updating room status:', roomUpdateError);
          } else {
            console.log('Successfully updated room status to completed');
          }
        }
      }

      // Add a final verification check to ensure all updates are properly propagated:

      // Add a final verification check to ensure all player statuses are properly updated
      console.log('Performing final status verification check...');
      
      try {
        // Get all players in the room
        const { data: allRoomPlayers } = await supabase
          .from('room_players')
          .select('id, status')
          .eq('room_id', roomId)
          .neq('status', 'left');
        
        if (allRoomPlayers && allRoomPlayers.length > 0) {
          const inGameCount = allRoomPlayers.filter(p => p.status === 'in_game').length;
          const completedCount = allRoomPlayers.filter(p => p.status === 'completed').length;
          const totalActive = allRoomPlayers.length;
          
          console.log(`Final status check: ${completedCount}/${totalActive} completed, ${inGameCount} still in game`);
          
          // If almost all players are completed (all except possibly 1), force update everything
          if (completedCount >= totalActive - 1 && inGameCount <= 1) {
            console.log('Almost all players completed. Performing final cleanup...');
            
            // Force update room to completed state
            await supabase
              .from('game_rooms')
              .update({
                status: 'completed',
                all_players_completed: true,
                completion_time: new Date().toISOString(),
                ended_at: new Date().toISOString()
              })
              .eq('id', roomId);
            
            // Force update any remaining in_game players to completed
            const inGamePlayers = allRoomPlayers.filter(p => p.status === 'in_game');
            for (const player of inGamePlayers) {
              console.log(`Forcing completion status for player ${player.id}`);
              
              // Direct update
              await supabase
                .from('room_players')
                .update({
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  completion_status: 'completed'
                })
                .eq('id', player.id);
              
              // RPC call for good measure
              await supabase.rpc('mark_player_completed', { player_id: player.id });
            }
            
            // Force update all related game sessions
            await supabase
              .from('game_sessions')
              .update({
                completed_at: new Date().toISOString()
              })
              .eq('room_id', roomId)
              .is('completed_at', null);
              
            console.log('Finished final cleanup of room and player statuses');
          }
        }
      } catch (verifyError) {
        console.error('Error in final verification:', verifyError);
      }
      
      // Wait a bit longer to ensure all database operations complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      navigate('/dashboard');
    } catch (error) {
      console.error('Error in handleReturnToDashboard:', error);
      navigate('/dashboard');
    }
  }, [roomPlayerId, roomId, sessionId, navigate, supabase]);

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
              onClick={handleReturnToDashboard}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors"
            >
              Return to Dashboard
            </button>
          </div>

          <div className="mt-8 text-center text-gray-400">
            <p>Your trading analysis report will be available to game administrators.</p>
            <p className="text-sm mt-2">This helps maintain fair competition and prevents gaming of the system.</p>
              </div>
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
          <div className="flex items-center gap-4">
            <TrendingUp className="text-green-500" size={32} />
            <h1 className="text-3xl font-bold text-white">Trading History</h1>
          </div>

          <div className="flex flex-col gap-4 min-w-[300px]">
            {isAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Admin Dashboard
              </button>
            )}
            <button
              onClick={() => navigate('/game')}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              New Game
            </button>
            {activeGameSession && (
              <button
                onClick={() => navigate('/game', { state: { sessionId: activeGameSession } })}
                className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Resume Active Game
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              <LogOut size={20} />
              Logout
            </button>
          </div>
        </div>

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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {gameStocks.map((stock) => {
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
                        validateStockQuantity(stock.name, newQuantity);
                      }}
                      className="w-20 px-2 py-1 rounded bg-gray-600 text-white text-sm"
                      disabled={loading || gameCompleted || isPaused}
                    />
                  </div>
                </div>

                {insufficientFunds[stock.name] && (
                  <div className="text-red-500 text-sm mt-1">
                    Insufficient funds for {stockQuantities[stock.name] || 1} shares
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAction(stock.name, 'buy', stock.price)}
                    disabled={loading || gameCompleted || isPaused || insufficientFunds[stock.name]}
                    className={`py-2 rounded-lg font-medium ${
                      loading || gameCompleted || isPaused || insufficientFunds[stock.name]
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => handleAction(stock.name, 'sell', stock.price)}
                    disabled={loading || gameCompleted || isPaused || getStockQuantity(stock.name) < (stockQuantities[stock.name] || 1)}
                    className={`py-2 rounded-lg font-medium ${
                      loading || gameCompleted || isPaused || getStockQuantity(stock.name) < (stockQuantities[stock.name] || 1)
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
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {loading ? 'Saving...' : 
             gameCompleted ? 'Finish Game' : 
             currentLevel >= 9 ? 'Complete Game' : 
             `Skip to Level ${displayLevel + 1}`}
          </button>
        </div>

        {isPaused && <PauseOverlay />}
      </div>
    </div>
  );
}

export default Game;