// Types for the rebalance-coordinator function
import { AlpacaPortfolioData } from '../../_shared/portfolio/types.ts';

export interface CorsHeaders {
  'Access-Control-Allow-Origin': string;
  'Access-Control-Allow-Headers': string;
  'Content-Type'?: string;
}

export interface ApiSettings {
  ai_provider: string;
  ai_api_key: string;
  ai_model: string;
  // Alpaca credentials
  alpaca_paper_api_key?: string;
  alpaca_paper_secret_key?: string;
  alpaca_live_api_key?: string;
  alpaca_live_secret_key?: string;
  alpaca_paper_trading?: boolean;
  // User preferences
  user_risk_level?: string;
  default_position_size_dollars?: number;
  rebalance_max_position_size?: number;
  rebalance_min_position_size?: number;
  stop_loss?: number;
  profit_target?: number;
  analysis_depth?: string;
  analysis_history_days?: number;
  research_debate_rounds?: number;
  // Max tokens settings
  analysis_max_tokens?: number;
  research_max_tokens?: number;
  trading_max_tokens?: number;
  risk_max_tokens?: number;
  // Team-specific AI settings
  analysis_team_ai?: string;
  analysis_team_model?: string;
  analysis_team_provider_id?: string;
  research_team_ai?: string;
  research_team_model?: string;
  research_team_provider_id?: string;
  trading_team_ai?: string;
  trading_team_model?: string;
  trading_team_provider_id?: string;
  risk_team_ai?: string;
  risk_team_model?: string;
  risk_team_provider_id?: string;
  // Portfolio Manager settings
  portfolio_manager_ai?: string;
  portfolio_manager_model?: string;
  portfolio_manager_max_tokens?: number;
}

// PortfolioData interface removed - now using AlpacaPortfolioData from _shared/portfolio/types.ts

export interface RebalanceConstraints {
  skipOpportunityAgent?: boolean;
  rebalanceThreshold?: number;
  maxPositionSize?: number;
  minPositionSize?: number;
  maxNewPositions?: number;
  sellLosersFirst?: boolean;
  taxStrategy?: string;
  riskTolerance?: string;
  [key: string]: any;
}

export interface CancellationCheckResult {
  isCanceled: boolean;
  shouldContinue: boolean;
  reason?: string;
}

export interface RequestBody {
  // Rebalance actions
  action?: 'start-rebalance' | 'analysis-completed' | 'complete-rebalance' | 'retry-rebalance' | 'opportunity-completed';
  rebalanceRequestId?: string;
  userId?: string;
  tickers?: string[];
  portfolioData?: AlpacaPortfolioData;
  skipOpportunityAgent?: boolean;
  skipThresholdCheck?: boolean;
  rebalanceThreshold?: number;
  constraints?: RebalanceConstraints;

  // Analysis completion callbacks
  analysisId?: string;
  ticker?: string;
  success?: boolean;
  error?: string;
  riskManagerDecision?: any;

  // API settings
  apiSettings?: ApiSettings;
}

export interface RebalanceStatus {
  id: string;
  status: string;
  total_stocks: number;
  stocks_analyzed: number;
  selected_stocks: string[];
  analysis_ids: string[];
  opportunity_evaluation?: any;
}

export interface AnalysisCompletionInfo {
  analysisId: string;
  ticker: string;
  success: boolean;
  error?: string;
  riskManagerDecision?: any;
}

export interface UserRoleLimits {
  max_watchlist_stocks: number;
  max_rebalance_stocks: number;
  max_scheduled_rebalances: number;
  max_parallel_analysis: number;
  schedule_resolution: string;
  rebalance_access: boolean;
  opportunity_agent_access: boolean;
  additional_provider_access: boolean;
  enable_live_trading: boolean;
  enable_auto_trading: boolean;
}
