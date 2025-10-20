import { calculateAllowedCash } from '../../_shared/portfolio/cash-constraints.ts';
import { mapIntentToTradeDirection } from '../handlers/rebalance-logic.ts';

export function parseExtractedOrders(extractionResponse: string, analyses: any[], positions: any[], totalValue: number): any {
  try {
    // Clean up common JSON issues
    let cleanedResponse = extractionResponse
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/,\s*([\]}])/g, '$1')
      .trim();

    // Remove any explanatory text before JSON (common with GPT models)
    // Look for patterns like "**Analyzing...**" or other markdown/text before JSON
    cleanedResponse = cleanedResponse.replace(/^[\s\S]*?(?=\{)/m, '');
    
    // If the response looks like valid JSON already, don't modify it
    // Check if it starts with { and has "orders" field
    if (cleanedResponse.startsWith('{') && cleanedResponse.includes('"orders"')) {
      // Try to parse as-is first
      try {
        JSON.parse(cleanedResponse);
        // If parsing succeeds, use the original cleaned response
        console.log('📊 JSON appears valid, using as-is');
      } catch {
        // Only try to extract if parsing fails
        console.log('⚠️ JSON parsing failed, attempting extraction');
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}$/);  // Match to the LAST closing brace
        if (jsonMatch) {
          cleanedResponse = jsonMatch[0];
        }
      }
    }
    
    // Handle case where model started writing but didn't finish JSON
    if (cleanedResponse.includes('"orders"') && cleanedResponse.includes('[')) {
      // Find the start of orders array
      const ordersStart = cleanedResponse.indexOf('"orders"');
      if (ordersStart !== -1) {
        // Try to extract from {"orders": onwards
        const fromOrders = cleanedResponse.substring(cleanedResponse.lastIndexOf('{', ordersStart));
        
        // Count brackets to ensure proper closing
        let openBrackets = (fromOrders.match(/\[/g) || []).length;
        let closeBrackets = (fromOrders.match(/\]/g) || []).length;
        let openBraces = (fromOrders.match(/\{/g) || []).length;
        let closeBraces = (fromOrders.match(/\}/g) || []).length;
        
        let fixedJson = fromOrders;
        
        // Add missing closing brackets/braces
        while (closeBrackets < openBrackets) {
          fixedJson += ']';
          closeBrackets++;
        }
        while (closeBraces < openBraces) {
          fixedJson += '}';
          closeBraces++;
        }
        
        cleanedResponse = fixedJson;
      }
    }
    
    // Try to fix incomplete JSON by ensuring proper closing
    if (cleanedResponse.includes('"orders": [') && !cleanedResponse.includes(']')) {
      // If orders array is not closed, try to close it
      cleanedResponse += ']}';
    } else if (cleanedResponse.startsWith('{') && !cleanedResponse.endsWith('}')) {
      // If JSON object is not closed, try to close it
      cleanedResponse += '}';
    }

    // Parse the extraction response
    const parsed = JSON.parse(cleanedResponse);
    
    if (parsed && parsed.orders) {
      console.log(`✅ Successfully parsed ${parsed.orders.length} trade orders from extraction`);
      
      // Validate that orders have required fields and reasonable values
      for (const order of parsed.orders) {
        if (!order.ticker || !order.action || order.dollarAmount === undefined) {
          throw new Error(`Invalid order structure: missing ticker, action, or dollarAmount`);
        }
        
        // Set defaults for optional fields
        if (order.shares === undefined) order.shares = 0;
        if (order.confidence === undefined) order.confidence = 70; // Default confidence
        if (!order.reasoning) order.reasoning = `${order.action} ${order.ticker} based on portfolio optimization`;
        
        // Allow dollarAmount of 0 for HOLD decisions, but validate positive amounts don't exceed portfolio
        if (order.dollarAmount < 0 || (order.dollarAmount > 0 && order.dollarAmount > totalValue)) {
          throw new Error(`Invalid dollar amount: $${order.dollarAmount} (portfolio: $${totalValue})`);
        }
      }
      
      console.log(`📊 Returning parsed object with ${parsed.orders?.length} orders`);
      console.log(`  First order: ${JSON.stringify(parsed.orders?.[0])}`);
      console.log(`  Last order: ${JSON.stringify(parsed.orders?.[parsed.orders?.length - 1])}`);
      
      return parsed;
    } else {
      throw new Error('No orders found in extracted response');
    }
  } catch (error) {
    console.error('❌ Failed to parse extraction response:', error);
    console.error('📝 Raw response that failed:', extractionResponse.substring(0, 500));
    
    // Throw error to trigger retry
    throw new Error(`Extraction failed to return valid JSON. Response: ${extractionResponse.substring(0, 200)}...`);
  }
}

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

function parsePercentToDecimal(percentText: string | undefined): number | null {
  if (!percentText) return null;
  const normalized = percentText.replace(/percent/gi, '%').trim();
  if (!normalized) return null;

  const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)[\s-]*(?:to)?[\s-]*(\d+(?:\.\d+)?)%?/i);
  if (rangeMatch) {
    const first = Number.parseFloat(rangeMatch[1]);
    const second = Number.parseFloat(rangeMatch[2]);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return (first + second) / 200;
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
      const addValue = currentValue * percentDecimal;
      return addValue > 0 ? addValue : null;
    }
    case 'BUILD': {
      const targetValue = totalValue * percentDecimal;
      const delta = targetValue - currentValue;
      return delta > 0 ? delta : null;
    }
    case 'EXIT':
      return currentValue;
    default:
      return null;
  }
}

export function convertExtractedOrdersToPlan(extractedOrders: any, context: any) {
  const actions: any[] = [];

  console.log(`📊 Converting ${extractedOrders.orders?.length || 0} extracted orders to plan`);

  const availableCash = context.availableCash || context.currentCash || 0;
  const targetCashAllocation = context.targetCashAllocation ?? context.apiSettings?.target_cash_allocation ?? 20;
  const initialDeployableCap = typeof context.allowedCash === 'number'
    ? Math.max(0, Math.min(availableCash, context.allowedCash))
    : calculateAllowedCash(availableCash, context.totalValue, targetCashAllocation);
  let remainingRawCash = availableCash;
  let allocatedDeployableCash = 0;

  const minPositionPercent = context.apiSettings?.rebalance_min_position_size || 5;
  const minPositionDollars = (minPositionPercent / 100) * context.totalValue;
  const defaultPositionSize = context.apiSettings?.default_position_size_dollars;

  console.log(`📊 Min position size: $${minPositionDollars.toFixed(2)} (${minPositionPercent}% of $${context.totalValue.toFixed(2)})`);
  console.log(`💵 Cash posture: available=$${availableCash.toFixed(2)}, targetCash=${targetCashAllocation}% → initial deployable cap=$${initialDeployableCap.toFixed(2)}`);
  if (defaultPositionSize) {
    console.log(`📊 Default position size for rounding: $${defaultPositionSize}`);
  }

  for (const order of extractedOrders.orders) {
    console.log(`  📝 Processing: ${order.ticker} - ${order.action} - $${order.dollarAmount}`);

    const currentPosition = context.positions.find((p: any) => p.symbol === order.ticker);
    const analysis = context.analyses?.find((a: any) => a.ticker === order.ticker);
    const riskDecision = context.riskManagerDecisions?.[order.ticker];

    const currentValue = currentPosition?.market_value || 0;
    const currentShares = currentPosition?.qty || 0;
    const currentPrice = analysis?.agent_insights?.marketAnalyst?.data?.price?.current ||
      currentPosition?.current_price || 100;

    let riskIntent = (riskDecision?.intent || riskDecision?.decision || 'HOLD').toUpperCase();
    const positionHasHolding = currentValue > 0 || currentShares > 0;
    if (riskIntent === 'BUILD' && positionHasHolding) {
      console.log(`  🔁 ${order.ticker}: Converting BUILD intent to ADD because position already exists`);
      riskIntent = 'ADD';
    }
    const riskTradeDirection = riskDecision
      ? (riskDecision.tradeDirection || mapIntentToTradeDirection(riskIntent))
      : mapIntentToTradeDirection(order.action);
    const suggestedPercent = riskDecision?.suggestedPercent || riskDecision?.executionPlan?.suggestedPercent;
    const suggestedDollarFromPercent = riskDecision
      ? deriveSuggestedDollarAmount(riskIntent, suggestedPercent, currentValue, context.totalValue)
      : null;

    let effectiveAction = riskDecision ? riskTradeDirection : (order.action || 'HOLD');
    let effectiveDollarAmount = order.dollarAmount ?? 0;

    if (riskDecision) {
      switch (riskIntent) {
        case 'EXIT':
          effectiveAction = 'SELL';
          effectiveDollarAmount = currentValue;
          break;
        case 'TRIM':
          effectiveAction = 'SELL';
          if (suggestedDollarFromPercent !== null) {
            effectiveDollarAmount = suggestedDollarFromPercent;
          } else if (effectiveDollarAmount <= 0) {
            effectiveDollarAmount = currentValue * 0.5;
          }
          break;
        case 'ADD':
          effectiveAction = 'BUY';
          if (suggestedDollarFromPercent !== null) {
            effectiveDollarAmount = suggestedDollarFromPercent;
          } else if (effectiveDollarAmount <= 0) {
            effectiveDollarAmount = context.totalValue * 0.02;
          }
          break;
        case 'BUILD':
          effectiveAction = 'BUY';
          if (suggestedDollarFromPercent !== null) {
            effectiveDollarAmount = suggestedDollarFromPercent;
          } else if (effectiveDollarAmount <= 0) {
            effectiveDollarAmount = minPositionDollars;
          }
          break;
        case 'HOLD':
        default:
          effectiveAction = 'HOLD';
          effectiveDollarAmount = 0;
          break;
      }
    }

    if (effectiveAction === 'BUY' && effectiveDollarAmount <= 0 && suggestedDollarFromPercent && suggestedDollarFromPercent > 0) {
      effectiveDollarAmount = suggestedDollarFromPercent;
    }

    let targetValue = currentValue;
    let targetShares = currentShares;

    if (effectiveAction === 'BUY') {
      if (defaultPositionSize) {
        const originalAmount = effectiveDollarAmount;
        effectiveDollarAmount = roundToDefaultPositionSize(effectiveDollarAmount, defaultPositionSize);
        if (originalAmount !== effectiveDollarAmount) {
          console.log(`  📊 Rounded BUY amount: $${originalAmount.toFixed(2)} → $${effectiveDollarAmount.toFixed(2)}`);
        }
      }

      const resultingPositionValue = currentValue + effectiveDollarAmount;
      if (resultingPositionValue > 0 && resultingPositionValue < minPositionDollars) {
        const adjustedAmount = minPositionDollars - currentValue;
        console.log(`⚠️ ${order.ticker}: BUY $${effectiveDollarAmount} would result in position $${resultingPositionValue.toFixed(2)} < min $${minPositionDollars.toFixed(2)}`);
        console.log(`  → Adjusting BUY to $${adjustedAmount.toFixed(2)} to reach minimum position size`);
        effectiveDollarAmount = adjustedAmount;
      }

      const dynamicDeployableCap = calculateAllowedCash(remainingRawCash, context.totalValue, targetCashAllocation);
      const remainingDeployableCash = Math.max(0, dynamicDeployableCap - allocatedDeployableCash);
      const currentCashCap = Math.max(0, Math.min(remainingDeployableCash, remainingRawCash));
      if (effectiveDollarAmount > currentCashCap) {
        console.log(`⚠️ ${order.ticker}: Insufficient deployable cash. Requested: $${effectiveDollarAmount.toFixed(2)}, Allowed: $${currentCashCap.toFixed(2)}`);

        if (currentCashCap <= 0) {
          console.log(`⚠️ ${order.ticker}: Deployable cash exhausted - changing BUY to HOLD`);
          effectiveAction = 'HOLD';
          effectiveDollarAmount = 0;
        } else if (currentCashCap < minPositionDollars && currentValue === 0) {
          console.log(`⚠️ ${order.ticker}: Deployable cash $${currentCashCap.toFixed(2)} < min position $${minPositionDollars.toFixed(2)} - changing BUY to HOLD`);
          effectiveAction = 'HOLD';
          effectiveDollarAmount = 0;
        } else if (currentCashCap < context.totalValue * 0.005) {
          console.log(`⚠️ ${order.ticker}: Deployable cash below 0.5% threshold - changing BUY to HOLD`);
          effectiveAction = 'HOLD';
          effectiveDollarAmount = 0;
        } else {
          console.log(`⚠️ ${order.ticker}: Reducing BUY amount to deployable cash cap: $${currentCashCap.toFixed(2)}`);
          effectiveDollarAmount = currentCashCap;
          const finalPositionValue = currentValue + effectiveDollarAmount;
          if (finalPositionValue < minPositionDollars && currentValue === 0) {
            console.log(`⚠️ ${order.ticker}: Can't reach minimum position with available cash - changing BUY to HOLD`);
            effectiveAction = 'HOLD';
            effectiveDollarAmount = 0;
          }
        }
      }

      if (effectiveAction === 'BUY') {
        targetValue = currentValue + effectiveDollarAmount;
        targetShares = currentShares + (effectiveDollarAmount / currentPrice);
        allocatedDeployableCash += effectiveDollarAmount;
        remainingRawCash = Math.max(0, remainingRawCash - effectiveDollarAmount);
      }
    } else if (effectiveAction === 'SELL') {
      if (defaultPositionSize) {
        const originalAmount = effectiveDollarAmount;
        effectiveDollarAmount = roundToDefaultPositionSize(effectiveDollarAmount, defaultPositionSize);
        if (originalAmount !== effectiveDollarAmount) {
          console.log(`  📊 Rounded SELL amount: $${originalAmount.toFixed(2)} → $${effectiveDollarAmount.toFixed(2)}`);
        }
      }

      if (currentValue > effectiveDollarAmount) {
        const remainingValue = currentValue - effectiveDollarAmount;
        if (remainingValue < minPositionDollars) {
          console.log(`⚠️ ${order.ticker}: Partial sell would leave $${remainingValue.toFixed(2)} < min $${minPositionDollars.toFixed(2)} - selling entire position`);
          effectiveDollarAmount = currentValue;
        }
      }

      targetValue = Math.max(0, currentValue - effectiveDollarAmount);
      targetShares = Math.max(0, currentShares - (effectiveDollarAmount / currentPrice));
      remainingRawCash += effectiveDollarAmount;
    } else {
      effectiveDollarAmount = 0;
    }

    const shareChange = effectiveAction === 'BUY'
      ? (effectiveDollarAmount / currentPrice)
      : effectiveAction === 'SELL'
        ? -(effectiveDollarAmount / currentPrice)
        : 0;

    const roundedShareChange = Math.trunc(shareChange * 100) / 100;
    const nextShares = Math.max(0, currentShares + roundedShareChange);
    const nextValue = nextShares * currentPrice;

    targetShares = nextShares;
    targetValue = nextValue;

    let reasoning = order.reasoning || `Rebalancing ${order.ticker} based on portfolio optimization`;
    if (riskDecision) {
      reasoning = `Risk intent ${riskIntent}` + (suggestedPercent ? ` (${suggestedPercent})` : '');
    } else if (effectiveAction !== (order.action || 'HOLD')) {
      reasoning = `Changed from ${order.action || 'HOLD'} to ${effectiveAction} due to portfolio constraints`;
    }

    if (effectiveAction === 'BUY' && effectiveDollarAmount > 0 && effectiveDollarAmount < (order.dollarAmount || effectiveDollarAmount) && !suggestedDollarFromPercent) {
      reasoning += ' (limited by deployable cash)';
    }

    if (effectiveAction === 'HOLD' && riskDecision && (riskTradeDirection === 'BUY' || riskTradeDirection === 'SELL')) {
      reasoning += ' (blocked by portfolio constraints)';
    }

    actions.push({
      ticker: order.ticker,
      action: effectiveAction,
      currentShares,
      currentValue,
      currentAllocation: (currentValue / context.totalValue) * 100,
      currentPrice,
      targetShares: Math.round(targetShares * 100) / 100,
      targetValue,
      targetAllocation: (targetValue / context.totalValue) * 100,
      shareChange: roundedShareChange,
      dollarAmount: effectiveDollarAmount || 0,
      confidence: order.confidence || riskDecision?.confidence || 70,
      reasoning,
      riskScore: riskDecision?.riskScore || 5,
      riskManagerRecommendation: riskIntent,
      riskManagerTradeDirection: riskTradeDirection,
      suggestedPercent
    });
  }

  console.log(`✅ Created ${actions.length} actions from extracted orders`);
  console.log(`  BUY actions: ${actions.filter(a => a.action === 'BUY').length}`);
  console.log(`  SELL actions: ${actions.filter(a => a.action === 'SELL').length}`);
  console.log(`  HOLD actions: ${actions.filter(a => a.action === 'HOLD').length}`);

  const totalBuyValue = actions.filter(a => a.action === 'BUY').reduce((sum, a) => sum + a.dollarAmount, 0);
  const allowedBuyBudget = initialDeployableCap;

  if (allowedBuyBudget >= 0 && totalBuyValue > allowedBuyBudget && totalBuyValue > 0) {
    const scale = allowedBuyBudget / totalBuyValue;
    console.log(`⚖️ Scaling BUY orders to deployable cash cap: original $${totalBuyValue.toFixed(2)} → $${allowedBuyBudget.toFixed(2)} (scale ${scale.toFixed(2)})`);

    actions.forEach(action => {
      if (action.action !== 'BUY') return;
      const originalAmount = action.dollarAmount;
      const scaledAmount = Math.max(0, Math.round(originalAmount * scale * 100) / 100);

      if (scaledAmount <= 0) {
        console.log(`  ⚠️ ${action.ticker}: BUY scaled to $0 - converting to HOLD`);
        action.action = 'HOLD';
        action.dollarAmount = 0;
        action.shareChange = 0;
        action.targetShares = action.currentShares;
        action.targetValue = action.currentValue;
        action.targetAllocation = action.currentAllocation;
        action.reasoning += ' (scaled to HOLD by cash cap)';
        return;
      }

      if (scaledAmount < minPositionDollars && action.currentValue === 0) {
        console.log(`  ⚠️ ${action.ticker}: Scaled BUY $${scaledAmount.toFixed(2)} < min $${minPositionDollars.toFixed(2)} - converting to HOLD`);
        action.action = 'HOLD';
        action.dollarAmount = 0;
        action.shareChange = 0;
        action.targetShares = action.currentShares;
        action.targetValue = action.currentValue;
        action.targetAllocation = action.currentAllocation;
        action.reasoning += ' (scaled below minimum, holding)';
        return;
      }

      action.dollarAmount = scaledAmount;
      const shareChange = Math.trunc((scaledAmount / action.currentPrice) * 100) / 100;
      action.shareChange = shareChange;
      action.targetShares = action.currentShares + shareChange;
      action.targetValue = action.targetShares * action.currentPrice;
      action.targetAllocation = (action.targetValue / context.totalValue) * 100;
      action.reasoning += ` (scaled by cash cap to $${scaledAmount.toFixed(2)})`;
    });
  }

  const summary = {
    totalTrades: actions.filter(a => a.action !== 'HOLD').length,
    buyOrders: actions.filter(a => a.action === 'BUY').length,
    sellOrders: actions.filter(a => a.action === 'SELL').length,
    totalBuyValue: actions.filter(a => a.action === 'BUY').reduce((sum, a) => sum + a.dollarAmount, 0),
    totalSellValue: actions.filter(a => a.action === 'SELL').reduce((sum, a) => sum + Math.abs(a.dollarAmount), 0),
    expectedCashAfter: context.currentCash +
      actions.filter(a => a.action === 'SELL').reduce((sum, a) => sum + Math.abs(a.dollarAmount), 0) -
      actions.filter(a => a.action === 'BUY').reduce((sum, a) => sum + a.dollarAmount, 0)
  };

  return {
    actions,
    calculatedAllocations: extractedOrders.allocations || {},
    summary
  };
}
