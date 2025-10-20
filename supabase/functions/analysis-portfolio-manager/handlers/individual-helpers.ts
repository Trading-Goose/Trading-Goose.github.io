import { updateAnalysisPhase, updateAgentInsights, appendAnalysisMessage, updateWorkflowStepStatus } from '../../_shared/atomicUpdate.ts';
import { submitTradeOrders } from '../../_shared/tradeOrders.ts';
import { createTradeOrder, PortfolioIntent } from './individual-logic.ts';
import { IndividualAnalysisResponse } from './individual-types.ts';
import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';
import { notifyCoordinatorAsync } from '../../_shared/coordinatorNotification.ts';
import { validateSellOrder, adjustTradeOrderForValidation } from '../../_shared/positionManagement.ts';

export async function executeTradeOrder(
  supabase: any,
  analysisId: string,
  ticker: string,
  effectiveIntent: PortfolioIntent,
  tradeDirection: 'BUY' | 'SELL' | 'HOLD',
  riskIntent: PortfolioIntent,
  originalDecision: string,
  positionSizing: any,
  confidence: number,
  currentPosition: any,
  currentPrice: number,
  totalValue: number,
  availableCash: number,
  userSettings: any,
  userId: string,
  apiSettings: any,
  analysisContext?: any
): Promise<Response> {
  // Create trade order
  let tradeOrder = createTradeOrder(
    ticker, effectiveIntent, positionSizing, confidence,
    analysisId, currentPosition, currentPrice, totalValue
  );

  // Validate position sizing for BUY orders
  if (tradeDirection === 'BUY' && (!positionSizing.dollarAmount || positionSizing.dollarAmount <= 0)) {
    console.warn(`⚠️ Invalid position sizing for ${ticker}`);
    
    await appendAnalysisMessage(
      supabase, analysisId, 'Analysis Portfolio Manager',
      `Unable to create BUY order: Invalid position size. Treating as HOLD.`,
      'warning'
    );
    
    return buildHoldResponse(
      supabase, analysisId, ticker, 'HOLD', 'HOLD', riskIntent, originalDecision,
      availableCash, currentPosition, totalValue, userSettings.userRiskLevel,
      userId, apiSettings, analysisContext
    );
  }

  // Validate and adjust SELL orders
  if (tradeDirection === 'SELL' && currentPosition) {
    const validation = validateSellOrder(
      positionSizing.dollarAmount,
      currentPosition.market_value,
      currentPosition.qty,
      ticker
    );
    
    if (!validation.isValid) {
      console.warn(`⚠️ Invalid SELL order for ${ticker}: ${validation.message}`);
      
      await appendAnalysisMessage(
        supabase, analysisId, 'Analysis Portfolio Manager',
        validation.message,
        'warning'
      );
      
      return buildHoldResponse(
        supabase, analysisId, ticker, 'HOLD', 'HOLD', riskIntent, originalDecision,
        availableCash, currentPosition, totalValue, userSettings.userRiskLevel,
        userId, apiSettings, analysisContext
      );
    }
    
    // Adjust the trade order based on validation
    tradeOrder = adjustTradeOrderForValidation(tradeOrder, validation);
    
    // Log the adjustment
    if (validation.shouldClosePosition) {
      await appendAnalysisMessage(
        supabase, analysisId, 'Analysis Portfolio Manager',
        `Adjusted SELL order: ${validation.message}`,
        'info'
      );
    }
    
    console.log(`💰 Order type: ${validation.adjustedOrderType === 'shares' ? 
      `Share-based (${tradeOrder.shares} shares)` : 
      `Dollar-based ($${tradeOrder.dollarAmount?.toFixed(2)})`}`);
  } else if (tradeDirection === 'BUY') {
    // For BUY orders, always use dollar-based orders for fractional share support
    tradeOrder.dollarAmount = positionSizing.dollarAmount;
    tradeOrder.shares = 0;
    console.log(`💰 Order type: Dollar-based ($${tradeOrder.dollarAmount?.toFixed(2)})`);
  }

  // Submit trade order
  const result = await submitTradeOrders(supabase, tradeOrder, {
    userId,
    sourceType: 'individual_analysis',
    agent: 'analysis-portfolio-manager'
  });

  // Update agent insights
  await updatePortfolioManagerInsights(
    supabase, analysisId, effectiveIntent, tradeDirection, originalDecision,
    positionSizing, tradeOrder, totalValue, availableCash,
    currentPosition, userSettings.userRiskLevel, result
  );

  console.log(`✅ Analysis Portfolio Manager completed: ${effectiveIntent} (${tradeDirection}) ${ticker}`);
  
  // Update workflow status
  await updateWorkflowStepStatus(supabase, analysisId, 'portfolio', 'Analysis Portfolio Manager', 'completed');
  
  // Notify coordinator of completion - coordinator will mark as complete after auto-trade check
  notifyCoordinatorAsync(supabase, {
    action: 'agent-completion',
    analysisId,
    ticker,
    userId,
    phase: 'portfolio',
    agent: 'analysis-portfolio-manager',
    apiSettings,
    analysisContext,
    completionType: 'last_in_phase'
  }, 'Analysis Portfolio Manager');

  console.log('✅ Analysis Portfolio Manager completed - notifying coordinator');

  // Build response
  const response: IndividualAnalysisResponse = {
    success: true,
    analysis_id: analysisId,
    ticker,
    decision: tradeDirection,
    tradeDirection,
    originalDecision,
    portfolio_snapshot: {
      cash: availableCash,
      positions: currentPosition ? [{
        ticker,
        shares: currentPosition.qty,
        avgCost: currentPosition.avg_entry_price,
        currentPrice: currentPosition.current_price,
        value: currentPosition.market_value
      }] : [],
      totalValue,
      availableCash
    },
    positionSizing,
    tradeOrder: {
      ticker: tradeOrder.ticker,
      action: tradeOrder.action,
      confidence: tradeOrder.confidence,
      shares: tradeOrder.shares || 0,
      dollar_amount: tradeOrder.dollarAmount || 0,
      analysis_id: tradeOrder.analysisId || '',
      beforePosition: {
        shares: tradeOrder.beforeShares || 0,
        value: tradeOrder.beforeValue || 0,
        allocation: tradeOrder.beforeAllocation || 0
      },
      afterPosition: {
        shares: tradeOrder.afterShares || 0,
        value: tradeOrder.afterValue || 0,
        allocation: tradeOrder.afterAllocation || 0
      },
      changes: {
        shares: tradeOrder.shareChange || 0,
        value: tradeOrder.valueChange || 0,
        allocation: tradeOrder.allocationChange || 0
      },
      reasoning: tradeOrder.reasoning
    },
    orderSubmitted: result.success,
    ordersCreated: result.ordersCreated,
    auto_executed: false,
    created_at: new Date().toISOString()
  };
  
  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function buildHoldResponse(
  supabase: any,
  analysisId: string,
  ticker: string,
  effectiveIntent: PortfolioIntent,
  tradeDirection: 'BUY' | 'SELL' | 'HOLD',
  riskIntent: PortfolioIntent,
  originalDecision: string,
  availableCash: number,
  currentPosition: any,
  totalValue: number,
  userRiskLevel: string,
  userId: string,
  apiSettings: any,
  analysisContext?: any
): Promise<Response> {
  // Update workflow status
  await updateWorkflowStepStatus(supabase, analysisId, 'portfolio', 'Analysis Portfolio Manager', 'completed');
  
  // Don't mark as complete - coordinator will do this after auto-trade check
  
  // Save HOLD message
  const holdMessage = (riskIntent === 'TRIM' || riskIntent === 'EXIT') && !currentPosition
    ? `Risk Manager recommended ${riskIntent} but no position exists for ${ticker}. No action taken.`
    : `Decision: ${effectiveIntent} (${tradeDirection}) - No position adjustment needed.`;
    
  await appendAnalysisMessage(supabase, analysisId, 'Analysis Portfolio Manager', holdMessage, 'decision');
  
  // Update agent insights for HOLD
  const { data: currentInsights } = await supabase
    .from('analysis_history')
    .select('agent_insights')
    .eq('id', analysisId)
    .single();
  
  const existingPortfolioManagerInsight = currentInsights?.agent_insights?.portfolioManager || {};
  
  await updateAgentInsights(supabase, analysisId, 'portfolioManager', {
    ...existingPortfolioManagerInsight,
    finalDecision: {
      action: effectiveIntent,
      tradeDirection,
      originalRiskManagerDecision: originalDecision,
      shares: 0,
      dollarAmount: 0,
      reasoning: (riskIntent === 'TRIM' || riskIntent === 'EXIT') && !currentPosition 
        ? `Risk Manager recommended ${riskIntent.toLowerCase()} but no position exists to adjust`
        : 'No position adjustment needed based on current analysis and portfolio status'
    },
    portfolioContext: {
      totalValue,
      availableCash,
      currentPosition,
      userRiskLevel
    }
  });

  // Notify coordinator of completion - coordinator will mark as complete after auto-trade check
  notifyCoordinatorAsync(supabase, {
    action: 'agent-completion',
    analysisId,
    ticker,
    userId,
    phase: 'portfolio',
    agent: 'analysis-portfolio-manager',
    apiSettings,
    analysisContext,
    completionType: 'last_in_phase'
  }, 'Analysis Portfolio Manager');

  console.log('✅ Portfolio Manager completed - notifying coordinator');

  const response: IndividualAnalysisResponse = {
    success: true,
    analysis_id: analysisId,
    ticker,
    decision: tradeDirection,
    tradeDirection,
    originalDecision,
    message: (riskIntent === 'TRIM' || riskIntent === 'EXIT') && !currentPosition 
      ? `${riskIntent} recommended but no position exists` 
      : 'Trade executed successfully',
    portfolio_snapshot: {
      cash: availableCash,
      positions: currentPosition ? [{
        ticker,
        shares: currentPosition.qty,
        avgCost: currentPosition.avg_entry_price,
        currentPrice: currentPosition.current_price,
        value: currentPosition.market_value
      }] : [],
      totalValue,
      availableCash
    },
    created_at: new Date().toISOString()
  };
  
  return new Response(JSON.stringify(response), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function updatePortfolioManagerInsights(
  supabase: any,
  analysisId: string,
  effectiveIntent: PortfolioIntent,
  tradeDirection: 'BUY' | 'SELL' | 'HOLD',
  originalDecision: string,
  positionSizing: any,
  tradeOrder: any,
  totalValue: number,
  availableCash: number,
  currentPosition: any,
  userRiskLevel: string,
  result: any
) {
  const { data: currentInsights } = await supabase
    .from('analysis_history')
    .select('agent_insights')
    .eq('id', analysisId)
    .single();
  
  const existingInsight = currentInsights?.agent_insights?.portfolioManager || {};
  
  await updateAgentInsights(supabase, analysisId, 'portfolioManager', {
    ...existingInsight,
    finalDecision: {
      intent: effectiveIntent,
      action: tradeDirection,
      originalRiskManagerDecision: originalDecision,
      shares: positionSizing.shares,
      dollarAmount: positionSizing.dollarAmount,
      percentOfPortfolio: positionSizing.percentOfPortfolio,
      entryPrice: positionSizing.entryPrice,
      stopLoss: positionSizing.stopLoss,
      takeProfit: positionSizing.takeProfit,
      riskRewardRatio: positionSizing.riskRewardRatio,
      reasoning: positionSizing.reasoning,
      beforePosition: {
        shares: tradeOrder.beforeShares,
        value: tradeOrder.beforeValue,
        allocation: tradeOrder.beforeAllocation
      },
      afterPosition: {
        shares: tradeOrder.afterShares,
        value: tradeOrder.afterValue,
        allocation: tradeOrder.afterAllocation
      },
      changes: {
        shares: tradeOrder.shareChange,
        value: tradeOrder.valueChange,
        allocation: tradeOrder.allocationChange
      }
    },
    portfolioContext: {
      totalValue,
      availableCash,
      currentPosition,
      userRiskLevel
    },
    orderSubmitted: result.success,
    ordersCreated: result.ordersCreated
  });
}

// No longer needed - coordinator marks analysis as complete after auto-trade check
/* async function markAnalysisComplete(supabase: any, analysisId: string) {
  const { data: currentAnalysis, error: fetchError } = await supabase
    .from('analysis_history')
    .select('full_analysis')
    .eq('id', analysisId)
    .single();
  
  if (fetchError) {
    console.error('Failed to fetch current analysis:', fetchError);
    // Still try to update the status even if we can't get full_analysis
  }
  
  const updateData: any = {
    analysis_status: ANALYSIS_STATUS.COMPLETED
  };
  
  // Only update full_analysis if we successfully fetched it
  if (currentAnalysis?.full_analysis) {
    updateData.full_analysis = {
      ...currentAnalysis.full_analysis,
      status: 'completed',
      completedAt: new Date().toISOString()
    };
  } else if (!fetchError) {
    // If there's no full_analysis but no fetch error, create a minimal one
    updateData.full_analysis = {
      status: 'completed',
      completedAt: new Date().toISOString()
    };
  }
  
  const { error: statusError } = await supabase
    .from('analysis_history')
    .update(updateData)
    .eq('id', analysisId);
  
  if (statusError) {
    console.error('Failed to mark analysis as complete:', statusError);
    throw new Error(`Failed to mark analysis as complete: ${statusError.message}`);
  } else {
    console.log(`🎆 Analysis marked as completed with status: ${ANALYSIS_STATUS.COMPLETED}`);
  }
} */
