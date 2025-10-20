/**
 * Status Display Helper Functions
 */

import type { AnalysisStatus } from './analysisStatus.ts';
import type { RebalanceStatus } from './rebalanceStatus.ts';
import type { TradeOrderStatus, AlpacaOrderStatus } from './tradeOrderStatus.ts';
import {
  ANALYSIS_STATUS
} from './analysisStatus.ts';
import {
  REBALANCE_STATUS
} from './rebalanceStatus.ts';
import { TRADE_ORDER_STATUS, ALPACA_ORDER_STATUS } from './tradeOrderStatus.ts';

/**
 * Check if status indicates an error state
 */
export function isErrorStatus(status: AnalysisStatus | RebalanceStatus): boolean {
  return status === ANALYSIS_STATUS.ERROR || status === REBALANCE_STATUS.ERROR;
}

/**
 * Get display-friendly status text for Analysis and Rebalance
 */
export function getStatusDisplayText(status: AnalysisStatus | RebalanceStatus): string {
  switch (status) {
    case ANALYSIS_STATUS.PENDING:
    case REBALANCE_STATUS.PENDING:
      return 'Pending';
    case ANALYSIS_STATUS.RUNNING:
    case REBALANCE_STATUS.RUNNING:
      return 'Running';
    case ANALYSIS_STATUS.COMPLETED:
    case REBALANCE_STATUS.COMPLETED:
      return 'Completed';
    case ANALYSIS_STATUS.CANCELLED:
    case REBALANCE_STATUS.CANCELLED:
      return 'Cancelled';
    case ANALYSIS_STATUS.ERROR:
    case REBALANCE_STATUS.ERROR:
      return 'Error';
    default:
      return 'Unknown';
  }
}

/**
 * Get display-friendly status text for system status
 */
export function getTradeOrderStatusDisplayText(status: TradeOrderStatus): string {
  switch (status) {
    case TRADE_ORDER_STATUS.PENDING:
      return 'Pending Approval';
    case TRADE_ORDER_STATUS.APPROVED:
      return 'Approved';
    case TRADE_ORDER_STATUS.REJECTED:
      return 'Rejected';
    default:
      return 'Unknown';
  }
}

/**
 * Get display-friendly status text for Alpaca status
 */
export function getAlpacaStatusDisplayText(status: AlpacaOrderStatus): string {
  switch (status) {
    case ALPACA_ORDER_STATUS.NEW:
      return 'New';
    case ALPACA_ORDER_STATUS.PARTIALLY_FILLED:
      return 'Partially Filled';
    case ALPACA_ORDER_STATUS.FILLED:
      return 'Filled';
    case ALPACA_ORDER_STATUS.DONE_FOR_DAY:
      return 'Done for Day';
    case ALPACA_ORDER_STATUS.CANCELED:
      return 'Canceled';
    case ALPACA_ORDER_STATUS.EXPIRED:
      return 'Expired';
    case ALPACA_ORDER_STATUS.REPLACED:
      return 'Replaced';
    case ALPACA_ORDER_STATUS.PENDING_CANCEL:
      return 'Pending Cancel';
    case ALPACA_ORDER_STATUS.PENDING_REPLACE:
      return 'Pending Replace';
    case ALPACA_ORDER_STATUS.ACCEPTED:
      return 'Accepted';
    case ALPACA_ORDER_STATUS.PENDING_NEW:
      return 'Pending New';
    case ALPACA_ORDER_STATUS.ACCEPTED_FOR_BIDDING:
      return 'Accepted for Bidding';
    case ALPACA_ORDER_STATUS.STOPPED:
      return 'Stopped';
    case ALPACA_ORDER_STATUS.REJECTED:
      return 'Rejected';
    case ALPACA_ORDER_STATUS.SUSPENDED:
      return 'Suspended';
    case ALPACA_ORDER_STATUS.CALCULATED:
      return 'Calculated';
    default:
      return 'Unknown';
  }
}