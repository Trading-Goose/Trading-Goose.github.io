export interface AgentRequest {
  analysisId: string;
  ticker: string;
  userId: string;
  apiSettings: {
    ai_provider: string;
    ai_api_key: string;
    ai_model?: string;
    analysis_depth?: string;
    analysis_history_days?: number;
    research_debate_rounds?: number;
    analysis_max_tokens?: number;
    research_max_tokens?: number;
    trading_max_tokens?: number;
    risk_max_tokens?: number;
  };
  analysisContext?: {
    type: 'individual' | 'rebalance';
    rebalanceRequestId?: string;
    skipTradeOrders?: boolean;
  };
  context?: {
    messages: any[];
    workflowSteps: any[];
  };
  portfolioData?: {
    totalValue?: number;
    cash?: number;
    cashBalance?: number;
    account?: Record<string, any>;
    positions?: any[];
  };
  watchlistData?: any[];
  _retry?: {
    attempt: number;           // Current retry attempt (0 = first try)
    maxRetries: number;        // Maximum retries allowed
    timeoutMs: number;         // Timeout per attempt in milliseconds
    originalStartTime: string; // ISO timestamp of first invocation
    functionName: string;      // Agent function name for self-invocation
  };
}



export function getHistoryDays(apiSettings: AgentRequest['apiSettings']): number {
  return apiSettings.analysis_history_days || 30;
}

export function getDebateRounds(apiSettings: AgentRequest['apiSettings']): number {
  return apiSettings.research_debate_rounds || 2;
}

// Rebalance-specific interfaces
export interface RebalanceRequest {
  userId: string;
  targetAllocations: Record<string, number>; // ticker -> percentage
  constraints?: {
    maxPositionSize?: number;
    minPositionSize?: number;
    excludeTickers?: string[];
    includeTickers?: string[];
    taxStrategy?: 'minimize' | 'harvest_losses' | 'none';
  };
}

export interface RebalancePlan {
  summary: {
    totalBuyValue: number;
    totalSellValue: number;
    estimatedCosts: number;
    expectedRiskReduction: number;
    allocationsChange: Record<string, { from: number, to: number }>;
  };

  actions: Array<{
    ticker: string;
    action: 'BUY' | 'SELL' | 'HOLD';
    currentShares: number;
    targetShares: number;
    shareChange: number;
    currentValue: number;
    targetValue: number;
    currentAllocation: number;
    targetAllocation: number;
    reasoning: string;
    analysisId: string; // Link to detailed analysis
    confidence: number;
  }>;

  rationale: {
    overview: string;
    riskAssessment: string;
    opportunityCost: string;
    taxConsiderations: string;
  };
}
