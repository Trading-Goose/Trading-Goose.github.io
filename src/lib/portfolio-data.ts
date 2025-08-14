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

// Helper to format timestamps based on period
const formatTimestamp = (timestamp: number, period: string): string => {
  const date = new Date(timestamp * 1000);
  
  switch (period) {
    case '1D':
      // Use 24-hour format for clarity, display in user's local timezone
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
      });
    case '1W':
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    case '1M':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case '3M':
    case 'YTD':
    case '1Y':
      return date.toLocaleDateString('en-US', { month: 'short' });
    case '5Y':
    case 'All':
      return date.toLocaleDateString('en-US', { year: 'numeric' });
    default:
      return date.toLocaleDateString();
  }
};

// Downsamples data points to a manageable number for display
const downsampleData = (
  data: PortfolioDataPoint[],
  targetPoints: number = 100
): PortfolioDataPoint[] => {
  if (!data || data.length === 0) {
    console.log('Downsample: No data to downsample');
    return [];
  }
  
  // If we already have fewer points than target, return as is
  if (data.length <= targetPoints) {
    console.log(`Downsample: Data has ${data.length} points, target is ${targetPoints}, returning as-is`);
    return data;
  }
  
  console.log(`Downsample: Reducing ${data.length} points to ${targetPoints}`);
  
  // Calculate the step size for sampling
  const step = Math.floor(data.length / targetPoints);
  const downsampled: PortfolioDataPoint[] = [];
  
  // Always include the first point (oldest)
  downsampled.push(data[0]);
  
  // Sample points at regular intervals
  for (let i = step; i < data.length - 1; i += step) {
    downsampled.push(data[i]);
  }
  
  // Always include the last point (most recent)
  const lastPoint = data[data.length - 1];
  if (downsampled[downsampled.length - 1].time !== lastPoint.time) {
    downsampled.push(lastPoint);
  }
  
  console.log(`Downsample: Final result has ${downsampled.length} points (step size was ${step})`);
  
  return downsampled;
};

// Convert Alpaca portfolio history to our format
const convertAlpacaHistory = (
  history: any,
  period: string
): PortfolioDataPoint[] => {
  if (!history || !history.timestamp || !history.equity) {
    return [];
  }

  // For 1D period, we want to use the value at market open (9:30 AM ET) as reference
  // not the base_value which might be from previous close
  let baseValue = history.base_value || history.equity[0];
  
  if (period === '1D' && history.timestamp.length > 0) {
    // Find the first timestamp that's at or after 9:30 AM ET (market open)
    // Alpaca timestamps are in seconds since epoch
    let marketOpenIndex = 0;
    
    for (let i = 0; i < history.timestamp.length; i++) {
      const date = new Date(history.timestamp[i] * 1000);
      // Get the time in ET
      const etTime = date.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      
      // Check if this is at or after 09:30
      if (etTime >= '09:30') {
        marketOpenIndex = i;
        break;
      }
    }
    
    // Use the value at market open as the base
    baseValue = history.equity[marketOpenIndex];
    console.log(`Portfolio 1D: Using market open value as base: ${baseValue} (index: ${marketOpenIndex})`);
  }
  
  return history.timestamp.map((timestamp: number, index: number) => {
    const value = history.equity[index];
    const pnl = value - baseValue;
    const pnlPercent = baseValue > 0 ? ((value - baseValue) / baseValue) * 100 : 0;
    
    return {
      time: formatTimestamp(timestamp, period),
      value: value,
      pnl: pnl,
      pnlPercent: pnlPercent
    };
  });
};

// Fetch portfolio data for all periods
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
      '1D': downsampleData(convertAlpacaHistory(dayData, '1D'), 96),
      '1W': downsampleData(convertAlpacaHistory(weekData, '1W'), 168),
      '1M': downsampleData(convertAlpacaHistory(monthData, '1M'), 30),
      '3M': downsampleData(convertAlpacaHistory(threeMonthData, '3M'), 90),
      'YTD': downsampleData(convertAlpacaHistory(ytdData, 'YTD'), 52),
      '1Y': downsampleData(convertAlpacaHistory(yearData, '1Y'), 52),
      '5Y': downsampleData(convertAlpacaHistory(allData, '5Y'), 60),
      'All': downsampleData(convertAlpacaHistory(allData, 'All'), 130)
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
  // Alpaca v2 API uses 'c' for close, 't' for timestamp
  const firstPrice = firstBar.c !== undefined ? firstBar.c : firstBar.close;
  
  if (firstPrice === undefined || firstPrice === null) {
    console.error(`Invalid first price for ${period}:`, firstBar);
    return [];
  }
  
  // For 1D period, use the first bar's price (market open) as reference
  // This shows today's change from open, not from previous close
  const referencePrice = firstPrice;
  
  return bars.map((bar: any) => {
    const price = bar.c !== undefined ? bar.c : bar.close;
    
    if (price === undefined || price === null) {
      console.warn(`Skipping bar with invalid price:`, bar);
      return null;
    }
    
    const pnl = price - referencePrice;
    const pnlPercent = referencePrice !== 0 ? ((price - referencePrice) / referencePrice) * 100 : 0;
    
    // Format time based on period
    // Alpaca returns ISO strings for timestamps in 't' field
    const date = new Date(bar.t || bar.timestamp);
    let timeLabel: string;
    
    switch (period) {
      case '1D':
        // Display in user's local timezone - the date object already has the correct time
        // from Alpaca's RFC3339 timestamps which include timezone info
        timeLabel = date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false
          // Don't specify timeZone - let it use the user's local timezone
        });
        break;
      case '1W':
        timeLabel = date.toLocaleDateString('en-US', { weekday: 'short' });
        break;
      case '1M':
        timeLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        break;
      case '3M':
      case 'YTD':
      case '1Y':
        timeLabel = date.toLocaleDateString('en-US', { month: 'short' });
        break;
      case '5Y':
      case 'All':
        timeLabel = date.toLocaleDateString('en-US', { year: 'numeric' });
        break;
      default:
        timeLabel = date.toLocaleDateString();
    }
    
    return {
      time: timeLabel,
      value: price,
      pnl: pnl,
      pnlPercent: pnlPercent
    };
  }).filter(point => point !== null) as PortfolioDataPoint[]; // Filter out any null values
};

// Get date range for different periods (for Alpaca API)
const getDateRange = (period: string): { start: string; end: string; timeframe: string } => {
  // Use actual current date
  const now = new Date();
  // Alpaca API expects RFC3339 format timestamps
  const end = now.toISOString();
  let start: Date;
  let timeframe: string;
  
  switch (period) {
    case '1D':
      // Get intraday data for today and potentially yesterday
      // Go back 3 days to ensure we capture the most recent trading day
      start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      timeframe = '5Min';
      console.log(`1D data range: ${start.toISOString()} to ${end} (intraday)`);
      break;
    case '1W':
      // 1 week with hourly data
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      timeframe = '1Hour';
      break;
    case '1M':
      // 1 month with hourly bars (4Hour not supported)
      start = new Date(now);
      start.setMonth(now.getMonth() - 1);
      timeframe = '1Hour';
      break;
    case '3M':
      // 3 months with daily bars (12Hour not supported)
      start = new Date(now);
      start.setMonth(now.getMonth() - 3);
      timeframe = '1Day';
      break;
    case 'YTD':
      // Year to date with daily data
      start = new Date(now.getFullYear(), 0, 1);
      timeframe = '1Day';
      break;
    case '1Y':
      // 1 year with daily data
      start = new Date(now);
      start.setFullYear(now.getFullYear() - 1);
      timeframe = '1Day';
      break;
    case '5Y':
      // 5 years of weekly data
      start = new Date(now);
      start.setFullYear(now.getFullYear() - 5);
      timeframe = '1Week';
      break;
    case 'All':
      // All available data - use maximum history with daily bars
      start = new Date('2015-01-01'); // Request from far back to get all available
      timeframe = '1Day';
      break;
    default:
      // Default to 1 month of daily data
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      timeframe = '1Day';
  }
  
  return { 
    start: start.toISOString(),
    end,
    timeframe
  };
};

// Fetch individual stock data using Alpaca
export const fetchStockData = async (ticker: string): Promise<StockData[string]> => {
  try {
    console.log(`Fetching historical data for ${ticker} from Alpaca...`);
    
    // Check if Alpaca is configured
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
    
    // Define periods and their configurations (removed 'live' as it's problematic)
    const periods = ['1D', '1W', '1M', '3M', 'YTD', '1Y', '5Y', 'All'];
    const stockData: any = {};
    
    // Fetch data for each period
    const fetchPromises = periods.map(async (period) => {
      try {
        const { start, end, timeframe } = getDateRange(period);
        
        // Apply different downsampling based on period
        let targetPoints = 100; // Default for good chart resolution
        switch (period) {
          case '1D':
            targetPoints = 96; // Every 15 minutes for a day
            break;
          case '1W':
            targetPoints = 168; // Hourly for a week
            break;
          case '1M':
            targetPoints = 30; // Daily points for a month
            break;
          case '3M':
            targetPoints = 90; // Daily for 3 months
            break;
          case 'YTD':
            targetPoints = 52; // Weekly for YTD
            break;
          case '1Y':
            targetPoints = 52; // Weekly for a year (1 point per week)
            break;
          case '5Y':
            targetPoints = 60; // Monthly for 5 years (12 points per year)
            break;
          case 'All':
            targetPoints = 130; // Bi-weekly data (26 weeks * 5 years = 130 points for 5 years, more for longer)
            break;
        }
        
        // Log the request details for debugging
        console.log(`Fetching ${period} data for ${ticker}:`, {
          timeframe,
          start,
          end,
          targetPoints
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
          stockData[period] = [];
          return;
        }
        
        // For 1D, we need to get previous day's close to calculate proper daily change
        let previousClose: number | null = null;
        let filteredBars = bars;
        
        if (period === '1D' && bars.length > 0) {
          // Sort bars by time to ensure chronological order
          const sortedBars = [...bars].sort((a: any, b: any) => {
            const timeA = new Date(a.t || a.timestamp).getTime();
            const timeB = new Date(b.t || b.timestamp).getTime();
            return timeA - timeB;
          });
          
          // Find the most recent trading day
          // Compare dates in market timezone (ET) to avoid timezone issues
          const mostRecentBar = sortedBars[sortedBars.length - 1];
          const mostRecentBarTime = new Date(mostRecentBar.t || mostRecentBar.timestamp);
          
          // Get the market date (ET) for the most recent bar
          const marketDateStr = mostRecentBarTime.toLocaleDateString('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
          
          // Filter to only include bars from the most recent trading day
          // Compare dates in ET timezone to ensure correct filtering
          filteredBars = sortedBars.filter((bar: any) => {
            const barTime = new Date(bar.t || bar.timestamp);
            const barMarketDate = barTime.toLocaleDateString('en-US', {
              timeZone: 'America/New_York',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            });
            return barMarketDate === marketDateStr;
          });
          
          // For logging purposes, show the gap from previous close
          // But we'll use today's open as reference for the chart
          try {
            const batchData = await alpacaAPI.getBatchData([ticker], {
              includeQuotes: true,
              includeBars: true
            });
            
            if (batchData[ticker]?.previousBar && filteredBars.length > 0) {
              const prevClose = batchData[ticker].previousBar.c;
              const todayOpen = filteredBars[0].c || filteredBars[0].close;
              const gapFromPrevClose = todayOpen - prevClose;
              const gapPercent = prevClose > 0 ? (gapFromPrevClose / prevClose) * 100 : 0;
              console.log(`${ticker} - Previous close: ${prevClose}, Today's open: ${todayOpen}, Gap: ${gapFromPrevClose.toFixed(2)} (${gapPercent.toFixed(2)}%)`);
            }
          } catch (err) {
            console.warn(`Could not fetch previous close for logging:`, err);
          }
          
          console.log(`1D data filtered to most recent trading day:`, {
            originalBars: sortedBars.length,
            filteredBars: filteredBars.length,
            marketDate: marketDateStr,
            previousClose,
            firstBar: filteredBars[0] ? new Date(filteredBars[0].t || filteredBars[0].timestamp).toLocaleString() : 'none',
            lastBar: filteredBars[filteredBars.length - 1] ? new Date(filteredBars[filteredBars.length - 1].t || filteredBars[filteredBars.length - 1].timestamp).toLocaleString() : 'none'
          });
        }
        
        // Convert and downsample the data for display
        // For 1D, we use open price as reference (already handled in convertBarsToDataPoints)
        const fullData = convertBarsToDataPoints(filteredBars, period);
        
        // Log the actual time labels for 1D data
        if (period === '1D' && fullData.length > 0) {
          console.log('1D data time labels:', {
            first3: fullData.slice(0, 3).map(d => d.time),
            last3: fullData.slice(-3).map(d => d.time),
            total: fullData.length
          });
        }
        
        stockData[period] = downsampleData(fullData, targetPoints);
        console.log(`Converted ${period} data for ${ticker}: ${fullData.length} points downsampled to ${stockData[period].length}`);
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