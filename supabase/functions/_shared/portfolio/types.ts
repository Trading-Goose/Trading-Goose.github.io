/**
 * Shared portfolio type definitions for portfolio management functions
 */

export interface AlpacaPortfolioData {
  account: {
    buying_power: number;
    original_buying_power: number;
    cash: number;
    original_cash: number;
    portfolio_value: number;
    long_market_value: number;
    equity: number;
    day_trade_count: number;
    pattern_day_trader: boolean;
    reserved_capital: number;
  };
  positions: Array<{
    symbol: string;
    qty: number;
    avg_entry_price: number;
    current_price: number;
    market_value: number;
    unrealized_pl: number;
    unrealized_plpc: number;
  }>;
  openOrders: Array<{
    symbol: string;
    side: string;
    qty: number;
    notional: number;
    type: string;
    status: string;
    submitted_at: string;
    limit_price: number | null;
    reservedCapital: number;
  }>;
}

export interface AlpacaApiSettings {
  alpaca_paper_api_key?: string;
  alpaca_paper_secret_key?: string;
  alpaca_live_api_key?: string;
  alpaca_live_secret_key?: string;
  alpaca_paper_trading?: boolean;
}

export interface PortfolioApiSettings extends AlpacaApiSettings {
  ai_provider?: string;
  ai_api_key?: string;
  ai_model?: string;
  user_risk_level?: 'conservative' | 'moderate' | 'aggressive';
  default_position_size_dollars?: number;
  rebalance_max_position_size?: number;
  rebalance_min_position_size?: number;
  portfolio_manager_ai?: string;
  portfolio_manager_model?: string;
  portfolio_manager_max_tokens?: number;
  openai_api_key?: string;
  anthropic_api_key?: string;
  google_api_key?: string;
  deepseek_api_key?: string;
  openrouter_api_key?: string;
}