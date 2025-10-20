import { TradeOrderData } from '../../_shared/tradeOrders.ts';
import { IndividualAnalysisContext, PositionContext } from './individual-types.ts';

export type PortfolioIntent = 'BUILD' | 'ADD' | 'TRIM' | 'EXIT' | 'HOLD';

export function intentToTradeDirection(intent: PortfolioIntent): 'BUY' | 'SELL' | 'HOLD' {
  if (intent === 'BUILD' || intent === 'ADD') {
    return 'BUY';
  }
  if (intent === 'TRIM' || intent === 'EXIT') {
    return 'SELL';
  }
  return 'HOLD';
}

export function normaliseIntent(decision: string | null | undefined, hasPosition: boolean): PortfolioIntent {
  const value = (decision || '').toString().trim().toUpperCase();

  switch (value) {
    case 'BUILD':
      return hasPosition ? 'ADD' : 'BUILD';
    case 'ADD':
      return hasPosition ? 'ADD' : 'BUILD';
    case 'TRIM':
      return hasPosition ? 'TRIM' : 'HOLD';
    case 'EXIT':
      return hasPosition ? 'EXIT' : 'HOLD';
    case 'HOLD':
      return 'HOLD';
    case 'SELL':
      return hasPosition ? 'TRIM' : 'EXIT';
    case 'BUY':
      return hasPosition ? 'ADD' : 'BUILD';
    default:
      return hasPosition ? 'HOLD' : 'BUILD';
  }
}

export async function prepareUserSettings(
  supabase: any,
  userId: string,
  apiSettings: any,
  portfolioData: any
) {
  const totalValue = portfolioData.account.portfolio_value;
  
  let userRiskLevel: string;
  let minPositionSizeDollars: number;
  let maxPositionSizeDollars: number;
  
  // Note: constraints are never passed from coordinator, always use database settings
  const { data: userSettings } = await supabase
    .from('api_settings')
    .select('user_risk_level, rebalance_min_position_size, rebalance_max_position_size, target_cash_allocation, profit_target, stop_loss, near_limit_threshold, near_position_threshold')
    .eq('user_id', userId)
    .single();
  
  userRiskLevel = userSettings?.user_risk_level || apiSettings.user_risk_level || 'moderate';
  
  // Get percentage-based position sizes from database
  const minPositionPercent = userSettings?.rebalance_min_position_size || apiSettings.rebalance_min_position_size || 5;
  const maxPositionPercent = userSettings?.rebalance_max_position_size || apiSettings.rebalance_max_position_size || 25;
  
  // Calculate dollar amounts from percentages based on portfolio value
  minPositionSizeDollars = (minPositionPercent / 100) * totalValue;
  maxPositionSizeDollars = (maxPositionPercent / 100) * totalValue;
  
  console.log(`📊 Position sizing from percentages:`);
  console.log(`  - Min: ${minPositionPercent}% = $${minPositionSizeDollars.toFixed(2)}`);
  console.log(`  - Max: ${maxPositionPercent}% = $${maxPositionSizeDollars.toFixed(2)}`);
  
  const targetCashAllocationPercent = userSettings?.target_cash_allocation ??
    apiSettings?.target_cash_allocation ?? 20;
  const profitTargetPercent = userSettings?.profit_target ?? apiSettings?.profit_target ?? 25;
  const stopLossPercent = userSettings?.stop_loss ?? apiSettings?.stop_loss ?? 10;
  const nearLimitThresholdPercent = userSettings?.near_limit_threshold ?? apiSettings?.near_limit_threshold ?? 20;
  const nearPositionThresholdPercent = userSettings?.near_position_threshold ?? apiSettings?.near_position_threshold ?? 20;

  return {
    userRiskLevel,
    defaultPositionSizeDollars: minPositionSizeDollars, // Use min as default
    minPositionSize: minPositionPercent, // Percentage for prompts
    maxPositionSize: maxPositionPercent, // Percentage for prompts
    minPositionSizeDollars,
    maxPositionSizeDollars,
    targetCashAllocationPercent,
    profitTargetPercent,
    stopLossPercent,
    nearLimitThresholdPercent,
    nearPositionThresholdPercent
  };
}

export function adjustConfidenceForRiskLevel(
  confidence: number,
  userRiskLevel: string
): number {
  const originalConfidence = confidence;
  
  if (userRiskLevel === 'conservative') {
    confidence = Math.round(confidence * 0.95);
  } else if (userRiskLevel === 'aggressive') {
    confidence = Math.round(confidence * 1.05);
  }
  
  console.log(`🎯 Risk level adjustment: ${userRiskLevel} - Original: ${originalConfidence}%, Adjusted: ${confidence}%`);
  return confidence;
}

export function validateDecision(
  decision: string,
  currentPosition: any,
  pendingOrdersForTicker: any[]
): {
  effectiveIntent: PortfolioIntent;
  tradeDirection: 'BUY' | 'SELL' | 'HOLD';
  intentWarning: string;
  pendingOrderOverride: string;
} {
  const hasPosition = Boolean(currentPosition);
  const baseIntent = normaliseIntent(decision, hasPosition);
  let effectiveIntent: PortfolioIntent = baseIntent;
  let intentWarning = '';
  let pendingOrderOverride = '';

  const hasPendingBuy = pendingOrdersForTicker?.some((o: any) => o.side === 'buy') || false;
  const hasPendingSell = pendingOrdersForTicker?.some((o: any) => o.side === 'sell') || false;

  if ((baseIntent === 'TRIM' || baseIntent === 'EXIT') && !hasPosition) {
    intentWarning = '\n\nNOTE: Risk Manager suggested trimming/exiting but no position exists. Treating as HOLD.';
    effectiveIntent = 'HOLD';
  }

  if ((baseIntent === 'BUILD' || baseIntent === 'ADD') && hasPendingBuy) {
    console.log(`⚠️ Overriding ${baseIntent} intent - pending BUY order already exists`);
    pendingOrderOverride = `\n\nCRITICAL: Decision overridden from ${baseIntent} to HOLD due to existing pending BUY order.`;
    effectiveIntent = 'HOLD';
  } else if ((baseIntent === 'TRIM' || baseIntent === 'EXIT') && hasPendingSell) {
    console.log(`⚠️ Overriding ${baseIntent} intent - pending SELL order already exists`);
    pendingOrderOverride = `\n\nCRITICAL: Decision overridden from ${baseIntent} to HOLD due to existing pending SELL order.`;
    effectiveIntent = 'HOLD';
  }

  const tradeDirection = intentToTradeDirection(effectiveIntent);

  return { effectiveIntent, tradeDirection, intentWarning, pendingOrderOverride };
}

export function formatPendingOrdersInfo(
  ticker: string,
  pendingOrdersForTicker: any[],
  hasPendingBuy: boolean
): string {
  if (pendingOrdersForTicker.length === 0) return '';
  
  return `\n\n🚨 CRITICAL PENDING ORDER ALERT 🚨
  - ${ticker} has ${pendingOrdersForTicker.length} PENDING ORDER(S):
  ${pendingOrdersForTicker.map((o: any) => 
    `    ❌ ${o.side.toUpperCase()} ${o.qty || o.notional ? `${o.qty || 'notional'} shares` : 'unknown qty'}${o.notional ? ` ($${o.notional})` : ''}${o.limit_price ? ` @ $${o.limit_price}` : ''} (${new Date(o.submitted_at).toLocaleString()})`
  ).join('\n  ')}
  
  ⛔ MANDATORY RULE: DO NOT CREATE ANY NEW ORDERS FOR ${ticker}
  ⛔ RESPONSE MUST BE: "EXECUTION: HOLD - Pending ${hasPendingBuy ? 'BUY' : 'SELL'} order already exists, avoiding duplicates"`;
}

export function createTradeOrder(
  ticker: string,
  effectiveIntent: PortfolioIntent,
  positionSizing: any,
  confidence: number,
  analysisId: string,
  currentPosition: any,
  currentPrice: number,
  totalValue: number
): TradeOrderData {
  const beforeShares = currentPosition?.qty || 0;
  const beforeValue = currentPosition?.market_value || 0;
  const beforeAllocation = (beforeValue / totalValue) * 100;
  
  let afterShares = beforeShares;
  let afterValue = beforeValue;
  const tradeDirection = intentToTradeDirection(effectiveIntent);

  const parsedPercent = Number(positionSizing.percentOfPortfolio);
  const percentOfPortfolio = Number.isFinite(parsedPercent)
    ? parsedPercent
    : totalValue > 0
      ? ((positionSizing.dollarAmount || 0) / totalValue) * 100
      : 0;

  if (tradeDirection === 'BUY') {
    if (positionSizing.dollarAmount > 0) {
      const sharesFromDollar = positionSizing.dollarAmount / currentPrice;
      afterShares = beforeShares + sharesFromDollar;
      afterValue = beforeValue + positionSizing.dollarAmount;
    } else {
      afterShares = beforeShares + positionSizing.shares;
      afterValue = afterShares * currentPrice;
    }
  } else if (tradeDirection === 'SELL') {
    if (positionSizing.dollarAmount > 0) {
      const sharesFromDollar = positionSizing.dollarAmount / currentPrice;
      afterShares = Math.max(0, beforeShares - sharesFromDollar);
      afterValue = afterShares * currentPrice;
    } else {
      afterShares = Math.max(0, beforeShares - positionSizing.shares);
      afterValue = afterShares * currentPrice;
    }
  }
  
  const afterAllocation = (afterValue / totalValue) * 100;
  
  return {
    ticker,
    action: tradeDirection === 'HOLD' ? 'HOLD' : tradeDirection,
    confidence,
    reasoning: `${positionSizing.reasoning}. Risk-adjusted position: ${percentOfPortfolio.toFixed(1)}% of portfolio. Intent: ${effectiveIntent}.`,
    analysisId,
    beforeShares,
    beforeValue,
    beforeAllocation,
    afterShares,
    afterValue,
    afterAllocation,
    shareChange: afterShares - beforeShares,
    valueChange: afterValue - beforeValue,
    allocationChange: afterAllocation - beforeAllocation
  };
}
