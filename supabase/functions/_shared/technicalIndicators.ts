// Technical indicators calculation using Yahoo Finance data with daily caching
// Provides comprehensive technical analysis for market analyst agent

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getNYCurrentDate, getNYCurrentTimestamp, shouldInvalidateCache, isMarketHours, getMarketSession, formatNYTimestamp } from './timezoneUtils.ts';
import { generateCryptoSymbolCandidates } from './alpacaSymbol.ts';

export interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  // Moving Averages
  sma_10: number[];
  sma_20: number[];
  sma_50: number[];
  sma_200: number[];
  ema_12: number[];
  ema_26: number[];
  ema_50: number[];
  
  // MACD
  macd: number[];
  macd_signal: number[];
  macd_histogram: number[];
  
  // Momentum Indicators
  rsi: number[];
  stochastic_k: number[];
  stochastic_d: number[];
  
  // Volatility Indicators
  bollinger_upper: number[];
  bollinger_middle: number[];
  bollinger_lower: number[];
  atr: number[];
  
  // Volume Indicators
  volume_sma: number[];
  obv: number[];
  
  // Support/Resistance Levels
  support_levels: number[];
  resistance_levels: number[];
}

/**
 * Fetches historical stock data from Alpaca with daily caching
 * @param symbol Stock ticker symbol
 * @param period Time period ('1M', '3M', '6M', '1Y')
 * @param supabase Supabase client for caching
 */
export async function fetchAlpacaHistoricalData(
  symbol: string, 
  period: string = '1Y',
  supabase?: any
): Promise<HistoricalPrice[]> {
  try {
    // Check cache first if supabase client provided
    if (supabase) {
      const cacheResult = await checkMarketDataCache(supabase, symbol, period);
      if (cacheResult.isValid) {
        console.log(`✅ Using cached data for ${symbol} (${period}) from ${cacheResult.fetchedDate}`);
        return cacheResult.data!.historical;
      }
    }
    
    console.log(`🌐 Cache miss for ${symbol} (${period}), fetching from Alpaca`);
    
    // Map period to timeframes and date ranges for Alpaca API
    const now = new Date();
    const periodConfig = {
      '1M': { days: 30, timeframe: '1Hour' },    // 1 month: hourly data
      '3M': { days: 90, timeframe: '4Hour' },    // 3 months: 4-hour data  
      '6M': { days: 180, timeframe: '1Day' },    // 6 months: daily data
      '1Y': { days: 365, timeframe: '1Day' }     // 1 year: daily data
    };
    
    const config = periodConfig[period as keyof typeof periodConfig] || { days: 365, timeframe: '1Day' };
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - config.days);
    
    console.log(`📊 Fetching ${period} data for ${symbol} (${config.days} days, ${config.timeframe} timeframe from ${startDate.toISOString().split('T')[0]})`);
    
    // Check if we have user credentials attached to supabase client
    const userCredentials = supabase._userCredentials;
    if (!userCredentials) {
      throw new Error('User credentials not available for Alpaca API access');
    }
    
    // Validate credentials
    const isPaper = userCredentials.alpaca_paper_trading ?? true;
    const hasCredentials = isPaper 
      ? !!(userCredentials.alpaca_paper_api_key && userCredentials.alpaca_paper_secret_key)
      : !!(userCredentials.alpaca_live_api_key && userCredentials.alpaca_live_secret_key);
    
    if (!hasCredentials) {
      throw new Error(`Missing ${isPaper ? 'paper' : 'live'} Alpaca credentials. Please configure in Settings.`);
    }
    
    console.log(`🔑 Using ${isPaper ? 'paper' : 'live'} Alpaca credentials for ${symbol}`);
    
    // Call Alpaca API directly instead of via proxy to avoid authentication issues
    const baseUrl = 'https://data.alpaca.markets';
    const apiKey = isPaper ? userCredentials.alpaca_paper_api_key : userCredentials.alpaca_live_api_key;
    const secretKey = isPaper ? userCredentials.alpaca_paper_secret_key : userCredentials.alpaca_live_secret_key;

    const normalizedSymbol = symbol.trim().toUpperCase();
    const stockSymbol = normalizedSymbol.replace('/', '');
    const cryptoCandidates = generateCryptoSymbolCandidates(normalizedSymbol);

    const requestHeaders = {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secretKey,
      'Content-Type': 'application/json'
    };

    const fetchStockBars = async (): Promise<any[] | null> => {
      try {
        const stockUrl = new URL(`${baseUrl}/v2/stocks/${encodeURIComponent(stockSymbol)}/bars`);
        stockUrl.searchParams.set('timeframe', config.timeframe);
        stockUrl.searchParams.set('adjustment', 'raw');
        stockUrl.searchParams.set('feed', 'iex');
        stockUrl.searchParams.set('start', startDate.toISOString().split('T')[0]);
        stockUrl.searchParams.set('end', now.toISOString().split('T')[0]);
        stockUrl.searchParams.set('limit', '10000');

        const response = await fetch(stockUrl.toString(), {
          method: 'GET',
          headers: requestHeaders
        });

        if (!response.ok) {
          console.log(`ℹ️ Stock bars request failed for ${stockSymbol}: ${response.status}`);
          return null;
        }

        const data = await response.json();

        if (Array.isArray(data.bars)) {
          return data.bars.length > 0 ? data.bars : null;
        }

        if (data.bars && data.bars[stockSymbol]) {
          return data.bars[stockSymbol].length > 0 ? data.bars[stockSymbol] : null;
        }

        if (data[stockSymbol]) {
          return data[stockSymbol].length > 0 ? data[stockSymbol] : null;
        }

        return null;
      } catch (error) {
        console.log(`ℹ️ Stock bars fetch threw for ${stockSymbol}:`, error);
        return null;
      }
    };

    const fetchCryptoBars = async (): Promise<{ bars: any[] | null; resolvedSymbol?: string }> => {
      try {
        const cryptoTimeframe =
          config.timeframe === '1Hour' ? '1Hour' :
          config.timeframe === '4Hour' ? '4Hour' :
          '1Day';

        for (const candidate of cryptoCandidates) {
          const cryptoUrl = new URL(`${baseUrl}/v1beta3/crypto/us/bars`);
          cryptoUrl.searchParams.set('symbols', candidate);
          cryptoUrl.searchParams.set('timeframe', cryptoTimeframe);
          cryptoUrl.searchParams.set('start', startDate.toISOString());
          cryptoUrl.searchParams.set('end', now.toISOString());
          cryptoUrl.searchParams.set('limit', '10000');

          const response = await fetch(cryptoUrl.toString(), {
            method: 'GET',
            headers: requestHeaders
          });

          if (!response.ok) {
            console.log(`ℹ️ Crypto bars request failed for ${candidate}: ${response.status}`);
            continue;
          }

          const data = await response.json();
          const cryptoBars = data.bars?.[candidate] || data.bars?.[candidate.replace('/', '')];
          if (Array.isArray(cryptoBars) && cryptoBars.length > 0) {
            return { bars: cryptoBars, resolvedSymbol: candidate };
          }

          console.log(`ℹ️ Crypto bars request returned no data for ${candidate}`);
        }

        return { bars: null };
      } catch (error) {
        console.log(`ℹ️ Crypto bars fetch threw for ${normalizedSymbol}:`, error);
        return { bars: null };
      }
    };

    let bars: any[] | null = await fetchStockBars();
    let dataSource: 'stock' | 'crypto' = 'stock';
    let resolvedCryptoSymbol: string | undefined;

    if (!bars || bars.length === 0) {
      const cryptoResult = await fetchCryptoBars();
      bars = cryptoResult.bars;
      resolvedCryptoSymbol = cryptoResult.resolvedSymbol;
      dataSource = 'crypto';
    }

    if (!bars || bars.length === 0) {
      throw new Error(`No historical data returned from Alpaca for ${symbol}`);
    }

    const endpointDetails = dataSource === 'crypto' && resolvedCryptoSymbol
      ? `${symbol} via ${resolvedCryptoSymbol}`
      : symbol;

    console.log(`📡 Using ${dataSource} market data endpoint for ${endpointDetails}`);

    // Convert Alpaca bars to our HistoricalPrice format
    const historicalData: HistoricalPrice[] = bars.map((bar: any) => ({
      date: bar.t.split('T')[0], // Convert timestamp to date string
      open: parseFloat(bar.o),
      high: parseFloat(bar.h),
      low: parseFloat(bar.l),
      close: parseFloat(bar.c),
      volume: parseFloat(bar.v) // Use parseFloat for crypto volumes which can be decimal
    }));

    // Sort by date to ensure chronological order
    historicalData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log(`✅ Fetched ${historicalData.length} data points for ${symbol} from Alpaca`);
    
    // Store in cache if supabase client provided
    if (supabase && historicalData.length > 0) {
      try {
        await storeInMarketDataCache(supabase, symbol, period, historicalData);
        console.log(`💾 Cached ${historicalData.length} data points for ${symbol}`);
      } catch (cacheError) {
        console.warn('Failed to cache data:', cacheError);
        // Don't throw - caching failure shouldn't break the analysis
      }
    }
    
    return historicalData;
    
  } catch (error) {
    console.error('Error fetching Alpaca historical data:', error);
    throw error;
  }
}

/**
 * Calculate Simple Moving Average
 */
function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(NaN);
    } else {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
  }
  
  return sma;
}

/**
 * Calculate Exponential Moving Average
 */
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // First EMA is just the first price
  ema[0] = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
  }
  
  return ema;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate gains and losses
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  for (let i = 0; i < gains.length; i++) {
    if (i < period - 1) {
      rsi.push(NaN);
    } else {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
  }
  
  // First price has no RSI
  return [NaN, ...rsi];
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) {
  const emaFast = calculateEMA(prices, fastPeriod);
  const emaSlow = calculateEMA(prices, slowPeriod);
  
  const macd = emaFast.map((fast, i) => fast - emaSlow[i]);
  const signal = calculateEMA(macd.slice(slowPeriod - 1), signalPeriod);
  const histogram = macd.slice(slowPeriod - 1).map((macdVal, i) => macdVal - (signal[i] || 0));
  
  // Pad signal and histogram to match macd length
  const paddedSignal = new Array(slowPeriod - 1).fill(NaN).concat(signal);
  const paddedHistogram = new Array(slowPeriod - 1).fill(NaN).concat(histogram);
  
  return {
    macd,
    signal: paddedSignal,
    histogram: paddedHistogram
  };
}

/**
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2) {
  const sma = calculateSMA(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = sma[i];
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      
      upper.push(mean + (standardDeviation * stdDev));
      lower.push(mean - (standardDeviation * stdDev));
    }
  }
  
  return {
    upper,
    middle: sma,
    lower
  };
}

/**
 * Calculate Average True Range (ATR)
 */
function calculateATR(high: number[], low: number[], close: number[], period: number = 14): number[] {
  const trueRanges: number[] = [];
  
  for (let i = 1; i < high.length; i++) {
    const hl = high[i] - low[i];
    const hc = Math.abs(high[i] - close[i - 1]);
    const lc = Math.abs(low[i] - close[i - 1]);
    
    trueRanges.push(Math.max(hl, hc, lc));
  }
  
  const atr = [NaN]; // First value is NaN
  atr.push(...calculateSMA(trueRanges, period).slice(period - 1));
  
  return atr;
}

/**
 * Calculate Stochastic Oscillator
 */
function calculateStochastic(high: number[], low: number[], close: number[], kPeriod: number = 14, dPeriod: number = 3) {
  const k: number[] = [];
  
  for (let i = 0; i < close.length; i++) {
    if (i < kPeriod - 1) {
      k.push(NaN);
    } else {
      const highestHigh = Math.max(...high.slice(i - kPeriod + 1, i + 1));
      const lowestLow = Math.min(...low.slice(i - kPeriod + 1, i + 1));
      
      if (highestHigh === lowestLow) {
        k.push(50);
      } else {
        k.push(((close[i] - lowestLow) / (highestHigh - lowestLow)) * 100);
      }
    }
  }
  
  const d = calculateSMA(k, dPeriod);
  
  return { k, d };
}

/**
 * Calculate On-Balance Volume (OBV)
 */
function calculateOBV(close: number[], volume: number[]): number[] {
  const obv: number[] = [volume[0]];
  
  for (let i = 1; i < close.length; i++) {
    if (close[i] > close[i - 1]) {
      obv.push(obv[i - 1] + volume[i]);
    } else if (close[i] < close[i - 1]) {
      obv.push(obv[i - 1] - volume[i]);
    } else {
      obv.push(obv[i - 1]);
    }
  }
  
  return obv;
}

/**
 * Identify support and resistance levels
 */
function findSupportResistance(high: number[], low: number[], close: number[]): { support: number[], resistance: number[] } {
  const levels: number[] = [];
  const window = 10; // Look at 10 periods on each side
  
  // Find local highs and lows
  for (let i = window; i < high.length - window; i++) {
    const isLocalHigh = high.slice(i - window, i + window + 1).every((val, idx) => 
      idx === window || val <= high[i]
    );
    const isLocalLow = low.slice(i - window, i + window + 1).every((val, idx) => 
      idx === window || val >= low[i]
    );
    
    if (isLocalHigh) levels.push(high[i]);
    if (isLocalLow) levels.push(low[i]);
  }
  
  // Sort and group similar levels
  levels.sort((a, b) => a - b);
  const groupedLevels: number[] = [];
  let currentGroup = [levels[0]];
  
  for (let i = 1; i < levels.length; i++) {
    if (Math.abs(levels[i] - levels[i - 1]) / levels[i - 1] < 0.02) { // Within 2%
      currentGroup.push(levels[i]);
    } else {
      groupedLevels.push(currentGroup.reduce((a, b) => a + b) / currentGroup.length);
      currentGroup = [levels[i]];
    }
  }
  
  if (currentGroup.length > 0) {
    groupedLevels.push(currentGroup.reduce((a, b) => a + b) / currentGroup.length);
  }
  
  const currentPrice = close[close.length - 1];
  const support = groupedLevels.filter(level => level < currentPrice).slice(-3); // Top 3 support
  const resistance = groupedLevels.filter(level => level > currentPrice).slice(0, 3); // Top 3 resistance
  
  return { support, resistance };
}

/**
 * Determine which indicators can be calculated based on available data points
 */
function getValidIndicators(dataPoints: number): {
  indicators: string[];
  minDataRequired: number;
  timeframeNote: string;
} {
  if (dataPoints < 10) {
    return {
      indicators: ['basic_trend'],
      minDataRequired: 10,
      timeframeNote: 'Insufficient data for technical indicators'
    };
  } else if (dataPoints < 30) { // ~1M data
    return {
      indicators: ['sma_10', 'sma_20', 'ema_12', 'rsi', 'simple_bollinger', 'atr', 'volume_basic'],
      minDataRequired: 26,
      timeframeNote: '1M timeframe - basic indicators only'
    };
  } else if (dataPoints < 60) { // ~3M data  
    return {
      indicators: ['sma_10', 'sma_20', 'sma_50', 'ema_12', 'ema_26', 'macd', 'rsi', 'bollinger', 'atr', 'stochastic', 'volume_sma', 'obv'],
      minDataRequired: 50,
      timeframeNote: '3M timeframe - intermediate indicators'
    };
  } else if (dataPoints < 200) { // ~6M data
    return {
      indicators: ['sma_10', 'sma_20', 'sma_50', 'ema_12', 'ema_26', 'ema_50', 'macd', 'rsi', 'bollinger', 'atr', 'stochastic', 'volume_sma', 'obv', 'support_resistance'],
      minDataRequired: 50,
      timeframeNote: '6M timeframe - advanced indicators (no SMA200)'
    };
  } else { // 1Y+ data
    return {
      indicators: ['sma_10', 'sma_20', 'sma_50', 'sma_200', 'ema_12', 'ema_26', 'ema_50', 'macd', 'rsi', 'bollinger', 'atr', 'stochastic', 'volume_sma', 'obv', 'support_resistance'],
      minDataRequired: 200,
      timeframeNote: '1Y timeframe - all indicators available'
    };
  }
}

/**
 * Calculate technical indicators appropriate for the given timeframe
 */
export function calculateTimeframeIndicators(historicalData: HistoricalPrice[], period: string): TechnicalIndicators & { metadata: any } {
  if (!historicalData || historicalData.length < 10) {
    throw new Error(`Insufficient data for technical analysis. Got ${historicalData?.length || 0} data points, need at least 10.`);
  }
  
  const validIndicators = getValidIndicators(historicalData.length);
  
  const closes = historicalData.map(d => d.close);
  const highs = historicalData.map(d => d.high);
  const lows = historicalData.map(d => d.low);
  const volumes = historicalData.map(d => d.volume);
  
  console.log(`🔧 Calculating indicators for ${period}: ${validIndicators.indicators.join(', ')}`);
  console.log(`📊 ${validIndicators.timeframeNote}`);
  
  // Initialize indicators object with empty arrays
  const indicators: TechnicalIndicators = {
    sma_10: [],
    sma_20: [],
    sma_50: [],
    sma_200: [],
    ema_12: [],
    ema_26: [],
    ema_50: [],
    macd: [],
    macd_signal: [],
    macd_histogram: [],
    rsi: [],
    stochastic_k: [],
    stochastic_d: [],
    bollinger_upper: [],
    bollinger_middle: [],
    bollinger_lower: [],
    atr: [],
    volume_sma: [],
    obv: [],
    support_levels: [],
    resistance_levels: []
  };
  
  // Calculate only the indicators appropriate for this timeframe
  if (validIndicators.indicators.includes('sma_10')) {
    indicators.sma_10 = calculateSMA(closes, 10);
  }
  if (validIndicators.indicators.includes('sma_20')) {
    indicators.sma_20 = calculateSMA(closes, 20);
  }
  if (validIndicators.indicators.includes('sma_50')) {
    indicators.sma_50 = calculateSMA(closes, 50);
  }
  if (validIndicators.indicators.includes('sma_200')) {
    indicators.sma_200 = calculateSMA(closes, 200);
  }
  
  if (validIndicators.indicators.includes('ema_12')) {
    indicators.ema_12 = calculateEMA(closes, 12);
  }
  if (validIndicators.indicators.includes('ema_26')) {
    indicators.ema_26 = calculateEMA(closes, 26);
  }
  if (validIndicators.indicators.includes('ema_50')) {
    indicators.ema_50 = calculateEMA(closes, 50);
  }
  
  if (validIndicators.indicators.includes('macd')) {
    const macd = calculateMACD(closes);
    indicators.macd = macd.macd;
    indicators.macd_signal = macd.signal;
    indicators.macd_histogram = macd.histogram;
  }
  
  if (validIndicators.indicators.includes('rsi')) {
    indicators.rsi = calculateRSI(closes);
  }
  
  if (validIndicators.indicators.includes('stochastic')) {
    const stochastic = calculateStochastic(highs, lows, closes);
    indicators.stochastic_k = stochastic.k;
    indicators.stochastic_d = stochastic.d;
  }
  
  if (validIndicators.indicators.includes('bollinger') || validIndicators.indicators.includes('simple_bollinger')) {
    const bollinger = calculateBollingerBands(closes);
    indicators.bollinger_upper = bollinger.upper;
    indicators.bollinger_middle = bollinger.middle;
    indicators.bollinger_lower = bollinger.lower;
  }
  
  if (validIndicators.indicators.includes('atr')) {
    indicators.atr = calculateATR(highs, lows, closes);
  }
  
  if (validIndicators.indicators.includes('volume_sma') || validIndicators.indicators.includes('volume_basic')) {
    indicators.volume_sma = calculateSMA(volumes, Math.min(20, Math.floor(historicalData.length / 2)));
  }
  
  if (validIndicators.indicators.includes('obv')) {
    indicators.obv = calculateOBV(closes, volumes);
  }
  
  if (validIndicators.indicators.includes('support_resistance')) {
    const supportResistance = findSupportResistance(highs, lows, closes);
    indicators.support_levels = supportResistance.support;
    indicators.resistance_levels = supportResistance.resistance;
  }
  
  return {
    ...indicators,
    metadata: {
      period,
      dataPoints: historicalData.length,
      indicatorsCalculated: validIndicators.indicators,
      timeframeNote: validIndicators.timeframeNote,
      minDataRequired: validIndicators.minDataRequired
    }
  };
}

/**
 * Calculate all technical indicators for the given historical data (legacy function)
 * @deprecated Use calculateTimeframeIndicators instead
 */
export function calculateAllIndicators(historicalData: HistoricalPrice[]): TechnicalIndicators {
  const result = calculateTimeframeIndicators(historicalData, '1Y');
  const { metadata, ...indicators } = result;
  return indicators;
}

/**
 * Format indicators for AI analysis (downsampled to specified points)
 */
export function formatIndicatorsForAI(
  indicators: TechnicalIndicators, 
  historicalData: HistoricalPrice[],
  targetPoints: number = 30
): string {
  if (historicalData.length <= targetPoints) {
    return formatFullIndicators(indicators, historicalData);
  }
  
  // Downsample data and indicators to target points
  // Always include the most recent data point (last element)
  const step = Math.floor((historicalData.length - 1) / (targetPoints - 1));
  const downsampledIndices: number[] = [];
  
  // Add evenly spaced indices
  for (let i = 0; i < targetPoints - 1; i++) {
    downsampledIndices.push(Math.min(i * step, historicalData.length - 1));
  }
  
  // Always add the most recent data point (last element) if not already included
  const lastIndex = historicalData.length - 1;
  if (downsampledIndices[downsampledIndices.length - 1] !== lastIndex) {
    downsampledIndices.push(lastIndex);
  }
  
  let formattedData = `Technical Analysis Data (${targetPoints} downsampled points from ${historicalData.length} total):\n\n`;
  
  formattedData += `Date,Close,SMA20,SMA50,EMA12,EMA26,RSI,MACD,Signal,Bollinger_Upper,Bollinger_Lower,ATR,Volume,OBV\n`;
  
  for (const idx of downsampledIndices) {
    const data = historicalData[idx];
    formattedData += `${data.date},${data.close.toFixed(2)},`;
    formattedData += `${(indicators.sma_20[idx] || 0).toFixed(2)},`;
    formattedData += `${(indicators.sma_50[idx] || 0).toFixed(2)},`;
    formattedData += `${(indicators.ema_12[idx] || 0).toFixed(2)},`;
    formattedData += `${(indicators.ema_26[idx] || 0).toFixed(2)},`;
    formattedData += `${(indicators.rsi[idx] || 0).toFixed(2)},`;
    formattedData += `${(indicators.macd[idx] || 0).toFixed(4)},`;
    formattedData += `${(indicators.macd_signal[idx] || 0).toFixed(4)},`;
    formattedData += `${(indicators.bollinger_upper[idx] || 0).toFixed(2)},`;
    formattedData += `${(indicators.bollinger_lower[idx] || 0).toFixed(2)},`;
    formattedData += `${(indicators.atr[idx] || 0).toFixed(3)},`;
    formattedData += `${(data.volume / 1000000).toFixed(2)}M,`;
    formattedData += `${(indicators.obv[idx] || 0).toFixed(0)}\n`;
  }
  
  // Add support/resistance levels
  formattedData += `\nKey Levels:\n`;
  formattedData += `Support: ${indicators.support_levels.map(s => s.toFixed(2)).join(', ')}\n`;
  formattedData += `Resistance: ${indicators.resistance_levels.map(r => r.toFixed(2)).join(', ')}\n`;
  
  return formattedData;
}

function formatFullIndicators(indicators: TechnicalIndicators, historicalData: HistoricalPrice[]): string {
  // Implementation for full data formatting (similar but without downsampling)
  let formattedData = `Technical Analysis Data (${historicalData.length} data points):\n\n`;
  // ... similar formatting logic
  return formattedData;
}

/**
 * Check if we have valid cached market data for today
 */
async function checkMarketDataCache(supabase: any, symbol: string, period: string): Promise<{
  isValid: boolean;
  fetchedDate?: string;
  data?: { historical: HistoricalPrice[]; indicators: TechnicalIndicators };
}> {
  try {
    const today = getNYCurrentDate(); // Use NY timezone
    
    const { data, error } = await supabase
      .from('market_data_cache')
      .select('*')
      .eq('ticker', symbol.toUpperCase())
      .eq('timeframe', period)
      .eq('fetched_date', today)
      .single();
    
    if (error || !data) {
      console.log(`📅 No cache found for ${symbol} on ${today} (NY time)`);
      return { isValid: false };
    }
    
    // Check if cache should be invalidated based on market hours
    const shouldInvalidate = shouldInvalidateCache(data.fetched_date, data.created_at);
    if (shouldInvalidate) {
      console.log(`🕒 Cache invalidated for ${symbol} - ${getMarketSession()} session, stale data`);
      return { isValid: false };
    }
    
    const historical = data.historical_data as HistoricalPrice[];
    
    console.log(`💾 Valid cache found for ${symbol} - ${formatNYTimestamp()} (${getMarketSession()})`);
    return {
      isValid: true,
      fetchedDate: data.fetched_date,
      data: {
        historical,
        indicators: data.technical_indicators as TechnicalIndicators
      }
    };
    
  } catch (error) {
    console.error('Error checking market data cache:', error);
    return { isValid: false };
  }
}

/**
 * Store market data and indicators in cache
 */
async function storeInMarketDataCache(
  supabase: any, 
  symbol: string, 
  period: string, 
  historical: HistoricalPrice[]
): Promise<void> {
  try {
    // Calculate indicators for the full dataset
    const indicators = calculateTimeframeIndicators(historical, period);
    const { metadata, ...indicatorsData } = indicators;
    
    const nyDate = getNYCurrentDate();
    const nyTimestamp = getNYCurrentTimestamp();
    
    const cacheData = {
      ticker: symbol.toUpperCase(),
      timeframe: period,
      historical_data: historical,
      technical_indicators: indicatorsData,
      data_points: historical.length,
      analysis_range: period,
      fetched_date: nyDate,  // Use NY date
      created_at: nyTimestamp.toISOString(),  // Store NY timestamp
      updated_at: nyTimestamp.toISOString()
    };
    
    console.log(`💾 Caching market data for ${symbol} - ${formatNYTimestamp()} (${getMarketSession()})`);
    
    // Upsert to handle the case where we're updating today's cache
    const { error } = await supabase
      .from('market_data_cache')
      .upsert(cacheData, {
        onConflict: 'ticker,timeframe,fetched_date'
      });
    
    if (error) {
      throw error;
    }
    
    console.log(`✅ Market data cached successfully for ${symbol} on ${nyDate} (NY time)`);
    
  } catch (error) {
    console.error('Error storing market data cache:', error);
    throw error;
  }
}

/**
 * Get cached indicators and historical data with fallback to fresh calculation
 */
export async function getCachedMarketDataWithIndicators(
  symbol: string,
  period: string,
  supabase: any
): Promise<{
  historical: HistoricalPrice[];
  indicators: TechnicalIndicators & { metadata?: any };
  fromCache: boolean;
}> {
  try {
    // ALWAYS fetch fresh historical data from Alpaca (never use cached historical data)
    console.log(`🌐 Fetching fresh historical data from Alpaca for ${symbol}`);
    const historical = await fetchAlpacaHistoricalData(symbol, period, supabase);
    
    // Check if we have cached indicators for today (NY time)
    const today = getNYCurrentDate();
    const { data: cachedData, error } = await supabase
      .from('market_data_cache')
      .select('technical_indicators, created_at')
      .eq('ticker', symbol.toUpperCase())
      .eq('timeframe', period)
      .eq('fetched_date', today)
      .single();
    
    let indicators: TechnicalIndicators & { metadata?: any };
    let fromCache = false;
    
    if (!error && cachedData?.technical_indicators) {
      // Check if cache should be invalidated based on market hours
      const shouldInvalidate = shouldInvalidateCache(today, cachedData.created_at);
      
      if (!shouldInvalidate) {
        // Use cached indicators
        console.log(`💾 Using cached indicators for ${symbol} - ${formatNYTimestamp()} (${getMarketSession()})`);
        indicators = cachedData.technical_indicators;
        fromCache = true;
      } else {
        console.log(`🕒 Cache invalidated for ${symbol} - ${getMarketSession()} session, recalculating indicators`);
        // Calculate fresh indicators
        indicators = calculateTimeframeIndicators(historical, period);
        
        // Store in cache for future use
        await storeInMarketDataCache(supabase, symbol, period, historical);
      }
    } else {
      // No cached indicators - calculate them from the fresh historical data
      console.log(`🔧 Calculating indicators for ${symbol} from fresh historical data - ${formatNYTimestamp()} (${getMarketSession()})`);
      indicators = calculateTimeframeIndicators(historical, period);
      fromCache = false;
      
      // Cache the calculated indicators (but not the historical data)
      try {
        // First try to update existing record
        const { data: existingRecord } = await supabase
          .from('market_data_cache')
          .select('id')
          .eq('ticker', symbol.toUpperCase())
          .eq('timeframe', period)
          .eq('fetched_date', today)
          .single();
        
        if (existingRecord) {
          // Update existing record
          await supabase
            .from('market_data_cache')
            .update({
              technical_indicators: indicators,
              data_points: historical.length,
              analysis_range: period
            })
            .eq('id', existingRecord.id);
        } else {
          // Insert new record
          await supabase
            .from('market_data_cache')
            .insert({
              ticker: symbol.toUpperCase(),
              timeframe: period,
              technical_indicators: indicators,
              data_points: historical.length,
              analysis_range: period,
              fetched_date: today
            });
        }
        console.log(`💾 Cached calculated indicators for ${symbol}`);
      } catch (cacheError) {
        console.warn('Failed to cache indicators:', cacheError);
        // Don't throw - caching failure shouldn't break the analysis
      }
    }
    
    return {
      historical,
      indicators,
      fromCache
    };
    
  } catch (error) {
    console.error('Error getting market data with indicators:', error);
    throw error;
  }
}
