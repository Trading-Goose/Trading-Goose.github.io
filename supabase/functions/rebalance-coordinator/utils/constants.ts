/**
 * Shared constants and configuration values for rebalance coordinator
 */ export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
export const JSON_RESPONSE_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/json'
};
/**
 * Default rebalance configuration values
 */ export const REBALANCE_DEFAULTS = {
  THRESHOLD: 10,
  MAX_PARALLEL_ANALYSES: 5,
  COMPLETION_CHECK_INTERVAL: 1000,
  MAX_COMPLETION_CHECKS: 60
};
