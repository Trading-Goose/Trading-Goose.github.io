/**
 * Yahoo Finance API Client
 * Free alternative for historical stock data
 */

export interface YahooCandle {
  timestamp: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
}

export interface YahooQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  marketCap: number;
  trailingPE?: number;
  forwardPE?: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
}

export class YahooFinanceAPI {
  private baseUrl = 'https://query1.finance.yahoo.com/v8/finance/chart';
  private quoteUrl = 'https://query1.finance.yahoo.com/v7/finance/quote';

  async getCandles(ticker: string, period1: number, period2: number): Promise<YahooCandle> {
    try {
      const response = await fetch(
        `${this.baseUrl}/${ticker}?period1=${period1}&period2=${period2}&interval=1d&includePrePost=true`
      );

      if (!response.ok) {
        throw new Error(`Yahoo Finance API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.chart?.result?.[0]) {
        throw new Error('No chart data available');
      }

      const result = data.chart.result[0];
      const quotes = result.indicators?.quote?.[0];
      
      if (!quotes) {
        throw new Error('No quote data available');
      }

      return {
        timestamp: result.timestamp || [],
        open: quotes.open || [],
        high: quotes.high || [],
        low: quotes.low || [],
        close: quotes.close || [],
        volume: quotes.volume || [],
      };
    } catch (error) {
      console.warn(`Yahoo Finance getCandles failed for ${ticker}:`, error);
      throw error;
    }
  }

  async getQuote(ticker: string): Promise<YahooQuote | null> {
    try {
      const response = await fetch(`${this.quoteUrl}?symbols=${ticker}`);

      if (!response.ok) {
        throw new Error(`Yahoo Finance quote API error: ${response.statusText}`);
      }

      const data = await response.json();
      const quote = data.quoteResponse?.result?.[0];

      if (!quote) {
        throw new Error('No quote data available');
      }

      return {
        symbol: quote.symbol,
        regularMarketPrice: quote.regularMarketPrice || 0,
        regularMarketChange: quote.regularMarketChange || 0,
        regularMarketChangePercent: quote.regularMarketChangePercent || 0,
        regularMarketVolume: quote.regularMarketVolume || 0,
        marketCap: quote.marketCap || 0,
        trailingPE: quote.trailingPE,
        forwardPE: quote.forwardPE,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow || 0,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || 0,
      };
    } catch (error) {
      console.warn(`Yahoo Finance getQuote failed for ${ticker}:`, error);
      return null;
    }
  }

  async getMultipleQuotes(tickers: string[]): Promise<YahooQuote[]> {
    try {
      const response = await fetch(`${this.quoteUrl}?symbols=${tickers.join(',')}`);

      if (!response.ok) {
        throw new Error(`Yahoo Finance quote API error: ${response.statusText}`);
      }

      const data = await response.json();
      const quotes = data.quoteResponse?.result || [];

      return quotes.map((quote: any) => ({
        symbol: quote.symbol,
        regularMarketPrice: quote.regularMarketPrice || 0,
        regularMarketChange: quote.regularMarketChange || 0,
        regularMarketChangePercent: quote.regularMarketChangePercent || 0,
        regularMarketVolume: quote.regularMarketVolume || 0,
        marketCap: quote.marketCap || 0,
        trailingPE: quote.trailingPE,
        forwardPE: quote.forwardPE,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow || 0,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || 0,
      }));
    } catch (error) {
      console.warn(`Yahoo Finance getMultipleQuotes failed:`, error);
      return [];
    }
  }
}