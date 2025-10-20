import { MarketData } from './types.ts';
import { getCachedMarketDataWithIndicators, type TechnicalIndicators } from '../_shared/technicalIndicators.ts';
import { calculatePeriodReturn, calculateAverageVolume } from '../_shared/marketData.ts';

/**
 * Fetch market data with cached technical indicators (similar to market-analyst)
 * This avoids passing raw historical data while providing comprehensive indicators
 */
export async function fetchMarketDataWithCachedIndicators(
  stocks: MarketData[],
  credentials: { apiKey: string; secretKey: string; paper?: boolean },
  marketRange: string,
  supabase: any,
  userId: string
): Promise<void> {
  if (!credentials.apiKey || !credentials.secretKey || stocks.length === 0) {
    console.log('Skipping market data fetch: missing credentials or empty stock list');
    return;
  }

  console.log(`📊 Fetching cached market data with indicators for ${stocks.length} stocks`);

  // Temporarily store user credentials in supabase client context for the shared function
  supabase._userCredentials = {
    userId,
    alpaca_paper_api_key: credentials.paper ? credentials.apiKey : undefined,
    alpaca_paper_secret_key: credentials.paper ? credentials.secretKey : undefined,
    alpaca_live_api_key: !credentials.paper ? credentials.apiKey : undefined,
    alpaca_live_secret_key: !credentials.paper ? credentials.secretKey : undefined,
    alpaca_paper_trading: credentials.paper
  };

  // Process each stock to get cached data with indicators
  for (const stock of stocks) {
    try {
      console.log(`💾 Fetching cached data for ${stock.ticker}...`);
      
      // Get cached market data with indicators (same as market-analyst)
      const cachedResult = await getCachedMarketDataWithIndicators(
        stock.ticker, 
        marketRange, 
        supabase
      );

      const { historical: historicalData, indicators, fromCache } = cachedResult;

      if (fromCache) {
        console.log(`🎯 Cache hit for ${stock.ticker} - using cached indicators`);
      } else {
        console.log(`🌐 Cache miss for ${stock.ticker} - fetched fresh data`);
      }

      // Calculate period metrics from historical data
      if (historicalData && historicalData.length > 0) {
        // Get latest price data
        const latestData = historicalData[historicalData.length - 1];
        const previousData = historicalData[historicalData.length - 2];

        // Update basic market data
        stock.currentPrice = latestData.close;
        stock.dayChange = latestData.close - previousData.close;
        stock.dayChangePercent = ((latestData.close - previousData.close) / previousData.close) * 100;
        stock.volume = latestData.volume;
        
        // Calculate period metrics
        stock.periodReturn = calculatePeriodReturn(historicalData);
        stock.periodAvgVolume = calculateAverageVolume(historicalData);

        // Extract key indicators (without passing raw historical data)
        if (indicators) {
          // Get the latest values from indicator arrays
          const latestIndex = indicators.rsi?.length - 1 || 0;
          
          stock.indicators = {
            rsi: indicators.rsi?.[latestIndex],
            macd: indicators.macd?.[latestIndex] ? {
              value: indicators.macd[latestIndex],
              signal: indicators.macd_signal?.[latestIndex] || 0,
              histogram: indicators.macd_histogram?.[latestIndex] || 0
            } : undefined,
            bollingerBands: indicators.bollinger_upper?.[latestIndex] ? {
              upper: indicators.bollinger_upper[latestIndex],
              middle: indicators.bollinger_middle?.[latestIndex] || stock.currentPrice,
              lower: indicators.bollinger_lower?.[latestIndex] || stock.currentPrice
            } : undefined,
            sma20: indicators.sma_20?.[latestIndex],
            sma50: indicators.sma_50?.[latestIndex],
            ema12: indicators.ema_12?.[latestIndex],
            ema26: indicators.ema_26?.[latestIndex]
          };

          // Also set top-level RSI and volatility for backward compatibility
          stock.rsi = stock.indicators.rsi;
          
          // Calculate volatility from ATR if available
          if (indicators.atr && indicators.atr[latestIndex]) {
            stock.volatility = indicators.atr[latestIndex] / stock.currentPrice;
          }
        }

        console.log(`✅ ${stock.ticker}: Price $${stock.currentPrice.toFixed(2)}, RSI: ${stock.rsi?.toFixed(1) || 'N/A'}, Period Return: ${stock.periodReturn?.toFixed(2) || 'N/A'}%`);
      } else {
        console.warn(`⚠️ No historical data available for ${stock.ticker}`);
      }

    } catch (error) {
      console.error(`Error fetching cached data for ${stock.ticker}:`, error);
      // Don't fail the entire operation if one stock fails
      stock.periodReturn = 0;
      stock.periodAvgVolume = 0;
    }
  }

  console.log('✅ Market data with cached indicators fetched successfully');
}