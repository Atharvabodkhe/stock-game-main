// This file implements the GROQ API for generating personality reports
const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface TradingAction {
  action: 'buy' | 'sell' | 'hold';
  stock_name: string;
  price: number;
  quantity: number;
  timestamp: string;
}

interface TradingPatterns {
  repeatedBuys: number;
  repeatedSells: number;
  quickTrades: number;
  sameStockTrades: Record<string, number>;
  priceAnchoring: Array<{
    priceDiff: number;
    action: string;
  }>;
  reversalTrades: number;
  profitableExits: number;
  lossyExits: number;
  timeToDecision: number[];
  confidenceMetrics: {
    largePositions: number;
    quickDecisions: number;
    positionIncreases: number;
  };
}

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
    
    // Analyze trading patterns for biases
    const actionPatterns = analyzeTradingPatterns(actions);
    
    // Prepare data for the API
    const prompt = `
    Analyze the following trading activity and generate a comprehensive bias analysis report:
    
    Trading Patterns:
    ${JSON.stringify(actionPatterns, null, 2)}
    
    Please provide a detailed analysis of the following cognitive biases:
    1. Confirmation Bias: How the trader seeks information that confirms their existing beliefs
    2. Anchoring and Adjustment Bias: How initial price points influence trading decisions
    3. Framing Bias: How the presentation of information affects trading choices
    4. Overconfidence Bias: Signs of excessive confidence in trading decisions
    5. Hindsight Bias: Tendency to view past events as predictable
    
    For each bias:
    - Provide specific examples from the trading pattern
    - Rate the bias strength (Low, Medium, High)
    - Suggest specific improvements
    
    Format the response as a markdown document with clear sections.
    Keep the analysis professional and constructive.
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
            content: 'You are a trading psychology expert specializing in cognitive bias analysis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
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
    return generateLocalBiasAnalysis(actions);
  }
};

// Helper function to analyze trading patterns
const analyzeTradingPatterns = (actions: TradingAction[]): TradingPatterns => {
  const patterns: TradingPatterns = {
    repeatedBuys: 0,
    repeatedSells: 0,
    quickTrades: 0,
    sameStockTrades: {},
    priceAnchoring: [],
    reversalTrades: 0,
    profitableExits: 0,
    lossyExits: 0,
    timeToDecision: [],
    confidenceMetrics: {
      largePositions: 0,
      quickDecisions: 0,
      positionIncreases: 0
    }
  };

  actions.forEach((action, index) => {
    if (index === 0) return;

    const prevAction = actions[index - 1];
    const timeDiff = new Date(action.timestamp).getTime() - new Date(prevAction.timestamp).getTime();

    // Track same-stock trading patterns
    if (action.stock_name) {
      patterns.sameStockTrades[action.stock_name] = (patterns.sameStockTrades[action.stock_name] || 0) + 1;
    }

    // Analyze quick decisions (less than 10 seconds)
    if (timeDiff < 10000) {
      patterns.quickTrades++;
    }

    // Track price anchoring (comparing to previous trades)
    if (action.price && prevAction.price) {
      patterns.priceAnchoring.push({
        priceDiff: action.price - prevAction.price,
        action: action.action
      });
    }

    // Analyze position confidence
    if (action.quantity > 100) {
      patterns.confidenceMetrics.largePositions++;
    }
    if (timeDiff < 5000) {
      patterns.confidenceMetrics.quickDecisions++;
    }
    if (action.action === 'buy' && prevAction.action === 'buy' && action.stock_name === prevAction.stock_name) {
      patterns.confidenceMetrics.positionIncreases++;
    }

    // Track trade reversals
    if (action.action !== prevAction.action) {
      patterns.reversalTrades++;
    }

    // Track profitable vs lossy exits
    if (action.action === 'sell') {
      if (action.price > prevAction.price) {
        patterns.profitableExits++;
    } else {
        patterns.lossyExits++;
      }
    }

    patterns.timeToDecision.push(timeDiff);
  });

  return patterns;
};

// Fallback function for local bias analysis
const generateLocalBiasAnalysis = (actions: any[]) => {
  try {
    const patterns = analyzeTradingPatterns(actions);
    
    // Calculate bias indicators
    const confirmationBias = calculateConfirmationBias(patterns);
    const anchoringBias = calculateAnchoringBias(patterns);
    const framingBias = calculateFramingBias(patterns);
    const overconfidenceBias = calculateOverconfidenceBias(patterns);
    const hindsightBias = calculateHindsightBias(patterns);

    return `
# Trading Bias Analysis

## Confirmation Bias
${confirmationBias}

## Anchoring and Adjustment Bias
${anchoringBias}

## Framing Bias
${framingBias}

## Overconfidence Bias
${overconfidenceBias}

## Hindsight Bias
${hindsightBias}

Note: This analysis is based on observed trading patterns and should be used as a general guide for improvement.
`;
  } catch (error) {
    console.error('Error in local bias analysis:', error);
    return `
# Trading Analysis

We encountered technical difficulties analyzing your trading biases.

Summary:
- Actions analyzed: ${actions.length}
- Analysis completed with limited data

Please consult with a trading professional for more detailed bias analysis.
`;
  }
};

// Helper functions for bias calculations
const calculateConfirmationBias = (patterns: TradingPatterns) => {
  const sameStockFrequency = Object.values(patterns.sameStockTrades)
    .filter((count: any) => count > 3).length;
  
  if (sameStockFrequency > 5) {
    return "Strong confirmation bias detected. You tend to trade repeatedly in the same stocks, possibly seeking information that confirms your existing beliefs. Consider diversifying your analysis sources and challenging your assumptions more frequently.";
  } else if (sameStockFrequency > 2) {
    return "Moderate confirmation bias present. While you show some variety in stock selection, there's a tendency to stick with familiar patterns. Try actively seeking contrary opinions before making trading decisions.";
  }
  return "Low confirmation bias. You demonstrate good variety in your trading choices and appear to consider multiple viewpoints.";
};

const calculateAnchoringBias = (patterns: TradingPatterns) => {
  const anchoringInstances = patterns.priceAnchoring.filter((p: any) => 
    Math.abs(p.priceDiff) < 0.5
  ).length;
  
  if (anchoringInstances > patterns.priceAnchoring.length * 0.7) {
    return "High anchoring bias observed. Your trading decisions appear strongly influenced by initial or previous price points. Practice setting price targets based on multiple factors rather than anchoring to specific price levels.";
  } else if (anchoringInstances > patterns.priceAnchoring.length * 0.4) {
    return "Moderate anchoring bias detected. While you show some flexibility in price targets, there's room for improvement in considering wider price ranges.";
  }
  return "Low anchoring bias. You demonstrate good flexibility in adapting to different price levels.";
};

const calculateFramingBias = (patterns: TradingPatterns) => {
  const quickReversals = patterns.reversalTrades;
  const totalTrades = patterns.timeToDecision.length;
  
  if (quickReversals > totalTrades * 0.4) {
    return "Strong framing bias indicated. Your trading decisions appear highly influenced by how information is presented, leading to frequent position reversals. Work on developing a more consistent trading framework.";
  } else if (quickReversals > totalTrades * 0.2) {
    return "Moderate framing bias present. While you show some consistency, market presentation sometimes leads to reactive decisions.";
  }
  return "Low framing bias. You maintain good consistency in your trading approach regardless of market presentation.";
};

const calculateOverconfidenceBias = (patterns: TradingPatterns) => {
  const { largePositions, quickDecisions, positionIncreases } = patterns.confidenceMetrics;
  const overconfidenceScore = (largePositions + quickDecisions + positionIncreases) / 3;
  
  if (overconfidenceScore > 5) {
    return "High overconfidence bias detected. Your trading shows signs of excessive risk-taking and quick decision-making. Consider implementing more rigorous risk management and decision-making processes.";
  } else if (overconfidenceScore > 2) {
    return "Moderate overconfidence bias present. While you show some caution, there are instances of overly confident trading decisions.";
  }
  return "Low overconfidence bias. You demonstrate good balance between confidence and caution in your trading decisions.";
};

const calculateHindsightBias = (patterns: TradingPatterns) => {
  const profitRatio = patterns.profitableExits / (patterns.profitableExits + patterns.lossyExits);
  
  if (profitRatio > 0.7) {
    return "Potential high hindsight bias. Your high success rate might lead to overestimating the predictability of past trades. Remember that past success doesn't guarantee future results.";
  } else if (profitRatio > 0.5) {
    return "Moderate hindsight bias possible. While you have a good success rate, maintain awareness that market movements are not always predictable.";
  }
  return "Low hindsight bias indicated. Your trading patterns suggest a realistic view of market unpredictability.";
};