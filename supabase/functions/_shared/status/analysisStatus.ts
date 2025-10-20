/**
 * Analysis Status Types and Utilities
 */

// Core Analysis Status Types (string-based, replacing numeric system)
export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled';

/**
 * Analysis Status Definitions
 */
export const ANALYSIS_STATUS = {
  PENDING: 'pending' as const,      // New, for not started
  RUNNING: 'running' as const,      // Replaces numeric 0
  COMPLETED: 'completed' as const,  // Replaces numeric 1
  ERROR: 'error' as const,          // Replaces numeric -1
  CANCELLED: 'cancelled' as const   // Replaces is_canceled boolean
} as const;

/**
 * Legacy to New Status Mapping for Migration
 */
export const LEGACY_ANALYSIS_STATUS_MAP = {
  0: ANALYSIS_STATUS.RUNNING,
  1: ANALYSIS_STATUS.COMPLETED,
  [-1]: ANALYSIS_STATUS.ERROR
} as const;

/**
 * Convert legacy numeric analysis status to new string status
 */
export function convertLegacyAnalysisStatus(legacyStatus: number): AnalysisStatus {
  const mapped = LEGACY_ANALYSIS_STATUS_MAP[legacyStatus as keyof typeof LEGACY_ANALYSIS_STATUS_MAP];
  return mapped || ANALYSIS_STATUS.ERROR;
}

/**
 * Check if analysis status indicates completion (success or error)
 */
export function isAnalysisFinished(status: AnalysisStatus): boolean {
  return status === ANALYSIS_STATUS.COMPLETED || 
         status === ANALYSIS_STATUS.ERROR || 
         status === ANALYSIS_STATUS.CANCELLED;
}

/**
 * Check if analysis status indicates active processing
 */
export function isAnalysisActive(status: AnalysisStatus): boolean {
  return status === ANALYSIS_STATUS.RUNNING;
}