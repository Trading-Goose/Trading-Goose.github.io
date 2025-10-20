export interface AnalysisPortfolioManagerRequest {
  analysisId: string;
  ticker: string;
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
}

// Import shared portfolio types
export type { AlpacaPortfolioData } from '../../_shared/portfolio/types.ts';

export interface PositionSizingResult {
  shares: number;
  dollarAmount: number;
  percentOfPortfolio: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  riskRewardRatio: number | null;
  reasoning: string;
  adjustment?: string;
  action?: 'BUY' | 'SELL' | 'HOLD';  // Added to track Analysis Portfolio Manager's actual decision
}
