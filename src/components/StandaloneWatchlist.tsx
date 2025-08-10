import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import StockTickerAutocomplete from "@/components/StockTickerAutocomplete";
import { Plus, X, TrendingUp, TrendingDown, Loader2, RefreshCw, Play, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-supabase";
import { alpacaAPI } from "@/lib/alpaca";
import AnalysisDetailModal from "./AnalysisDetailModal";

interface WatchlistItem {
  id?: string;
  ticker: string;
  description?: string;
  addedAt: string;
  lastAnalysis?: string;
  lastDecision?: 'BUY' | 'SELL' | 'HOLD';
  status: 'idle' | 'analyzing' | 'completed';
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
  const { toast } = useToast();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [runningAnalyses, setRunningAnalyses] = useState<Set<string>>(new Set());

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
          status: 'idle' as const
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
              
              // Calculate price change if we have previous bar
              if (data.previousBar) {
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
      loadWatchlist();
    } else {
      setWatchlist([]);
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  // Use ref to track previous running analyses
  const previousRunningRef = useRef<Set<string>>(new Set());

  // Check for running analyses and completed analyses
  useEffect(() => {
    const checkRunningAnalyses = async () => {
      const running = new Set<string>();

      // Check database for running analyses if user is authenticated
      if (user) {
        try {
          // Get all analyses that might be running
          // Check both analysis_status = 0 and full_analysis->>'status' = 'running'
          const { data, error } = await supabase
            .from('analysis_history')
            .select('ticker, analysis_status, full_analysis')
            .eq('user_id', user.id)
            .or('analysis_status.eq.0,full_analysis->>status.eq.running');

          if (!error && data) {
            // Filter to only actually running analyses
            const runningData = data.filter(item => {
              // Consider running if analysis_status is 0 OR full_analysis.status is 'running'
              const isRunning = item.analysis_status === 0 || 
                              (item.full_analysis && item.full_analysis.status === 'running');
              return isRunning;
            });
            
            // Only log if there are actually running analyses
            if (runningData.length > 0) {
              console.log('Running analyses from DB:', runningData.map(d => ({ 
                ticker: d.ticker, 
                status: d.analysis_status,
                fullAnalysisStatus: d.full_analysis?.status 
              })));
            }
            for (const item of runningData) {
              running.add(item.ticker);
            }
          }
        } catch (error) {
          console.error('Error checking running analyses:', error);
        }
      }

      // Check if any analyses just completed (were running before but not now)
      const justCompleted = Array.from(previousRunningRef.current).filter(ticker => !running.has(ticker));
      if (justCompleted.length > 0) {
        console.log('Analyses completed, reloading watchlist for:', justCompleted);
        // Reload watchlist to get updated last_analysis and last_decision
        loadWatchlist();
      }

      // Only log if there are running analyses or if status changed
      const runningArray = Array.from(running);
      const prevArray = Array.from(previousRunningRef.current);
      if (runningArray.length > 0 || prevArray.length > 0) {
        if (runningArray.join(',') !== prevArray.join(',')) {
          console.log('Running analyses changed:', {
            current: runningArray,
            previous: prevArray
          });
        }
      }

      // Update the ref with current running set
      previousRunningRef.current = running;
      setRunningAnalyses(running);
    };

    checkRunningAnalyses();
    // Check periodically - every 10 seconds instead of 2 seconds
    const interval = setInterval(checkRunningAnalyses, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const addToWatchlist = async () => {
    if (!user || !newTicker) return;
    
    const ticker = newTicker.toUpperCase();
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
          status: 'idle' as const
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
          
          // Calculate price change if we have previous bar
          if (data.previousBar) {
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
      // Start new analysis
      if (!apiSettings?.ai_api_key || !apiSettings?.alpha_vantage_api_key) {
        toast({
          title: "Configuration Required",
          description: "Please configure your API settings in the Settings page",
          variant: "destructive",
        });
        return;
      }

      try {
        // Start analysis via edge function
        // Don't send any credentials from frontend - edge function will fetch from database
        const { data, error } = await supabase.functions.invoke('analyze-stock', {
          body: {
            ticker,
            userId: user?.id,
          }
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

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
          <CardTitle>Watchlist</CardTitle>
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
                placeholder="Add ticker to watchlist"
                onKeyPress={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter') {
                    addToWatchlist();
                  }
                }}
              />
            </div>
            <Button onClick={addToWatchlist} disabled={!newTicker}>
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
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors cursor-pointer ${
                    selectedStock === item.ticker 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={(e) => {
                    // Only trigger selection if not clicking on buttons
                    if ((e.target as HTMLElement).closest('button')) return;
                    onSelectStock?.(item.ticker);
                  }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{item.ticker}</span>
                      {item.description && (
                        <span className="text-sm text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm">
                      {item.currentPrice > 0 && (
                        <span className="font-medium">
                          ${item.currentPrice.toFixed(2)}
                        </span>
                      )}
                      {item.priceChangePercent !== undefined && (
                        <div className={`flex items-center gap-1 ${
                          item.priceChangePercent >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {item.priceChangePercent >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          <span>{Math.abs(item.priceChangePercent).toFixed(2)}%</span>
                        </div>
                      )}
                      {(item.lastAnalysis || item.currentPrice > 0) && (
                        <span className="text-muted-foreground">
                          Last: {item.lastAnalysis || new Date().toISOString().split('T')[0]}
                        </span>
                      )}
                      {getDecisionBadge(item.lastDecision)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="border border-slate-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAnalysis(item.ticker);
                      }}
                      disabled={!apiSettings?.ai_api_key || !apiSettings?.alpha_vantage_api_key}
                    >
                      {runningAnalyses.has(item.ticker) ? (
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
                      variant="ghost"
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
    </>
  );
}