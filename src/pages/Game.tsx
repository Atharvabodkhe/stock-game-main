import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../store/gameStore';
import { generatePersonalityReport } from '../lib/groq';
import { TrendingUp, TrendingDown, Minus, RotateCcw, Timer, DollarSign, AlertTriangle } from 'lucide-react';

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
  // Add a level lock to prevent rapid level advances
  const [levelAdvanceLock, setLevelAdvanceLock] = useState(false);
  // Track currently displayed level for UI consistency
  const [displayLevel, setDisplayLevel] = useState(1);
  // Track if we're showing the completion screen
  const [showCompletionScreen, setShowCompletionScreen] = useState(false);
  // Track leaderboard data
  const [leaderboard, setLeaderboard] = useState<Array<{id: string, name: string, balance: number, rank: number, isCurrentPlayer: boolean}>>([]);
  // Track personality report
  const [personalityReport, setPersonalityReport] = useState<string | null>(null);
  
  // Keep track of the last level advancement time
  const lastLevelAdvanceTime = useRef(Date.now());
  // Track if initialization is complete to prevent loading flicker
  const initComplete = useRef(false);
  // Track loading state changes to prevent rapid toggling
  const loadingTimeout = useRef<NodeJS.Timeout | null>(null);
  // Add a flag to track if completion process has started
  const [completionProcessStarted, setCompletionProcessStarted] = useState(false);

  // Safe loading state setter with debounce
  const setLoadingWithDebounce = useCallback((isLoading: boolean) => {
    // Clear any existing timeout
    if (loadingTimeout.current) {
      clearTimeout(loadingTimeout.current);
      loadingTimeout.current = null;
    }
    
    if (!isLoading) {
      // When turning loading off, add a small delay to prevent flickering
      loadingTimeout.current = setTimeout(() => {
        setLoading(false);
        initComplete.current = true;
      }, 300);
    } else if (!initComplete.current || !loading) {
      // Only set loading to true if initialization is not complete or loading is currently false
      setLoading(true);
    }
  }, [loading]);

  const {
    currentLevel,
    balance,
    stocks,
    stockPerformance,
    news,
    gameActions,
    gameCompleted,
    autoUpdateEnabled,
    updateStocks,
    addAction,
    updateBalance,
    nextLevel,
    resetGame,
    setGameCompleted,
  } = useGameStore();

  // Ensure display level is updated whenever currentLevel changes
  useEffect(() => {
    setDisplayLevel(currentLevel + 1);
  }, [currentLevel]);

  const handleNextLevel = useCallback(() => {
    // Don't advance if the level lock is active
    if (levelAdvanceLock) {
      console.log('Level advance locked, ignoring advancement request');
      return;
    }
    
    // Don't advance if it's been less than 500ms since the last advancement
    const now = Date.now();
    if (now - lastLevelAdvanceTime.current < 500) {
      console.log('Advancing too quickly, ignoring request');
      return;
    }
    
    // Log the current level for debugging
    console.log(`Current level before progression: ${currentLevel} (displayed as Level ${currentLevel + 1})`);
    
    // Check if we're at the last level (level 9, displayed as Level 10)
    // or if the Complete Game button was clicked (currentLevel >= 9)
    if (currentLevel >= 9) {
      console.log('Reached final level or Complete Game button clicked, completing game');
      setGameCompleted(true);
      return;
    }
    
    // Set lock to prevent multiple rapid advancements
    setLevelAdvanceLock(true);
    lastLevelAdvanceTime.current = now;
    
    // Reset actions count and timer for the new level
    setActionsCount(0);
    setTimeLeft(60);
    
    // Advance the level
    console.log(`Advancing to next level: ${currentLevel + 1} (will display as Level ${currentLevel + 2})`);
    nextLevel();
    
    // Release lock after a delay
    setTimeout(() => {
      setLevelAdvanceLock(false);
    }, 1000);
  }, [currentLevel, nextLevel, setGameCompleted, levelAdvanceLock]);

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

      // Get session ID either from URL state or localStorage backup
      const sessionIdFromState = location.state?.sessionId;
      let finalSessionId = sessionIdFromState;
      
      console.log('Session ID from navigation state:', sessionIdFromState);
      
      // If we don't have a session ID from state, try to find an active game session
      if (!sessionIdFromState) {
        console.log('No session ID in state, checking for active sessions');
        
        // Check if the user has any active game sessions
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
      
      // If we have a session ID (from either source), validate and use it
      if (finalSessionId) {
        console.log('Using game session ID:', finalSessionId);
        setSessionId(finalSessionId);
        
        // Validate the session belongs to this user and is active
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
          
          // Reset the game state to ensure we start fresh
          console.log('Resetting game state to initial values');
          resetGame();
        } else {
          console.log('Session ID exists but is not valid for this user or game is not active');
          
          // Check if the session exists but player status is wrong
          const { data: anyPlayerData } = await supabase
            .from('room_players')
            .select('id, status')
            .eq('user_id', session.user.id)
            .eq('session_id', finalSessionId)
            .maybeSingle();
            
          if (anyPlayerData) {
            console.log('Player found but status is not in_game:', anyPlayerData.status);
            
            // If player exists but status is wrong, try to fix it
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
                
                // Retry loading room info
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
        
        // Instead of showing an error and redirecting, create a new game session
        try {
          console.log('Creating new game session for solo play');
          const { data: newSession, error: newSessionError } = await supabase
            .from('game_sessions')
            .insert([
              {
                user_id: session.user.id,
                final_balance: 10000, // Starting balance
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
            
            // Reset the game state to ensure we start fresh
            console.log('Resetting game state for new solo session');
            resetGame();
            
            setLoadingWithDebounce(false);
            return;
          }
        } catch (newSessionError) {
          console.error('Error creating new session:', newSessionError);
          setError('Failed to create a new game session. Please try again.');
          // Wait a moment before redirecting to let the user see the error
          setTimeout(() => navigate('/dashboard'), 3000);
          return;
        }
        
        // If we get here, something went wrong with creating a new session
        setError('No active game session found. Please return to the dashboard.');
        // Wait a moment before redirecting to let the user see the error
        setTimeout(() => navigate('/dashboard'), 3000);
        return;
      }

      setLoadingWithDebounce(false);
    } catch (error) {
      console.error('Error in checkAuth:', error);
      setError('An unexpected error occurred. Please try again.');
      setLoadingWithDebounce(false);
      // Wait a moment before redirecting to let the user see the error
      setTimeout(() => navigate('/'), 3000);
    }
  }, [navigate, location.state, setLoadingWithDebounce]);

  useEffect(() => {
    checkAuth();
    
    // Safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      if (loading && !initComplete.current) {
        console.log('Safety timeout triggered to prevent infinite loading');
        setLoadingWithDebounce(false);
        setError('Game took too long to load. Please try refreshing the page.');
      }
    }, 15000); // 15 seconds timeout
    
    // Cleanup function to clear any pending timeouts when component unmounts
    return () => {
      clearTimeout(safetyTimeout);
      if (loadingTimeout.current) {
        clearTimeout(loadingTimeout.current);
      }
    };
  }, [checkAuth, loading, setLoadingWithDebounce]);

  // Explicitly ensure game is not marked as completed when component mounts
  useEffect(() => {
    console.log('Game component mounted, ensuring game is not marked as completed');
    // Only reset game completion state if we're not already showing the completion screen
    if (!showCompletionScreen) {
      setGameCompleted(false);
    }
  }, [setGameCompleted, showCompletionScreen]);

  useEffect(() => {
    if (gameCompleted) {
      try {
        // Only proceed with game completion if actions have been taken
        // OR if we're at the final level and the Complete Game button was clicked
        if (gameActions.length === 0 && currentLevel < 9) {
          console.log('Game marked as completed but no actions taken, resetting game state');
          setGameCompleted(false);
          return;
        }
        
        // Set showCompletionScreen to true immediately to prevent flickering
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

  // Ensure we show the completion screen when the game is completed
  useEffect(() => {
    if (gameCompleted && !showCompletionScreen && !loading) {
      console.log('Game completed but completion screen not shown, showing it now');
      // Use a small timeout to ensure we don't get into a loading state loop
      setTimeout(() => {
        setShowCompletionScreen(true);
        // Also save to localStorage as a backup
        if (sessionId) {
          localStorage.setItem(`game_completed_${sessionId}`, 'true');
        }
      }, 100);
    }
  }, [gameCompleted, showCompletionScreen, loading, sessionId]);

  // Ensure completion screen stays visible once shown
  useEffect(() => {
    if (showCompletionScreen) {
      console.log('Completion screen is now visible, ensuring it stays visible');
      // Set gameCompleted to true to ensure consistency
      setGameCompleted(true);
      // Prevent any loading state changes from hiding the completion screen
      setLoadingWithDebounce(false);
    }
  }, [showCompletionScreen, setGameCompleted, setLoadingWithDebounce]);

  // Add a safety timeout to force show completion screen if game is completed but stuck in loading
  useEffect(() => {
    let safetyTimeout: NodeJS.Timeout | null = null;
    
    if (gameCompleted && loading) {
      console.log('Game completed but still loading, setting safety timeout');
      
      // Ensure we have a personality report
      if (!personalityReport) {
        setPersonalityReport("Your trading analysis is being generated. Your final balance shows your trading performance.");
      }
      
      safetyTimeout = setTimeout(() => {
        console.log('Safety timeout triggered for game completion');
        setLoadingWithDebounce(false);
        setShowCompletionScreen(true);
      }, 5000); // 5 seconds timeout
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
            // Only advance if not locked and not at max level
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

  // Replace the automatic level advancement with a notification
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
    if (gameCompleted || levelAdvanceLock) return;

    try {
      setError(null);
      const amount = action === 'buy' ? -price : action === 'sell' ? price : 0;
      updateBalance(amount);
      
      const actionData = {
        level: currentLevel,
        stock_name: stockName,
        action,
        price,
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

      // Only increment actions count if we haven't reached 3 yet
      setActionsCount(prev => Math.min(prev + 1, 3));
      
    } catch (error) {
      console.error('Error handling action:', error);
      setError('Error processing action. Please try again.');
    }
  };

  const handleGameCompletion = async () => {
    // Prevent multiple executions of the completion process
    if (completionProcessStarted) {
      console.log('Game completion process already started, skipping duplicate execution');
      return;
    }
    
    // Mark completion process as started
    setCompletionProcessStarted(true);
    
    // Prevent completion if no actions have been taken (game just started)
    // BUT allow completion if we're at the final level and the Complete Game button was clicked
    if (gameActions.length === 0 && currentLevel < 9) {
      console.log('Game completion triggered but no actions taken yet, resetting game state');
      setGameCompleted(false);
      setLoadingWithDebounce(false);
      setCompletionProcessStarted(false); // Reset flag
      return;
    }
    
    if (savingAttempts >= 3) {
      console.error(`Maximum save attempts (${savingAttempts}) reached, stopping retries`);
      setError('Failed to save game results after multiple attempts. Your final score is saved locally.');
      
      // Show completion screen even if we failed to save to the database
      setLoadingWithDebounce(false);
      setShowCompletionScreen(true);
      return;
    }

    // Force completion screen after 2 seconds regardless of loading state
    const forceCompletionTimeout = setTimeout(() => {
      console.log('Force completion screen after delay');
      setLoadingWithDebounce(false);
      setShowCompletionScreen(true);
    }, 2000);

    try {
      setLoadingWithDebounce(true);
      setError(null);
      console.log('Starting game completion process...');
      
      // Add a safety timeout to prevent getting stuck in loading state
      const completionTimeout = setTimeout(() => {
        console.log('Completion safety timeout triggered');
        setLoadingWithDebounce(false);
        setShowCompletionScreen(true);
      }, 10000); // 10 seconds timeout
      
      // Get current user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error during game completion:', sessionError);
        throw new Error('Authentication error. Please sign in again.');
      }

      if (!session) {
        console.error('No authenticated session found during game completion');
        throw new Error('No authenticated session found');
      }

      // Generate personality report with better error handling
      let report = null;
      try {
        console.log(`Generating personality report based on ${gameActions.length} game actions...`);
        
        if (gameActions.length === 0) {
          console.warn('No game actions found, generating default report');
          report = "Not enough trading activity to generate a detailed analysis.";
        } else {
          try {
            // Make a defensive copy of the game actions to prevent reference issues
            const actionsCopy = JSON.parse(JSON.stringify(gameActions));
            report = await generatePersonalityReport(actionsCopy);
            
            // Ensure we have a valid report
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

      // Save the personality report to state
      setPersonalityReport(report);

      // Log current game state for debugging
      console.log('Game completion state:', {
        currentLevel,
        balance,
        sessionId,
        roomId,
        roomPlayerId,
        actionsCount: gameActions.length,
        reportLength: report ? report.length : 0
      });

      // Break the save process into discrete steps with individual error handling
      if (sessionId) {
        console.log(`Updating existing game session (${sessionId}) with final results`);
        
        // Step 1: Update the session with final balance and personality report
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
        
        // Step 2: Update player status if in a room
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
            // Continue with the process even if player status update fails
          }
        }
        
        // Step 3: Add game results entry
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
        
        // Step 4: Update room status if all players completed
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
            
            // Update room status to completed if this is the last player
            // or force update if we're at the final level and clicked Complete Game
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

              // Update rankings for all players
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
                        // Add a timestamp to ensure the dashboard can detect the update
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
                // Continue even if ranking update fails
              }
            }
          } catch (roomUpdateError) {
            console.error('Error updating room status:', roomUpdateError);
            // Continue even if room status update fails
          }
        }
        
        // Fetch leaderboard data if in a room
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
                  
                  // Check if this is the current player
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
              
              // Sort by balance (profit) in descending order
              formattedLeaderboard.sort((a, b) => b.balance - a.balance);
              
              setLeaderboard(formattedLeaderboard);
              
              // Notify the room that the leaderboard is updated
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
        // Handle solo game (not in a room)
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
              // Continue even if action save fails
            }
          }
        } catch (error) {
          console.error('Error handling solo game completion:', error);
          throw new Error(`Failed to save solo game: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      console.log('Game completion process successful');
      // Clear the safety timeout since we completed successfully
      clearTimeout(completionTimeout);
      // Clear the force completion timeout
      clearTimeout(forceCompletionTimeout);
      setLoadingWithDebounce(false);
      // Show the completion screen instead of redirecting
      setShowCompletionScreen(true);
    } catch (error) {
      console.error('Error saving game data:', error);
      
      // Clear the force completion timeout
      clearTimeout(forceCompletionTimeout);
      
      // Increment attempt counter and show error
      const newAttemptCount = savingAttempts + 1;
      setSavingAttempts(newAttemptCount);
      
      // More descriptive error message
      setError(`Error saving game results. Retrying... (Attempt ${newAttemptCount}/3)`);
      setLoadingWithDebounce(false);
      
      // Use exponential backoff for retries (1s, 2s, 4s)
      const retryDelay = Math.min(1000 * Math.pow(2, savingAttempts), 4000);
      console.log(`Will retry in ${retryDelay}ms (attempt ${newAttemptCount})`);
      
      // If this is the last retry attempt, show the completion screen anyway
      if (newAttemptCount >= 3) {
        console.log('Final retry attempt failed, showing completion screen anyway');
        // Set a default personality report if we don't have one
        if (!personalityReport) {
          setPersonalityReport("Unable to generate trading analysis due to connection issues. Your final balance reflects your trading performance.");
        }
        setShowCompletionScreen(true);
        setCompletionProcessStarted(false); // Reset flag to allow retry
        return;
      }
      
      setTimeout(() => {
        setCompletionProcessStarted(false); // Reset flag to allow retry
        handleGameCompletion();
      }, retryDelay);
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
          <p className="text-green-500 font-semibold">${payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };

  const handleCompleteGame = useCallback(() => {
    console.log('Complete Game button clicked, completing game');
    
    // First, force set UI states to show completion screen
    setGameCompleted(true);
    setShowCompletionScreen(true);
    
    // Persist completion state in localStorage to prevent it from disappearing
    if (sessionId) {
      localStorage.setItem(`game_completed_${sessionId}`, 'true');
    }
    
    // Directly update room status to completed if we're in a room
    if (roomId) {
      // Function to update room status
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
            // Retry up to 3 times with exponential backoff
            if (attempt < 3) {
              const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
              console.log(`Will retry updating room status in ${delay}ms`);
              setTimeout(() => updateRoomStatus(attempt + 1), delay);
            }
          } else {
            console.log('Room status successfully updated to completed');
          }
          
          // Also update player status if we have roomPlayerId
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
          
          // Add game results entry 
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
      
      // Start the update process
      updateRoomStatus();
    }
    
    // Force the completion screen to show after a short delay
    setTimeout(() => {
      console.log('Forcing completion screen to show after Complete Game button click');
      setLoadingWithDebounce(false);
      setShowCompletionScreen(true);
    }, 500);
  }, [setGameCompleted, setLoadingWithDebounce, roomId, roomPlayerId, sessionId, balance]);

  // Check localStorage for completion state when component mounts
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

  // Check if we should show the completion screen, prioritizing this over other states
  const shouldShowCompletionScreen = showCompletionScreen || 
    (gameCompleted && sessionId && localStorage.getItem(`game_completed_${sessionId}`) === 'true');

  // Special case rendering for completion screen
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
    // We don't need the duplicate check for gameCompleted here since we have the shouldShowCompletionScreen check above
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
          {stocks.map((stock) => {
            const hasActed = gameActions.some(
              action => action.level === currentLevel && action.stock_name === stock.name
            );

            return (
              <div key={stock.name} className="bg-gray-800 rounded-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-white">{stock.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className={`text-xl font-bold ${
                      stock.price > stock.previousPrice
                        ? 'text-green-500'
                        : stock.price < stock.previousPrice
                        ? 'text-red-500'
                        : 'text-white'
                    }`}>
                      ${stock.price.toFixed(2)}
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
                    <LineChart data={stock.history.map((price, index) => ({ price, index }))}>
                      <Line
                        type="monotone"
                        dataKey="price"
                        stroke={
                          stock.price > stock.previousPrice
                            ? '#10B981'
                            : stock.price < stock.previousPrice
                            ? '#EF4444'
                            : '#9CA3AF'
                        }
                        strokeWidth={2}
                        dot={false}
                      />
                      <Tooltip content={<CustomTooltip />} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleAction(stock.name, 'buy', stock.price)}
                    disabled={hasActed || actionsCount >= 3 || loading || gameCompleted}
                    className={`py-2 rounded-lg font-medium ${
                      hasActed || actionsCount >= 3 || loading || gameCompleted
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => handleAction(stock.name, 'sell', stock.price)}
                    disabled={hasActed || actionsCount >= 3 || loading || gameCompleted}
                    className={`py-2 rounded-lg font-medium ${
                      hasActed || actionsCount >= 3 || loading || gameCompleted
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    Sell
                  </button>
                  <button
                    onClick={() => handleAction(stock.name, 'hold', stock.price)}
                    disabled={hasActed || actionsCount >= 3 || loading || gameCompleted}
                    className={`py-2 rounded-lg font-medium ${
                      hasActed || actionsCount >= 3 || loading || gameCompleted
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    }`}
                  >
                    Hold
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          <button
            onClick={currentLevel >= 9 ? handleCompleteGame : handleNextLevel}
            disabled={loading || gameCompleted || levelAdvanceLock}
            className={`px-8 py-3 rounded-lg text-lg font-semibold ${
              loading || gameCompleted || levelAdvanceLock
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
      </div>
    </div>
  );
}

export default Game;