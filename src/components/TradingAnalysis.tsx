import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, Legend,
  ComposedChart, Area
} from 'recharts';

interface GameAction {
  stock_name: string;
  action: string;
  action_type?: string;  // Add this field for database compatibility
  price: number;
  quantity: number;
  timestamp: string;
  level: number;
  action_time_seconds?: number; // Add this field for tracking seconds since level start
}

interface TradingAnalysisProps {
  actions: GameAction[];
  finalBalance: number;
}

const TradingAnalysis: React.FC<TradingAnalysisProps> = ({ actions, finalBalance }) => {
  // Process the trading data for various charts
  const processedData = useMemo(() => {
    console.log("Raw actions data:", actions);

    if (!actions || actions.length === 0 || !Array.isArray(actions)) {
      console.log("No actions data available or invalid format");
      
      // Create some minimal sample data to show on charts when no real data exists
      const sampleStock = "Sample Stock";
      return {
        actionsByStock: [{name: sampleStock, buy: 0, sell: 0, hold: 0, total: 0}],
        actionsByLevel: [{level: "Level 1", buy: 0, sell: 0, hold: 0, total: 0}],
        tradeTimeline: [{
          timestamp: "00:00:00", 
          fullTimestamp: new Date().toLocaleString(),
          balance: finalBalance,
          action: "hold",
          stock: "Sample Stock",
          price: 0,
          quantity: 0,
          level: 1,
          cost: 0,
          action_time_seconds: 0
        }],
        profitLoss: [{name: sampleStock, investment: 0, revenue: 0, profit: 0, percentReturn: 0}],
        volumeByStock: [{name: sampleStock, buyVolume: 0, sellVolume: 0, totalVolume: 0}],
        tradingPatterns: [],
        priceDistribution: []
      };
    }

    // Be more lenient with validation - accept any action that has at least stock_name
    const validActions = actions.filter(action => 
      action && 
      typeof action === 'object' && 
      action.stock_name // Only require stock_name to be present
    ).map(action => ({
      ...action,
      price: typeof action.price === 'number' ? action.price : parseFloat(String(action.price)) || 0,
      quantity: action.quantity || 1,
      action: action.action || 'hold',
      level: typeof action.level === 'number' ? action.level : 0,
      timestamp: action.timestamp || new Date().toISOString()
    }));

    console.log("Valid actions after filtering:", validActions);

    if (validActions.length === 0) {
      console.log("No valid actions found after filtering");
      // Use the same sample data as above
      const sampleStock = "Sample Stock";
      return {
        actionsByStock: [{name: sampleStock, buy: 0, sell: 0, hold: 0, total: 0}],
        actionsByLevel: [{level: "Level 1", buy: 0, sell: 0, hold: 0, total: 0}],
        tradeTimeline: [{
          timestamp: "00:00:00", 
          fullTimestamp: new Date().toLocaleString(),
          balance: finalBalance,
          action: "hold",
          stock: "Sample Stock",
          price: 0,
          quantity: 0,
          level: 1,
          cost: 0,
          action_time_seconds: 0
        }],
        profitLoss: [{name: sampleStock, investment: 0, revenue: 0, profit: 0, percentReturn: 0}],
        volumeByStock: [{name: sampleStock, buyVolume: 0, sellVolume: 0, totalVolume: 0}],
        tradingPatterns: [],
        priceDistribution: []
      };
    }

    // Sort actions by timestamp
    const sortedActions = [...validActions].sort((a, b) => {
      try {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      } catch (e) {
        return 0;
      }
    });

    // Group actions by stock
    const stockGroups: Record<string, GameAction[]> = {};
    for (const action of sortedActions) {
      if (!stockGroups[action.stock_name]) {
        stockGroups[action.stock_name] = [];
      }
      stockGroups[action.stock_name].push(action);
    }

    // Group actions by level
    const levelGroups: Record<number, GameAction[]> = {};
    for (const action of sortedActions) {
      if (!levelGroups[action.level]) {
        levelGroups[action.level] = [];
      }
      levelGroups[action.level].push(action);
    }

    // Create timeline data with running balance
    let runningBalance = 10000; // Starting balance
    const tradeTimeline = sortedActions.map(action => {
      // Get the normalized action type
      const actionType = action.action_type || action.action || 'hold';
      
      const cost = action.price * action.quantity;
      if (actionType.toLowerCase() === 'buy') {
        runningBalance -= cost;
      } else if (actionType.toLowerCase() === 'sell') {
        runningBalance += cost;
      }

      const date = new Date(action.timestamp);
      return {
        timestamp: date.toLocaleTimeString(),
        fullTimestamp: date.toLocaleString(),
        balance: runningBalance,
        action: actionType,
        stock: action.stock_name,
        price: action.price,
        quantity: action.quantity,
        level: action.level,
        cost,
        action_time_seconds: action.action_time_seconds // Include action_time_seconds in timeline data
      };
    });

    // Calculate stock distribution by trade volume
    const volumeByStock = Object.entries(stockGroups).map(([stock, actions]) => {
      const buyVolume = actions
        .filter(a => {
          const actionType = (a.action_type || a.action || '').toLowerCase();
          return actionType === 'buy';
        })
        .reduce((sum, a) => sum + (a.quantity || 1), 0);
        
      const sellVolume = actions
        .filter(a => {
          const actionType = (a.action_type || a.action || '').toLowerCase();
          return actionType === 'sell';
        })
        .reduce((sum, a) => sum + (a.quantity || 1), 0);
        
      return {
        name: stock,
        buyVolume,
        sellVolume,
        totalVolume: buyVolume + sellVolume,
      };
    }).sort((a, b) => b.totalVolume - a.totalVolume);

    // Actions distribution by level
    const actionsByLevel = Object.entries(levelGroups).map(([level, levelActions]) => {
      // Normalize the actions to ensure we count them correctly
      const buy = levelActions.filter(a => {
        const actionType = (a.action_type || a.action || '').toLowerCase();
        return actionType === 'buy';
      }).length;
      
      const sell = levelActions.filter(a => {
        const actionType = (a.action_type || a.action || '').toLowerCase();
        return actionType === 'sell';
      }).length;
      
      const hold = levelActions.filter(a => {
        const actionType = (a.action_type || a.action || '').toLowerCase();
        return actionType === 'hold' || actionType === '';
      }).length;

      // Add some console logging to debug level data
      console.log(`Level ${level} data:`, { buy, sell, hold, total: levelActions.length });

      return {
        level: `Level ${parseInt(level)}`, // Display level as is, without adding 1
        buy,
        sell,
        hold,
        total: levelActions.length
      };
    }).sort((a, b) => parseInt(a.level.split(' ')[1]) - parseInt(b.level.split(' ')[1]));

    // Count actions by stock and type
    const actionsByStock = Object.entries(stockGroups).map(([stock, stockActions]) => {
      // Add logging for stock actions
      console.log(`Processing actions for stock ${stock}:`, stockActions);
      
      const buy = stockActions.filter(a => {
        const actionType = (a.action_type || a.action || '').toLowerCase();
        return actionType === 'buy';
      }).length;
      
      const sell = stockActions.filter(a => {
        const actionType = (a.action_type || a.action || '').toLowerCase();
        return actionType === 'sell';
      }).length;
      
      const hold = stockActions.filter(a => {
        const actionType = (a.action_type || a.action || '').toLowerCase();
        return actionType === 'hold' || actionType === '';
      }).length;

      console.log(`Stock ${stock} counts:`, { buy, sell, hold, total: stockActions.length });

      return {
        name: stock,
        buy,
        sell,
        hold,
        total: stockActions.length
      };
    }).sort((a, b) => b.total - a.total);

    // Calculate profit/loss by stock
    const profitLoss = Object.entries(stockGroups).map(([stock, stockActions]) => {
      let investment = 0;
      let revenue = 0;

      for (const action of stockActions) {
        const actionType = (action.action_type || action.action || '').toLowerCase();
        const amount = action.price * (action.quantity || 1);
        
        if (actionType === 'buy') {
          investment += amount;
        } else if (actionType === 'sell') {
          revenue += amount;
        }
      }

      const profit = revenue - investment;
      const percentReturn = investment > 0 ? (profit / investment) * 100 : 0;

      return {
        name: stock,
        investment,
        revenue,
        profit,
        percentReturn: parseFloat(percentReturn.toFixed(2)),
      };
    }).sort((a, b) => b.profit - a.profit);

    // Trading patterns (price vs. quantity for each action)
    const tradingPatterns = sortedActions.map(action => {
      // Ensure we handle every type of action
      const actionType = typeof action.action === 'string' 
        ? action.action.toLowerCase() 
        : 'hold';
        
      return {
        price: Number(action.price) || 0,
        quantity: Number(action.quantity) || 1,
        action: actionType,
        stock: action.stock_name || 'Unknown',
        timestamp: new Date(action.timestamp || Date.now()).toLocaleTimeString(),
        level: Number(action.level) || 0 // Removed +1 as levels are already correctly indexed
      };
    });

    // Price distribution analysis
    const priceDistribution = sortedActions.map(action => ({
      price: action.price,
      action: action.action,
      stock: action.stock_name
    }));

    return {
      actionsByStock,
      actionsByLevel,
      tradeTimeline,
      profitLoss,
      volumeByStock,
      tradingPatterns,
      priceDistribution
    };
  }, [actions]);

  // Get statistics
  const stats = useMemo(() => {
    if (!actions || !Array.isArray(actions)) {
      return {
        total: 0,
        buy: 0,
        sell: 0,
        hold: 0,
        totalInvestment: "0.00",
        totalRevenue: "0.00",
        totalProfit: "0.00",
        percentReturn: "0.00"
      };
    }

    const total = actions.length;
    
    // Count buy orders
    const buy = actions.filter(a => {
      if (!a) return false;
      const actionType = (a.action_type || a.action || '').toLowerCase();
      return actionType === 'buy';
    }).length;
    
    // Count sell orders
    const sell = actions.filter(a => {
      if (!a) return false;
      const actionType = (a.action_type || a.action || '').toLowerCase();
      return actionType === 'sell';
    }).length;
    
    // Count hold orders
    const hold = actions.filter(a => {
      if (!a) return false;
      const actionType = (a.action_type || a.action || '').toLowerCase();
      return actionType === 'hold' || actionType === '';
    }).length;
    
    // Calculate total profit/loss with safety checks
    let totalInvestment = 0;
    let totalRevenue = 0;
    
    for (const action of actions) {
      if (!action) continue;
      
      const price = Number(action.price) || 0;
      const quantity = Number(action.quantity) || 1;
      const amount = price * quantity;
      const actionType = (action.action_type || action.action || '').toLowerCase();
      
      if (actionType === 'buy') {
        totalInvestment += amount;
      } else if (actionType === 'sell') {
        totalRevenue += amount;
      }
    }

    const totalProfit = totalRevenue - totalInvestment;
    const percentReturn = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;
    
    return {
      total,
      buy,
      sell,
      hold,
      totalInvestment: totalInvestment.toFixed(2),
      totalRevenue: totalRevenue.toFixed(2),
      totalProfit: totalProfit.toFixed(2),
      percentReturn: percentReturn.toFixed(2)
    };
  }, [actions]);

  // COLORS for charts
  const COLORS = {
    buy: '#10B981', // green
    sell: '#EF4444', // red
    hold: '#F59E0B', // amber
    blue: '#3B82F6',
    purple: '#8B5CF6',
    pink: '#EC4899',
    indigo: '#6366F1',
    profit: '#10B981',
    loss: '#EF4444'
  };

  const PIE_COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444'];

  // Custom tooltip for line chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const actionType = data.action ? data.action.toLowerCase() : 'hold';
      
      return (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-lg">
          <p className="font-medium text-white mb-1">{data.fullTimestamp || ''}</p>
          <p className="text-green-500 font-semibold">₹{(data.balance || 0).toFixed(2)}</p>
          {data.action && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-gray-300">
                <span className={`font-medium ${
                  actionType === 'buy' ? 'text-green-500' : 
                  actionType === 'sell' ? 'text-red-500' : 'text-amber-500'
                }`}>
                  {(data.action || 'HOLD').toUpperCase()}
                </span>
                {' '}{data.quantity || 0} {data.stock || 'Unknown'} at ₹{data.price || 0}
              </p>
              <p className="text-gray-400 text-sm mt-1">Level {data.level || 1}</p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for ScatterChart
  const ScatterTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const actionType = data.action ? data.action.toLowerCase() : 'hold';
      
      return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700">
          <p className="font-medium text-white">{data.stock}</p>
          <p className={`font-semibold ${
            actionType === 'buy' ? 'text-green-500' : 
            actionType === 'sell' ? 'text-red-500' : 'text-amber-500'
          }`}>
            {data.action.toUpperCase()}
          </p>
          <p className="text-gray-300">Price: ₹{data.price}</p>
          <p className="text-gray-300">Quantity: {data.quantity}</p>
          <p className="text-gray-400 text-sm">Level {data.level}</p>
          <p className="text-gray-400 text-sm">{data.timestamp}</p>
        </div>
      );
    }
    return null;
  };

  // If no actions, show placeholder
  if (!actions || actions.length === 0) {
    return (
      <div className="bg-gray-700 p-8 rounded-lg text-center">
        <h3 className="text-lg font-semibold text-white mb-2">
          No Trading Activity
        </h3>
        <p className="text-gray-400">
          No trading actions were recorded for this session. Try playing a new game and make some trades to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top-level statistics */}
      <div className="bg-gray-700 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-4">
          Trading Statistics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400">Total Trades</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400">Buy Orders</p>
            <p className="text-2xl font-bold text-green-500">{stats.buy}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400">Sell Orders</p>
            <p className="text-2xl font-bold text-red-500">{stats.sell}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400">Final Balance</p>
            <p className="text-2xl font-bold text-blue-500">₹{finalBalance.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Balance Timeline Chart */}
      <div className="bg-gray-700 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-4">
          Balance Timeline
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={processedData.tradeTimeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="timestamp" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="balance" 
                fill="rgba(59, 130, 246, 0.2)" 
                stroke="#3B82F6" 
                strokeWidth={2} 
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={false}
                activeDot={{
                  r: 6,
                  fill: '#3B82F6',
                  stroke: 'none'
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trading Patterns (2-row grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trading Patterns - Price vs Quantity */}
        <div className="bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">
            Trading Patterns
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis 
                  type="number" 
                  dataKey="price" 
                  name="Price" 
                  stroke="#9CA3AF" 
                  label={{ value: 'Price (₹)', position: 'insideBottom', offset: -10, fill: '#9CA3AF' }}
                />
                <YAxis 
                  type="number" 
                  dataKey="quantity" 
                  name="Quantity" 
                  stroke="#9CA3AF"
                  label={{ value: 'Quantity', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                />
                <ZAxis range={[60, 60]} />
                <Tooltip content={<ScatterTooltip />} />
                <Legend />
                <Scatter
                  name="Buy Orders"
                  data={processedData.tradingPatterns.filter(d => d.action === 'buy')}
                  fill={COLORS.buy}
                />
                <Scatter
                  name="Sell Orders"
                  data={processedData.tradingPatterns.filter(d => d.action === 'sell')}
                  fill={COLORS.sell}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stock Trading Volume */}
        <div className="bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">
            Stock Trading Volume
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={processedData.volumeByStock}
                layout="vertical"
                margin={{ top: 20, right: 30, left: 80, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" stroke="#9CA3AF" />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="#9CA3AF" 
                  width={80}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip />
                <Legend />
                <Bar dataKey="buyVolume" name="Buy Volume" fill={COLORS.buy} stackId="a" />
                <Bar dataKey="sellVolume" name="Sell Volume" fill={COLORS.sell} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Actions By Level */}
        <div className="bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">
            Actions By Level
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={processedData.actionsByLevel}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="level" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip />
                <Legend />
                <Bar dataKey="buy" name="Buy" fill={COLORS.buy} />
                <Bar dataKey="sell" name="Sell" fill={COLORS.sell} />
                <Bar dataKey="hold" name="Hold" fill={COLORS.hold} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Profit/Loss by Stock */}
        <div className="bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">
            Profit/Loss by Stock
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={processedData.profitLoss}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip />
                <Legend />
                <Bar 
                  dataKey="profit" 
                  name="Profit/Loss (₹)" 
                  fill={COLORS.blue}
                  radius={[4, 4, 0, 0]}
                >
                  {processedData.profitLoss.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.profit >= 0 ? COLORS.profit : COLORS.loss} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Stock Distribution Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-gray-700 p-4 rounded-lg lg:col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4">
            Actions By Stock
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={processedData.actionsByStock}
                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip />
                <Legend />
                <Bar dataKey="buy" name="Buy" fill={COLORS.buy} stackId="a" />
                <Bar dataKey="sell" name="Sell" fill={COLORS.sell} stackId="a" />
                <Bar dataKey="hold" name="Hold" fill={COLORS.hold} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-4">
            Trade Distribution
          </h3>
          <div className="h-[300px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={processedData.volumeByStock}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="totalVolume"
                >
                  {processedData.volumeByStock.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Trade History */}
      <div className="bg-gray-700 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-4">
          Detailed Trade History
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-600">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Time</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Level</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Action</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Stock</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Price (₹)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Quantity</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Total (₹)</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {processedData.tradeTimeline.map((trade, index) => (
                <tr key={index} className="hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                    {trade.action_time_seconds !== undefined 
                      ? `${trade.action_time_seconds}s` 
                      : trade.fullTimestamp}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{trade.level}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      trade.action.toLowerCase() === 'buy' ? 'bg-green-100 text-green-800' : 
                      trade.action.toLowerCase() === 'sell' ? 'bg-red-100 text-red-800' : 
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {trade.action.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{trade.stock}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">₹{trade.price.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{trade.quantity}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">₹{trade.cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TradingAnalysis; 