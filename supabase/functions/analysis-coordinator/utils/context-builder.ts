import { ApiSettings, AnalysisContext, PortfolioContextData, PositionContext, TargetAllocations, UserPreferences } from '../types/index.ts';
import { fetchAlpacaPortfolio } from '../../_shared/portfolio/alpacaClient.ts';

function createEmptyPortfolioData(): PortfolioContextData {
  return {
    account: {
      buying_power: 0,
      original_buying_power: 0,
      cash: 0,
      original_cash: 0,
      portfolio_value: 0,
      long_market_value: 0,
      equity: 0,
      day_trade_count: 0,
      pattern_day_trader: false,
      reserved_capital: 0
    },
    positions: [],
    openOrders: [],
    totalValue: 0,
    cash: 0,
    pendingOrders: []
  };
}

function ensurePortfolioAugment(portfolio: PortfolioContextData): PortfolioContextData {
  const augmented = { ...portfolio } as PortfolioContextData;
  if (!augmented.account) {
    augmented.account = { ...createEmptyPortfolioData().account };
  }
  if (!augmented.positions) {
    augmented.positions = [];
  }
  if (!augmented.openOrders) {
    augmented.openOrders = [];
  }
  if (typeof augmented.totalValue !== 'number') {
    augmented.totalValue = augmented.account?.portfolio_value || 0;
  }
  if (typeof augmented.cash !== 'number') {
    augmented.cash = augmented.account?.cash || 0;
  }
  if (!augmented.pendingOrders) {
    augmented.pendingOrders = augmented.openOrders;
  }
  return augmented;
}

export async function buildAnalysisContext(
  supabase: any,
  userId: string,
  ticker: string,
  apiSettings: ApiSettings,
  baseContext?: AnalysisContext
): Promise<AnalysisContext> {
  const context: AnalysisContext = { ...(baseContext || {}) };
  context.type = context.type || 'individual';

  let portfolioData: PortfolioContextData | undefined = context.portfolioData;
  const alpacaApiKey = apiSettings?.alpaca_paper_trading
    ? apiSettings?.alpaca_paper_api_key
    : apiSettings?.alpaca_live_api_key;
  const alpacaSecretKey = apiSettings?.alpaca_paper_trading
    ? apiSettings?.alpaca_paper_secret_key
    : apiSettings?.alpaca_live_secret_key;

  if (alpacaApiKey && alpacaSecretKey) {
    const needsFetch = !portfolioData || !portfolioData.account || typeof portfolioData.account.cash !== 'number';
    if (needsFetch) {
      try {
        const alpacaData = await fetchAlpacaPortfolio(apiSettings);
        portfolioData = {
          ...alpacaData,
          totalValue: alpacaData.account.portfolio_value,
          cash: alpacaData.account.cash,
          pendingOrders: alpacaData.openOrders
        };
      } catch (error) {
        console.error('Failed to refresh Alpaca portfolio:', error);
        portfolioData = createEmptyPortfolioData();
      }
    }
  }

  if (!portfolioData) {
    portfolioData = createEmptyPortfolioData();
  }

  portfolioData = ensurePortfolioAugment(portfolioData);

  let preferences: UserPreferences = {
    profit_target: 25,
    stop_loss: 10,
    near_limit_threshold: 20,
    near_position_threshold: 20
  };
  let targetAllocations: TargetAllocations = {
    cash: 20,
    stocks: 80
  };

  try {
    const { data: userSettings } = await supabase
      .from('api_settings')
      .select('profit_target, stop_loss, target_cash_allocation, target_stock_allocation, near_limit_threshold, near_position_threshold')
      .eq('user_id', userId)
      .single();

    if (userSettings) {
      preferences = {
        profit_target: userSettings.profit_target ?? preferences.profit_target,
        stop_loss: userSettings.stop_loss ?? preferences.stop_loss,
        near_limit_threshold: userSettings.near_limit_threshold ?? preferences.near_limit_threshold,
        near_position_threshold: userSettings.near_position_threshold ?? preferences.near_position_threshold
      };
      targetAllocations = {
        cash: userSettings.target_cash_allocation ?? targetAllocations.cash,
        stocks: userSettings.target_stock_allocation ?? targetAllocations.stocks
      };
    }
  } catch (settingsError) {
    console.error('Failed to load user allocation settings:', settingsError);
  }

  let position: PositionContext = { stock_in_holdings: false };
  const positions = portfolioData.positions || [];
  const tickerPosition = positions.find((p: any) => p.symbol?.toUpperCase() === ticker?.toUpperCase());
  if (tickerPosition) {
    position = {
      stock_in_holdings: true,
      entry_price: tickerPosition.avg_entry_price,
      current_price: tickerPosition.current_price,
      shares: tickerPosition.qty,
      market_value: tickerPosition.market_value,
      unrealized_pl: tickerPosition.unrealized_pl,
      unrealized_pl_percent: typeof tickerPosition.unrealized_plpc === 'number' ? tickerPosition.unrealized_plpc * 100 : undefined,
      days_held: undefined
    };
  }

  context.portfolioData = portfolioData;
  context.preferences = preferences;
  context.targetAllocations = targetAllocations;
  context.position = position;

  return context;
}

export async function persistAnalysisContext(
  supabase: any,
  analysisId: string,
  fullAnalysis: any,
  context: AnalysisContext
): Promise<void> {
  let baseAnalysis = fullAnalysis;

  if (!baseAnalysis) {
    try {
      const { data } = await supabase
        .from('analysis_history')
        .select('full_analysis')
        .eq('id', analysisId)
        .single();
      baseAnalysis = data?.full_analysis || {};
    } catch (loadError) {
      console.error('Failed to load full_analysis while persisting context:', loadError);
      baseAnalysis = {};
    }
  }

  const updatedFullAnalysis = {
    ...(baseAnalysis || {}),
    analysisContext: context
  };

  await supabase
    .from('analysis_history')
    .update({ full_analysis: updatedFullAnalysis })
    .eq('id', analysisId);
}
