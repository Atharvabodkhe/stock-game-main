import { create } from 'zustand';
import { supabase } from '../lib/supabase';

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
  isLoading: boolean;
  pausedAt: string | null;
  gameStateId: string | null;
  playerHoldings: StockHolding[];
  levelNewsEvents: LevelNewsEvent[];
  timerSeconds: number;
  latestNewsEvent: LevelNewsEvent | null;
  newsUpdateInProgress: boolean;
  setPlayerInfo: (name: string, age: number, gender: string) => void;
  updateBalance: (amount: number) => void;
  addAction: (action: any) => void;
  nextLevel: () => void;
  updateStocks: () => void;
  updateStockPrice: (stockName: string, newPrice: number, level?: number, triggerTimeSeconds?: number, entryId?: string) => void;
  updateNewsForLevel: (level: number, news: string) => void;
  setAutoUpdate: (enabled: boolean) => void;
  resetGame: () => void;
  setGameCompleted: (completed: boolean) => void;
  setPaused: (paused: boolean) => Promise<void>;
  fetchInitialData: () => Promise<void>;
  fetchGameState: () => Promise<void>;
  setupRealtimeSubscriptions: () => void;
  cleanupRealtimeSubscriptions: () => void;
  buyStock: (stockName: string, quantity: number) => number;
  sellStock: (stockName: string, quantity: number) => number;
  getStockAvgPrice: (stockName: string) => number;
  getStockQuantity: (stockName: string) => number;
  incrementTimer: () => void;
  resetTimer: () => void;
  processTimedEvents: () => Promise<void>;
  fetchLevelNewsEvents: () => Promise<void>;
  updateNewsEvent: (id: string, content: string, triggerTime: number) => Promise<void>;
  createNewsEvent: (level: number, sequenceOrder: number, content: string, triggerTime: number) => Promise<void>;
  deleteNewsEvent: (id: string) => Promise<void>;
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
    triggerTimeSeconds?: number;
  }[];
}

interface StockPerformance {
  name: string;
  change: number;
  currentPrice: number;
}

interface StockHolding {
  name: string;
  quantity: number;
  avgPrice: number;
  purchaseHistory: {
    level: number;
    quantity: number;
    price: number;
    timestamp: string;
  }[];
}

interface LevelNewsEvent {
  id: string;
  level: number;
  sequenceOrder: number;
  content: string;
  triggerTimeSeconds: number;
  processed?: boolean;
}

// Default initial values to use if database fetch fails
const initialStocks = [
  { name: 'Reliance Industries', price: 2500, previousPrice: 2500, history: [2500] },
  { name: 'Tata Motors', price: 600, previousPrice: 600, history: [600] },
  { name: 'HDFC Bank', price: 1500, previousPrice: 1500, history: [1500] },
  { name: 'Infosys', price: 1400, previousPrice: 1400, history: [1400] },
  { name: 'Adani Enterprises', price: 2000, previousPrice: 2000, history: [2000] },
  { name: 'Zomato', price: 100, previousPrice: 100, history: [100] },
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
  'Market opens stable',
  'Tata Motors unveils new electric vehicle lineup, stock surges on positive investor sentiment',
  'HDFC Bank reports record quarterly profit, exceeding analyst expectations',
  'Infosys secures multi-million dollar IT infrastructure deal with global financial institutions',
  'Adani Enterprises diversifies portfolio with strategic acquisitions in emerging sectors',
  'Zomato expands quick commerce service to additional cities, boosting market share',
  'Indian stock market reaches all-time high as foreign investors increase their positions',
  'Technology sector leads gains as digital transformation accelerates across industries',
  'Banking stocks rally on positive economic outlook and credit growth projections',
  'Market closes strong in final session with broad-based buying across sectors',
];

export const useGameStore = create<GameState>((set, get) => ({
  currentLevel: 0,
  balance: 10000,
  playerName: '',
  playerAge: 0,
  playerGender: '',
  gameActions: [],
  stocks: [...initialStocks],
  stockPerformance: [...initialStockPerformance],
  news: [...initialNews],
  levelStocks: [...initialLevelStocks],
  gameCompleted: false,
  autoUpdateEnabled: false,
  isPaused: false,
  isLoading: true,
  pausedAt: null,
  gameStateId: null,
  playerHoldings: [],
  levelNewsEvents: [],
  timerSeconds: 0,
  latestNewsEvent: null,
  newsUpdateInProgress: false,
  
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

      // When advancing to a new level, update the previousPrice
      // This is the appropriate time to update the baseline
      return {
        ...stock,
        previousPrice: stock.price, // Update baseline price on level change
        price: levelStock.price,
        // Add new price to existing history instead of creating a new array
        history: [...stock.history, levelStock.price],
      };
    });

    // Update performance metrics with freshly calculated changes
    const updatedPerformance = updatedStocks.map(stock => ({
      name: stock.name,
      change: Number(((stock.price - stock.previousPrice) / stock.previousPrice * 100).toFixed(1)),
      currentPrice: stock.price
    }));

    console.log(`gameStore: Successfully advanced to level ${nextLevelIndex}`);
    return { 
      currentLevel: nextLevelIndex,
      stocks: updatedStocks,
      stockPerformance: updatedPerformance,
      latestNewsEvent: null
    };
  }),
  
  updateStocks: () => set((state) => {
    if (!state.autoUpdateEnabled || state.isPaused) return state;

    // Returning the state without modifying stock prices
    return state;
  }),

  updateStockPrice: async (stockName: string, newPrice: number, level?: number, triggerTimeSeconds?: number, entryId?: string) => {
    // Keep the price exactly as provided by the admin
    // No formatting applied to preserve the exact value
    
    // First update local state
    set((state) => {
    if (typeof level === 'number') {
        // Updating a level-specific stock price
      const updatedLevelStocks = state.levelStocks.map(levelStock => {
        if (levelStock.level === level) {
          return {
            ...levelStock,
            stocks: levelStock.stocks.map(stock => 
              stock.name === stockName ? { 
                ...stock, 
                price: newPrice,
                triggerTimeSeconds: triggerTimeSeconds !== undefined ? triggerTimeSeconds : stock.triggerTimeSeconds 
              } : stock
            )
          };
        }
        return levelStock;
      });

        // If we're updating the current level's stock, also update current stocks
      if (level === state.currentLevel) {
        const updatedStocks = state.stocks.map(stock => {
          if (stock.name === stockName) {
              // We're updating the current price but want to maintain the history
              // First, get the current history
              const currentHistory = [...stock.history];
              
              // If history is longer than 1 + level, it means we already have prices for future levels
              // We need to update only the price for the current level
              if (currentHistory.length > level + 1) {
                // Replace the price at the current level position
                currentHistory[level] = newPrice;
                
                return {
                  ...stock,
                  // Keep the previousPrice stable to maintain consistent gain/loss calculations
                  // Only update the current price
                  price: newPrice,
                  history: currentHistory
                };
              } else {
                // Normal case - just add to history
            return {
              ...stock,
              // Keep the previousPrice stable to maintain consistent gain/loss calculations
              // Only update the current price
              price: newPrice,
              history: [...stock.history, newPrice],
            };
              }
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

      // Updating the current stock price (not level-specific)
    const updatedStocks = state.stocks.map(stock => {
      if (stock.name === stockName) {
          // Get the current history
          const currentHistory = [...stock.history];
          
          // Update the last price in the history (current level price)
          if (currentHistory.length > 0) {
            // Replace the last item in history with the new price
            currentHistory[currentHistory.length - 1] = newPrice;
          } else {
            // If no history, initialize with the new price
            currentHistory.push(newPrice);
          }
          
        return {
          ...stock,
          // Don't update previousPrice on regular updates, only on level changes
          // This maintains stable gain/loss calculations
          price: newPrice,
          history: currentHistory
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
    });

    // Then update the database with the exact price (no formatting)
    try {
      if (typeof level === 'number') {
        // If an entry ID is provided, update that specific entry
        if (entryId) {
          const { error } = await supabase
            .from('level_stocks')
            .update({ 
              price: newPrice,
              trigger_time_seconds: triggerTimeSeconds || 120
            })
            .eq('id', entryId);
            
          if (error) throw error;
        } else {
          // Check if the entry already exists
          const { data, error: checkError } = await supabase
            .from('level_stocks')
            .select('id')
            .eq('level', level)
            .eq('stock_name', stockName)
            .eq('trigger_time_seconds', triggerTimeSeconds || 120);
            
          if (checkError) throw checkError;
          
          if (data && data.length > 0) {
            // Update existing entry
        const { error } = await supabase
          .from('level_stocks')
          .update({ price: newPrice })
          .eq('level', level)
              .eq('stock_name', stockName)
              .eq('trigger_time_seconds', triggerTimeSeconds || 120);

        if (error) throw error;
          } else {
            // Insert new entry if it doesn't exist
            const newEntry = {
              stock_name: stockName,
              price: newPrice,
              level: level,
              trigger_time_seconds: triggerTimeSeconds || 120
            };
            
            const { error } = await supabase
              .from('level_stocks')
              .insert(newEntry);
              
            if (error) throw error;
          }
        }
      } else {
        // Update current stock price
        const { error } = await supabase
          .from('stocks')
          .update({ price: newPrice })
          .eq('name', stockName);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error updating stock price in database:', error);
    }
  },

  updateNewsForLevel: async (level: number, newsText: string) => {
    // First update local state
    set((state) => {
    const updatedNews = [...state.news];
    updatedNews[level] = newsText;
    return { news: updatedNews };
    });

    // Then update the database
    try {
      const { error } = await supabase
        .from('news')
        .update({ content: newsText })
        .eq('level', level);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating news in database:', error);
    }
  },

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
    isLoading: false,
    pausedAt: null,
    playerHoldings: [],
    levelNewsEvents: [],
    timerSeconds: 0,
    latestNewsEvent: null,
    newsUpdateInProgress: false,
  }),

  setGameCompleted: (completed: boolean) => set({ gameCompleted: completed }),

  setPaused: async (paused: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // First check if user is admin before making database changes
      const { data: adminCheck } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      const isAdmin = !!adminCheck;
      
      // Update database if user is admin
      if (isAdmin) {
        if (paused) {
          // Call the pause_game function
          await supabase.rpc('pause_game', { admin_id: session.user.id });
        } else {
          // Call the resume_game function
          await supabase.rpc('resume_game', { admin_id: session.user.id });
        }
      }
      
      // Update the local state
      set({ 
        isPaused: paused,
        pausedAt: paused ? new Date().toISOString() : null
      });
      
    } catch (error) {
      console.error('Error updating game pause state:', error);
    }
  },
  
  fetchGameState: async () => {
    try {
      const { data, error } = await supabase
        .from('game_state')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
        
      if (error) throw error;
      
      if (data) {
        set({ 
          isPaused: data.is_paused,
          pausedAt: data.paused_at,
          gameStateId: data.id
        });
      }
    } catch (error) {
      console.error('Error fetching game state:', error);
    }
  },

  fetchInitialData: async () => {
    try {
      set({ isLoading: true });
      
      // Fetch game state first to determine if game is paused
      await get().fetchGameState();
      
      // Fetch stocks
      const { data: stocksData, error: stocksError } = await supabase
        .from('stocks')
        .select('*')
        .order('id', { ascending: true });

      if (stocksError) throw stocksError;

      // Fetch level stocks - Note: now there may be multiple entries per stock and level
      const { data: levelStocksData, error: levelStocksError } = await supabase
        .from('level_stocks')
        .select('*')
        .order('level', { ascending: true })
        .order('stock_name', { ascending: true })
        .order('trigger_time_seconds', { ascending: true });

      if (levelStocksError) throw levelStocksError;

      // Fetch news
      const { data: newsData, error: newsError } = await supabase
        .from('news')
        .select('*')
        .order('level', { ascending: true });

      if (newsError) throw newsError;

      // Process stocks
      let updatedStocks: Stock[] = [...initialStocks];
      if (stocksData && stocksData.length > 0) {
        // First, create a base stock object
        updatedStocks = stocksData.map(stock => ({
          name: stock.name,
          price: stock.price,
          previousPrice: stock.price,
          history: []  // Initialize with empty array, will fill with all level prices
        }));
      }

      // Process level stocks and build complete price history
      let updatedLevelStocks: LevelStock[] = [...initialLevelStocks];
      if (levelStocksData && levelStocksData.length > 0) {
        // Group by level
        const levelGroups = levelStocksData.reduce((groups: any, item) => {
          const level = item.level;
          if (!groups[level]) {
            groups[level] = [];
          }
          groups[level].push(item);
          return groups;
        }, {});

        // Create level stocks array - now handling multiple entries per stock
        updatedLevelStocks = Array.from({ length: 10 }, (_, i) => {
          const levelStocks = levelGroups[i] || [];
          
          // Get unique stock names in this level
          const stockNames = [...new Set(levelStocks.map((ls: any) => ls.stock_name))] as string[];
          
          // For each stock name, get all entries (there may be multiple with different trigger times)
          const stocks = stockNames.map(stockName => {
            // Get all entries for this stock name
            const stockEntries = levelStocks.filter((ls: any) => ls.stock_name === stockName);
            
            // Use the first entry's price as the default price
            // (this maintains compatibility with existing code expecting a single price)
            const firstEntry = stockEntries[0];
            
            return {
              name: stockName,
              price: firstEntry ? Number(firstEntry.price) : 0,
              triggerTimeSeconds: firstEntry ? Number(firstEntry.trigger_time_seconds) : 120
            };
          });
          
          return {
            level: i,
            stocks: stocks
          };
        });
        
        // Build complete stock price history for all levels
        // First, organize all prices by stock name
        const stockPriceHistory: { [key: string]: number[] } = {};
        
        // Initialize with current prices (level 0)
        updatedStocks.forEach(stock => {
          stockPriceHistory[stock.name] = [stock.price];
        });
        
        // Add prices from all levels to the history
        for (let level = 0; level < updatedLevelStocks.length; level++) {
          const levelData = updatedLevelStocks[level];
          
          levelData.stocks.forEach(stock => {
            if (!stockPriceHistory[stock.name]) {
              stockPriceHistory[stock.name] = [];
            }
            
            // Only add the price if it's for a level higher than current
            // to avoid duplicating the current level price
            if (level > 0) {
              stockPriceHistory[stock.name].push(stock.price);
            }
          });
        }
        
        // Update the stock history with all level prices
        updatedStocks = updatedStocks.map(stock => ({
          ...stock,
          // Use the stock's current price as the initial history point
          // then add all historical prices from other levels
          history: stockPriceHistory[stock.name] || [stock.price]
        }));
      }

      // Process news
      let updatedNews: string[] = [...initialNews];
      if (newsData && newsData.length > 0) {
        updatedNews = Array.from({ length: 10 }, (_, i) => {
          const levelNews = newsData.find(n => n.level === i);
          return levelNews ? levelNews.content : initialNews[i];
        });
      }
      
      // Ensure Level 1 news is always set correctly regardless of database state
      updatedNews[0] = 'Market opens stable';

      // Calculate stock performance
      const updatedPerformance = updatedStocks.map(stock => ({
        name: stock.name,
        change: 0,
        currentPrice: stock.price
      }));

      // Update state with fetched data
      set({
        stocks: updatedStocks,
        levelStocks: updatedLevelStocks,
        news: updatedNews,
        stockPerformance: updatedPerformance,
        isLoading: false
      });
      
      console.log('Game data loaded from database with complete price history');
      
      // Also fetch level news events
      await get().fetchLevelNewsEvents();
    } catch (error) {
      console.error('Error fetching game data:', error);
      // Fall back to initial values if fetch fails
      set({
        stocks: [...initialStocks],
        stockPerformance: [...initialStockPerformance],
        levelStocks: [...initialLevelStocks],
        news: [...initialNews],
        isLoading: false
      });
    }
  },

  setupRealtimeSubscriptions: () => {
    try {
      // Create a channel for all realtime subscriptions
      const gameChannel = supabase.channel('game-channel')
        
        // Stock price changes
        .on('postgres_changes', 
          { event: 'UPDATE', schema: 'public', table: 'stocks' },
          (payload) => {
            // Commented out to prevent automatic price updates
            // const { new: newRecord } = payload;
            // if (newRecord) {
            //   const store = get();
            //   const stockName = newRecord.name;
            //   const newPrice = newRecord.price;
            //   
            //   // Only update if we're not the one who triggered the change
            //   // This check prevents infinite loops
            //   const currentStock = store.stocks.find(s => s.name === stockName);
            //   if (currentStock && currentStock.price !== newPrice) {
            //     // Update the stock
            //     store.updateStockPrice(stockName, newPrice);
            //     
            //     // Emit custom event for the Game component to show visual feedback
            //     const updateEvent = new CustomEvent('stock-price-updated', {
            //       detail: { name: stockName, price: newPrice }
            //     });
            //     window.dispatchEvent(updateEvent);
            //   }
            // }
            
            // Do nothing to prevent price updates
            console.log('Stock price update received but ignored to prevent automatic changes');
          }
        )
        
        // Level stock price changes
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'level_stocks' },
          (payload) => {
            // Commented out to prevent automatic price updates
            // const { new: newRecord } = payload;
            // if (newRecord) {
            //   const store = get();
            //   const stockName = newRecord.stock_name;
            //   const level = newRecord.level;
            //   const newPrice = newRecord.price;
            //   
            //   // Only update if we're not the one who triggered the change
            //   const levelStock = store.levelStocks[level]?.stocks.find(s => s.name === stockName);
            //   if (levelStock && levelStock.price !== newPrice) {
            //     // Update the stock
            //     store.updateStockPrice(stockName, newPrice, level);
            //     
            //     // If this is for the current level, emit custom event
            //     if (level === store.currentLevel) {
            //       const updateEvent = new CustomEvent('stock-price-updated', {
            //         detail: { name: stockName, price: newPrice }
            //       });
            //       window.dispatchEvent(updateEvent);
            //     }
            //   }
            // }
            
            // Do nothing to prevent price updates
            console.log('Level stock price update received but ignored to prevent automatic changes');
          }
        )
        
        // News changes
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'news' },
          (payload) => {
            // Update the local state when news changes
            const { new: newRecord } = payload;
            if (newRecord) {
              const store = get();
              const level = newRecord.level;
              const content = newRecord.content;
              
              // Only update if we're not the one who triggered the change
              if (store.news[level] !== content) {
                set((state) => {
                  const updatedNews = [...state.news];
                  updatedNews[level] = content;
                  return { news: updatedNews };
                });
              }
            }
          }
        )
        
        // Game state changes (pause/resume)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'game_state' },
          (payload) => {
            const { new: newRecord } = payload;
            if (newRecord) {
              const store = get();
              const isPaused = newRecord.is_paused;
              
              // Only update if there's a change to avoid loops
              if (store.isPaused !== isPaused) {
                set({ 
                  isPaused,
                  pausedAt: newRecord.paused_at,
                  gameStateId: newRecord.id
                });
                
                console.log(`Game ${isPaused ? 'paused' : 'resumed'} by admin`);
              }
            }
          }
        )
        
        // Add handler for level_news_events changes
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'level_news_events' },
          (payload) => {
            const { new: newRecord, old: oldRecord, eventType } = payload;
            
            // Handle different event types
            if (eventType === 'INSERT' && newRecord) {
              const newEvent: LevelNewsEvent = {
                id: newRecord.id,
                level: newRecord.level,
                sequenceOrder: newRecord.sequence_order,
                content: newRecord.content,
                triggerTimeSeconds: newRecord.trigger_time_seconds,
                processed: false
              };
              
              set(state => ({
                levelNewsEvents: [...state.levelNewsEvents, newEvent]
              }));
            } else if (eventType === 'UPDATE' && newRecord) {
              set(state => ({
                levelNewsEvents: state.levelNewsEvents.map(event => 
                  event.id === newRecord.id 
                    ? {
                        id: newRecord.id,
                        level: newRecord.level,
                        sequenceOrder: newRecord.sequence_order,
                        content: newRecord.content,
                        triggerTimeSeconds: newRecord.trigger_time_seconds,
                        processed: event.processed
                      }
                    : event
                )
              }));
            } else if (eventType === 'DELETE' && oldRecord) {
              set(state => ({
                levelNewsEvents: state.levelNewsEvents.filter(event => 
                  event.id !== oldRecord.id
                )
              }));
            }
          }
        )
        .subscribe();

      // Store channel reference in window for cleanup
      (window as any).__gameChannel = gameChannel;
      
      console.log('Realtime subscriptions established');
    } catch (error) {
      console.error('Error setting up realtime subscriptions:', error);
    }
  },

  cleanupRealtimeSubscriptions: () => {
    try {
      // Remove realtime subscriptions
      if ((window as any).__gameChannel) {
        supabase.removeChannel((window as any).__gameChannel);
        delete (window as any).__gameChannel;
      }
    } catch (error) {
      console.error('Error cleaning up subscriptions:', error);
    }
  },

  buyStock: (stockName: string, quantity: number) => {
    const state = get();
    const stock = state.stocks.find(s => s.name === stockName);
    if (!stock) return 0;

    // Calculate price based on averaging with previous levels
    const currentStock = state.stocks.find(s => s.name === stockName);
    const currentLevelPrice = currentStock ? currentStock.price : 0;
    
    // Get all historical prices for this stock up to current level
    let pricePoints: number[] = [];
    
    // Get price from current level
    pricePoints.push(currentLevelPrice);
    
    // Get prices from previous levels (if we're past level 0)
    if (state.currentLevel > 0) {
      for (let level = 0; level < state.currentLevel; level++) {
        const levelStock = state.levelStocks[level].stocks.find(s => s.name === stockName);
        if (levelStock) {
          pricePoints.push(levelStock.price);
        }
      }
    }
    
    // Calculate the average price across all levels
    const avgLevelPrice = pricePoints.reduce((sum, price) => sum + price, 0) / pricePoints.length;
    const totalCost = avgLevelPrice * quantity;
    
    // Check if player has sufficient balance before proceeding
    if (totalCost > state.balance) {
      // Return the cost without updating player holdings
      return totalCost;
    }
    
    // Update player holdings
    set(state => {
      const holdings = [...state.playerHoldings];
      const existingHolding = holdings.find(h => h.name === stockName);
      
      if (existingHolding) {
        // Update existing holding with weighted average price
        const newTotalQuantity = existingHolding.quantity + quantity;
        const newAvgPrice = (existingHolding.quantity * existingHolding.avgPrice + quantity * avgLevelPrice) / newTotalQuantity;
        
        existingHolding.quantity = newTotalQuantity;
        existingHolding.avgPrice = newAvgPrice;
        existingHolding.purchaseHistory.push({
          level: state.currentLevel,
          quantity: quantity,
          price: avgLevelPrice,
          timestamp: new Date().toISOString()
        });
      } else {
        // Create new holding
        holdings.push({
          name: stockName,
          quantity: quantity,
          avgPrice: avgLevelPrice,
          purchaseHistory: [{
            level: state.currentLevel,
            quantity: quantity,
            price: avgLevelPrice,
            timestamp: new Date().toISOString()
          }]
        });
      }
      
      // Update balance by subtracting the cost
      return { 
        playerHoldings: holdings,
        balance: state.balance - totalCost 
      };
    });
    
    return totalCost;
  },

  sellStock: (stockName: string, quantity: number) => {
    const state = get();
    const stock = state.stocks.find(s => s.name === stockName);
    if (!stock) return 0;
    
    // Get current holding
    const holding = state.playerHoldings.find(h => h.name === stockName);
    if (!holding || holding.quantity < quantity) {
      return 0; // Cannot sell more than owned
    }
    
    // Calculate sale value based on current price
    const saleValue = stock.price * quantity;
    
    // Update player holdings
    set(state => {
      const holdings = [...state.playerHoldings];
      const existingHolding = holdings.find(h => h.name === stockName);
      
      if (existingHolding) {
        existingHolding.quantity -= quantity;
        
        // If quantity is zero, we could remove it from the array
        // But for tracking purposes, we'll keep it with zero quantity
        if (existingHolding.quantity === 0) {
          existingHolding.avgPrice = 0;
        }
        
        // Add sale to purchase history with negative quantity
        existingHolding.purchaseHistory.push({
          level: state.currentLevel,
          quantity: -quantity,
          price: stock.price,
          timestamp: new Date().toISOString()
        });
      }
      
      // Update balance with the sale proceeds
      return { 
        playerHoldings: holdings,
        balance: state.balance + saleValue
      };
    });
    
    return saleValue;
  },

  getStockAvgPrice: (stockName: string) => {
    const state = get();
    const holding = state.playerHoldings.find(h => h.name === stockName);
    return holding ? holding.avgPrice : 0;
  },

  getStockQuantity: (stockName: string) => {
    const state = get();
    const holding = state.playerHoldings.find(h => h.name === stockName);
    return holding ? holding.quantity : 0;
  },

  incrementTimer: () => {
    if (get().isPaused || get().gameCompleted) return;
    
    set(state => ({ timerSeconds: state.timerSeconds + 1 }));
    get().processTimedEvents();
  },
  
  resetTimer: () => set({ timerSeconds: 0 }),
  
  processTimedEvents: async () => {
    const state = get();
    
    // Don't process if game is paused, completed, or another update is in progress
    if (state.isPaused || state.gameCompleted || state.newsUpdateInProgress) return;
    
    const currentTime = state.timerSeconds;
    const currentLevel = state.currentLevel;
    
    // Find news events that should be triggered at this time
    const newsEventsToProcess = state.levelNewsEvents.filter(
      event => event.level === currentLevel && 
               event.triggerTimeSeconds === currentTime &&
               !event.processed
    );
    
    // Fetch the latest stock data directly from the database to capture all entries
    let stocksToUpdate: { stock_name: string, price: number }[] = [];
    
    try {
      // Query the database for all stock entries at the current level and time
      const { data, error } = await supabase
        .from('level_stocks')
        .select('stock_name, price')
        .eq('level', currentLevel)
        .eq('trigger_time_seconds', currentTime);
        
      if (error) {
        console.error('Error fetching timed stock updates:', error);
      } else if (data) {
        stocksToUpdate = data;
      }
    } catch (error) {
      console.error('Error in database query for stock updates:', error);
    }
    
    // If we have no news events and no stock updates, return early
    if (newsEventsToProcess.length === 0 && stocksToUpdate.length === 0) return;
    
    // Mark that we're processing an update
    set({ newsUpdateInProgress: true });
    
    try {
      // Process stock updates first
      if (stocksToUpdate.length > 0) {
        // Silently update each stock price without triggering a notification
        for (const stock of stocksToUpdate) {
          await state.updateStockPrice(stock.stock_name, stock.price);
        }
      }
      
      // Then process news events
      for (const newsEvent of newsEventsToProcess) {
        // Update news display
        const updatedNewsEvents = state.levelNewsEvents.map(event => 
          event.id === newsEvent.id ? { ...event, processed: true } : event
        );
        
        // Set the latest news event for display
        set({ 
          latestNewsEvent: newsEvent,
          levelNewsEvents: updatedNewsEvents
        });
        
        // Update the current news for this level
        const updatedNews = [...state.news];
        updatedNews[currentLevel] = newsEvent.content;
        
        set({ news: updatedNews });
        
        // Emit an event for the client to show the news update
        const newsUpdateEvent = new CustomEvent('news-event-triggered', {
          detail: { content: newsEvent.content, level: currentLevel, time: currentTime }
        });
        window.dispatchEvent(newsUpdateEvent);
      }
    } catch (error) {
      console.error('Error processing timed events:', error);
    } finally {
      // Mark that we're done processing
      set({ newsUpdateInProgress: false });
    }
  },
  
  fetchLevelNewsEvents: async () => {
    try {
      const { data, error } = await supabase
        .from('level_news_events')
        .select('*')
        .order('level', { ascending: true })
        .order('sequence_order', { ascending: true });
      
      if (error) throw error;
      
      if (data) {
        const formattedEvents: LevelNewsEvent[] = data.map(event => ({
          id: event.id,
          level: event.level,
          sequenceOrder: event.sequence_order,
          content: event.content,
          triggerTimeSeconds: event.trigger_time_seconds,
          processed: false
        }));
        
        set({ levelNewsEvents: formattedEvents });
      }
    } catch (error) {
      console.error('Error fetching level news events:', error);
    }
  },
  
  updateNewsEvent: async (id: string, content: string, triggerTime: number) => {
    try {
      const { error } = await supabase
        .from('level_news_events')
        .update({ 
          content: content,
          trigger_time_seconds: triggerTime
        })
        .eq('id', id);
      
      if (error) throw error;
      
      // Update local state
      set(state => ({
        levelNewsEvents: state.levelNewsEvents.map(event => 
          event.id === id 
            ? { ...event, content, triggerTimeSeconds: triggerTime }
            : event
        )
      }));
    } catch (error) {
      console.error('Error updating news event:', error);
    }
  },
  
  createNewsEvent: async (level: number, sequenceOrder: number, content: string, triggerTime: number) => {
    try {
      const { data, error } = await supabase
        .from('level_news_events')
        .insert({
          level: level,
          sequence_order: sequenceOrder,
          content: content,
          trigger_time_seconds: triggerTime
        })
        .select()
        .single();
      
      if (error) throw error;
      
      if (data) {
        // Add to local state
        const newEvent: LevelNewsEvent = {
          id: data.id,
          level: data.level,
          sequenceOrder: data.sequence_order,
          content: data.content,
          triggerTimeSeconds: data.trigger_time_seconds,
          processed: false
        };
        
        set(state => ({
          levelNewsEvents: [...state.levelNewsEvents, newEvent]
        }));
      }
    } catch (error) {
      console.error('Error creating news event:', error);
    }
  },
  
  deleteNewsEvent: async (id: string) => {
    try {
      const { error } = await supabase
        .from('level_news_events')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Remove from local state
      set(state => ({
        levelNewsEvents: state.levelNewsEvents.filter(event => event.id !== id)
      }));
    } catch (error) {
      console.error('Error deleting news event:', error);
    }
  },
}));