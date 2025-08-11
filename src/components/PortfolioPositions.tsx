import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, RefreshCw, Loader2, Eye, Activity } from "lucide-react";
import { alpacaAPI } from "@/lib/alpaca";
import { useAuth } from "@/lib/auth-supabase";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import RebalanceModal from "./RebalanceModal";
import RebalanceDetailModal from "./RebalanceDetailModal";

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
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [showRebalanceDetailModal, setShowRebalanceDetailModal] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [runningRebalance, setRunningRebalance] = useState<string | null>(null); // Store rebalance_request_id
  
  // Use ref to track previous running rebalance
  const previousRunningRef = useRef<string | null>(null);
  
  const handleRebalanceClick = () => {
    if (!isAuthenticated) {
      // This shouldn't happen since the button is in an authenticated area
      return;
    } else {
      setShowRebalanceModal(true);
    }
  };

  const fetchPositions = async () => {
    // Check if Alpaca API is configured
    const isPaper = apiSettings?.alpaca_paper_trading ?? true;
    const hasAlpacaConfig = isPaper 
      ? (apiSettings?.alpaca_paper_api_key && apiSettings?.alpaca_paper_secret_key)
      : (apiSettings?.alpaca_live_api_key && apiSettings?.alpaca_live_secret_key);
    
    if (!hasAlpacaConfig) {
      // Don't show error, just keep positions empty when API is not configured
      setPositions([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const alpacaPositions = await alpacaAPI.getPositions();
      
      const formattedPositions: Position[] = alpacaPositions.map(pos => ({
        symbol: pos.symbol,
        shares: parseFloat(pos.qty),
        avgCost: parseFloat(pos.avg_entry_price),
        currentPrice: parseFloat(pos.current_price),
        marketValue: parseFloat(pos.market_value),
        unrealizedPL: parseFloat(pos.unrealized_pl),
        unrealizedPLPct: parseFloat(pos.unrealized_plpc) * 100,
        dayChange: parseFloat(pos.change_today)
      }));

      setPositions(formattedPositions);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Error fetching positions:', err);
      // Only show error if it's not a configuration issue
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch positions';
      if (!errorMessage.includes('Edge Function returned')) {
        setError(errorMessage);
      }
      // Keep positions empty if API fails
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

  // Check for running rebalance requests
  useEffect(() => {
    const checkRunningRebalance = async () => {
      if (!user) return;
      
      try {
        // Check for active rebalance requests
        const { data, error } = await supabase
          .from('rebalance_requests')
          .select('id, status, created_at')
          .eq('user_id', user.id)
          .in('status', ['initializing', 'analyzing', 'pending_trades'])
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (!error && data && data.length > 0) {
          const activeRebalance = data[0];
          setRunningRebalance(activeRebalance.id);
          
          // Check if rebalance just started (wasn't running before)
          if (!previousRunningRef.current && activeRebalance.id) {
            console.log('New rebalance detected:', activeRebalance.id);
          }
          
          previousRunningRef.current = activeRebalance.id;
        } else {
          // Check if rebalance just completed
          if (previousRunningRef.current) {
            console.log('Rebalance completed:', previousRunningRef.current);
            toast({
              title: "Rebalance Complete",
              description: "Portfolio rebalancing has been completed",
            });
            // Refresh positions to show updated holdings
            fetchPositions();
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
            {runningRebalance && (
              <Badge variant="secondary" className="animate-pulse">
                <Activity className="h-3 w-3 mr-1" />
                Rebalancing...
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={runningRebalance ? () => setShowRebalanceDetailModal(true) : handleRebalanceClick}
              disabled={loading}
            >
              {runningRebalance ? (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Rebalance Detail
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Rebalance Holdings
                </>
              )}
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
        <div className="max-h-[250px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-[60px] text-xs">Symbol</TableHead>
                <TableHead className="text-right text-xs px-2">Shares</TableHead>
                <TableHead className="text-right text-xs px-2">Value</TableHead>
                <TableHead className="text-right text-xs px-2">Daily</TableHead>
                <TableHead className="text-right text-xs px-2">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-4">
                    {loading ? "Loading positions..." : 
                     !apiSettings?.alpaca_paper_api_key && !apiSettings?.alpaca_live_api_key ? 
                     "Configure Alpaca API in Settings to view positions" : 
                     "No positions found"}
                  </TableCell>
                </TableRow>
              ) : (
                positions.map((position) => (
                  <TableRow 
                    key={position.symbol}
                    className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedStock === position.symbol ? 'bg-muted' : ''
                    }`}
                    onClick={() => onSelectStock?.(position.symbol)}
                  >
                    <TableCell className="font-medium">
                      <Badge variant={selectedStock === position.symbol ? 'default' : 'outline'}>
                        {position.symbol}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{position.shares}</TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      ${(position.marketValue / 1000).toFixed(1)}k
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`flex items-center justify-end gap-1 ${
                        position.dayChange >= 0 ? 'text-success' : 'text-danger'
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
                    <TableCell className="text-right">
                      <div className={`flex items-center justify-end gap-1 ${
                        position.unrealizedPL >= 0 ? 'text-success' : 'text-danger'
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
            positions: selectedPositions.map(pos => ({
              ticker: pos.ticker,
              value: pos.currentValue || 0,
              costBasis: pos.costBasis || (pos.currentShares * pos.averageCost) || 0,
              dayChangePercent: pos.dayChangePercent || 0,
              shares: pos.currentShares || 0
            }))
          };
          
          console.log('Sending to coordinator:', {
            tickers: selectedPositions.map(p => p.ticker),
            portfolioData,
            targetAllocations,
            constraints
          });
          
          // Call analyze-stock-coordinator edge function with rebalance context
          // Note: Do NOT pass apiSettings or credentials - edge function will fetch from database
          const { data, error } = await supabase.functions.invoke('analyze-stock-coordinator', {
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
          
          if (error) throw error;
          
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
            throw new Error(data?.message || 'Failed to initiate rebalance');
          }
        } catch (err) {
          console.error('Rebalance error:', err);
          toast({
            title: "Rebalance Failed",
            description: err instanceof Error ? err.message : "Failed to initiate portfolio rebalancing",
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
    </>
  );
}