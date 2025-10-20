import { submitTradeOrders } from '../../_shared/tradeOrders.ts';
import { callAIProviderWithRetry } from '../../_shared/aiProviders.ts';
import { notifyCoordinatorAsync } from '../../_shared/coordinatorNotification.ts';
import { REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { convertExtractedOrdersToPlan } from '../parsers/order-parser.ts';
import { parseRebalancePlan } from '../parsers/rebalance-parser.ts';
import { generateRebalanceAnalysisPrompt, generateRebalanceSystemPrompt, generateReasoningPrompt, generateReasoningSystemPrompt } from '../ai/prompts.ts';
import {
  createTradeOrdersFromActions,
  buildPortfolioSnapshot,
  buildRecommendedPositions
} from './rebalance-logic.ts';
import { RebalanceResponse } from './rebalance-types.ts';

export async function processRebalanceAnalysis(
  targetCashAllocation: number, blockedTickers: string[], allowedTickers: string[],
  pendingOrdersDisplay: string, totalValue: number, availableCash: number,
  allowedCash: number,
  currentCash: number, positions: any[], tickers: string[],
  riskManagerDecisions: Record<string, any>, analyses: any[],
  userSettings: any, apiSettings: any, constraints: any
): Promise<string> {
  const prompt = generateRebalanceAnalysisPrompt(
    targetCashAllocation, blockedTickers, allowedTickers, pendingOrdersDisplay,
    totalValue, availableCash, allowedCash, currentCash, positions, tickers,
    riskManagerDecisions, userSettings, apiSettings, constraints
  );

  const systemPrompt = generateRebalanceSystemPrompt();

  // Use retry logic with fallback to default provider
  const decisionTokens = apiSettings.portfolio_manager_max_tokens || 1500;
  console.log(`📝 Getting rebalance analysis with ${decisionTokens} max tokens (full user-defined limit)`);

  try {
    const aiResponse = await callAIProviderWithRetry(
      apiSettings,
      prompt,
      systemPrompt,
      decisionTokens,
      3 // maxRetries
      // No need for agent-specific field - settings already configured by getAgentSpecificSettings
    );

    console.log(`📝 Decision agent response: ${aiResponse.substring(0, 500)}${aiResponse.length > 500 ? '...' : ''}`);

    // Format the response to ensure each action is on a new line
    const formattedResponse = formatRebalanceDecisions(aiResponse);
    console.log(`📝 Formatted decision response: ${formattedResponse.substring(0, 500)}${formattedResponse.length > 500 ? '...' : ''}`);

    return formattedResponse;
  } catch (error) {
    console.error('❌ Failed to get rebalance analysis from AI:', error);

    // Categorize and re-throw the error with proper type
    let errorType = 'ai_error';
    let errorMessage = error.message || 'Failed to get AI analysis';

    if (error.message?.includes('rate limit') || error.message?.includes('quota') ||
      error.message?.includes('insufficient_quota') || error.message?.includes('429') ||
      error.message?.includes('requires more credits')) {
      errorType = 'rate_limit';
      errorMessage = `AI rate limit/quota exceeded: ${error.message}`;
    } else if (error.message?.includes('API key') || error.message?.includes('Unauthorized')) {
      errorType = 'api_key';
      errorMessage = `AI API key issue: ${error.message}`;
    }

    const categorizedError = new Error(errorMessage);
    categorizedError['errorType'] = errorType;
    throw categorizedError;
  }
}

/**
 * Formats rebalance decisions to ensure each action is on a new line
 * Detects patterns like "1. BUY $X worth TICKER" and ensures proper line breaks
 */
function formatRebalanceDecisions(response: string): string {
  // First, normalize existing line breaks and trim
  let formatted = response.trim();

  // Pattern to match numbered list items with BUY/SELL/HOLD actions
  // Matches patterns like: "1. BUY $15000 worth TSLA" or "2. HOLD AAPL"
  const actionPattern = /(\d+\.\s*(?:BUY|SELL|HOLD)\s+(?:\$[\d,]+\s+worth\s+)?[A-Z]+)/gi;

  // Find all matches
  const matches = formatted.match(actionPattern);

  if (!matches || matches.length === 0) {
    // If no pattern matches, return original
    return formatted;
  }

  // Replace the response with properly formatted lines
  // First, check if actions are already on separate lines
  const lines = formatted.split('\n').filter(line => line.trim());
  const hasProperLineBreaks = lines.length >= matches.length;

  if (hasProperLineBreaks) {
    // Already properly formatted, just ensure consistent spacing
    return lines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
  }

  // Need to add line breaks - replace inline actions with newline-separated ones
  // Start with a clean slate
  let result = formatted;

  // Replace each match, ensuring it starts on a new line
  matches.forEach((match, index) => {
    if (index === 0) {
      // First match - ensure it starts at beginning
      result = result.replace(match, match);
    } else {
      // Subsequent matches - ensure they're on new lines
      // Look for the match that might not have a newline before it
      const regex = new RegExp(`(?<!\\n)\\s*${match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      result = result.replace(regex, '\n' + match);
    }
  });

  // Clean up any extra whitespace and ensure single line breaks
  result = result
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  return result;
}

export async function generateDetailedReasoning(
  portfolioManagerDecision: string,
  targetCashAllocation: number,
  totalValue: number,
  availableCash: number,
  allowedCash: number,
  currentCash: number,
  positions: any[],
  tickers: string[],
  riskManagerDecisions: Record<string, any>,
  userSettings: any,
  apiSettings: any
): Promise<string> {
  const reasoningPrompt = generateReasoningPrompt(
    portfolioManagerDecision, targetCashAllocation, totalValue, availableCash,
    allowedCash, currentCash, positions, tickers, riskManagerDecisions, userSettings
  );

  const systemPrompt = generateReasoningSystemPrompt();

  // Use configured tokens for detailed reasoning
  const reasoningMaxTokens = apiSettings.portfolio_manager_max_tokens || 1500;

  console.log(`📝 Generating detailed reasoning with ${reasoningMaxTokens} max tokens`);

  try {
    return await callAIProviderWithRetry(
      apiSettings,
      reasoningPrompt,
      systemPrompt,
      reasoningMaxTokens,
      3 // maxRetries
      // No need for agent-specific field - settings already configured by getAgentSpecificSettings
    );
  } catch (error) {
    console.error('❌ Failed to generate detailed reasoning:', error);
    // Don't fail the whole process if reasoning fails, but log the error type
    let errorType = 'ai_error';
    if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
      errorType = 'rate_limit';
    } else if (error.message?.includes('API key')) {
      errorType = 'api_key';
    }
    return `Unable to generate detailed reasoning (${errorType}): ${error.message}`;
  }
}

export async function extractOrdersFromResponse(
  aiResponse: string, positions: any[], tickers: string[],
  analyses: any[], totalValue: number, currentCash: number,
  apiSettings: any
): Promise<any> {
  const orders: any[] = [];
  const lines = aiResponse.split('\n');
  
  // Get min position size in dollars
  const minPositionPercent = apiSettings.rebalance_min_position_size || 5;
  const minPositionDollars = (minPositionPercent / 100) * totalValue;
  
  console.log(`📊 Parsing orders with min position size: $${minPositionDollars.toFixed(2)} (${minPositionPercent}% of $${totalValue.toFixed(2)})`);
  
  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) continue;
    
    // Parse format: "1. HOLD TICKER" or "2. SELL $1000 worth TICKER" or "3. BUY $2000 worth TICKER"
    const holdMatch = line.match(/^\d+\.\s*HOLD\s+([A-Z0-9]+(?:\/[A-Z0-9]+)?)/i);
    const tradeMatch = line.match(/^\d+\.\s*(BUY|SELL)\s+\$([0-9,]+)\s+worth\s+([A-Z0-9]+(?:\/[A-Z0-9]+)?)/i);
    
    if (holdMatch) {
      const ticker = holdMatch[1].toUpperCase();
      const position = positions.find(p => p.symbol === ticker);
      
      // Check if HOLD position is below minimum
      if (position && position.market_value > 0 && position.market_value < minPositionDollars) {
        // Check if this is likely a position that was bought at min size but declined
        // If the difference is larger than min_position_size * stop_loss%, it was likely a proper position
        const stopLossPercent = apiSettings.stop_loss || 10; // Default 10% stop loss
        const maxExpectedLoss = minPositionDollars * (stopLossPercent / 100);
        const actualLoss = minPositionDollars - position.market_value;
        
        if (actualLoss <= maxExpectedLoss) {
          // Loss is within expected stop loss range - this was likely a min position that declined
          console.log(`📊 ${ticker}: Position $${position.market_value.toFixed(2)} < min $${minPositionDollars.toFixed(2)}, but loss within ${stopLossPercent}% range - keeping HOLD`);
          orders.push({
            ticker,
            action: 'HOLD',
            dollarAmount: 0,
            shares: 0
          });
        } else {
          // Loss is too large - this is genuinely a small position to close
          console.log(`⚠️ ${ticker}: Position $${position.market_value.toFixed(2)} < min $${minPositionDollars.toFixed(2)} and loss exceeds ${stopLossPercent}% - converting HOLD to SELL`);
          orders.push({
            ticker,
            action: 'SELL',
            dollarAmount: position.market_value,
            shares: 0
          });
        }
      } else {
        orders.push({
          ticker,
          action: 'HOLD',
          dollarAmount: 0,
          shares: 0
        });
      }
    } else if (tradeMatch) {
      const action = tradeMatch[1].toUpperCase();
      let dollarAmount = parseInt(tradeMatch[2].replace(/,/g, ''));
      const ticker = tradeMatch[3].toUpperCase();
      
      if (action === 'SELL') {
        const position = positions.find(p => p.symbol === ticker);
        
        if (position) {
          // Check if this is a partial sell that would leave position below minimum
          if (position.market_value > dollarAmount) {
            const remainingValue = position.market_value - dollarAmount;
            if (remainingValue < minPositionDollars) {
              console.log(`⚠️ ${ticker}: Partial sell would leave $${remainingValue.toFixed(2)} < min $${minPositionDollars.toFixed(2)} - selling entire position`);
              dollarAmount = position.market_value;
            }
          }
        }
      } else if (action === 'BUY') {
        const position = positions.find(p => p.symbol === ticker);
        const currentPositionValue = position?.market_value || 0;
        const resultingPositionValue = currentPositionValue + dollarAmount;
        
        // Check if the resulting position would be below minimum
        if (resultingPositionValue > 0 && resultingPositionValue < minPositionDollars) {
          const adjustedAmount = minPositionDollars - currentPositionValue;
          console.log(`⚠️ ${ticker}: BUY $${dollarAmount} would result in position $${resultingPositionValue.toFixed(2)} < min $${minPositionDollars.toFixed(2)}`);
          console.log(`  → Adjusting BUY amount to $${adjustedAmount.toFixed(2)} to reach minimum position size`);
          dollarAmount = adjustedAmount;
        }
      }
      
      orders.push({
        ticker,
        action: action as 'BUY' | 'SELL',
        dollarAmount,
        shares: 0
      });
    }
  }
  
  console.log(`✅ Successfully parsed ${orders.length} orders directly from response`);
  console.log(`  Orders: ${JSON.stringify(orders.map((o: any) => ({ ticker: o.ticker, action: o.action, amount: o.dollarAmount })))}`);
  
  return { orders };
}

export async function executeRebalanceOrders(
  supabase: any,
  rebalancePlan: any,
  rebalanceRequestId: string,
  tickersWithPendingOrders: Set<string>,
  userId: string,
  positions?: any[]
): Promise<any> {
  try {
    // Create and submit trade orders
    const tradeOrders = createTradeOrdersFromActions(
      rebalancePlan.actions,
      rebalanceRequestId,
      tickersWithPendingOrders,
      positions
    );

    const result = tradeOrders.length > 0
      ? await submitTradeOrders(supabase, tradeOrders, {
        userId,
        sourceType: 'rebalance',
        rebalanceRequestId,
        agent: 'rebalance-portfolio-manager'
      })
      : { success: true, ordersCreated: 0 };

    console.log(`✅ Rebalance complete: ${tradeOrders.length} orders created`);
    return { result, tradeOrders };
  } catch (error) {
    console.error('❌ Failed to execute rebalance orders:', error);

    // Categorize the error
    const categorizedError = new Error(`Trade order submission failed: ${error.message || 'Unknown error'}`);
    categorizedError['errorType'] = 'database'; // Trade orders are database operations
    throw categorizedError;
  }
}

export async function buildRebalanceResponse(
  supabase: any, rebalanceRequestId: string, rebalanceRequest: any,
  combinedResponse: string, rebalancePlan: any, tradeOrders: any[],
  positions: any[], currentCash: number, totalValue: number,
  targetCashAllocation: number, analyses: any[], portfolioData: any,
  result: any, openOrders: any[], userId: string, apiSettings: any
): Promise<Response> {
  const completedAt = new Date().toISOString();
  const portfolio_snapshot = buildPortfolioSnapshot(
    positions, currentCash, totalValue, targetCashAllocation
  );
  const recommendedPositions = buildRecommendedPositions(rebalancePlan.actions);

  const comprehensive_rebalance_plan = {
    portfolio: {
      totalValue,
      cashAvailable: currentCash,
      stockValue: portfolio_snapshot.stockValue,
      targetStockAllocation: 100 - targetCashAllocation,
      targetCashAllocation,
      currentStockAllocation: portfolio_snapshot.currentStockAllocation,
      currentCashAllocation: portfolio_snapshot.currentCashAllocation
    },
    recommendedPositions,
    actions: rebalancePlan.actions,
    summary: rebalancePlan.summary,
    portfolioManagerAnalysis: combinedResponse,
    portfolioManagerInsights: combinedResponse,
    rebalance_agent_insight: combinedResponse,
    tradeOrders: tradeOrders.map(order => ({
      ticker: order.ticker,
      action: order.action,
      confidence: order.confidence,
      shares: order.shares,
      dollarAmount: order.dollarAmount,
      rebalanceRequestId: order.rebalanceRequestId,
      beforePosition: {
        shares: order.beforeShares,
        value: order.beforeValue,
        allocation: order.beforeAllocation
      },
      afterPosition: {
        shares: order.afterShares,
        value: order.afterValue,
        allocation: order.afterAllocation
      },
      changes: {
        shares: order.shareChange,
        value: order.valueChange,
        allocation: order.allocationChange
      },
      reasoning: order.reasoning
    })),
    relatedAnalyses: analyses.map((a: any) => ({
      id: a.id,
      ticker: a.ticker,
      decision: a.decision,
      confidence: a.confidence,
      riskScore: a.riskScore
    })),
    agentInsights: {
      portfolioManager: combinedResponse,
      rebalanceAgent: combinedResponse
    },
    ordersCreated: result.ordersCreated,
    tradeOrdersCount: tradeOrders.length,
    pendingOrdersConsidered: openOrders.length,
    reservedCapital: portfolioData.account.reserved_capital,
    portfolioManagerCompletedAt: completedAt
  };

  // Update rebalance with plan but DON'T mark as completed - coordinator will do that
  await supabase
    .from('rebalance_requests')
    .update({
      // Don't set status to COMPLETED - let coordinator do it after auto-trade check
      rebalance_plan: comprehensive_rebalance_plan,
      plan_generated_at: completedAt,
      portfolio_snapshot: portfolio_snapshot
    })
    .eq('id', rebalanceRequestId);

  console.log(`✅ Rebalance Portfolio Manager completed rebalance: ${rebalanceRequestId}`);

  // Notify coordinator of completion - coordinator will mark as complete after auto-trade check
  notifyCoordinatorAsync(supabase, {
    analysisId: '', // No single analysisId for rebalance
    ticker: '', // No single ticker for rebalance  
    userId,
    phase: 'portfolio',
    agent: 'rebalance-portfolio-manager',
    apiSettings,
    analysisContext: {
      type: 'rebalance',
      rebalanceRequestId
    }
  }, 'Rebalance Portfolio Manager');

  const response: RebalanceResponse = {
    success: true,
    id: rebalanceRequestId,
    status: REBALANCE_STATUS.COMPLETED,
    portfolio_snapshot,
    target_allocations: rebalancePlan.calculatedAllocations || {},
    target_cash_allocation: targetCashAllocation,
    skip_threshold_check: rebalanceRequest.skip_threshold_check,
    skip_opportunity_agent: rebalanceRequest.skip_opportunity_agent,
    auto_execute_enabled: rebalanceRequest.auto_execute_enabled,
    threshold_exceeded: rebalanceRequest.threshold_exceeded,
    rebalance_plan: comprehensive_rebalance_plan,
    recommendedPositions,
    relatedAnalyses: comprehensive_rebalance_plan.relatedAnalyses,
    agentInsights: comprehensive_rebalance_plan.agentInsights,
    ordersCreated: result.ordersCreated,
    ordersExecuted: false,
    created_at: rebalanceRequest.created_at,
    completedAt
  };

  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  });
}
