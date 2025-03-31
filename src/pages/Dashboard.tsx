import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  TrendingUp,
  LogOut,
  ChevronDown,
  ChevronUp,
  Users,
  Trophy,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { useRealtimeSubscription } from "../hooks/useRealtimeSubscription";

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

interface GameAction {
  stock_name: string;
  action: string;
  price: number;
  timestamp: string;
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

interface StockPerformance {
  name: string;
  change: number;
  currentPrice: number;
}

// Define payload types for Supabase realtime subscriptions
interface PlayerChangePayload {
  new: {
    status: string;
    user_id: string;
    session_id?: string;
  };
}

function Dashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [rooms, setRooms] = useState<GameRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGameSession, setActiveGameSession] = useState<string | null>(
    null,
  );
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const retryDelay = 2000;
  const [completedRooms, setCompletedRooms] = useState<GameRoom[]>([]);

  const { isSubscribed } = useRealtimeSubscription({
    channelName: "user_dashboard",
    tables: [
      { name: "game_rooms", event: "*", filter: "status=eq.open" },
      { name: "room_players", event: "*" },
      { name: "game_results", event: "*" },
    ],
    onMessage: async (message) => {
      console.log("Realtime update received:", message);

      try {
        // Extract data from the payload
        const { table, payload } = message;

        // Support both payload formats for backward compatibility
        const eventType = payload.eventType || (payload.type as string);
        const newRecord = payload.new || payload.record;
        const oldRecord = payload.old || payload.old_record;

        console.log(`Received ${eventType} event for ${table}:`, {
          newRecord,
          oldRecord,
        });

        // Only process data if there's an actual update
        if (!newRecord && !oldRecord) {
          console.log("Received event without data payload, ignoring");
          return;
        }

        // Immediately acknowledge the message to speed up perceived responsiveness
        console.log(`Processing ${table} update with type ${eventType}`);

        if (table === "game_rooms") {
          // Handle game room status changes - important for when games start
          if (newRecord && newRecord.status === "in_progress") {
            console.log(
              "Game room has started, checking if player is in this room",
            );

            // Check if current user is in this room that just started
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              const { data: playerData } = await supabase
                .from("room_players")
                .select("id, status, session_id")
                .eq("room_id", newRecord.id)
                .eq("user_id", user.id)
                .single();

              if (playerData && playerData.session_id) {
                console.log(
                  "Player found in started room with session:",
                  playerData.session_id,
                );
                setActiveGameSession(playerData.session_id);

                // If player is already in game state, redirect immediately
                if (playerData.status === "in_game") {
                  console.log(
                    "Player is in game state, redirecting to game session",
                  );
                  navigate("/game", {
                    state: { sessionId: playerData.session_id },
                  });
                  return;
                }
              }
            }
          }

          // Direct state manipulation for room updates
          if (
            eventType === "INSERT" &&
            newRecord &&
            newRecord.status === "open"
          ) {
            console.log("Optimistically adding new room to UI");

            // Cast the new room with players property using type assertion
            const newRoomWithPlayers = {
              ...newRecord,
              players: [],
            } as unknown as GameRoom;

            setRooms((prevRooms) => {
              // Check if this room already exists to avoid duplicates
              if (prevRooms.some((room) => room.id === newRecord.id)) {
                return prevRooms;
              }

              // Add the new room with empty players array
              return [newRoomWithPlayers, ...prevRooms];
            });

            // Then fetch just the players for this room
            const { data: playersData } = await supabase
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
              .eq("room_id", newRecord.id)
              .eq("status", "joined");

            // Update the room with players once available
            if (playersData) {
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

              setRooms((prevRooms) =>
                prevRooms.map((room) =>
                  room.id === newRecord.id
                    ? { ...room, players: typedPlayers }
                    : room,
                ),
              );
            }
          } else if (eventType === "UPDATE" && newRecord) {
            console.log("Optimistically updating room in UI");
            // Only update open rooms that should be displayed
            if (newRecord.status === "open") {
              setRooms((prevRooms) =>
                prevRooms.map((room) =>
                  room.id === newRecord.id
                    ? ({ ...room, ...newRecord } as GameRoom)
                    : room,
                ),
              );
            } else {
              // If room is no longer open, remove it from the view
              setRooms((prevRooms) =>
                prevRooms.filter((room) => room.id !== newRecord.id),
              );
            }
          } else if (eventType === "DELETE" && oldRecord) {
            console.log("Optimistically removing room from UI");
            setRooms((prevRooms) =>
              prevRooms.filter((room) => room.id !== oldRecord.id),
            );
          }
        } else if (table === "room_players") {
          if (eventType === "INSERT" || eventType === "UPDATE") {
            if (!newRecord) return;

            // Handle player transitions to game immediately - high priority
            if (newRecord.status === "in_game") {
              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (
                user &&
                newRecord.user_id === user.id &&
                newRecord.session_id
              ) {
                console.log(
                  "Player has been moved to in_game state with session:",
                  newRecord.session_id,
                );
                setActiveGameSession(newRecord.session_id);

                // Small delay to ensure the room state is fully updated
                setTimeout(() => {
                  console.log("Navigating to game session");
                  navigate("/game", {
                    state: { sessionId: newRecord.session_id },
                  });
                }, 200);
                return; // Stop processing as we're navigating away
              }
            }

            // For player changes in open rooms, update the state
            if (eventType === "INSERT") {
              const { data: roomData } = await supabase
                .from("game_rooms")
                .select("status")
                .eq("id", newRecord.room_id)
                .single();

              // Only update UI for open rooms and joined players
              if (
                roomData?.status === "open" &&
                newRecord.status === "joined"
              ) {
                console.log("Optimistically adding player to room");

                // Get user data first
                const { data: userData } = await supabase
                  .from("users")
                  .select("name, email")
                  .eq("id", newRecord.user_id)
                  .single();

                const playerUser = userData || {
                  name: "Loading...",
                  email: "",
                };

                // Then update rooms state with it
                setRooms((prevRooms) => {
                  return prevRooms.map((room) => {
                    if (room.id !== newRecord.room_id) return room;

                    // Check if player already exists (avoid duplicates)
                    if (room.players.some((p) => p.id === newRecord.id)) {
                      return room;
                    }

                    // Create proper player object with correct types
                    const newPlayer: RoomPlayer = {
                      id: newRecord.id,
                      user_id: newRecord.user_id,
                      status: newRecord.status,
                      session_id: newRecord.session_id,
                      user: {
                        name: playerUser.name,
                        email: playerUser.email,
                      },
                    };

                    // Return updated room with the new player
                    return {
                      ...room,
                      players: [...room.players, newPlayer],
                    };
                  });
                });
              }
            } else if (eventType === "UPDATE") {
              console.log("Player update detected:", newRecord);

              // For open rooms, update the player status
              setRooms((prevRooms) => {
                return prevRooms.map((room) => {
                  if (room.id !== newRecord.room_id) return room;

                  // For joined players, update in UI
                  if (newRecord.status === "joined") {
                    const playerExists = room.players.some(
                      (p) => p.id === newRecord.id,
                    );

                    if (playerExists) {
                      return {
                        ...room,
                        players: room.players.map((p) =>
                          p.id === newRecord.id
                            ? {
                                ...p,
                                status: newRecord.status,
                                session_id: newRecord.session_id,
                              }
                            : p,
                        ),
                      };
                    } else {
                      // Return unchanged for now, we'll refresh in background
                      return room;
                    }
                  } else {
                    // For non-joined players, remove from UI
                    return {
                      ...room,
                      players: room.players.filter(
                        (p) => p.id !== newRecord.id,
                      ),
                    };
                  }
                });
              });
            }
          } else if (eventType === "DELETE" && oldRecord) {
            console.log("Optimistically removing player from room");
            setRooms((prevRooms) => {
              return prevRooms.map((room) => {
                if (room.id === oldRecord.room_id) {
                  return {
                    ...room,
                    players: room.players.filter((p) => p.id !== oldRecord.id),
                  };
                }
                return room;
              });
            });
          }
        } else if (table === "game_results") {
          console.log("Game results update detected, reloading results...");
          await loadGameResults();
        }

        // For potentially complex updates, do a fast refresh in the background
        // but with a slight delay to not interfere with the immediate UI updates
        if (table === "game_rooms" || table === "room_players") {
          setTimeout(() => {
            loadRoomsFast().catch((e) =>
              console.error("Background refresh error:", e),
            );
          }, 1000); // Refresh after 1s to ensure data consistency
        }
      } catch (error) {
        console.error("Error handling realtime update:", error);

        // Attempt silent recovery
        setTimeout(() => {
          loadRoomsFast();
        }, 1000);
      }
    },
    onError: (error) => {
      console.error("Realtime subscription error:", error);
      setError(
        "Lost connection to realtime updates. Attempting to reconnect...",
      );
    },
    onStatusChange: (status) => {
      console.log("Realtime subscription status:", status);
      if (status === "SUBSCRIBED") {
        setError(null);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        loadRoomsFast(); // Use fast loader for recovery
      }
    },
  });

  // Restore the auth check useEffect
  useEffect(() => {
    checkAuth();
  }, []);

  // Set up a periodic refresh as a backup for realtime
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      console.log("Performing backup periodic refresh");
      loadRooms().catch((err: any) => {
        console.error("Error in periodic refresh:", err);
      });
    }, 5000); // Refresh every 5 seconds as a fallback (reduced from 30s)

    return () => clearInterval(refreshInterval);
  }, []);

  useEffect(() => {
    if (error && retryCount < maxRetries) {
      const timer = setTimeout(
        () => {
          setRetryCount((prev) => prev + 1);
          loadInitialData();
        },
        retryDelay * Math.pow(2, retryCount),
      );

      return () => clearTimeout(timer);
    }
  }, [error, retryCount]);

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

  const loadGameResults = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/");
        return;
      }

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

      if (error) throw error;

      setGameResults(data || []);
    } catch (error) {
      console.error("Error loading game results:", error);
      setError("Failed to load game results");
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

  // Helper function to fetch trading history for a session
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

      // Map to expected format
      return data.map((action) => ({
        stock_name: action.stock_name,
        action: action.action_type || action.action,
        price: action.price,
        quantity: action.quantity || 1,
        timestamp: action.timestamp,
        level: action.level !== undefined ? action.level : 0,
      }));
    } catch (error) {
      console.error("Error fetching trading history:", error);
      return [];
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

  // Fast room loading for immediate UI updates
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
      // Avoid setting error state for fast updates to prevent UI disruptions
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionStats = (actions: GameAction[] = []) => {
    const stats = {
      buy: 0,
      sell: 0,
      hold: 0,
      totalTrades: actions.length,
    };

    actions.forEach((action) => {
      if (action.action === "buy") stats.buy++;
      else if (action.action === "sell") stats.sell++;
      else if (action.action === "hold") stats.hold++;
    });

    return stats;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
          <p className="text-green-500 font-semibold">
            ₹{payload[0].value.toFixed(2)}
          </p>
        </div>
      );
    }
    return null;
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-xl">Loading dashboard...</p>
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
                onClick={() => navigate("/admin")}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Admin Dashboard
              </button>
            )}
            <button
              onClick={() => navigate("/game")}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              New Game
            </button>
            {activeGameSession && (
              <button
                onClick={() =>
                  navigate("/game", { state: { sessionId: activeGameSession } })
                }
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

        {error && retryCount < maxRetries && (
          <div className="bg-red-500 text-white p-4 rounded-lg mb-8 flex items-center gap-3">
            <AlertTriangle size={24} />
            <div>
              <p className="font-semibold">{error}</p>
              <p className="text-sm mt-1">
                Retrying... Attempt {retryCount + 1} of {maxRetries}
              </p>
            </div>
          </div>
        )}

        {error && retryCount >= maxRetries && (
          <div className="bg-red-500 text-white p-4 rounded-lg mb-8 flex items-center gap-3">
            <AlertTriangle size={24} />
            <div>
              <p className="font-semibold">
                Failed to load data after multiple attempts
              </p>
              <button
                onClick={() => {
                  setRetryCount(0);
                  loadInitialData();
                }}
                className="text-sm mt-2 bg-white text-red-500 px-3 py-1 rounded hover:bg-red-100 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {gameResults.length > 0 && (
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
        )}

        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">
            Available Rooms
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rooms.map((room) => (
              <div key={room.id} className="bg-gray-700 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">{room.name}</h3>
                  <div className="flex items-center gap-2">
                    <Users size={18} className="text-gray-400" />
                    <span className="text-gray-400">
                      {room.players.filter((p) => p.status === "joined").length}{" "}
                      / {room.max_players}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => joinRoom(room.id)}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition-colors"
                  disabled={
                    room.players.filter((p) => p.status === "joined").length >=
                    room.max_players
                  }
                >
                  Join Room
                </button>
              </div>
            ))}
            {rooms.length === 0 && (
              <p className="text-gray-400">
                No rooms available. Wait for an admin to create one.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-8">
          {sessions.map((session) => (
            <div key={session.id} className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Game Session - {formatDate(session.created_at)}
                </h2>
                <div className="flex items-center gap-4">
                  <span className="text-green-500 font-semibold text-lg">
                    Final Balance: ₹
                    {/* Prioritize the balance directly from game_sessions as it should be most accurate */}
                    {session.final_balance && Math.abs(session.final_balance - 10000) > 0.01
                      ? session.final_balance.toFixed(2)
                      : session.game_results && session.game_results[0]?.final_balance
                        ? session.game_results[0].final_balance.toFixed(2)
                        : "10000.00"}
                  </span>
                  <button
                    onClick={() =>
                      setExpandedSession(
                        expandedSession === session.id ? null : session.id,
                      )
                    }
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {expandedSession === session.id ? (
                      <ChevronUp size={24} />
                    ) : (
                      <ChevronDown size={24} />
                    )}
                  </button>
                </div>
              </div>

              {expandedSession === session.id && session.actions && (
                <div className="space-y-6">
                  {session.actions.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-700 p-4 rounded-lg">
                          <h3 className="text-lg font-semibold text-white mb-4">
                            Trading Activity
                          </h3>
                          <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={session.actions}>
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="#374151"
                                />
                                <XAxis dataKey="timestamp" stroke="#9CA3AF" />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip content={<CustomTooltip />} />
                                <Line
                                  type="monotone"
                                  dataKey="price"
                                  stroke="#10B981"
                                  strokeWidth={2}
                                  dot={false}
                                  activeDot={{ r: 6 }}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="bg-gray-700 p-4 rounded-lg">
                          <h3 className="text-lg font-semibold text-white mb-4">
                            Action Distribution
                          </h3>
                          <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={[getActionStats(session.actions)]}
                                margin={{
                                  top: 20,
                                  right: 30,
                                  left: 20,
                                  bottom: 5,
                                }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  stroke="#374151"
                                />
                                <XAxis stroke="#9CA3AF" />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip />
                                <Bar dataKey="buy" fill="#10B981" name="Buy" />
                                <Bar
                                  dataKey="sell"
                                  fill="#EF4444"
                                  name="Sell"
                                />
                                <Bar
                                  dataKey="hold"
                                  fill="#F59E0B"
                                  name="Hold"
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-700 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-white mb-4">
                          Trading Statistics
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <p className="text-gray-400">Total Trades</p>
                            <p className="text-2xl font-bold text-white">
                              {getActionStats(session.actions).totalTrades}
                            </p>
                          </div>
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <p className="text-gray-400">Buy Orders</p>
                            <p className="text-2xl font-bold text-green-500">
                              {getActionStats(session.actions).buy}
                            </p>
                          </div>
                          <div className="bg-gray-800 p-4 rounded-lg">
                            <p className="text-gray-400">Sell Orders</p>
                            <p className="text-2xl font-bold text-red-500">
                              {getActionStats(session.actions).sell}
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="bg-gray-700 p-8 rounded-lg text-center">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        No Trading Activity
                      </h3>
                      <p className="text-gray-400">
                        No trading actions were recorded for this session. Try
                        playing a new game and make some trades to see them
                        here.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center text-gray-400">
              No trading history available. Start a new game to begin trading!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
