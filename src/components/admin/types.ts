// Type definitions for Admin components

export interface GameRoom {
  id: string;
  name: string;
  min_players: number;
  max_players: number;
  status: string;
  created_at: string;
  started_at?: string;
  ended_at?: string;
  completion_time?: string;
  all_players_completed?: boolean;
  players: RoomPlayer[];
}

export interface RoomPlayer {
  id: string;
  user_id: string;
  status: string;
  session_id?: string;
  user: {
    name: string;
    email: string;
  };
}

export interface GameResult {
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

export interface NewRoom {
  name: string;
  min_players: number;
  max_players: number;
}

export interface Stock {
  name: string;
  price: number;
}

export interface LevelStock {
  stocks: Stock[];
}

export interface StockPerformance {
  name: string;
  change: number;
} 