import { TradeOrderData } from '../../_shared/tradeOrders.ts';

export interface IndividualAnalysisContext {
  supabase: any;
  analysisId: string;
  ticker: string;
  userId: string;
  apiSettings: any;
  portfolioData: any;
  riskManagerDecision: any;
}

export interface PositionContext {
  totalValue: number;
  availableCash: number;
  currentPrice: number;
  defaultPositionSizeDollars: number;
  maxPositionSize: number;
  userRiskLevel: string;
  confidence: number;
  decision: string;
  currentCash?: number;
}

export interface IndividualAnalysisResponse {
  success: boolean;
  analysis_id: string;
  ticker: string;
  decision: string;
  tradeDirection?: 'BUY' | 'SELL' | 'HOLD';
  originalDecision: string;
  message?: string;
  portfolio_snapshot: {
    cash: number;
    positions: Array<{
      ticker: string;
      shares: number;
      avgCost: number;
      currentPrice: number;
      value: number;
    }>;
    totalValue: number;
    availableCash: number;
  };
  positionSizing?: any;
  tradeOrder?: {
    ticker: string;
    action: string;
    confidence: number;
    shares: number;
    dollar_amount: number;
    analysis_id: string;
    beforePosition: {
      shares: number;
      value: number;
      allocation: number;
    };
    afterPosition: {
      shares: number;
      value: number;
      allocation: number;
    };
    changes: {
      shares: number;
      value: number;
      allocation: number;
    };
    reasoning: string;
  };
  orderSubmitted?: boolean;
  ordersCreated?: number;
  auto_executed?: boolean;
  created_at: string;
}
