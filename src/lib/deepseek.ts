// Utility function to analyze trading actions
const generateAnalysis = (actions: any[]) => {
  if (!actions || actions.length === 0) {
    return 'Not enough trading data to generate analysis.';
  }

  try {
    // Normalize the actions to handle potentially invalid data
    const validActions = actions.filter(action => 
      action && 
      typeof action === 'object' && 
      typeof action.action === 'string' && 
      ['buy', 'sell', 'hold'].includes(action.action)
    );

    if (validActions.length === 0) {
      return 'No valid trading actions found to analyze.';
    }
    
    // Count different action types
    const actionSummary = validActions.reduce((acc: any, action: any) => {
      acc[action.action] = (acc[action.action] || 0) + 1;
      return acc;
    }, {});

    const totalActions = validActions.length;
    const buyRatio = actionSummary.buy ? actionSummary.buy / totalActions : 0;
    const sellRatio = actionSummary.sell ? actionSummary.sell / totalActions : 0;
    const holdRatio = actionSummary.hold ? actionSummary.hold / totalActions : 0;

    // Determine the trading style
    let tradingStyle = '';
    if (buyRatio > 0.6) {
      tradingStyle = 'Aggressive Buyer';
    } else if (sellRatio > 0.6) {
      tradingStyle = 'Defensive Seller';
    } else if (holdRatio > 0.6) {
      tradingStyle = 'Patient Observer';
    } else if (buyRatio > sellRatio && buyRatio > holdRatio) {
      tradingStyle = 'Growth-Oriented Investor';
    } else if (sellRatio > buyRatio && sellRatio > holdRatio) {
      tradingStyle = 'Profit-Taking Trader';
    } else if (holdRatio > buyRatio && holdRatio > sellRatio) {
      tradingStyle = 'Long-Term Investor';
    } else {
      tradingStyle = 'Balanced Trader';
    }

    // Calculate volatility response - how the trader reacts to price changes
    let volatilityResponse = 0;
    try {
      const priceChanges = validActions.reduce((acc: any, curr: any, idx: number, arr: any[]) => {
        if (idx === 0 || !curr.price || !arr[idx - 1].price) return acc;
        const priceDiff = Math.abs(curr.price - arr[idx - 1].price);
        return acc + priceDiff;
      }, 0);
      
      if (validActions.length > 1) {
        volatilityResponse = priceChanges / (validActions.length - 1);
      }
    } catch (error) {
      console.error('Error calculating volatility:', error);
      volatilityResponse = 0;
    }

    const riskLevel = volatilityResponse > 10 ? 'High' : volatilityResponse > 5 ? 'Moderate' : 'Conservative';

    // Generate additional insights
    const actionsPerStock = validActions.reduce((acc: any, action: any) => {
      if (action.stock_name) {
        acc[action.stock_name] = (acc[action.stock_name] || 0) + 1;
      }
      return acc;
    }, {});

    const favoriteStock = Object.entries(actionsPerStock)
      .sort((a: any, b: any) => b[1] - a[1])
      .map((entry: any) => entry[0])[0] || 'None';

    // Format the final report with better structure
    return `
# Trading Psychology Analysis

## Trading Activity Summary
- Total Actions: ${totalActions}
- Buy Orders: ${actionSummary.buy || 0} (${Math.round(buyRatio * 100)}%)
- Sell Orders: ${actionSummary.sell || 0} (${Math.round(sellRatio * 100)}%)
- Hold Actions: ${actionSummary.hold || 0} (${Math.round(holdRatio * 100)}%)

## Trading Profile
- Trading Style: ${tradingStyle}
- Risk Tolerance: ${riskLevel}
- Favorite Stock: ${favoriteStock}

## Behavioral Insights
${buyRatio > 0.7 ? "- You tend to be very bullish and eager to enter new positions. This can lead to great gains in bull markets but may increase your exposure to downturns." : ""}
${sellRatio > 0.7 ? "- You demonstrate a cautious approach, preferring to secure profits rather than hold for potential future gains. This reduces risk but may limit upside potential." : ""}
${holdRatio > 0.7 ? "- Your patient approach shows strong conviction in your positions. This can be beneficial for long-term growth but may cause missed opportunities for profit-taking." : ""}
${Math.abs(buyRatio - sellRatio) < 0.1 ? "- You maintain a well-balanced approach between buying and selling, suggesting methodical decision-making." : ""}

## Recommendations
- ${riskLevel === 'High' ? "Consider implementing stop-loss strategies to protect your capital during volatile periods." : riskLevel === 'Moderate' ? "Your balanced approach to risk is reasonable, but establish clear exit criteria for positions." : "While your conservative approach minimizes losses, you might benefit from slightly increasing risk in high-potential situations."}
- ${tradingStyle.includes('Buyer') ? "Develop a more disciplined selling strategy to lock in profits when appropriate." : tradingStyle.includes('Seller') ? "You might benefit from holding promising positions longer to capture more significant upside." : "Continue with your balanced approach, but consider setting clearer position entry and exit criteria."}

Remember that successful trading combines both technical analysis and emotional discipline. Your trading style shows distinct characteristics that can be leveraged to improve your performance.
`;
  } catch (error) {
    console.error('Error in generateAnalysis:', error);
    return `
# Trading Analysis

We encountered some difficulties analyzing your trading pattern in detail. 

Based on the available data, here's what we can tell you:
- You completed the trading simulation
- Your final balance reflects your trading decisions
- Each decision contributed to your overall performance

For more detailed insights, consider playing again and exploring different strategies.
`;
  }
};

export const generatePersonalityReport = async (actions: any[]) => {
  if (!actions || !Array.isArray(actions)) {
    console.log('Invalid actions data:', actions);
    return 'Unable to generate trading analysis due to invalid data.';
  }
  
  if (actions.length === 0) {
    return `
# Trading Analysis

Not enough trading activity recorded to generate a detailed analysis.

Playing the game with more active trading will provide insights into your trading psychology and decision-making patterns.
`;
  }

  try {
    console.log(`Generating report based on ${actions.length} actions`);
    return generateAnalysis(actions);
  } catch (error) {
    console.error('Error generating personality report:', error);
    return `
# Trading Analysis

We encountered technical difficulties generating your detailed trading analysis.

Summary of your activity:
- Actions recorded: ${actions.length}
- Game completed successfully

Thank you for playing! Your final balance reflects the outcome of your trading decisions.
`;
  }
};