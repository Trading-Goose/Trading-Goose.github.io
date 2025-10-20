export interface RebalancePortfolioManagerRequest {
  rebalanceRequestId: string;
  tickers?: string[];
  userId: string;
  apiSettings: {
    ai_provider: string;
    ai_api_key: string;
    ai_model?: string;
    alpaca_paper_api_key?: string;
    alpaca_paper_secret_key?: string;
    alpaca_live_api_key?: string;
    alpaca_live_secret_key?: string;
    alpaca_paper_trading?: boolean;
    user_risk_level?: 'conservative' | 'moderate' | 'aggressive';
    default_position_size_dollars?: number;
    max_position_size?: number;
    portfolio_manager_ai?: string;
    portfolio_manager_model?: string;
    portfolio_manager_max_tokens?: number;
    openai_api_key?: string;
    anthropic_api_key?: string;
    google_api_key?: string;
    deepseek_api_key?: string;
    openrouter_api_key?: string;
  };
  riskManagerDecisions?: Record<string, any>;
  constraints?: {
    maxPositionSize?: number;
    minPositionSize?: number;
    rebalanceThreshold?: number;
    targetCashAllocation?: number;
    targetStockAllocation?: number;
    skipThresholdCheck?: boolean;
    skipOpportunityAgent?: boolean;
  };
}

// Import shared portfolio types
export type { AlpacaPortfolioData } from '../../_shared/portfolio/types.ts';

export interface RebalanceResponse {
  success: boolean;
  id: string;
  status: string;
  portfolio_snapshot: any;
  target_allocations: Record<string, number>;
  target_cash_allocation: number;
  skip_threshold_check: boolean;
  skip_opportunity_agent: boolean;
  auto_execute_enabled: boolean;
  threshold_exceeded: boolean;
  rebalance_plan: any;
  recommendedPositions: any[];
  relatedAnalyses: any[];
  agentInsights: any;
  ordersCreated: number;
  ordersExecuted: boolean;
  created_at: string;
  completedAt: string;
}