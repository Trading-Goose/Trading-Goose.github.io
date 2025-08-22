/**
 * Unified Status System for All Operations
 * 
 * This module re-exports all status types and utilities from their specific modules
 * to provide a single import point while maintaining modular organization.
 */

// Re-export Analysis Status
export type { AnalysisStatus } from './analysisStatus';
export {
  ANALYSIS_STATUS,
  LEGACY_ANALYSIS_STATUS_MAP,
  convertLegacyAnalysisStatus,
  isAnalysisFinished,
  isAnalysisActive
} from './analysisStatus';

// Re-export Rebalance Status
export type { RebalanceStatus } from './rebalanceStatus';
export {
  REBALANCE_STATUS,
  LEGACY_REBALANCE_STATUS_MAP,
  convertLegacyRebalanceStatus,
  isRebalanceFinished,
  isRebalanceActive
} from './rebalanceStatus';

// Re-export Trade Order Status
export type { TradeOrderStatus, AlpacaOrderStatus } from './tradeOrderStatus';
export {
  TRADE_ORDER_STATUS,
  ALPACA_ORDER_STATUS,
  isTradeOrderFinished,
  isTradeOrderPending,
  isTradeOrderApproved,
  isTradeOrderRejected,
  isAlpacaOrderTerminal,
  isAlpacaOrderFilled,
  isValidTradeOrderStatus,
  isValidAlpacaOrderStatus
} from './tradeOrderStatus';

// Re-export Display Helpers
export {
  isErrorStatus,
  getStatusDisplayText,
  getTradeOrderStatusDisplayText,
  getAlpacaStatusDisplayText
} from './displayHelpers';