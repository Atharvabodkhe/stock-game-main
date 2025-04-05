import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import TradingAnalysisWrapper from './TradingAnalysisWrapper';

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

interface GameSessionItemProps {
  session: GameSession;
  expanded: boolean;
  onToggleExpand: () => void;
}

const GameSessionItem: React.FC<GameSessionItemProps> = ({
  session,
  expanded,
  onToggleExpand
}) => {
  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
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
            onClick={onToggleExpand}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {expanded ? (
              <ChevronUp size={24} />
            ) : (
              <ChevronDown size={24} />
            )}
          </button>
        </div>
      </div>

      {expanded && session.actions && (
        <div className="space-y-6">
          {session.actions.length > 0 ? (
            <TradingAnalysisWrapper 
              actions={session.actions}
              finalBalance={
                session.final_balance && Math.abs(session.final_balance - 10000) > 0.01
                  ? session.final_balance
                  : session.game_results && session.game_results[0]?.final_balance
                    ? session.game_results[0].final_balance
                    : 10000
              }
            />
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
  );
};

export default GameSessionItem; 