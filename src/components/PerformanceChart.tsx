import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { X, Loader2, AlertCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { alpacaAPI } from "@/lib/alpaca";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { fetchPortfolioData, fetchStockData, type PortfolioData, type StockData } from "@/lib/portfolio-data";
import { useNavigate } from "react-router-dom";

interface PerformanceChartProps {
  selectedStock?: string;
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


// Remove the old hardcoded function - we'll create a dynamic one in the component

const PerformanceChart = ({ selectedStock, onClearSelection }: PerformanceChartProps) => {
  const navigate = useNavigate();
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("1D");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [stockData, setStockData] = useState<StockData>({});
  const [positions, setPositions] = useState<any[]>([]);
  const [hasAlpacaConfig, setHasAlpacaConfig] = useState(true); // Assume configured initially
  const { apiSettings } = useAuth();
  const { toast } = useToast();

  // Fetch data on component mount and when selectedStock changes
  useEffect(() => {
    fetchData();
  }, [apiSettings, selectedStock]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // First try to fetch portfolio data (doesn't require Alpaca API)
      const portfolioHistoryData = await fetchPortfolioData();
      setPortfolioData(portfolioHistoryData);

      // Try to fetch metrics (which now uses batch internally)
      // The edge functions will handle checking if Alpaca is configured
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

      // If a stock is selected, fetch its data (uses Alpaca API)
      if (selectedStock) {
        try {
          console.log(`Fetching stock data for ${selectedStock}...`);
          const stockHistoryData = await fetchStockData(selectedStock);
          console.log(`Received stock data for ${selectedStock}:`, {
            hasData: !!stockHistoryData,
            periods: Object.keys(stockHistoryData || {}),
            '1D_length': stockHistoryData?.['1D']?.length || 0,
            '1W_length': stockHistoryData?.['1W']?.length || 0,
            '1M_length': stockHistoryData?.['1M']?.length || 0
          });
          setStockData(prev => {
            const newState = { ...prev, [selectedStock]: stockHistoryData };
            console.log(`Updated stockData state for ${selectedStock}`);
            return newState;
          });

          // Fetch daily change using batch method
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
              const dayChangePercent = previousClose > 0 ? (dayChange / previousClose) * 100 : 0;

              setStockDailyChanges(prev => ({
                ...prev,
                [selectedStock]: { change: dayChange, changePercent: dayChangePercent }
              }));

              console.log(`Daily change for ${selectedStock}: $${dayChange.toFixed(2)} (${dayChangePercent.toFixed(2)}%)`);
            }
          } catch (err) {
            console.warn(`Could not fetch daily change for ${selectedStock}:`, err);
          }
        } catch (err) {
          console.error(`Error fetching data for ${selectedStock}:`, err);
          // Check if it's an API configuration error for stock data
          if (err instanceof Error &&
            (err.message.includes('API settings not found') ||
              err.message.includes('not configured') ||
              err.message.includes('Edge Function returned a non-2xx status code'))) {
            setHasAlpacaConfig(false);
            setError(null); // Don't show error for missing API config
          } else {
            setError(`Failed to fetch data for ${selectedStock}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
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
  };

  // Get real stock metrics from positions
  const getStockMetrics = (symbol: string) => {
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

    const shares = parseFloat(position.qty);
    const avgCost = parseFloat(position.avg_entry_price);
    const currentPrice = parseFloat(position.current_price || 'Loading...');
    const lastdayPrice = parseFloat(position.lastday_price || 'Loading...');
    const marketValue = parseFloat(position.market_value);
    const unrealizedPL = parseFloat(position.unrealized_pl);
    const unrealizedPLPercent = parseFloat(position.unrealized_plpc) * 100;
    const todayPL = parseFloat(position.unrealized_intraday_pl || 'Loading...');
    const todayPLPercent = parseFloat(position.unrealized_intraday_plpc || 'Loading...') * 100;

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
  };

  // Get appropriate data based on selection
  const getCurrentData = () => {
    // Debug logging
    console.log('getCurrentData called:', {
      selectedStock,
      selectedPeriod,
      hasPortfolioData: !!portfolioData,
      stockDataKeys: Object.keys(stockData),
      stockDataForSelected: selectedStock ? stockData[selectedStock] : null,
      stockDataPeriods: selectedStock && stockData[selectedStock] ? Object.keys(stockData[selectedStock]) : [],
    });

    // Check for real stock data first (even if no portfolio data)
    if (selectedStock && stockData[selectedStock]) {
      const periodData = stockData[selectedStock][selectedPeriod];
      console.log(`Stock data for ${selectedStock} ${selectedPeriod}:`, {
        exists: !!periodData,
        length: periodData?.length || 0,
        sample: periodData?.[0]
      });

      if (periodData && Array.isArray(periodData) && periodData.length > 0) {
        console.log(`Returning ${periodData.length} real data points for ${selectedStock} ${selectedPeriod}`);
        return periodData;
      } else {
        console.warn(`No valid data for ${selectedStock} ${selectedPeriod} - periodData:`, periodData);
      }
    }

    // Check for portfolio data
    if (!selectedStock && portfolioData && portfolioData[selectedPeriod]) {
      const data = portfolioData[selectedPeriod];
      console.log(`Returning ${data.length} portfolio data points for ${selectedPeriod}`);
      return data;
    }

    // No data available
    console.log('No data available for display', {
      selectedStock,
      selectedPeriod,
      hasStockData: !!stockData[selectedStock],
      hasPortfolioData: !!portfolioData?.[selectedPeriod]
    });
    return [];
  };

  const currentData = getCurrentData();
  const latestValue = currentData[currentData.length - 1] || { value: 0, pnl: 0 };
  const firstValue = currentData[0] || { value: 0, pnl: 0 };
  const totalReturn = latestValue.pnl || (latestValue.value - firstValue.value);
  const totalReturnPercent = latestValue.pnlPercent ?
    parseFloat(latestValue.pnlPercent).toFixed(2) :
    (firstValue.value > 0 ? ((totalReturn / firstValue.value) * 100).toFixed(2) : '0.00');
  const isPositive = totalReturn >= 0;

  // Calculate dynamic Y-axis domain for better visibility of small changes
  const getYAxisDomain = () => {
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

    console.log('Y-axis domain calculation:', {
      lowestValue,
      highestValue,
      range,
      padding: actualPadding,
      domainMin,
      domainMax,
      viewportRange: domainMax - domainMin,
      isStock: !!selectedStock,
      period: selectedPeriod
    });

    return [domainMin, domainMax];
  };

  const yAxisDomain = getYAxisDomain();
  // For 1D view with selected stock, use the reference price (previous close)
  // which would make the first value show 0 change
  const startPrice = selectedPeriod === '1D' && selectedStock && firstValue?.pnl === 0
    ? firstValue.value
    : (firstValue?.value || 0);

  // Debug logging for chart data
  console.log('Chart rendering debug:', {
    currentDataLength: currentData.length,
    firstValue,
    latestValue,
    yAxisDomain,
    startPrice,
    isPositive
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Performance</CardTitle>
            {selectedStock && (
              <div className="flex items-center gap-2">
                <Badge variant="default">{selectedStock}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onClearSelection}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!hasAlpacaConfig && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>Connect your Alpaca account to view live performance data</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/settings?tab=trading')}
                className="ml-4"
              >
                <Settings className="h-4 w-4 mr-2" />
                Configure API
              </Button>
            </AlertDescription>
          </Alert>
        )}
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
                {loading && !portfolioData ? (
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
                      />
                      <YAxis
                        domain={yAxisDomain}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          selectedStock
                            ? `$${value.toFixed(2)}`
                            : `$${(value / 1000).toFixed(0)}k`
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
                            value: selectedStock ? `Start: $${startPrice.toFixed(2)}` : `Start: $${(startPrice / 1000).toFixed(0)}k`,
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
                    {error ? error : (hasAlpacaConfig ? "No data available for this period" : "Configure Alpaca API to view performance data")}
                  </div>
                )}
              </div>

              {!selectedStock ? (
                // Portfolio metrics
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Portfolio Value</p>
                      <p className="text-base font-semibold">
                        ${metrics?.accountValue?.toLocaleString() || 'Loading...'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Period Return ({selectedPeriod})</p>
                      <p className={`text-base font-semibold ${totalReturn >= 0 ? 'text-success' : 'text-danger'}`}>
                        {currentData.length > 0 ? (
                          <>
                            {totalReturn >= 0 ? '+' : ''}${Math.abs(totalReturn).toLocaleString()}
                            ({totalReturn >= 0 ? '+' : ''}{totalReturnPercent}%)
                          </>
                        ) : (
                          'Loading...'
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Return</p>
                      <p className={`text-base font-semibold ${metrics?.totalReturn >= 0 ? 'text-success' : 'text-danger'}`}>
                        {metrics ? (
                          <>
                            {metrics.totalReturn >= 0 ? '+' : ''}${metrics.totalReturn.toLocaleString()}
                            ({metrics.totalReturnPct >= 0 ? '+' : ''}{metrics.totalReturnPct.toFixed(2)}%)
                          </>
                        ) : (
                          'Loading...'
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Cash Available</p>
                      <p className="text-base font-semibold">
                        ${metrics?.cashAvailable?.toLocaleString() || 'Loading...'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Buying Power</p>
                      <p className="text-base font-semibold">
                        ${metrics?.buyingPower?.toLocaleString() || 'Loading...'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Sharpe Ratio</p>
                      <p className={`text-base font-semibold ${metrics?.sharpeRatio > 1 ? 'text-success' : ''}`}>
                        {metrics?.sharpeRatio?.toFixed(2) || 'Loading...'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Max Drawdown</p>
                      <p className="text-base font-semibold text-danger">
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
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Current Price</p>
                    <p className="text-lg font-semibold">
                      ${getStockMetrics(selectedStock).currentPrice ?
                        getStockMetrics(selectedStock).currentPrice.toFixed(2) :
                        latestValue.value.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Period Change ({selectedPeriod})</p>
                    <p className={`text-lg font-semibold ${totalReturn >= 0 ? 'text-success' : 'text-danger'
                      }`}>
                      {currentData.length > 0 ? (
                        <>
                          {totalReturn >= 0 ? '+' : ''}
                          ${Math.abs(totalReturn).toFixed(2)}
                          ({totalReturn >= 0 ? '+' : ''}
                          {totalReturnPercent}%)
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
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Position P&L Today</p>
                      <p className={`text-sm font-medium ${getStockMetrics(selectedStock).dailyReturn >= 0 ? 'text-success' : 'text-danger'
                        }`}>
                        {getStockMetrics(selectedStock).dailyReturn >= 0 ? '+' : ''}
                        ${getStockMetrics(selectedStock).dailyReturn.toFixed(2)}
                        ({getStockMetrics(selectedStock).dailyReturnPercent >= 0 ? '+' : ''}
                        {getStockMetrics(selectedStock).dailyReturnPercent.toFixed(2)}%)
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Position P&L</p>
                      <p className={`text-sm font-medium ${getStockMetrics(selectedStock).totalReturn >= 0 ? 'text-success' : 'text-danger'
                        }`}>
                        {getStockMetrics(selectedStock).totalReturn >= 0 ? '+' : ''}
                        ${getStockMetrics(selectedStock).totalReturn.toFixed(2)}
                        ({getStockMetrics(selectedStock).totalReturnPercent >= 0 ? '+' : ''}
                        {getStockMetrics(selectedStock).totalReturnPercent.toFixed(2)}%)
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Shares Owned</p>
                      <p className="text-sm font-medium">{getStockMetrics(selectedStock).shares}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Avg Cost</p>
                      <p className="text-sm font-medium">${getStockMetrics(selectedStock).avgCost.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Position</p>
                      <p className="text-sm font-medium">${getStockMetrics(selectedStock).positionValue.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">% of Portfolio</p>
                      <p className="text-sm font-medium">{getStockMetrics(selectedStock).portfolioPercent.toFixed(1)}%</p>
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
};

export default PerformanceChart;