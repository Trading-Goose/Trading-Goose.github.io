import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, Clock, CheckCircle, XCircle, TrendingUp, RefreshCw, Loader2, ExternalLink, FileText, BarChart3 } from "lucide-react";
import { alpacaAPI } from "@/lib/alpaca";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import AnalysisDetailModal from "@/components/AnalysisDetailModal";
import RebalanceDetailModal from "@/components/RebalanceDetailModal";

interface TradeDecision {
  id: string;
  symbol: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  dollarAmount?: number;
  price: number;
  agent: string;
  timestamp: string;
  reasoning: string;
  totalValue: number;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  executedAt: string | null;
  sourceType: string;
  analysisId?: string;
  rebalanceRequestId?: string;
  alpacaOrderId?: string;
  alpacaOrderStatus?: string;
  alpacaFilledQty?: number;
  alpacaFilledPrice?: number;
  createdAt: string;
}

export default function RecentTrades() {
  const [loading, setLoading] = useState(true);
  const [allTrades, setAllTrades] = useState<TradeDecision[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [selectedRebalanceId, setSelectedRebalanceId] = useState<string | null>(null);
  const [executingOrderId, setExecutingOrderId] = useState<string | null>(null);
  const { apiSettings, user } = useAuth();
  const { toast } = useToast();

  // Fetch recent trades from trading_actions table (last 48 hours for dashboard widget)
  const fetchAllTrades = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Get recent trading actions (last 48 hours) for performance
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      
      const { data, error } = await supabase
        .from('trading_actions')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', twoDaysAgo.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const trades: TradeDecision[] = data.map(item => ({
          id: item.id,
          symbol: item.ticker,
          action: item.action as 'BUY' | 'SELL',
          quantity: Number(item.shares),
          dollarAmount: item.dollar_amount ? Number(item.dollar_amount) : undefined,
          price: Number(item.price),
          agent: item.agent || 'Trading Agent',
          timestamp: formatTimestamp(item.created_at),
          reasoning: item.reasoning || 'AI recommendation based on market analysis',
          totalValue: item.dollar_amount ? Number(item.dollar_amount) : Number(item.shares) * Number(item.price),
          status: item.status,
          executedAt: item.executed_at ? formatTimestamp(item.executed_at) : null,
          sourceType: item.source_type,
          analysisId: item.analysis_id,
          rebalanceRequestId: item.rebalance_request_id,
          alpacaOrderId: item.metadata?.alpaca_order?.id,
          alpacaOrderStatus: item.metadata?.alpaca_order?.status,
          alpacaFilledQty: item.metadata?.alpaca_order?.filled_qty ? Number(item.metadata.alpaca_order.filled_qty) : undefined,
          alpacaFilledPrice: item.metadata?.alpaca_order?.filled_avg_price ? Number(item.metadata.alpaca_order.filled_avg_price) : undefined,
          createdAt: item.created_at
        }));

        setAllTrades(trades);
      } else {
        setAllTrades([]);
      }
    } catch (error) {
      console.error('Error fetching trades:', error);
      toast({
        title: "Error",
        description: "Failed to load recent trades",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllTrades();
  }, [apiSettings, user]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleApproveDecision = async (decision: TradeDecision) => {
    setExecutingOrderId(decision.id);
    try {
      toast({
        title: "Executing Order",
        description: "Submitting order to Alpaca...",
      });

      // Call the edge function to execute the trade
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          tradeActionId: decision.id,
          action: 'approve'
        }
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Order Executed",
          description: `${decision.action} order for ${decision.symbol} has been submitted to Alpaca. Order ID: ${data.alpacaOrderId?.substring(0, 8)}...`,
        });

        // Refresh trades
        fetchAllTrades();
      } else {
        toast({
          title: "Order Failed",
          description: data.message || "Failed to execute order",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error('Error executing order:', err);
      toast({
        title: "Order Failed",
        description: err.message || 'Failed to execute order on Alpaca',
        variant: "destructive"
      });
    } finally {
      setExecutingOrderId(null);
    }
  };

  const handleRejectDecision = async (decision: TradeDecision) => {
    try {
      // Call the edge function to reject the trade
      const { error } = await supabase.functions.invoke('execute-trade', {
        body: {
          tradeActionId: decision.id,
          action: 'reject'
        }
      });

      if (error) throw error;

      toast({
        title: "Order Rejected",
        description: `${decision.action} order for ${decision.symbol} has been rejected.`,
      });

      // Refresh trades
      fetchAllTrades();
    } catch (err) {
      console.error('Error rejecting decision:', err);
      toast({
        title: "Failed to Reject",
        description: err instanceof Error ? err.message : 'Failed to reject decision',
        variant: "destructive"
      });
    }
  };

  // Already filtered in query, so use all trades directly
  const pendingTrades = allTrades.filter(t => t.status === 'pending');
  const otherTrades = allTrades.filter(t => t.status !== 'pending');

  const renderTradeCard = (decision: TradeDecision) => {
    const isPending = decision.status === 'pending';
    const isExecuted = decision.status === 'executed';
    const isApproved = decision.status === 'approved';
    const isRejected = decision.status === 'rejected';

    // Determine card background based on status and action
    const getCardClasses = () => {
      if (isPending) {
        return 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10';
      } else if (isExecuted) {
        if (decision.action === 'BUY') {
          return 'bg-green-500/5 border-green-500/20';
        } else if (decision.action === 'SELL') {
          return 'bg-red-500/5 border-red-500/20';
        }
      } else if (isApproved) {
        if (decision.action === 'BUY') {
          return 'bg-green-500/5 border-green-500/20';
        } else if (decision.action === 'SELL') {
          return 'bg-red-500/5 border-red-500/20';
        }
        return 'bg-gray-500/5 border-gray-500/20';
      } else if (isRejected) {
        return 'bg-gray-500/5 border-gray-500/20';
      }
      return 'bg-gray-500/5 border-gray-500/20';
    };

    return (
      <div
        key={decision.id}
        className={`p-3 rounded-lg border transition-colors flex flex-col gap-3 ${getCardClasses()}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3 flex-1">
            <div className={`p-2 rounded-full h-fit ${decision.action === 'BUY' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              {decision.action === 'BUY' ? (
                <ArrowUpRight className="h-4 w-4 text-green-500" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-red-500" />
              )}
            </div>

            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{decision.symbol}</span>
                <Badge 
                  variant={decision.action === 'BUY' ? 'buy' : decision.action === 'SELL' ? 'sell' : 'hold'} 
                  className="text-xs"
                >
                  {decision.action}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {decision.alpacaFilledQty && decision.alpacaFilledPrice
                    ? `${Number(decision.alpacaFilledQty).toFixed(2)} shares @ $${decision.alpacaFilledPrice.toFixed(2)}`
                    : decision.dollarAmount && decision.dollarAmount > 0
                      ? `$${Number(decision.dollarAmount).toLocaleString()} order`
                      : decision.quantity > 0
                        ? `${Number(decision.quantity).toFixed(2)} shares ${decision.price > 0 ? `@ $${decision.price.toFixed(2)}` : '(market price)'}`
                        : 'Order details pending'
                  }
                </span>
                {decision.alpacaFilledQty && decision.alpacaFilledPrice && (
                  <span className="text-xs font-medium">
                    ${(decision.alpacaFilledQty * decision.alpacaFilledPrice).toLocaleString()}
                  </span>
                )}
                {!decision.alpacaFilledQty && !decision.alpacaFilledPrice && decision.dollarAmount && decision.dollarAmount > 0 && (
                  <span className="text-xs font-medium">
                    ${Number(decision.dollarAmount).toLocaleString()}
                  </span>
                )}
                {!decision.alpacaFilledQty && !decision.dollarAmount && decision.price > 0 && (
                  <span className="text-xs font-medium">
                    ${decision.totalValue.toLocaleString()}
                  </span>
                )}
                {isRejected && (
                  <Badge variant="outline" className="text-xs">
                    <XCircle className="h-3 w-3 mr-1" />
                    rejected
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {decision.reasoning}
              </p>
            </div>
          </div>

          {/* Action buttons and details */}
          <div className="flex flex-col gap-1">
            {/* Analysis Detail Button */}
            {decision.analysisId && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs border-slate-700"
                onClick={() => setSelectedAnalysisId(decision.analysisId!)}
              >
                <FileText className="h-3 w-3 mr-1" />
                Analysis
              </Button>
            )}

            {/* Rebalance Detail Button */}
            {decision.rebalanceRequestId && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs border-slate-700"
                onClick={() => setSelectedRebalanceId(decision.rebalanceRequestId!)}
              >
                <BarChart3 className="h-3 w-3 mr-1" />
                Rebalance
              </Button>
            )}

            {/* Alpaca Order Link and Status */}
            {decision.alpacaOrderId && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs border-slate-700"
                  onClick={() => {
                    const isPaper = true; // Default to paper trading
                    const baseUrl = isPaper
                      ? 'https://paper.alpaca.markets'
                      : 'https://app.alpaca.markets';
                    window.open(`${baseUrl}/dashboard/order/${decision.alpacaOrderId}`, '_blank');
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Alpaca
                </Button>

                {/* Alpaca Order Status Badge */}
                {decision.alpacaOrderStatus && (
                  <div className="flex items-center justify-center">
                    {(() => {
                      const status = decision.alpacaOrderStatus.toLowerCase();
                      let variant: any = "outline";
                      let icon = null;
                      let displayText = decision.alpacaOrderStatus;
                      let customClasses = "";

                      if (status === 'filled') {
                        variant = "success";
                        icon = <CheckCircle className="h-3 w-3 mr-1" />;
                        displayText = "filled";
                      } else if (status === 'partially_filled') {
                        variant = "default";
                        icon = <Clock className="h-3 w-3 mr-1" />;
                        displayText = "partial filled";
                        customClasses = "bg-blue-500 text-white border-blue-500";
                      } else if (['new', 'pending_new', 'accepted'].includes(status)) {
                        variant = "warning";
                        icon = <Clock className="h-3 w-3 mr-1" />;
                        displayText = "placed";
                      } else if (['canceled', 'cancelled'].includes(status)) {
                        variant = "destructive";
                        icon = <XCircle className="h-3 w-3 mr-1" />;
                        displayText = "failed";
                      } else if (status === 'rejected') {
                        variant = "destructive";
                        icon = <XCircle className="h-3 w-3 mr-1" />;
                        displayText = "rejected";
                      }

                      return (
                        <Badge
                          variant={variant}
                          className={`text-xs ${customClasses}`}
                        >
                          {icon}
                          {displayText}
                          {decision.alpacaFilledQty && status === 'partially_filled' && (
                            <span className="ml-1">({decision.alpacaFilledQty}/{decision.quantity})</span>
                          )}
                        </Badge>
                      );
                    })()}
                  </div>
                )}

                {/* Show filled details if available */}
                {decision.alpacaFilledQty && decision.alpacaFilledPrice && (
                  <div className="text-xs text-muted-foreground text-center">
                    {Number(decision.alpacaFilledQty).toFixed(2)} @ ${Number(decision.alpacaFilledPrice || 0).toFixed(2)}
                  </div>
                )}
              </>
            )}

            {/* Only show action buttons for pending decisions */}
            {isPending && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs border-green-500/50 text-green-600 hover:bg-green-500/10 hover:border-green-500"
                  onClick={() => handleApproveDecision(decision)}
                  disabled={executingOrderId === decision.id}
                >
                  {executingOrderId === decision.id ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle className="h-3 w-3 mr-1" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs border-red-500/50 text-red-600 hover:bg-red-500/10 hover:border-red-500"
                  onClick={() => handleRejectDecision(decision)}
                  disabled={executingOrderId === decision.id}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>
        
        {/* Metadata - at bottom of card */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-slate-800 pt-2">
          {decision.agent && !decision.agent.toLowerCase().includes('portfolio') && (
            <>
              <span>{decision.agent}</span>
              <span>•</span>
            </>
          )}
          {decision.sourceType && (
            <>
              <span className="capitalize">{decision.sourceType.replace('_', ' ')}</span>
              <span>•</span>
            </>
          )}
          <span>{decision.timestamp}</span>
          {decision.executedAt && (
            <>
              <span>•</span>
              <span>Executed {decision.executedAt}</span>
            </>
          )}
          {decision.alpacaFilledPrice && decision.alpacaFilledQty && (
            <>
              <span>•</span>
              <span className="text-green-600">
                Filled: {Number(decision.alpacaFilledQty).toFixed(2)} @ ${Number(decision.alpacaFilledPrice || 0).toFixed(2)}
              </span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Recent Trading Activity
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => fetchAllTrades()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading recent trades...</p>
          </div>
        ) : allTrades.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No recent trading activity
          </div>
        ) : (
          <div className="space-y-3">
            {/* Show pending trades first */}
            {pendingTrades.map(trade => renderTradeCard(trade))}
            
            {/* Then show other recent trades */}
            {otherTrades.map(trade => renderTradeCard(trade))}
          </div>
        )}
      </CardContent>

      {/* Analysis Detail Modal */}
      {selectedAnalysisId && (
        <AnalysisDetailModal
          analysisId={selectedAnalysisId}
          isOpen={true}
          onClose={() => setSelectedAnalysisId(null)}
        />
      )}

      {/* Rebalance Detail Modal */}
      {selectedRebalanceId && (
        <RebalanceDetailModal
          rebalanceId={selectedRebalanceId}
          isOpen={true}
          onClose={() => setSelectedRebalanceId(null)}
        />
      )}
    </Card>
  );
}