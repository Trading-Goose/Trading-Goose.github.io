// All types and interfaces for the rebalance functionality
// Extracted from RebalanceModal.tsx to maintain exact same structure

export interface RebalancePosition {
  ticker: string;
  currentShares: number;
  currentValue: number;
  currentAllocation: number;
  avgPrice?: number;
}

export interface RebalanceConfig {
  useDefaultSettings: boolean;
  maxPosition: number;
  minPosition: number;
  rebalanceThreshold: number;
  targetStockAllocation: number;
  targetCashAllocation: number;
  skipThresholdCheck: boolean;
  skipOpportunityAgent: boolean;
}

export interface RebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: (positions: RebalancePosition[], config: RebalanceConfig, portfolioData?: { totalValue: number; cashBalance: number }) => void;
}

export interface PortfolioData {
  totalValue: number;
  cashBalance: number;
  positions?: Array<{
    ticker: string;
    value: number;
    costBasis: number;
    shares: number;
    avgPrice?: number;
    currentPrice: number;
    priceChangeFromAvg: number;
  }>;
}