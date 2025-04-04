// This file implements the GROQ API for generating personality reports
const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface TradingAction {
  action: 'buy' | 'sell' | 'hold';
  stock_name: string;
  price: number;
  quantity: number;
  timestamp: string;
  level?: number;
  action_time_seconds?: number;
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
  levelPatterns?: Record<number, {
    actions: number;
    buys: number;
    sells: number;
    holds: number;
    averageTimeToDecision: number;
    profitableExits: number;
    lossyExits: number;
    reverseDecisions: number;
    stocks: Record<string, number>;
  }>;
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
    
    // Group actions by level for level-specific analysis
    const actionsByLevel: Record<number, any[]> = {};
    actions.forEach(action => {
      const level = action.level || 0;
      if (!actionsByLevel[level]) {
        actionsByLevel[level] = [];
      }
      actionsByLevel[level].push(action);
    });
    
    // Generate level-specific patterns
    const levelSpecificPatterns: Record<number, any> = {};
    Object.entries(actionsByLevel).forEach(([level, levelActions]) => {
      levelSpecificPatterns[Number(level)] = analyzeTradingPatterns(levelActions);
    });
    
    // Prepare data for the API
    const prompt = `
    Analyze the following trading activity and generate a comprehensive bias analysis report using THE EXACT format provided below.
    
    Trading Patterns (Overall):
    ${JSON.stringify(actionPatterns, null, 2)}
    
    Level-Specific Trading Patterns:
    ${JSON.stringify(levelSpecificPatterns, null, 2)}
    
    YOU MUST FOLLOW THIS EXACT FORMAT WITHOUT ANY CHANGES:

    *Comprehensive Bias Analysis Report*

    *Confirmation Bias*
    =====================

    Confirmation bias is the tendency to seek information that confirms existing beliefs, while ignoring contradictory evidence.

    ### Examples from Trading Pattern

    * [Insert specific examples from the trader's patterns]
    * [Insert specific examples from the trader's patterns]

    ### Level-Specific Analysis

    * *Level X:* [Level-specific analysis about confirmation bias]

    ### Bias Strength Rating

    * *Level X:* [Low/Medium/High] ([Brief explanation])

    ### Suggestions for Improvement

    * [Specific suggestion]
    * [Specific suggestion]

    *Anchoring and Adjustment Bias*
    =============================

    Anchoring and adjustment bias occurs when initial price points influence trading decisions, leading to irrational judgments.

    ### Examples from Trading Pattern

    * [Insert specific examples from the trader's patterns]
    * [Insert specific examples from the trader's patterns]

    ### Level-Specific Analysis

    * *Level X:* [Level-specific analysis about anchoring bias]

    ### Bias Strength Rating

    * *Level X:* [Low/Medium/High] ([Brief explanation])

    ### Suggestions for Improvement

    * [Specific suggestion]
    * [Specific suggestion]

    *Framing Bias*
    =============

    Framing bias occurs when the presentation of information affects trading choices, leading to irrational decisions.

    ### Examples from Trading Pattern

    * [Insert specific examples from the trader's patterns]
    * [Insert specific examples from the trader's patterns]

    ### Level-Specific Analysis

    * *Level X:* [Level-specific analysis about framing bias]

    ### Bias Strength Rating

    * *Level X:* [Low/Medium/High] ([Brief explanation])

    ### Suggestions for Improvement

    * [Specific suggestion]
    * [Specific suggestion]

    *Overconfidence Bias*
    =====================

    Overconfidence bias occurs when traders exhibit excessive confidence in their decisions, leading to poor risk management and impulsive trading.

    ### Examples from Trading Pattern

    * [Insert specific examples from the trader's patterns]
    * [Insert specific examples from the trader's patterns]

    ### Level-Specific Analysis

    * *Level X:* [Level-specific analysis about overconfidence bias]

    ### Bias Strength Rating

    * *Level X:* [Low/Medium/High] ([Brief explanation])

    ### Suggestions for Improvement

    * [Specific suggestion]
    * [Specific suggestion]

    *Hindsight Bias*
    ===============

    Hindsight bias occurs when traders view past events as predictable, leading to overconfidence and a lack of learning from experience.

    ### Examples from Trading Pattern

    * [Insert specific examples from the trader's patterns]
    * [Insert specific examples from the trader's patterns]

    ### Level-Specific Analysis

    * *Level X:* [Level-specific analysis about hindsight bias]

    ### Bias Strength Rating

    * *Level X:* [Low/Medium/High] ([Brief explanation])

    ### Suggestions for Improvement

    * [Specific suggestion]
    * [Specific suggestion]

    *Level-Specific Analysis*
    ==========================

    [Summary of how biases manifest across different levels]

    *Changes in Bias Expression Across Levels*
    ---------------------------------------------

    [Analysis of how biases change as the trader progresses through levels]

    *Conclusion*
    ==========

    [Overall summary and key takeaways]
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
            content: 'You are a trading psychology expert specializing in cognitive bias analysis with expertise in behavioral economics and decision science. You MUST follow the exact format provided in the user message. Provide detailed, level-specific analysis of trading behavior.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 3000
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
    },
    levelPatterns: {}
  };

  // Initialize level patterns if there are multiple levels
  const levels = [...new Set(actions.map(a => a.level || 0))];
  levels.forEach(level => {
    patterns.levelPatterns![level] = {
      actions: 0,
      buys: 0,
      sells: 0,
      holds: 0,
      averageTimeToDecision: 0,
      profitableExits: 0,
      lossyExits: 0,
      reverseDecisions: 0,
      stocks: {}
    };
  });

  actions.forEach((action, index) => {
    const level = action.level || 0;
    const levelPattern = patterns.levelPatterns![level];
    
    // Count actions by level
    levelPattern.actions++;
    
    // Count action types by level
    if (action.action === 'buy') levelPattern.buys++;
    if (action.action === 'sell') levelPattern.sells++;
    if (action.action === 'hold') levelPattern.holds++;
    
    // Track stocks traded at this level
    if (action.stock_name) {
      levelPattern.stocks[action.stock_name] = (levelPattern.stocks[action.stock_name] || 0) + 1;
    }

    if (index === 0) return;

    const prevAction = actions[index - 1];
    const timeDiff = new Date(action.timestamp).getTime() - new Date(prevAction.timestamp).getTime();

    // Add time to decision for level metrics
    if (level === (prevAction.level || 0)) {
      // Only count within the same level
      levelPattern.averageTimeToDecision += timeDiff;
    }

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
      
      // Add to level-specific reverse decisions if in same level
      if (level === (prevAction.level || 0)) {
        levelPattern.reverseDecisions++;
      }
    }

    // Track profitable vs lossy exits
    if (action.action === 'sell') {
      if (action.price > prevAction.price) {
        patterns.profitableExits++;
        if (level === (prevAction.level || 0)) {
          levelPattern.profitableExits++;
        }
    } else {
        patterns.lossyExits++;
        if (level === (prevAction.level || 0)) {
          levelPattern.lossyExits++;
        }
      }
    }

    patterns.timeToDecision.push(timeDiff);
  });

  // Calculate average time to decision for each level
  Object.keys(patterns.levelPatterns!).forEach(levelKey => {
    const level = Number(levelKey);
    const levelData = patterns.levelPatterns![level];
    if (levelData.actions > 1) {
      levelData.averageTimeToDecision = levelData.averageTimeToDecision / (levelData.actions - 1);
    }
  });

  return patterns;
};

// Fallback function for local bias analysis
const generateLocalBiasAnalysis = (actions: any[]) => {
  try {
    const patterns = analyzeTradingPatterns(actions);
    
    // Group actions by level
    const actionsByLevel: Record<number, any[]> = {};
    actions.forEach(action => {
      const level = action.level || 0;
      if (!actionsByLevel[level]) {
        actionsByLevel[level] = [];
      }
      actionsByLevel[level].push(action);
    });
    
    // Get list of levels
    const levels = Object.keys(actionsByLevel).map(Number).sort((a, b) => a - b);
    
    // Generate bias ratings with confidence scores
    const confirmationBias = calculateConfirmationBias(patterns);
    const anchoringBias = calculateAnchoringBias(patterns);
    const framingBias = calculateFramingBias(patterns);
    const overconfidenceBias = calculateOverconfidenceBias(patterns);
    const hindsightBias = calculateHindsightBias(patterns);

    // Generate level-specific insights
    const levelInsights = levels.map(level => {
      const levelActions = actionsByLevel[level];
      const levelPatterns = patterns.levelPatterns?.[level];
      
      if (!levelPatterns) return '';
      
      const stockPreference = Object.entries(levelPatterns.stocks)
        .sort(([, a], [, b]) => b - a)
        .map(([stock]) => stock)[0] || 'none';
      
      const buyRatio = levelPatterns.actions > 0 
        ? Math.round((levelPatterns.buys / levelPatterns.actions) * 100) 
        : 0;
        
      const sellRatio = levelPatterns.actions > 0 
        ? Math.round((levelPatterns.sells / levelPatterns.actions) * 100) 
        : 0;
        
      // Determine if trader was more active in this level
      const averageActionsPerLevel = actions.length / levels.length;
      const activityLevel = levelPatterns.actions > averageActionsPerLevel * 1.2 
        ? 'high' 
        : levelPatterns.actions < averageActionsPerLevel * 0.8 
          ? 'low' 
          : 'moderate';
          
      // Determine if trader was more deliberate in this level
      const averageTimeToDecision = levelPatterns.averageTimeToDecision;
      const deliberation = averageTimeToDecision > 15000 
        ? 'careful and deliberate' 
        : averageTimeToDecision < 5000 
          ? 'quick and impulsive' 
          : 'balanced';
      
      return `* *Level ${level}:* The trader demonstrated ${activityLevel} trading activity with a ${deliberation} decision-making style. ${
        levelPatterns.reverseDecisions > 0 
          ? `Changed strategy direction ${levelPatterns.reverseDecisions} times, showing adaptability.` 
          : 'Maintained consistent strategy direction throughout the level.'
      }`;
    }).join('\n');

    return `*Comprehensive Bias Analysis Report*

*Confirmation Bias*
=====================

Confirmation bias is the tendency to seek information that confirms existing beliefs, while ignoring contradictory evidence.

### Examples from Trading Pattern

* ${Object.keys(patterns.sameStockTrades).length > 0 
    ? `The trader has repeated trades on ${Object.keys(patterns.sameStockTrades).join(', ')}, with ${Math.max(...Object.values(patterns.sameStockTrades))} same-stock trades, indicating a potential focus on confirming existing beliefs.` 
    : 'The trader shows good diversity in stock selection, suggesting low confirmation bias.'}
* ${patterns.repeatedBuys > 0 || patterns.repeatedSells > 0 
    ? `The presence of ${patterns.repeatedBuys} repeated buys and ${patterns.repeatedSells} repeated sells may indicate seeking confirmatory information.` 
    : 'The absence of repeated buys or sells suggests that the trader is not re-evaluating their beliefs or considering alternative perspectives.'}

### Level-Specific Analysis

${levelInsights}

### Bias Strength Rating

* *Overall:* ${confirmationBias.rating} (${confirmationBias.analysis.split('.')[0]})

### Suggestions for Improvement

* Encourage seeking out diverse perspectives and contradictory evidence to challenge existing beliefs.
* Implement a "devil's advocate" approach, considering alternative scenarios before making a trade.

*Anchoring and Adjustment Bias*
=============================

Anchoring and adjustment bias occurs when initial price points influence trading decisions, leading to irrational judgments.

### Examples from Trading Pattern

* ${patterns.priceAnchoring.length > 0 
    ? `The price anchoring pattern shows ${patterns.priceAnchoring.length} instances where the trader may be influenced by initial price points.` 
    : 'The trader shows limited evidence of anchoring on specific price points.'}
* ${patterns.confidenceMetrics.positionIncreases > 0 
    ? `The trader increased positions ${patterns.confidenceMetrics.positionIncreases} times, possibly anchoring on their initial investment decision.` 
    : 'The trader shows flexibility in position sizing, suggesting limited anchoring bias.'}

### Level-Specific Analysis

${levelInsights}

### Bias Strength Rating

* *Overall:* ${anchoringBias.rating} (${anchoringBias.analysis.split('.')[0]})

### Suggestions for Improvement

* Consider multiple price perspectives and avoid relying solely on initial price points.
* Implement a "price normalization" approach to adjust decisions based on overall market context.

*Framing Bias*
=============

Framing bias occurs when the presentation of information affects trading choices, leading to irrational decisions.

### Examples from Trading Pattern

* ${patterns.quickTrades > 0 
    ? `The trader made ${patterns.quickTrades} quick trades, suggesting potential influence by how market information is framed.` 
    : 'The trader takes time for decisions, indicating less susceptibility to framing effects.'}
* ${patterns.reversalTrades > 0 
    ? `${patterns.reversalTrades} reversal trades suggest the trader may be influenced by changing presentations of market information.` 
    : 'The trader shows consistency in decision direction, suggesting resistance to framing effects.'}

### Level-Specific Analysis

${levelInsights}

### Bias Strength Rating

* *Overall:* ${framingBias.rating} (${framingBias.analysis.split('.')[0]})

### Suggestions for Improvement

* Focus on objective market data rather than relying on sensationalized headlines.
* Implement a standardized decision framework that remains consistent regardless of information presentation.

*Overconfidence Bias*
=====================

Overconfidence bias occurs when traders exhibit excessive confidence in their decisions, leading to poor risk management and impulsive trading.

### Examples from Trading Pattern

* ${patterns.confidenceMetrics.quickDecisions > 0 
    ? `The trader made ${patterns.confidenceMetrics.quickDecisions} quick decisions, possibly indicating overconfidence in trading abilities.` 
    : 'The trader takes adequate time for decisions, suggesting balanced confidence levels.'}
* ${patterns.confidenceMetrics.largePositions > 0 
    ? `${patterns.confidenceMetrics.largePositions} instances of large position taking may indicate overconfidence in predictions.` 
    : 'The trader shows prudent position sizing, suggesting appropriate confidence calibration.'}

### Level-Specific Analysis

${levelInsights}

### Bias Strength Rating

* *Overall:* ${overconfidenceBias.rating} (${overconfidenceBias.analysis.split('.')[0]})

### Suggestions for Improvement

* Take a more cautious approach, considering multiple scenarios and risk management strategies.
* Implement probabilistic thinking, acknowledging the uncertainty of market outcomes.

*Hindsight Bias*
===============

Hindsight bias occurs when traders view past events as predictable, leading to overconfidence and a lack of learning from experience.

### Examples from Trading Pattern

* ${patterns.profitableExits > 0 
    ? `The trader had ${patterns.profitableExits} profitable exits, which might reinforce hindsight bias if viewed as "obvious" in retrospect.` 
    : 'The trader has limited profitable exits, reducing the risk of hindsight bias.'}
* ${patterns.lossyExits === 0 && patterns.profitableExits > 0 
    ? `The absence of lossy exits combined with profitable trades may strengthen hindsight bias.` 
    : `The trader experienced ${patterns.lossyExits} losing trades, which may help mitigate hindsight bias.`}

### Level-Specific Analysis

${levelInsights}

### Bias Strength Rating

* *Overall:* ${hindsightBias.rating} (${hindsightBias.analysis.split('.')[0]})

### Suggestions for Improvement

* Reflect on past trades acknowledging the role of luck and chance in outcomes.
* Implement post-trade analysis to objectively review decisions regardless of results.

*Level-Specific Analysis*
==========================

The level-specific analysis reveals that the trader's biases ${levels.length > 1 ? 'vary across different levels' : 'are consistent through the level'}, with 
${confirmationBias.rating === 'High' || anchoringBias.rating === 'High' || framingBias.rating === 'High' || overconfidenceBias.rating === 'High' || hindsightBias.rating === 'High' 
  ? `stronger expressions of ${[
      confirmationBias.rating === 'High' ? 'confirmation bias' : '', 
      anchoringBias.rating === 'High' ? 'anchoring bias' : '', 
      framingBias.rating === 'High' ? 'framing bias' : '', 
      overconfidenceBias.rating === 'High' ? 'overconfidence bias' : '', 
      hindsightBias.rating === 'High' ? 'hindsight bias' : ''
    ].filter(bias => bias).join(', ')}` 
  : 'generally well-managed cognitive biases'}.

*Changes in Bias Expression Across Levels*
---------------------------------------------

${levels.length > 1 
  ? 'As the trader progresses through levels, their bias expressions show some changes, which may indicate learning and adaptation.'
  : 'With limited level progression, it is difficult to assess changes in bias expression over time.'}

*Conclusion*
==========

This comprehensive bias analysis highlights the trader's cognitive biases and provides level-specific insights into their decision-making processes. By recognizing and addressing these biases, the trader can improve performance and develop a more robust approach to the markets.

Note: This analysis is based on available trading data. More active trading will provide more accurate insights.`;
  } catch (error) {
    console.error('Error in local bias analysis:', error);
    return '*Comprehensive Bias Analysis Report*\n\nUnable to generate analysis due to an error processing the trading data.';
  }
};

// Helper functions for bias calculations
const calculateConfirmationBias = (patterns: TradingPatterns) => {
  const sameStockFrequency = Object.values(patterns.sameStockTrades)
    .filter((count: any) => count > 3).length;
  
  if (sameStockFrequency > 5) {
    return {
      analysis: "Strong confirmation bias detected. You tend to trade repeatedly in the same stocks, possibly seeking information that confirms your existing beliefs. Consider diversifying your analysis sources and challenging your assumptions more frequently.",
      rating: "High"
    };
  } else if (sameStockFrequency > 2) {
    return {
      analysis: "Moderate confirmation bias present. While you show some variety in stock selection, there's a tendency to stick with familiar patterns. Try actively seeking contrary opinions before making trading decisions.",
      rating: "Moderate"
    };
  }
  return {
    analysis: "Low confirmation bias. You demonstrate good variety in your trading choices and appear to consider multiple viewpoints.",
    rating: "Low"
  };
};

const calculateAnchoringBias = (patterns: TradingPatterns) => {
  const anchoringInstances = patterns.priceAnchoring.filter((p: any) => 
    Math.abs(p.priceDiff) < 0.5
  ).length;
  
  if (anchoringInstances > patterns.priceAnchoring.length * 0.7) {
    return {
      analysis: "High anchoring bias observed. Your trading decisions appear strongly influenced by initial or previous price points. Practice setting price targets based on multiple factors rather than anchoring to specific price levels.",
      rating: "High"
    };
  } else if (anchoringInstances > patterns.priceAnchoring.length * 0.4) {
    return {
      analysis: "Moderate anchoring bias detected. While you show some flexibility in price targets, there's room for improvement in considering wider price ranges.",
      rating: "Moderate"
    };
  }
  return {
    analysis: "Low anchoring bias. You demonstrate good flexibility in adapting to different price levels.",
    rating: "Low"
  };
};

const calculateFramingBias = (patterns: TradingPatterns) => {
  const quickReversals = patterns.reversalTrades;
  const totalTrades = patterns.timeToDecision.length;
  
  if (quickReversals > totalTrades * 0.4) {
    return {
      analysis: "Strong framing bias indicated. Your trading decisions appear highly influenced by how information is presented, leading to frequent position reversals. Work on developing a more consistent trading framework.",
      rating: "High"
    };
  } else if (quickReversals > totalTrades * 0.2) {
    return {
      analysis: "Moderate framing bias present. While you show some consistency, market presentation sometimes leads to reactive decisions.",
      rating: "Moderate"
    };
  }
  return {
    analysis: "Low framing bias. You maintain good consistency in your trading approach regardless of market presentation.",
    rating: "Low"
  };
};

const calculateOverconfidenceBias = (patterns: TradingPatterns) => {
  const { largePositions, quickDecisions, positionIncreases } = patterns.confidenceMetrics;
  const overconfidenceScore = (largePositions + quickDecisions + positionIncreases) / 3;
  
  if (overconfidenceScore > 5) {
    return {
      analysis: "High overconfidence bias detected. Your trading shows signs of excessive risk-taking and quick decision-making. Consider implementing more rigorous risk management and decision-making processes.",
      rating: "High"
    };
  } else if (overconfidenceScore > 2) {
    return {
      analysis: "Moderate overconfidence bias present. While you show some caution, there are instances of overly confident trading decisions.",
      rating: "Moderate"
    };
  }
  return {
    analysis: "Low overconfidence bias. You demonstrate good balance between confidence and caution in your trading decisions.",
    rating: "Low"
  };
};

const calculateHindsightBias = (patterns: TradingPatterns) => {
  const profitRatio = patterns.profitableExits / (patterns.profitableExits + patterns.lossyExits);
  
  if (profitRatio > 0.7) {
    return {
      analysis: "Potential high hindsight bias. Your high success rate might lead to overestimating the predictability of past trades. Remember that past success doesn't guarantee future results.",
      rating: "High"
    };
  } else if (profitRatio > 0.5) {
    return {
      analysis: "Moderate hindsight bias possible. While you have a good success rate, maintain awareness that market movements are not always predictable.",
      rating: "Moderate"
    };
  }
  return {
    analysis: "Low hindsight bias indicated. Your trading patterns suggest a realistic view of market unpredictability.",
    rating: "Low"
  };
};