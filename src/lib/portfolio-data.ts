import { alpacaAPI } from './alpaca';
import { useAuth } from './auth';

export interface PortfolioDataPoint {
  time: string;
  value: number;
  pnl: number;
  pnlPercent?: number;
}

export interface PortfolioData {
  '1D': PortfolioDataPoint[];
  '1W': PortfolioDataPoint[];
  '1M': PortfolioDataPoint[];
  '3M': PortfolioDataPoint[];
  'YTD': PortfolioDataPoint[];
  '1Y': PortfolioDataPoint[];
  '5Y': PortfolioDataPoint[];
  'All': PortfolioDataPoint[];
}

export interface StockData {
  [ticker: string]: {
    '1D': PortfolioDataPoint[];
    '1W': PortfolioDataPoint[];
    '1M': PortfolioDataPoint[];
    '3M': PortfolioDataPoint[];
    'YTD': PortfolioDataPoint[];
    '1Y': PortfolioDataPoint[];
    '5Y': PortfolioDataPoint[];
    'All': PortfolioDataPoint[];
  };
}

// Period configuration centralized
interface PeriodConfig {
  apiPeriod?: '1D' | '1W' | '1M' | '3M' | '1A' | 'all';
  timeframe: string;
  downsampleTarget: number;
  dateFormat: Intl.DateTimeFormatOptions;
}

const PERIOD_CONFIGS: Record<string, PeriodConfig> = {
  '1D': {
    apiPeriod: '1D',
    timeframe: '5Min',
    downsampleTarget: 30,
    dateFormat: { hour: '2-digit', minute: '2-digit', hour12: false }
  },
  '1W': {
    apiPeriod: '1W',
    timeframe: '2Hour',
    downsampleTarget: 30,
    dateFormat: { weekday: 'short' }
  },
  '1M': {
    apiPeriod: '1M',
    timeframe: '6Hour',
    downsampleTarget: 0, // No downsampling for 1M
    dateFormat: { month: 'short', day: 'numeric' }
  },
  '3M': {
    apiPeriod: '3M',
    timeframe: '1Day',
    downsampleTarget: 30,
    dateFormat: { month: 'short', day: 'numeric' }
  },
  'YTD': {
    apiPeriod: '1A',
    timeframe: '1Day',
    downsampleTarget: 40,
    dateFormat: { month: 'short', day: 'numeric' }
  },
  '1Y': {
    apiPeriod: '1A',
    timeframe: '1Day',
    downsampleTarget: 40,
    dateFormat: { month: 'short', day: 'numeric' }
  },
  '5Y': {
    apiPeriod: 'all',
    timeframe: '1Week',
    downsampleTarget: 50,
    dateFormat: { month: 'short', year: 'numeric' }
  },
  'All': {
    apiPeriod: 'all',
    timeframe: '1Day',
    downsampleTarget: 50,
    dateFormat: { month: 'short', year: 'numeric' }
  }
};

// Unified date formatting helper
const formatDate = (date: Date, period: string): string => {
  const config = PERIOD_CONFIGS[period];
  if (!config) return date.toLocaleDateString();
  
  // For time-based formatting (1D), use toLocaleTimeString
  if (period === '1D') {
    return date.toLocaleTimeString('en-US', config.dateFormat);
  }
  
  return date.toLocaleDateString('en-US', config.dateFormat);
};

// Helper to format timestamps (for portfolio history with Unix timestamps)
const formatTimestamp = (timestamp: number, period: string): string => {
  return formatDate(new Date(timestamp * 1000), period);
};

// Get target points for downsampling based on period
const getDownsampleTarget = (period: string): number => {
  return PERIOD_CONFIGS[period]?.downsampleTarget || 30;
};

// Downsamples data points to a manageable number for display
const downsampleData = (
  data: PortfolioDataPoint[],
  period: string
): PortfolioDataPoint[] => {
  if (!data || data.length === 0) {
    console.log('Downsample: No data to downsample');
    return [];
  }

  const targetPoints = getDownsampleTarget(period);
  
  // No downsampling if target is 0 (e.g., for 1M period)
  if (targetPoints === 0) return data;

  // If we already have fewer points than target, return as is
  if (data.length <= targetPoints) {
    console.log(`Downsample: Data has ${data.length} points, target is ${targetPoints}, returning as-is`);
    return data;
  }

  console.log(`Downsample: Reducing ${data.length} points to ${targetPoints}`);

  const step = data.length / targetPoints;
  const downsampled: PortfolioDataPoint[] = [];

  // Always include the first point (oldest)
  downsampled.push(data[0]);

  // Sample points at regular intervals
  for (let i = 1; i < targetPoints - 1; i++) {
    const index = Math.floor(i * step);
    if (index < data.length) {
      downsampled.push(data[index]);
    }
  }

  // Always include the last point (most recent)
  const lastPoint = data[data.length - 1];
  if (downsampled[downsampled.length - 1].time !== lastPoint.time) {
    downsampled.push(lastPoint);
  }

  console.log(`Downsample: Final result has ${downsampled.length} points (step size was ${step.toFixed(2)})`);
  return downsampled;
};

// Find market open index for 1D data
const findMarketOpenIndex = (timestamps: number[]): number => {
  for (let i = 0; i < timestamps.length; i++) {
    const date = new Date(timestamps[i] * 1000);
    const etTime = date.toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    if (etTime >= '09:30') return i;
  }
  return 0;
};

// Convert Alpaca portfolio history to our format
const convertAlpacaHistory = (
  history: any,
  period: string
): PortfolioDataPoint[] => {
  if (!history || !history.timestamp || !history.equity) {
    return [];
  }

  // For 1D period, use market open value as reference
  let baseValue = history.base_value || history.equity[0];
  if (period === '1D' && history.timestamp.length > 0) {
    const marketOpenIndex = findMarketOpenIndex(history.timestamp);
    baseValue = history.equity[marketOpenIndex];
    console.log(`Portfolio 1D: Using market open value as base: ${baseValue} (index: ${marketOpenIndex})`);
  }

  return history.timestamp.map((timestamp: number, index: number) => {
    const value = history.equity[index];
    const pnl = value - baseValue;
    const pnlPercent = baseValue > 0 ? ((value - baseValue) / baseValue) * 100 : 0;

    return {
      time: formatTimestamp(timestamp, period),
      value,
      pnl,
      pnlPercent
    };
  });
};

// Get API period and timeframe for portfolio history
const getPortfolioApiConfig = (period: string): { apiPeriod: string; timeframe: string } => {
  const config = PERIOD_CONFIGS[period];
  
  // Special handling for portfolio API which uses different timeframes
  const portfolioTimeframes: Record<string, string> = {
    '1D': '5Min',
    '1W': '1H',
    '1M': '1D', // 1D because intraday timeframes only allowed for periods < 30 days
    '3M': '1D',
    'YTD': '1D',
    '1Y': '1D',
    '5Y': '1D',
    'All': '1D'
  };
  
  return {
    apiPeriod: config?.apiPeriod || '1M',
    timeframe: portfolioTimeframes[period] || '1D'
  };
};

// Fetch portfolio data for a specific period
export const fetchPortfolioDataForPeriod = async (period: string): Promise<PortfolioDataPoint[]> => {
  try {
    const { apiPeriod, timeframe } = getPortfolioApiConfig(period);
    const data = await alpacaAPI.getPortfolioHistory(apiPeriod as any, timeframe as any);
    let convertedData = convertAlpacaHistory(data, period);

    // For YTD, filter to current year only
    if (period === 'YTD') {
      convertedData = filterToCurrentYear(convertedData, data);
    }

    return downsampleData(convertedData, period);
  } catch (error) {
    console.error(`Error fetching portfolio data for period ${period}:`, error);
    throw error;
  }
};

// Legacy function - kept for backward compatibility but now fetches all periods
// This should be avoided in favor of fetchPortfolioDataForPeriod
export const fetchPortfolioData = async (): Promise<PortfolioData> => {
  try {
    // Fetch portfolio history for various periods
    const [dayData, weekData, monthData, threeMonthData, yearData] = await Promise.all([
      alpacaAPI.getPortfolioHistory('1D', '5Min'),
      alpacaAPI.getPortfolioHistory('1W', '1H'),
      alpacaAPI.getPortfolioHistory('1M', '1D'),
      alpacaAPI.getPortfolioHistory('3M', '1D'),
      alpacaAPI.getPortfolioHistory('1A', '1D')
    ]);

    // For YTD, calculate the period from Jan 1 to now
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const daysSinceYearStart = Math.floor((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));

    // Fetch YTD data
    const ytdData = await alpacaAPI.getPortfolioHistory(
      daysSinceYearStart > 30 ? '3M' : '1M',
      '1D'
    );

    // For 5Y and All, we'll use 'all' which gives us the maximum available data
    const allData = await alpacaAPI.getPortfolioHistory('all', '1D');

    return {
      '1D': downsampleData(convertAlpacaHistory(dayData, '1D'), '1D'),
      '1W': downsampleData(convertAlpacaHistory(weekData, '1W'), '1W'),
      '1M': downsampleData(convertAlpacaHistory(monthData, '1M'), '1M'),
      '3M': downsampleData(convertAlpacaHistory(threeMonthData, '3M'), '3M'),
      'YTD': downsampleData(convertAlpacaHistory(ytdData, 'YTD'), 'YTD'),
      '1Y': downsampleData(convertAlpacaHistory(yearData, '1Y'), '1Y'),
      '5Y': downsampleData(convertAlpacaHistory(allData, '5Y'), '5Y'),
      'All': downsampleData(convertAlpacaHistory(allData, 'All'), 'All')
    };
  } catch (error) {
    console.error('Error fetching portfolio data:', error);
    throw error;
  }
};

// Helper to convert Alpaca bar data to our format
const convertBarsToDataPoints = (
  bars: any[],
  period: string
): PortfolioDataPoint[] => {
  if (!bars || bars.length === 0) {
    console.log(`No bars to convert for period ${period}`);
    return [];
  }

  console.log(`Converting ${bars.length} bars for period ${period}. Sample bar:`, bars[0]);

  const firstBar = bars[0];
  const firstPrice = firstBar.c !== undefined ? firstBar.c : firstBar.close;

  if (firstPrice === undefined || firstPrice === null) {
    console.error(`Invalid first price for ${period}:`, firstBar);
    return [];
  }

  const referencePrice = firstPrice;

  return bars.map((bar: any) => {
    const price = bar.c !== undefined ? bar.c : bar.close;
    if (price === undefined || price === null) {
      console.warn(`Skipping bar with invalid price:`, bar);
      return null;
    }

    const pnl = price - referencePrice;
    const pnlPercent = referencePrice !== 0 ? ((price - referencePrice) / referencePrice) * 100 : 0;
    const date = new Date(bar.t || bar.timestamp);

    return {
      time: formatDate(date, period),
      value: price,
      pnl,
      pnlPercent
    };
  }).filter(point => point !== null) as PortfolioDataPoint[];
};

// Filter data to current year (for YTD period)
const filterToCurrentYear = (convertedData: PortfolioDataPoint[], rawData: any): PortfolioDataPoint[] => {
  if (!rawData?.timestamp || rawData.timestamp.length === 0) return convertedData;
  
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1).getTime() / 1000;
  
  const startIndex = rawData.timestamp.findIndex((ts: number) => ts >= yearStart);
  if (startIndex <= 0) return convertedData;
  
  const filteredHistory = {
    ...rawData,
    timestamp: rawData.timestamp.slice(startIndex),
    equity: rawData.equity.slice(startIndex),
    base_value: rawData.equity[startIndex]
  };
  
  return convertAlpacaHistory(filteredHistory, 'YTD');
};

// Filter bars to most recent trading day
const filterToMostRecentTradingDay = (bars: any[]): any[] => {
  if (bars.length === 0) return bars;
  
  const sortedBars = [...bars].sort((a, b) => {
    const timeA = new Date(a.t || a.timestamp).getTime();
    const timeB = new Date(b.t || b.timestamp).getTime();
    return timeA - timeB;
  });
  
  const mostRecentBar = sortedBars[sortedBars.length - 1];
  const mostRecentBarTime = new Date(mostRecentBar.t || mostRecentBar.timestamp);
  const marketDateStr = mostRecentBarTime.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  return sortedBars.filter((bar: any) => {
    const barTime = new Date(bar.t || bar.timestamp);
    const barMarketDate = barTime.toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return barMarketDate === marketDateStr;
  });
};

// Get date range for different periods (for Alpaca API)
const getDateRange = (period: string): { start: string; end: string; timeframe: string } => {
  const now = new Date();
  const end = now.toISOString();
  let start: Date;
  
  const config = PERIOD_CONFIGS[period];
  const timeframe = config?.timeframe || '1Day';

  switch (period) {
    case '1D':
      start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      break;
    case '1W':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '1M':
      start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      break;
    case '3M':
      start = new Date(now);
      start.setMonth(now.getMonth() - 3);
      break;
    case 'YTD':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case '1Y':
      start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      break;
    case '5Y':
      start = new Date(now);
      start.setFullYear(now.getFullYear() - 5);
      break;
    case 'All':
      start = new Date('2015-01-01');
      break;
    default:
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { start: start.toISOString(), end, timeframe };
};

// Check Alpaca credentials
const checkAlpacaCredentials = (): void => {
  const authState = useAuth.getState();
  const apiSettings = authState.apiSettings;
  const isPaperTrading = apiSettings?.alpaca_paper_trading ?? true;
  const hasCredentials = isPaperTrading
    ? (apiSettings?.alpaca_paper_api_key && apiSettings?.alpaca_paper_secret_key)
    : (apiSettings?.alpaca_live_api_key && apiSettings?.alpaca_live_secret_key);

  if (!hasCredentials) {
    console.error('Alpaca API credentials not configured');
    throw new Error('Alpaca API credentials not configured. Please add them in Settings.');
  }
};

// Fetch stock data for a specific period
export const fetchStockDataForPeriod = async (ticker: string, period: string): Promise<PortfolioDataPoint[]> => {
  try {
    console.log(`Fetching ${period} data for ${ticker} from Alpaca...`);
    checkAlpacaCredentials();

    const { start, end, timeframe } = getDateRange(period);

    // Log the request details for debugging
    console.log(`Fetching ${period} data for ${ticker}:`, {
      timeframe,
      start,
      end
    });

    // Use the Alpaca getStockBars method
    let bars = await alpacaAPI.getStockBars(
      ticker,
      timeframe,
      start,
      end
    );

    console.log(`Response for ${ticker} ${period}:`, {
      barsReceived: bars?.length || 0,
      firstBar: bars?.[0] ? { time: bars[0].t, close: bars[0].c } : null,
      lastBar: bars?.[bars.length - 1] ? { time: bars[bars.length - 1].t, close: bars[bars.length - 1].c } : null
    });

    if (!bars || bars.length === 0) {
      console.warn(`No ${period} data available for ${ticker}. This could be due to market hours or no trading activity.`);
      return [];
    }

    // For 1D, filter to most recent trading day
    let filteredBars = period === '1D' && bars.length > 0 
      ? filterToMostRecentTradingDay(bars)
      : bars;

    if (period === '1D' && filteredBars.length !== bars.length) {
      console.log(`1D data filtered: ${bars.length} -> ${filteredBars.length} bars`);
    }

    // Convert and downsample the data for display
    let fullData = convertBarsToDataPoints(filteredBars, period);

    // For YTD, filter to current year
    if (period === 'YTD' && filteredBars.length > 0) {
      const currentYear = new Date().getFullYear();
      const yearStartTime = new Date(currentYear, 0, 1).getTime();
      const ytdBars = filteredBars.filter((bar: any) => 
        new Date(bar.t || bar.timestamp).getTime() >= yearStartTime
      );
      if (ytdBars.length > 0) {
        fullData = convertBarsToDataPoints(ytdBars, period);
      }
    }

    return downsampleData(fullData, period);
  } catch (error) {
    console.error(`Error fetching ${period} data for ${ticker}:`, error);
    return [];
  }
};

// Legacy function - kept for backward compatibility but now fetches all periods
// This should be avoided in favor of fetchStockDataForPeriod
export const fetchStockData = async (ticker: string): Promise<StockData[string]> => {
  try {
    console.log(`Fetching historical data for ${ticker} from Alpaca...`);
    checkAlpacaCredentials();

    // Define periods
    const periods = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'All'];
    const stockData: any = {};

    // Fetch data for each period using the refactored single-period function
    const fetchPromises = periods.map(async (period) => {
      try {
        stockData[period] = await fetchStockDataForPeriod(ticker, period);
      } catch (err) {
        console.error(`Error fetching ${period} data for ${ticker}:`, err);
        stockData[period] = [];
      }
    });

    await Promise.all(fetchPromises);

    return stockData as StockData[string];
  } catch (error) {
    console.error(`Error fetching data for ${ticker}:`, error);
    // Return empty data structure on error
    return {
      '1D': [],
      '1W': [],
      '1M': [],
      '3M': [],
      'YTD': [],
      '1Y': [],
      '5Y': [],
      'All': []
    };
  }
};