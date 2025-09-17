import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, Clock, CheckCircle, XCircle, TrendingUp, RefreshCw, Loader2, ExternalLink, FileText, BarChart3 } from "lucide-react";
import { alpacaAPI } from "@/lib/alpaca";
import { useAuth, isSessionValid, hasAlpacaCredentials } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getCachedSession } from "@/lib/cachedAuth";
import { useToast } from "@/hooks/use-toast";
import AnalysisDetailModal from "@/components/AnalysisDetailModal";
import RebalanceDetailModal from "@/components/RebalanceDetailModal";

const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

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

function RecentTrades() {
  const [loading, setLoading] = useState(true);
  const [allTrades, setAllTrades] = useState<TradeDecision[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [selectedRebalanceId, setSelectedRebalanceId] = useState<string | null>(null);
  const [executingOrderId, setExecutingOrderId] = useState<string | null>(null);
  const { apiSettings, user, isAuthenticated } = useAuth();
  const hasAlpacaConfig = useMemo(() => hasAlpacaCredentials(apiSettings), [apiSettings]);
  const { toast } = useToast();

  // Fetch recent trades from trading_actions table (last 48 hours for dashboard widget)
  const fetchAllTrades = useCallback(async () => {
    if (!user?.id || !isAuthenticated || !isSessionValid()) {
      console.log('RecentTrades: Skipping fetch - session invalid or not authenticated');
      return;
    }

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
  }, [user?.id, isAuthenticated, toast]); // isSessionValid is a pure function, doesn't need to be in deps

  // Function to update Alpaca order status for approved orders using batch API
  const updateAlpacaOrderStatus = async () => {
    if (!user?.id || !apiSettings || !hasAlpacaConfig) return;

    try {
      // Get recent trading actions (last 48 hours) - same timeframe as displayed trades
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      // Get approved and executed orders with Alpaca IDs in metadata from last 48 hours
      // Include executed orders in case they need status updates (partial fills, etc.)
      const { data: approvedOrders, error } = await supabase
        .from('trading_actions')
        .select('id, metadata, status, created_at')
        .eq('user_id', user.id)
        .in('status', ['approved', 'executed'])
        .gte('created_at', twoDaysAgo.toISOString());

      if (error || !approvedOrders || approvedOrders.length === 0) {
        console.log('No approved orders found to update');
        return;
      }

      // Filter orders that have Alpaca order IDs
      const ordersWithAlpacaIds = approvedOrders.filter(o => o.metadata?.alpaca_order?.id);
      if (ordersWithAlpacaIds.length === 0) {
        console.log('No orders with Alpaca IDs found');
        return;
      }

      // Extract all Alpaca order IDs
      const alpacaOrderIds = ordersWithAlpacaIds.map(o => o.metadata.alpaca_order.id);
      console.log(`Fetching status for ${alpacaOrderIds.length} Alpaca orders:`, alpacaOrderIds);
      
      // Fetch all orders from Alpaca using batch API
      const session = await getCachedSession();
      if (!session?.access_token) {
        console.error('No access token available for Alpaca batch fetch');
        return;
      }

      const accessToken = session.access_token;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alpaca-batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderIds: alpacaOrderIds,
          includeOrders: true
        })
      });

      if (!response.ok) {
        console.error('Failed to fetch orders from Alpaca batch API');
        return;
      }

      const responseData = await response.json();
      console.log('Full response from alpaca-batch:', responseData);
      const alpacaOrders = responseData?.data?.orders || [];
      console.log(`Received ${alpacaOrders.length} orders from Alpaca:`, alpacaOrders);

      // Update status for each order
      let hasUpdates = false;
      for (const order of ordersWithAlpacaIds) {
        const alpacaOrderId = order.metadata.alpaca_order.id;
        const alpacaOrder = alpacaOrders.find((o: any) => o.id === alpacaOrderId);

        if (alpacaOrder) {
          console.log(`Found Alpaca order ${alpacaOrderId} with status: ${alpacaOrder.status}`);
          
          // Check if status has changed or if there's new fill information
          const currentAlpacaStatus = order.metadata?.alpaca_order?.status;
          const currentFilledQty = order.metadata?.alpaca_order?.filled_qty;
          const hasStatusChanged = currentAlpacaStatus !== alpacaOrder.status;
          const hasNewFillData = alpacaOrder.filled_qty && alpacaOrder.filled_qty !== currentFilledQty;
          
          // Always update if we don't have a status yet, or if something changed
          if (!currentAlpacaStatus || hasStatusChanged || hasNewFillData) {
            console.log(`Order ${alpacaOrderId} updating: current status "${currentAlpacaStatus}" -> new status "${alpacaOrder.status}"`);
            hasUpdates = true;
            
            // Build the alpaca_order object, only including defined values
            const alpacaOrderUpdate: any = {
              ...(order.metadata?.alpaca_order || {}),
              status: alpacaOrder.status,
              updated_at: new Date().toISOString()
            };
            
            // Only add filled_qty and filled_avg_price if they exist
            if (alpacaOrder.filled_qty) {
              alpacaOrderUpdate.filled_qty = parseFloat(alpacaOrder.filled_qty);
            }
            if (alpacaOrder.filled_avg_price) {
              alpacaOrderUpdate.filled_avg_price = parseFloat(alpacaOrder.filled_avg_price);
            }
            
            // Update metadata with latest Alpaca order info
            const updatedMetadata = {
              ...(order.metadata || {}),
              alpaca_order: alpacaOrderUpdate
            };

            const updates: any = {
              metadata: updatedMetadata
            };

            // If order is filled, update execution timestamp in metadata
            if (alpacaOrder.status === 'filled') {
              // Store execution details in metadata, not in main status field
              updates.executed_at = alpacaOrder.filled_at || new Date().toISOString();
              console.log(`Order ${alpacaOrderId} is filled, updating execution timestamp`);
            } else if (['canceled', 'cancelled', 'rejected', 'expired'].includes(alpacaOrder.status) && order.status === 'approved') {
              // Only update to rejected if it was approved before
              updates.status = 'rejected';
              console.log(`Marking order ${alpacaOrderId} as rejected due to Alpaca status: ${alpacaOrder.status}`);
            }

            console.log(`Updating order ${order.id} with:`, updates);
            const { data: updateData, error: updateError } = await supabase
              .from('trading_actions')
              .update(updates)
              .eq('id', order.id)
              .select();
              
            if (updateError) {
              console.error(`Failed to update order ${order.id}:`, updateError);
              console.error('Update payload was:', updates);
            } else {
              console.log(`Successfully updated order ${order.id}`, updateData);
            }
          } else {
            console.log(`Order ${alpacaOrderId} unchanged at status: ${currentAlpacaStatus}`);
          }
        } else {
          console.log(`No matching Alpaca order found for ${alpacaOrderId}`);
        }
      }

      // Refresh the trades after a short delay if we made updates
      if (hasUpdates) {
        console.log('Updates were made, refreshing trades...');
        setTimeout(() => {
          fetchAllTrades();
        }, 500);
      }
    } catch (err) {
      console.error('Error updating Alpaca order status:', err);
    }
  };

  // Track if we've already fetched for current user
  const fetchedRef = useRef<string>('');
  const lastFetchTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!user?.id || !isAuthenticated) {
      setAllTrades([]);
      setLoading(false);
      return;
    }

    const fetchKey = user.id;

    // Avoid duplicate fetches for the same user
    if (fetchedRef.current === fetchKey) {
      // Check if it's been more than 30 seconds since last fetch
      const now = Date.now();
      if (now - lastFetchTimeRef.current < 30000) {
        return;
      }
    }

    fetchedRef.current = fetchKey;
    lastFetchTimeRef.current = Date.now();

    // Add a small delay on initial mount to ensure session is settled
    const timeoutId = setTimeout(() => {
      fetchAllTrades();
      
      // Also update Alpaca order status if credentials exist
      if (hasAlpacaConfig) {
        console.log('Alpaca credentials detected, updating order status...');
        updateAlpacaOrderStatus();
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [user?.id, isAuthenticated, fetchAllTrades, apiSettings, hasAlpacaConfig]); // Include isAuthenticated and apiSettings in dependencies

  // Periodically update Alpaca order status
  useEffect(() => {
    if (!hasAlpacaConfig) return;

    const interval = setInterval(() => {
      console.log('Periodic order status update...');
      updateAlpacaOrderStatus();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [apiSettings, user, hasAlpacaConfig]);

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
    const isExecuted = decision.alpacaOrderStatus === 'filled' || decision.alpacaOrderStatus === 'partially_filled';
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
                {decision.alpacaFilledQty && decision.alpacaFilledPrice ? (
                  <span className="text-xs font-medium">
                    ${(decision.alpacaFilledQty * decision.alpacaFilledPrice).toLocaleString()}
                  </span>
                ) : null}
                {!decision.alpacaFilledQty && !decision.alpacaFilledPrice && decision.dollarAmount && decision.dollarAmount > 0 ? (
                  <span className="text-xs font-medium">
                    ${Number(decision.dollarAmount).toLocaleString()}
                  </span>
                ) : null}
                {!decision.alpacaFilledQty && !decision.dollarAmount && decision.price > 0 ? (
                  <span className="text-xs font-medium">
                    ${decision.totalValue.toLocaleString()}
                  </span>
                ) : null}
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
                    const baseUrl = 'https://app.alpaca.markets';
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
                      let customClasses = "";

                      // Display the actual Alpaca status directly
                      if (status === 'filled') {
                        variant = "success";
                        icon = <CheckCircle className="h-3 w-3 mr-1" />;
                      } else if (status === 'partially_filled') {
                        variant = "default";
                        icon = <Clock className="h-3 w-3 mr-1" />;
                        customClasses = "bg-blue-500 text-white border-blue-500";
                      } else if (['new', 'pending_new', 'accepted', 'pending_replace', 'pending_cancel'].includes(status)) {
                        variant = "warning";
                        icon = <Clock className="h-3 w-3 mr-1" />;
                      } else if (['canceled', 'cancelled', 'expired', 'replaced'].includes(status)) {
                        variant = "destructive";
                        icon = <XCircle className="h-3 w-3 mr-1" />;
                      } else if (status === 'rejected') {
                        variant = "destructive";
                        icon = <XCircle className="h-3 w-3 mr-1" />;
                      }

                      return (
                        <Badge
                          variant={variant}
                          className={`text-xs ${customClasses}`}
                        >
                          {icon}
                          {decision.alpacaOrderStatus}
                          {decision.alpacaFilledQty > 0 && status === 'partially_filled' && (
                            <span className="ml-1">({decision.alpacaFilledQty}/{decision.quantity})</span>
                          )}
                        </Badge>
                      );
                    })()}
                  </div>
                )}

                {/* Show filled details if available */}
                {decision.alpacaFilledQty && decision.alpacaFilledPrice ? (
                  <div className="text-xs text-muted-foreground text-center">
                    {Number(decision.alpacaFilledQty).toFixed(2)} @ ${Number(decision.alpacaFilledPrice || 0).toFixed(2)}
                  </div>
                ) : null}
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
          {decision.executedAt ? (
            <span>Executed {decision.executedAt}</span>
          ) : (
            <span>{decision.timestamp}</span>
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
            onClick={() => {
              fetchAllTrades();
              const hasCredentials = apiSettings?.alpaca_paper_api_key || apiSettings?.alpaca_live_api_key;
              if (hasCredentials) {
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

export default React.memo(RecentTrades);
