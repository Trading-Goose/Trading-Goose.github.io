/**
 * Alpha Vantage API Client
 * Free tier: 25 API requests per day
 * Provides: News, fundamentals, technical indicators
 */

export interface AlphaVantageNews {
  title: string;
  url: string;
  time_published: string;
  authors: string[];
  summary: string;
  banner_image?: string;
  source: string;
  category_within_source?: string;
  source_domain: string;
  topics?: Array<{
    topic: string;
    relevance_score: string;
  }>;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
  ticker_sentiment?: Array<{
    ticker: string;
    relevance_score: string;
    ticker_sentiment_score: string;
    ticker_sentiment_label: string;
  }>;
}

export interface AlphaVantageOverview {
  Symbol: string;
  Name: string;
  Description: string;
  Exchange: string;
  Currency: string;
  Country: string;
  Sector: string;
  Industry: string;
  MarketCapitalization: string;
  EBITDA: string;
  PERatio: string;
  PEGRatio: string;
  BookValue: string;
  DividendPerShare: string;
  DividendYield: string;
  EPS: string;
  RevenuePerShareTTM: string;
  ProfitMargin: string;
  OperatingMarginTTM: string;
  ReturnOnAssetsTTM: string;
  ReturnOnEquityTTM: string;
  RevenueTTM: string;
  GrossProfitTTM: string;
  DilutedEPSTTM: string;
  QuarterlyEarningsGrowthYOY: string;
  QuarterlyRevenueGrowthYOY: string;
  AnalystTargetPrice: string;
  TrailingPE: string;
  ForwardPE: string;
  PriceToSalesRatioTTM: string;
  PriceToBookRatio: string;
  EVToRevenue: string;
  EVToEBITDA: string;
  Beta: string;
  '52WeekHigh': string;
  '52WeekLow': string;
  '50DayMovingAverage': string;
  '200DayMovingAverage': string;
  SharesOutstanding: string;
  DividendDate: string;
  ExDividendDate: string;
}

export class AlphaVantageAPI {
  private apiKey: string;
  private baseUrl = 'https://www.alphavantage.co/query';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Get news and sentiment for a ticker
   * @param ticker Stock symbol
   * @param limit Maximum number of news items (default 50, max 1000)
   */
  async getNewsAndSentiment(ticker: string, limit: number = 50): Promise<any> {
    try {
      const params = new URLSearchParams({
        function: 'NEWS_SENTIMENT',
        tickers: ticker,
        limit: limit.toString(),
        apikey: this.apiKey
      });

      const response = await fetch(`${this.baseUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch news: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for API limit error
      if (data['Note'] || data['Information']) {
        console.warn('Alpha Vantage API limit reached:', data['Note'] || data['Information']);
        return { feed: [], items: '0', sentiment_score_definition: 'N/A' };
      }

      if (data['Error Message']) {
        console.error('Alpha Vantage error:', data['Error Message']);
        return { feed: [], items: '0', sentiment_score_definition: 'N/A' };
      }

      // Return the full response with all metadata
      return {
        feed: data.feed || [],
        items: data.items || '0',
        sentiment_score_definition: data.sentiment_score_definition || 'N/A',
        relevance_score_definition: data.relevance_score_definition || 'N/A'
      };
    } catch (error) {
      console.error('Error fetching news from Alpha Vantage:', error);
      return { feed: [], items: '0', sentiment_score_definition: 'N/A' };
    }
  }

  /**
   * Get company overview with fundamental data
   * @param ticker Stock symbol
   */
  async getCompanyOverview(ticker: string): Promise<AlphaVantageOverview | null> {
    try {
      const params = new URLSearchParams({
        function: 'OVERVIEW',
        symbol: ticker,
        apikey: this.apiKey
      });

      const response = await fetch(`${this.baseUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch company overview: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for API limit error
      if (data['Note'] || data['Information']) {
        console.warn('Alpha Vantage API limit reached:', data['Note'] || data['Information']);
        return null;
      }

      if (data['Error Message'] || Object.keys(data).length === 0) {
        console.error('Alpha Vantage error or no data:', data['Error Message']);
        return null;
      }

      return data as AlphaVantageOverview;
    } catch (error) {
      console.error('Error fetching company overview from Alpha Vantage:', error);
      return null;
    }
  }

  /**
   * Get earnings data
   * @param ticker Stock symbol
   */
  async getEarnings(ticker: string): Promise<any> {
    try {
      const params = new URLSearchParams({
        function: 'EARNINGS',
        symbol: ticker,
        apikey: this.apiKey
      });

      const response = await fetch(`${this.baseUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch earnings: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for API limit error
      if (data['Note'] || data['Information']) {
        console.warn('Alpha Vantage API limit reached:', data['Note'] || data['Information']);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching earnings from Alpha Vantage:', error);
      return null;
    }
  }

  /**
   * Get income statement
   * @param ticker Stock symbol
   */
  async getIncomeStatement(ticker: string): Promise<any> {
    try {
      const params = new URLSearchParams({
        function: 'INCOME_STATEMENT',
        symbol: ticker,
        apikey: this.apiKey
      });

      const response = await fetch(`${this.baseUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch income statement: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for API limit error
      if (data['Note'] || data['Information']) {
        console.warn('Alpha Vantage API limit reached:', data['Note'] || data['Information']);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching income statement from Alpha Vantage:', error);
      return null;
    }
  }

  /**
   * Get balance sheet
   * @param ticker Stock symbol
   */
  async getBalanceSheet(ticker: string): Promise<any> {
    try {
      const params = new URLSearchParams({
        function: 'BALANCE_SHEET',
        symbol: ticker,
        apikey: this.apiKey
      });

      const response = await fetch(`${this.baseUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch balance sheet: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Check for API limit error
      if (data['Note'] || data['Information']) {
        console.warn('Alpha Vantage API limit reached:', data['Note'] || data['Information']);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching balance sheet from Alpha Vantage:', error);
      return null;
    }
  }
}

// Export singleton with dynamic API key loading
export function createAlphaVantageClient(apiKey: string): AlphaVantageAPI {
  return new AlphaVantageAPI(apiKey);
}