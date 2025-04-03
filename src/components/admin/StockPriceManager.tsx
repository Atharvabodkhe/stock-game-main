import { useState, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { TrendingUp, Banknote, Clock, Plus, Trash } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface StockPriceManagerProps {
  selectedLevel: number;
}

// New interface for stock price entry
interface StockPriceEntry {
  id: string; // Use a unique ID for each entry
  price: number;
  triggerTime: number;
}

// Interface for database stock entry
interface DBStockEntry {
  id: string;
  level: number;
  stock_name: string;
  price: number;
  trigger_time_seconds: number;
}

const StockPriceManager = ({ selectedLevel }: StockPriceManagerProps) => {
  const { levelStocks, updateStockPrice } = useGameStore();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Changed to store an array of entries per stock
  const [stockPriceEntries, setStockPriceEntries] = useState<{
    [key: string]: StockPriceEntry[]
  }>({});

  // Fetch all entries for the current level directly from the database
  const fetchStockEntries = async (level: number) => {
    setInitialLoading(true);
    try {
      const { data, error } = await supabase
        .from('level_stocks')
        .select('*')
        .eq('level', level)
        .order('stock_name')
        .order('trigger_time_seconds');
        
      if (error) {
        throw error;
      }
      
      if (data) {
        // Group entries by stock name
        const entries: {[key: string]: StockPriceEntry[]} = {};
        
        data.forEach((entry: DBStockEntry) => {
          if (!entries[entry.stock_name]) {
            entries[entry.stock_name] = [];
          }
          
          entries[entry.stock_name].push({
            id: entry.id,
            price: entry.price,
            triggerTime: entry.trigger_time_seconds
          });
        });
        
        // If a stock exists in levelStocks but not in the database entries,
        // create a default entry for it
        const currentLevelStocks = levelStocks.find(ls => ls.level === level);
        if (currentLevelStocks) {
          currentLevelStocks.stocks.forEach(stock => {
            if (!entries[stock.name] || entries[stock.name].length === 0) {
              entries[stock.name] = [{
                id: generateId(),
                price: stock.price,
                triggerTime: stock.triggerTimeSeconds || 120
              }];
            }
          });
        }
        
        setStockPriceEntries(entries);
      }
    } catch (error) {
      console.error('Error fetching stock entries:', error);
      // Fall back to levelStocks data
      const currentLevelStocks = levelStocks.find(ls => ls.level === level);
      if (currentLevelStocks) {
        const initialEntries: {[key: string]: StockPriceEntry[]} = {};
        
        currentLevelStocks.stocks.forEach(stock => {
          initialEntries[stock.name] = [{
            id: generateId(),
            price: stock.price,
            triggerTime: stock.triggerTimeSeconds || 120
          }];
        });
        
        setStockPriceEntries(initialEntries);
      }
    } finally {
      setInitialLoading(false);
    }
  };

  // Initialize stock prices when the component loads or selected level changes
  useEffect(() => {
    fetchStockEntries(selectedLevel);
  }, [levelStocks, selectedLevel]);

  // Helper function to generate a unique ID
  const generateId = () => {
    return Math.random().toString(36).substring(2, 9);
  };

  const handlePriceChange = (stockName: string, entryId: string, newPrice: string) => {
    setStockPriceEntries(prev => {
      const updatedEntries = [...(prev[stockName] || [])];
      const entryIndex = updatedEntries.findIndex(entry => entry.id === entryId);
      
      if (entryIndex >= 0) {
        updatedEntries[entryIndex] = {
          ...updatedEntries[entryIndex],
          price: parseFloat(newPrice) || 0
        };
      }
      
      return {
        ...prev,
        [stockName]: updatedEntries
      };
    });
  };

  const handleTimeChange = (stockName: string, entryId: string, newTime: string) => {
    setStockPriceEntries(prev => {
      const updatedEntries = [...(prev[stockName] || [])];
      const entryIndex = updatedEntries.findIndex(entry => entry.id === entryId);
      
      if (entryIndex >= 0) {
        updatedEntries[entryIndex] = {
          ...updatedEntries[entryIndex],
          triggerTime: parseInt(newTime) || 0
        };
      }
      
      return {
        ...prev,
        [stockName]: updatedEntries
      };
    });
  };

  const handleAddEntry = (stockName: string) => {
    setStockPriceEntries(prev => {
      const currentEntries = [...(prev[stockName] || [])];
      
      return {
        ...prev,
        [stockName]: [
          ...currentEntries,
          {
            id: generateId(),
            price: currentEntries[0]?.price || 0,
            triggerTime: 30 // Default to 30 seconds
          }
        ]
      };
    });
  };

  const handleRemoveEntry = (stockName: string, entryId: string) => {
    setStockPriceEntries(prev => {
      const currentEntries = [...(prev[stockName] || [])];
      
      // Don't remove if it's the only entry
      if (currentEntries.length <= 1) {
        return prev;
      }
      
      return {
        ...prev,
        [stockName]: currentEntries.filter(entry => entry.id !== entryId)
      };
    });
  };

  const handleUpdatePrice = async (stockName: string, entry: StockPriceEntry) => {
    setLoading(true);
    try {
      // Update the stock price and trigger time in the database
      await updateStockPrice(
        stockName, 
        entry.price, 
        selectedLevel, 
        entry.triggerTime,
        entry.id
      );
      
      // Refresh the data after update
      await fetchStockEntries(selectedLevel);
      
      alert(`Updated ${stockName} price to ${entry.price} with trigger time ${entry.triggerTime}s`);
    } catch (error) {
      console.error('Error updating stock price:', error);
      alert('Failed to update stock price');
    } finally {
      setLoading(false);
    }
  };

  // Get the stocks for the selected level
  const stocks = levelStocks.find(ls => ls.level === selectedLevel)?.stocks || [];

  if (initialLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-bold mb-6 flex items-center">
          <TrendingUp className="mr-2" /> Loading Stock Prices...
        </h2>
        <div className="flex justify-center p-8">
          <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 mb-8">
      <h2 className="text-xl font-bold mb-6 flex items-center">
        <TrendingUp className="mr-2" /> Stock Prices for Level {selectedLevel + 1}
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stocks.map(stock => (
          <div key={stock.name} className="bg-gray-700 p-4 rounded-lg">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">{stock.name}</h3>
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white p-1 rounded-full"
                onClick={() => handleAddEntry(stock.name)}
                title="Add another price change"
              >
                <Plus size={16} />
              </button>
            </div>
            
            {stockPriceEntries[stock.name]?.map((entry, index) => (
              <div key={entry.id} className="mb-4 p-3 bg-gray-800 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-400">Change #{index + 1}</span>
                  
                  {stockPriceEntries[stock.name].length > 1 && (
                    <button
                      className="text-red-500 hover:text-red-400"
                      onClick={() => handleRemoveEntry(stock.name, entry.id)}
                      title="Remove this price change"
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </div>
                
                <div className="flex items-center mb-2">
                  <Banknote className="text-green-500 mr-2" size={18} />
                  <div className="flex-grow">
                    <label className="block text-xs text-gray-400 mb-1">Price (₹)</label>
                    <input
                      type="number"
                      className="w-full bg-gray-600 text-white p-2 rounded-md"
                      value={entry.price}
                      onChange={(e) => handlePriceChange(stock.name, entry.id, e.target.value)}
                      step="0.01"
                      min="1"
                    />
                  </div>
                </div>
                
                <div className="flex items-center mb-3">
                  <Clock className="text-blue-500 mr-2" size={18} />
                  <div className="flex-grow">
                    <label className="block text-xs text-gray-400 mb-1">
                      Trigger Time (seconds)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-gray-600 text-white p-2 rounded-md"
                      value={entry.triggerTime}
                      onChange={(e) => handleTimeChange(stock.name, entry.id, e.target.value)}
                      min="1"
                    />
                  </div>
                </div>
                
                <button
                  className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => handleUpdatePrice(stock.name, entry)}
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update'}
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockPriceManager; 