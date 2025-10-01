import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { X, Loader2, AlertCircle, Settings, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { alpacaAPI } from "@/lib/alpaca";
import { useAuth, isSessionValid, hasAlpacaCredentials } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { fetchPortfolioDataForPeriod, fetchStockDataForPeriod, type PortfolioData, type StockData, type PortfolioDataPoint } from "@/lib/portfolio-data";
import { useNavigate } from "react-router-dom";
import StockTickerAutocomplete from "@/components/StockTickerAutocomplete";

interface PerformanceChartProps {
  selectedStock?: string;
  selectedStockDescription?: string;
  onClearSelection?: () => void;
}

type TimePeriod = '1D' | '1W' | '1M' | '3M' | 'YTD' | '1Y' | '5Y' | 'All';


const periods: Array<{ value: TimePeriod; label: string }> = [
  { value: "1D", label: "1D" },
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "YTD", label: "YTD" },
  { value: "1Y", label: "1Y" },
  { value: "5Y", label: "5Y" },
  { value: "All", label: "All" },
];

// Helper function to format values for mobile display
const formatValue = (value: number | undefined, isMobile: boolean = false): string => {
  if (value === undefined || value === null) return 'Loading...';

  if (!isMobile) {
    // Desktop: show full formatted number
    return value.toLocaleString();
  }

  // Mobile: shorten large numbers
  const absValue = Math.abs(value);

  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (absValue >= 10000) {
    return `${Math.round(value / 1000)}K`;
  } else if (absValue >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  // For smaller values, just format with commas
  return value.toLocaleString();
};

const formatSignedCurrency = (value: number | undefined, isMobile: boolean = false): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return isMobile ? '$0' : '$0.00';
  }

  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const formatted = isMobile
    ? formatValue(absolute, true)
    : absolute.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `${sign}$${formatted}`;
};

const formatUnsignedCurrency = (value: number | undefined, isMobile: boolean = false): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return isMobile ? '$0' : '$0.00';
  }

  const absolute = Math.abs(value);
  const formatted = isMobile
    ? formatValue(absolute, true)
    : absolute.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return `$${formatted}`;
};

const formatLabelForPeriod = (date: Date, period: TimePeriod): string => {
  switch (period) {
    case '1D':
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    case '1W':
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    case '1M':
    case '3M':
    case 'YTD':
    case '1Y':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case '5Y':
    case 'All':
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    default:
      return date.toLocaleDateString();
  }
};

// Remove the old hardcoded function - we'll create a dynamic one in the component

const PerformanceChart = React.memo(({ selectedStock: propSelectedStock, selectedStockDescription, onClearSelection }: PerformanceChartProps) => {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("1D");
  const [loading, setLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(true); // Track positions loading separately
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [portfolioData, setPortfolioData] = useState<{ [period: string]: PortfolioDataPoint[] }>({});
  const [stockData, setStockData] = useState<{ [ticker: string]: { [period: string]: PortfolioDataPoint[] } }>({});
  const [positions, setPositions] = useState<any[]>([]);
  const { apiSettings, isAuthenticated } = useAuth();
  const hasConfiguredAlpaca = useMemo(() => hasAlpacaCredentials(apiSettings), [apiSettings]);
  const [hasAlpacaConfig, setHasAlpacaConfig] = useState(hasConfiguredAlpaca);
  const { toast } = useToast();

  // Internal state for selected stock (can be from prop or from search)
  const [internalSelectedStock, setInternalSelectedStock] = useState<string | undefined>(propSelectedStock);
  const [tickerInput, setTickerInput] = useState<string>("");
  const [stockDescription, setStockDescription] = useState<string>(selectedStockDescription || "");

  // Use prop or internal state
  const selectedStock = propSelectedStock || internalSelectedStock;

  // Track if we've already fetched for current apiSettings and selectedStock
  const fetchedRef = useRef<string>('');
  const lastFetchTimeRef = useRef<number>(0);
  const metricsLoaded = useRef(false);

  // Handle viewing a stock from the search bar
  const handleViewStock = useCallback(() => {
    if (tickerInput.trim()) {
      setInternalSelectedStock(tickerInput.trim().toUpperCase());
      setTickerInput("");
    }
  }, [tickerInput]);

  // Handle clearing the selection
  const handleClearSelection = useCallback(() => {
    if (onClearSelection) {
      onClearSelection();
    }
    setInternalSelectedStock(undefined);
    setTickerInput("");
    setStockDescription("");
  }, [onClearSelection]);

  const fetchData = useCallback(async (period: string) => {
    // Debounce fetches - don't fetch if we just fetched less than 2 seconds ago
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 2000) {
      return;
    }
    lastFetchTimeRef.current = now;

    setLoading(true);
    setError(null);

    if (!hasConfiguredAlpaca) {
      setLoading(false);
      setPositionsLoading(false);
      setError(null);
      setHasAlpacaConfig(false);
      return;
    }

    try {
      // Fetch data for the specific period
      if (selectedStock) {
        // Check if we already have this data
        if (!stockData[selectedStock]?.[period]) {
          const stockHistoryData = await fetchStockDataForPeriod(selectedStock, period);
          setStockData(prev => ({
            ...prev,
            [selectedStock]: {
              ...prev[selectedStock],
              [period]: stockHistoryData
            }
          }));
        }

        // Fetch stock description if not already fetched
        if (!stockDescription && hasConfiguredAlpaca) {
          try {
            const assetInfo = await alpacaAPI.getAsset(selectedStock).catch(err => {
              console.warn(`Could not fetch asset info for ${selectedStock}:`, err);
              return null;
            });

            if (assetInfo?.name) {
              setStockDescription(assetInfo.name);
            }
          } catch (err) {
            console.warn(`Could not fetch description for ${selectedStock}:`, err);
          }
        }
      } else {
        // Fetch portfolio data for this period if not cached
        if (!portfolioData[period]) {
          const portfolioHistoryData = await fetchPortfolioDataForPeriod(period);
          setPortfolioData(prev => ({
            ...prev,
            [period]: portfolioHistoryData
          }));
        }
      }

      // Try to fetch metrics only once (not period-specific)
      if (!metricsLoaded.current) {
        const metricsData = await alpacaAPI.calculateMetrics().catch(err => {
          console.warn("Failed to calculate metrics:", err);
          // Check if it's a configuration error
          if (err.message?.includes('API settings not found') ||
            err.message?.includes('not configured')) {
            console.log("Alpaca API not configured");
            setHasAlpacaConfig(false);
            setError(null); // Clear error for missing API config
          } else if (err.message?.includes('timeout') ||
            err.message?.includes('504') ||
            err.message?.includes('503') ||
            err.message?.includes('Unable to connect to Alpaca') ||
            err.message?.includes('Alpaca services appear to be down') ||
            err.message?.includes('Alpaca rate limit') ||
            err.message?.includes('https://app.alpaca.markets/dashboard/overview')) {
            console.log("Alpaca API appears to be down or rate limited:", err.message);

            // Extract the meaningful error message
            let errorMessage = err.message;
            if (err.message?.includes('https://app.alpaca.markets/dashboard/overview')) {
              // Already has the full message with link
              errorMessage = err.message;
            } else if (err.message?.includes('503') || err.message?.includes('504')) {
              errorMessage = "Unable to connect to Alpaca. Please check if Alpaca services are operational at https://app.alpaca.markets/dashboard/overview";
            }

            toast({
              title: "Alpaca Connection Error",
              description: errorMessage,
              variant: "destructive",
              duration: 10000, // Show for 10 seconds
            });
            setError(null);
          }
          return null;
        });

        // Positions are now included in metrics data
        const positionsData = metricsData?.positions || [];

        setMetrics(metricsData);
        setPositions(positionsData || []);
        setPositionsLoading(false); // Mark positions as loaded
        metricsLoaded.current = true;
      }

      // Fetch daily change for selected stock if needed
      if (selectedStock && period === '1D') {
        try {
          const batchData = await alpacaAPI.getBatchData([selectedStock], {
            includeQuotes: true,
            includeBars: true
          });

          const data = batchData[selectedStock];
          if (data?.quote && data?.previousBar) {
            const currentPrice = data.quote.ap || data.quote.bp || 0;
            const previousClose = data.previousBar.c;
            const dayChange = currentPrice - previousClose;
            // const dayChangePercent = previousClose > 0 ? (dayChange / previousClose) * 100 : 0;
            console.log(`Daily change for ${selectedStock}: $${dayChange.toFixed(2)}`);
          }
        } catch (err) {
          console.warn(`Could not fetch daily change for ${selectedStock}:`, err);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      if (err instanceof Error) {
        if (err.message.includes('CORS')) {
          setError('Cannot access Alpaca API directly from browser. Please ensure backend proxy is configured.');
        } else if (err.message.includes('Internal Server Error') || err.message.includes('500')) {
          setError('Database access error. Please check your configuration and try refreshing the page.');
        } else if (err.message.includes('API settings not found') ||
          err.message.includes('not configured') ||
          err.message.includes('Edge Function returned a non-2xx status code')) {
          // Don't show error for missing API config
          setHasAlpacaConfig(false);
          setError(null);
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to fetch data');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedStock, portfolioData, stockData, toast, hasConfiguredAlpaca]);

  // Fetch data when period or stock changes
  useEffect(() => {
    // Don't fetch if not authenticated or session is invalid
    if (!isAuthenticated || !isSessionValid()) {
      console.log('PerformanceChart: Skipping fetch - session invalid or not authenticated');
      return;
    }

    if (!hasConfiguredAlpaca) {
      console.log('PerformanceChart: Skipping fetch - Alpaca credentials missing');
      setHasAlpacaConfig(false);
      setLoading(false);
      setPositionsLoading(false);
      return;
    }

    const fetchKey = `${selectedStock || 'portfolio'}-${selectedPeriod}`;

    // Avoid duplicate fetches for the same configuration
    if (fetchedRef.current === fetchKey) {
      return;
    }

    fetchedRef.current = fetchKey;

    // Add a small delay on initial mount to ensure session is settled
    const timeoutId = setTimeout(() => {
      fetchData(selectedPeriod);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [selectedStock, selectedPeriod, fetchData, isAuthenticated, hasConfiguredAlpaca]);

  useEffect(() => {
    setHasAlpacaConfig(hasConfiguredAlpaca);
  }, [hasConfiguredAlpaca]);

  // Sync internal state with prop changes
  useEffect(() => {
    if (propSelectedStock !== internalSelectedStock) {
      setInternalSelectedStock(propSelectedStock);
      // Update description if provided, otherwise clear it
      setStockDescription(selectedStockDescription || "");
    }
  }, [propSelectedStock, selectedStockDescription]);

  // Get real stock metrics from positions
  const getStockMetrics = useCallback((symbol: string) => {
    const position = positions.find((p: any) => p.symbol === symbol);

    if (!position) {
      // Return default values if no position found
      return {
        avgCost: 0,
        dailyReturn: 0,
        dailyReturnPercent: 0,
        stockDailyChange: 0,
        stockDailyChangePercent: 0,
        totalReturn: 0,
        totalReturnPercent: 0,
        shares: 0,
        positionValue: 0,
        portfolioPercent: 0,
        currentPrice: 0,
        lastdayPrice: 0
      };
    }

    // Handle both raw Alpaca format and transformed metrics format
    const shares = position.shares !== undefined ? position.shares : (parseFloat(position.qty || '0') || 0);
    const avgCost = position.avgCost !== undefined ? position.avgCost : (parseFloat(position.avg_entry_price || '0') || 0);
    const currentPrice = position.currentPrice !== undefined ? position.currentPrice : (parseFloat(position.current_price || '0') || 0);
    const lastdayPrice = position.lastdayPrice !== undefined ? position.lastdayPrice : (parseFloat(position.lastday_price || '0') || 0);
    const marketValue = position.marketValue !== undefined ? position.marketValue : (parseFloat(position.market_value || '0') || 0);
    const unrealizedPL = position.unrealizedPL !== undefined ? position.unrealizedPL : (parseFloat(position.unrealized_pl || '0') || 0);
    const unrealizedPLPercent = position.unrealizedPLPct !== undefined ? position.unrealizedPLPct : ((parseFloat(position.unrealized_plpc || '0') || 0) * 100);

    // For intraday P/L, calculate from day change if not directly available
    const dayChange = position.dayChange !== undefined ? position.dayChange : 0;
    const todayPL = position.unrealized_intraday_pl !== undefined ? parseFloat(position.unrealized_intraday_pl || '0') : (dayChange * shares * currentPrice / 100);
    const todayPLPercent = position.unrealized_intraday_plpc !== undefined ? (parseFloat(position.unrealized_intraday_plpc || '0') * 100) : dayChange;

    // Calculate stock's daily price change (not position P&L)
    const stockDailyChange = currentPrice - lastdayPrice;
    const stockDailyChangePercent = lastdayPrice > 0 ? (stockDailyChange / lastdayPrice) * 100 : 0;

    // Calculate portfolio percentage
    const portfolioPercent = metrics?.accountValue
      ? (marketValue / metrics.accountValue) * 100
      : 0;

    return {
      avgCost,
      dailyReturn: todayPL,  // Position's P&L for the day
      dailyReturnPercent: todayPLPercent,
      stockDailyChange,  // Stock's price change
      stockDailyChangePercent,  // Stock's price change percent
      totalReturn: unrealizedPL,
      totalReturnPercent: unrealizedPLPercent,
      shares,
      positionValue: marketValue,
      portfolioPercent,
      currentPrice,
      lastdayPrice
    };
  }, [positions, metrics]);

  // Get appropriate data based on selection
  const getCurrentData = useCallback(() => {
    // Check for real stock data first
    if (selectedStock && stockData[selectedStock]?.[selectedPeriod]) {
      const periodData = stockData[selectedStock][selectedPeriod];
      if (periodData && Array.isArray(periodData) && periodData.length > 0) {
        return periodData;
      }
    }

    // Check for portfolio data
    if (!selectedStock && portfolioData[selectedPeriod]) {
      const data = portfolioData[selectedPeriod];
      return data;
    }

    // No data available
    return [];
  }, [selectedStock, stockData, selectedPeriod, portfolioData]);

  const baseData = useMemo(() => getCurrentData(), [getCurrentData]);

  const currentData = useMemo(() => {
    if (!baseData || baseData.length === 0) {
      return baseData;
    }

    if (selectedStock || !metrics?.accountValue) {
      return baseData;
    }

    const currentValue = Number(metrics.accountValue);
    if (!Number.isFinite(currentValue) || currentValue <= 0) {
      return baseData;
    }

    const referencePoint = baseData.find(point => Number(point?.value ?? 0) > 0) || baseData[0];
    if (!referencePoint) {
      return baseData;
    }

    const baselineCandidate = Number(referencePoint.value) - Number(referencePoint.pnl ?? 0);
    const fallbackBaseline = Number(referencePoint.value) || Number.EPSILON;
    const baseline = Number.isFinite(baselineCandidate) && baselineCandidate !== 0
      ? baselineCandidate
      : fallbackBaseline;

    const pnl = currentValue - baseline;
    const pnlPercent = baseline !== 0 ? (pnl / baseline) * 100 : 0;

    const now = new Date();
    const timeLabel = formatLabelForPeriod(now, selectedPeriod);
    const latestTimestamp = Math.floor(now.getTime() / 1000);

    const lastPoint = baseData[baseData.length - 1];
    const timeAlreadyUsed = lastPoint?.time === timeLabel || Number(lastPoint?.timestamp ?? 0) >= latestTimestamp;

    const replacePeriods = selectedPeriod === '3M'
      || selectedPeriod === '1Y'
      || selectedPeriod === '5Y'
      || selectedPeriod === 'All'
      || (selectedPeriod === 'YTD' && baseData.length > 31);

    const shouldReplaceLast = timeAlreadyUsed || replacePeriods;

    const dataCopy = [...baseData];

    const newPoint: PortfolioDataPoint = {
      time: timeLabel,
      value: currentValue,
      pnl,
      pnlPercent,
      timestamp: latestTimestamp
    };

    if (shouldReplaceLast && dataCopy.length > 0) {
      dataCopy[dataCopy.length - 1] = newPoint;
    } else {
      dataCopy.push(newPoint);
    }

    return dataCopy;
  }, [baseData, metrics, selectedStock, selectedPeriod]);

  // Custom tick formatter for X-axis based on period
  const formatXAxisTick = useCallback((value: string) => {
    // For 1M period, show abbreviated format
    if (selectedPeriod === '1M' || selectedPeriod === '3M' || selectedPeriod === 'YTD' || selectedPeriod === '1Y') {
      // If the value already looks like "Sep 12", keep it
      // Otherwise try to format it consistently
      return value;
    }
    return value;
  }, [selectedPeriod]);

  const latestValue = currentData[currentData.length - 1] || { value: 0, pnl: 0 };
  const firstValue = currentData[0] || { value: 0, pnl: 0 };
  const totalReturn = latestValue.pnl || (latestValue.value - firstValue.value);
  const totalReturnPercent = 'pnlPercent' in latestValue && latestValue.pnlPercent ?
    parseFloat(String(latestValue.pnlPercent)).toFixed(2) :
    (firstValue.value > 0 ? ((totalReturn / firstValue.value) * 100).toFixed(2) : '0.00');
  const isPositive = totalReturn >= 0;

  const cashFlowSummary = metrics?.cashFlows;
  const hasCashFlowSummary = Boolean(cashFlowSummary);
  const netContributions = hasCashFlowSummary ? Number(cashFlowSummary?.netContributions ?? 0) : null;
  const totalDeposits = hasCashFlowSummary ? Number(cashFlowSummary?.totalDeposits ?? 0) : null;
  const totalWithdrawals = hasCashFlowSummary ? Number(cashFlowSummary?.totalWithdrawals ?? 0) : null;
  const activityCount = hasCashFlowSummary ? Number(cashFlowSummary?.activityCount ?? 0) : null;
  const baselineValue = typeof metrics?.baselineValue === 'number' && metrics.baselineValue > 0
    ? metrics.baselineValue
    : null;
  const totalReturnSourceLabel = metrics?.totalReturnSource === 'cash_flows'
    ? 'cash flow activity'
    : metrics?.totalReturnSource === 'history_base'
      ? 'portfolio history baseline'
      : null;
  const portfolioMetricsGridClass = `grid grid-cols-2 ${hasCashFlowSummary ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3 sm:gap-4 pt-4 border-t`;

  // Debug log for 1D period
  if (selectedStock && selectedPeriod === '1D' && currentData.length > 0) {
    console.log(`[PerformanceChart] ${selectedStock} 1D data:`, {
      firstValue: firstValue.value,
      latestValue: latestValue.value,
      pnl: latestValue.pnl,
      pnlPercent: latestValue.pnlPercent,
      calculatedReturn: totalReturn,
      calculatedPercent: totalReturnPercent
    });
  }

  // Calculate dynamic Y-axis domain for better visibility of small changes
  const getYAxisDomain = useCallback(() => {
    if (currentData.length === 0 || !firstValue || firstValue.value === 0) {
      return ['auto', 'auto'];
    }

    const values = currentData.map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));

    if (values.length === 0) {
      return ['auto', 'auto'];
    }

    // Get the highest and lowest values in the current period
    const lowestValue = Math.min(...values);
    const highestValue = Math.max(...values);

    // Check for valid values
    if (isNaN(lowestValue) || isNaN(highestValue) || !isFinite(lowestValue) || !isFinite(highestValue)) {
      return ['auto', 'auto'];
    }

    // Calculate the range based on highest - lowest
    const range = highestValue - lowestValue;

    // If all values are the same (no movement), add minimal padding
    if (range === 0) {
      // For no movement, add small percentage of the value
      const padding = lowestValue * 0.001; // 0.1% padding
      return [lowestValue - padding, highestValue + padding];
    }

    // Calculate padding as a percentage of the range
    // Use 10% padding above and below the range for good visibility
    const padding = range * 0.1;

    // Set minimum padding to ensure visibility
    const minPadding = selectedStock
      ? Math.max(0.01, range * 0.05) // For stocks, at least $0.01 or 5% of range
      : Math.max(10, range * 0.05);   // For portfolio, at least $10 or 5% of range

    const actualPadding = Math.max(padding, minPadding);

    // Set the domain to lowest - padding and highest + padding
    const domainMin = lowestValue - actualPadding;
    const domainMax = highestValue + actualPadding;

    // Final validation
    if (isNaN(domainMin) || isNaN(domainMax) || !isFinite(domainMin) || !isFinite(domainMax)) {
      return ['auto', 'auto'];
    }

    // Debug logging removed to prevent console spam

    return [domainMin, domainMax];
  }, [currentData, selectedStock, selectedPeriod, firstValue]);

  const yAxisDomain = useMemo(() => getYAxisDomain(), [getYAxisDomain]);

  // For 1D view with selected stock, use the reference price (previous close)
  // which would make the first value show 0 change
  const startPrice = selectedPeriod === '1D' && selectedStock && firstValue?.pnl === 0
    ? firstValue.value
    : (firstValue?.value || 0);

  // Debug logging removed to prevent console spam

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="space-y-2">
          {!hasAlpacaConfig ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border p-4 bg-background">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm">Connect your Alpaca account to view live performance data</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/settings')}
                className="w-full sm:w-auto"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure API
              </Button>
            </div>
          ) : (
            <>
              {selectedStock ? (
                <Badge variant="default" className="flex items-center justify-between w-full pr-1.5 py-2 px-4">
                  <div className="flex-1" /> {/* Spacer */}
                  <span className="text-base">
                    <span className="font-bold">{selectedStock}</span>
                    {stockDescription && (
                      <span className="font-medium text-muted-foreground ml-2">
                        {stockDescription}
                      </span>
                    )}
                  </span>
                  <div className="flex-1 flex justify-end"> {/* Right-aligned container */}
                    <button
                      className="ml-4 rounded-full hover:bg-primary/30 p-0.5 transition-colors"
                      onClick={handleClearSelection}
                      type="button"
                      aria-label="Clear stock selection"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </Badge>
              ) : (
                <div className="flex items-center gap-2 w-full">
                  <StockTickerAutocomplete
                    value={tickerInput}
                    onChange={setTickerInput}
                    onEnterPress={handleViewStock}
                    onSelect={(suggestion) => {
                      setInternalSelectedStock(suggestion.symbol);
                      setStockDescription(suggestion.description || "");
                      setTickerInput("");
                    }}
                    placeholder="Search stock..."
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={handleViewStock}
                    disabled={!tickerInput.trim()}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Data may be incomplete or delayed.{' '}
                <a
                  href={selectedStock
                    ? `https://app.alpaca.markets/trade/${selectedStock}`
                    : 'https://app.alpaca.markets/dashboard/overview'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  View on Alpaca →
                </a>
              </div>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as TimePeriod)} className="space-y-4">
          <TabsList className="grid w-full grid-cols-8 max-w-5xl mx-auto">
            {periods.map((period) => (
              <TabsTrigger key={period.value} value={period.value} className="text-xs">
                {period.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {periods.map((period) => (
            <TabsContent key={period.value} value={period.value} className="space-y-4">
              <div className="h-48">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : currentData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={currentData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={50}
                        tickFormatter={formatXAxisTick}
                      />
                      <YAxis
                        domain={yAxisDomain}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          `$${value.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        }
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === 'value' ? `$${value.toLocaleString()}` : `$${value.toLocaleString()}`,
                          name === 'value' ? (selectedStock ? 'Stock Price' : 'Portfolio Value') : 'P&L'
                        ]}
                        labelFormatter={(label) => `Time: ${label}`}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                        }}
                      />
                      {/* Reference line for starting price */}
                      {startPrice > 0 && (
                        <ReferenceLine
                          y={startPrice}
                          stroke="#ffcc00"
                          strokeDasharray="5 5"
                          strokeOpacity={0.7}
                          label={{
                            value: `Start: $${startPrice.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`,
                            position: "left",
                            fill: "#ffcc00",
                            fontSize: 10
                          }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="url(#colorGradient)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: isPositive ? "#10b981" : "#ef4444" }}
                      />
                      <defs>
                        <linearGradient id="colorGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          {currentData.map((point, index) => {
                            const isAboveStart = point.value >= startPrice;
                            const position = (index / (currentData.length - 1)) * 100;
                            return (
                              <stop
                                key={index}
                                offset={`${position}%`}
                                stopColor={isAboveStart ? "#10b981" : "#ef4444"}
                              />
                            );
                          })}
                        </linearGradient>
                      </defs>
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    {error ? error : (hasAlpacaConfig ? "Loading chart data..." : "Configure Alpaca API to view performance data")}
                  </div>
                )}
              </div>

              {!selectedStock ? (
                // Portfolio metrics
                <div className="space-y-4">
                  <div className={portfolioMetricsGridClass}>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-xs text-muted-foreground">Portfolio Value</p>
                      <p className="text-sm sm:text-base font-semibold">
                        <span className="hidden sm:inline">${metrics?.accountValue?.toLocaleString() || 'Loading...'}</span>
                        <span className="sm:hidden">${formatValue(metrics?.accountValue, true)}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Period ({selectedPeriod})</p>
                      <p className={`text-sm sm:text-base font-semibold ${totalReturn >= 0 ? 'text-success' : 'text-danger'}`}>
                        {currentData.length > 0 ? (
                          <>
                            <span className="hidden sm:inline">
                              {totalReturn >= 0 ? '+' : '-'}${Math.abs(totalReturn).toLocaleString()}
                              ({totalReturn >= 0 ? '+' : '-'}{Math.abs(parseFloat(totalReturnPercent))}%)
                            </span>
                            <span className="sm:hidden">
                              {totalReturn >= 0 ? '+' : '-'}${formatValue(Math.abs(totalReturn), true)}
                              <span className="text-xs">
                                ({totalReturn >= 0 ? '+' : '-'}{Math.abs(parseFloat(totalReturnPercent))}%)
                              </span>
                            </span>
                          </>
                        ) : (
                          'Loading...'
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Return</p>
                      <p className={`text-sm sm:text-base font-semibold ${metrics?.totalReturn >= 0 ? 'text-success' : 'text-danger'}`}>
                        {metrics ? (
                          <>
                            <span className="hidden sm:inline">
                              {metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toLocaleString()}
                              ({metrics.totalReturnPct >= 0 ? '+' : ''}{metrics.totalReturnPct.toFixed(1)}%)
                            </span>
                            <span className="sm:hidden">
                              {metrics.totalReturn >= 0 ? '+' : ''}${formatValue(metrics.totalReturn, true)}
                              <span className="text-xs">
                                ({metrics.totalReturnPct >= 0 ? '+' : ''}{metrics.totalReturnPct.toFixed(1)}%)
                              </span>
                            </span>
                          </>
                        ) : (
                          'Loading...'
                        )}
                      </p>
                      {(totalReturnSourceLabel || baselineValue) && (
                        <p className="text-[11px] text-muted-foreground">
                          {totalReturnSourceLabel ? `Source: ${totalReturnSourceLabel}` : ''}
                          {baselineValue ? `${totalReturnSourceLabel ? ' · ' : ''}Baseline ${formatUnsignedCurrency(baselineValue)}` : ''}
                        </p>
                      )}
                    </div>
                    {hasCashFlowSummary && (
                      <div>
                        <p className="text-xs text-muted-foreground">Net Contributions</p>
                        <div className="space-y-1">
                          <p className="text-sm sm:text-base font-semibold text-muted-foreground">
                            <span className="hidden sm:inline">{formatSignedCurrency(netContributions ?? 0)}</span>
                            <span className="sm:hidden">{formatSignedCurrency(netContributions ?? 0, true)}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            <span className="hidden sm:inline">
                              Deposits {formatUnsignedCurrency(totalDeposits ?? 0)} · Withdrawals {formatUnsignedCurrency(totalWithdrawals ?? 0)}
                            </span>
                            <span className="sm:hidden">
                              Deposits {formatUnsignedCurrency(totalDeposits ?? 0, true)} · Withdrawals {formatUnsignedCurrency(totalWithdrawals ?? 0, true)}
                            </span>
                          </p>
                          {activityCount !== null && activityCount > 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              {`Based on ${activityCount} activity${activityCount === 1 ? '' : ' entries'}`}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Cash</p>
                      <p className="text-sm sm:text-base font-semibold">
                        <span className="hidden sm:inline">${metrics?.cashAvailable?.toLocaleString() || 'Loading...'}</span>
                        <span className="sm:hidden">${formatValue(metrics?.cashAvailable, true)}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Buying Power</p>
                      <p className="text-sm sm:text-base font-semibold">
                        <span className="hidden sm:inline">${metrics?.buyingPower?.toLocaleString() || 'Loading...'}</span>
                        <span className="sm:hidden">${formatValue(metrics?.buyingPower, true)}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sharpe</p>
                      <p className={`text-sm sm:text-base font-semibold ${metrics?.sharpeRatio > 1 ? 'text-success' : ''}`}>
                        {metrics?.sharpeRatio?.toFixed(2) || 'Loading...'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Max Draw Down</p>
                      <p className="text-sm sm:text-base font-semibold text-danger">
                        -{metrics?.maxDrawdown?.toFixed(1) || 'Loading...'}%
                      </p>
                    </div>
                  </div>
                  {error && hasAlpacaConfig && (
                    <div className="text-sm text-red-500 text-center pt-2">
                      {error}
                    </div>
                  )}
                </div>
              ) : (
                // Individual stock metrics
                <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Current Price</p>
                    <p className="text-base sm:text-lg font-semibold">
                      {getStockMetrics(selectedStock).currentPrice ? (
                        `$${getStockMetrics(selectedStock).currentPrice.toFixed(2)}`
                      ) : (
                        <>
                          <span className="hidden sm:inline">${latestValue.value.toLocaleString()}</span>
                          <span className="sm:hidden">${formatValue(latestValue.value, true)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Period Change ({selectedPeriod})</p>
                    <p className={`text-base sm:text-lg font-semibold ${totalReturn >= 0 ? 'text-success' : 'text-danger'
                      }`}>
                      {currentData.length > 0 ? (
                        <>
                          {totalReturn >= 0 ? '+' : ''}
                          ${Math.abs(totalReturn).toFixed(2)}
                          <span className="text-xs sm:text-sm">
                            ({totalReturn >= 0 ? '+' : ''}{totalReturnPercent}%)
                          </span>
                          {/* Debug info */}
                          {selectedPeriod === '1D' && (
                            <span className="text-xs block text-muted-foreground hidden">
                              (Last: ${latestValue.value?.toFixed(2)}, Ref: ${(latestValue.value - totalReturn).toFixed(2)})
                            </span>
                          )}
                        </>
                      ) : (
                        'Loading...'
                      )}
                    </p>
                  </div>
                </div>
              )}

              {selectedStock && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Today P&L</p>
                      <p className={`text-xs sm:text-sm font-medium ${positionsLoading ? '' : getStockMetrics(selectedStock).dailyReturn >= 0 ? 'text-success' : 'text-danger'
                        }`}>
                        {positionsLoading ? 'Loading...' : (
                          <>
                            {getStockMetrics(selectedStock).dailyReturn >= 0 ? '+' : ''}
                            ${getStockMetrics(selectedStock).dailyReturn.toFixed(2)}
                            <span className="text-xs">
                              ({getStockMetrics(selectedStock).dailyReturnPercent >= 0 ? '+' : ''}
                              {getStockMetrics(selectedStock).dailyReturnPercent.toFixed(1)}%)
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total P&L</p>
                      <p className={`text-xs sm:text-sm font-medium ${positionsLoading ? '' : getStockMetrics(selectedStock).totalReturn >= 0 ? 'text-success' : 'text-danger'
                        }`}>
                        {positionsLoading ? 'Loading...' : (
                          <>
                            {getStockMetrics(selectedStock).totalReturn >= 0 ? '+' : ''}
                            ${getStockMetrics(selectedStock).totalReturn.toFixed(2)}
                            <span className="text-xs">
                              ({getStockMetrics(selectedStock).totalReturnPercent >= 0 ? '+' : ''}
                              {getStockMetrics(selectedStock).totalReturnPercent.toFixed(1)}%)
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-xs text-muted-foreground">Shares</p>
                      <p className="text-xs sm:text-sm font-medium">
                        {positionsLoading ? 'Loading...' : getStockMetrics(selectedStock).shares}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Cost</p>
                      <p className="text-xs sm:text-sm font-medium">
                        {positionsLoading ? 'Loading...' : `$${getStockMetrics(selectedStock).avgCost.toFixed(2)}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Position</p>
                      <p className="text-xs sm:text-sm font-medium">
                        {positionsLoading ? 'Loading...' : (
                          <>
                            <span className="hidden sm:inline">${getStockMetrics(selectedStock).positionValue.toLocaleString()}</span>
                            <span className="sm:hidden">${formatValue(getStockMetrics(selectedStock).positionValue, true)}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-xs text-muted-foreground">% of Portfolio</p>
                      <p className="text-xs sm:text-sm font-medium">
                        {positionsLoading ? 'Loading...' : `${getStockMetrics(selectedStock).portfolioPercent.toFixed(1)}%`}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
});

export default PerformanceChart;
