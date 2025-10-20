import { PositionSizingResult } from '../types/interfaces.ts';

export function parsePositionSizing(aiResponse: string, context: any): PositionSizingResult {
  // NO REGEX PARSING - rely on extraction agent for accurate values
  // This function now just provides fallback calculations
  
  // Check if AI response contains HOLD
  if (aiResponse.toUpperCase().includes('HOLD')) {
    console.log(`✅ Detected HOLD in fallback parser`);
    return {
      shares: 0,
      dollarAmount: 0,
      percentOfPortfolio: 0,
      entryPrice: context.currentPrice,
      stopLoss: context.currentPrice * 0.95,
      takeProfit: context.currentPrice * 1.10,
      riskRewardRatio: 2.0,
      reasoning: `Hold position`,
      adjustment: 'none',
      action: 'HOLD'
    };
  }
  
  let dollarAmount = context.defaultPositionSizeDollars;
  let shares = 0;
  let percentOfPortfolio = (dollarAmount / context.totalValue) * 100;
  let reasoning = `Position sized at ${percentOfPortfolio.toFixed(1)}% based on ${context.confidence}% confidence and ${context.userRiskLevel} risk profile`;
  
  // Adjust based on confidence level only (not risk level)
  // These adjustments reflect the strength of the signal, not user preferences
  if (context.confidence >= 80) {
    dollarAmount = dollarAmount * 1.5;
  } else if (context.confidence >= 70) {
    dollarAmount = dollarAmount * 1.2;
  } else if (context.confidence < 60) {
    dollarAmount = dollarAmount * 0.75;
  }
  
  // Risk level should NOT affect position sizing
  // User's default position size already reflects their risk tolerance
  // Only log the risk level for context
  console.log(`📊 User risk level: ${context.userRiskLevel} (position sizing not affected)`)
  
  // Cap at maximum position size
  const maxDollarAmount = (context.maxPositionSize / 100) * context.totalValue;
  dollarAmount = Math.min(dollarAmount, maxDollarAmount);
  
  // IMPORTANT: Cap at allowed deployable cash (respecting target cash allocation)
  const availableCash = context.availableCash || context.currentCash || 0;
  const allowedCash = typeof context.allowedCash === 'number'
    ? Math.max(0, Math.min(availableCash, context.allowedCash))
    : availableCash;

  if (context.decision === 'BUY') {
    if (allowedCash <= 0) {
      console.log(`⚠️ Allowed deployable cash is $0 - returning HOLD`);
      return {
        shares: 0,
        dollarAmount: 0,
        percentOfPortfolio: 0,
        entryPrice: context.currentPrice,
        stopLoss: context.currentPrice * 0.95,
        takeProfit: context.currentPrice * 1.10,
        riskRewardRatio: 2.0,
        reasoning: 'Allowed deployable cash is exhausted - maintaining cash allocation',
        adjustment: 'none',
        action: 'HOLD'
      };
    }

    if (dollarAmount > allowedCash) {
      console.log(`⚠️ Position size limited by allowed cash: $${dollarAmount.toFixed(2)} → $${allowedCash.toFixed(2)}`);
      dollarAmount = allowedCash;
    }

    // If raw available cash is lower than the allowed cap, respect that guard as well
    if (dollarAmount > availableCash) {
      console.log(`⚠️ Position size further limited by raw cash: $${dollarAmount.toFixed(2)} → $${availableCash.toFixed(2)}`);
      dollarAmount = availableCash;
    }

    if (dollarAmount <= 0) {
      console.log(`⚠️ Deployable cash insufficient after constraints - returning HOLD`);
      return {
        shares: 0,
        dollarAmount: 0,
        percentOfPortfolio: 0,
        entryPrice: context.currentPrice,
        stopLoss: context.currentPrice * 0.95,
        takeProfit: context.currentPrice * 1.10,
        riskRewardRatio: 2.0,
        reasoning: 'Insufficient deployable cash for BUY - holding position',
        adjustment: 'none',
        action: 'HOLD'
      };
    }
  }
  
  // Calculate percentage and shares
  percentOfPortfolio = (dollarAmount / context.totalValue) * 100;
  shares = context.currentPrice > 0 ? Math.floor(dollarAmount / context.currentPrice) : 0;
  
  // Default risk management values
  const entryPrice = context.currentPrice;
  const stopLoss = context.currentPrice * 0.95;
  const takeProfit = context.currentPrice * 1.10;
  const riskRewardRatio = 2.0;
  
  return {
    shares,
    dollarAmount,
    percentOfPortfolio,
    entryPrice,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    reasoning,
    adjustment: 'none',
    action: context.decision as 'BUY' | 'SELL' | 'HOLD'
  };
}

export async function extractPositionSizing(aiResponse: string, context: any, apiSettings?: any): Promise<PositionSizingResult> {
  // Direct parsing instead of AI extraction
  // Look for patterns: "HOLD TICKER", "BUY $X worth TICKER", "SELL $X worth TICKER"
  const holdPattern = /^(?:.*?)?(HOLD)\s+([A-Z0-9]+(?:\/[A-Z0-9]+)?)/im;
  const tradePattern = /^(?:.*?)?(BUY|SELL)\s+\$([0-9,]+)\s+worth\s+([A-Z0-9]+(?:\/[A-Z0-9]+)?)/im;
  
  let action = 'HOLD';
  let dollarAmount = 0;
  let ticker = context.ticker;
  
  // Try to match trade pattern first (BUY/SELL with amount)
  const tradeMatch = aiResponse.match(tradePattern);
  if (tradeMatch) {
    action = tradeMatch[1].toUpperCase();
    dollarAmount = parseInt(tradeMatch[2].replace(/,/g, ''));
    ticker = tradeMatch[3].toUpperCase();
    console.log(`📝 Extracted from Analysis Portfolio Manager: ${action} $${dollarAmount} worth ${ticker}`);
  } else {
    // Try to match HOLD pattern
    const holdMatch = aiResponse.match(holdPattern);
    if (holdMatch) {
      action = 'HOLD';
      ticker = holdMatch[2].toUpperCase();
      console.log(`📝 Extracted from Analysis Portfolio Manager: HOLD ${ticker}`);
    } else {
      console.log(`⚠️ Could not parse Analysis Portfolio Manager decision, defaulting to HOLD`);
    }
  }
  
  // Get min position size in dollars
  const minPositionPercent = apiSettings?.rebalance_min_position_size || 5;
  const minPositionDollars = (minPositionPercent / 100) * context.totalValue;
  
  // Apply min position size checks
  if (context.currentPosition) {
    const currentPositionValue = context.currentPosition.market_value || 0;
    
    if (action === 'HOLD') {
      if (currentPositionValue > 0 && currentPositionValue < minPositionDollars) {
        // Check if this is likely a position that was bought at min size but declined
        const stopLossPercent = apiSettings?.stop_loss || 10; // Default 10% stop loss
        const maxExpectedLoss = minPositionDollars * (stopLossPercent / 100);
        const actualLoss = minPositionDollars - currentPositionValue;
        
        if (actualLoss <= maxExpectedLoss) {
          // Loss is within expected stop loss range - keep HOLD
          console.log(`📊 ${ticker}: Position $${currentPositionValue.toFixed(2)} < min $${minPositionDollars.toFixed(2)}, but loss within ${stopLossPercent}% range - keeping HOLD`);
        } else {
          // Loss exceeds stop loss - convert to SELL
          console.log(`⚠️ ${ticker}: Position value $${currentPositionValue.toFixed(2)} < min $${minPositionDollars.toFixed(2)} and loss exceeds ${stopLossPercent}% - converting HOLD to SELL`);
          action = 'SELL';
          dollarAmount = currentPositionValue;
        }
      }
    } else if (action === 'SELL') {
      if (currentPositionValue > 0 && currentPositionValue < minPositionDollars) {
        // For explicit SELL, always sell the full position if below minimum
        console.log(`⚠️ ${ticker}: Position value $${currentPositionValue.toFixed(2)} < min $${minPositionDollars.toFixed(2)} - converting ${action} to SELL full position`);
        action = 'SELL';
        dollarAmount = currentPositionValue;
      } else if (dollarAmount > 0 && dollarAmount < currentPositionValue) {
        // Check if partial sell would leave position below minimum
        const remainingValue = currentPositionValue - dollarAmount;
        if (remainingValue > 0 && remainingValue < minPositionDollars) {
          console.log(`⚠️ ${ticker}: Partial sell would leave $${remainingValue.toFixed(2)} < min $${minPositionDollars.toFixed(2)} - selling entire position`);
          dollarAmount = currentPositionValue;
        }
      }
    } else if (action === 'BUY') {
      // Check if resulting position would meet minimum size
      const resultingPositionValue = currentPositionValue + dollarAmount;
      if (resultingPositionValue > 0 && resultingPositionValue < minPositionDollars) {
        const adjustedAmount = minPositionDollars - currentPositionValue;
        console.log(`⚠️ ${ticker}: BUY $${dollarAmount} would result in position $${resultingPositionValue.toFixed(2)} < min $${minPositionDollars.toFixed(2)}`);
        console.log(`  → Adjusting BUY to $${adjustedAmount.toFixed(2)} to reach minimum position size`);
        dollarAmount = adjustedAmount;
      }
    }
  } else if (action === 'BUY') {
    // New position - ensure it meets minimum size
    if (dollarAmount > 0 && dollarAmount < minPositionDollars) {
      console.log(`⚠️ ${ticker}: BUY $${dollarAmount} for new position < min $${minPositionDollars.toFixed(2)}`);
      console.log(`  → Adjusting BUY to $${minPositionDollars.toFixed(2)} to meet minimum position size`);
      dollarAmount = minPositionDollars;
    }
  }
  
  // Return the parsed and validated position sizing
  return {
    action: action as 'BUY' | 'SELL' | 'HOLD',
    dollarAmount,
    shares: 0,
    percentOfPortfolio: (dollarAmount / context.totalValue) * 100,
    entryPrice: context.currentPrice,
    stopLoss: context.currentPrice * 0.95,
    takeProfit: context.currentPrice * 1.10,
    riskRewardRatio: 2.0,
    reasoning: '', // Will be generated by reasoning step
    adjustment: 'none'
  };
}
