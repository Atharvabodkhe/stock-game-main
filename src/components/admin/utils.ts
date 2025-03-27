import { GameResult } from './types';

// Helper function to safely extract user info
export const safeUserExtract = (user: GameResult['user']) => {
  return {
    name: user?.name || 'Unknown Player',
    email: user?.email || ''
  };
};

// Helper function to safely get profit percentage
export const getProfit = (result: GameResult): number => {
  return result.profit_percentage !== undefined ? result.profit_percentage : 0;
}; 