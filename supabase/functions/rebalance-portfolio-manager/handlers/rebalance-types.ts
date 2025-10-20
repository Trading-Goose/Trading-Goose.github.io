import { TradeOrderData } from '../../_shared/tradeOrders.ts';

export interface RebalanceContext {
  supabase: any;
  rebalanceRequestId: string;
  tickers: string[];
  userId: string;
  apiSettings: any;
  portfolioData: any;
  constraints?: any;
  riskManagerDecisions?: Record<string, any>;
}

export interface RebalanceResponse {
  success: boolean;
  message?: string;
  id?: string;
  status?: string;
  rebalanceRequestId?: string;
  portfolio_snapshot?: any;
  target_allocations?: Record<string, number>;
  target_cash_allocation?: number;
  skip_threshold_check?: boolean;
  skip_opportunity_agent?: boolean;
  auto_execute_enabled?: boolean;
  threshold_exceeded?: boolean;
  rebalance_plan?: any;
  recommendedPositions?: any[];
  relatedAnalyses?: any[];
  agentInsights?: any;
  ordersCreated?: number;
  ordersExecuted?: boolean;
  created_at?: string;
  completedAt?: string;
}

export interface RebalancePlan {
  actions: any[];
  calculatedAllocations: Record<string, number>;
  summary: {
    totalTrades: number;
    buyOrders: number;
    sellOrders: number;
    totalBuyValue: number;
    totalSellValue: number;
    expectedCashAfter: number;
  };
}