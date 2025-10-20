// Types for the analysis-coordinator function
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
  near_limit_threshold?: number;
  near_position_threshold?: number;
  analysis_depth?: string;
  analysis_history_days?: number;
  research_debate_rounds?: number;
  // Max tokens settings
  analysis_max_tokens?: number;
  research_max_tokens?: number;
  trading_max_tokens?: number;
  risk_max_tokens?: number;
  // Analysis Portfolio Manager settings
  portfolio_manager_ai?: string;
  portfolio_manager_model?: string;
  portfolio_manager_max_tokens?: number;
  portfolio_manager_provider_id?: string;
  // Opportunity Agent settings
  opportunity_agent_ai?: string;
  opportunity_agent_model?: string;
  opportunity_agent_provider_id?: string;
  opportunity_max_tokens?: number;
  // Provider map storage for agent lookups
  _providerMap?: Record<string, any>;
}

export interface PositionContext {
  stock_in_holdings: boolean;
  entry_price?: number;
  current_price?: number;
  shares?: number;
  market_value?: number;
  unrealized_pl?: number;
  unrealized_pl_percent?: number;
  days_held?: number;
}

export interface UserPreferences {
  profit_target: number;
  stop_loss: number;
  near_limit_threshold: number;
  near_position_threshold: number;
}

export interface TargetAllocations {
  cash: number;
  stocks: number;
}

export interface AnalysisContext {
  type: 'individual' | 'rebalance';
  rebalanceRequestId?: string;
  tickerIndex?: number;
  totalTickers?: number;
  portfolioData?: PortfolioContextData;
  skipOpportunityAgent?: boolean;
  rebalanceThreshold?: number;
  constraints?: RebalanceConstraints;
  source?: 'risk-completion' | 'direct';
  preferences?: UserPreferences;
  targetAllocations?: TargetAllocations;
  position?: PositionContext;
  near_limit_analysis?: boolean;
  triggered_by?: string;
  triggered_at?: string;
  metadata?: Record<string, any>;
  // Retry mode fields removed - retry-handler now directly invokes failed agents
}

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

// PortfolioData interface removed - now using AlpacaPortfolioData from _shared/portfolio/types.ts

export interface CancellationCheckResult {
  isCanceled: boolean;
  shouldContinue: boolean;
  reason?: string;
}

export interface WorkflowPhase {
  agents: string[];
  nextPhase?: string;
  finalAgent?: string | null;
}

export interface WorkflowPhases {
  [key: string]: WorkflowPhase;
}

export interface RequestBody {
  action?: string;
  analysisId?: string;
  ticker?: string;
  userId?: string;
  phase?: string;
  agent?: string;
  analysisContext?: AnalysisContext;
  error?: string;
  errorType?: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'other';
  completionType?: 'normal' | 'last_in_phase' | 'fallback_invocation_failed' | 'agent_error' | 'invocation_failed';
  failedToInvoke?: string;
  riskManagerDecision?: any;
  apiSettings?: ApiSettings;  // Allow passing apiSettings in body
}
export interface PortfolioContextData extends AlpacaPortfolioData {
  totalValue?: number;
  cash?: number;
  pendingOrders?: AlpacaPortfolioData['openOrders'];
}
