import { create } from 'zustand';

interface GameState {
  currentLevel: number;
  balance: number;
  playerName: string;
  playerAge: number;
  playerGender: string;
  gameActions: any[];
  stocks: Stock[];
  news: string[];
  levelStocks: LevelStock[];
  gameCompleted: boolean;
  stockPerformance: StockPerformance[];
  autoUpdateEnabled: boolean;
  isPaused: boolean;
  setPlayerInfo: (name: string, age: number, gender: string) => void;
  updateBalance: (amount: number) => void;
  addAction: (action: any) => void;
  nextLevel: () => void;
  updateStocks: () => void;
  updateStockPrice: (stockName: string, newPrice: number, level?: number) => void;
  updateNewsForLevel: (level: number, news: string) => void;
  setAutoUpdate: (enabled: boolean) => void;
  resetGame: () => void;
  setGameCompleted: (completed: boolean) => void;
  setPaused: (paused: boolean) => void;
}

interface Stock {
  name: string;
  price: number;
  previousPrice: number;
  history: number[];
}

interface LevelStock {
  level: number;
  stocks: {
    name: string;
    price: number;
  }[];
}

interface StockPerformance {
  name: string;
  change: number;
  currentPrice: number;
}

const initialStocks = [
  { name: 'TECH Corp', price: 100, previousPrice: 100, history: [100] },
  { name: 'GREEN Energy', price: 75, previousPrice: 75, history: [75] },
  { name: 'HEALTH Plus', price: 50, previousPrice: 50, history: [50] },
];

const initialStockPerformance = initialStocks.map(stock => ({
  name: stock.name,
  change: 0,
  currentPrice: stock.price
}));

const initialLevelStocks = Array.from({ length: 10 }, (_, i) => ({
  level: i,
  stocks: initialStocks.map(stock => ({
    name: stock.name,
    price: stock.price
  }))
}));

const initialNews = [
  'Breaking: TECH Corp announces revolutionary quantum computing breakthrough, market anticipates major shift',
  'GREEN Energy secures massive government contract for renewable infrastructure',
  'HEALTH Plus releases promising clinical trial results for new treatment',
  'Market volatility increases as global economic tensions rise',
  'Tech sector faces regulatory challenges in key markets',
  'Renewable energy sector receives major investment boost',
  'Healthcare companies see surge in demand for innovative solutions',
  'Market analysts predict significant shifts in tech valuations',
  'Energy sector transformation accelerates amid policy changes',
  'Healthcare innovation drives market optimism in final trading session',
];

export const useGameStore = create<GameState>((set) => ({
  currentLevel: 0,
  balance: 10000,
  playerName: '',
  playerAge: 0,
  playerGender: '',
  gameActions: [],
  stocks: initialStocks,
  stockPerformance: initialStockPerformance,
  news: [...initialNews],
  levelStocks: [...initialLevelStocks],
  gameCompleted: false,
  autoUpdateEnabled: false,
  isPaused: false,
  
  setPlayerInfo: (name, age, gender) => set({ playerName: name, playerAge: age, playerGender: gender }),
  
  updateBalance: (amount) => set((state) => ({ balance: state.balance + amount })),
  
  addAction: (action) => set((state) => ({ 
    gameActions: [...state.gameActions, action] 
  })),
  
  nextLevel: () => set((state) => {
    // Log current state for debugging
    console.log(`gameStore: Current level ${state.currentLevel}, attempting to advance`);
    
    // Validate current level is within bounds
    if (state.currentLevel < 0 || state.currentLevel >= 10) {
      console.error(`gameStore: Invalid current level: ${state.currentLevel}`);
      return state;
    }

    // Check if we're at the last level
    if (state.currentLevel === 9) {
      console.log('gameStore: At final level, completing game');
      return {
        gameCompleted: true,
        currentLevel: 9  // Keep at level 9 (displayed as Level 10)
      };
    }

    // Calculate next level
    const nextLevelIndex = state.currentLevel + 1;
    console.log(`gameStore: Advancing to level ${nextLevelIndex}`);

    // Ensure next level stocks exist
    if (!state.levelStocks[nextLevelIndex]) {
      console.error(`gameStore: Missing stock data for level ${nextLevelIndex}`);
      return state;
    }

    // Update stocks for the next level
    const levelStockPrices = state.levelStocks[nextLevelIndex].stocks;
    const updatedStocks = state.stocks.map(stock => {
      const levelStock = levelStockPrices.find(s => s.name === stock.name);
      if (!levelStock) {
        console.warn(`gameStore: No price data for ${stock.name} in level ${nextLevelIndex}`);
        return stock;
      }

      return {
        ...stock,
        previousPrice: stock.price,
        price: levelStock.price,
        history: [...stock.history, levelStock.price],
      };
    });

    // Update performance metrics
    const updatedPerformance = updatedStocks.map(stock => ({
      name: stock.name,
      change: Number(((stock.price - stock.previousPrice) / stock.previousPrice * 100).toFixed(1)),
      currentPrice: stock.price
    }));

    console.log(`gameStore: Successfully advanced to level ${nextLevelIndex}`);
    return { 
      currentLevel: nextLevelIndex,
      stocks: updatedStocks,
      stockPerformance: updatedPerformance
    };
  }),
  
  updateStocks: () => set((state) => {
    if (!state.autoUpdateEnabled || state.isPaused) return state;

    const updatedStocks = state.stocks.map(stock => {
      const volatility = 0.02;
      const change = (Math.random() - 0.5) * 2 * volatility * stock.price;
      const newPrice = Number((stock.price + change).toFixed(2));
      return {
        ...stock,
        previousPrice: stock.price,
        price: Math.max(1, newPrice),
        history: [...stock.history, newPrice],
      };
    });

    const updatedPerformance = updatedStocks.map(stock => ({
      name: stock.name,
      change: Number(((stock.price - stock.previousPrice) / stock.previousPrice * 100).toFixed(1)),
      currentPrice: stock.price
    }));

    return {
      stocks: updatedStocks,
      stockPerformance: updatedPerformance
    };
  }),

  updateStockPrice: (stockName: string, newPrice: number, level?: number) => set((state) => {
    if (typeof level === 'number') {
      const updatedLevelStocks = state.levelStocks.map(levelStock => {
        if (levelStock.level === level) {
          return {
            ...levelStock,
            stocks: levelStock.stocks.map(stock => 
              stock.name === stockName ? { ...stock, price: newPrice } : stock
            )
          };
        }
        return levelStock;
      });

      if (level === state.currentLevel) {
        const updatedStocks = state.stocks.map(stock => {
          if (stock.name === stockName) {
            return {
              ...stock,
              previousPrice: stock.price,
              price: newPrice,
              history: [...stock.history, newPrice],
            };
          }
          return stock;
        });

        const updatedPerformance = updatedStocks.map(stock => ({
          name: stock.name,
          change: Number(((stock.price - stock.previousPrice) / stock.previousPrice * 100).toFixed(1)),
          currentPrice: stock.price
        }));

        return {
          levelStocks: updatedLevelStocks,
          stocks: updatedStocks,
          stockPerformance: updatedPerformance
        };
      }

      return { levelStocks: updatedLevelStocks };
    }

    const updatedStocks = state.stocks.map(stock => {
      if (stock.name === stockName) {
        return {
          ...stock,
          previousPrice: stock.price,
          price: newPrice,
          history: [...stock.history, newPrice],
        };
      }
      return stock;
    });

    const updatedPerformance = updatedStocks.map(stock => ({
      name: stock.name,
      change: Number(((stock.price - stock.previousPrice) / stock.previousPrice * 100).toFixed(1)),
      currentPrice: stock.price
    }));

    return {
      stocks: updatedStocks,
      stockPerformance: updatedPerformance
    };
  }),

  updateNewsForLevel: (level: number, newsText: string) => set((state) => {
    const updatedNews = [...state.news];
    updatedNews[level] = newsText;
    return { news: updatedNews };
  }),

  setAutoUpdate: (enabled: boolean) => set({ autoUpdateEnabled: enabled }),
  
  resetGame: () => set({
    currentLevel: 0,
    balance: 10000,
    stocks: initialStocks.map(stock => ({
      ...stock,
      history: [stock.price],
    })),
    stockPerformance: initialStockPerformance,
    levelStocks: [...initialLevelStocks],
    gameActions: [],
    news: [...initialNews],
    gameCompleted: false,
    isPaused: false,
  }),

  setGameCompleted: (completed: boolean) => set({ gameCompleted: completed }),

  setPaused: (paused: boolean) => set({ isPaused: paused }),
}));