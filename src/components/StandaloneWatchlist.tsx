import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAlpacaConnectionStore } from "@/hooks/useAlpacaConnection";
import StockTickerAutocomplete from "@/components/StockTickerAutocomplete";
import { Plus, X, TrendingUp, TrendingDown, Loader2, RefreshCw, Play, Eye, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth, isSessionValid } from "@/lib/auth";
import { useRBAC } from "@/hooks/useRBAC";
import { alpacaAPI } from "@/lib/alpaca";
import AnalysisDetailModal from "./AnalysisDetailModal";
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
  AnalysisStatus,
  ANALYSIS_STATUS,
  convertLegacyAnalysisStatus,
  isAnalysisActive,
  isRebalanceActive
} from "@/lib/statusTypes";

interface WatchlistItem {
  id?: string;
  ticker: string;
  description?: string;
  addedAt: string;
  lastAnalysis?: string;
  lastDecision?: 'BUY' | 'SELL' | 'HOLD';
  status: AnalysisStatus;
  currentPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
}

interface StandaloneWatchlistProps {
  onSelectStock?: (ticker: string) => void;
  selectedStock?: string;
}

export default function StandaloneWatchlist({ onSelectStock, selectedStock }: StandaloneWatchlistProps) {
  const { user, isAuthenticated, apiSettings } = useAuth();
  const { getMaxParallelAnalysis, getMaxWatchlistStocks } = useRBAC();
  const { toast } = useToast();
  const { isConnected: isAlpacaConnected } = useAlpacaConnectionStore();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [runningAnalyses, setRunningAnalyses] = useState<Set<string>>(new Set());
  const [showLimitAlert, setShowLimitAlert] = useState(false);
  const [showRebalanceAlert, setShowRebalanceAlert] = useState(false);
  const [hasRunningRebalance, setHasRunningRebalance] = useState(false);
  const [showWatchlistLimitAlert, setShowWatchlistLimitAlert] = useState(false);

  const maxParallelAnalysis = getMaxParallelAnalysis();
  const maxWatchlistStocks = getMaxWatchlistStocks();

  // Debug: Log the watchlist limit
  useEffect(() => {
    console.log('[StandaloneWatchlist] Max watchlist stocks:', maxWatchlistStocks);
    console.log('[StandaloneWatchlist] Current watchlist length:', watchlist.length);
  }, [maxWatchlistStocks, watchlist.length]);

  // Fetch stock data including description and price using Alpaca
  const fetchStockData = async (ticker: string) => {
    try {
      // Get asset info and latest quote in parallel
      const [assetInfo, quoteData] = await Promise.all([
        alpacaAPI.getAsset(ticker).catch(err => {
          console.warn(`Could not fetch asset info for ${ticker}:`, err);
          return null;
        }),
        alpacaAPI.getLatestQuote(ticker).catch(err => {
          console.warn(`Could not fetch quote for ${ticker}:`, err);
          return null;
        })
      ]);

      const result: any = {
        description: assetInfo?.name || ticker
      };

      if (quoteData?.quote) {
        const quote = quoteData.quote;
        // Calculate current price from ask/bid prices
        const currentPrice = quote.ap || quote.bp || 0; // Use ask price, fallback to bid
        result.currentPrice = currentPrice;

        // Fetch previous day's close to calculate daily change
        try {
          // Get yesterday's date
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          // Fetch previous day's bar for close price
          const bars = await alpacaAPI.getStockBars(ticker, '1Day', yesterdayStr, yesterdayStr, 1);

          if (bars && bars.length > 0) {
            const previousClose = bars[0].c; // closing price
            const dayChange = currentPrice - previousClose;
            const dayChangePercent = previousClose > 0 ? (dayChange / previousClose) * 100 : 0;

            result.priceChange = dayChange;
            result.priceChangePercent = dayChangePercent;
          } else {
            // No previous close available
            result.priceChange = 0;
            result.priceChangePercent = 0;
          }
        } catch (err) {
          console.warn(`Could not fetch previous close for ${ticker}:`, err);
          result.priceChange = 0;
          result.priceChangePercent = 0;
        }
      }

      return result;
    } catch (error) {
      console.error(`Error fetching data for ${ticker}:`, error);
      return { description: ticker };
    }
  };

  const loadWatchlist = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user.id)
        .order('added_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const watchlistItems: WatchlistItem[] = data.map((item: any) => ({
          id: item.id,
          ticker: item.ticker,
          addedAt: new Date(item.added_at).toISOString().split('T')[0],
          lastAnalysis: item.last_analysis ? new Date(item.last_analysis).toISOString().split('T')[0] : undefined,
          lastDecision: item.last_decision as 'BUY' | 'SELL' | 'HOLD' | undefined,
          status: ANALYSIS_STATUS.PENDING
        }));

        setWatchlist(watchlistItems);

        // Fetch all stock data in a single batch request
        try {
          const tickers = watchlistItems.map(item => item.ticker);
          const batchData = await alpacaAPI.getBatchData(tickers, {
            includeQuotes: true,
            includeBars: true
          });

          // Update watchlist with batch data
          setWatchlist(prev => prev.map(item => {
            const data = batchData[item.ticker];
            if (!data) return item;

            const updates: Partial<WatchlistItem> = {};

            // Add description from asset data
            if (data.asset?.name) {
              updates.description = data.asset.name;
            }

            // Add price data from quote
            if (data.quote) {
              const currentPrice = data.quote.ap || data.quote.bp || 0;
              updates.currentPrice = currentPrice;

              // Calculate today's change from open (during market hours)
              // Use currentBar (today's bar) instead of previousBar
              if (data.currentBar) {
                const todayOpen = data.currentBar.o; // Today's open price
                const dayChange = currentPrice - todayOpen;
                const dayChangePercent = todayOpen > 0 ? (dayChange / todayOpen) * 100 : 0;
                updates.priceChange = dayChange;
                updates.priceChangePercent = dayChangePercent;
                console.log(`${item.ticker}: Open: ${todayOpen}, Current: ${currentPrice}, Change: ${dayChange} (${dayChangePercent.toFixed(2)}%)`);
              } else if (data.previousBar) {
                // Fallback to previous close if no current bar (market closed)
                const previousClose = data.previousBar.c;
                const dayChange = currentPrice - previousClose;
                const dayChangePercent = previousClose > 0 ? (dayChange / previousClose) * 100 : 0;
                updates.priceChange = dayChange;
                updates.priceChangePercent = dayChangePercent;
              } else {
                updates.priceChange = 0;
                updates.priceChangePercent = 0;
              }
            }

            return { ...item, ...updates };
          }));
        } catch (batchError) {
          console.error('Error fetching batch stock data:', batchError);
          // Fallback to individual fetches if batch fails
          for (const item of watchlistItems) {
            const stockData = await fetchStockData(item.ticker);
            setWatchlist(prev => prev.map(w =>
              w.ticker === item.ticker ? { ...w, ...stockData } : w
            ));
          }
        }
      } else {
        setWatchlist([]);
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
      toast({
        title: "Error",
        description: "Failed to load watchlist",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Load watchlist from Supabase
  useEffect(() => {
    if (isAuthenticated && user) {
      // Add a small delay on initial mount to ensure session is settled
      const timeoutId = setTimeout(() => {
        loadWatchlist();
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setWatchlist([]);
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  // Use ref to track previous running analyses
  const previousRunningRef = useRef<Set<string>>(new Set());

  // Check for running rebalances
  useEffect(() => {
    const checkRunningRebalance = async () => {
      if (!user || !isAuthenticated || !isSessionValid()) {
        console.log('StandaloneWatchlist: Skipping rebalance check - session invalid or not authenticated');
        return;
      }

      try {
        const { data: rebalanceData } = await supabase
          .from('rebalance_requests')
          .select('id, status')
          .eq('user_id', user.id);

        if (rebalanceData) {
          const hasRunning = rebalanceData.some(item =>
            isRebalanceActive(item.status)
          );
          setHasRunningRebalance(hasRunning);
        }
      } catch (error) {
        console.error('Error checking running rebalance:', error);
      }
    };

    // Only set up interval if authenticated
    if (isAuthenticated && user) {
      // Add a small delay before first check
      const timeoutId = setTimeout(() => {
        checkRunningRebalance();
        // Then set up interval for subsequent checks
        const interval = setInterval(checkRunningRebalance, 10000);
        // Store interval ID for cleanup
        (window as any).__watchlistRebalanceInterval = interval;
      }, 500);
      
      return () => {
        clearTimeout(timeoutId);
        const interval = (window as any).__watchlistRebalanceInterval;
        if (interval) {
          clearInterval(interval);
          delete (window as any).__watchlistRebalanceInterval;
        }
      };
    }
  }, [user, isAuthenticated]);

  // Check for running analyses using unified logic
  useEffect(() => {
    const checkRunningAnalyses = async () => {
      const running = new Set<string>();

      // Check database for running analyses if user is authenticated
      if (user && isAuthenticated) {
        try {
          // Get analyses from last 7 days (enough to show recent activity for watchlist)
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          
          const { data, error } = await supabase
            .from('analysis_history')
            .select('ticker, analysis_status, full_analysis, is_canceled, created_at')
            .eq('user_id', user.id)
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false });

          if (!error && data) {
            // Group by ticker to get the most recent analysis for each
            const latestByTicker = new Map<string, any>();
            for (const item of data) {
              if (!latestByTicker.has(item.ticker)) {
                latestByTicker.set(item.ticker, item);
              }
            }

            // Check status of latest analysis for each ticker using unified logic
            for (const [ticker, item] of latestByTicker) {
              // Convert legacy numeric status if needed
              const currentStatus = typeof item.analysis_status === 'number'
                ? convertLegacyAnalysisStatus(item.analysis_status)
                : item.analysis_status;

              // Skip cancelled analyses
              if (item.is_canceled || currentStatus === ANALYSIS_STATUS.CANCELLED) {
                continue;
              }

              // Use unified logic to check if analysis is active
              const isRunning = isAnalysisActive(currentStatus);

              if (isRunning) {
                running.add(ticker);
              }
            }
          }
        } catch (error) {
          console.error('Error checking running analyses:', error);
        }
      }

      // Check if any analyses just completed
      const justCompleted = Array.from(previousRunningRef.current).filter(ticker => !running.has(ticker));
      if (justCompleted.length > 0) {
        loadWatchlist();
      }

      // Update the ref with current running set
      previousRunningRef.current = running;
      setRunningAnalyses(running);
    };

    // Only set up interval if authenticated
    if (isAuthenticated && user) {
      // Add a small delay before first check
      const timeoutId = setTimeout(() => {
        checkRunningAnalyses();
        // Then set up interval for subsequent checks
        const interval = setInterval(checkRunningAnalyses, 10000);
        // Store interval ID for cleanup
        (window as any).__watchlistAnalysisInterval = interval;
      }, 500);
      
      return () => {
        clearTimeout(timeoutId);
        const interval = (window as any).__watchlistAnalysisInterval;
        if (interval) {
          clearInterval(interval);
          delete (window as any).__watchlistAnalysisInterval;
        }
      };
    }
  }, [user, isAuthenticated]);

  const addToWatchlist = async () => {
    if (!user || !newTicker) return;

    const ticker = newTicker.toUpperCase();
    
    // Check if user has reached watchlist limit first
    if (watchlist.length >= maxWatchlistStocks && maxWatchlistStocks > 0) {
      setShowWatchlistLimitAlert(true);
      return;
    }
    
    if (watchlist.find(item => item.ticker === ticker)) {
      toast({
        title: "Already in watchlist",
        description: `${ticker} is already in your watchlist`,
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('watchlist')
        .insert({
          user_id: user.id,
          ticker: ticker
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const newItem: WatchlistItem = {
          id: data.id,
          ticker: data.ticker,
          addedAt: new Date(data.added_at).toISOString().split('T')[0],
          status: ANALYSIS_STATUS.PENDING
        };

        setWatchlist([...watchlist, newItem]);
        setNewTicker('');

        // Fetch stock data for the new item
        const stockData = await fetchStockData(ticker);
        setWatchlist(prev => prev.map(w =>
          w.ticker === ticker ? { ...w, ...stockData } : w
        ));

        toast({
          title: "Added to watchlist",
          description: `${ticker} has been added to your watchlist`,
        });
      }
    } catch (error) {
      console.error('Error adding to watchlist:', error);
      toast({
        title: "Error",
        description: "Failed to add to watchlist",
        variant: "destructive",
      });
    }
  };

  const removeFromWatchlist = async (ticker: string) => {
    if (!user) return;

    const item = watchlist.find(i => i.ticker === ticker);
    if (!item?.id) return;

    try {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('id', item.id);

      if (error) throw error;

      setWatchlist(watchlist.filter(item => item.ticker !== ticker));
      toast({
        title: "Removed from watchlist",
        description: `${ticker} has been removed from your watchlist`,
      });
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      toast({
        title: "Error",
        description: "Failed to remove from watchlist",
        variant: "destructive",
      });
    }
  };

  const refreshPrices = async () => {
    if (watchlist.length === 0) return;

    toast({
      title: "Refreshing prices",
      description: "Updating stock prices...",
    });

    try {
      // Fetch all prices in a single batch request
      const tickers = watchlist.map(item => item.ticker);
      const batchData = await alpacaAPI.getBatchData(tickers, {
        includeQuotes: true,
        includeBars: true
      });

      // Update watchlist with batch data
      setWatchlist(prev => prev.map(item => {
        const data = batchData[item.ticker];
        if (!data) return item;

        const updates: Partial<WatchlistItem> = {};

        // Update price data from quote
        if (data.quote) {
          const currentPrice = data.quote.ap || data.quote.bp || 0;
          updates.currentPrice = currentPrice;

          // Calculate today's change from open (during market hours)
          if (data.currentBar) {
            const todayOpen = data.currentBar.o; // Today's open price
            const dayChange = currentPrice - todayOpen;
            const dayChangePercent = todayOpen > 0 ? (dayChange / todayOpen) * 100 : 0;
            updates.priceChange = dayChange;
            updates.priceChangePercent = dayChangePercent;
          } else if (data.previousBar) {
            // Fallback to previous close if no current bar (market closed)
            const previousClose = data.previousBar.c;
            const dayChange = currentPrice - previousClose;
            const dayChangePercent = previousClose > 0 ? (dayChange / previousClose) * 100 : 0;
            updates.priceChange = dayChange;
            updates.priceChangePercent = dayChangePercent;
          }
        }

        return { ...item, ...updates };
      }));

      toast({
        title: "Prices updated",
        description: "Stock prices have been refreshed",
      });
    } catch (error) {
      console.error('Error refreshing prices:', error);
      // Fallback to individual fetches if batch fails
      for (const item of watchlist) {
        const stockData = await fetchStockData(item.ticker);
        setWatchlist(prev => prev.map(w =>
          w.ticker === item.ticker ? { ...w, ...stockData } : w
        ));
      }
    }
  };

  const openAnalysis = async (ticker: string) => {
    if (runningAnalyses.has(ticker)) {
      // View existing running analysis
      setSelectedTicker(ticker);
    } else {
      // Check if there's a running rebalance
      if (hasRunningRebalance) {
        setShowRebalanceAlert(true);
        return;
      }

      // Check if we've reached the parallel analysis limit
      if (runningAnalyses.size >= maxParallelAnalysis) {
        setShowLimitAlert(true);
        return;
      }

      try {
        // Start analysis via analysis coordinator
        // Don't send any credentials from frontend - coordinator will fetch from database
        const { data, error } = await supabase.functions.invoke('analysis-coordinator', {
          body: {
            ticker,
            userId: user?.id,
            // No phase/agent - indicates new analysis request
          }
        });

        // Check for Supabase client errors (network, auth, etc)
        if (error) {
          // If there's data with an error message, use that instead of the generic error
          if (data?.error) {
            throw new Error(data.error);
          }
          throw error;
        }

        // Check for function-level errors
        if (!data?.success) {
          const errorMessage = data?.error || 'Analysis failed';

          // Check if it's a configuration issue
          if (errorMessage.includes('API settings not found') ||
            errorMessage.includes('not configured') ||
            errorMessage.includes('No provider configuration found')) {
            toast({
              title: "Configuration Required",
              description: "Please configure your AI provider settings in the Settings page",
              variant: "destructive",
            });
            return;
          }

          // Show the actual error message from the function
          throw new Error(errorMessage);
        }

        // Immediately add to running analyses
        setRunningAnalyses(prev => {
          const newSet = new Set(prev);
          newSet.add(ticker);
          // Also update the ref immediately
          previousRunningRef.current = newSet;
          return newSet;
        });

        toast({
          title: "Analysis Started",
          description: `Running AI analysis for ${ticker} on the server`,
        });

        // Open viewer to show progress - this will show the NEW analysis
        setSelectedTicker(ticker);
      } catch (error) {
        console.error('Error starting analysis:', error);
        toast({
          title: "Analysis Failed",
          description: error instanceof Error ? error.message : "Failed to start analysis",
          variant: "destructive",
        });
      }
    }
  };

  const getDecisionBadge = (decision?: 'BUY' | 'SELL' | 'HOLD') => {
    if (!decision) return null;

    const variants = {
      BUY: 'buy' as const,
      SELL: 'sell' as const,
      HOLD: 'hold' as const
    };

    return (
      <Badge variant={variants[decision]}>
        {decision}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Watchlist</CardTitle>
            <span className="text-sm text-muted-foreground">
              ({watchlist.length}/{maxWatchlistStocks})
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={refreshPrices}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {/* Add to watchlist form */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1">
              <StockTickerAutocomplete
                value={newTicker}
                onChange={setNewTicker}
                onEnterPress={addToWatchlist}
                placeholder="Add ticker to watchlist"
              />
            </div>
            <Button 
              onClick={addToWatchlist} 
              disabled={!newTicker}
              title="Add to watchlist"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Watchlist items */}
          {watchlist.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Your watchlist is empty</p>
              <p className="text-sm mt-2">Add stocks to track and analyze them</p>
            </div>
          ) : (
            <div className="space-y-2">
              {watchlist.map((item) => (
                <div
                  key={item.ticker}
                  className={`relative flex flex-col sm:flex-row sm:items-center sm:justify-between sm:p-4 rounded-lg border transition-colors cursor-pointer ${selectedStock === item.ticker
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/50'
                    }`}
                  onClick={(e) => {
                    // Only trigger selection if not clicking on buttons
                    if ((e.target as HTMLElement).closest('button')) return;
                    onSelectStock?.(item.ticker);
                  }}
                >
                  {/* Mobile: X button in top-right corner */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 sm:hidden h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromWatchlist(item.ticker);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>

                  <div className="flex-1 p-4 pb-2 sm:p-0 pr-10 sm:pr-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="font-semibold">{item.ticker}</span>
                      {item.description && (
                        <span className="text-sm text-muted-foreground line-clamp-1">
                          {item.description}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1 text-sm">
                      {item.currentPrice > 0 && (
                        <span className="font-medium">
                          ${item.currentPrice.toFixed(2)}
                        </span>
                      )}
                      {item.priceChangePercent !== undefined && (
                        <div className={`flex items-center gap-1 ${item.priceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                          {item.priceChangePercent >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          <span>{Math.abs(item.priceChangePercent).toFixed(2)}%</span>
                        </div>
                      )}
                      <span className="text-muted-foreground hidden sm:inline">
                        Last: {item.lastAnalysis || new Date().toISOString().split('T')[0]}
                      </span>
                      {getDecisionBadge(item.lastDecision)}
                    </div>
                  </div>

                  {/* Mobile: Show analyze button below at full width */}
                  <div className="sm:hidden border-t border-border/50 px-4 py-2 bg-muted/30">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border border-slate-700"
                      disabled={!isAlpacaConnected && !runningAnalyses.has(item.ticker)}
                      onClick={(e) => {
                        e.stopPropagation();
                        openAnalysis(item.ticker);
                      }}
                    >
                      {!isAlpacaConnected && !runningAnalyses.has(item.ticker) ? (
                        <>
                          <AlertCircle className="h-4 w-4 mr-1" />
                          Connection Error
                        </>
                      ) : runningAnalyses.has(item.ticker) ? (
                        <>
                          <Eye className="h-4 w-4 mr-1" />
                          View Progress
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Analyze
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Desktop: Show buttons on the right */}
                  <div className="hidden sm:flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border border-slate-700"
                      disabled={!isAlpacaConnected && !runningAnalyses.has(item.ticker)}
                      onClick={(e) => {
                        e.stopPropagation();
                        openAnalysis(item.ticker);
                      }}
                    >
                      {!isAlpacaConnected && !runningAnalyses.has(item.ticker) ? (
                        <>
                          <AlertCircle className="h-4 w-4 mr-1" />
                          Connection Error
                        </>
                      ) : runningAnalyses.has(item.ticker) ? (
                        <>
                          <Eye className="h-4 w-4 mr-1" />
                          View Progress
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Analyze
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border border-slate-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromWatchlist(item.ticker);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Modal */}
      {selectedTicker && (
        <AnalysisDetailModal
          ticker={selectedTicker}
          isOpen={!!selectedTicker}
          onClose={() => {
            setSelectedTicker(null);
            // Reload watchlist to get updated decision
            loadWatchlist();
          }}
        />
      )}

      {/* Limit Reached Alert Dialog */}
      <AlertDialog open={showLimitAlert} onOpenChange={setShowLimitAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Analysis Limit Reached
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You have reached your maximum limit of {maxParallelAnalysis} parallel {maxParallelAnalysis === 1 ? 'analysis' : 'analyses'}.
              </p>
              <p>
                Currently {runningAnalyses.size} {runningAnalyses.size === 1 ? 'analysis is' : 'analyses are'} running. Please wait for one to complete before starting another.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowLimitAlert(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rebalance Running Alert Dialog */}
      <AlertDialog open={showRebalanceAlert} onOpenChange={setShowRebalanceAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-yellow-500 animate-spin" />
              Portfolio Rebalance in Progress
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                A portfolio rebalance is currently running. Individual stock analyses are temporarily disabled during rebalancing.
              </p>
              <p>
                Please wait for the rebalance to complete before starting new analyses.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowRebalanceAlert(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Watchlist Limit Alert Dialog */}
      <AlertDialog open={showWatchlistLimitAlert} onOpenChange={setShowWatchlistLimitAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Watchlist Limit Reached
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You have reached your maximum limit of {maxWatchlistStocks} stocks in your watchlist.
              </p>
              <p>
                Please remove some stocks from your watchlist before adding new ones.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowWatchlistLimitAlert(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}