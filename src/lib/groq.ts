// This file implements the GROQ API for generating personality reports
const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
    console.log(`Generating report with GROQ API based on ${actions.length} actions`);
    
    // Count different action types
    const actionSummary = actions.reduce((acc: any, action: any) => {
      if (action && action.action) {
        acc[action.action] = (acc[action.action] || 0) + 1;
      }
      return acc;
    }, {});

    const totalActions = actions.length;
    const buyCount = actionSummary.buy || 0;
    const sellCount = actionSummary.sell || 0;
    const holdCount = actionSummary.hold || 0;
    
    // Prepare data for the API
    const prompt = `
    Analyze the following trading activity and generate a personality report:
    
    Total Actions: ${totalActions}
    Buy Orders: ${buyCount}
    Sell Orders: ${sellCount}
    Hold Actions: ${holdCount}
    
    Please provide a detailed trading psychology analysis including:
    1. Trading style assessment
    2. Risk tolerance evaluation
    3. Behavioral insights
    4. Recommendations for improvement
    
    Format the response as a markdown document with sections.
    `;
    
    // Call the GROQ API
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [
          {
            role: 'system',
            content: 'You are a trading psychology expert who analyzes trading patterns and provides insightful feedback.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('GROQ API error:', errorData);
      throw new Error(`GROQ API error: ${response.status}`);
    }
    
    const data = await response.json();
    const report = data.choices?.[0]?.message?.content;
    
    if (!report) {
      throw new Error('No content in GROQ API response');
    }
    
    return report;
  } catch (error) {
    console.error('Error generating personality report with GROQ:', error);
    
    // Fallback to local analysis if API fails
    return generateLocalAnalysis(actions);
  }
};

// Fallback function for local analysis if the API fails
const generateLocalAnalysis = (actions: any[]) => {
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

    // Format the final report with better structure
    return `
# Trading Psychology Analysis (Local Analysis)

## Trading Activity Summary
- Total Actions: ${totalActions}
- Buy Orders: ${actionSummary.buy || 0} (${Math.round(buyRatio * 100)}%)
- Sell Orders: ${actionSummary.sell || 0} (${Math.round(sellRatio * 100)}%)
- Hold Actions: ${actionSummary.hold || 0} (${Math.round(holdRatio * 100)}%)

## Trading Profile
- Trading Style: ${tradingStyle}

## Behavioral Insights
${buyRatio > 0.7 ? "- You tend to be very bullish and eager to enter new positions." : ""}
${sellRatio > 0.7 ? "- You demonstrate a cautious approach, preferring to secure profits." : ""}
${holdRatio > 0.7 ? "- Your patient approach shows strong conviction in your positions." : ""}
${Math.abs(buyRatio - sellRatio) < 0.1 ? "- You maintain a well-balanced approach between buying and selling." : ""}

Thank you for playing! Your final balance reflects the outcome of your trading decisions.
`;
  } catch (error) {
    console.error('Error in local analysis:', error);
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