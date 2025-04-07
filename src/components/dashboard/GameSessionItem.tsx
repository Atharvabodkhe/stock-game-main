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

  // Calculate the balance from actions
  const calculateBalanceFromActions = () => {
    if (!session.actions || session.actions.length === 0) {
      return null;
    }
    
    // Sort actions by timestamp
    const sortedActions = [...session.actions].sort((a, b) => {
      try {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } catch (e) {
        return 0;
      }
    });
    
    // Calculate running balance
    let balance = 10000; // Start with initial balance
    
    for (const action of sortedActions) {
      const actionType = (action.action_type || action.action || '').toLowerCase();
      const price = typeof action.price === 'number' ? action.price : parseFloat(String(action.price)) || 0;
      const quantity = action.quantity || 1;
      const cost = price * quantity;
      
      if (actionType === 'buy') {
        balance -= cost;
      } else if (actionType === 'sell') {
        balance += cost;
      }
    }
    
    return balance;
  };
  
  // Get the most accurate balance
  const calculatedBalance = calculateBalanceFromActions();
  const displayBalance = calculatedBalance !== null ? calculatedBalance : 
    session.final_balance && Math.abs(session.final_balance - 10000) > 0.01
      ? session.final_balance
      : session.game_results && session.game_results[0]?.final_balance
        ? session.game_results[0].final_balance
        : 10000;

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-white">
          Game Session - {formatDate(session.created_at)}
        </h2>
        <div className="flex items-center gap-4">
          <span className="text-green-500 font-semibold text-lg">
            Final Balance: ₹{displayBalance.toFixed(2)}
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
              finalBalance={displayBalance}
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