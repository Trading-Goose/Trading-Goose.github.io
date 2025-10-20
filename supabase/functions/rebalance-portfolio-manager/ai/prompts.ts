import { mapIntentToTradeDirection } from '../handlers/rebalance-logic.ts';

function formatRiskDecision(decision: any): string {
  if (!decision) return 'N/A';
  const intent = decision.intent || decision.decision || 'HOLD';
  const trade = decision.tradeDirection || mapIntentToTradeDirection(intent);
  const percent = decision.suggestedPercent || decision.executionPlan?.suggestedPercent || '';
  const confidence = decision.confidence != null ? `${decision.confidence}%` : 'N/A';
  const extras = [];
  if (percent) extras.push(percent);
  extras.push(`→ ${trade}`);
  return `${intent} (${extras.join(', ')}) @ ${confidence}`;
}

export function generateRebalanceAnalysisPrompt(
  targetCashAllocation: number,
  blockedTickers: string[],
  allowedTickers: string[],
  pendingOrdersDisplay: string,
  totalValue: number,
  availableCash: number,
  allowedCash: number,
  currentCash: number,
  positions: any[],
  tickers: string[],
  riskManagerDecisions: Record<string, any>,
  userSettings: any,
  apiSettings: any,
  constraints: any
): string {
  // Helper functions for cleaner status calculation
  const profitTargetRaw = userSettings?.profit_target_percent ?? userSettings?.profit_target ?? apiSettings?.profit_target;
  const stopLossRaw = userSettings?.stop_loss_percent ?? userSettings?.stop_loss ?? apiSettings?.stop_loss;
  const nearLimitRaw = userSettings?.near_limit_threshold_percent ?? userSettings?.near_limit_threshold ?? apiSettings?.near_limit_threshold;
  const nearPositionRaw = userSettings?.near_position_threshold_percent ?? userSettings?.near_position_threshold ?? apiSettings?.near_position_threshold;
  const parsedProfitTarget = Number(profitTargetRaw);
  const parsedStopLoss = Number(stopLossRaw);
  const normalizedProfitTarget = Number.isFinite(parsedProfitTarget) ? parsedProfitTarget : 25;
  const normalizedStopLoss = Number.isFinite(parsedStopLoss) ? parsedStopLoss : 10;
  const normalizedNearLimit = Number.isFinite(Number(nearLimitRaw)) ? Number(nearLimitRaw) : 20;
  const normalizedNearPosition = Number.isFinite(Number(nearPositionRaw)) ? Number(nearPositionRaw) : 20;
  const nearLimitFactor = Math.max(0, Math.min(1, 1 - normalizedNearLimit / 100));
  const nearPositionBuffer = Math.max(0, normalizedNearPosition / 100);

  const getPositionStatus = (p: any) => {
    if (!p.avg_entry_price) return '';
    
    const plPercent = ((p.current_price - p.avg_entry_price) / p.avg_entry_price * 100);
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
  
  const getSizeStatus = (marketValue: number) => {
    const minSize = userSettings?.min_position_size_dollars || constraints?.minPositionSize || 5000;
    const maxSize = userSettings?.max_position_size_dollars || constraints?.maxPositionSize || 25000;
    
    if (marketValue >= maxSize) return 'MAX SIZE';
    if (maxSize > 0 && marketValue >= maxSize * (1 - nearPositionBuffer)) return 'NEAR MAX';
    if (marketValue <= minSize) return 'MIN SIZE';
    if (minSize > 0 && marketValue <= minSize * (1 + nearPositionBuffer)) return 'NEAR MIN';
    return '';
  };

  // Dynamically determine high-confidence threshold based on risk level
  const userRiskLevel = userSettings?.user_risk_level || apiSettings?.user_risk_level || 'moderate';
  
  // Base threshold is 70%, adjusted by risk level (matching adjustConfidenceForRiskLevel logic)
  const getHighConfidenceThreshold = () => {
    const baseThreshold = 70;
    switch(userRiskLevel.toLowerCase()) {
      case 'conservative':
        // Conservative users need higher confidence to act (inverse of 0.95 adjustment)
        return Math.round(baseThreshold / 0.95); // ~74%
      case 'aggressive':
        // Aggressive users act on lower confidence (inverse of 1.05 adjustment)
        return Math.round(baseThreshold / 1.05); // ~67%
      default: // moderate
        return baseThreshold; // 70%
    }
  };
  const highConfidenceThreshold = getHighConfidenceThreshold();

  const deployableCashCap = Math.max(0, Math.min(availableCash, allowedCash));

  return `
  PORTFOLIO MANAGER - Quick Rebalance Decision

  PRIORITIES:
  1. Execute high-confidence (${highConfidenceThreshold}%+) Risk Manager decisions
  2. Keep portfolio cash at or ABOVE the ${targetCashAllocation}% target allocation (never breach the cash floor)
  
  🚨 CRITICAL CONSTRAINT: PENDING ORDERS EXCLUSION
  ${blockedTickers.length > 0 
    ? `⛔ These tickers have PENDING ORDERS and are EXCLUDED from new orders: ${blockedTickers.join(', ')}
  ✅ Only create orders for these allowed tickers: ${allowedTickers.join(', ') || 'NONE - all tickers blocked'}`
    : '✅ All tickers available (no pending orders detected)'}${pendingOrdersDisplay}
  
  PORTFOLIO STATUS:
  - Total Value: $${totalValue.toLocaleString()}
  - Available Cash: $${availableCash.toLocaleString()} (adjusted for pending orders)
  - Allowed Deployable Cash (respecting cash target): $${deployableCashCap.toFixed(0)}
  - Cash Position: ${(currentCash/totalValue*100).toFixed(1)}% vs ${targetCashAllocation}% target
  - Cash Status: ${Math.abs((currentCash/totalValue*100) - targetCashAllocation) < 10 ? 'BALANCED' : (currentCash/totalValue*100) > targetCashAllocation + 10 ? 'EXCESS CASH - Incremental adds allowed while preserving cash floor' : 'LOW CASH - Prioritize rebuilding cash buffer'}
  - User Targets: ${normalizedProfitTarget}% profit / -${normalizedStopLoss}% stop loss (near threshold ±${normalizedNearLimit}%)
  - Position Size Threshold: Near limits within ±${normalizedNearPosition}% of min/max
  
  CURRENT POSITIONS:
  ${positions.map((p: any) => {
    const isInRebalanceList = tickers.includes(p.symbol);
    const rmDecision = riskManagerDecisions?.[p.symbol];
    const positionPercent = (p.market_value/totalValue*100);
    
    // Use the helper functions we defined
    const plStatus = getPositionStatus(p);
    const sizeStatus = getSizeStatus(p.market_value);
    
    const rmDisplay = rmDecision ? formatRiskDecision(rmDecision) : 'N/A';
    return `- ${p.symbol}: $${p.market_value.toFixed(0)} (${positionPercent.toFixed(1)}%) ${plStatus} ${sizeStatus} ${isInRebalanceList ? `[RM: ${rmDisplay}]` : '[NOT IN LIST]'}`;
  }).join('\n')}
  
  RISK MANAGER DECISIONS (for rebalance list only):
  ${Object.entries(riskManagerDecisions || {}).map(([ticker, decision]: [string, any]) => {
    const currentPosition = positions.find((p: any) => p.symbol === ticker);
    const finalAssessment = decision.riskManagerInsights?.finalAssessment;
    const executionPlan = finalAssessment?.executionPlan || decision.executionPlan;
    const suggestedPercent = decision.suggestedPercent || executionPlan?.suggestedPercent || '';
    const tradeDirection = decision.tradeDirection || mapIntentToTradeDirection(decision.intent || decision.decision);
    
    let detailedAssessment = '';
    if (finalAssessment) {
      detailedAssessment = `
    - Risk Assessment Details:
      • Market Risk: ${finalAssessment.marketRisk || 'N/A'}
      • Execution Risk: ${finalAssessment.executionRisk || 'N/A'}
      • Liquidity Risk: ${finalAssessment.liquidityRisk || 'N/A'}
      • Key Risks: ${finalAssessment.keyRisks ? finalAssessment.keyRisks.join(', ') : 'N/A'}
      • Recommended Strategy: ${finalAssessment.recommendations?.moderate?.strategy || 'Standard position with risk controls'}`;
    }
    
    return `
  ${ticker}:
    - Risk Manager Intent: ${decision.intent || decision.decision} (${tradeDirection}) ${decision.confidence}% confidence${suggestedPercent ? ` | Suggested slice: ${suggestedPercent}` : ''}
    - Risk Score: ${decision.riskScore || 'N/A'}/10
    - Current Position: ${currentPosition ? `${currentPosition.qty} shares = $${currentPosition.market_value.toFixed(2)}` : 'NO POSITION'}
    - Current Price: ${currentPosition ? `$${currentPosition.current_price}` : 'N/A'}${detailedAssessment}`;
  }).join('\n')}
  
  USER CONSTRAINTS:
  - Risk Level: ${(userSettings?.user_risk_level || apiSettings.user_risk_level || 'moderate').toUpperCase()}${(() => {
      const riskLevel = userSettings?.user_risk_level || apiSettings.user_risk_level || 'moderate';
      switch(riskLevel.toLowerCase()) {
        case 'conservative':
          return ' (Prioritize: Exit losses, take profits early, smaller positions)';
        case 'aggressive':
          return ' (Prioritize: Ride winners, add to high conviction, larger positions)';
        default:
          return ' (Prioritize: Balanced approach, moderate sizing, risk/reward balance)';
      }
    })()}
  - Max Position: $${userSettings?.max_position_size_dollars?.toFixed(0) || constraints?.maxPositionSize || 25000}
  - Min Position: $${userSettings?.min_position_size_dollars?.toFixed(0) || constraints?.minPositionSize || 5000}
  - Profit Target / Stop Loss: ${normalizedProfitTarget}% / -${normalizedStopLoss}%
  - Near Thresholds: ${normalizedNearLimit}% to target/stop, ${normalizedNearPosition}% for position sizing
  
  YOUR TASK: Make quick strategic decisions with approximate dollar amounts.
  
  DECISION PROCESS (30 seconds max):
  1. Quick scan of Risk Manager decisions
  2. Rough estimate of position sizes needed
  3. Round to multiples of user's default position size
  4. State them as definitive decisions
  
  ${
    // Dynamic cash management based on decisions needed
    (() => {
      const hasBuyDecisions = Object.values(riskManagerDecisions || {}).some((d: any) => {
        const intent = d.intent || d.decision;
        return (d.tradeDirection || mapIntentToTradeDirection(intent)) === 'BUY';
      });
      const hasSellDecisions = Object.values(riskManagerDecisions || {}).some((d: any) => {
        const intent = d.intent || d.decision;
        return (d.tradeDirection || mapIntentToTradeDirection(intent)) === 'SELL';
      });
      
      if (hasBuyDecisions && !hasSellDecisions) {
        // Only BUY decisions - show full cash constraints
        return `💰 CASH AVAILABILITY FOR BUY ORDERS:
  ${deployableCashCap <= 0 
    ? `⛔ NO DEPLOYABLE CASH: Cannot execute ANY BUY orders - only HOLD allowed`
    : deployableCashCap < (userSettings?.default_position_size_dollars || 1000)
    ? `⚠️ LIMITED DEPLOYABLE CASH: Only $${deployableCashCap.toFixed(0)} available - prioritize highest confidence BUYs`
    : `✅ Deployable cash: $${deployableCashCap.toFixed(0)} without breaching cash target`}
  
  🚨 CRITICAL CASH CONSTRAINT FOR BUY ORDERS:
  - MUST maintain positive cash balance after all orders
  - Total BUY orders MUST NOT exceed $${deployableCashCap.toFixed(0)} (allowed deployable cash)
  - If total BUYs would exceed deployable cash, reduce or eliminate lowest confidence BUYs`;
      } else if (hasSellDecisions && !hasBuyDecisions) {
        // Only SELL decisions - emphasize that SELL is always allowed
        return `💰 SELL ORDER EXECUTION:
  - Risk Manager recommends SELL orders which will INCREASE cash
  - SELL orders are always allowed (no cash constraints)
  - Follow Risk Manager confidence levels for sizing
  - Current cash will increase after sells are executed`;
      } else if (hasBuyDecisions && hasSellDecisions) {
        // Mixed BUY and SELL - prioritize based on confidence
        return `💰 MIXED ORDER MANAGEMENT:
  - Execute high-confidence (${highConfidenceThreshold}%+) decisions first
  - SELL orders increase cash, BUY orders require cash
  - Deployable cash for BUYs: $${deployableCashCap.toFixed(0)}
  - Consider executing SELLs first to raise cash for high-confidence BUYs
  - Total BUY orders cannot exceed deployable cash + proceeds from SELLs`;
      } else {
        // All HOLD or no decisions
        return `💰 PORTFOLIO MAINTENANCE:
  - Current cash position: $${availableCash.toFixed(0)} (deployable cap $${deployableCashCap.toFixed(0)})
  - No immediate cash constraints for current decisions`;
      }
    })()
  }
  
  📊 KEY: Each position shows specific actions based on ${(userSettings?.user_risk_level || apiSettings.user_risk_level || 'moderate').toUpperCase()} risk level
  - P/L guidance shows distance to targets and recommended action percentages
  - Size guidance shows room to add/reduce with dollar amounts
  - Combine both to make balanced decisions

  POSITION SIZING GUIDELINES FOR ${userRiskLevel.toUpperCase()} USER:
  ${(() => {
    const defaultSize = userSettings?.default_position_size_dollars || 5000;
    const lowConfidenceThreshold = Math.round(highConfidenceThreshold * 0.75); // 75% of high threshold
    
    switch(userRiskLevel.toLowerCase()) {
      case 'conservative':
        return `- ${highConfidenceThreshold}%+ confidence → 2-3x default ($${(defaultSize * 2).toFixed(0)} - $${(defaultSize * 3).toFixed(0)})
  - ${lowConfidenceThreshold}-${highConfidenceThreshold-1}% confidence → 1-1.5x default ($${defaultSize.toFixed(0)} - $${Math.round(defaultSize * 1.5)})
  - Below ${lowConfidenceThreshold}% confidence → EXIT position or HOLD`;
      case 'aggressive':
        return `- ${highConfidenceThreshold}%+ confidence → 4-6x default ($${(defaultSize * 4).toFixed(0)} - $${(defaultSize * 6).toFixed(0)})
  - ${lowConfidenceThreshold}-${highConfidenceThreshold-1}% confidence → 2-3x default ($${(defaultSize * 2).toFixed(0)} - $${(defaultSize * 3).toFixed(0)})
  - Below ${lowConfidenceThreshold}% confidence → 1x default ($${defaultSize.toFixed(0)}) or add to position`;
      default: // moderate
        return `- ${highConfidenceThreshold}%+ confidence → 3-4x default ($${(defaultSize * 3).toFixed(0)} - $${(defaultSize * 4).toFixed(0)})
  - ${lowConfidenceThreshold}-${highConfidenceThreshold-1}% confidence → 1.5-2x default ($${Math.round(defaultSize * 1.5)} - $${(defaultSize * 2).toFixed(0)})
  - Below ${lowConfidenceThreshold}% confidence → 1x default or reduce position ($${defaultSize.toFixed(0)})`;
    }
  })()}
  - Minimum position: $${userSettings?.min_position_size_dollars?.toFixed(0) || 5000}
  - Maximum position: $${userSettings?.max_position_size_dollars?.toFixed(0) || 25000}
  - IMPORTANT: Total BUY orders cannot exceed $${deployableCashCap.toFixed(0)} (deployable cash cap)
  
  ROUGH TARGETS:
  - Cash: ~${targetCashAllocation}% (don't calculate exactly)
  - Each position: Based on confidence gut feel
  - Round to multiples of: $${userSettings?.default_position_size_dollars || 1000}
  
  🚨 CRITICAL - PENDING ORDERS:
  ${blockedTickers.length > 0 
    ? `⛔ SKIP these tickers (have pending orders): ${blockedTickers.join(', ')}
  ✅ ONLY trade: ${allowedTickers.join(', ') || 'NONE'}`
    : '✅ All tickers available'}
  
  OUTPUT FORMAT (numbered list, EACH ACTION ON A SEPARATE LINE):
  
  ${allowedTickers.length > 0 
    ? `MANDATORY: You MUST provide a decision for EVERY ticker below:
  ${allowedTickers.map((ticker, idx) => `${idx + 1}. [ACTION] $[amount] worth ${ticker}`).join('\n  ')}
  
  Example with actual values (EACH ON ITS OWN LINE):
  1. BUY $15000 worth TSLA
  2. SELL $8500 worth NVDA  
  3. HOLD AAPL
  4. BUY $5000 worth GOOGL
  5. HOLD MSFT`
    : 'NO TRADES - All tickers have pending orders'}
  
  CRITICAL RULES:
  - MUST include ALL ${allowedTickers.length} tickers listed above
  - EACH ACTION MUST BE ON A SEPARATE LINE (press enter after each)
  - One line per ticker, no skipping
  - State definitive amounts (e.g., "$3500" not "about $3500")
  - NO explanations or reasoning
  - Use HOLD if no action needed (but still list the ticker)
  - Be fast - round to clean numbers
  - IMPORTANT: Put each numbered action on its own line
  - Double-check: Did you include all ${allowedTickers.length} tickers?
  `;
}

export function generateRebalanceSystemPrompt(): string {
  return `You are a Rebalance Portfolio Manager optimizing portfolio allocation.

CRITICAL REQUIREMENT: You MUST provide a decision for EVERY ticker in the rebalance list.

DECISION HIERARCHY:
1. High-confidence Risk Manager decisions (follow these first)
2. Portfolio balance toward target allocations
3. Respect the cash floor — available cash must stay ≥ target allocation (constraints apply to BUY orders)

ACTION-SPECIFIC RULES:

FOR SELL ORDERS:
- Always allowed (they INCREASE cash)
- No cash constraints apply to SELL
- Execute based on Risk Manager confidence

FOR BUY ORDERS:
- Respect the allowed deployable cash derived from target cash allocation
- Sum of all BUY orders ≤ Allowed deployable cash (do not breach cash target)
- If insufficient deployable cash → reduce BUY amounts or use HOLD

FOR HOLD ORDERS:
- Always allowed (no cash impact)
- Use when no action needed or constraints prevent trades

OUTPUT RULES:
- Format: "[ACTION] $[amount] worth [TICKER]"
- EACH ACTION ON A SEPARATE LINE - NO EXCEPTIONS
- Press ENTER after each numbered action
- Include ALL tickers - use HOLD if no change needed
- Round to clean numbers
- NO reasoning or explanations
- Never skip a ticker

Example output format:
1. BUY $5000 worth AAPL
2. SELL $3000 worth MSFT
3. HOLD GOOGL

Be fast, be decisive, be complete. Every ticker must have a decision on its own line.`;
}

export function generateReasoningPrompt(
  portfolioManagerDecision: string,
  targetCashAllocation: number,
  totalValue: number,
  availableCash: number,
  allowedCash: number,
  currentCash: number,
  positions: any[],
  tickers: string[],
  riskManagerDecisions: Record<string, any>,
  userSettings: any
): string {
  const deployableCashCap = Math.max(0, Math.min(availableCash, allowedCash));
  const profitTarget = Number(userSettings?.profit_target_percent ?? userSettings?.profit_target ?? 25);
  const stopLoss = Number(userSettings?.stop_loss_percent ?? userSettings?.stop_loss ?? 10);
  const nearLimitThreshold = Number(userSettings?.near_limit_threshold_percent ?? userSettings?.near_limit_threshold ?? 20);
  const nearPositionThreshold = Number(userSettings?.near_position_threshold_percent ?? userSettings?.near_position_threshold ?? 20);
  return `
  As a Rebalance Portfolio Reasoning Analyst, provide detailed explanations for the Rebalance Portfolio Manager's strategic decisions.

REBALANCE PORTFOLIO MANAGER'S DECISIONS:
${portfolioManagerDecision}

PORTFOLIO CONTEXT:
- Total Value: $${totalValue.toLocaleString()}
- Available Cash: $${availableCash.toLocaleString()}
- Allowed Deployable Cash: $${deployableCashCap.toFixed(0)}
- Cash Position: ${(currentCash/totalValue*100).toFixed(1)}% vs ${targetCashAllocation}% target
- Cash Status: ${Math.abs((currentCash/totalValue*100) - targetCashAllocation) < 10 ? 'BALANCED' : (currentCash/totalValue*100) > targetCashAllocation + 10 ? 'EXCESS CASH - Maintain cash floor while staging entries' : 'LOW CASH - Focus on rebuilding liquidity'}

CURRENT POSITIONS:
${positions.map((p: any) => {
  const isInRebalanceList = tickers.includes(p.symbol);
  const rmDecision = riskManagerDecisions?.[p.symbol];
  const rmDisplay = rmDecision ? formatRiskDecision(rmDecision) : 'N/A';
  return `- ${p.symbol}: ${p.qty} shares @ $${p.current_price} = $${p.market_value.toFixed(2)} (${(p.market_value/totalValue*100).toFixed(1)}%) ${isInRebalanceList ? `[RM: ${rmDisplay}]` : '[NOT IN REBALANCE]'}`;
}).join('\n')}

RISK MANAGER ASSESSMENTS:
${Object.entries(riskManagerDecisions || {}).map(([ticker, decision]: [string, any]) => {
  const currentPosition = positions.find((p: any) => p.symbol === ticker);
  const insights = decision.riskManagerInsights;
  const finalAssessment = insights?.finalAssessment;
  const fullAnalysis = insights?.analysis;
  const executionPlan = finalAssessment?.executionPlan || decision.executionPlan;
  const tradeDirection = decision.tradeDirection || mapIntentToTradeDirection(decision.intent || decision.decision);
  const suggestedPercent = decision.suggestedPercent || executionPlan?.suggestedPercent;
  
  let detailedAssessment = '';
  if (finalAssessment) {
    detailedAssessment = `
  - Risk Assessment Details:
    • Market Risk: ${finalAssessment.marketRisk || 'N/A'}
    • Execution Risk: ${finalAssessment.executionRisk || 'N/A'}
    • Liquidity Risk: ${finalAssessment.liquidityRisk || 'N/A'}
    • Key Risks: ${finalAssessment.keyRisks ? finalAssessment.keyRisks.join(', ') : 'N/A'}
    • Recommended Strategy: ${finalAssessment.recommendations?.moderate?.strategy || 'Standard position with risk controls'}`;
  }
  
  // Include a snippet of the full analysis for context (first 500 chars)
  let analysisSnippet = '';
  if (fullAnalysis && fullAnalysis.length > 0) {
    const snippet = fullAnalysis.substring(0, 500);
    analysisSnippet = `
  - Risk Manager Analysis Excerpt: "${snippet}${fullAnalysis.length > 500 ? '...' : ''}"`;
  }
  
  return `
${ticker}:
  - Risk Manager Intent: ${decision.intent || decision.decision} (${tradeDirection}) ${decision.confidence}% confidence${suggestedPercent ? ` | Suggested slice: ${suggestedPercent}` : ''}
  - Risk Score: ${decision.riskScore || 'N/A'}/10
  - Current Position: ${currentPosition ? `$${currentPosition.market_value.toFixed(2)} (${(currentPosition.market_value/totalValue*100).toFixed(1)}%)` : 'NO POSITION'}${detailedAssessment}${analysisSnippet}`;
}).join('\n')}

USER PROFILE:
- Risk Level: ${userSettings?.user_risk_level || 'moderate'}
- Target Allocation: ${targetCashAllocation}% cash, ${100-targetCashAllocation}% stocks
- Targets & Thresholds: ${Number.isFinite(profitTarget) ? profitTarget : 25}% profit / -${Number.isFinite(stopLoss) ? stopLoss : 10}% stop (near limit ±${Number.isFinite(nearLimitThreshold) ? nearLimitThreshold : 20}%), position near-limits ±${Number.isFinite(nearPositionThreshold) ? nearPositionThreshold : 20}% of min/max

YOUR TASK:
Provide detailed reasoning for each decision the Rebalance Portfolio Manager made. Explain:

1. **Portfolio Balance Rationale**: Why these moves improve portfolio balance
2. **Risk Management Logic**: How decisions align with Risk Manager assessments  
3. **Cash Management Strategy**: How moves optimize cash allocation vs target while maintaining positive cash
4. **Cash Constraint Compliance**: How total BUY orders stay within available cash limit
5. **Position Sizing Reasoning**: Why these position sizes make sense
6. **Risk-Adjusted Approach**: How user risk profile influenced decisions

Format your response as detailed explanations that help users understand the strategic thinking behind each trade decision.
`;
}

export function generateReasoningSystemPrompt(): string {
  return `You are a Rebalance Portfolio Reasoning Analyst specializing in explaining strategic portfolio decisions for rebalancing operations.

Your role is to provide clear, educational explanations that help users understand:
- Why specific trades were recommended for portfolio rebalancing
- How portfolio balance considerations influenced decisions
- How risk management principles were applied
- How user preferences and constraints were incorporated

Provide detailed, thoughtful analysis that bridges the gap between quick strategic decisions and user understanding. Focus on educational value and transparency in portfolio management logic.

Use clear headings and bullet points to organize your reasoning. Make complex portfolio management concepts accessible to users with varying levels of investment knowledge.`;
}
