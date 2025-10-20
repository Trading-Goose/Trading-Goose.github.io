import { updateAnalysisPhase, updateAgentInsights, appendAnalysisMessage, setAgentToError } from '../../_shared/atomicUpdate.ts';
import { callAIProviderWithRetry } from '../../_shared/aiProviders.ts';
import { extractPositionSizing } from '../parsers/position-parser.ts';
import { generateIndividualAnalysisPrompt, generateIndividualSystemPrompt, generateIndividualReasoningPrompt, generateReasoningSystemPrompt } from '../ai/prompts.ts';
import { 
  prepareUserSettings, 
  adjustConfidenceForRiskLevel, 
  validateDecision, 
  formatPendingOrdersInfo,
  normaliseIntent
} from './individual-logic.ts';
import { calculateAllowedCash } from '../../_shared/portfolio/cash-constraints.ts';

/**
 * Rounds a dollar amount to the nearest default position size increment.
 * If the amount is less than default position size but greater than 0,
 * it will be rounded UP to the default position size.
 * For example, if default is $1000:
 * - $300 → $1000 (minimum is default position size)
 * - $1234 → $1000 
 * - $1560 → $2000
 * - $0 → $0
 */
function roundToDefaultPositionSize(amount: number, defaultPositionSize: number | undefined): number {
  if (amount <= 0) return 0;
  
  // If no default position size is set, return the original amount
  if (!defaultPositionSize || defaultPositionSize <= 0) {
    return amount;
  }
  
  // If amount is less than default position size, use the default position size
  if (amount < defaultPositionSize) {
    return defaultPositionSize;
  }
  
  // Otherwise, round to nearest multiple of default position size
  const rounded = Math.round(amount / defaultPositionSize) * defaultPositionSize;
  
  return rounded;
}

/**
 * Reconstructs the decision message based on the final action after all modifications
 * This ensures the displayed decision matches what's actually executed
 */
function reconstructDecisionMessage(action: string, dollarAmount: number, ticker: string): string {
  if (action === 'HOLD') {
    return `HOLD ${ticker}`;
  } else if (action === 'BUY') {
    return `BUY $${Math.round(dollarAmount)} worth ${ticker}`;
  } else if (action === 'SELL') {
    return `SELL $${Math.round(dollarAmount)} worth ${ticker}`;
  }
  return `HOLD ${ticker}`; // Default fallback
}

export async function processAnalysisData(
  supabase: any,
  analysis: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: any,
  portfolioData: any
): Promise<{ success: boolean; data?: any; error?: string; status?: number }> {
  
  await updateAnalysisPhase(supabase, analysisId, 'portfolio', {
    agent: 'Analysis Portfolio Manager',
    message: 'Analyzing portfolio and calculating optimal position',
    timestamp: new Date().toISOString(),
    type: 'info'
  });

  // Extract key data
  const decision = analysis.decision;
  let confidence = analysis.confidence;
  const riskAssessment = analysis.agent_insights?.riskManager?.finalAssessment;

  const analysisContext =
    analysis.full_analysis?.analysisContext ??
    analysis.full_analysis?.analysis_context ??
    analysis.analysisContext ??
    analysis.analysis_context ??
    null;
  
  // Portfolio metrics
  const totalValue = portfolioData.account.portfolio_value;
  const availableCash = portfolioData.account.cash;
  const currentPosition = portfolioData.positions.find((p: any) => p.symbol === ticker);
  
  // Prepare user settings
  const userSettings = await prepareUserSettings(
    supabase, userId, apiSettings, portfolioData
  );

  const targetCashAllocationPercent =
    userSettings.targetCashAllocationPercent ??
    analysis?.analysisContext?.targetAllocations?.cash ??
    analysis?.analysis_context?.targetAllocations?.cash ??
    analysis?.analysisContext?.target_allocations?.cash ??
    analysis?.analysis_context?.target_allocations?.cash ??
    analysis?.targetAllocations?.cash ??
    apiSettings?.target_cash_allocation ??
    portfolioData?.targetAllocations?.cash ??
    20;

  const allowedCash = calculateAllowedCash(
    availableCash,
    totalValue,
    targetCashAllocationPercent
  );

  console.log(`💵 Cash posture: available=$${availableCash.toFixed(2)}, target=${targetCashAllocationPercent}%`);
  console.log(`  → Allowed deployable cash (hard cap): $${allowedCash.toFixed(2)}`);
  
  // Adjust confidence for risk level
  const originalConfidence = confidence;
  confidence = adjustConfidenceForRiskLevel(confidence, userSettings.userRiskLevel);
  
  // Get current price
  const currentPrice = riskAssessment?.currentPrice || 
                      analysis.agent_insights?.marketAnalyst?.data?.price?.current || 
                      analysis.agent_insights?.marketAnalyst?.data?.currentPrice || 0;
  
  // Validate price
  if (currentPrice <= 0 && decision !== 'HOLD') {
    console.error(`❌ No valid current price for ${ticker}`);
    
    await appendAnalysisMessage(
      supabase, analysisId, 'Analysis Portfolio Manager',
      `Unable to calculate position size for ${ticker}: No valid current price available.`,
      'error'
    );
    
    return {
      success: false,
      error: 'No valid current price available',
      status: 400
    };
  }

  // Check pending orders
  console.log(`🔍 Checking open orders for ${ticker}`);
  console.log(`📊 Total open orders from Alpaca: ${portfolioData.openOrders?.length || 0}`);
  
  const pendingOrdersForTicker = portfolioData.openOrders?.filter((o: any) => o.symbol === ticker) || [];
  
  if (pendingOrdersForTicker.length > 0) {
    console.log(`⚠️ Found ${pendingOrdersForTicker.length} pending order(s) for ${ticker}:`);
    pendingOrdersForTicker.forEach((order: any) => {
      console.log(`  - ${order.side.toUpperCase()} ${order.qty || order.notional} @ ${order.limit_price || 'market'} (submitted: ${order.submitted_at})`);
    });
  } else {
    console.log(`✅ No pending orders found for ${ticker}`);
  }
  
  const hasPendingBuy = pendingOrdersForTicker.some((o: any) => o.side === 'buy');
  
  // Validate decision
  console.log(`📋 Original decision from Risk Manager: ${decision}`);
  const { effectiveIntent, tradeDirection, intentWarning, pendingOrderOverride } = validateDecision(
    decision, currentPosition, pendingOrdersForTicker
  );
  console.log(`📋 Effective intent after validation: ${effectiveIntent} (${tradeDirection})`);
  
  // Format pending orders info
  const pendingOrdersInfo = formatPendingOrdersInfo(ticker, pendingOrdersForTicker, hasPendingBuy);
  
  // Generate AI analysis
  const aiAnalysisResult = await generateAIAnalysis(
    ticker, totalValue, availableCash, currentPosition, userSettings,
    decision, effectiveIntent, tradeDirection, confidence, originalConfidence, riskAssessment,
    currentPrice, pendingOrdersInfo, pendingOrdersForTicker, intentWarning,
    pendingOrderOverride, hasPendingBuy, apiSettings, allowedCash, targetCashAllocationPercent
  );
  
  if (!aiAnalysisResult.success) {
    return aiAnalysisResult;
  }
  
  // Handle AI errors
  if (aiAnalysisResult.agentError) {
    console.error('❌ Analysis Portfolio Manager AI error:', aiAnalysisResult.agentError);
    
    // Determine error type
    let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'timeout' | 'other' = 'ai_error';
    const errorMessage = aiAnalysisResult.agentError;
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('quota') || errorMessage.includes('insufficient_quota')) {
      errorType = 'rate_limit';
    } else if (errorMessage.includes('API key') || errorMessage.includes('api_key') || errorMessage.includes('invalid key') || errorMessage.includes('Incorrect API key')) {
      errorType = 'api_key';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      errorType = 'timeout';
    }
    
    // Set agent to error status
    await setAgentToError(
      supabase,
      analysisId,
      'portfolio',
      'Analysis Portfolio Manager',
      errorMessage,
      errorType,
      ticker,
      userId,
      apiSettings
    );
    
    return {
      success: false,
      error: errorMessage,
      errorType: errorType,
      status: 400
    };
  }
  
  // Note: We'll save the response AFTER we've adjusted for constraints and reconstructed the decision

  // Extract position sizing AND the Analysis Portfolio Manager's actual decision
  const positionSizing = await extractPositionSizing(aiAnalysisResult.aiResponse!, {
    totalValue,
    availableCash,
    allowedCash,
    currentPrice,
    currentPosition,  // Add current position for min size validation
    defaultPositionSizeDollars: userSettings.defaultPositionSizeDollars,
    maxPositionSize: userSettings.maxPositionSize,
    userRiskLevel: userSettings.userRiskLevel,
    confidence,
    decision: tradeDirection,
    ticker,
    apiSettings: aiAnalysisResult.pmApiSettings
  }, aiAnalysisResult.pmApiSettings);

  // USE THE PORTFOLIO MANAGER'S DECISION, NOT THE RISK MANAGER'S!
  let portfolioManagerDecision = positionSizing.action || 'HOLD';
  let finalDollarAmount = positionSizing.dollarAmount || 0;
  
  // Get default position size for rounding
  const defaultPositionSize = apiSettings?.default_position_size_dollars;
  
  // Apply rounding to BUY/SELL orders if default position size is set
  if (defaultPositionSize && (portfolioManagerDecision === 'BUY' || portfolioManagerDecision === 'SELL')) {
    const originalAmount = finalDollarAmount;
    finalDollarAmount = roundToDefaultPositionSize(finalDollarAmount, defaultPositionSize);
    if (originalAmount !== finalDollarAmount) {
      console.log(`📊 Rounded ${portfolioManagerDecision} amount: $${originalAmount.toFixed(2)} → $${finalDollarAmount.toFixed(2)}`);
      positionSizing.dollarAmount = finalDollarAmount;
      positionSizing.shares = Math.floor(finalDollarAmount / currentPrice);
      positionSizing.percentOfPortfolio = (finalDollarAmount / totalValue) * 100;
    }
  }
  
  // Check for cash constraints on BUY orders AFTER position sizing adjustments
  if (portfolioManagerDecision === 'BUY') {
    const maxSpend = allowedCash;
    const minPositionPercent = apiSettings?.rebalance_min_position_size || 5;
    const minPositionDollars = (minPositionPercent / 100) * totalValue;

    if (maxSpend <= 0) {
      console.log(`⚠️ Allowed deployable cash is $0 - converting BUY to HOLD to preserve liquidity.`);
      portfolioManagerDecision = 'HOLD';
      finalDollarAmount = 0;
      positionSizing.action = 'HOLD';
      positionSizing.dollarAmount = 0;
      positionSizing.shares = 0;
      positionSizing.percentOfPortfolio = 0;
      positionSizing.reasoning = `Allowed deployable cash is exhausted due to ${targetCashAllocationPercent}% target cash floor.`;
    } else if (finalDollarAmount > maxSpend) {
      console.log(`⚠️ BUY capped by allowed cash: requested $${finalDollarAmount.toFixed(2)}, cap $${maxSpend.toFixed(2)}`);

      if (maxSpend < minPositionDollars) {
        console.log(`⚠️ Allowed cash $${maxSpend.toFixed(2)} < min position $${minPositionDollars.toFixed(2)} - converting BUY to HOLD`);
        portfolioManagerDecision = 'HOLD';
        finalDollarAmount = 0;
        positionSizing.action = 'HOLD';
        positionSizing.dollarAmount = 0;
        positionSizing.shares = 0;
        positionSizing.percentOfPortfolio = 0;
        positionSizing.reasoning = `Allowed cash ($${maxSpend.toFixed(2)}) below minimum position size ($${minPositionDollars.toFixed(2)}) while targeting ${targetCashAllocationPercent}% cash.`;
      } else {
        finalDollarAmount = maxSpend;
        positionSizing.dollarAmount = maxSpend;
        positionSizing.shares = Math.floor(maxSpend / currentPrice);
        positionSizing.percentOfPortfolio = (maxSpend / totalValue) * 100;
        console.log(`📊 Adjusted BUY to allowed cash cap: $${positionSizing.dollarAmount.toFixed(2)}`);
      }
    }

    // Re-run insufficient cash guard if available cash itself is lower than allowed cap (edge cases)
    // Check if we have enough cash for the minimum position size
    if (portfolioManagerDecision === 'BUY' && finalDollarAmount > availableCash) {
      console.log(`⚠️ Insufficient raw cash for BUY order: need $${finalDollarAmount.toFixed(2)}, have $${availableCash.toFixed(2)}`);

      if (availableCash < minPositionDollars) {
        console.log(`⚠️ Available cash $${availableCash.toFixed(2)} < min position $${minPositionDollars.toFixed(2)} - converting BUY to HOLD`);
        portfolioManagerDecision = 'HOLD';
        finalDollarAmount = 0;
        positionSizing.action = 'HOLD';
        positionSizing.dollarAmount = 0;
        positionSizing.shares = 0;
        positionSizing.percentOfPortfolio = 0;
        positionSizing.reasoning = `Insufficient cash available ($${availableCash.toFixed(2)}) for minimum position size ($${minPositionDollars.toFixed(2)})`;
      } else {
        finalDollarAmount = availableCash;
        positionSizing.dollarAmount = availableCash;
        positionSizing.shares = Math.floor(availableCash / currentPrice);
        positionSizing.percentOfPortfolio = (availableCash / totalValue) * 100;
        console.log(`📊 Adjusted BUY to raw cash limit: $${positionSizing.dollarAmount.toFixed(2)}`);
      }
    }
  }
  
  console.log(`🎯 Analysis Portfolio Manager's final decision: ${portfolioManagerDecision} (Risk Manager said: ${decision})`);

  // Now reconstruct the decision message based on the FINAL action (after cash constraints)
  const updatedDecision = reconstructDecisionMessage(portfolioManagerDecision, finalDollarAmount, ticker);
  console.log(`📝 Updated decision to reflect final action: "${updatedDecision}"`);
  
  // Generate NEW reasoning based on the UPDATED decision
  let updatedReasoning = '';
  if (!aiAnalysisResult.agentError) {
    try {
      const reasoningPrompt = generateIndividualReasoningPrompt(
        updatedDecision, // Use the reconstructed decision instead of original AI response
        ticker, totalValue, availableCash, currentPosition,
        userSettings.userRiskLevel, decision, confidence, riskAssessment, currentPrice,
        userSettings.maxPositionSize, allowedCash, targetCashAllocationPercent
      );
      const reasoningSystemPrompt = generateReasoningSystemPrompt();
      const reasoningMaxTokens = apiSettings.portfolio_manager_max_tokens || 1200;
      
      console.log(`📝 Generating updated reasoning based on final decision with ${reasoningMaxTokens} max tokens`);
      updatedReasoning = await callAIProviderWithRetry(aiAnalysisResult.pmApiSettings || apiSettings, reasoningPrompt, reasoningSystemPrompt, reasoningMaxTokens, 3);
    } catch (reasoningError) {
      console.error('❌ Failed to generate updated reasoning:', reasoningError);
      updatedReasoning = positionSizing.reasoning || `Portfolio decision: ${updatedDecision}`;
    }
  }

  // Combine the UPDATED decision with UPDATED reasoning
  const combinedResponse = updatedReasoning 
    ? `${updatedDecision}

---

## Detailed Portfolio Reasoning

${updatedReasoning}`
    : updatedDecision;

  // Update the saved response to use the reconstructed version
  await appendAnalysisMessage(supabase, analysisId, 'Analysis Portfolio Manager', combinedResponse, 'analysis');
  await updateAgentInsights(supabase, analysisId, 'portfolioManager', {
    analysis: combinedResponse,
    timestamp: new Date().toISOString()
  });

  return {
    success: true,
    data: {
      effectiveDecision: portfolioManagerDecision,  // Use Portfolio Manager's decision
      originalDecision: decision,  // Keep Risk Manager's decision for reference
      confidence,
      positionSizing,
      currentPosition,
      currentPrice,
      totalValue,
      availableCash,
      userSettings,
      pendingOrdersForTicker,
      combinedResponse, // Include the updated response
      allowedCash,
      targetCashAllocationPercent,
      analysisContext
    }
  };
}

async function generateAIAnalysis(
  ticker: string, totalValue: number, availableCash: number, currentPosition: any,
  userSettings: any, riskIntent: string, effectiveIntent: string, tradeDirection: 'BUY' | 'SELL' | 'HOLD',
  confidence: number, originalConfidence: number, riskAssessment: any, currentPrice: number,
  pendingOrdersInfo: string, pendingOrdersForTicker: any[], intentWarning: string,
  pendingOrderOverride: string, hasPendingBuy: boolean, apiSettings: any,
  allowedCash: number, targetCashAllocationPercent: number
): Promise<{ success: boolean; aiResponse?: string; combinedResponse?: string; agentError?: string; pmApiSettings?: any }> {
  
  // Prepare AI prompt
  const minPositionSizeDollars = Number(userSettings.minPositionSizeDollars || 0);
  const maxPositionSizeDollars = Number(userSettings.maxPositionSizeDollars || 0);
  const defaultPositionSizeDollars = Number(userSettings.defaultPositionSizeDollars || minPositionSizeDollars || 1000);

  const prompt = generateIndividualAnalysisPrompt(
    ticker, totalValue, availableCash, currentPosition, userSettings.userRiskLevel,
    riskIntent, effectiveIntent, tradeDirection, confidence, originalConfidence, riskAssessment,
    currentPrice, maxPositionSizeDollars, minPositionSizeDollars,
    pendingOrdersInfo, pendingOrdersForTicker,
    intentWarning, pendingOrderOverride, hasPendingBuy, defaultPositionSizeDollars,
    allowedCash, targetCashAllocationPercent,
    userSettings.profitTargetPercent, userSettings.stopLossPercent,
    userSettings.nearLimitThresholdPercent, userSettings.nearPositionThresholdPercent
  );

  const systemPrompt = generateIndividualSystemPrompt();
  
  // The apiSettings already have the correct provider and API key from getAgentSpecificSettings
  // No need to reconfigure - just use them directly
  const pmApiSettings = apiSettings;
  
  // Call AI for decision
  let aiResponse = '';
  let agentError = null;
  
  try {
    const baseTokens = apiSettings.portfolio_manager_max_tokens || 1200;
    const decisionTokens = Math.floor(baseTokens / 2);
    console.log(`📝 Using ${decisionTokens} max tokens for portfolio analysis (1/2 of ${baseTokens})`);
    aiResponse = await callAIProviderWithRetry(pmApiSettings, prompt, systemPrompt, decisionTokens, 3);
  } catch (aiError) {
    console.error('❌ AI provider call failed:', aiError);
    agentError = aiError.message || 'Failed to get AI response';
    aiResponse = `Error: Unable to complete portfolio analysis. ${agentError}`;
  }

  // Generate detailed reasoning in parallel (if no error)
  let detailedReasoning = '';
  if (!agentError) {
    try {
      const reasoningPrompt = generateIndividualReasoningPrompt(
        aiResponse, ticker, totalValue, availableCash, currentPosition,
        userSettings.userRiskLevel, riskIntent, confidence, riskAssessment, currentPrice,
        userSettings.maxPositionSize, allowedCash, targetCashAllocationPercent
      );
      const reasoningSystemPrompt = generateReasoningSystemPrompt();
      const reasoningMaxTokens = apiSettings.portfolio_manager_max_tokens || 1200;
      
      console.log(`📝 Generating detailed reasoning with ${reasoningMaxTokens} max tokens`);
      detailedReasoning = await callAIProviderWithRetry(pmApiSettings, reasoningPrompt, reasoningSystemPrompt, reasoningMaxTokens, 3);
    } catch (reasoningError) {
      console.error('❌ Failed to generate detailed reasoning:', reasoningError);
      detailedReasoning = `Unable to generate detailed reasoning: ${reasoningError.message}`;
    }
  }

  // Combine decision and reasoning
  const combinedResponse = detailedReasoning 
    ? `${aiResponse}

---

## Detailed Portfolio Reasoning

${detailedReasoning}`
    : aiResponse;

  return {
    success: true,
    aiResponse,
    combinedResponse,
    agentError,
    pmApiSettings
  };
}

export async function executeAnalysisDecision(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: any,
  analysisData: any,
  portfolioData: any
): Promise<Response> {
  const {
    effectiveDecision,
    originalDecision,
    confidence,
    positionSizing,
    currentPosition,
    currentPrice,
    totalValue,
    availableCash,
    userSettings,
    pendingOrdersForTicker,
    analysisContext
  } = analysisData;

  const preTradeHasPosition = Boolean(currentPosition && currentPosition.qty > 0 && currentPosition.market_value > 0);
  const tradeDirection = (positionSizing?.action || effectiveDecision || 'HOLD').toUpperCase() as 'BUY' | 'SELL' | 'HOLD';
  const effectiveIntent = tradeDirection === 'BUY'
    ? (preTradeHasPosition ? 'ADD' : 'BUILD')
    : tradeDirection === 'SELL'
      ? (preTradeHasPosition ? 'TRIM' : 'EXIT')
      : 'HOLD';
  const riskIntent = normaliseIntent(originalDecision, preTradeHasPosition);

  // Safety check for pending orders - only block if there REALLY are pending orders
  if (pendingOrdersForTicker && pendingOrdersForTicker.length > 0) {
    console.log(`🚨 SAFETY CHECK: ${ticker} has ${pendingOrdersForTicker.length} pending order(s) - blocking order creation`);
    pendingOrdersForTicker.forEach((order: any) => {
      console.log(`  - ${order.side.toUpperCase()} ${order.qty || order.notional} @ ${order.limit_price || 'market'}`);
    });

    await appendAnalysisMessage(
      supabase, analysisId, 'Analysis Portfolio Manager',
      `SAFETY OVERRIDE: Blocked order creation for ${ticker} due to ${pendingOrdersForTicker.length} existing pending order(s).`,
      'warning'
    );

    // Build HOLD response
    const { buildHoldResponse } = await import('./individual-helpers.ts');
    return buildHoldResponse(
      supabase, analysisId, ticker, effectiveIntent, tradeDirection,
      riskIntent, originalDecision,
      availableCash, currentPosition, totalValue, userSettings.userRiskLevel,
      userId, apiSettings, analysisContext
    );
  } else {
    console.log(`✅ No pending orders blocking ${ticker} - proceeding with order creation`);
  }

  // Execute trade if needed
  const shouldExecuteTrade = 
    (tradeDirection === 'BUY' && positionSizing.dollarAmount > 0) ||
    (tradeDirection === 'SELL' && (positionSizing.dollarAmount > 0 || preTradeHasPosition));

  if (shouldExecuteTrade) {
    const { executeTradeOrder } = await import('./individual-helpers.ts');
    return executeTradeOrder(
      supabase, analysisId, ticker, effectiveIntent, tradeDirection,
      riskIntent, originalDecision,
      positionSizing, confidence, currentPosition, currentPrice,
      totalValue, availableCash, userSettings, userId, apiSettings,
      analysisContext
    );
  }

  // Return HOLD response
  const { buildHoldResponse } = await import('./individual-helpers.ts');
  return buildHoldResponse(
    supabase, analysisId, ticker, effectiveIntent, tradeDirection,
    riskIntent, originalDecision,
    availableCash, currentPosition, totalValue, userSettings.userRiskLevel,
    userId, apiSettings, analysisContext
  );
}
