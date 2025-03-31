import React, { useState } from 'react';
import { Play, Pause, Check, X, TrendingUp, TrendingDown } from 'lucide-react';
import { Stock, LevelStock, StockPerformance } from './types';

interface StockControlProps {
  stocks: Stock[];
  stockPerformance: StockPerformance[];
  levelStocks: LevelStock[];
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
  updateStockPrice: (stockName: string, price: number, level?: number) => void;
}

const StockControl: React.FC<StockControlProps> = ({
  stocks,
  stockPerformance,
  levelStocks,
  isPaused,
  setPaused,
  updateStockPrice
}) => {
  const [selectedLevel, setSelectedLevel] = useState<number>(0);
  const [editingLevelStock, setEditingLevelStock] = useState<{name: string, level: number} | null>(null);
  const [newLevelStockPrice, setNewLevelStockPrice] = useState<string>('');

  const handleLevelStockPriceUpdate = (stockName: string, level: number) => {
    const price = parseFloat(newLevelStockPrice);
    if (!isNaN(price) && price > 0) {
      updateStockPrice(stockName, price, level);
      setEditingLevelStock(null);
      setNewLevelStockPrice('');
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg mb-8">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Stock Control</h2>
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(parseInt(e.target.value))}
            className="bg-gray-700 text-white px-3 py-2 rounded-lg"
          >
            {levelStocks.map((_, index) => (
              <option key={index} value={index}>Level {index + 1}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPaused(!isPaused)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isPaused ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isPaused ? (
              <>
                <Play size={20} />
                Resume Game
              </>
            ) : (
              <>
                <Pause size={20} />
                Pause Game
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {levelStocks[selectedLevel].stocks.map((stock) => {
          const currentStock = stocks.find(s => s.name === stock.name);
          const performance = stockPerformance.find(p => p.name === stock.name);
          const change = performance?.change || 0;

          return (
            <div key={stock.name} className="bg-gray-700 p-4 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">{stock.name}</h3>
                <div className="flex items-center gap-2">
                  <span className={`text-lg font-bold ${
                    change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-white'
                  }`}>
                    ₹{stock.price.toFixed(2)}
                  </span>
                  {change > 0 ? (
                    <TrendingUp className="text-green-500" size={20} />
                  ) : (
                    <TrendingDown className="text-red-500" size={20} />
                  )}
                </div>
              </div>

              {editingLevelStock?.name === stock.name && editingLevelStock?.level === selectedLevel ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={newLevelStockPrice}
                    onChange={(e) => setNewLevelStockPrice(e.target.value)}
                    className="flex-1 bg-gray-600 text-white px-3 py-1 rounded"
                    placeholder="New price..."
                    min="0.01"
                    step="0.01"
                  />
                  <button
                    onClick={() => handleLevelStockPriceUpdate(stock.name, selectedLevel)}
                    className="text-green-500 hover:text-green-400"
                  >
                    <Check size={20} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingLevelStock(null);
                      setNewLevelStockPrice('');
                    }}
                    className="text-red-500 hover:text-red-400"
                  >
                    <X size={20} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setEditingLevelStock({ name: stock.name, level: selectedLevel });
                    setNewLevelStockPrice(stock.price.toString());
                  }}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
                >
                  Update Level {selectedLevel + 1} Price
                </button>
              )}

              {selectedLevel === 0 && (
                <div className="mt-2 text-sm text-gray-400">
                  Change: <span className={change > 0 ? 'text-green-500' : 'text-red-500'}>
                    {change > 0 ? '+' : ''}{change.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StockControl; 