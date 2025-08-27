/**
 * Rebalance Status Types and Utilities
 */

// Core Rebalance Status Types (simplified from complex state machine)
export type RebalanceStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'error';

/**
 * Rebalance Status Definitions
 */
export const REBALANCE_STATUS = {
  PENDING: 'pending' as const,              // New, for not started
  RUNNING: 'running' as const,              // Consolidates: initializing, opportunity_evaluation, analyzing, executing
  COMPLETED: 'completed' as const,          // Keep as-is
  CANCELLED: 'cancelled' as const,          // Keep as-is
  ERROR: 'error' as const                   // Replaces failed
} as const;

/**
 * Legacy Rebalance Status Mapping for Migration
 */
export const LEGACY_REBALANCE_STATUS_MAP = {
  'initializing': REBALANCE_STATUS.RUNNING,
  'opportunity_evaluation': REBALANCE_STATUS.RUNNING,
  'portfolio_management_started': REBALANCE_STATUS.RUNNING,
  'analyzing': REBALANCE_STATUS.RUNNING,
  'executing': REBALANCE_STATUS.RUNNING,
  'pending_approval': REBALANCE_STATUS.COMPLETED,  // Now maps to completed since orders have their own status
  'completed': REBALANCE_STATUS.COMPLETED,
  'cancelled': REBALANCE_STATUS.CANCELLED,
  'failed': REBALANCE_STATUS.ERROR
} as const;

/**
 * Convert legacy rebalance status to new simplified status
 * Since database migration completed, this now just validates and returns the status
 */
export function convertLegacyRebalanceStatus(status: string): RebalanceStatus {
  // Return status as-is since database migration already converted all legacy values
  return status as RebalanceStatus;
}

/**
 * Check if rebalance status indicates completion (success, error, or cancelled)
 */
export function isRebalanceFinished(status: RebalanceStatus): boolean {
  return status === REBALANCE_STATUS.COMPLETED || 
         status === REBALANCE_STATUS.ERROR || 
         status === REBALANCE_STATUS.CANCELLED;
}

/**
 * Check if rebalance status indicates active processing
 */
export function isRebalanceActive(status: RebalanceStatus): boolean {
  return status === REBALANCE_STATUS.RUNNING || 
         status === REBALANCE_STATUS.PENDING;
}