import { convertExtractedOrdersToPlan } from '../parsers/order-parser.ts';
import { parseRebalancePlan } from '../parsers/rebalance-parser.ts';
import { 
  buildRiskManagerDecisions,
  adjustConfidencesForRiskLevel,
  formatPendingOrdersDisplay,
  filterTickersByPendingOrders
} from './rebalance-logic.ts';
import { getUserSettings, handleNoAnalyses, fetchAnalysesForRebalance, getRebalanceRequestDetails } from './rebalance-helpers.ts';
import { processRebalanceAnalysis, generateDetailedReasoning, extractOrdersFromResponse, executeRebalanceOrders, buildRebalanceResponse } from './rebalance-processor.ts';
import { updateRebalanceWorkflowStep } from '../../_shared/atomicUpdate.ts';
import { REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { calculateAllowedCash } from '../../_shared/portfolio/cash-constraints.ts';


/**
 * Reconstructs the decision message based on the final actions in the rebalance plan.
 * This ensures the decision message accurately reflects any modifications made during processing.
 */
function reconstructDecisionMessage(actions: any[]): string {
  const lines: string[] = [];
  
  // Sort actions by ticker for consistent ordering
  const sortedActions = [...actions].sort((a, b) => a.ticker.localeCompare(b.ticker));
  
  sortedActions.forEach((action, index) => {
    const num = index + 1;
    
    if (action.action === 'HOLD') {
      lines.push(`${num}. HOLD ${action.ticker}`);
    } else if (action.action === 'BUY') {
      lines.push(`${num}. BUY $${Math.round(action.dollarAmount)} worth ${action.ticker}`);
    } else if (action.action === 'SELL') {
      lines.push(`${num}. SELL $${Math.round(action.dollarAmount)} worth ${action.ticker}`);
    }
  });
  
  return lines.join('\n');
}

export async function handleRebalancePortfolio(
  supabase: any,
  rebalanceRequestId: string,
  tickers: string[],
  userId: string,
  apiSettings: any,
  portfolioData: any,
  constraints?: any,
  riskManagerDecisions?: Record<string, any>
): Promise<Response> {
  console.log(`🔄 Processing rebalance request: ${rebalanceRequestId}`);
  
  try {
    // CRITICAL: Check for existing orders first to handle retries gracefully
    console.log(`🔍 Checking for existing orders for rebalance ${rebalanceRequestId}`);
    const { data: existingOrders, error: checkError } = await supabase
      .from('trading_actions')
      .select('ticker, action, dollar_amount')
      .eq('rebalance_request_id', rebalanceRequestId);
    
    if (checkError) {
      console.error('⚠️ Error checking for existing orders:', checkError);
    }
    
    // Fetch analyses
    const analyses = await fetchAnalysesForRebalance(supabase, rebalanceRequestId);
    
    if (!analyses || analyses.length === 0) {
      return handleNoAnalyses(supabase, rebalanceRequestId, portfolioData, userId, apiSettings);
    }
    
    console.log(`✅ Found ${analyses.length} analyses for rebalance`);
    
    // Use analyses to get tickers
    tickers = analyses.map((a: any) => a.ticker);
    console.log(`📋 Processing ${tickers.length} stocks:`, tickers);
    
    // Build risk manager decisions if not provided
    if (!riskManagerDecisions || Object.keys(riskManagerDecisions).length === 0) {
      riskManagerDecisions = buildRiskManagerDecisions(analyses);
    }

    // Get rebalance request details
    const rebalanceRequest = await getRebalanceRequestDetails(supabase, rebalanceRequestId);
    const targetCashAllocation = constraints?.targetCashAllocation || rebalanceRequest.target_cash_allocation || 20;
    
    // Portfolio metrics (get early for user settings)
    const totalValue = portfolioData.account.portfolio_value;
    
    // Get user settings with portfolio value for position size calculation
    const userSettings = await getUserSettings(supabase, userId, apiSettings, constraints, totalValue);
    
    // Adjust confidences for risk level
    adjustConfidencesForRiskLevel(riskManagerDecisions, userSettings.user_risk_level);
    const currentCash = portfolioData.account.cash;
    const availableCash = portfolioData.account.cash;
    const allowedCash = calculateAllowedCash(availableCash, totalValue, targetCashAllocation);
    const positions = portfolioData.positions;
    const openOrders = portfolioData.openOrders || [];

    console.log(`💵 Rebalance cash posture: available=$${availableCash.toFixed(2)}, target=${targetCashAllocation}% → allowed deployable=$${allowedCash.toFixed(2)}`);

    // Filter tickers by pending orders
    const { allowed: allowedTickers, blocked: blockedTickers, tickersWithPendingOrders } = 
      filterTickersByPendingOrders(tickers, openOrders);
    
    const pendingOrdersDisplay = formatPendingOrdersDisplay(
      openOrders, portfolioData.account.reserved_capital
    );
    
    // Check if we have existing orders from a previous attempt
    let aiResponse: string;
    let extractedOrders: any;
    let detailedReasoning: string;
    
    if (existingOrders && existingOrders.length > 0) {
      console.log(`📋 Found ${existingOrders.length} existing orders from previous attempt, using them as decisions`);
      
      // Convert existing orders to decision format
      const ordersMap = new Map(existingOrders.map((o: any) => [o.ticker, o]));
      
      // Build decision text from existing orders and add HOLDs for missing tickers
      const decisions: string[] = [];
      let idx = 1;
      
      // First add all existing orders
      for (const order of existingOrders) {
        if (order.action === 'HOLD') {
          decisions.push(`${idx}. HOLD ${order.ticker}`);
        } else {
          decisions.push(`${idx}. ${order.action} $${order.dollar_amount} worth ${order.ticker}`);
        }
        idx++;
      }
      
      // Add HOLD for any tickers not in existing orders
      for (const ticker of tickers) {
        if (!ordersMap.has(ticker)) {
          decisions.push(`${idx}. HOLD ${ticker}`);
          idx++;
        }
      }
      
      aiResponse = decisions.join('\n');
      console.log(`📝 Reconstructed decision from existing orders:\n${aiResponse}`);
      
      // Create extracted orders object
      extractedOrders = {
        orders: [
          ...existingOrders.map((o: any) => ({
            ticker: o.ticker,
            action: o.action,
            dollarAmount: o.dollar_amount || 0,
            shares: 0
          })),
          ...tickers
            .filter(t => !ordersMap.has(t))
            .map(t => ({
              ticker: t,
              action: 'HOLD',
              dollarAmount: 0,
              shares: 0
            }))
        ]
      };
      
      // Generate reasoning based on the reconstructed decisions
      detailedReasoning = await generateDetailedReasoning(
        aiResponse, targetCashAllocation, totalValue, availableCash, allowedCash, currentCash,
        positions, tickers, riskManagerDecisions, userSettings, apiSettings
      );
      
    } else {
      console.log(`📝 No existing orders found, proceeding with normal AI analysis`);
      
      // Generate AI analysis
      aiResponse = await processRebalanceAnalysis(
        targetCashAllocation, blockedTickers, allowedTickers, pendingOrdersDisplay,
        totalValue, availableCash, allowedCash, currentCash, positions, tickers,
        riskManagerDecisions, analyses, userSettings, apiSettings, constraints
      );
      
      // Extract orders first
      extractedOrders = await extractOrdersFromResponse(aiResponse, positions, tickers, analyses, totalValue, currentCash, apiSettings);
    }
    
    console.log(`🔍 After processing, extractedOrders has ${extractedOrders?.orders?.length} orders`);
    
    // Parse rebalance plan (this will modify orders based on constraints like min position size, available cash, etc.)
    console.log(`📋 Analyses count: ${analyses?.length || 0}, Positions count: ${positions?.length || 0}`);
    console.log(`📋 Extracted orders count: ${extractedOrders?.orders?.length || 0}`);
    
    const rebalancePlan = extractedOrders ? 
      convertExtractedOrdersToPlan(extractedOrders, {
        totalValue, currentCash, availableCash, positions,
        targetCashAllocation, allowedCash, analyses, riskManagerDecisions,
        userRiskLevel: userSettings.user_risk_level,
        apiSettings  // Pass apiSettings for min position size
      }) :
      parseRebalancePlan(aiResponse, {
        totalValue, currentCash, availableCash, positions,
        targetCashAllocation, allowedCash, analyses, riskManagerDecisions,
        userRiskLevel: userSettings.user_risk_level
      });
    
    // Now reconstruct the decision message based on the FINAL actions (after modifications)
    const updatedDecision = reconstructDecisionMessage(rebalancePlan.actions);
    console.log(`📝 Updated decision to reflect final actions (after cash/position constraints)`);
    console.log(`  Original decision length: ${aiResponse?.length || 0} chars`);
    console.log(`  Updated decision length: ${updatedDecision.length} chars`);
    
    // Generate reasoning based on the UPDATED decision
    detailedReasoning = await generateDetailedReasoning(
      updatedDecision, targetCashAllocation, totalValue, availableCash, allowedCash, currentCash,
      positions, tickers, riskManagerDecisions, userSettings, apiSettings
    );
    
    // Combine the UPDATED decision with reasoning
    console.log(`📝 Reasoning response length: ${detailedReasoning?.length || 0} chars`);
    
    const combinedResponse = `${updatedDecision}

---

## Detailed Portfolio Reasoning

${detailedReasoning}`;
    
    console.log(`📝 Combined response length: ${combinedResponse.length} chars`);

    // Execute orders (skip if we're using existing orders)
    let result, tradeOrders;
    if (existingOrders && existingOrders.length > 0) {
      console.log(`📋 Skipping order creation - using ${existingOrders.length} existing orders`);
      result = { success: true, ordersCreated: 0 };
      tradeOrders = [];
    } else {
      const execution = await executeRebalanceOrders(
        supabase, rebalancePlan, rebalanceRequestId, tickersWithPendingOrders, userId, positions
      );
      result = execution.result;
      tradeOrders = execution.tradeOrders;
    }

    // Build and return response
    return buildRebalanceResponse(
      supabase, rebalanceRequestId, rebalanceRequest, combinedResponse,
      rebalancePlan, tradeOrders, positions, currentCash, totalValue,
      targetCashAllocation, analyses, portfolioData, result, openOrders,
      userId, apiSettings
    );
  } catch (error) {
    console.error('❌ Error in handleRebalancePortfolio:', error);
    
    // Determine error type
    let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'other' = 'other';
    let errorMessage = error.message || 'Unknown error in portfolio rebalancing';
    
    // Check if error already has a type
    if (error['errorType']) {
      errorType = error['errorType'];
    } else if (error.message?.includes('rate limit') || error.message?.includes('quota') ||
               error.message?.includes('insufficient_quota') || error.message?.includes('429')) {
      errorType = 'rate_limit';
    } else if (error.message?.includes('API key') || error.message?.includes('Unauthorized')) {
      errorType = 'api_key';
    } else if (error.message?.includes('AI provider') || error.message?.includes('extraction') ||
               error.message?.includes('parse')) {
      errorType = 'ai_error';
    } else if (error.message?.includes('fetch') || error.message?.includes('Alpaca')) {
      errorType = 'data_fetch';
    } else if (error.message?.includes('database') || error.message?.includes('supabase')) {
      errorType = 'database';
    }
    
    // Update workflow step to error
    await updateRebalanceWorkflowStep(
      supabase,
      rebalanceRequestId,
      'portfolio_management',
      'error',
      {
        error: errorMessage,
        errorType: errorType,
        timestamp: new Date().toISOString()
      }
    ).catch((updateError: any) => {
      console.error('Failed to update workflow step:', updateError);
    });
    
    // Update rebalance request status
    await supabase
      .from('rebalance_requests')
      .update({
        status: REBALANCE_STATUS.ERROR,
        completed_at: new Date().toISOString(),
        error_message: `Portfolio rebalancing failed (${errorType}): ${errorMessage}`,
        rebalance_plan: {
          error: errorMessage,
          errorType: errorType,
          timestamp: new Date().toISOString()
        }
      })
      .eq('id', rebalanceRequestId)
      .catch((updateError: any) => {
        console.error('Failed to update rebalance status:', updateError);
      });
    
    // Re-throw to be handled by the main error handler
    throw error;
  }
}
