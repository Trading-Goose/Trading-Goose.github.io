import { MarketData } from './types.ts';

export function generateExtractionPrompt(analysis: string, watchlistData: MarketData[]): string {

  return `Find the "Proceed with full specialist analysis" section and extract the numbered stock list.

ANALYSIS TEXT:
${analysis}

TASK: Look for this EXACT section:
"Proceed with full specialist analysis on the following stocks (in priority order): 1) TICKER1 (...), 2) TICKER2 (...), 3) TICKER3 (...)"

EXTRACTION STEPS:
1. Find the section that starts with "Proceed with full specialist analysis"
2. Extract ONLY the numbered tickers from that list: 1) 2) 3) etc.
3. Assign priority based on the number: 1) = high, 2) = medium, 3) = low
4. Extract the reason from the parentheses after each ticker

EXAMPLE INPUT:
"Proceed with full specialist analysis on: 1) MU (near support with low RSI), 2) PDD (momentum near 52-week high), 3) AMD (strong 1M momentum)"

EXPECTED OUTPUT:
{
  "recommendAnalysis": true,
  "selectedStocks": [
    {"ticker": "MU", "reason": "near support with low RSI", "priority": "high", "signals": ["support", "low_rsi"]},
    {"ticker": "PDD", "reason": "momentum near 52-week high", "priority": "medium", "signals": ["momentum", "52w_high"]},
    {"ticker": "AMD", "reason": "strong 1M momentum", "priority": "low", "signals": ["momentum"]}
  ],
  "marketConditions": {"trend": "neutral", "volatility": "medium"}
}

CRITICAL: Only extract tickers from the numbered "Proceed with full specialist analysis" list. Ignore all other stock mentions.

Return ONLY valid JSON with no extra text:`;
}

export function generateOpportunityPrompt(
  portfolioData: any,
  watchlistData: MarketData[],
  marketRange: string
): string {
  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const formatCurrency = (value: number, { withSign = false }: { withSign?: boolean } = {}): string => {
    if (!Number.isFinite(value)) return '$0';
    const absValue = Math.abs(value);
    const formatted = absValue >= 100
      ? absValue.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : absValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sign = value < 0 ? '-' : '';
    if (!withSign) {
      return `${sign}$${formatted}`;
    }
    const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${prefix}$${formatted}`;
  };

  const formatPercent = (value: number, { withSign = false, decimals = 1 }: { withSign?: boolean; decimals?: number } = {}): string => {
    if (!Number.isFinite(value)) return 'n/a';
    const formatted = value.toFixed(decimals);
    if (withSign && value > 0) {
      return `+${formatted}%`;
    }
    return `${formatted}%`;
  };

  const resolveHoldingDuration = (position: any): number | null => {
    const numericDuration = toNumber(position?.holdingDurationDays ?? position?.holdingDuration ?? position?.daysHeld ?? position?.days_held);
    if (numericDuration !== null) {
      return numericDuration;
    }

    const dateFields = [
      'firstBuyDate',
      'first_buy_date',
      'purchaseDate',
      'purchase_date',
      'enteredAt',
      'entered_at',
      'openedAt',
      'opened_at',
      'acquiredAt',
      'acquired_at',
      'created_at',
      'tradeOpenedAt',
      'trade_opened_at',
      'positionOpenedAt',
      'position_opened_at'
    ];

    for (const field of dateFields) {
      const value = position?.[field];
      if (!value) continue;
      const parsed = value instanceof Date ? value : new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        const diffMs = Date.now() - parsed.getTime();
        if (diffMs >= 0) {
          return Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }
      }
    }

    return null;
  };

  const positions = Array.isArray(portfolioData?.positions) ? portfolioData.positions : [];
  let declaredTotalValue = toNumber(portfolioData?.totalValue);
  if (declaredTotalValue === null) {
    declaredTotalValue = toNumber(portfolioData?.account?.portfolio_value) ?? null;
  }

  type HoldingMetric = {
    ticker: string;
    value: number;
    costBasis: number | null;
    valueChange: number;
    valueChangePct: number | null;
    dayChangePct: number | null;
    shares: number;
    holdingDurationDays: number | null;
    avgCost: number | null;
    currentPrice: number | null;
  };

  const holdingsBase: HoldingMetric[] = positions
    .map((position: any) => {
      const ticker: string | undefined = position?.ticker || position?.symbol || position?.stock;
      if (!ticker) {
        return null;
      }

      const shares = toNumber(position?.shares ?? position?.qty ?? position?.quantity ?? position?.units ?? position?.position_quantity) ?? 0;
      const currentPriceCandidates = [
        toNumber(position?.currentPrice),
        toNumber(position?.current_price),
        toNumber(position?.lastPrice),
        toNumber(position?.last_price)
      ];
      const currentPrice = currentPriceCandidates.find((value) => value !== null) ?? null;

      const valueCandidates = [
        toNumber(position?.value),
        toNumber(position?.currentValue),
        toNumber(position?.marketValue),
        toNumber(position?.market_value)
      ];
      let value = valueCandidates.find((candidate) => candidate !== null) ?? null;
      if (value === null && currentPrice !== null && shares > 0) {
        value = currentPrice * shares;
      }
      if (value === null) {
        value = 0;
      }

      const costBasisCandidates = [
        toNumber(position?.costBasis),
        toNumber(position?.cost_basis),
        toNumber(position?.cost_basis_usd),
        toNumber(position?.base_cost)
      ];
      let costBasis = costBasisCandidates.find((candidate) => candidate !== null) ?? null;

      const avgCost = toNumber(position?.avgCost ?? position?.avg_cost ?? position?.avgPrice ?? position?.avg_price ?? position?.avg_entry_price);
      if ((costBasis === null || costBasis === 0) && avgCost !== null && shares > 0) {
        costBasis = avgCost * shares;
      }

      let valueChange = toNumber(position?.valueChange ?? position?.unrealizedPL ?? position?.unrealized_pl ?? position?.unrealized_intraday_pl);
      if (valueChange === null && costBasis !== null) {
        valueChange = value - costBasis;
      }
      if (valueChange === null) {
        valueChange = 0;
      }

      let valueChangePct = toNumber(position?.valueChangePct ?? position?.unrealizedPLPct ?? position?.unrealized_plpc ?? position?.unrealized_pl_percent);
      if (valueChangePct === null && costBasis && costBasis !== 0) {
        valueChangePct = (valueChange / costBasis) * 100;
      }

      let dayChangePct = toNumber(position?.dayChangePercent ?? position?.day_change_percent ?? position?.dayChange ?? position?.changeToday ?? position?.change_today);
      if (dayChangePct !== null && Math.abs(dayChangePct) <= 1 && typeof position?.change_today !== 'undefined') {
        dayChangePct = dayChangePct * 100;
      }

      const holdingDurationDays = resolveHoldingDuration(position);

      return {
        ticker,
        value,
        costBasis,
        valueChange,
        valueChangePct,
        dayChangePct,
        shares,
        holdingDurationDays,
        avgCost,
        currentPrice
      } as HoldingMetric;
    })
    .filter((entry): entry is HoldingMetric => Boolean(entry));

  const derivedTotalValue = holdingsBase.reduce((sum, holding) => sum + holding.value, 0);
  const totalValue = declaredTotalValue !== null && declaredTotalValue > 0 ? declaredTotalValue : derivedTotalValue;
  const totalCostBasis = holdingsBase.reduce((sum, holding) => {
    if (holding.costBasis !== null) return sum + holding.costBasis;
    return sum + (holding.value - holding.valueChange);
  }, 0);
  const totalValueChange = holdingsBase.reduce((sum, holding) => sum + holding.valueChange, 0);
  const totalUnrealizedPct = totalCostBasis > 0 ? (totalValueChange / totalCostBasis) * 100 : 0;

  const holdingsWithAllocation = holdingsBase.map((holding) => ({
    ...holding,
    allocationPct: totalValue > 0 ? (holding.value / totalValue) * 100 : 0
  }));

  const currentAllocations: Record<string, number> = {};
  for (const holding of holdingsWithAllocation) {
    currentAllocations[holding.ticker] = holding.allocationPct;
  }

  const holdingsSummaryLimit = 8;
  const holdingsDetail = holdingsWithAllocation
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, holdingsSummaryLimit)
    .map((holding) => {
      const changePctDisplay = holding.valueChangePct !== null ? formatPercent(holding.valueChangePct, { withSign: true }) : 'n/a';
      const durationDisplay = holding.holdingDurationDays !== null ? `${Math.round(holding.holdingDurationDays)}d held` : 'duration unknown';
      const dayMoveDisplay = holding.dayChangePct !== null ? ` | Day move ${formatPercent(holding.dayChangePct, { withSign: true })}` : '';
      const sharesDisplay = holding.shares > 0 ? ` | ${holding.shares.toFixed(2)} shares` : '';
      return `- ${holding.ticker}: ${formatPercent(holding.allocationPct, { decimals: 2 })} of portfolio (${formatCurrency(holding.value)}), ${formatCurrency(holding.valueChange, { withSign: true })} (${changePctDisplay}) unrealized; ${durationDisplay}${dayMoveDisplay}${sharesDisplay}`;
    })
    .join('\n');

  const gainers = holdingsWithAllocation
    .filter((holding) => holding.valueChange > 0)
    .sort((a, b) => b.valueChange - a.valueChange)
    .slice(0, 3)
    .map((holding) => `${holding.ticker} (${formatCurrency(holding.valueChange, { withSign: true })}, ${holding.valueChangePct !== null ? formatPercent(holding.valueChangePct, { withSign: true }) : 'n/a'})`)
    .join('; ');

  const losers = holdingsWithAllocation
    .filter((holding) => holding.valueChange < 0)
    .sort((a, b) => a.valueChange - b.valueChange)
    .slice(0, 3)
    .map((holding) => `${holding.ticker} (${formatCurrency(holding.valueChange, { withSign: true })}, ${holding.valueChangePct !== null ? formatPercent(holding.valueChangePct, { withSign: true }) : 'n/a'})`)
    .join('; ');

  const holdingDurations = holdingsWithAllocation
    .map((holding) => holding.holdingDurationDays)
    .filter((duration): duration is number => duration !== null);
  const averageHoldingDuration = holdingDurations.length > 0
    ? holdingDurations.reduce((sum, days) => sum + days, 0) / holdingDurations.length
    : null;

  const cashAvailable = toNumber(portfolioData?.cash ?? portfolioData?.cashBalance ?? portfolioData?.account?.cash) ?? 0;

  const currentDate = new Date().toISOString().split('T')[0];

  const totalStocks = watchlistData?.length || 0;
  const minRecommendations = Math.max(1, Math.ceil(totalStocks * 0.3));
  const maxRecommendations = Math.min(8, Math.max(minRecommendations + 2, 5));

  const tickerList = watchlistData?.map(stock => stock.ticker).join(', ') || 'No stocks provided';

  const highSignalStocks = watchlistData.filter(stock => {
    const signals: string[] = [];

    if (Math.abs(stock.dayChangePercent) > 3) signals.push('significant_price_move');
    if (Math.abs(stock.dayChangePercent) > 5) signals.push('large_price_move');

    if (stock.volume > stock.avgVolume * 1.5) signals.push('volume_increase');
    if (stock.volume > stock.avgVolume * 2) signals.push('volume_spike');

    if (stock.rsi && stock.rsi < 35) signals.push('oversold');
    if (stock.rsi && stock.rsi > 65) signals.push('overbought');
    if (stock.rsi && (stock.rsi < 30 || stock.rsi > 70)) signals.push('rsi_extreme');

    if (stock.currentPrice > stock.weekHigh * 0.95) signals.push('near_52w_high');
    if (stock.currentPrice < stock.weekLow * 1.05) signals.push('near_52w_low');

    if (stock.volatility && stock.volatility > 0.25) signals.push('elevated_volatility');
    if (stock.volatility && stock.volatility > 0.4) signals.push('high_volatility');

    if (stock.open && stock.prevClose) {
      const gapPercent = Math.abs((stock.open - stock.prevClose) / stock.prevClose * 100);
      if (gapPercent > 1) signals.push('gap_open');
    }

    return signals.length >= 2;
  });

  return `You are acting as a Market Scanner and Opportunity Spotter. Your role is to quickly scan the provided market data and identify which stocks (if any) should be sent to our team of specialist agents for in-depth analysis.

Think of yourself as the first filter in a multi-stage analysis pipeline. Each stock you recommend will trigger detailed analysis by multiple specialist agents (technical analysts, fundamental analysts, sentiment analysts, etc.), which costs API resources. Therefore, be selective but not overly restrictive.

Current Date: ${currentDate}

Portfolio Overview:
- Total Value: ${formatCurrency(totalValue)}
- Cash Available: ${formatCurrency(cashAvailable)}
- Number of Positions: ${positions.length}
- Unrealized P/L: ${formatCurrency(totalValueChange, { withSign: true })} (${formatPercent(totalUnrealizedPct, { withSign: true })})
- Average Holding Duration: ${averageHoldingDuration !== null ? `${averageHoldingDuration.toFixed(0)} days` : 'Unknown'}

Current Portfolio Allocations:
${Object.entries(currentAllocations).length > 0
      ? Object.entries(currentAllocations)
          .map(([ticker, pct]) => `- ${ticker}: ${pct.toFixed(2)}%`)
          .join('\n')
      : 'No current positions'}

Detailed Holdings (Top ${Math.min(holdingsSummaryLimit, holdingsWithAllocation.length)} by value):
${holdingsWithAllocation.length > 0 ? holdingsDetail : 'No detailed holdings available'}

Holdings Performance Highlights:
- Top Gainers: ${gainers || 'None'}
- Top Losers: ${losers || 'None'}

Use these portfolio metrics to decide whether to let profits run, harvest gains, cut losses, or rotate capital before selecting new opportunities.

Market Data Analysis Period: ${marketRange}

Market Data for Watchlist & Holdings (${watchlistData?.length || 0} total stocks):
${(watchlistData || []).map(stock => {
        let indicatorsSummary = '';

        if (stock.periodReturn !== undefined) {
          indicatorsSummary += `
  - ${marketRange} Return: ${stock.periodReturn.toFixed(2)}%`;
        }
        if (stock.periodAvgVolume !== undefined) {
          indicatorsSummary += `
  - ${marketRange} Avg Volume: ${(stock.periodAvgVolume / 1000000).toFixed(2)}M`;
        }

        if (stock.indicators) {
          if (stock.indicators.sma20) indicatorsSummary += `
  - SMA20: $${stock.indicators.sma20.toFixed(2)}`;
          if (stock.indicators.sma50) indicatorsSummary += `
  - SMA50: $${stock.indicators.sma50.toFixed(2)}`;
          if (stock.indicators.bollingerBands) {
            indicatorsSummary += `
  - BB: $${stock.indicators.bollingerBands.lower.toFixed(2)}-${stock.indicators.bollingerBands.upper.toFixed(2)}`;
          }
        }

        return `
${stock.ticker}:
  - Current Price: $${stock.currentPrice.toFixed(2)}
  - Day Change: ${stock.dayChangePercent.toFixed(2)}%
  - Volume: ${(stock.volume / 1000000).toFixed(2)}M (avg: ${(stock.avgVolume / 1000000).toFixed(2)}M)
  - 52W Range: $${stock.weekLow.toFixed(2)} - $${stock.weekHigh.toFixed(2)}
  ${stock.rsi ? `- RSI: ${stock.rsi.toFixed(1)}` : ''}
  ${stock.macd ? `- MACD: ${stock.macd}` : ''}
  ${stock.volatility ? `- Volatility: ${(stock.volatility * 100).toFixed(1)}%` : ''}${indicatorsSummary}`;
      }).join('\n')}

High-Signal Stocks Detected (${highSignalStocks.length}):
${highSignalStocks.length > 0
      ? highSignalStocks
          .map(stock => `- ${stock.ticker}: Day change ${stock.dayChangePercent.toFixed(2)}%, Volume ${(stock.volume / stock.avgVolume).toFixed(1)}x average`)
          .join('\n')
      : 'No high-signal stocks detected'}

Market Opportunity Evaluation:
You are evaluating ${watchlistData?.length || 0} stocks for potential trading opportunities.

AVAILABLE STOCKS FOR ANALYSIS: [${tickerList}]
You MUST choose from ONLY these ${totalStocks} stocks listed above.

Current Portfolio Context:
- ${Object.keys(currentAllocations).length} existing positions
- Largest positions: ${Object.entries(currentAllocations)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([ticker, pct]) => `${ticker} (${pct.toFixed(1)}%)`)
      .join(', ') || 'None'}

YOUR SCANNING OBJECTIVE:
Quickly identify stocks that show interesting patterns worthy of deeper investigation by our specialist agents. You're looking for:

1. **Clear Opportunities**: Stocks showing strong technical setups, breakout patterns, or momentum shifts
2. **Risk Signals**: Existing positions showing concerning patterns that need immediate attention
3. **Unusual Activity**: Abnormal volume, price gaps, volatility spikes, or divergences from normal behavior
4. **Confluence of Factors**: Multiple indicators aligning to suggest something significant is happening
5. **Timely Setups**: Stocks at critical decision points (support/resistance, RSI extremes, pattern completions)
6. **Portfolio Signals**: Holdings showing large unrealized gains/losses, big day moves, or extended holding durations that may demand action

YOUR ANALYSIS APPROACH:
Scan the data like a radar system - quickly identify the most interesting signals from the noise. Consider:
- How each stock's current behavior compares to its recent history
- Whether technical indicators are showing extreme or interesting readings
- If volume patterns suggest institutional activity or retail interest
- Whether existing positions need risk management attention
- If any stocks are at critical technical levels

SELECTION CRITERIA:
- Choose AT LEAST ${minRecommendations} stocks from the provided list (${Math.round((minRecommendations / totalStocks) * 100)}% of ${totalStocks} total)
- Maximum ${maxRecommendations} stocks can be selected
- Each recommendation triggers ~6-8 specialist agents to analyze that stock
- Focus on stocks where deeper analysis could lead to actionable trading decisions
- Even if some stocks look neutral, select at least ${minRecommendations} that show the most interesting patterns
- Prioritize based on signal strength, but ensure minimum selection quota is met

OUTPUT FORMAT - CRITICAL:
You MUST write a natural language market commentary, NOT JSON or structured data.

Structure your response as a professional market report with these sections:

**Opening Market Assessment** (1-2 paragraphs)
Describe the overall market picture you're seeing. Are there broad themes? Is it a risk-on or risk-off environment? What's the general tone of the watchlist?

**Opportunity Identification** (2-3 paragraphs)
Discuss which stocks (if any) caught your attention and why. For each interesting stock, explain the specific signals or patterns that make it worth deeper investigation. Be specific about price levels, indicator readings, and volume patterns.

**Recommendation** (1 paragraph)
State your recommendations for which stocks should receive full specialist analysis. Use this EXACT format:
"Proceed with full specialist analysis on the following stocks (in priority order): 1) TICKER1 (reason), 2) TICKER2 (reason), 3) TICKER3 (reason)..." 
IMPORTANT: You MUST recommend AT LEAST ${minRecommendations} stocks from the provided list of [${tickerList}].
If recommending portfolio risk review separately, add: "Additionally, conduct immediate portfolio risk review on: TICKER4, TICKER5"

CRITICAL REQUIREMENTS:
- Select AT MINIMUM ${minRecommendations} stocks (this is ${Math.round((minRecommendations / totalStocks) * 100)}% of the ${totalStocks} stocks provided)
- Maximum ${maxRecommendations} stocks allowed
- ONLY select from: [${tickerList}]
- List each ticker explicitly - do not use vague language like "the stocks mentioned above"

REMEMBER: You are writing a market commentary report in plain English. No JSON, no bullet points, no structured data formats. Write in clear, professional prose as if briefing a trading desk about what deserves their attention today.`;
}
