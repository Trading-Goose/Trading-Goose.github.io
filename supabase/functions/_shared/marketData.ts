// Shared market data utilities for fetching historical prices
export interface HistoricalPrice {
  date: string;
  close: number;
  volume: number;
}

export interface MarketDataWithHistory {
  historicalPrices?: HistoricalPrice[];
}

export interface AlpacaCredentials {
  apiKey: string;
  secretKey: string;
  paper?: boolean;
}

/**
 * Fetches historical market data for a list of stocks using Alpaca API
 * @param stocks - Array of stock objects that will have historicalPrices added
 * @param credentials - Alpaca API credentials (can use either paper or live)
 * @param marketRange - Time range: '1D', '1W', '1M', '3M', '1Y'
 */
export async function fetchHistoricalData<T extends MarketDataWithHistory & { ticker: string }>(
  stocks: T[],
  credentials: AlpacaCredentials | string,
  marketRange: string = '1M'
): Promise<void> {
  // Handle alpaca parameter formats
  let alpacaCredentials: AlpacaCredentials;
  
  if (typeof credentials === 'string') {
    // Legacy format no longer supported
    console.log('Error: String API key provided, but Alpaca credentials object is required');
    return;
  } else {
    alpacaCredentials = credentials;
  }
  
  if (!alpacaCredentials.apiKey || !alpacaCredentials.secretKey || stocks.length === 0) {
    console.log('Skipping historical data fetch: missing API credentials or empty stock list');
    return;
  }

  // Calculate date range based on marketRange
  const now = new Date();
  const endDate = now.toISOString();
  let startDate: Date;
  let timeframe: string;
  
  switch (marketRange) {
    case '1D':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 1);
      timeframe = '5Min'; // 5-minute bars for 1 day (10Min not supported)
      break;
    case '1W':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      timeframe = '1Hour'; // Hourly bars for 1 week
      break;
    case '1M':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      timeframe = '1Hour'; // Hourly bars for 1 month (4Hour not supported)
      break;
    case '3M':
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 3);
      timeframe = '1Day'; // Daily bars for 3 months (12Hour not supported)
      break;
    case '1Y':
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
      timeframe = '1Day'; // Daily bars for 1 year
      break;
    case '5Y':
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 5);
      timeframe = '1Week'; // Weekly bars for 5 years
      break;
    default:
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
      timeframe = '1Hour'; // Default to 1 month with hourly bars
  }
  
  console.log(`📊 Fetching ${marketRange} historical data for ${stocks.length} stocks using Alpaca API`);
  
  // Determine the base URL for Alpaca API
  const baseUrl = alpacaCredentials.paper 
    ? 'https://data.alpaca.markets' 
    : 'https://data.alpaca.markets'; // Data URL is the same for both
  
  // Fetch historical data for each stock (limit parallel requests to avoid rate limiting)
  const batchSize = 5;
  for (let i = 0; i < stocks.length; i += batchSize) {
    const batch = stocks.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async (stock) => {
        try {
          // Detect if this is a crypto ticker
          const isCrypto = stock.ticker.includes('/');
          let alpacaTicker = stock.ticker;
          let url: string;
          
          if (isCrypto) {
            // Convert crypto format: ETH/USD → ETHUSD
            alpacaTicker = stock.ticker.replace('/', '');
            
            // Use crypto endpoint
            const cryptoParams = new URLSearchParams({
              symbols: alpacaTicker,
              timeframe,
              start: startDate.toISOString(),
              end: endDate,
              limit: '10000'
            });
            url = `${baseUrl}/v1beta3/crypto/us/bars?${cryptoParams}`;
          } else {
            // Regular stock endpoint
            const stockParams = new URLSearchParams({
              timeframe,
              start: startDate.toISOString(),
              end: endDate,
              adjustment: 'raw',
              feed: 'iex',
              limit: '10000'
            });
            url = `${baseUrl}/v2/stocks/${alpacaTicker}/bars?${stockParams}`;
          }
          
          const response = await fetch(url, {
            headers: {
              'APCA-API-KEY-ID': alpacaCredentials.apiKey,
              'APCA-API-SECRET-KEY': alpacaCredentials.secretKey,
            }
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.warn(`Failed to fetch historical data for ${stock.ticker}: ${errorText}`);
            stock.historicalPrices = [];
            return;
          }
          
          const data = await response.json();
          
          // Handle different response formats for stocks vs crypto
          let bars: any[];
          if (isCrypto) {
            // Crypto response format: { bars: { SYMBOL: [...] } }
            bars = data.bars?.[alpacaTicker] || [];
          } else {
            // Stock response format: { bars: [...] }
            bars = data.bars || [];
          }
          
          if (Array.isArray(bars) && bars.length > 0) {
            // Convert to our format
            const fullData = bars.map((bar: any) => ({
              date: bar.t || bar.timestamp,
              close: bar.c || bar.close,
              volume: bar.v || bar.volume
            }));
            
            // Uniform 80 points for all time ranges for consistent AI analysis
            const targetPoints = 80;
            
            // Downsample whatever resolution Alpaca gave us to exactly 80 points
            // This handles the conversion from Alpaca's fixed intervals to our uniform point count
            stock.historicalPrices = downsampleHistoricalData(fullData, targetPoints);
            
            console.log(`  ✓ ${stock.ticker}: ${fullData.length} points downsampled to ${stock.historicalPrices.length}`);
          } else {
            console.warn(`  ⚠ ${stock.ticker}: No historical data available`);
            stock.historicalPrices = [];
          }
        } catch (error) {
          console.error(`Error fetching historical data for ${stock.ticker}:`, error);
          // Don't fail the entire operation if one stock fails
          stock.historicalPrices = [];
        }
      })
    );
    
    // Small delay between batches to respect rate limits
    if (i + batchSize < stocks.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Downsamples historical price data to a manageable number of points for AI agents
 * @param historicalPrices - Array of historical price data
 * @param targetPoints - Target number of data points (default: 30)
 * @returns Downsampled array of historical prices
 */
export function downsampleHistoricalData(
  historicalPrices: HistoricalPrice[],
  targetPoints: number = 30
): HistoricalPrice[] {
  if (!historicalPrices || historicalPrices.length === 0) {
    return [];
  }
  
  // If we already have fewer points than target, return as is
  if (historicalPrices.length <= targetPoints) {
    return historicalPrices;
  }
  
  // We want exactly targetPoints, including first and last
  // So we need to sample (targetPoints - 2) middle points
  const middlePoints = targetPoints - 2;
  const step = (historicalPrices.length - 1) / (middlePoints + 1);
  const downsampled: HistoricalPrice[] = [];
  
  // Always include the first point (oldest)
  downsampled.push(historicalPrices[0]);
  
  // Sample middle points at regular intervals
  for (let i = 1; i <= middlePoints; i++) {
    const index = Math.round(i * step);
    if (index >= historicalPrices.length - 1) break; // Don't duplicate the last point
    
    // For each sampling point, calculate average volume in a window
    const windowStart = Math.round((i - 0.5) * step);
    const windowEnd = Math.round((i + 0.5) * step);
    const startIdx = Math.max(1, windowStart); // Don't include first point again
    const endIdx = Math.min(historicalPrices.length - 2, windowEnd); // Don't include last point
    
    let totalVolume = 0;
    let volumeCount = 0;
    
    for (let j = startIdx; j <= endIdx; j++) {
      totalVolume += historicalPrices[j].volume;
      volumeCount++;
    }
    
    downsampled.push({
      date: historicalPrices[index].date,
      close: historicalPrices[index].close,
      volume: volumeCount > 0 ? totalVolume / volumeCount : historicalPrices[index].volume
    });
  }
  
  // Always include the last point (most recent)
  downsampled.push(historicalPrices[historicalPrices.length - 1]);
  
  // Ensure we have exactly targetPoints (might be off by 1 due to rounding)
  while (downsampled.length > targetPoints) {
    // Remove a point from the middle
    downsampled.splice(Math.floor(downsampled.length / 2), 1);
  }
  
  return downsampled;
}

/**
 * Calculates period return from historical prices
 * @param historicalPrices - Array of historical price data
 * @returns Period return as a percentage, or null if insufficient data
 */
export function calculatePeriodReturn(historicalPrices?: HistoricalPrice[]): number | null {
  if (!historicalPrices || historicalPrices.length < 2) {
    return null;
  }
  
  const firstPrice = historicalPrices[0].close;
  const lastPrice = historicalPrices[historicalPrices.length - 1].close;
  
  if (firstPrice === 0) return null;
  
  return ((lastPrice - firstPrice) / firstPrice) * 100;
}

/**
 * Calculates average volume from historical data
 * @param historicalPrices - Array of historical price data
 * @returns Average volume, or null if no data
 */
export function calculateAverageVolume(historicalPrices?: HistoricalPrice[]): number | null {
  if (!historicalPrices || historicalPrices.length === 0) {
    return null;
  }
  
  const totalVolume = historicalPrices.reduce((sum, p) => sum + p.volume, 0);
  return totalVolume / historicalPrices.length;
}

/**
 * Formats historical data summary for prompts
 * @param ticker - Stock ticker symbol
 * @param historicalPrices - Array of historical price data
 * @param marketRange - Time range label
 * @returns Formatted string for inclusion in AI prompts
 */
export function formatHistoricalSummary(
  ticker: string,
  historicalPrices?: HistoricalPrice[],
  marketRange: string = '1M'
): string {
  if (!historicalPrices || historicalPrices.length === 0) {
    return `${ticker}: No historical data available`;
  }
  
  const periodReturn = calculatePeriodReturn(historicalPrices);
  const avgVolume = calculateAverageVolume(historicalPrices);
  
  let summary = `${ticker} (${marketRange} period):`;
  
  // Current price and change
  const currentPrice = historicalPrices[historicalPrices.length - 1].close;
  const startPrice = historicalPrices[0].close;
  summary += `\n  - Current Price: $${currentPrice.toFixed(2)}`;
  
  if (periodReturn !== null) {
    const changeAmount = currentPrice - startPrice;
    summary += `\n  - ${marketRange} Change: ${changeAmount >= 0 ? '+' : ''}$${changeAmount.toFixed(2)} (${periodReturn >= 0 ? '+' : ''}${periodReturn.toFixed(2)}%)`;
  }
  
  // Add high/low for the period
  const prices = historicalPrices.map(p => p.close);
  const periodHigh = Math.max(...prices);
  const periodLow = Math.min(...prices);
  summary += `\n  - ${marketRange} Range: $${periodLow.toFixed(2)} - $${periodHigh.toFixed(2)}`;
  
  // Volume information
  if (avgVolume !== null) {
    summary += `\n  - ${marketRange} Avg Volume: ${(avgVolume / 1000000).toFixed(2)}M shares/day`;
  }
  
  // Add volatility indicator
  const priceChanges = [];
  for (let i = 1; i < historicalPrices.length; i++) {
    const change = Math.abs((historicalPrices[i].close - historicalPrices[i-1].close) / historicalPrices[i-1].close);
    priceChanges.push(change);
  }
  if (priceChanges.length > 0) {
    const avgVolatility = (priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length) * 100;
    summary += `\n  - ${marketRange} Avg Daily Volatility: ${avgVolatility.toFixed(2)}%`;
  }
  
  // Trend direction
  const midPoint = Math.floor(historicalPrices.length / 2);
  const firstHalfAvg = historicalPrices.slice(0, midPoint).reduce((sum, p) => sum + p.close, 0) / midPoint;
  const secondHalfAvg = historicalPrices.slice(midPoint).reduce((sum, p) => sum + p.close, 0) / (historicalPrices.length - midPoint);
  const trend = secondHalfAvg > firstHalfAvg ? 'Upward' : secondHalfAvg < firstHalfAvg ? 'Downward' : 'Sideways';
  summary += `\n  - ${marketRange} Trend: ${trend}`;
  
  // Data points info (so agents know the resolution)
  summary += `\n  - Data Points: ${historicalPrices.length} samples`;
  
  return summary;
}

/**
 * Helper function to create Alpaca credentials from environment variables
 * @param isPaper - Whether to use paper trading credentials (default: true)
 * @returns AlpacaCredentials object or null if not configured
 */
export function getAlpacaCredentials(isPaper: boolean = true): AlpacaCredentials | null {
  if (isPaper) {
    const apiKey = Deno.env.get('ALPACA_PAPER_API_KEY');
    const secretKey = Deno.env.get('ALPACA_PAPER_SECRET_KEY');
    
    if (!apiKey || !secretKey) {
      return null;
    }
    
    return { apiKey, secretKey, paper: true };
  } else {
    const apiKey = Deno.env.get('ALPACA_LIVE_API_KEY');
    const secretKey = Deno.env.get('ALPACA_LIVE_SECRET_KEY');
    
    if (!apiKey || !secretKey) {
      return null;
    }
    
    return { apiKey, secretKey, paper: false };
  }
}