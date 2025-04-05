import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface RoomPlayer {
  id: string;
  user_id: string;
  status: string;
  session_id?: string;
  user: {
    name: string;
    email: string;
  };
}

interface GameRoom {
  id: string;
  name: string;
  min_players: number;
  max_players: number;
  status: string;
  players: RoomPlayer[];
  completion_time?: string;
}

interface GameAction {
  stock_name: string;
  action: string;
  action_type?: string;
  price: number;
  timestamp: string;
  quantity?: number;
  level?: number;
  action_time_seconds?: number;
}

interface GameSession {
  id: string;
  final_balance: number;
  personality_report: string;
  created_at: string;
  actions?: GameAction[];
  trading_history?: string | any[];
  game_results?: {
    id: string;
    final_balance: number;
  }[];
}

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

export const useDashboardData = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGameSession, setActiveGameSession] = useState<string | null>(null);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [completedRooms, setCompletedRooms] = useState<GameRoom[]>([]);
  const maxRetries = 3;

  // Helper function to safely extract user info
  const safeUserExtract = (userObj: any): { name: string; email: string } => {
    // If it's null or undefined
    if (!userObj) return { name: "Unknown", email: "" };

    // If it's an array (handle the error case)
    if (Array.isArray(userObj)) {
      return { name: "Unknown", email: "" };
    }

    // If it's an object with the right properties
    if (typeof userObj === "object") {
      return {
        name: typeof userObj.name === "string" ? userObj.name : "Unknown",
        email: typeof userObj.email === "string" ? userObj.email : "",
      };
    }

    // Default case
    return { name: "Unknown", email: "" };
  };

  const fetchTradingHistory = async (sessionId: string, resultId?: string) => {
    if (!sessionId) return [];

    try {
      console.log(`Fetching trading history for session ${sessionId}`);
      
      // First try using session ID directly with expanded table options
      let { data, error } = await supabase
        .from("game_action")
        .select("*")
        .eq("session_id", sessionId)
        .order("timestamp", { ascending: true });

      if (error || !data || data.length === 0) {
        console.log(`Trying alternate session_id formats for ${sessionId}`);
        
        // Try with alternate formats (some might be stored with different casing or formatting)
        const { data: altData, error: altError } = await supabase
          .from("game_action")
          .select("*")
          .ilike("session_id", sessionId)
          .order("timestamp", { ascending: true });
          
        if (!altError && altData && altData.length > 0) {
          console.log(`Found ${altData.length} actions with case-insensitive session ID`);
          data = altData;
        }
      }

      if (error || !data || data.length === 0) {
        // Try alternatives like game_actions table (plural) if it exists
        try {
          const { data: pluralData, error: pluralError } = await supabase
            .from("game_actions") // Note the plural
            .select("*")
            .eq("session_id", sessionId)
            .order("timestamp", { ascending: true });
            
          if (!pluralError && pluralData && pluralData.length > 0) {
            console.log(`Found ${pluralData.length} actions in plural table`);
            data = pluralData;
          }
        } catch (tableError) {
          console.log("Alternate table doesn't exist:", tableError);
        }
      }

      if (error || !data || data.length === 0) {
        // If no data found, try to use result ID if available
        if (resultId) {
          console.log(`Trying with result ID ${resultId}`);
          const { data: resultData, error: resultError } = await supabase
            .from("game_action")
            .select("*")
            .eq("result_id", resultId)
            .order("timestamp", { ascending: true });

          if (!resultError && resultData && resultData.length > 0) {
            console.log(`Found ${resultData.length} actions with result ID`);
            data = resultData;
          }
        }
      }

      // No synthetic data generation - only show real data from the database
      if (!data || data.length === 0) {
        console.log(`No real trading actions found for session ${sessionId}`);
        return [];
      }

      // Group actions by level to calculate action_time_seconds if not already available
      const actionsByLevel: Record<number, any[]> = {};
      
      // First pass: group by level
      data.forEach(action => {
        const level = action.level !== undefined ? action.level : 0;
        if (!actionsByLevel[level]) {
          actionsByLevel[level] = [];
        }
        actionsByLevel[level].push({...action});
      });
      
      // Second pass: calculate action_time_seconds for each level
      Object.keys(actionsByLevel).forEach(levelKey => {
        const level = parseInt(levelKey);
        const levelActions = actionsByLevel[level];
        
        // Sort by timestamp to ensure correct order
        levelActions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        // Get the timestamp of the first action in this level
        const firstActionTime = new Date(levelActions[0].timestamp).getTime();
        
        // Calculate action_time_seconds for each action if not already set
        levelActions.forEach(action => {
          if (action.action_time_seconds === undefined || action.action_time_seconds === null || action.action_time_seconds === 0) {
            const actionTime = new Date(action.timestamp).getTime();
            // Calculate seconds since first action in the level
            action.action_time_seconds = Math.floor((actionTime - firstActionTime) / 1000);
          }
        });
      });
      
      // Flatten the grouped actions back into a single array
      data = Object.values(actionsByLevel).flat();
      
      // Sort by timestamp again to maintain original order
      data.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Map to expected format
      return data.map((action) => ({
        stock_name: action.stock_name,
        action: action.action_type || action.action,
        price: action.price,
        quantity: action.quantity || 1,
        timestamp: action.timestamp,
        level: action.level !== undefined ? action.level : 0,
        action_time_seconds: action.action_time_seconds
      }));
    } catch (error) {
      console.error("Error fetching trading history:", error);
      return [];
    }
  };

  const checkAuth = async () => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        navigate("/");
        return;
      }

      const { data: adminData } = await supabase
        .from("admin_users")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      setIsAdmin(!!adminData);
      loadInitialData();
    } catch (error) {
      console.error("Error checking auth:", error);
      navigate("/");
    }
  };

  const loadInitialData = async () => {
    try {
      setError(null);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/");
        return;
      }

      const completedRoomsResult = await loadCompletedRooms();
      await Promise.all([
        loadSessions(),
        loadRooms(),
        loadGameResults(),
        checkForActiveGame(),
      ]);

      setCompletedRooms(completedRoomsResult);
      setRetryCount(0);
      setLoading(false);
    } catch (error) {
      console.error("Error loading initial data:", error);
      setError("Failed to load some data. Retrying...");
      setLoading(false);
    }
  };

  const loadGameResults = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/");
        return;
      }

      // First check if the table exists by doing a simpler query
      try {
        const { count, error: countError } = await supabase
          .from("game_results")
          .select("*", { count: "exact", head: true });

        if (countError) {
          console.error("Error checking game_results table:", countError);
          // Table might not exist or user doesn't have access
          // Return empty array and don't set error to avoid blocking other functionality
          setGameResults([]);
          return;
        }
      } catch (tableCheckError) {
        console.error("Failed to verify game_results table:", tableCheckError);
        // Continue anyway, as the main query might still work
      }

      // Proceed with the full query with more detailed error handling
      const { data, error } = await supabase
        .from("game_results")
        .select(
          `
          *,
          user:users(name, email),
          game_session:game_sessions(personality_report)
        `,
        )
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (error) {
        // Log the specific error for debugging
        console.error("Supabase error loading game results:", error);
        
        // Check for common error types
        if (error.code === "PGRST116") {
          // No results found - this is not a real error
          setGameResults([]);
          return;
        } else if (error.code?.includes("42P01") || error.message?.includes("relation") || error.message?.includes("does not exist")) {
          // Table doesn't exist
          console.log("Game results table may not exist yet");
          setGameResults([]);
          return;
        } else if (error.code === "42703") {
          // Column doesn't exist
          console.log("Game results table has different structure than expected");
          setGameResults([]);
          return;
        }
        
        throw error;
      }

      // Ensure the data matches our expected type structure
      const typedResults: GameResult[] = (data || []).map(item => ({
        id: item.id || '',
        rank: item.rank || 0,
        final_balance: item.final_balance || 0,
        user: {
          name: item.user?.name || null,
          email: item.user?.email || null
        },
        game_session: {
          personality_report: item.game_session?.personality_report || ''
        }
      }));

      setGameResults(typedResults);
    } catch (error) {
      console.error("Error loading game results:", error);
      // Set a more generic error that won't affect the user experience as badly
      setError("Failed to load game results");
      // Set empty results to allow other features to work
      setGameResults([]);
    }
  };

  const loadSessions = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No authenticated user");
      }

      console.log("Fetching game sessions for user:", session.user.id);

      // Query game_sessions with a direct focus on final_balance
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("game_sessions")
        .select("*, final_balance, game_results(id, final_balance)")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (sessionsError) throw sessionsError;

      console.log(
        `Fetched ${sessionsData?.length || 0} sessions from database`,
      );

      // Additional verification step for sessions that might have default values
      const sessionsWithVerifiedBalance = await Promise.all(
        (sessionsData || []).map(async (s) => {
          // If balance is still the default 10000, double-check with a focused query
          if (Math.abs(s.final_balance - 10000) < 0.01) {
            console.log(`Session ${s.id} has default balance, verifying...`);
            
            try {
              // Direct focused query for the most accurate balance
              const { data: freshData } = await supabase
                .from("game_sessions")
                .select("final_balance")
                .eq("id", s.id)
                .single();
              
              if (freshData && Math.abs(freshData.final_balance - 10000) > 0.01) {
                console.log(`Found updated balance for session ${s.id}: ${freshData.final_balance}`);
                return {
                  ...s,
                  final_balance: freshData.final_balance
                };
              }
              
              // Also check game_results as a backup source
              if (!s.game_results || !s.game_results[0] || Math.abs(s.game_results[0].final_balance - 10000) < 0.01) {
                const { data: resultData } = await supabase
                  .from("game_results")
                  .select("final_balance")
                  .eq("session_id", s.id)
                  .order("created_at", { ascending: false })
                  .maybeSingle();
                
                if (resultData && Math.abs(resultData.final_balance - 10000) > 0.01) {
                  console.log(`Found balance in game_results for session ${s.id}: ${resultData.final_balance}`);
                  
                  // Update the game_sessions table with this value for future reference
                  await supabase
                    .from("game_sessions")
                    .update({ final_balance: resultData.final_balance })
                    .eq("id", s.id);
                  
                  return {
                    ...s,
                    final_balance: resultData.final_balance
                  };
                }
              }
            } catch (verifyError) {
              console.error(`Error verifying balance for session ${s.id}:`, verifyError);
            }
          }
          return s;
        })
      );

      const sessionsWithActions = await Promise.all(
        sessionsWithVerifiedBalance.map(async (session) => {
          try {
            // First, try to get actions from the game_action table
            let { data: actions, error: actionsError } = await supabase
              .from("game_action")
              .select("*")
              .eq("session_id", session.id)
              .order("timestamp", { ascending: true });

            // If no data found or there was an error, try the alternative game_action table
            if (
              (!actions || actions.length === 0 || actionsError) &&
              session.id
            ) {
              console.log(
                `No actions found in game_action table for session ${session.id}`,
              );

              // Try to get result ID if it exists
              let resultId = session.game_results?.[0]?.id;
              if (!resultId) {
                // Try to get result ID directly from game_results table
                const { data: resultsData } = await supabase
                  .from("game_results")
                  .select("id")
                  .eq("session_id", session.id)
                  .maybeSingle();

                resultId = resultsData?.id;
              }

              // Get actions using our helper function
              const fetchedActions = await fetchTradingHistory(
                session.id,
                resultId,
              );
              if (fetchedActions && fetchedActions.length > 0) {
                actions = fetchedActions;
              }

              // If still no actions, try to get them from the trading_history field
              if (
                (!actions || actions.length === 0) &&
                session.trading_history
              ) {
                console.log(
                  `Attempting to parse trading_history for session ${session.id}`,
                );
                try {
                  const parsedActions =
                    typeof session.trading_history === "string"
                      ? JSON.parse(session.trading_history)
                      : session.trading_history;

                  if (
                    Array.isArray(parsedActions) &&
                    parsedActions.length > 0
                  ) {
                    console.log(
                      `Parsed ${parsedActions.length} actions from trading_history`,
                    );
                    actions = parsedActions;
                  }
                } catch (parseError) {
                  console.error(
                    `Error parsing trading_history for session ${session.id}:`,
                    parseError,
                  );
                }
              }
            }

            // Don't generate sample data - show empty state if no actions
            if (!actions || actions.length === 0) {
              console.log(`No actions found for session ${session.id}`);
              actions = [];
            }

            return {
              ...session,
              actions: actions || [],
            };
          } catch (error) {
            console.error(
              `Error loading actions for session ${session.id}:`,
              error,
            );
            return {
              ...session,
              actions: [],
            };
          }
        }),
      );

      console.log(
        `Setting ${sessionsWithActions.length} unique sessions to state`,
      );
      setSessions(sessionsWithActions);
    } catch (error) {
      console.error("Error loading sessions:", error);
      throw new Error("Failed to load game sessions");
    }
  };

  const loadRooms = async () => {
    try {
      console.log("Loading all open game rooms...");
      const { data: roomsData, error: roomsError } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (roomsError) throw roomsError;

      console.log("Fetched rooms:", roomsData?.length || 0);

      if (roomsData) {
        const roomsWithPlayers = await Promise.all(
          roomsData.map(async (room) => {
            try {
              console.log(`Loading players for room ${room.id}...`);
              const { data: playersData, error: playersError } = await supabase
                .from("room_players")
                .select(
                  `
                  id,
                  user_id,
                  status,
                  session_id,
                  user:users(name, email)
                `,
                )
                .eq("room_id", room.id)
                .eq("status", "joined");

              if (playersError) throw playersError;

              console.log(
                `Loaded ${playersData?.length || 0} players for room ${room.id}`,
              );

              // Convert players data to proper format
              const typedPlayers: RoomPlayer[] = (playersData || []).map(
                (player) => {
                  const userInfo = safeUserExtract(player.user);
                  return {
                    id: player.id || "",
                    user_id: player.user_id || "",
                    status: player.status || "",
                    session_id: player.session_id,
                    user: userInfo,
                  };
                },
              );

              return {
                ...room,
                players: typedPlayers,
              };
            } catch (error) {
              console.error("Error loading players for room:", room.id, error);
              return { ...room, players: [] };
            }
          }),
        );

        console.log("Setting rooms with players:", roomsWithPlayers.length);
        setRooms(roomsWithPlayers);
      }
    } catch (error) {
      console.error("Error loading rooms:", error);
      setError("Failed to load game rooms");
      throw error;
    }
  };

  const loadRoomsFast = async () => {
    try {
      const { data: roomsData, error: roomsError } = await supabase
        .from("game_rooms")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (roomsError) throw roomsError;

      if (roomsData) {
        const roomsWithPlayers = await Promise.all(
          roomsData.map(async (room) => {
            try {
              const { data: playersData, error: playersError } = await supabase
                .from("room_players")
                .select(
                  `
                  id,
                  user_id,
                  status,
                  session_id,
                  user:users(name, email)
                `,
                )
                .eq("room_id", room.id)
                .eq("status", "joined");

              if (playersError) throw playersError;

              return { ...room, players: playersData || [] };
            } catch (error) {
              return { ...room, players: [] };
            }
          }),
        );

        setRooms(roomsWithPlayers);
      }
    } catch (error) {
      console.error("Error in fast room loading:", error);
    }
  };

  // Helper function to fix player status
  const fixPlayerStatus = async (playerId: string) => {
    try {
      console.log("Fixing player status for player ID:", playerId);

      // First, direct update
      await supabase
        .from("room_players")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completion_status: "completed",
        })
        .eq("id", playerId);

      // Then call the function for added assurance
      try {
        await supabase.rpc("mark_player_completed", { player_id: playerId });
        console.log("Player status successfully fixed");
      } catch (e) {
        console.error("Error in mark_player_completed while fixing status:", e);
      }
    } catch (error) {
      console.error("Error fixing player status:", error);
    }
  };

  // Helper function to clean up any lingering player statuses
  const cleanupPlayerStatus = async (userId: string) => {
    try {
      // Find any players stuck in 'in_game' status
      const { data: stuckPlayers } = await supabase
        .from("room_players")
        .select("id, session_id")
        .eq("user_id", userId)
        .eq("status", "in_game");

      if (stuckPlayers && stuckPlayers.length > 0) {
        console.log(
          `Found ${stuckPlayers.length} players stuck in 'in_game' status, cleaning up`,
        );

        for (const player of stuckPlayers) {
          // Check if their session is actually completed
          if (player.session_id) {
            const { data: sessionData } = await supabase
              .from("game_sessions")
              .select("completed_at")
              .eq("id", player.session_id)
              .single();

            if (sessionData && sessionData.completed_at) {
              console.log(
                `Session ${player.session_id} is completed, fixing player ${player.id}`,
              );
              await fixPlayerStatus(player.id);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in cleanup routine:", error);
    }
  };

  const checkForActiveGame = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/");
        return;
      }

      // IMPROVED APPROACH: First check all game_sessions to see if any are completed
      // This is the most reliable way to determine if a game is truly active
      const { data: activeSessions, error: sessionQueryError } = await supabase
        .from("game_sessions")
        .select("id, completed_at, room_id")
        .eq("user_id", session.user.id)
        .is("completed_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (sessionQueryError) {
        console.error("Error querying active sessions:", sessionQueryError);
      }

      // If we don't find any active sessions without completed_at, then skip the player check
      if (!activeSessions || activeSessions.length === 0) {
        console.log(
          "No active game sessions found without completed_at timestamp",
        );

        // Extra safeguard: Update any players that might be stuck in 'in_game' status
        await cleanupPlayerStatus(session.user.id);
        return;
      }

      // Check if player has an active game in progress
      const { data: playerData, error: playerError } = await supabase
        .from("room_players")
        .select(
          `
          id,
          room_id,
          status,
          session_id,
          completed_at,
          game_rooms(status, all_players_completed)
        `,
        )
        .eq("user_id", session.user.id)
        .eq("status", "in_game")
        .maybeSingle();

      if (playerError && playerError.code !== "PGRST116") throw playerError;

      if (!playerData || !playerData.session_id) {
        console.log("No active player record found with in_game status");
        return;
      }

      // CRITICAL CHECK: Verify this session/player is truly active before showing resume button

      // 1. Check if the session is marked as completed (most reliable)
      const { data: sessionData } = await supabase
        .from("game_sessions")
        .select("completed_at")
        .eq("id", playerData.session_id)
        .single();

      if (sessionData && sessionData.completed_at) {
        console.log(
          "Game session has completed_at timestamp, cleaning up player status",
        );
        await fixPlayerStatus(playerData.id);
        return; // Don't show resume button
      }

      // 2. Check if the room is marked as completed
      if (
        playerData.game_rooms &&
        typeof playerData.game_rooms === "object" &&
        "status" in playerData.game_rooms &&
        "all_players_completed" in playerData.game_rooms &&
        (playerData.game_rooms.status === "completed" ||
          playerData.game_rooms.all_players_completed === true)
      ) {
        console.log("Game room is completed, cleaning up player status");
        await fixPlayerStatus(playerData.id);
        return; // Don't show resume button
      }

      // 3. Check if other players in the same session are already marked as completed
      // This handles the "last player" case where all others are completed
      const { data: otherPlayers } = await supabase
        .from("room_players")
        .select("id, status")
        .eq("room_id", playerData.room_id)
        .neq("id", playerData.id)
        .neq("status", "left");

      const allOthersCompleted =
        otherPlayers &&
        otherPlayers.length > 0 &&
        otherPlayers.every((p) => p.status === "completed");

      if (allOthersCompleted) {
        console.log(
          "All other players are completed, this must be the last player",
        );
        console.log("Cleaning up player status and preventing resume");
        await fixPlayerStatus(playerData.id);
        return; // Don't show resume button
      }

      // If we get here, the session is truly active and in progress
      console.log("Found valid active game session:", playerData.session_id);
      setActiveGameSession(playerData.session_id);

      // Show a notification instead of redirecting
      console.log(
        "You have an active game. You can resume from the dashboard.",
      );
      return;
    } catch (error) {
      console.error("Error checking active game:", error);
    }
  };

  const loadCompletedRooms = async () => {
    try {
      console.log("Loading completed game rooms...");
      const { data: roomsData, error: roomsError } = await supabase
        .from("game_rooms")
        .select(
          `
          *,
          players:room_players(
            id,
            user_id,
            status,
            session_id,
            completed_at,
            user:users(name, email)
          )
        `,
        )
        .eq("status", "completed")
        .order("completion_time", { ascending: false });

      if (roomsError) throw roomsError;

      console.log("Fetched completed rooms:", roomsData?.length || 0);
      return roomsData || [];
    } catch (error) {
      console.error("Error loading completed rooms:", error);
      return [];
    }
  };

  const joinRoom = async (roomId: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/");
        return;
      }

      const { data: existingPlayer } = await supabase
        .from("room_players")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", session.user.id)
        .eq("status", "joined")
        .maybeSingle();

      if (existingPlayer) {
        setError("You are already in this room");
        return;
      }

      const { error } = await supabase.from("room_players").insert([
        {
          room_id: roomId,
          user_id: session.user.id,
          status: "joined",
        },
      ]);

      if (error) throw error;

      navigate("/waiting-room", { state: { roomId } });
    } catch (error) {
      console.error("Error joining room:", error);
      setError("Failed to join room");
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/");
    } catch (error) {
      console.error("Error signing out:", error);
      setError("Failed to sign out");
    }
  };

  const retryLoading = () => {
    setRetryCount(0);
    loadInitialData();
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (error && retryCount < maxRetries) {
      const timer = setTimeout(
        () => {
          setRetryCount((prev) => prev + 1);
          loadInitialData();
        },
        3000 * Math.pow(2, retryCount),
      );

      return () => clearTimeout(timer);
    }
  }, [error, retryCount]);

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log("Performing backup periodic refresh");
      loadRooms().catch((err: any) => {
        console.error("Error in periodic refresh:", err);
      });
    }, 5000);

    return () => clearInterval(refreshInterval);
  }, []);

  return {
    loading,
    error,
    sessions,
    rooms,
    gameResults,
    isAdmin,
    activeGameSession,
    retryCount,
    maxRetries,
    completedRooms,
    joinRoom,
    handleLogout,
    retryLoading
  };
}; 