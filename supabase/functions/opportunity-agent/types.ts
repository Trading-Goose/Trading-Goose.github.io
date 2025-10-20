export interface MarketData {
  ticker: string;
  currentPrice: number;
  dayChange: number;
  dayChangePercent: number;
  volume: number;
  avgVolume: number;
  weekHigh: number;
  weekLow: number;
  rsi?: number;
  macd?: string;
  volatility?: number;
  // Calculated indicators (instead of raw historical data)
  periodReturn?: number;  // Period return percentage
  periodAvgVolume?: number; // Average volume over the period
  // Additional fields for better analysis
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
  vwap?: number;
  bidPrice?: number;
  askPrice?: number;
  spread?: number;
  marketCap?: number;
  // Technical indicator summary (from cached data)
  indicators?: {
    rsi?: number;
    macd?: { value: number; signal: number; histogram: number };
    bollingerBands?: { upper: number; middle: number; lower: number };
    sma20?: number;
    sma50?: number;
    ema12?: number;
    ema26?: number;
  };
}

export interface OpportunityEvaluation {
  recommendAnalysis: boolean;
  selectedStocks: {
    ticker: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    signals: string[];
  }[];
  reasoning: string;
  estimatedCost: number;
  marketConditions: {
    trend: 'bullish' | 'bearish' | 'neutral';
    volatility: 'high' | 'medium' | 'low';
    keyEvents: string[];
  };
}