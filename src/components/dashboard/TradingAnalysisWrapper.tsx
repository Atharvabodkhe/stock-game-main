import React from 'react';
import TradingAnalysis from '../TradingAnalysis';

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

interface TradingAnalysisWrapperProps {
  actions: GameAction[];
  finalBalance: number;
}

const TradingAnalysisWrapper: React.FC<TradingAnalysisWrapperProps> = ({ actions, finalBalance }) => {
  try {
    // Debug the actions array
    console.log("Original actions:", JSON.stringify(actions));
    
    // Check for specific properties
    const actionTypes = actions.map(a => a.action);
    const stockNames = actions.map(a => a.stock_name);
    console.log("Action types:", actionTypes);
    console.log("Stock names:", stockNames);
    
    // Make sure actions have all required properties
    const formattedActions = actions.map(action => {
      // Add debug logging for each action
      console.log("Processing action:", action);
      
      // Check for alternate field names for action type
      let actionType = '';
      
      // Sometimes action is in action_type field instead
      if (action.action_type && typeof action.action_type === 'string') {
        actionType = action.action_type.toLowerCase();
      }
      // Otherwise use the action field if available
      else if (action.action && typeof action.action === 'string') {
        actionType = action.action.toLowerCase();
      }
      // Fall back to "hold" as default
      else {
        actionType = 'hold';
      }
      
      const formatted = {
        stock_name: action.stock_name || '',
        action: actionType,
        price: typeof action.price === 'number' ? action.price : parseFloat(action.price) || 0,
        quantity: action.quantity || 1,
        timestamp: action.timestamp || new Date().toISOString(),
        level: typeof action.level === 'number' ? action.level : 0,
        action_time_seconds: action.action_time_seconds // Pass through the action_time_seconds field
      };
      
      console.log("Formatted action:", formatted);
      return formatted;
    });
    
    console.log("Final formatted actions:", formattedActions);
    
    // Calculate the final balance based on the transaction history
    let calculatedFinalBalance = 10000; // Start with initial balance
    
    if (formattedActions.length > 0) {
      // Sort actions by timestamp to ensure correct calculation
      const sortedActions = [...formattedActions].sort((a, b) => {
        try {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        } catch (e) {
          return 0;
        }
      });
      
      // Calculate running balance
      for (const action of sortedActions) {
        const actionType = action.action.toLowerCase();
        const cost = action.price * action.quantity;
        
        if (actionType === 'buy') {
          calculatedFinalBalance -= cost;
        } else if (actionType === 'sell') {
          calculatedFinalBalance += cost;
        }
      }
      
      console.log("Calculated final balance from actions:", calculatedFinalBalance);
    }
    
    // Use the calculated balance from actions for consistency
    const finalBalanceToUse = calculatedFinalBalance;
    
    console.log("Final balance to use:", finalBalanceToUse);
          
    return (
      <TradingAnalysis 
        actions={formattedActions}
        finalBalance={finalBalanceToUse}
      />
    );
  } catch (error) {
    console.error("Error rendering TradingAnalysis:", error);
    return (
      <div className="bg-gray-700 p-8 rounded-lg text-center">
        <h3 className="text-lg font-semibold text-white mb-2">
          Trading Analysis Error
        </h3>
        <p className="text-gray-400">
          There was an error displaying the trading analysis. Please try again later.
        </p>
      </div>
    );
  }
};

export default TradingAnalysisWrapper; 