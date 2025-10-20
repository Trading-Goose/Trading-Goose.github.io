import { calculateOptimalAllocations } from '../portfolio/allocations.ts';
import { calculateAllowedCash } from '../../_shared/portfolio/cash-constraints.ts';
import { mapIntentToTradeDirection } from '../handlers/rebalance-logic.ts';

export function parseRebalancePlan(aiResponse: string, context: any) {
  const actions: any[] = [];
  
  // Build a list of stocks to consider
  const stocksToConsider = new Set<string>();
  
  // Add stocks that have risk manager decisions
  if (context.riskManagerDecisions) {
    Object.keys(context.riskManagerDecisions).forEach(ticker => stocksToConsider.add(ticker));
  }
  
  // ALSO add current positions that might need to be sold
  if (context.positions) {
    context.positions.forEach((p: any) => {
      if (!stocksToConsider.has(p.symbol)) {
        stocksToConsider.add(p.symbol);
        console.log(`  📊 Added ${p.symbol} from current positions (can be traded for allocation management)`);
      }
    });
  }
  
  // Parse AI response to extract explicit decisions
  const explicitDecisions: Record<string, string> = {};
  const lines = aiResponse.split('\n');
  for (const line of lines) {
    const decisionMatch = line.match(/([A-Z0-9]+(?:\/[A-Z0-9]+)?)[\s:,-]+?(BUY|SELL|HOLD)/i);
    if (decisionMatch) {
      const ticker = decisionMatch[1].toUpperCase();
      const decision = decisionMatch[2].toUpperCase();
      explicitDecisions[ticker] = decision;
      console.log(`  📌 Found explicit decision: ${ticker} = ${decision}`);
    }
  }
  
  console.log(`🔍 PARSING REBALANCE PLAN:`);
  console.log(`  - Analyzed stocks: ${Object.keys(context.riskManagerDecisions || {}).join(', ')}`);
  console.log(`  - Current positions: ${context.positions?.map((p: any) => p.symbol).join(', ') || 'none'}`);
  console.log(`  - Stocks to rebalance: ${Array.from(stocksToConsider).join(', ')}`);
  
  // Calculate optimal allocations
  const targetAllocations = calculateOptimalAllocations(
    Array.from(stocksToConsider),
    context.riskManagerDecisions,
    context.targetCashAllocation || 20,
    context.totalValue,
    context.userRiskLevel || 'moderate'
  );
  
  const availableCash = context.availableCash || context.currentCash || 0;
  const targetCashAllocation = context.targetCashAllocation ?? 20;
  const initialAllowedCash = typeof context.allowedCash === 'number'
    ? Math.max(0, Math.min(availableCash, context.allowedCash))
    : calculateAllowedCash(availableCash, context.totalValue, targetCashAllocation);
  let remainingRawCash = availableCash;
  let allocatedDeployableCash = 0;

  console.log(`💵 Cash posture: available=$${availableCash.toFixed(2)}, targetCash=${targetCashAllocation}% → initial deployable cap=$${initialAllowedCash.toFixed(2)}`);
  const cashPercent = (context.currentCash / context.totalValue) * 100;
  const cashDifference = cashPercent - context.targetCashAllocation;
  const needToRaiseCash = cashDifference < -5;
  const needToDeployCash = cashDifference > 5;
  
  const getAllocationFlexibility = (confidence: number) => {
    if (confidence >= 80) return 10;
    if (confidence >= 60) return 5;
    return 2;
  };
  
  // Process each stock
  for (const ticker of stocksToConsider) {
    const currentPosition = context.positions.find((p: any) => p.symbol === ticker);
    const analysis = context.analyses?.find((a: any) => a.ticker === ticker);
    const riskDecision = context.riskManagerDecisions?.[ticker];
    const targetPct = targetAllocations[ticker] || 0;
    
    const targetValue = (targetPct as number / 100) * context.totalValue;
    const currentValue = currentPosition?.market_value || 0;
    const currentPct = (currentValue / context.totalValue) * 100;
    
    let action = 'HOLD';
    let shareChange = 0;
    let dollarAmount = 0;
    
    let riskIntent = (riskDecision?.intent || riskDecision?.decision || 'HOLD').toUpperCase();
    const positionHasHolding = currentValue > 0 || currentPosition?.qty > 0;
    if (riskIntent === 'BUILD' && positionHasHolding) {
      console.log(`  🔁 ${ticker}: Converting BUILD intent to ADD because position already exists`);
      riskIntent = 'ADD';
    }
    const riskTradeDirection = riskDecision?
      (riskDecision.tradeDirection || mapIntentToTradeDirection(riskIntent)) :
      'HOLD';
    const riskScore = riskDecision?.riskScore || 5;
    const confidence = riskDecision?.confidence || analysis?.confidence || 70;
    const suggestedPercent = riskDecision?.suggestedPercent || riskDecision?.executionPlan?.suggestedPercent;
    const suggestedDollarFromPercent = riskDecision
      ? deriveSuggestedDollarAmount(riskIntent, suggestedPercent, currentValue, context.totalValue)
      : null;

    let adjustedTargetValue = targetValue;
    
    // Process based on Risk Manager decision
    if (riskDecision) {
      const flexibility = getAllocationFlexibility(confidence);
      
      if (riskTradeDirection === 'BUY') {
        const feasibility = processBuyDecision(
          ticker, confidence, cashPercent, context.targetCashAllocation,
          flexibility, targetValue, currentValue, needToDeployCash,
          cashDifference, context.totalValue, riskIntent
        );

        if (feasibility === 'BUY') {
          if (suggestedDollarFromPercent && suggestedDollarFromPercent > 0) {
            action = 'BUY';
            dollarAmount = suggestedDollarFromPercent;
            adjustedTargetValue = Math.max(targetValue, currentValue + dollarAmount);
          } else {
            ({ adjustedTargetValue, dollarAmount } = calculateBuyAmounts(
              confidence, targetValue, currentValue, needToDeployCash,
              cashDifference, context.totalValue
            ));
            if (dollarAmount > 0) {
              action = 'BUY';
            }
          }
        }
      }
      else if (riskTradeDirection === 'SELL') {
        const sellResult = processSellDecision(
          currentValue, confidence, needToRaiseCash, riskScore, riskIntent,
          suggestedDollarFromPercent
        );
        action = sellResult.action;
        dollarAmount = sellResult.dollarAmount;
        adjustedTargetValue = sellResult.adjustedTargetValue;
      }
    }
    else {
      // Process stocks without RM decisions
      const explicitAction = explicitDecisions[ticker];
      const allocationResult = processAllocationManagement(
        explicitAction, currentValue, needToRaiseCash, needToDeployCash,
        targetValue, cashDifference, context.totalValue, ticker
      );
      action = allocationResult.action;
      dollarAmount = allocationResult.dollarAmount;
      adjustedTargetValue = allocationResult.adjustedTargetValue;
    }
    
    // Ensure BUY actions don't exceed deployable cash limits
    if (action === 'BUY') {
      const dynamicAllowedCash = calculateAllowedCash(remainingRawCash, context.totalValue, targetCashAllocation);
      const remainingDeployableCash = Math.max(0, dynamicAllowedCash - allocatedDeployableCash);
      const currentCashCap = Math.max(0, Math.min(remainingDeployableCash, remainingRawCash));

      if (dollarAmount > currentCashCap) {
        console.log(`  💵 ${ticker}: BUY limited by deployable cash: $${dollarAmount.toFixed(2)} → $${currentCashCap.toFixed(2)}`);

        if (currentCashCap <= 0) {
          action = 'HOLD';
          dollarAmount = 0;
          console.log(`  ⚠️ ${ticker}: Deployable cash exhausted - changing BUY to HOLD`);
        } else if (currentCashCap < context.totalValue * 0.005) {
          action = 'HOLD';
          dollarAmount = 0;
          console.log(`  ⚠️ ${ticker}: Deployable cash below 0.5% of portfolio - HOLD`);
        } else {
          dollarAmount = currentCashCap;
          console.log(`  ✅ ${ticker}: Adjusted BUY amount to deployable cap $${dollarAmount.toFixed(2)}`);
        }
      }
    }

    // Calculate share change
    const currentPrice = analysis?.agent_insights?.marketAnalyst?.data?.price?.current || 
                        currentPosition?.current_price || 100;
    if (dollarAmount > 0 && currentPrice > 0) {
      shareChange = action === 'BUY' ? 
        Math.floor(dollarAmount / currentPrice) : 
        -Math.floor(dollarAmount / currentPrice);
    }
    
    // Build reasoning with cash limitation note if applicable
    let reasoning = riskDecision ? 
      `Rebalancing ${ticker} from ${currentPct.toFixed(1)}% to ${targetPct}% (Risk: ${riskScore}/10, ${riskIntent} intent${suggestedPercent ? `, ${suggestedPercent}` : ''})` :
      `Rebalancing ${ticker} from ${currentPct.toFixed(1)}% to ${targetPct}%`;
    
    // Add cash limitation note if action was changed
    if (riskTradeDirection === 'BUY' && action === 'HOLD' && availableCash <= 0) {
      reasoning = `Insufficient cash to execute BUY for ${ticker} - maintaining current position`;
    } else if (riskTradeDirection === 'BUY' && action === 'BUY' && dollarAmount < (targetValue - currentValue) * 0.5) {
      reasoning += ` (limited by available cash)`;
    }
    
    if (action === 'BUY') {
      allocatedDeployableCash += dollarAmount;
      remainingRawCash = Math.max(0, remainingRawCash - dollarAmount);
    } else if (action === 'SELL') {
      remainingRawCash += dollarAmount;
    }

    actions.push({
      ticker,
      action,
      currentShares: currentPosition?.qty || 0,
      currentValue,
      currentAllocation: currentPct,
      currentPrice,
      targetShares: (currentPosition?.qty || 0) + shareChange,
      targetValue: adjustedTargetValue,
      targetAllocation: (adjustedTargetValue / context.totalValue) * 100,
      shareChange,
      dollarAmount,
      confidence,
      reasoning: action === 'BUY' && dollarAmount > 0 && dollarAmount < (targetValue - currentValue)
        ? `${reasoning} (limited by deployable cash)`
        : action === 'HOLD' && riskTradeDirection === 'BUY' && (calculateAllowedCash(remainingRawCash, context.totalValue, targetCashAllocation) - allocatedDeployableCash) <= 0
        ? `Deployable cash exhausted - maintaining current position`
        : reasoning,
      riskScore,
      riskManagerRecommendation: riskIntent,
      riskManagerTradeDirection: riskTradeDirection,
      suggestedPercent
    });
  }
  
  return {
    actions,
    calculatedAllocations: targetAllocations,
    summary: {
      totalTrades: actions.filter(a => a.action !== 'HOLD').length,
      buyOrders: actions.filter(a => a.action === 'BUY').length,
      sellOrders: actions.filter(a => a.action === 'SELL').length,
      totalBuyValue: actions.filter(a => a.action === 'BUY').reduce((sum, a) => sum + a.dollarAmount, 0),
      totalSellValue: actions.filter(a => a.action === 'SELL').reduce((sum, a) => sum + Math.abs(a.dollarAmount), 0),
      expectedCashAfter: context.currentCash + 
        actions.filter(a => a.action === 'SELL').reduce((sum, a) => sum + Math.abs(a.dollarAmount), 0) -
        actions.filter(a => a.action === 'BUY').reduce((sum, a) => sum + a.dollarAmount, 0)
    }
  };
}

function parsePercentToDecimal(percentText: string | undefined): number | null {
  if (!percentText) return null;
  const normalized = percentText.replace(/percent/gi, '%').trim();
  if (!normalized) return null;

  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)[\s-]*(?:to)?[\s-]*(\d+(?:\.\d+)?)%?/i);
  if (rangeMatch) {
    const first = Number.parseFloat(rangeMatch[1]);
    const second = Number.parseFloat(rangeMatch[2]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return (first + second) / 200; // average then convert to decimal
    }
  }

  const singleMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%/);
  if (singleMatch) {
    const value = Number.parseFloat(singleMatch[1]);
    if (Number.isFinite(value)) {
      return value / 100;
    }
  }

  return null;
}

function deriveSuggestedDollarAmount(
  intent: string,
  suggestedPercent: string | undefined,
  currentValue: number,
  totalValue: number
): number | null {
  const percentDecimal = parsePercentToDecimal(suggestedPercent);
  if (percentDecimal === null) return null;

  switch (intent) {
    case 'TRIM':
      return Math.max(0, currentValue * percentDecimal);
    case 'ADD': {
      const base = currentValue * percentDecimal;
      return base > 0 ? base : null;
    }
    case 'BUILD': {
      const targetValue = totalValue * percentDecimal;
      const delta = targetValue - currentValue;
      return delta > 0 ? delta : null;
    }
    default:
      return null;
  }
}

// Helper functions
function processBuyDecision(
  ticker: string, confidence: number, cashPercent: number,
  targetCashAllocation: number, flexibility: number, targetValue: number,
  currentValue: number, needToDeployCash: boolean, cashDifference: number,
  totalValue: number, riskIntent: string
): string {
  if (confidence >= 80) {
    if (cashPercent >= (targetCashAllocation - flexibility)) {
      return 'BUY';
    } else {
      console.log(`  ⚠️ ${ticker}: High confidence BUY (${confidence}%) but cash critically low`);
      return 'HOLD';
    }
  }
  else if (confidence >= 60) {
    if (needToDeployCash || cashPercent >= targetCashAllocation) {
      return 'BUY';
    } else {
      console.log(`  ⏸️ ${ticker}: Medium confidence BUY (${confidence}%) but maintaining allocation`);
      return 'HOLD';
    }
  }
  else {
    if (needToDeployCash) {
      return 'BUY';
    } else {
      console.log(`  ❌ ${ticker}: Low confidence ${riskIntent} (${confidence}%) - maintaining allocation`);
      return 'HOLD';
    }
  }
}

function calculateBuyAmounts(
  confidence: number, targetValue: number, currentValue: number,
  needToDeployCash: boolean, cashDifference: number, totalValue: number
) {
  let adjustedTargetValue = targetValue;
  let dollarAmount = 0;
  
  if (confidence >= 80) {
    adjustedTargetValue = targetValue * 1.2;
    dollarAmount = Math.min(
      adjustedTargetValue - currentValue,
      totalValue * 0.08
    );
  }
  else if (confidence >= 60) {
    adjustedTargetValue = targetValue;
    const maxBuyAmount = needToDeployCash ? 
      Math.abs(cashDifference) * totalValue / 100 * 0.5 :
      (cashDifference) * totalValue / 100;
    dollarAmount = Math.min(adjustedTargetValue - currentValue, maxBuyAmount);
  }
  else {
    dollarAmount = Math.min(
      totalValue * 0.02,
      Math.abs(cashDifference) * totalValue / 100 * 0.2
    );
  }
  
  if (dollarAmount < totalValue * 0.01) {
    dollarAmount = 0;
  }
  
  return { adjustedTargetValue, dollarAmount };
}

function processSellDecision(
  currentValue: number, confidence: number,
  needToRaiseCash: boolean, riskScore: number,
  riskIntent: string,
  suggestedDollarFromPercent: number | null
) {
  if (currentValue <= 0) {
    return { action: 'HOLD', dollarAmount: 0, adjustedTargetValue: 0 };
  }
  
  let dollarAmount = 0;
  let adjustedTargetValue = 0;

  if (riskIntent === 'EXIT') {
    return { action: 'SELL', dollarAmount: currentValue, adjustedTargetValue: 0 };
  }

  if (riskIntent === 'TRIM' && suggestedDollarFromPercent && suggestedDollarFromPercent > 0) {
    const amount = Math.min(currentValue, suggestedDollarFromPercent);
    if (amount <= 0) {
      return { action: 'HOLD', dollarAmount: 0, adjustedTargetValue: currentValue };
    }
    return {
      action: 'SELL',
      dollarAmount: amount,
      adjustedTargetValue: Math.max(0, currentValue - amount)
    };
  }
  
  if (confidence >= 80) {
    if (needToRaiseCash || riskScore >= 8) {
      dollarAmount = currentValue;
      adjustedTargetValue = 0;
    } else {
      dollarAmount = currentValue * 0.9;
      adjustedTargetValue = currentValue * 0.1;
    }
  }
  else if (confidence >= 60) {
    if (needToRaiseCash) {
      dollarAmount = currentValue * 0.75;
      adjustedTargetValue = currentValue * 0.25;
    } else {
      dollarAmount = currentValue * 0.5;
      adjustedTargetValue = currentValue * 0.5;
    }
  }
  else {
    if (needToRaiseCash) {
      dollarAmount = currentValue * 0.3;
      adjustedTargetValue = currentValue * 0.7;
    } else {
      console.log(`  ⚠️ Low confidence SELL (${confidence}%) and cash adequate - holding`);
      return { action: 'HOLD', dollarAmount: 0, adjustedTargetValue: currentValue };
    }
  }
  
  return { action: 'SELL', dollarAmount, adjustedTargetValue };
}

function processAllocationManagement(
  explicitAction: string | undefined, currentValue: number,
  needToRaiseCash: boolean, needToDeployCash: boolean,
  targetValue: number, cashDifference: number, totalValue: number,
  ticker: string
) {
  let action = 'HOLD';
  let dollarAmount = 0;
  let adjustedTargetValue = currentValue;
  
  if (explicitAction === 'SELL' && currentValue > 0) {
    action = 'SELL';
    if (needToRaiseCash) {
      dollarAmount = currentValue;
      adjustedTargetValue = 0;
    } else {
      dollarAmount = currentValue * 0.5;
      adjustedTargetValue = currentValue * 0.5;
    }
    console.log(`  💰 ${ticker}: Selling to manage allocation (not in RM list)`);
  }
  else if (explicitAction === 'BUY' && needToDeployCash) {
    action = 'BUY';
    const maxBuyAmount = Math.abs(cashDifference) * totalValue / 100;
    dollarAmount = Math.min(targetValue - currentValue, maxBuyAmount * 0.2);
    console.log(`  💵 ${ticker}: Buying to deploy excess cash (not in RM list)`);
  }
  
  return { action, dollarAmount, adjustedTargetValue };
}
