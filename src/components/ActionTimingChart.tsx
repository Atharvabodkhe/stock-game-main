import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell
} from 'recharts';

interface GameAction {
  id?: string;
  session_id?: string;
  stock_name: string;
  action?: string;
  action_type?: string;
  price: number;
  quantity: number;
  timestamp: string | Date;
  level?: number;
  action_time_seconds?: number;
}

interface ActionTimingChartProps {
  actions: GameAction[];
}

// Helper function to get action type with fallback
const getActionType = (action: GameAction): string => {
  const actionType = action.action_type || action.action || 'unknown';
  return actionType.toLowerCase();
};

// Colors for different action types
const ACTION_COLORS = {
  buy: '#4CAF50',
  sell: '#F44336',
  hold: '#2196F3',
  unknown: '#9E9E9E'
};

const ActionTimingChart: React.FC<ActionTimingChartProps> = ({ actions }) => {
  // Group actions by time ranges for the histogram
  const timeRangeData = useMemo(() => {
    // Skip if no actions or no timing data
    if (!actions?.length || !actions.some(a => a.action_time_seconds !== undefined)) {
      console.log('No valid action timing data available');
      return [];
    }

    // Create time buckets (every 30 seconds)
    const timeBuckets: Record<string, { 
      timeRange: string, 
      total: number, 
      buy: number, 
      sell: number, 
      hold: number
    }> = {};
    
    // Process all actions with valid timing data
    actions.forEach(action => {
      if (action.action_time_seconds === undefined) return;
      
      // Create a time range bucket (0-30s, 31-60s, etc.)
      const bucketIndex = Math.floor(action.action_time_seconds / 30);
      const bucketStart = bucketIndex * 30;
      const bucketEnd = bucketStart + 29;
      const bucketKey = `${bucketStart}-${bucketEnd}`;
      
      // Initialize bucket if it doesn't exist
      if (!timeBuckets[bucketKey]) {
        timeBuckets[bucketKey] = {
          timeRange: `${bucketStart}-${bucketEnd}s`,
          total: 0,
          buy: 0,
          sell: 0,
          hold: 0
        };
      }
      
      // Increment the appropriate counter
      timeBuckets[bucketKey].total += 1;
      const actionType = getActionType(action);
      
      if (actionType === 'buy') timeBuckets[bucketKey].buy += 1;
      else if (actionType === 'sell') timeBuckets[bucketKey].sell += 1;
      else if (actionType === 'hold') timeBuckets[bucketKey].hold += 1;
    });
    
    // Convert to array and sort by time range
    return Object.values(timeBuckets).sort((a, b) => {
      const aStart = parseInt(a.timeRange.split('-')[0]);
      const bStart = parseInt(b.timeRange.split('-')[0]);
      return aStart - bStart;
    });
  }, [actions]);

  // Prepare scatter plot data to show individual actions over time
  const scatterData = useMemo(() => {
    if (!actions?.length) return [];

    return actions
      .filter(action => action.action_time_seconds !== undefined && action.price !== undefined)
      .map(action => ({
        x: action.action_time_seconds,
        y: action.price,
        z: action.quantity,
        action: getActionType(action),
        stock: action.stock_name,
        time: action.action_time_seconds
      }));
  }, [actions]);

  // If no valid data, show a placeholder
  if (timeRangeData.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-500">No action timing data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-medium mb-2">Trading Actions by Time</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={timeRangeData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timeRange" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="buy" name="Buy" fill={ACTION_COLORS.buy} />
              <Bar dataKey="sell" name="Sell" fill={ACTION_COLORS.sell} />
              <Bar dataKey="hold" name="Hold" fill={ACTION_COLORS.hold} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-2">Action Timing & Price</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="x" 
                name="Time (seconds)" 
                type="number"
                domain={['dataMin', 'dataMax']}
              />
              <YAxis 
                dataKey="y" 
                name="Price" 
                type="number"
              />
              <ZAxis 
                dataKey="z" 
                range={[20, 200]} 
                name="Quantity"
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-2 border rounded shadow-sm">
                        <p className="font-medium">{data.stock}</p>
                        <p className="text-sm">Time: {data.time}s</p>
                        <p className="text-sm capitalize">Action: {data.action}</p>
                        <p className="text-sm">Price: ${data.y.toFixed(2)}</p>
                        <p className="text-sm">Quantity: {data.z}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <Scatter 
                name="Actions" 
                data={scatterData} 
                fill="#8884d8"
              >
                {scatterData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={ACTION_COLORS[entry.action as keyof typeof ACTION_COLORS] || ACTION_COLORS.unknown} 
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ActionTimingChart; 