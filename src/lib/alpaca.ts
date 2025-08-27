/**
 * Alpaca Trading API Integration
 */

import { useAuth } from './auth';
import { supabase } from './supabase';

interface AlpacaConfig {
  apiKey: string;
  secretKey: string;
  paper: boolean;
}

interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  sma: string;
  daytrade_count: number;
  balance_asof: string;
  created_at: string;
  trade_suspended_by_user: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  pattern_day_trader: boolean;
  daytrading_buying_power: string;
  regt_buying_power: string;
  cash_withdrawable: string;
}

interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  avg_entry_price: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: string;
  filled_qty: string;
  type: string;
  side: 'buy' | 'sell';
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  filled_avg_price: string | null;
  status: string;
  extended_hours: boolean;
}

interface AlpacaPortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
}

interface CreateOrderRequest {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'day' | 'gtc' | 'opg' | 'cls' | 'ioc' | 'fok';
  limit_price?: number;
  stop_price?: number;
  client_order_id?: string;
}

class AlpacaAPI {
  private getConfig(): AlpacaConfig | null {
    const authState = useAuth.getState();
    const apiSettings = authState.apiSettings;
    
    const isPaper = apiSettings?.alpaca_paper_trading ?? true;
    
    if (isPaper) {
      // Paper trading - use paper credentials
      if (!apiSettings?.alpaca_paper_api_key || !apiSettings?.alpaca_paper_secret_key) {
        return null;
      }
      return {
        apiKey: apiSettings.alpaca_paper_api_key,
        secretKey: apiSettings.alpaca_paper_secret_key,
        paper: true
      };
    } else {
      // Live trading - use live credentials
      if (!apiSettings?.alpaca_live_api_key || !apiSettings?.alpaca_live_secret_key) {
        return null;
      }
      return {
        apiKey: apiSettings.alpaca_live_api_key,
        secretKey: apiSettings.alpaca_live_secret_key,
        paper: false
      };
    }
  }

  private getBaseUrl(config: AlpacaConfig): string {
    return config.paper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
  }
  
  private getDataUrl(config: AlpacaConfig): string {
    // Data API URL is the same for both paper and live
    return 'https://data.alpaca.markets';
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    // Use Supabase edge function as proxy
    // The supabase client will handle authentication automatically
    const { data, error } = await supabase.functions.invoke('alpaca-proxy', {
      body: {
        method: options.method || 'GET',
        endpoint,
        body: options.body ? JSON.parse(options.body as string) : undefined
      }
    });

    if (error) {
      console.error('Edge function error:', error);
      throw new Error(`Alpaca API error: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data received from Alpaca API');
    }

    if (data.error) {
      console.error('Alpaca API error:', data.error);
      throw new Error(`Alpaca API error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
    }

    return data as T;
  }

  // Account Methods
  async getAccount(): Promise<AlpacaAccount> {
    // Use batch endpoint for better performance
    const batchData = await this.getBatchAccountData();
    if (!batchData.account) {
      // Return a default account object if Alpaca is unavailable
      console.warn('No account data received, returning default values');
      return {
        id: '',
        account_number: '',
        status: 'ACTIVE',
        currency: 'USD',
        buying_power: '0',
        cash: '0',
        portfolio_value: '0',
        equity: '0',
        last_equity: '0',
        long_market_value: '0',
        short_market_value: '0',
        initial_margin: '0',
        maintenance_margin: '0',
        sma: '0',
        daytrade_count: 0,
        balance_asof: new Date().toISOString()
      } as AlpacaAccount;
    }
    return batchData.account;
  }

  // Positions Methods
  async getPositions(): Promise<AlpacaPosition[]> {
    // Use batch endpoint for better performance
    const batchData = await this.getBatchAccountData();
    return batchData.positions || [];
  }

  async getPosition(symbol: string): Promise<AlpacaPosition> {
    return this.request<AlpacaPosition>(`/v2/positions/${symbol}`);
  }

  async closePosition(symbol: string): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>(`/v2/positions/${symbol}`, {
      method: 'DELETE',
    });
  }

  async closeAllPositions(): Promise<AlpacaOrder[]> {
    return this.request<AlpacaOrder[]>('/v2/positions', {
      method: 'DELETE',
    });
  }

  // Orders Methods
  async getOrders(status?: 'open' | 'closed' | 'all'): Promise<AlpacaOrder[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    return this.request<AlpacaOrder[]>(`/v2/orders?${params}`);
  }

  async createOrder(order: CreateOrderRequest): Promise<AlpacaOrder> {
    return this.request<AlpacaOrder>('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request(`/v2/orders/${orderId}`, {
      method: 'DELETE',
    });
  }

  // Portfolio History
  async getPortfolioHistory(
    period?: '1D' | '1W' | '1M' | '3M' | '1A' | 'all',
    timeframe?: '1Min' | '5Min' | '15Min' | '1H' | '1D'
  ): Promise<AlpacaPortfolioHistory> {
    const params = new URLSearchParams();
    if (period) params.append('period', period);
    if (timeframe) params.append('timeframe', timeframe);
    
    return this.request<AlpacaPortfolioHistory>(
      `/v2/account/portfolio/history?${params}`
    );
  }

  // Market Data (requires data subscription)
  async getLatestQuote(symbol: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('alpaca-proxy', {
      body: {
        method: 'GET',
        endpoint: `/v2/stocks/${symbol}/quotes/latest`
      }
    });

    if (error) {
      throw new Error(`Failed to fetch quote for ${symbol}: ${error.message}`);
    }

    if (!data) {
      throw new Error(`No quote data received for ${symbol}`);
    }

    if (data.error) {
      throw new Error(`Failed to fetch quote: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
    }

    return data;
  }

  // Helper to get the last trading day (skip weekends)
  getLastTradingDay(date: Date = new Date()): string {
    const day = date.getDay();
    const daysToSubtract = day === 0 ? 2 : (day === 1 ? 3 : 1); // Sunday: -2, Monday: -3, other days: -1
    const lastTradingDay = new Date(date);
    lastTradingDay.setDate(date.getDate() - daysToSubtract);
    return lastTradingDay.toISOString().split('T')[0];
  }

  // Get historical bars for a stock
  async getStockBars(
    symbol: string, 
    timeframe: string = '1Day',
    start?: string,
    end?: string,
    limit?: number
  ): Promise<any> {
    const params: Record<string, string> = {
      timeframe,
      limit: (limit || 10000).toString(),
      adjustment: 'raw',
      feed: 'iex'
    };
    
    if (start) params.start = start;
    if (end) params.end = end;

    const { data, error } = await supabase.functions.invoke('alpaca-proxy', {
      body: {
        method: 'GET',
        endpoint: `/v2/stocks/${symbol}/bars`,
        params
      }
    });

    if (error) {
      console.error(`Failed to fetch bars for ${symbol}:`, error);
      throw new Error(`Failed to fetch bars for ${symbol}: ${error.message}`);
    }

    if (!data) {
      throw new Error(`No bar data received for ${symbol}`);
    }

    if (data.error) {
      console.error(`Failed to fetch bars for ${symbol}:`, data.error);
      throw new Error(`Failed to fetch bars for ${symbol}: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
    }
    
    // Handle null bars response (no data for the requested period)
    if (data.bars === null) {
      console.log(`No bars data available for ${symbol} (${timeframe}) - market may be closed or date out of range`);
      return [];
    }
    
    console.log(`Alpaca bars response for ${symbol} (${timeframe}):`, {
      hasData: !!data,
      hasBars: !!data.bars,
      symbolKey: data.bars?.[symbol] ? 'found' : 'not found',
      barCount: data.bars?.[symbol]?.length || 0,
      keys: Object.keys(data)
    });
    
    // Alpaca v2 API returns: { bars: [...], symbol: "SYMBOL", next_page_token: null }
    // The bars are in an array directly, not nested under symbol
    if (data.bars && Array.isArray(data.bars)) {
      console.log(`Returning ${data.bars.length} bars from data.bars array`);
      return data.bars;
    } else if (data.bars && data.bars[symbol]) {
      console.log(`Returning ${data.bars[symbol].length} bars from data.bars[${symbol}]`);
      return data.bars[symbol];
    } else if (data[symbol]) {
      console.log(`Returning ${data[symbol].length} bars from data[${symbol}]`);
      return data[symbol];
    } else if (Array.isArray(data)) {
      console.log(`Returning ${data.length} bars from direct array`);
      return data;
    }
    
    console.warn(`Unexpected bars response structure for ${symbol}:`, data);
    return [];
  }

  // Get all available assets (for search/autocomplete)
  async getAssets(searchQuery?: string): Promise<any[]> {
    
    // If we have a search query, try to get the specific asset first
    if (searchQuery && searchQuery.length > 0) {
      const results: any[] = [];
      
      // Try exact symbol match first
      try {
        const exactMatch = await this.getAsset(searchQuery.toUpperCase());
        if (exactMatch && exactMatch.tradable && exactMatch.status === 'active') {
          results.push(exactMatch);
        }
      } catch (err) {
        // Symbol doesn't exist, that's ok
        console.log(`No exact match for ${searchQuery}`);
      }
      
      // Also fetch all assets and filter for partial matches
      // Note: Alpaca doesn't have a search endpoint, so we need to fetch all and filter
      // This is cached by the browser for subsequent searches
      const { data, error } = await supabase.functions.invoke('alpaca-proxy', {
        body: {
          method: 'GET',
          endpoint: '/v2/assets',
          params: {
            status: 'active',
            asset_class: 'us_equity'
          }
        }
      });
      
      if (error) {
        throw new Error(`Failed to fetch assets: ${error.message}`);
      }
      
      if (!data) {
        throw new Error('No assets data received');
      }
      
      if (data.error) {
        throw new Error(`Failed to fetch assets: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
      }
      
      const allAssets = data;
      const query = searchQuery.toUpperCase();
      
      // Filter for partial matches (excluding exact match if we already have it)
      const filtered = allAssets.filter((asset: any) => {
        if (!asset.tradable || asset.status !== 'active') return false;
        if (results.length > 0 && asset.symbol === results[0].symbol) return false;
        
        // Check if symbol starts with or contains the query
        const symbolMatch = asset.symbol.startsWith(query) || 
                          (query.length >= 2 && asset.symbol.includes(query));
        // Check if name contains the query
        const nameMatch = asset.name && asset.name.toUpperCase().includes(query);
        
        return symbolMatch || nameMatch;
      });
      
      // Sort matches: symbols starting with query first, then contains
      filtered.sort((a: any, b: any) => {
        const aStarts = a.symbol.startsWith(query);
        const bStarts = b.symbol.startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.symbol.localeCompare(b.symbol);
      });
      
      // Combine exact match with filtered results
      return [...results, ...filtered].slice(0, 15); // Return up to 15 results
    }
    
    // No search query, just return active US equities
    const { data, error } = await supabase.functions.invoke('alpaca-proxy', {
      body: {
        method: 'GET',
        endpoint: '/v2/assets',
        params: {
          status: 'active',
          asset_class: 'us_equity'
        }
      }
    });
    
    if (error) {
      throw new Error(`Failed to fetch assets: ${error.message}`);
    }
    
    if (!data) {
      throw new Error('No assets data received');
    }
    
    if (data.error) {
      throw new Error(`Failed to fetch assets: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
    }
    
    return data;
  }
  
  // Get specific asset information
  async getAsset(symbol: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke('alpaca-proxy', {
      body: {
        method: 'GET',
        endpoint: `/v2/assets/${symbol}`
      }
    });
    
    if (error) {
      throw new Error(`Failed to fetch asset ${symbol}: ${error.message}`);
    }
    
    if (!data) {
      throw new Error(`No asset data received for ${symbol}`);
    }
    
    if (data.error) {
      throw new Error(`Failed to fetch asset: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
    }
    
    return data;
  }

  // Batch operations for efficiency
  async getBatchData(tickers: string[], options?: { includeQuotes?: boolean; includeBars?: boolean }) {
    const { data, error } = await supabase.functions.invoke('alpaca-batch', {
      body: {
        tickers,
        includeQuotes: options?.includeQuotes ?? true,
        includeBars: options?.includeBars ?? false
      }
    });

    if (error) {
      throw new Error(`Failed to fetch batch data: ${error.message}`);
    }

    if (!data) {
      throw new Error('No batch data received');
    }

    if (data.error) {
      throw new Error(`Batch data error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
    }

    return data.data || {};
  }

  // Batch method for account and positions data
  async getBatchAccountData() {
    const { data, error } = await supabase.functions.invoke('alpaca-batch', {
      body: {
        includeAccount: true,
        includePositions: true
      }
    });

    // Handle Supabase edge function errors
    if (error) {
      console.error('Edge function error:', error);
      
      // Try to extract the actual error message from the response
      // Supabase wraps errors, so we need to check the context
      if (error.context) {
        try {
          const errorResponse = await error.context.json();
          if (errorResponse.error) {
            // This is the actual error message from our edge function
            throw new Error(errorResponse.error);
          }
        } catch (e) {
          // If we can't parse the error, check for known patterns
          if (error.message?.includes('503')) {
            throw new Error('Alpaca services appear to be down. Please check https://app.alpaca.markets/dashboard/overview for status.');
          } else if (error.message?.includes('504')) {
            throw new Error('Unable to connect to Alpaca. Please check if Alpaca services are operational at https://app.alpaca.markets/dashboard/overview');
          }
        }
      }
      
      // Fallback error message
      throw new Error(`Failed to fetch account data: ${error.message}`);
    }

    if (!data) {
      throw new Error('No account data received');
    }

    if (data.error) {
      // Pass through the error message from edge function
      throw new Error(data.error);
    }

    return data.data || {};
  }

  // Portfolio Metrics Calculation
  async calculateMetrics() {
    try {
      // Use batch endpoint for account and positions
      const [batchData, history] = await Promise.all([
        this.getBatchAccountData().catch(err => {
          console.warn('Failed to get batch account data:', err);
          return { account: null, positions: [] };
        }),
        this.getPortfolioHistory('1D', '5Min').catch(err => {
          console.warn('Failed to get portfolio history:', err);
          return { timestamp: [], equity: [], profit_loss: [], profit_loss_pct: [] };
        })
      ]);

      const account = batchData.account;
      const positions = batchData.positions || [];
      
      // If no account data, return default metrics
      if (!account) {
        console.warn('No account data available, returning default metrics');
        return {
          accountValue: 0,
          cashAvailable: 0,
          buyingPower: 0,
          todayReturn: 0,
          todayReturnPct: 0,
          totalReturn: 0,
          totalReturnPct: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          positions: []
        };
      }

      const currentEquity = parseFloat(account.equity);
      const lastEquity = parseFloat(account.last_equity);
      const cashAvailable = parseFloat(account.cash);
      const buyingPower = parseFloat(account.buying_power);

      console.log('Account data:', {
        currentEquity,
        lastEquity,
        cashAvailable,
        buyingPower
      });

      // Today's return
      const todayReturn = currentEquity - lastEquity;
      const todayReturnPct = (todayReturn / lastEquity) * 100;

      // Total return - calculate from current equity vs initial investment
      // The initial investment for paper trading is typically $100,000
      const initialInvestment = 100000;
      
      // Total return is the difference between current equity and initial investment
      // This accounts for all gains/losses including closed positions and cash
      const totalReturn = currentEquity - initialInvestment;
      const totalReturnPct = (totalReturn / initialInvestment) * 100;
      
      console.log('Return calculations:', {
        currentEquity,
        initialInvestment,
        totalReturn,
        totalReturnPct,
        todayReturn,
        todayReturnPct,
        positionsCount: positions?.length || 0
      });

      // Calculate max drawdown
      let maxDrawdown = 0;
      let peak = history.equity[0];
      for (const equity of history.equity) {
        if (equity > peak) peak = equity;
        const drawdown = ((peak - equity) / peak) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      // Calculate Sharpe ratio (simplified - daily returns)
      const returns: number[] = [];
      for (let i = 1; i < history.equity.length; i++) {
        const dailyReturn = (history.equity[i] - history.equity[i - 1]) / history.equity[i - 1];
        returns.push(dailyReturn);
      }
      
      const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const stdDev = Math.sqrt(
        returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length
      );
      const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

      return {
        accountValue: currentEquity,
        cashAvailable,
        buyingPower,
        todayReturn,
        todayReturnPct,
        totalReturn,
        totalReturnPct,
        maxDrawdown,
        sharpeRatio,
        positions: positions.map((pos: any) => ({
          symbol: pos.symbol,
          shares: parseFloat(pos.qty),
          avgCost: parseFloat(pos.avg_entry_price),
          currentPrice: parseFloat(pos.current_price),
          marketValue: parseFloat(pos.market_value),
          unrealizedPL: parseFloat(pos.unrealized_pl),
          unrealizedPLPct: parseFloat(pos.unrealized_plpc) * 100,
          dayChange: parseFloat(pos.change_today)
        }))
      };
    } catch (error) {
      console.error('Error calculating metrics:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const alpacaAPI = new AlpacaAPI();

// Export types
export type { 
  AlpacaAccount, 
  AlpacaPosition, 
  AlpacaOrder, 
  CreateOrderRequest,
  AlpacaPortfolioHistory 
};