/**
 * Trade Order Status Types and Utilities
 * 
 * This module defines a clean separation between system trade order status
 * and Alpaca API status to prevent confusion and ensure proper status management.
 */

// System Trade Order Status Types (stored in trading_actions.status field)
export type TradeOrderStatus = 'pending' | 'approved' | 'rejected';

// Alpaca API Status Types (stored in metadata.alpaca_order.status only)
export type AlpacaOrderStatus = 
  | 'new' 
  | 'partially_filled' 
  | 'filled' 
  | 'done_for_day' 
  | 'canceled' 
  | 'expired' 
  | 'replaced' 
  | 'pending_cancel' 
  | 'pending_replace' 
  | 'accepted' 
  | 'pending_new' 
  | 'accepted_for_bidding' 
  | 'stopped' 
  | 'rejected' 
  | 'suspended' 
  | 'calculated';

/**
 * System Trade Order Status Definitions
 * 
 * These are the ONLY valid values for the trading_actions.status field
 */
export const TRADE_ORDER_STATUS = {
  PENDING: 'pending' as const,     // Order created by portfolio manager, awaiting user decision
  APPROVED: 'approved' as const,   // User approved the order, will be sent to Alpaca
  REJECTED: 'rejected' as const    // User rejected the order
} as const;

/**
 * Alpaca API Status Constants
 * 
 * These values are ONLY stored in metadata.alpaca_order.status
 * They should NEVER be used to update the main status field
 */
export const ALPACA_ORDER_STATUS = {
  NEW: 'new' as const,
  PARTIALLY_FILLED: 'partially_filled' as const,
  FILLED: 'filled' as const,
  DONE_FOR_DAY: 'done_for_day' as const,
  CANCELED: 'canceled' as const,
  EXPIRED: 'expired' as const,
  REPLACED: 'replaced' as const,
  PENDING_CANCEL: 'pending_cancel' as const,
  PENDING_REPLACE: 'pending_replace' as const,
  ACCEPTED: 'accepted' as const,
  PENDING_NEW: 'pending_new' as const,
  ACCEPTED_FOR_BIDDING: 'accepted_for_bidding' as const,
  STOPPED: 'stopped' as const,
  REJECTED: 'rejected' as const,
  SUSPENDED: 'suspended' as const,
  CALCULATED: 'calculated' as const
} as const;

/**
 * Check if trade order status indicates completion (approved or rejected)
 */
export function isTradeOrderFinished(status: TradeOrderStatus): boolean {
  return status === TRADE_ORDER_STATUS.APPROVED || status === TRADE_ORDER_STATUS.REJECTED;
}

/**
 * Check if trade order is awaiting user decision
 */
export function isTradeOrderPending(status: TradeOrderStatus): boolean {
  return status === TRADE_ORDER_STATUS.PENDING;
}

/**
 * Check if trade order has been approved by user
 */
export function isTradeOrderApproved(status: TradeOrderStatus): boolean {
  return status === TRADE_ORDER_STATUS.APPROVED;
}

/**
 * Check if trade order has been rejected by user
 */
export function isTradeOrderRejected(status: TradeOrderStatus): boolean {
  return status === TRADE_ORDER_STATUS.REJECTED;
}

/**
 * Check if Alpaca order is in a terminal state
 */
export function isAlpacaOrderTerminal(status: AlpacaOrderStatus): boolean {
  return [
    ALPACA_ORDER_STATUS.FILLED,
    ALPACA_ORDER_STATUS.CANCELED,
    ALPACA_ORDER_STATUS.EXPIRED,
    ALPACA_ORDER_STATUS.REJECTED,
    ALPACA_ORDER_STATUS.DONE_FOR_DAY
  ].includes(status);
}

/**
 * Check if Alpaca order has been filled (partially or completely)
 */
export function isAlpacaOrderFilled(status: AlpacaOrderStatus): boolean {
  return status === ALPACA_ORDER_STATUS.FILLED || status === ALPACA_ORDER_STATUS.PARTIALLY_FILLED;
}

/**
 * Validate that a status is a valid system trade order status
 */
export function isValidTradeOrderStatus(status: string): status is TradeOrderStatus {
  return Object.values(TRADE_ORDER_STATUS).includes(status as TradeOrderStatus);
}

/**
 * Validate that a status is a valid Alpaca order status
 */
export function isValidAlpacaOrderStatus(status: string): status is AlpacaOrderStatus {
  return Object.values(ALPACA_ORDER_STATUS).includes(status as AlpacaOrderStatus);
}