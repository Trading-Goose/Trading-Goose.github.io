import { TradeOrderData } from '../../_shared/tradeOrders.ts';
import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';
import { validateSellOrder, adjustTradeOrderForValidation } from '../../_shared/positionManagement.ts';

export function mapIntentToTradeDirection(intent: string | undefined): 'BUY' | 'SELL' | 'HOLD' {
  const upper = (intent || '').toUpperCase();
  if (upper === 'BUILD' || upper === 'ADD') return 'BUY';
  if (upper === 'TRIM' || upper === 'EXIT') return 'SELL';
  return 'HOLD';
}

export function buildRiskManagerDecisions(analyses: any[]): Record<string, any> {
  const decisions: Record<string, any> = {};
  
  analyses.forEach((analysis: any) => {
    // Skip failed analyses (they have decision='ERROR' and analysis_status=error)
    if (analysis.analysis_status === ANALYSIS_STATUS.ERROR || analysis.decision === 'ERROR') {
      console.log(`⚠️ Skipping failed analysis for ${analysis.ticker} in risk decisions`);
      // Don't add to decisions object - this ticker won't be considered for rebalancing
      return;
    }
    
    const insights = analysis.riskManagerInsights || analysis.agent_insights?.riskManager || null;
    const finalAssessment = insights?.finalAssessment || null;
    const executionPlan = finalAssessment?.executionPlan || {};

    const rawIntent = (finalAssessment?.intent || analysis.decision || 'HOLD').toString().toUpperCase();
    const tradeDirection = (executionPlan?.action || '').toString().toUpperCase() || mapIntentToTradeDirection(rawIntent);
    const suggestedPercent = executionPlan?.suggestedPercent || '';
    const overallRiskScore = finalAssessment?.overallRiskScore ?? analysis.riskScore ?? null;

    // Include essential data plus full insights for reasoning
    decisions[analysis.ticker] = {
      decision: rawIntent, // Backward compatibility field
      intent: rawIntent,
      tradeDirection,
      confidence: analysis.confidence,
      riskScore: overallRiskScore,
      suggestedPercent,
      executionPlan,
      riskManagerInsights: insights  // Full insights for reasoning
    };
  });
  
  return decisions;
}

export function adjustConfidencesForRiskLevel(
  riskManagerDecisions: Record<string, any>,
  userRiskLevel: string
): void {
  console.log(`🎯 Applying risk level adjustment: ${userRiskLevel}`);
  
  Object.entries(riskManagerDecisions).forEach(([ticker, decision]: [string, any]) => {
    const originalConfidence = decision.confidence;
    
    // Risk level affects confidence interpretation, not allocation settings
    if (userRiskLevel === 'conservative') {
      decision.confidence = Math.round(originalConfidence * 0.95);
    } else if (userRiskLevel === 'aggressive') {
      decision.confidence = Math.round(originalConfidence * 1.05);
    }
    
    if (originalConfidence !== decision.confidence) {
      console.log(`  📊 ${ticker}: Original: ${originalConfidence}%, Adjusted: ${decision.confidence}%`);
    }
  });
}

export function formatPendingOrdersDisplay(
  openOrders: any[],
  reservedCapital: number
): string {
  if (openOrders.length === 0) return '';
  
  return `\n\n🚨 CRITICAL: PENDING ORDERS DETECTED (${openOrders.length} total, $${reservedCapital?.toFixed(2) || 0} reserved):\n  ${openOrders.map((o: any) => 
    `❌ ${o.symbol}: ${o.side.toUpperCase()} ${o.qty || 'N/A'} shares${o.notional ? ` ($${o.notional})` : ''}${o.limit_price ? ` @ limit $${o.limit_price}` : ''}`
  ).join('\n  ')}\n\n⛔ MANDATORY RULE: DO NOT create orders for any tickers with pending orders above!`;
}

export function filterTickersByPendingOrders(
  tickers: string[],
  openOrders: any[]
): { allowed: string[], blocked: string[], tickersWithPendingOrders: Set<string> } {
  const tickersWithPendingOrders = new Set(openOrders.map((o: any) => o.symbol));
  const allowed = tickers.filter(ticker => !tickersWithPendingOrders.has(ticker));
  const blocked = tickers.filter(ticker => tickersWithPendingOrders.has(ticker));
  
  console.log(`📊 Rebalance order filtering:`);
  console.log(`  ✅ Allowed tickers (no pending orders): ${allowed.join(', ') || 'none'}`);
  console.log(`  ❌ Blocked tickers (have pending orders): ${blocked.join(', ') || 'none'}`);
  
  return { allowed, blocked, tickersWithPendingOrders };
}

export function createTradeOrdersFromActions(
  actions: any[],
  rebalanceRequestId: string,
  tickersWithPendingOrders: Set<string>,
  positions?: any[]
): TradeOrderData[] {
  const tradeOrders: TradeOrderData[] = [];
  
  console.log(`📊 Creating trade orders from ${actions.length} actions`);
  console.log(`  Input actions breakdown:`);
  console.log(`    - BUY: ${actions.filter(a => a.action === 'BUY').length}`);
  console.log(`    - SELL: ${actions.filter(a => a.action === 'SELL').length}`);
  console.log(`    - HOLD: ${actions.filter(a => a.action === 'HOLD').length}`);
  
  // Create a map of positions for quick lookup
  const positionsMap = new Map<string, any>();
  if (positions) {
    positions.forEach((p: any) => {
      positionsMap.set(p.symbol, p);
    });
  }
  
  for (const action of actions) {
    console.log(`  🎯 ${action.ticker}: ${action.action} - shareChange: ${action.shareChange}, dollarAmount: $${action.dollarAmount}`);
    
    // Safety check for pending orders
    if (tickersWithPendingOrders.has(action.ticker)) {
      console.log(`🚨 SAFETY CHECK: ${action.ticker} has pending orders - BLOCKING order creation`);
      continue;
    }
    
    if (action.action !== 'HOLD' && (action.shareChange !== 0 || action.dollarAmount > 0)) {
      console.log(`    ✅ Creating order for ${action.ticker}`);
      let tradeOrder: TradeOrderData = {
        ticker: action.ticker,
        action: action.action as 'BUY' | 'SELL',
        confidence: action.confidence,
        reasoning: `${action.reasoning}. Risk-adjusted based on ${action.riskManagerRecommendation || 'analysis'} recommendation.`,
        rebalanceRequestId,
        beforeShares: action.currentShares || 0,
        beforeValue: action.currentValue || 0,
        beforeAllocation: action.currentAllocation || 0,
        afterShares: action.targetShares || 0,
        afterValue: action.targetValue || 0,
        afterAllocation: action.targetAllocation || 0,
        shareChange: action.shareChange || 0,
        valueChange: (action.targetValue || 0) - (action.currentValue || 0),
        allocationChange: (action.targetAllocation || 0) - (action.currentAllocation || 0),
        targetAllocation: action.targetAllocation,
        targetValue: action.targetValue
      };
      
      // Validate and adjust SELL orders
      if (action.action === 'SELL' && positions) {
        const position = positionsMap.get(action.ticker);
        
        if (position) {
          const validation = validateSellOrder(
            Math.abs(action.dollarAmount),
            position.market_value,
            position.qty,
            action.ticker
          );
          
          if (!validation.isValid) {
            console.warn(`⚠️ Invalid SELL order for ${action.ticker}: ${validation.message}`);
            // Skip this order
            continue;
          }
          
          // Adjust the trade order based on validation
          tradeOrder = adjustTradeOrderForValidation(tradeOrder, validation);
          
          // Update dollar amount and shares based on validation
          if (validation.adjustedOrderType === 'shares') {
            tradeOrder.shares = validation.adjustedAmount;
            tradeOrder.dollarAmount = 0;
          } else {
            tradeOrder.dollarAmount = validation.adjustedAmount;
            tradeOrder.shares = 0;
          }
          
          console.log(`    💰 Order: ${validation.adjustedOrderType === 'shares' ? 
            `Share-based (${tradeOrder.shares} shares)` : 
            `Dollar-based ($${tradeOrder.dollarAmount?.toFixed(2)})`}`);
        } else {
          console.warn(`⚠️ No position found for ${action.ticker} - cannot execute SELL order`);
          continue;
        }
      } else {
        // For BUY orders or when no positions data, use dollar-based orders
        tradeOrder.dollarAmount = Math.abs(action.dollarAmount);
        tradeOrder.shares = 0;
        console.log(`    💰 Order: Dollar-based ($${tradeOrder.dollarAmount?.toFixed(2)})`);
      }
      
      tradeOrders.push(tradeOrder);
    }
  }
  
  return tradeOrders;
}

export function buildPortfolioSnapshot(
  positions: any[],
  currentCash: number,
  totalValue: number,
  targetCashAllocation: number
) {
  const stockValue = positions.reduce((sum: number, p: any) => sum + p.market_value, 0);
  const currentStockAllocation = (stockValue / totalValue) * 100;
  const currentCashAllocation = (currentCash / totalValue) * 100;
  
  return {
    cash: currentCash,
    positions: positions.map((p: any) => ({
      ticker: p.symbol,
      shares: p.qty,
      avgCost: p.avg_entry_price,
      currentPrice: p.current_price,
      value: p.market_value
    })),
    totalValue,
    stockValue,
    currentStockAllocation,
    currentCashAllocation
  };
}

export function buildRecommendedPositions(actions: any[]) {
  return actions.map((action: any) => ({
    ticker: action.ticker,
    currentShares: action.currentShares,
    currentValue: action.currentValue,
    currentAllocation: action.currentAllocation,
    targetAllocation: action.targetAllocation,
    recommendedShares: action.targetShares,
    shareChange: action.shareChange,
    action: action.action,
    reasoning: action.reasoning,
    executed: false
  }));
}
