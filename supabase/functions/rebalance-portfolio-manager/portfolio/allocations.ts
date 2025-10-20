import { mapIntentToTradeDirection } from '../handlers/rebalance-logic.ts';

export function calculateOptimalAllocations(
  stocks: string[],
  riskManagerDecisions: Record<string, any>,
  targetCashAllocation: number,
  _totalValue: number,
  userRiskLevel: 'conservative' | 'moderate' | 'aggressive' = 'moderate'
): Record<string, number> {
  const allocations: Record<string, number> = {};
  const stockAllocation = 100 - targetCashAllocation;

  console.log(`🎯 CALCULATING OPTIMAL ALLOCATIONS:`);
  console.log(`  - Total stocks to consider: ${stocks.length}`);
  console.log(`  - Stock allocation budget: ${stockAllocation}%`);
  console.log(`  - User risk level: ${userRiskLevel}`);
  console.log(`  - Stocks: ${stocks.join(', ')}`);

  // Separate stocks by risk manager recommendation
  const buyStocks: string[] = [];
  const holdStocks: string[] = [];
  const sellStocks: string[] = [];
  const unanalyzedStocks: string[] = [];

  stocks.forEach(ticker => {
    const decision = riskManagerDecisions?.[ticker];
    const intent = (decision?.intent || decision?.decision || 'HOLD').toUpperCase();
    const tradeDirection = decision?.tradeDirection || mapIntentToTradeDirection(intent);

    if (!decision) {
      unanalyzedStocks.push(ticker);
    } else if (tradeDirection === 'BUY') {
      buyStocks.push(ticker);
    } else if (tradeDirection === 'SELL') {
      sellStocks.push(ticker);
    } else {
      holdStocks.push(ticker);
    }
  });

  const summarize = (tickers: string[]) => tickers.map(t => {
    const rmDecision = riskManagerDecisions?.[t];
    if (!rmDecision) return t;
    const intent = rmDecision.intent || rmDecision.decision;
    const trade = rmDecision.tradeDirection || mapIntentToTradeDirection(intent);
    return `${t} (${intent || trade})`;
  }).join(', ');

  console.log(`  📈 BUY recommendations: ${buyStocks.length ? summarize(buyStocks) : 'none'}`);
  console.log(`  📉 SELL recommendations: ${sellStocks.length ? summarize(sellStocks) : 'none'}`);
  console.log(`  ➡️ HOLD recommendations: ${holdStocks.length ? summarize(holdStocks) : 'none'}`);
  console.log(`  ❓ Unanalyzed stocks: ${unanalyzedStocks.join(', ') || 'none'}`);

  // Fixed position limits - not affected by risk level
  // These should be configured by user settings, not risk profile
  const positionLimits = {
    maxPerStock: 25,  // Maximum allocation per stock
    minPerStock: 5    // Minimum allocation per stock
  };

  // Calculate allocations based on recommendations
  let remainingAllocation = stockAllocation;

  // First, allocate to BUY recommendations based on confidence and risk level
  if (buyStocks.length > 0) {
    const totalBuyConfidence = buyStocks.reduce((sum, ticker) =>
      sum + (riskManagerDecisions[ticker]?.confidence || 70), 0
    );

    buyStocks.forEach(ticker => {
      const rmDecision = riskManagerDecisions[ticker] || {};
      const confidence = rmDecision.confidence || 70;
      const riskScore = rmDecision.riskScore || 5;

      // Base allocation proportional to confidence
      // Uses full stockAllocation without risk-based reduction
      let baseAllocation = (confidence / totalBuyConfidence) * stockAllocation;

      // Risk level affects decision-making thresholds, not allocation amounts
      // Conservative users might avoid very high-risk stocks
      if (userRiskLevel === 'conservative' && riskScore > 8) {
        baseAllocation *= 0.8; // Only for very high-risk stocks (>8/10)
      }
      // Aggressive users might boost very high-confidence opportunities  
      else if (userRiskLevel === 'aggressive' && confidence > 75) {
        baseAllocation *= 1.1; // Only for very high confidence (>75%)
      }

      // Apply fixed min/max constraints not based on risk level
      allocations[ticker] = Math.min(positionLimits.maxPerStock, Math.max(positionLimits.minPerStock, baseAllocation));
      remainingAllocation -= allocations[ticker];
    });
  }

  // SELL stocks get minimal or zero allocation
  sellStocks.forEach(ticker => {
    const rmDecision = riskManagerDecisions[ticker];
    const intent = rmDecision?.intent || rmDecision?.decision || 'HOLD';
    allocations[ticker] = intent === 'TRIM' ? positionLimits.minPerStock : 0;
  });

  // HOLD stocks maintain allocations based on risk level
  if (holdStocks.length > 0 && remainingAllocation > 0) {
    const maxHoldAllocation = userRiskLevel === 'conservative' ? 8 :
      userRiskLevel === 'aggressive' ? 12 : 10;
    const perHoldStock = Math.min(maxHoldAllocation, remainingAllocation / holdStocks.length);
    holdStocks.forEach(ticker => {
      allocations[ticker] = perHoldStock;
      remainingAllocation -= perHoldStock;
    });
  }

  // Unanalyzed stocks get minimal allocation (conservative approach)
  if (unanalyzedStocks.length > 0 && remainingAllocation > 0) {
    const maxUnanalyzedAllocation = userRiskLevel === 'conservative' ? 3 :
      userRiskLevel === 'aggressive' ? 7 : 5;
    const perUnanalyzedStock = Math.min(maxUnanalyzedAllocation, remainingAllocation / unanalyzedStocks.length);
    unanalyzedStocks.forEach(ticker => {
      allocations[ticker] = perUnanalyzedStock;
      remainingAllocation -= perUnanalyzedStock;
    });
  }

  // Redistribute any remaining allocation to BUY stocks
  if (remainingAllocation > 0 && buyStocks.length > 0) {
    const extraPerBuy = remainingAllocation / buyStocks.length;
    buyStocks.forEach(ticker => {
      allocations[ticker] = Math.min(25, allocations[ticker] + extraPerBuy);
    });
  }

  console.log(`  📊 FINAL ALLOCATIONS:`);
  Object.entries(allocations).forEach(([ticker, allocation]) => {
    console.log(`    - ${ticker}: ${allocation.toFixed(2)}%`);
  });

  return allocations;
}
