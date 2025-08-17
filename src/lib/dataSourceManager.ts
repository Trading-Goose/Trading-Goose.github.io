/**
 * Data Source Manager - Handles multiple data sources with fallback mechanism
 * Provides unified interface for market data with automatic fallback
 */

import { YahooFinanceAPI, type YahooCandle, type YahooQuote } from './yahooFinance';

export interface UnifiedCandle {
  c: number[]; // close prices
  h: number[]; // high prices
  l: number[]; // low prices
  o: number[]; // open prices
  v: number[]; // volumes
  t: number[]; // timestamps
}

export interface UnifiedQuote {
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  peRatio?: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
}

export interface DataSourceConfig {
  preferredSource?: 'yahoo' | 'auto';
}

export class DataSourceManager {
  private yahoo: YahooFinanceAPI;
  private config: DataSourceConfig;

  constructor(config: DataSourceConfig) {
    this.config = config;
    this.yahoo = new YahooFinanceAPI();
  }

  /**
   * Get historical candlestick data with fallback mechanism
   */
  async getCandles(ticker: string, fromTimestamp: number, toTimestamp: number): Promise<UnifiedCandle> {
    try {
      console.log(`📊 Attempting to fetch candles from yahoo for ${ticker}`);
      console.warn('⚠️ Yahoo Finance will likely fail due to CORS restrictions in browser');
      
      const data = await this.yahoo.getCandles(ticker, fromTimestamp, toTimestamp);
      if (data.close?.length > 0) {
        console.log(`✅ Yahoo Finance candles successful for ${ticker}: ${data.close.length} points`);
        return this.convertYahooCandles(data);
      }
    } catch (error) {
      console.warn(`❌ yahoo candles failed for ${ticker}:`, error);
    }

    console.warn(`⚠️ Data source failed for candles ${ticker}`);
    return { c: [], h: [], l: [], o: [], v: [], t: [] };
  }

  /**
   * Get current quote with fallback mechanism
   */
  async getQuote(ticker: string): Promise<UnifiedQuote | null> {
    try {
      console.log(`💰 Attempting to fetch quote from yahoo for ${ticker}`);
      
      const data = await this.yahoo.getQuote(ticker);
      if (data && data.regularMarketPrice > 0) {
        console.log(`✅ Yahoo Finance quote successful for ${ticker}: $${data.regularMarketPrice}`);
        return {
          currentPrice: data.regularMarketPrice,
          change: data.regularMarketChange,
          changePercent: data.regularMarketChangePercent,
          volume: data.regularMarketVolume,
          marketCap: data.marketCap,
          peRatio: data.trailingPE || data.forwardPE,
          fiftyTwoWeekHigh: data.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: data.fiftyTwoWeekLow,
        };
      }
    } catch (error) {
      console.warn(`❌ yahoo quote failed for ${ticker}:`, error);
    }

    console.warn(`⚠️ Data source failed for quote ${ticker}`);
    return null;
  }

  /**
   * Get news (no data source available)
   */
  async getNews(ticker: string, from: string, to: string): Promise<any[]> {
    console.warn('⚠️ News not available - Use Perplefina for news analysis');
    return [];
  }

  /**
   * Get fundamental metrics (no data source available)
   */
  async getMetrics(ticker: string): Promise<any> {
    console.warn('⚠️ Metrics not available - Use Perplefina for fundamental analysis');
    return {};
  }

  /**
   * Get sentiment data (no data source available)
   */
  async getSentiment(ticker: string): Promise<any> {
    console.warn('⚠️ Sentiment analysis not available - Use Perplefina for social media analysis');
    return {
      buzz: { buzz: 0 },
      sentiment: { bullishPercent: 0.5, bearishPercent: 0.5 },
      symbol: ticker,
      companyNewsScore: 0,
      error: 'Sentiment analysis not available'
    };
  }

  /**
   * Determine data source priority based on configuration and availability
   */
  private getDataSourcePriority(): ('yahoo')[] {
    // Only Yahoo Finance available (will likely fail due to CORS)
    return ['yahoo'];
  }

  /**
   * Convert Yahoo Finance candle format to unified format
   */
  private convertYahooCandles(yahoo: YahooCandle): UnifiedCandle {
    return {
      c: yahoo.close,
      h: yahoo.high,
      l: yahoo.low,
      o: yahoo.open,
      v: yahoo.volume,
      t: yahoo.timestamp,
    };
  }

  /**
   * Get available data sources
   */
  getAvailableSources(): string[] {
    return ['yahoo'];
  }

  /**
   * Test data source connectivity
   */
  async testConnectivity(): Promise<{ [source: string]: boolean }> {
    const results: { [source: string]: boolean } = {};

    // Test Yahoo Finance
    try {
      await this.yahoo.getQuote('AAPL');
      results.yahoo = true;
    } catch {
      results.yahoo = false;
    }

    return results;
  }
}