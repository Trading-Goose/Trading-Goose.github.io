import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownRight, Clock, CheckCircle, XCircle, TrendingUp, RefreshCw, Loader2, ExternalLink, FileText, BarChart3, Calendar, Package, ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getCachedSession } from "@/lib/cachedAuth";
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

  // Date filter states - default to today (using local date to avoid timezone issues)
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState<string>(todayString);

  // Helper to format date display
  const getDateDisplay = () => {
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (selectedDate === todayString) return "Today";
    if (selectedDate === yesterdayString) return "Yesterday";

    // Parse the date parts to avoid timezone issues
    const [year, month, day] = selectedDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Navigate date helper functions
  const navigateDate = (direction: 'prev' | 'next') => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const currentDate = new Date(year, month - 1, day);
    
    if (direction === 'prev') {
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const newDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
    setSelectedDate(newDateString);
  };

  const jumpToToday = () => {
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setSelectedDate(todayString);
  };

  // Fetch all trades from trading_actions table
  const fetchAllTrades = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      // Build date range for the selected date using local date parsing
      const [year, month, day] = selectedDate.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      // Get trading actions for this user within the selected date
      const { data, error } = await supabase
        .from('trading_actions')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        console.log('Raw trade data from database:', data);
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

  // Function to update Alpaca order status for approved orders using batch API
  const updateAlpacaOrderStatus = async () => {
    if (!user?.id || !apiSettings) return;

    try {
      // Get all approved and executed orders with Alpaca IDs in metadata
      // Include executed orders in case they need status updates (partial fills, etc.)
      const { data: approvedOrders, error } = await supabase
        .from('trading_actions')
        .select('id, metadata, status')
        .eq('user_id', user.id)
        .in('status', ['approved', 'executed']);

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
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/alpaca-batch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
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

  useEffect(() => {
    const hasCredentials = apiSettings?.alpaca_paper_api_key || apiSettings?.alpaca_live_api_key;

    // Always fetch trades from database
    fetchAllTrades();

    if (hasCredentials) {
      // Check Alpaca order status for approved orders
      console.log('Alpaca credentials detected, updating order status...');
      updateAlpacaOrderStatus();
    } else {
      console.log('No Alpaca credentials found, skipping order status update');
    }
  }, [apiSettings, user, selectedDate]); // Added selectedDate dependency

  // Periodically update Alpaca order status
  useEffect(() => {
    const hasCredentials = apiSettings?.alpaca_paper_api_key || apiSettings?.alpaca_live_api_key;

    if (!hasCredentials) return;

    const interval = setInterval(() => {
      console.log('Periodic order status update...');
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
    
    // Special handling for executed - look at Alpaca order status
    if (status === 'executed') {
      return allTrades.filter(trade => 
        trade.alpacaOrderStatus === 'filled' || 
        trade.alpacaOrderStatus === 'partially_filled'
      );
    }
    
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
                    // Use the same URL for both paper and live trading
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
            Trade History
          </CardTitle>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateDate('prev')}
              className="h-8 w-8 p-0 hover:bg-[#fc0]/10 hover:text-[#fc0]"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="px-3 min-w-[140px] hover:border-[#fc0] hover:bg-[#fc0]/10 hover:text-[#fc0] transition-all duration-200"
              onClick={jumpToToday}
            >
              <CalendarIcon className="h-4 w-4 mr-2" />
              {getDateDisplay()}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigateDate('next')}
              disabled={selectedDate === todayString}
              className="h-8 w-8 p-0 hover:bg-[#fc0]/10 hover:text-[#fc0] disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            
            <div className="ml-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
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
          </div>
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