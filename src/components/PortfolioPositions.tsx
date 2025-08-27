import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, RefreshCw, Loader2, Eye, Activity, Clock, AlertCircle, AlertTriangle } from "lucide-react";
import { alpacaAPI } from "@/lib/alpaca";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useAlpacaConnectionStore } from "@/hooks/useAlpacaConnection";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  type RebalanceStatus,
  REBALANCE_STATUS,
  isRebalanceActive,
  ANALYSIS_STATUS,
  convertLegacyAnalysisStatus,
  isAnalysisActive
} from "@/lib/statusTypes";
import RebalanceModal from "./RebalanceModal";
import RebalanceDetailModal from "./RebalanceDetailModal";
import ScheduleListModal from "./ScheduleListModal";

interface Position {
  symbol: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
  unrealizedPLPct: number;
  dayChange: number;
}

interface PortfolioPositionsProps {
  onSelectStock?: (symbol: string) => void;
  selectedStock?: string;
}

export default function PortfolioPositions({ onSelectStock, selectedStock }: PortfolioPositionsProps) {
  const navigate = useNavigate();
  const { apiSettings, isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const { isConnected: isAlpacaConnected } = useAlpacaConnectionStore();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [showRebalanceDetailModal, setShowRebalanceDetailModal] = useState(false);
  const [showScheduleListModal, setShowScheduleListModal] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [runningRebalance, setRunningRebalance] = useState<string | null>(null); // Store rebalance_request_id
  const [runningAnalysesCount, setRunningAnalysesCount] = useState(0);
  const [showAnalysisAlert, setShowAnalysisAlert] = useState(false);

  // Use ref to track previous running rebalance
  const previousRunningRef = useRef<string | null>(null);

  const handleRebalanceClick = () => {
    if (!isAuthenticated) {
      // This shouldn't happen since the button is in an authenticated area
      return;
    }
    
    // Check if there are running analyses
    if (runningAnalysesCount > 0) {
      setShowAnalysisAlert(true);
      return;
    }
    
    setShowRebalanceModal(true);
  };

  const fetchPositions = async () => {
    setLoading(true);
    setError(null);

    try {
      // Use batch endpoint to get account and positions together
      const accountBatchData = await alpacaAPI.getBatchAccountData().catch(err => {
        console.warn("Failed to get account/positions:", err);
        // Check if it's a configuration error
        if (err.message?.includes('API settings not found') || 
            err.message?.includes('not configured')) {
          console.log("Alpaca API not configured, showing empty positions");
          setError(null);
          return { positions: [] };
        }
        // Check for timeout or connection issues - likely Alpaca is down
        if (err.message?.includes('timeout') ||
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
          return { positions: [] };
        }
        // For other errors, still return empty data instead of throwing
        console.error("Error fetching account data, continuing with empty positions:", err);
        return { positions: [] };
      });

      const alpacaPositions = accountBatchData.positions || [];

      // If we got an empty array due to configuration, just return
      if (!alpacaPositions || alpacaPositions.length === 0) {
        setPositions([]);
        setError(null);
        return;
      }

      // Get batch data for all positions to get today's open prices
      const symbols = alpacaPositions.map((pos: any) => pos.symbol);
      let batchData: any = {};

      if (symbols.length > 0) {
        try {
          batchData = await alpacaAPI.getBatchData(symbols, {
            includeQuotes: true,
            includeBars: true
          });
        } catch (err) {
          console.warn('Could not fetch batch data for daily changes:', err);
        }
      }

      const formattedPositions: Position[] = alpacaPositions.map((pos: any) => {
        const currentPrice = parseFloat(pos.current_price);
        let dayChangePercent = parseFloat(pos.change_today); // Default to API value

        // Calculate today's change from open if we have the data
        const stockData = batchData[pos.symbol];
        if (stockData?.currentBar) {
          const todayOpen = stockData.currentBar.o;
          const priceChange = currentPrice - todayOpen;
          dayChangePercent = todayOpen > 0 ? (priceChange / todayOpen) * 100 : 0;
          console.log(`${pos.symbol}: Open: ${todayOpen}, Current: ${currentPrice}, Change: ${dayChangePercent.toFixed(2)}%`);
        } else if (stockData?.previousBar) {
          // Fallback to previous close if no current bar (market closed)
          const previousClose = stockData.previousBar.c;
          const priceChange = currentPrice - previousClose;
          dayChangePercent = previousClose > 0 ? (priceChange / previousClose) * 100 : 0;
        }

        return {
          symbol: pos.symbol,
          shares: parseFloat(pos.qty),
          avgCost: parseFloat(pos.avg_entry_price),
          currentPrice: currentPrice,
          marketValue: parseFloat(pos.market_value),
          unrealizedPL: parseFloat(pos.unrealized_pl),
          unrealizedPLPct: parseFloat(pos.unrealized_plpc) * 100,
          dayChange: dayChangePercent
        };
      });

      setPositions(formattedPositions);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching positions:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch positions';

      if (errorMessage.includes('Internal Server Error') || errorMessage.includes('500')) {
        setError('Database access error. Please check your configuration and try refreshing the page.');
      } else if (errorMessage.includes('Edge Function returned') || errorMessage.includes('API settings not found')) {
        //setError('API configuration not found. Please configure your Alpaca API in Settings.');
      } else {
        setError(errorMessage);
      }

      setPositions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPositions();

    // Refresh positions every 30 seconds
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, [apiSettings]);

  // Check for running analyses
  useEffect(() => {
    const checkRunningAnalyses = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('analysis_history')
          .select('id, analysis_status, is_canceled')
          .eq('user_id', user.id);

        if (!error && data) {
          const runningCount = data.filter(item => {
            // Convert legacy numeric status if needed
            const currentStatus = typeof item.analysis_status === 'number' 
              ? convertLegacyAnalysisStatus(item.analysis_status)
              : item.analysis_status;
            
            // Skip cancelled analyses
            if (item.is_canceled || currentStatus === ANALYSIS_STATUS.CANCELLED) {
              return false;
            }
            
            // Use centralized logic to check if analysis is active
            return isAnalysisActive(currentStatus);
          }).length;
          
          setRunningAnalysesCount(runningCount);
        }
      } catch (error) {
        console.error('Error checking running analyses:', error);
      }
    };

    checkRunningAnalyses();
    const interval = setInterval(checkRunningAnalyses, 10000);
    return () => clearInterval(interval);
  }, [user]);

  // Check for running rebalance requests
  useEffect(() => {
    const checkRunningRebalance = async () => {
      if (!user) return;

      try {
        // Check for active rebalance requests using centralized status logic
        const { data: allRebalances, error } = await supabase
          .from('rebalance_requests')
          .select('id, status, created_at, completed_at, rebalance_plan')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10); // Get recent rebalances to check their status

        if (error) {
          console.warn('Error checking rebalance requests:', error);
          return;
        }

        // Filter for active rebalances using correct logic
        const activeRebalances = allRebalances?.filter(rebalance => {
          const status = rebalance.status as RebalanceStatus;
          // A rebalance is active if it's running or pending
          const isActive = status === REBALANCE_STATUS.RUNNING || 
                          status === REBALANCE_STATUS.PENDING;
          
          console.log(`Rebalance ${rebalance.id}: status="${rebalance.status}" → active=${isActive}`);
          return isActive;
        }) || [];

        console.log(`Found ${allRebalances?.length || 0} total rebalances, ${activeRebalances.length} active`);

        const data = activeRebalances.slice(0, 1); // Take the most recent active one

        if (data && data.length > 0) {
          const activeRebalance = data[0];
          setRunningRebalance(activeRebalance.id);

          // Check if rebalance just started (wasn't running before)
          if (!previousRunningRef.current && activeRebalance.id) {
            console.log('New rebalance detected:', activeRebalance.id);
          }

          previousRunningRef.current = activeRebalance.id;
        } else {
          // Only show completion toast if a rebalance actually finished with portfolio manager
          if (previousRunningRef.current) {
            // Fetch the completed rebalance to check if it actually ran portfolio manager
            const { data: completedRebalance } = await supabase
              .from('rebalance_requests')
              .select('id, status, rebalance_plan')
              .eq('id', previousRunningRef.current)
              .single();

            if (completedRebalance?.status === REBALANCE_STATUS.COMPLETED &&
              completedRebalance?.rebalance_plan?.trades?.length > 0) {
              // Only show toast if portfolio manager actually ran and created trades
              console.log('Rebalance completed with trades:', previousRunningRef.current);
              toast({
                title: "Rebalance Complete",
                description: "Portfolio rebalancing has been completed",
              });
              // Refresh positions to show updated holdings
              fetchPositions();
            } else if (completedRebalance?.status === REBALANCE_STATUS.COMPLETED &&
              completedRebalance?.rebalance_plan?.recommendation === 'no_action_needed') {
              // Show different message when no opportunities were found
              console.log('Rebalance completed with no action needed:', previousRunningRef.current);
              toast({
                title: "Rebalance Analysis Complete",
                description: completedRebalance?.rebalance_plan?.message || "No rebalancing opportunities found",
              });
            }
          }

          setRunningRebalance(null);
          previousRunningRef.current = null;
        }
      } catch (error) {
        console.error('Error checking running rebalance:', error);
      }
    };

    checkRunningRebalance();
    // Check every 5 seconds for rebalance status
    const interval = setInterval(checkRunningRebalance, 5000);
    return () => clearInterval(interval);
  }, [user]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base font-semibold">Holdings</CardTitle>
              {apiSettings && (
                <Badge variant={apiSettings.alpaca_paper_trading ? "secondary" : "destructive"} className="text-xs">
                  {apiSettings.alpaca_paper_trading ? "Paper" : "Live"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">

              {runningRebalance ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runningRebalance ? () => setShowRebalanceDetailModal(true) : handleRebalanceClick}
                  disabled={loading}
                >
                  <>
                    <Eye className="h-4 w-4 mr-2" />
                    Rebalance Detail
                  </>
                </Button>
              ) : (
                <Button
                  onClick={handleRebalanceClick}
                  disabled={loading || !isAlpacaConnected}
                  size="sm"
                  variant="default"
                >
                  {!isAlpacaConnected ? (
                    <>
                      <AlertTriangle className="h-4 w-4 mr-1" />
                      Connection Error
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Rebalance
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowScheduleListModal(true)}
              >
                <Clock className="h-4 w-4" />
              </Button>

            </div>
          </div>
          {lastRefresh && (
            <p className="text-xs text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[60px] text-xs">Symbol</TableHead>
                  <TableHead className="text-right text-xs px-2">Shares</TableHead>
                  <TableHead className="text-right text-xs px-2">Value</TableHead>
                  <TableHead className="text-right text-xs px-2">Daily</TableHead>
                  <TableHead className="text-right text-xs px-2">Total</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
            <div className="max-h-[210px] overflow-y-auto">
              <Table>
                <TableBody>
                  {positions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">
                        {loading ? "Loading positions..." :
                          error ? error :
                            "No positions found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    positions.map((position) => (
                      <TableRow
                        key={position.symbol}
                        className={`cursor-pointer hover:bg-muted/50 transition-colors ${selectedStock === position.symbol ? 'bg-muted' : ''
                          }`}
                        onClick={() => onSelectStock?.(position.symbol)}
                      >
                        <TableCell className="font-medium w-[60px]">
                          <Badge variant={selectedStock === position.symbol ? 'default' : 'outline'}>
                            {position.symbol}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm px-2">{position.shares.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-medium text-sm px-2">
                          ${(position.marketValue / 1000).toFixed(1)}k
                        </TableCell>
                        <TableCell className="text-right px-2">
                          <div className={`flex items-center justify-end gap-1 ${position.dayChange >= 0 ? 'text-success' : 'text-danger'
                            }`}>
                            {position.dayChange >= 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            <span className="text-xs font-medium">
                              {position.dayChange >= 0 ? '+' : ''}{position.dayChange.toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right px-2">
                          <div className={`flex items-center justify-end gap-1 ${position.unrealizedPL >= 0 ? 'text-success' : 'text-danger'
                            }`}>
                            {position.unrealizedPL >= 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            <span className="text-xs font-medium">
                              {position.unrealizedPLPct >= 0 ? '+' : ''}{position.unrealizedPLPct.toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rebalance Modal */}
      <RebalanceModal
        isOpen={showRebalanceModal}
        onClose={() => setShowRebalanceModal(false)}
        onApprove={async (selectedPositions, config, modalPortfolioData) => {
          console.log('Rebalancing positions:', selectedPositions);
          console.log('Rebalance config:', config);
          console.log('Portfolio data from modal:', modalPortfolioData);

          setRebalancing(true);

          try {
            // Don't pre-calculate individual stock allocations
            // Let the Portfolio Manager agent decide based on analysis results
            // We only pass the total stock/cash allocation split
            const targetAllocations: Record<string, number> = {};

            // Leave targetAllocations empty - Portfolio Manager will decide
            // The constraints object below includes targetCashAllocation
            // which tells the Portfolio Manager the stock/cash split

            // Build constraints object
            // Note: When useDefaultSettings is true, config already has the values from apiSettings
            // (loaded in RebalanceModal's loadData function)
            const constraints = {
              maxPositionSize: config.maxPosition,
              minPositionSize: config.minPosition,
              rebalanceThreshold: config.rebalanceThreshold,
              targetCashAllocation: config.targetCashAllocation,
              includeTickers: selectedPositions.map(p => p.ticker),
              excludeTickers: positions
                .filter(p => !selectedPositions.find(sp => sp.ticker === p.symbol))
                .map(p => p.symbol), // Exclude deselected stocks
              skipOpportunityAgent: config.skipOpportunityAgent || config.skipThresholdCheck,
              skipThresholdCheck: config.skipThresholdCheck
            };

            // Use portfolio data from modal if available, otherwise calculate from positions
            const portfolioData = modalPortfolioData || {
              totalValue: positions.reduce((sum, p) => sum + (p.marketValue || 0), 0),
              positions: selectedPositions.map(pos => {
                // Find the matching position from the actual positions array to get full data
                const actualPosition = positions.find(p => p.symbol === pos.ticker);
                return {
                  ticker: pos.ticker,
                  value: pos.currentValue || 0,
                  costBasis: (pos.currentShares * (pos.avgPrice || 0)) || 0,
                  dayChangePercent: actualPosition?.dayChange || 0,
                  shares: pos.currentShares || 0
                };
              })
            };

            console.log('Sending to coordinator:', {
              tickers: selectedPositions.map(p => p.ticker),
              portfolioData,
              targetAllocations,
              constraints
            });

            // Call rebalance-coordinator edge function for portfolio rebalancing
            // Note: Do NOT pass apiSettings or credentials - edge function will fetch from database
            const { data, error } = await supabase.functions.invoke('rebalance-coordinator', {
              body: {
                userId: user?.id,
                tickers: selectedPositions.map(p => p.ticker),
                action: 'start-rebalance',
                targetAllocations,
                constraints,
                portfolioData,
                skipOpportunityAgent: config.skipOpportunityAgent,
                rebalanceThreshold: config.rebalanceThreshold,
                useDefaultSettings: config.useDefaultSettings
              }
            });

            // Check for Supabase client errors (network, auth, etc)
            if (error) {
              console.error('HTTP-level error from rebalance function:', error);
              // If there's data with an error message, use that instead of the generic error
              if (data?.error) {
                throw new Error(data.error);
              }
              throw error;
            }

            // Check for function-level errors
            if (!data?.success) {
              const errorMessage = data?.error || data?.message || 'Failed to initiate rebalance';
              console.error('Edge Function returned error:', errorMessage, data);
              
              // Check if it's a configuration issue
              if (errorMessage.includes('API settings not found') || 
                  errorMessage.includes('not configured') || 
                  errorMessage.includes('No provider configuration found')) {
                throw new Error('Please configure your AI provider settings in the Settings page');
              }
              
              throw new Error(errorMessage);
            }

            // Handle successful response
            if (data?.success) {
              toast({
                title: "Rebalance Initiated",
                description: `Analyzing ${data.tickers?.length || 0} stocks for rebalancing. You will be notified when complete.`,
              });

              // Store rebalance request ID if needed for tracking
              if (data.rebalanceRequestId) {
                localStorage.setItem('activeRebalanceId', data.rebalanceRequestId);
              }
            } else {
              // Handle malformed response (no success field)
              console.warn('Unexpected response format from rebalance function:', data);
              throw new Error('Unexpected response from rebalance service');
            }
          } catch (err: any) {
            console.error('Rebalance error:', err);
            
            let errorMessage = "Failed to initiate portfolio rebalancing";
            
            // Extract error message from FunctionsHttpError
            if (err?.name === 'FunctionsHttpError' && err?.context) {
              try {
                const responseData = await err.context.clone().json();
                errorMessage = responseData?.error || responseData?.message || errorMessage;
              } catch {
                // If JSON parsing fails, use the generic message
                errorMessage = "Service error. Please check your configuration.";
              }
            } else if (err?.message) {
              errorMessage = err.message;
            }
            
            toast({
              title: "Rebalance Failed", 
              description: errorMessage,
              variant: "destructive"
            });
          } finally {
            setRebalancing(false);
          }
        }}
      />

      {/* Rebalance Detail Modal */}
      <RebalanceDetailModal
        rebalanceId={runningRebalance || undefined}
        isOpen={showRebalanceDetailModal}
        onClose={() => setShowRebalanceDetailModal(false)}
      />

      {/* Schedule List Modal */}
      <ScheduleListModal
        isOpen={showScheduleListModal}
        onClose={() => setShowScheduleListModal(false)}
      />
      
      {/* Running Analyses Alert Dialog */}
      <AlertDialog open={showAnalysisAlert} onOpenChange={setShowAnalysisAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500 animate-pulse" />
              Active Analyses Detected
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                {runningAnalysesCount} {runningAnalysesCount === 1 ? 'analysis is' : 'analyses are'} currently running. 
                Portfolio rebalancing is temporarily disabled while individual stock analyses are in progress.
              </p>
              <p>
                Please wait for all analyses to complete before starting a portfolio rebalance.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowAnalysisAlert(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}