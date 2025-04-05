import React, { useState } from 'react';
import GameSessionItem from './GameSessionItem';

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

interface GameSessionsListProps {
  sessions: GameSession[];
}

const GameSessionsList: React.FC<GameSessionsListProps> = ({ sessions }) => {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <div className="text-center text-gray-400">
        No trading history available. Start a new game to begin trading!
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {sessions.map((session) => (
        <GameSessionItem
          key={session.id}
          session={session}
          expanded={expandedSession === session.id}
          onToggleExpand={() => 
            setExpandedSession(expandedSession === session.id ? null : session.id)
          }
        />
      ))}
    </div>
  );
};

export default GameSessionsList; 