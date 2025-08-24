import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownRight, Clock, CheckCircle, XCircle, TrendingUp, RefreshCw, Loader2, ExternalLink, FileText, BarChart3, Calendar, Package } from "lucide-react";
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

interface RebalanceGroup {
  id: string;
  createdAt: string;
  status: string;
  trades: TradeDecision[];
}

export default function TradeHistoryTable() {
  const [loading, setLoading] = useState(true);
  const [allTrades, setAllTrades] = useState<TradeDecision[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [selectedRebalanceId, setSelectedRebalanceId] = useState<string | null>(null);
  const [executingOrderId, setExecutingOrderId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const { apiSettings, user } = useAuth();
  const { toast } = useToast();

  // Fetch all trades from trading_actions table
  const fetchAllTrades = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Get all trading actions for this user
      const { data, error } = await supabase
        .from('trading_actions')
        .select('*')
        .eq('user_id', user.id)
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
        description: "Failed to load trade history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Function to update Alpaca order status for approved orders
  const updateAlpacaOrderStatus = async () => {
    if (!user?.id || !apiSettings) return;

    try {
      // Get all approved orders with Alpaca IDs in metadata
      const { data: approvedOrders, error } = await supabase
        .from('trading_actions')
        .select('id, metadata')
        .eq('user_id', user.id)
        .eq('status', 'approved');

      if (error || !approvedOrders || approvedOrders.length === 0) return;

      // Filter orders that have Alpaca order IDs
      const ordersWithAlpacaIds = approvedOrders.filter(o => o.metadata?.alpaca_order?.id);
      if (ordersWithAlpacaIds.length === 0) return;

      // Fetch current orders from Alpaca
      const alpacaOrders = await alpacaAPI.getOrders('all');

      // Update status for each order
      for (const order of ordersWithAlpacaIds) {
        const alpacaOrderId = order.metadata.alpaca_order.id;
        const alpacaOrder = alpacaOrders.find(o => o.id === alpacaOrderId);

        if (alpacaOrder) {
          // Update metadata with latest Alpaca order info
          const updatedMetadata = {
            ...order.metadata,
            alpaca_order: {
              ...order.metadata.alpaca_order,
              status: alpacaOrder.status,
              filled_qty: alpacaOrder.filled_qty ? parseFloat(alpacaOrder.filled_qty) : null,
              filled_avg_price: alpacaOrder.filled_avg_price ? parseFloat(alpacaOrder.filled_avg_price) : null,
              updated_at: new Date().toISOString()
            }
          };

          const updates: any = {
            metadata: updatedMetadata
          };

          // If order is filled, update execution details
          if (alpacaOrder.status === 'filled') {
            updates.status = 'executed';
            updates.executed_at = alpacaOrder.filled_at || new Date().toISOString();
          } else if (['canceled', 'rejected', 'expired'].includes(alpacaOrder.status)) {
            updates.status = 'rejected';
          }

          await supabase
            .from('trading_actions')
            .update(updates)
            .eq('id', order.id);
        }
      }

      // Refresh the trades
      fetchAllTrades();
    } catch (err) {
      console.error('Error updating Alpaca order status:', err);
    }
  };

  useEffect(() => {
    const hasCredentials = apiSettings?.alpaca_api_key;

    // Always fetch trades from database
    fetchAllTrades();

    if (hasCredentials) {
      // Check Alpaca order status for approved orders
      updateAlpacaOrderStatus();
    }
  }, [apiSettings, user]);

  // Periodically update Alpaca order status
  useEffect(() => {
    const hasCredentials = apiSettings?.alpaca_api_key;

    if (!hasCredentials) return;

    const interval = setInterval(() => {
      updateAlpacaOrderStatus();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
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

  const formatFullDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  // Filter trades by status
  const getFilteredTrades = (status?: string) => {
    if (!status || status === 'all') return allTrades;
    return allTrades.filter(trade => trade.status === status);
  };

  // Group trades by rebalance
  const groupTradesByRebalance = (trades: TradeDecision[]): (TradeDecision | RebalanceGroup)[] => {
    const rebalanceGroups = new Map<string, RebalanceGroup>();
    const standaloneTradesList: TradeDecision[] = [];

    trades.forEach(trade => {
      if (trade.rebalanceRequestId) {
        if (!rebalanceGroups.has(trade.rebalanceRequestId)) {
          rebalanceGroups.set(trade.rebalanceRequestId, {
            id: trade.rebalanceRequestId,
            createdAt: trade.createdAt,
            status: trade.status,
            trades: []
          });
        }
        rebalanceGroups.get(trade.rebalanceRequestId)!.trades.push(trade);
      } else {
        standaloneTradesList.push(trade);
      }
    });

    // Convert to array and sort chronologically (mixing both types)
    
    // Sort trades within each rebalance group
    Array.from(rebalanceGroups.values()).forEach(group => {
      group.trades.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });
    
    // Combine rebalance groups and standalone trades, then sort by creation time
    const rebalanceGroupsArray = Array.from(rebalanceGroups.values());
    const allItems: (TradeDecision | RebalanceGroup)[] = [...rebalanceGroupsArray, ...standaloneTradesList];
    
    // Sort all items by their creation time (newest first)
    allItems.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeB - timeA;
    });

    return allItems;
  };

  const renderTradeCard = (decision: TradeDecision, isInGroup = false) => {
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
        className={`p-3 rounded-lg border transition-colors flex flex-col gap-3 ${
          isInGroup ? 'border-l-2 border-l-border ml-4' : ''
        } ${getCardClasses()}`}
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
                {decision.alpacaFilledQty > 0 && decision.alpacaFilledPrice && (
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
                          {decision.alpacaFilledQty > 0 && status === 'partially_filled' && (
                            <span className="ml-1">({decision.alpacaFilledQty}/{decision.quantity})</span>
                          )}
                        </Badge>
                      );
                    })()}
                  </div>
                )}

                {/* Show filled details if available */}
                {decision.alpacaFilledQty > 0 && decision.alpacaFilledPrice && (
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

  const renderContent = (trades: TradeDecision[]) => {
    const groupedItems = groupTradesByRebalance(trades);

    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center p-12 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading trade history...</p>
        </div>
      );
    }

    if (groupedItems.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No trades found for this filter
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {groupedItems.map((item) => {
          // Check if it's a rebalance group
          if ('trades' in item) {
            const group = item as RebalanceGroup;
            return (
              <div key={`rebalance-${group.id}`} className="space-y-3">
                {/* Rebalance Group Header */}
                <div className="p-4 rounded-lg border border-border bg-card/50">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <span className="font-semibold">Rebalance Session</span>
                      <Badge variant="outline" className="text-xs">
                        {group.trades.length} trade{group.trades.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      {formatFullDate(group.createdAt)}
                    </div>
                  </div>
                  
                  {/* Rebalance Trades */}
                  <div className="space-y-3">
                    {group.trades.map(trade => renderTradeCard(trade, true))}
                  </div>
                </div>
              </div>
            );
          } else {
            // Standalone trade
            return renderTradeCard(item as TradeDecision);
          }
        })}
      </div>
    );
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Complete Trade History
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              fetchAllTrades();
              if (apiSettings) {
                updateAlpacaOrderStatus();
              }
            }}
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">
              <span className="sm:hidden">All</span>
              <span className="hidden sm:inline">All ({allTrades.length})</span>
            </TabsTrigger>
            <TabsTrigger value="pending">
              <span className="sm:hidden">Pending</span>
              <span className="hidden sm:inline">Pending ({getFilteredTrades('pending').length})</span>
            </TabsTrigger>
            <TabsTrigger value="approved">
              <span className="sm:hidden">Approved</span>
              <span className="hidden sm:inline">Approved ({getFilteredTrades('approved').length})</span>
            </TabsTrigger>
            <TabsTrigger value="executed">
              <span className="sm:hidden">Executed</span>
              <span className="hidden sm:inline">Executed ({getFilteredTrades('executed').length})</span>
            </TabsTrigger>
            <TabsTrigger value="rejected">
              <span className="sm:hidden">Rejected</span>
              <span className="hidden sm:inline">Rejected ({getFilteredTrades('rejected').length})</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="all" className="mt-6">
            {renderContent(getFilteredTrades('all'))}
          </TabsContent>
          
          <TabsContent value="pending" className="mt-6">
            {renderContent(getFilteredTrades('pending'))}
          </TabsContent>
          
          <TabsContent value="approved" className="mt-6">
            {renderContent(getFilteredTrades('approved'))}
          </TabsContent>
          
          <TabsContent value="executed" className="mt-6">
            {renderContent(getFilteredTrades('executed'))}
          </TabsContent>
          
          <TabsContent value="rejected" className="mt-6">
            {renderContent(getFilteredTrades('rejected'))}
          </TabsContent>
        </Tabs>
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