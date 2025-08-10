import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, RefreshCw, Loader2, Eye } from "lucide-react";
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
  
  const handleRebalanceClick = () => {
    if (!isAuthenticated) {
      // This shouldn't happen since the button is in an authenticated area
      return;
    } else {
      setShowRebalanceModal(true);
    }
  };

  const fetchPositions = async () => {
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
      setError(err instanceof Error ? err.message : 'Failed to fetch positions');
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRebalanceDetailModal(true)}
            >
              <Eye className="h-4 w-4 mr-2" />
              Rebalance Demo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRebalanceClick}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Rebalance Holdings
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
                    {loading ? "Loading positions..." : "No positions found"}
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
      onApprove={async (selectedPositions, config) => {
        console.log('Rebalancing positions:', selectedPositions);
        console.log('Rebalance config:', config);
        
        setRebalancing(true);
        
        try {
          // Build target allocations from selected positions
          const targetAllocations: Record<string, number> = {};
          
          // For now, distribute equally among selected stocks
          // (In production, you might want to allow custom allocation per stock)
          const stockAllocationPercent = 100 - config.targetCashAllocation;
          const perStockAllocation = selectedPositions.length > 0 
            ? stockAllocationPercent / selectedPositions.length 
            : 0;
          
          selectedPositions.forEach(pos => {
            targetAllocations[pos.ticker] = perStockAllocation;
          });
          
          // Build constraints object
          const constraints = {
            maxPositionSize: config.useDefaultSettings 
              ? (apiSettings?.default_max_position_size || config.maxPosition)
              : config.maxPosition,
            minPositionSize: config.useDefaultSettings
              ? (apiSettings?.default_min_position_size || config.minPosition)
              : config.minPosition,
            rebalanceThreshold: config.rebalanceThreshold,
            targetCashAllocation: config.targetCashAllocation,
            includeTickers: selectedPositions.map(p => p.ticker),
            excludeTickers: positions
              .filter(p => !selectedPositions.find(sp => sp.ticker === p.symbol))
              .map(p => p.symbol), // Exclude deselected stocks
            skipOpportunityAgent: config.skipOpportunityAgent || config.skipThresholdCheck,
            skipThresholdCheck: config.skipThresholdCheck
          };
          
          // Call portfolio-manager edge function for rebalancing
          const { data, error } = await supabase.functions.invoke('portfolio-manager', {
            body: {
              userId: user?.id,
              targetAllocations,
              constraints,
              action: 'rebalance'
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
    
    {/* Rebalance Detail Modal (Demo) */}
    <RebalanceDetailModal
      isOpen={showRebalanceDetailModal}
      onClose={() => setShowRebalanceDetailModal(false)}
    />
    </>
  );
}