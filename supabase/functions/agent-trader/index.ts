import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { appendAnalysisMessage, updateAgentInsights, updateWorkflowStepStatus, updateAnalysisPhase, setAgentToError } from '../_shared/atomicUpdate.ts'
import { checkAnalysisCancellation } from '../_shared/cancellationCheck.ts'
import { callAIProviderWithRetry, SYSTEM_PROMPTS } from '../_shared/aiProviders.ts'
import { notifyCoordinatorAsync } from '../_shared/coordinatorNotification.ts'
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts'
import { AgentRequest } from '../_shared/types.ts'

// Extended interface for Trader specific settings
interface TraderRequest extends AgentRequest {
  apiSettings: AgentRequest['apiSettings'] & {
    ai_provider: string;
    ai_api_key: string;
    ai_model?: string;
  };
}

serve(async (req) => {
  let timeoutId: number | null = null;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Method not allowed'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200 // Return 200 so coordinator notifications work
      });
    }

    const request: TraderRequest = await req.json();
    const { analysisId, ticker, userId, apiSettings, analysisContext } = request;

    if (!analysisId || !ticker || !userId || !apiSettings) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameters'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200 // Return 200 so coordinator notifications work
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const retryStatus = getRetryStatus(request);
    console.log(`📈 Trader starting for ${ticker} (${retryStatus})`);
    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      {
        functionName: 'agent-trader',
        maxRetries: 3,
        timeoutMs: 180000,
        retryDelay: 3000   // 3 second delay between retries
      },
      'Trader'
    );

    // Check if analysis has been canceled before starting work
    const cancellationCheck = await checkAnalysisCancellation(supabase, analysisId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 Trader stopped: ${cancellationCheck.reason}`);
      return new Response(JSON.stringify({
        success: false,
        message: `Trader stopped: ${cancellationCheck.reason}`,
        canceled: cancellationCheck.isCanceled
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Check if analysis still exists by trying to update it (deletion check)
    const updateResult = await updateAnalysisPhase(supabase, analysisId, 'Trader analyzing', {
      agent: 'Trader',
      message: 'Starting trading strategy development',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // If analysis phase update fails, it likely means analysis was deleted
    if (!updateResult.success) {
      console.log(`🛑 Trader stopped: ${updateResult.error}`);
      return new Response(JSON.stringify({
        success: false,
        message: `Trader stopped: ${updateResult.error}`,
        canceled: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Get analysis data including research conclusion
    const { data: analysis } = await supabase
      .from('analysis_history')
      .select('agent_insights, full_analysis')
      .eq('id', analysisId)
      .single();

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // Update analysis status
    await updateAnalysisPhase(supabase, analysisId, 'Trader formulating trading strategy', {
      agent: 'Trader',
      message: 'Developing trading strategy and execution plan',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // Extract relevant data
    const researchConclusion = analysis.full_analysis?.researchConclusion || {};
    const marketAnalystInsight = analysis.agent_insights?.marketAnalyst || {};
    const marketData = marketAnalystInsight.data || {};
    const technicalIndicators = marketAnalystInsight.technical_indicators || marketData.indicators || {};
    const currentPrice =
      marketData.currentPrice ??
      marketData.price?.current ??
      marketAnalystInsight.summary?.currentPrice ??
      150;

    // Extract position context from analysisContext
    const positionData = analysisContext?.position;
    const preferences = analysisContext?.preferences;
    const portfolioData = analysisContext?.portfolioData;
    const targetAllocations = analysisContext?.targetAllocations;
    
    // Calculate cash and allocation metrics
    const availableCash = portfolioData?.cash || portfolioData?.account?.cash || 0;
    const totalValue = portfolioData?.totalValue || portfolioData?.account?.portfolio_value || 100000;
    const cashPercentage = ((availableCash / totalValue) * 100).toFixed(1);
    const buyingPower = portfolioData?.account?.buying_power || availableCash;
    
    // Calculate allocation status
    const targetCashPercent = targetAllocations?.cash || 20;
    const targetStockPercent = targetAllocations?.stocks || 80;
    const cashDeviation = parseFloat(cashPercentage) - targetCashPercent;
    const isBelowTargetCash = cashDeviation < 0;
    
    // Build position context for the prompt
    let positionContext = '';
    if (positionData?.stock_in_holdings) {
      const plPercent = positionData.unrealized_pl_percent || 0;
      const profitTarget = preferences?.profit_target || 25;
      const stopLoss = preferences?.stop_loss || 10;
      const positionSize = ((positionData.market_value / totalValue) * 100).toFixed(1);
      const minSize = apiSettings?.rebalance_min_position_size || 5;
      const maxSize = apiSettings?.rebalance_max_position_size || 25;
      
      // Categorize position status relative to targets
      let profitStatus = '';
      let lossStatus = '';
      let positionGuidance = '';
      
      // Categorize profit status
      if (plPercent > 0) {
        if (plPercent >= profitTarget) {
          profitStatus = 'above_profit_target';
          positionGuidance = '⚠️ ABOVE PROFIT TARGET - Position has exceeded the ' + profitTarget + '% profit target. Consider taking profits or using trailing stops to protect gains.';
        } else if (plPercent >= profitTarget * 0.8) {
          profitStatus = 'near_profit_target';
          positionGuidance = '📊 APPROACHING TARGET - Position is at ' + plPercent.toFixed(1) + '%, nearing the ' + profitTarget + '% profit target. Consider partial profit-taking or tightening stops.';
        } else {
          profitStatus = 'below_profit_target';
          positionGuidance = '✅ IN PROFIT - Position is profitable at ' + plPercent.toFixed(1) + '%. Monitor for continued momentum toward ' + profitTarget + '% target.';
        }
      } else if (plPercent < 0) {
        // Categorize loss status
        const absLoss = Math.abs(plPercent);
        if (absLoss >= stopLoss) {
          lossStatus = 'above_stop_loss';
          positionGuidance = '🛑 STOP LOSS EXCEEDED - Position has breached the ' + stopLoss + '% stop loss at ' + plPercent.toFixed(1) + '%. Consider immediate exit or reassess thesis.';
        } else if (absLoss >= stopLoss * 0.8) {
          lossStatus = 'near_stop_loss';
          positionGuidance = '⚠️ APPROACHING STOP - Position at ' + plPercent.toFixed(1) + '% loss, nearing ' + stopLoss + '% stop. Evaluate support levels and exit strategy.';
        } else {
          lossStatus = 'below_stop_loss';
          positionGuidance = '📉 MINOR LOSS - Position down ' + absLoss.toFixed(1) + '%. Monitor for reversal signals or consider averaging down if thesis intact.';
        }
      } else {
        positionGuidance = '➖ BREAKEVEN - Position at breakeven. Assess momentum and market conditions for direction.';
      }
      
      positionContext = `
    CURRENT POSITION:
    - Owns: ${positionData.shares} shares
    - Entry Price: $${positionData.entry_price?.toFixed(2) || 'N/A'}
    - Current Price: $${positionData.current_price?.toFixed(2) || 'N/A'}
    - Unrealized P/L: ${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(1)}% ($${positionData.unrealized_pl?.toFixed(2) || 'N/A'})
    - Position Size: ${positionSize}% of portfolio
    - Portfolio Constraints: Min ${minSize}%, Max ${maxSize}% per position
    - User Targets: ${profitTarget}% profit target, ${stopLoss}% stop loss
    
    POSITION STATUS:
    ${positionGuidance}
    
    PORTFOLIO LIQUIDITY:
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - Buying Power: $${buyingPower.toFixed(2)}
    - Total Portfolio Value: $${totalValue.toFixed(2)}
    - Cash Constraint: Cannot exceed $${availableCash.toFixed(2)} for new purchases
    
    TARGET ALLOCATIONS:
    - Target Cash: ${targetCashPercent}% (Currently: ${cashPercentage}%)
    - Target Stocks: ${targetStockPercent}%
    - Cash Deviation: ${cashDeviation >= 0 ? '+' : ''}${cashDeviation.toFixed(1)}%
    ${isBelowTargetCash ? '⚠️ Below target cash allocation - consider preserving liquidity' : ''}
    
    TRADING IMPLICATIONS:
    - Adjust position size recommendations based on current holding
    - Consider scaling in/out strategies relative to current position
    - Factor P/L into risk management approach
    - BUY orders must not exceed available cash`;
    } else {
      const minSize = apiSettings?.rebalance_min_position_size || 5;
      const maxSize = apiSettings?.rebalance_max_position_size || 25;
      const maxPositionDollars = Math.min(availableCash, (maxSize / 100) * totalValue);
      
      positionContext = `
    CURRENT POSITION:
    - No existing position in ${ticker}
    - Portfolio Constraints: Min ${minSize}%, Max ${maxSize}% per position
    - User Preferences: ${preferences?.profit_target || 25}% profit target, ${preferences?.stop_loss || 10}% stop loss
    
    PORTFOLIO LIQUIDITY:
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - Buying Power: $${buyingPower.toFixed(2)}
    - Total Portfolio Value: $${totalValue.toFixed(2)}
    - Maximum Position Size: $${maxPositionDollars.toFixed(2)} (limited by cash or ${maxSize}% constraint)
    - Cash Constraint: Cannot exceed $${availableCash.toFixed(2)} for new position
    
    TARGET ALLOCATIONS:
    - Target Cash: ${targetCashPercent}% (Currently: ${cashPercentage}%)
    - Target Stocks: ${targetStockPercent}%
    - Cash Deviation: ${cashDeviation >= 0 ? '+' : ''}${cashDeviation.toFixed(1)}%
    ${isBelowTargetCash ? '⚠️ Below target cash allocation - new positions should be sized conservatively' : ''}
    
    TRADING IMPLICATIONS:
    - Initial position sizing should respect min/max constraints
    - Maximum position limited to $${maxPositionDollars.toFixed(2)}
    - Consider phased entry approach if conviction is high
    - Set initial targets based on user preferences
    - BUY orders must not exceed available cash`;
    }

    // Prepare AI prompt
    const prompt = `
    As the Trader for ${ticker}, develop a specific trading strategy based on the research.
    ${positionContext}
    
    Research Conclusion:
    - Recommendation: ${researchConclusion.recommendation}
    - Fair Value: ${researchConclusion.fairValue}
    - Conviction: ${researchConclusion.conviction}/10
    - Time Horizon: ${researchConclusion.timeHorizon}
    - Position Size: ${researchConclusion.positionSize}

    Current Market Data:
    - Price: $${currentPrice}
    - RSI: ${technicalIndicators.rsi || 'N/A'}
    - MACD: ${technicalIndicators.macd || 'N/A'}
    - Volume Trend: ${marketData.volumeTrend || 'N/A'}
    - Support: $${marketData.support || 'N/A'}
    - Resistance: $${marketData.resistance || 'N/A'}

    Develop a comprehensive trading plan including:
    1. Specific entry/adjustment strategy with price levels (considering current position if any)
    2. Position sizing that respects:
       - Portfolio constraints (${apiSettings?.rebalance_min_position_size || 5}%-${apiSettings?.rebalance_max_position_size || 25}% limits)
       - Available cash constraint ($${availableCash.toFixed(2)} maximum)
       - Target cash allocation (maintain ${targetCashPercent}% cash reserve)
    3. Stop loss placement relative to entry price and user's ${preferences?.stop_loss || 10}% preference
    4. Profit targets aligned with user's ${preferences?.profit_target || 25}% target preference
    5. Trade management and scaling approach:
       ${positionData?.stock_in_holdings ? `
       - Current P/L status: ${positionData.unrealized_pl_percent >= 0 ? '+' : ''}${positionData.unrealized_pl_percent.toFixed(1)}%
       - If above profit target: Consider scaling out, trailing stops, or full exit
       - If near profit target: Plan partial profit-taking or stop adjustment
       - If near stop loss: Evaluate thesis validity and exit timing
       - If beyond stop loss: Assess immediate exit vs. recovery potential
       ` : '- Initial position entry and scaling plan'}
    6. Alternative scenarios and contingency plans
    7. Key indicators to monitor for position adjustments
    
    CRITICAL CONSTRAINTS:
    - Never recommend BUY orders exceeding $${availableCash.toFixed(2)}
    - Consider impact on portfolio cash allocation (currently ${cashPercentage}% vs target ${targetCashPercent}%)
    - Ensure recommendations are executable with current liquidity
    8. Exit strategy and conditions (profit-taking and loss-cutting)
    `;

    // Call AI provider
    let aiResponse = '';
    let agentError = null;

    try {
      // Note: Default set to 1200 tokens (standardized across all agents)
      const maxTokens = apiSettings.trading_max_tokens || 1200;
      console.log(`📝 Using ${maxTokens} max tokens for trading analysis`);
      aiResponse = await callAIProviderWithRetry(apiSettings, prompt, SYSTEM_PROMPTS.trader, maxTokens, 3);
    } catch (aiError) {
      console.error('❌ AI provider call failed:', aiError);
      agentError = aiError.message || 'Failed to get AI response';
      // Set a fallback response when AI fails
      aiResponse = `Error: Unable to complete trading analysis due to AI provider error.

Analysis data was collected but trading decision could not be made.

Error details: ${agentError}

Please retry the analysis or check your AI provider settings.`;
    }

    // Calculate trading parameters
    const tradingParams = calculateTradingParameters(currentPrice, researchConclusion, technicalIndicators);

    // Save agent output (even if there was an error)
    const agentOutput = {
      agent: 'Trader',
      timestamp: new Date().toISOString(),
      analysis: aiResponse,
      error: agentError,
      tradingPlan: {
        action: agentError ? 'ERROR' : tradingParams.action,
        entryPrice: agentError ? 0 : tradingParams.entryPrice,
        entryRange: agentError ? { min: 0, max: 0 } : tradingParams.entryRange,
        positionSize: agentError ? 'N/A' : tradingParams.positionSize,
        stopLoss: agentError ? 0 : tradingParams.stopLoss,
        targets: agentError ? [] : tradingParams.targets,
        riskRewardRatio: agentError ? 'N/A' : tradingParams.riskRewardRatio,
        confidence: agentError ? 0 : tradingParams.confidence,
        timeframe: agentError ? 'N/A' : 'swing trade (2-8 weeks)',
        monitoringCriteria: agentError ? ['Error during analysis'] : [
          'Volume above 20-day average',
          'RSI divergence',
          'Break of key support/resistance',
          'Earnings announcement',
          'Sector rotation signals'
        ],
        hasError: !!agentError
      }
    };

    // Update analysis atomically to prevent race conditions
    console.log('💾 Updating analysis results atomically...');

    // Handle agent completion - either success or error
    if (agentError) {
      // Set agent to error status using the new helper function
      const errorResult = await setAgentToError(
        supabase,
        analysisId,
        'trading',
        'Trader',
        agentError,
        agentError.includes('rate limit') || agentError.includes('quota') ? 'rate_limit' :
          agentError.includes('API key') || agentError.includes('invalid key') || agentError.includes('api_key') ? 'api_key' :
            agentError.includes('AI provider') || agentError.includes('No API key provided') ? 'ai_error' : 'other',
        ticker,
        userId,
        apiSettings
      );
      if (!errorResult.success) {
        console.error('Failed to set agent to error:', errorResult.error);
      }
    } else {
      // Update agent insights for successful completion
      const insightsResult = await updateAgentInsights(supabase, analysisId, 'trader', agentOutput);
      if (!insightsResult.success) {
        console.error('Failed to update insights:', insightsResult.error);
      }

      // Append message atomically
      const messageResult = await appendAnalysisMessage(
        supabase,
        analysisId,
        'Trader',
        aiResponse,
        'trading'
      );
      if (!messageResult.success) {
        console.error('Failed to append message:', messageResult.error);
      }
    }

    // Update trading plan in full_analysis
    const { data: current } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();

    await supabase
      .from('analysis_history')
      .update({
        full_analysis: {
          ...current.full_analysis,
          tradingPlan: agentOutput.tradingPlan,
          lastUpdated: new Date().toISOString()
        }
      })
      .eq('id', analysisId);

    // Update workflow step status atomically (only for successful completion)
    if (!agentError) {
      const statusResult = await updateWorkflowStepStatus(
        supabase,
        analysisId,
        'trading',
        'Trader',
        'completed'
      );
      if (!statusResult.success) {
        console.error('Failed to update workflow status:', statusResult.error);
      }
    }

    // Clear timeout on successful completion
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Trader', 'completed successfully');
    }

    console.log('✅ Trader data saved successfully');

    // Notify coordinator that trading phase is complete (include error if any)
    // Trader is the only agent in trading phase, so it's always last_in_phase
    notifyCoordinatorAsync(supabase, {
      analysisId,
      ticker,
      userId,
      phase: 'trading',
      agent: 'trader',
      apiSettings,
      analysisContext, // Pass through the context to coordinator
      completionType: 'last_in_phase', // Trader is the only agent in trading phase
      error: agentError,
      errorType: agentError ? (agentError.includes('rate limit') || agentError.includes('quota') ? 'rate_limit' :
        agentError.includes('API key') || agentError.includes('invalid key') ? 'api_key' :
          agentError.includes('AI provider') ? 'ai_error' : 'other') : undefined
    }, 'Trader');

    console.log(`✅ Trader completed for ${ticker} (${retryStatus})`);

    return new Response(JSON.stringify({
      success: true,
      agent: 'Trader',
      tradingPlan: agentOutput.tradingPlan,
      retryInfo: retryStatus
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Trader', 'error occurred');
    }

    console.error('❌ Trader error:', error);
    console.error('❌ Trader error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200 // Return 200 so coordinator notifications work
    });
  }
});

function calculateTradingParameters(currentPrice: number, researchConclusion: any, indicators: any) {
  // Get recommendation from Research Manager - no defaulting to Hold!
  const recommendation = researchConclusion.recommendation || researchConclusion.rating || '';
  const conviction = researchConclusion.conviction || 5;

  // Base parameters - start with the actual recommendation
  let action = 'HOLD';
  let positionSize = '0%';
  let confidence = 'medium';

  // Determine action based on recommendation
  // Check for Strong Buy/Sell first
  if (recommendation.match(/strong\s*buy/i)) {
    action = 'BUY';
    positionSize = '7-10%'; // Larger position for strong conviction
    confidence = 'high';
  } else if (recommendation.match(/strong\s*sell/i)) {
    action = 'SELL';
    positionSize = '100%'; // Exit full position
    confidence = 'high';
  } else if (recommendation.match(/buy/i) && !recommendation.match(/sell/i)) {
    action = 'BUY';
    positionSize = conviction > 7 ? '5%' : '3%';
    confidence = conviction > 7 ? 'high' : 'medium';
  } else if (recommendation.match(/sell/i) && !recommendation.match(/buy/i)) {
    action = 'SELL';
    positionSize = '100%'; // of existing position
    confidence = conviction > 7 ? 'high' : 'medium';
  } else if (recommendation.match(/hold/i) || recommendation === '') {
    // Only HOLD if explicitly recommended or if no recommendation
    action = 'HOLD';
    positionSize = '0%';
    confidence = 'low';
    console.log('⚠️ Trader: Recommendation is HOLD or unclear, maintaining current position');
  }

  // Calculate entry range
  const entryPrice = currentPrice;
  const entryRange = {
    min: Math.round(currentPrice * 0.98 * 100) / 100,
    max: Math.round(currentPrice * 1.01 * 100) / 100
  };

  // Calculate stop loss (2-3% for high conviction, 3-5% for medium)
  const stopLossPercent = confidence === 'high' ? 0.03 : 0.05;
  const stopLoss = Math.round(currentPrice * (1 - stopLossPercent) * 100) / 100;

  // Calculate targets
  const targets = [
    {
      price: Math.round(currentPrice * 1.05 * 100) / 100,
      allocation: '25%',
      description: 'Initial profit taking'
    },
    {
      price: Math.round(currentPrice * 1.10 * 100) / 100,
      allocation: '50%',
      description: 'Core target'
    },
    {
      price: Math.round(currentPrice * 1.15 * 100) / 100,
      allocation: '25%',
      description: 'Extended target'
    }
  ];

  // Calculate risk/reward
  const risk = currentPrice - stopLoss;
  const reward = targets[1].price - currentPrice;
  const riskRewardRatio = Math.round((reward / risk) * 10) / 10;

  return {
    action,
    entryPrice: `$${entryPrice}`,
    entryRange: `$${entryRange.min} - $${entryRange.max}`,
    positionSize,
    stopLoss: `$${stopLoss}`,
    targets,
    riskRewardRatio: `${riskRewardRatio}:1`,
    confidence
  };
}


// Removed local updateAnalysisPhase - now using atomic version from _shared/atomicUpdate.ts
// Removed local updateWorkflowStepStatus - now using atomic version from _shared/atomicUpdate.ts
