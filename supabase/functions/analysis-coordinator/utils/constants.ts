import { CorsHeaders } from '../types/index.ts';

/**
 * Shared constants and configuration values
 */

export const CORS_HEADERS: CorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export const JSON_RESPONSE_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/json'
};

/**
 * Default workflow configuration values
 */
export const DEFAULT_VALUES = {
  REBALANCE_THRESHOLD: 10,
  DEBATE_ROUNDS: 2,
  POSITION_SIZE_DOLLARS: 1000,
  MAX_POSITION_SIZE: 10,
  ANALYSIS_HISTORY_DAYS: 30
} as const;

/**
 * Agent workflow status values
 */
export const AGENT_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error'
} as const;