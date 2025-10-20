/**
 * Shared configuration utilities for portfolio operations
 */

import { AlpacaApiSettings } from './types.ts';

/**
 * Extract and validate Alpaca credentials from API settings
 */
export function extractAlpacaCredentials(apiSettings: any): {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  isPaperTrading: boolean;
} {
  const isPaperTrading = apiSettings.alpaca_paper_trading ?? true;
  
  const apiKey = isPaperTrading
    ? apiSettings.alpaca_paper_api_key
    : apiSettings.alpaca_live_api_key;
  
  const secretKey = isPaperTrading
    ? apiSettings.alpaca_paper_secret_key
    : apiSettings.alpaca_live_secret_key;

  if (!apiKey || !secretKey) {
    throw new Error(`Alpaca ${isPaperTrading ? 'paper' : 'live'} credentials not configured`);
  }

  const baseUrl = isPaperTrading
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';

  return {
    apiKey,
    secretKey,
    baseUrl,
    isPaperTrading
  };
}

/**
 * Create standard Alpaca API headers
 */
export function createAlpacaHeaders(apiKey: string, secretKey: string): HeadersInit {
  return {
    'APCA-API-KEY-ID': apiKey,
    'APCA-API-SECRET-KEY': secretKey,
    'Content-Type': 'application/json'
  };
}

/**
 * Validate portfolio-related API settings
 */
export function validatePortfolioSettings(apiSettings: AlpacaApiSettings): void {
  const isPaper = apiSettings.alpaca_paper_trading ?? true;
  
  if (isPaper) {
    if (!apiSettings.alpaca_paper_api_key || !apiSettings.alpaca_paper_secret_key) {
      throw new Error('Paper trading credentials are required but not configured');
    }
  } else {
    if (!apiSettings.alpaca_live_api_key || !apiSettings.alpaca_live_secret_key) {
      throw new Error('Live trading credentials are required but not configured');
    }
  }
}