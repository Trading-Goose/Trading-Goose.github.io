// Shared types and interfaces for Settings components

export interface AiProvider {
  id: string;
  nickname: string;
  provider: string;
  apiKey: string;
}

export interface ProviderInfo {
  provider: string | null;
  apiKey: string | null;
}

export interface ProvidersTabProps {
  aiProviders: AiProvider[];
  defaultAiModel: string;
  defaultCustomModel: string;
  showKeys: Record<string, boolean>;
  errors: Record<string, string>;
  saved: boolean;
  activeTab: string;
  isSaving: boolean;
  updateAiProvider: (id: string, field: 'nickname' | 'provider' | 'apiKey', value: string) => void;
  setDefaultAiModel: (model: string) => void;
  setDefaultCustomModel: (model: string) => void;
  toggleShowKey: (key: string) => void;
  addAiProvider: () => void;
  removeAiProvider: (id: string) => void;
  handleSaveTab: (tab: string) => void;
  handleClearProviders?: () => void;
  getModelOptions: (provider: string) => string[];
  hasAdditionalProviderAccess?: boolean;
}

export interface AgentsTabProps {
  aiProviders: AiProvider[];
  researchDebateRounds: number;
  analysisTeamProviderId: string;
  analysisTeamModel: string;
  analysisCustomModel: string;
  researchTeamProviderId: string;
  researchTeamModel: string;
  researchCustomModel: string;
  tradingTeamProviderId: string;
  tradingTeamModel: string;
  tradingCustomModel: string;
  riskTeamProviderId: string;
  riskTeamModel: string;
  riskCustomModel: string;
  portfolioManagerProviderId: string;
  portfolioManagerModel: string;
  portfolioManagerCustomModel: string;
  analysisOptimization: string;
  analysisSearchSources: number;
  analysisHistoryDays: string;
  analysisMaxTokens: number;
  researchMaxTokens: number;
  tradingMaxTokens: number;
  riskMaxTokens: number;
  portfolioManagerMaxTokens: number;
  defaultAiModel: string;
  defaultCustomModel: string;
  saved: boolean;
  activeTab: string;
  isSaving: boolean;
  setResearchDebateRounds: (rounds: number) => void;
  setAnalysisTeamProviderId: (id: string) => void;
  setAnalysisTeamModel: (model: string) => void;
  setAnalysisCustomModel: (model: string) => void;
  setResearchTeamProviderId: (id: string) => void;
  setResearchTeamModel: (model: string) => void;
  setResearchCustomModel: (model: string) => void;
  setTradingTeamProviderId: (id: string) => void;
  setTradingTeamModel: (model: string) => void;
  setTradingCustomModel: (model: string) => void;
  setRiskTeamProviderId: (id: string) => void;
  setRiskTeamModel: (model: string) => void;
  setRiskCustomModel: (model: string) => void;
  setPortfolioManagerProviderId: (id: string) => void;
  setPortfolioManagerModel: (model: string) => void;
  setPortfolioManagerCustomModel: (model: string) => void;
  setAnalysisOptimization: (opt: string) => void;
  setAnalysisSearchSources: (sources: number) => void;
  setAnalysisHistoryDays: (days: string) => void;
  setAnalysisMaxTokens: (tokens: number) => void;
  setResearchMaxTokens: (tokens: number) => void;
  setTradingMaxTokens: (tokens: number) => void;
  setRiskMaxTokens: (tokens: number) => void;
  setPortfolioManagerMaxTokens: (tokens: number) => void;
  handleSaveTab: (tab: string) => void;
  getModelOptions: (provider: string) => string[];
  getConfiguredProviders: () => { id: string; nickname: string; provider: string }[];
  getDefaultModelValue: () => string;
  hasAgentConfigAccess?: boolean;
}

export interface RebalanceTabProps {
  aiProviders: AiProvider[];
  rebalanceThreshold: number;
  rebalanceMinPositionSize: number;
  rebalanceMaxPositionSize: number;
  nearPositionThreshold: number;
  targetStockAllocation: number;
  targetCashAllocation: number;
  opportunityAgentProviderId: string;
  opportunityAgentModel: string;
  opportunityCustomModel: string;
  opportunityMaxTokens: number;
  opportunityMarketRange: string;
  defaultAiModel: string;
  defaultCustomModel: string;
  saved: boolean;
  activeTab: string;
  errors: Record<string, string>;
  isSaving: boolean;
  setRebalanceThreshold: (threshold: number) => void;
  setRebalanceMinPositionSize: (size: number) => void;
  setRebalanceMaxPositionSize: (size: number) => void;
  setNearPositionThreshold: (threshold: number) => void;
  setTargetStockAllocation: (allocation: number) => void;
  setTargetCashAllocation: (allocation: number) => void;
  setOpportunityAgentProviderId: (id: string) => void;
  setOpportunityAgentModel: (model: string) => void;
  setOpportunityCustomModel: (model: string) => void;
  setOpportunityMaxTokens: (tokens: number) => void;
  setOpportunityMarketRange: (range: string) => void;
  handleSaveTab: (tab: string) => void;
  getModelOptions: (provider: string) => string[];
  getConfiguredProviders: () => { id: string; nickname: string; provider: string }[];
  getDefaultModelValue: () => string;
  hasOpportunityAgentAccess?: boolean;
  hasRebalanceAccess?: boolean;
}

export interface TradingTabProps {
  alpacaPaperApiKey: string;
  alpacaPaperSecretKey: string;
  alpacaLiveApiKey: string;
  alpacaLiveSecretKey: string;
  alpacaPaperTrading: boolean;
  autoExecuteTrades: boolean;
  autoNearLimitAnalysis: boolean;
  userRiskLevel: string;
  defaultPositionSizeDollars: number;
  profitTarget: number;
  stopLoss: number;
  nearLimitThreshold: number;
  configuredProviders: Record<string, boolean>;
  showKeys: Record<string, boolean>;
  saved: boolean;
  activeTab: string;
  isSaving: boolean;
  setAlpacaPaperApiKey: (key: string) => void;
  setAlpacaPaperSecretKey: (key: string) => void;
  setAlpacaLiveApiKey: (key: string) => void;
  setAlpacaLiveSecretKey: (key: string) => void;
  setAlpacaPaperTrading: (enabled: boolean) => void;
  setAutoExecuteTrades: (enabled: boolean) => void;
  setAutoNearLimitAnalysis: (enabled: boolean) => void;
  setUserRiskLevel: (level: string) => void;
  setDefaultPositionSizeDollars: (amount: number) => void;
  setProfitTarget: (target: number) => void;
  setStopLoss: (loss: number) => void;
  setNearLimitThreshold: (threshold: number) => void;
  toggleShowKey: (key: string) => void;
  handleSaveTab: (tab: string) => void;
  handleClearTrading?: () => void;
  canUseLiveTrading?: boolean;
  canUseAutoTrading?: boolean;
}
