type PortfolioIntent = 'BUILD' | 'ADD' | 'TRIM' | 'EXIT' | 'HOLD';
type TradeDirection = 'BUY' | 'SELL' | 'HOLD';

export function generateIndividualAnalysisPrompt(
  ticker: string,
  totalValue: number,
  availableCash: number,
  currentPosition: any,
  userRiskLevel: string,
  riskIntent: PortfolioIntent,
  effectiveIntent: PortfolioIntent,
  tradeDirection: TradeDirection,
  confidence: number,
  originalConfidence: number,
  riskAssessment: any,
  currentPrice: number,
  maxPositionSizeDollars: number,
  minPositionSizeDollars: number,
  pendingOrdersInfo: string,
  pendingOrdersForTicker: any[],
  intentWarning: string,
  pendingOrderOverride: string,
  hasPendingBuy: boolean,
  defaultPositionSize: number = 1000,
  allowedCash: number = availableCash,
  targetCashAllocationPercent: number = 20,
  profitTargetPercent: number = 25,
  stopLossPercent: number = 10,
  nearLimitThresholdPercent: number = 20,
  nearPositionThresholdPercent: number = 20
): string {
  const safePendingOrders = Array.isArray(pendingOrdersForTicker) ? pendingOrdersForTicker : [];
  const safePendingOrdersInfo = typeof pendingOrdersInfo === 'string' ? pendingOrdersInfo : '';

  const rawMinPositionValue = Number(minPositionSizeDollars);
  const rawMaxPositionValue = Number(maxPositionSizeDollars);
  const numericMinPositionValue = Number.isFinite(rawMinPositionValue) ? rawMinPositionValue : 0;
  const numericMaxPositionValue = Number.isFinite(rawMaxPositionValue) ? rawMaxPositionValue : 0;
  const normalizedProfitTarget = Number.isFinite(profitTargetPercent) ? profitTargetPercent : 25;
  const normalizedStopLoss = Number.isFinite(stopLossPercent) ? stopLossPercent : 10;
  const normalizedNearLimitPercent = Number.isFinite(nearLimitThresholdPercent) ? nearLimitThresholdPercent : 20;
  const normalizedNearPositionPercent = Number.isFinite(nearPositionThresholdPercent) ? nearPositionThresholdPercent : 20;
  const nearLimitFactor = Math.max(0, Math.min(1, 1 - (normalizedNearLimitPercent / 100)));
  const nearPositionBuffer = Math.max(0, normalizedNearPositionPercent / 100);

  // Helper functions for cleaner status calculation
  const getPositionStatus = (position: any) => {
    if (!position?.avg_entry_price) return '';
    
    const plPercent = ((position.current_price - position.avg_entry_price) / position.avg_entry_price * 100);
    const profitTarget = normalizedProfitTarget;
    const stopLoss = normalizedStopLoss;

    if (plPercent >= profitTarget) return '🎯 ABOVE TARGET';
    if (plPercent >= profitTarget * nearLimitFactor) return '📊 NEAR TARGET';
    if (plPercent <= -stopLoss) return '🔥 BELOW STOP';
    if (plPercent <= -stopLoss * nearLimitFactor) return '⚠️ NEAR STOP';
    if (plPercent > 0) return '✅ PROFITABLE';
    if (plPercent < 0) return '📉 LOSING';
    return '➖ BREAKEVEN';
  };
  
  const getSizeStatus = (position: any) => {
    if (!position) return '';
    const positionValue = position.market_value;

    if (numericMaxPositionValue > 0 && positionValue >= numericMaxPositionValue) return 'MAX SIZE';
    if (numericMaxPositionValue > 0 && positionValue >= numericMaxPositionValue * (1 - nearPositionBuffer)) return 'NEAR MAX';
    if (numericMinPositionValue > 0 && positionValue <= numericMinPositionValue) return 'MIN SIZE';
    if (numericMinPositionValue > 0 && positionValue <= numericMinPositionValue * (1 + nearPositionBuffer)) return 'NEAR MIN';
    return '';
  };
  
  // Dynamic confidence thresholds based on risk level (matching adjustConfidenceForRiskLevel logic)
  const getHighConfidenceThreshold = () => {
    const baseThreshold = 80;
    switch(userRiskLevel.toLowerCase()) {
      case 'conservative':
        return Math.round(baseThreshold / 0.95); // ~84%
      case 'aggressive':
        return Math.round(baseThreshold / 1.05); // ~76%
      default:
        return baseThreshold; // 80%
    }
  };
  const highConfidenceThreshold = getHighConfidenceThreshold();
  const lowConfidenceThreshold = Math.round(highConfidenceThreshold * 0.75);
  
  // Simplified position information
  const positionInfo = currentPosition ? 
    `${currentPosition.qty} shares = $${currentPosition.market_value.toFixed(0)} (${((currentPosition.market_value/totalValue)*100).toFixed(1)}%) ${getPositionStatus(currentPosition)} ${getSizeStatus(currentPosition)}` :
    'No position';
  const normalizedTargetPercent = Math.max(0, Math.min(1, targetCashAllocationPercent > 1 ? targetCashAllocationPercent / 100 : targetCashAllocationPercent));
  const targetCashDollars = totalValue * normalizedTargetPercent;
  const deployableCashCap = Math.max(0, Math.min(availableCash, allowedCash));
  const plan = riskAssessment?.executionPlan || {};
  const planSuggestedPercent = plan.suggestedPercent || '';
  const planNote = plan.note || '';

  const currentAllocationPercent = currentPosition ? ((currentPosition.market_value / totalValue) * 100) : 0;
  const minPositionPercent = totalValue > 0 ? (numericMinPositionValue / totalValue) * 100 : 0;
  const maxPositionPercent = totalValue > 0 ? (numericMaxPositionValue / totalValue) * 100 : 0;
  const remainingCapacityPercent = Math.max(0, maxPositionPercent - currentAllocationPercent);
  const plPercent = currentPosition && currentPosition.avg_entry_price
    ? ((currentPosition.current_price - currentPosition.avg_entry_price) / currentPosition.avg_entry_price) * 100
    : null;

  const formattedPL = plPercent !== null
    ? `${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(1)}% unrealized P/L`
    : 'Unrealized P/L unavailable';

  const trimDescriptor = planSuggestedPercent || (planNote ? planNote : 'Reduce ~25-35% of the current allocation');
  const addDescriptor = planSuggestedPercent || (planNote ? planNote : 'Add ~15-25% of the existing allocation');
  const buildDescriptor = planSuggestedPercent || (planNote ? planNote : 'Target 1-3% starter allocation of total portfolio');

  const intentDirective = (() => {
    switch (effectiveIntent) {
      case 'TRIM':
        return `TRIM DIRECTIVE:\n  • Execute a partial SELL sized at ${trimDescriptor} of the live position.\n  • Current allocation: ${currentAllocationPercent.toFixed(1)}% (${formattedPL}).\n  • Maintain at least ${minPositionPercent.toFixed(1)}% allocation post-trim unless EXIT is explicitly required.\n  • Use dollar-based sizing derived from the trim percentage; avoid full liquidation.`;
      case 'ADD':
        return `ADD DIRECTIVE:\n  • Increase exposure using ${addDescriptor} while respecting cash and sizing limits.\n  • Current allocation: ${currentAllocationPercent.toFixed(1)}% → Max: ${maxPositionPercent.toFixed(1)}% (headroom ${remainingCapacityPercent.toFixed(1)}%).\n  • Never exceed deployable cash nor the max position size.\n  • Prefer dollar-based BUY orders keyed to the add percentage.`;
      case 'EXIT':
        return `EXIT DIRECTIVE:\n  • Close the entire position (SELL 100%).\n  • Final allocation should be 0% with all capital released.\n  • Highlight the Risk Manager's rationale in your explanation.`;
      case 'BUILD':
        return `BUILD DIRECTIVE:\n  • Initiate a new position targeting ~${buildDescriptor} of total portfolio value (bounded by ${minPositionPercent.toFixed(1)}%-${maxPositionPercent.toFixed(1)}% user limits).\n  • Obey the deployable cash ceiling and default sizing increments.\n  • Structure BUY orders to allow staged entries if useful.`;
      case 'HOLD':
      default:
        return `HOLD DIRECTIVE:\n  • Do not submit trade orders.\n  • Center the explanation on why maintaining the current allocation is prudent.\n  • Reference catalysts or constraints keeping the position unchanged.`;
    }
  })();

  return `
  PORTFOLIO MANAGER - Individual Stock Decision for ${ticker}${safePendingOrdersInfo}

  PORTFOLIO CONTEXT:
  - Total Portfolio Value: $${totalValue.toLocaleString()}
  - Available Cash: $${availableCash.toLocaleString()} (adjusted for pending orders)
  - Target Cash Allocation: ${Math.round(normalizedTargetPercent * 100)}% ($${targetCashDollars.toFixed(0)})
  - Allowed Deployable Cash (hard cap): $${deployableCashCap.toFixed(0)}
  - Cash Policy: Keep available cash at or ABOVE the target allocation — never spend past the deployable cap
  - Current ${ticker} Position: ${positionInfo}
  - User Risk Level: ${userRiskLevel.toUpperCase()}
  - User Targets: ${normalizedProfitTarget}% profit target / -${normalizedStopLoss}% stop loss (near threshold ±${normalizedNearLimitPercent}%)
  - Position Size Thresholds: Near max/min within ±${normalizedNearPositionPercent}% of limits
  
  RISK MANAGER RECOMMENDATION:
  - Risk Manager Intent: ${riskIntent}
  - Effective Intent: ${effectiveIntent} (${tradeDirection})${intentWarning}${pendingOrderOverride}
  - Confidence: ${confidence}% ${originalConfidence !== confidence ? `(risk-adjusted from ${originalConfidence}% for ${userRiskLevel} user)` : ''}
  - Current Price: $${currentPrice}
  - Min Position Size: $${numericMinPositionValue.toFixed(0)}
  - Max Position Size: $${numericMaxPositionValue.toFixed(0)}
  
  OPERATING DIRECTIVE FOR THIS DECISION:
  ${intentDirective}

  POSITION SIZING GUIDE FOR ${userRiskLevel.toUpperCase()} USER:
  ${(() => {
    switch(userRiskLevel.toLowerCase()) {
      case 'conservative':
        return `- ${highConfidenceThreshold}%+ confidence → 2-3x default ($${defaultPositionSize * 2}-$${defaultPositionSize * 3})
  - ${lowConfidenceThreshold}-${highConfidenceThreshold-1}% confidence → 1-1.5x default ($${defaultPositionSize}-$${Math.round(defaultPositionSize * 1.5)})
  - <${lowConfidenceThreshold}% confidence → HOLD (no new positions)`;
      case 'aggressive':
        return `- ${highConfidenceThreshold}%+ confidence → 4-6x default ($${defaultPositionSize * 4}-$${defaultPositionSize * 6})
  - ${lowConfidenceThreshold}-${highConfidenceThreshold-1}% confidence → 2-3x default ($${defaultPositionSize * 2}-$${defaultPositionSize * 3})
  - <${lowConfidenceThreshold}% confidence → 1x default ($${defaultPositionSize}) or HOLD`;
      default: // moderate
        return `- ${highConfidenceThreshold}%+ confidence → 3-4x default ($${defaultPositionSize * 3}-$${defaultPositionSize * 4})
  - ${lowConfidenceThreshold}-${highConfidenceThreshold-1}% confidence → 1.5-2x default ($${Math.round(defaultPositionSize * 1.5)}-$${defaultPositionSize * 2})
  - <${lowConfidenceThreshold}% confidence → 1x default ($${defaultPositionSize}) or HOLD`;
    }
  })()}
  
  ${
    // Only include cash management section if Risk Manager suggests BUY
    tradeDirection === 'BUY' ? `
  💰 CASH AVAILABILITY CHECK:
  - Raw available cash: $${availableCash.toFixed(0)}
  - Target cash floor: ${Math.round(normalizedTargetPercent * 100)}% ($${targetCashDollars.toFixed(0)})
  - Allowed to deploy (hard cap): $${deployableCashCap.toFixed(0)}

  ${deployableCashCap <= 0 
    ? `⛔ NO DEPLOYABLE CASH: Respond with "HOLD ${ticker}" to preserve the target cash allocation`
    : deployableCashCap < defaultPositionSize
    ? `⚠️ LIMITED DEPLOYABLE CASH: Only $${deployableCashCap.toFixed(0)} available under cash policy - consider HOLD or size within the cap`
    : `✅ You may deploy up to $${deployableCashCap.toFixed(0)} without breaching the cash policy`}
  
  🚨 CRITICAL CASH CONSTRAINT FOR BUY ORDER:
  - MUST maintain positive cash balance after BUY order
  - BUY order MUST NOT exceed $${deployableCashCap.toFixed(0)}
  - If BUY would breach the cash floor, reduce amount or use HOLD
  - Never recommend a BUY amount greater than the allowed deployable cash cap`
    : tradeDirection === 'SELL' ? `
  💰 SELL ORDER GUIDANCE:
  - Action intent: ${effectiveIntent}${effectiveIntent === 'TRIM' ? ` (target ${trimDescriptor})` : effectiveIntent === 'EXIT' ? ' (full close)' : ''}
  - Current position value: $${currentPosition?.market_value?.toFixed(0) || 0}
  - SELL orders increase cash and reduce risk
  - Follow the directive above when sizing partial vs. full exits`
    : `
  💰 HOLD DECISION:
  - No cash impact from HOLD decision
  - Maintain current position`
  }
  
  🚨 CRITICAL: If ${ticker} has ANY pending orders, you MUST respond with HOLD.
  
  ${safePendingOrders.length > 0 
    ? `⛔ STOP: ${ticker} has pending orders. You MUST respond: "HOLD ${ticker}"`
    : ''}
  
  OUTPUT FORMAT (one line only):
  [ACTION] $[amount] worth ${ticker}
  
  Examples: BUY $3000 worth ${ticker} | SELL $2000 worth ${ticker} | HOLD ${ticker}
  `;
}

export function generateIndividualSystemPrompt(): string {
  return `You make quick portfolio decisions for individual stock analysis. Output format: [ACTION] $[amount] worth [TICKER]

DECISION HIERARCHY:
1. If pending orders exist → always HOLD
2. If Risk Manager recommends SELL → execute SELL (cash constraints don't apply to SELL)
3. If Risk Manager recommends BUY → check cash constraints first
4. If Risk Manager recommends HOLD → maintain position

ACTION-SPECIFIC RULES:

FOR SELL ORDERS:
- Always allowed (they increase cash, not decrease it)
- Follow Risk Manager's confidence-based sizing
- No cash constraints apply

FOR BUY ORDERS:
- MUST respect the allowed deployable cash limit derived from target cash allocation
- Never exceed the allowed deployable cash or raw available cash amounts
- If insufficient deployable cash → use HOLD instead (maintain cash at/above the target)

FOR HOLD ORDERS:
- Always allowed (no cash impact)
- Default when constraints prevent other actions

GENERAL RULES:
- Use confidence to size positions
- Round to clean numbers
- One line response only`;
}

export function generateIndividualReasoningPrompt(
  portfolioManagerDecision: string,
  ticker: string,
  totalValue: number,
  availableCash: number,
  currentPosition: any,
  userRiskLevel: string,
  riskIntent: PortfolioIntent,
  confidence: number,
  riskAssessment: any,
  currentPrice: number,
  maxPositionSize: number,
  allowedCash: number,
  targetCashAllocationPercent: number
): string {
  const normalizedTargetPercent = Math.max(0, Math.min(1, targetCashAllocationPercent > 1 ? targetCashAllocationPercent / 100 : targetCashAllocationPercent));
  const targetCashDollars = totalValue * normalizedTargetPercent;
  const deployableCashCap = Math.max(0, Math.min(availableCash, allowedCash));
  return `
  As an Analysis Portfolio Reasoning Analyst, provide detailed explanations for the Analysis Portfolio Manager's individual stock decision.

ANALYSIS PORTFOLIO MANAGER'S DECISION:
${portfolioManagerDecision}

ANALYSIS CONTEXT:
- Ticker: ${ticker}
- Total Portfolio Value: $${totalValue.toLocaleString()}
- Available Cash: $${availableCash.toLocaleString()}
- Target Cash Allocation: ${Math.round(normalizedTargetPercent * 100)}% ($${targetCashDollars.toFixed(0)})
- Allowed Deployable Cash: $${deployableCashCap.toFixed(0)}
- Current ${ticker} Position: ${currentPosition ? `${currentPosition.qty} shares worth $${currentPosition.market_value.toFixed(0)} (${(currentPosition.market_value/totalValue*100).toFixed(1)}%)` : 'No position'}
- Current Price: $${currentPrice}
- User Risk Level: ${userRiskLevel}
- Max Position Limit: ${maxPositionSize}% of portfolio

RISK MANAGER ASSESSMENT:
- Intent: ${riskIntent}
- Confidence: ${confidence}%
- Risk Assessment: ${riskAssessment?.reasoning || 'Based on comprehensive analysis'}
- Risk Score: ${riskAssessment?.riskScore || 'N/A'}/10

YOUR TASK:
Provide detailed reasoning for the Analysis Portfolio Manager's decision. Explain:

1. **Decision Rationale**: Why BUY/SELL/HOLD was chosen for this specific situation
2. **Cash Constraint Compliance**: How the decision respects available cash limits and maintains positive balance
3. **Position Sizing Logic**: How the dollar amount was determined based on confidence and portfolio size
4. **Risk Alignment**: How the decision aligns with Risk Manager assessment and user risk profile
5. **Portfolio Impact**: How this trade affects overall portfolio balance and diversification
6. **Timing Considerations**: Why this is an appropriate time to make this move

Format your response as a comprehensive explanation that helps users understand the strategic thinking behind this individual stock decision.
`;
}

export function generateReasoningSystemPrompt(): string {
  return `You are an Analysis Portfolio Reasoning Analyst specializing in explaining strategic portfolio decisions for individual stock analysis.

Your role is to provide clear, educational explanations that help users understand:
- Why specific trades were recommended for individual stocks
- How cash constraints and liquidity requirements influenced decisions
- How portfolio balance considerations influenced decisions
- How risk management principles were applied
- How user preferences and constraints were incorporated
- Why maintaining positive cash balance is crucial for portfolio health

Provide detailed, thoughtful analysis that bridges the gap between quick strategic decisions and user understanding. Focus on educational value and transparency in portfolio management logic.

Use clear headings and bullet points to organize your reasoning. Make complex portfolio management concepts accessible to users with varying levels of investment knowledge.`;
}
