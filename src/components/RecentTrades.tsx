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

interface AIDecision {
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
}


export default function RecentTrades() {
  const [loading, setLoading] = useState(false);
  const [aiDecisions, setAiDecisions] = useState<AIDecision[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [selectedRebalanceId, setSelectedRebalanceId] = useState<string | null>(null);
  const [executingOrderId, setExecutingOrderId] = useState<string | null>(null);
  const { apiSettings, user } = useAuth();
  const { toast } = useToast();

  // Fetch trading history directly from Alpaca via edge functions
  const fetchAIDecisions = async () => {
    if (!user?.id) return;

    try {
      // Get recent orders from Alpaca (last 7 days of activity)
      const alpacaOrders = await alpacaAPI.getOrders('all').catch(err => {
        console.warn("Failed to get Alpaca orders:", err);
        // Check if it's a configuration error
        if (err.message?.includes('API settings not found') || err.message?.includes('not configured')) {
          console.log("Alpaca API not configured, showing empty trades");
          setAiDecisions([]);
          return [];
        }
        throw err;
      });

      // If we got an empty array due to configuration, just return
      if (!alpacaOrders || alpacaOrders.length === 0) {
        setAiDecisions([]);
        return;
      }

      // Filter to recent orders (last 48 hours)
      const fortyEightHoursAgo = new Date();
      fortyEightHoursAgo.setHours(fortyEightHoursAgo.getHours() - 48);

      const recentOrders = alpacaOrders.filter(order => {
        const orderDate = new Date(order.created_at);
        return orderDate > fortyEightHoursAgo;
      });

      // Fetch trading_actions from database - only include orders from last 48 hours
      const { data: tradingActions, error: tradingActionsError } = await supabase
        .from('trading_actions')
        .select('id, analysis_id, rebalance_request_id, alpaca_order_id, metadata, status, ticker, action, shares, price, dollar_amount, reasoning, created_at, source_type')
        .eq('user_id', user.id)
        .gte('created_at', fortyEightHoursAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(50);

      console.log('Trading actions query result:', { tradingActions, tradingActionsError });
      console.log('Current user context:', { 
        userId: user?.id, 
        userEmail: user?.email,
        supabaseSession: (await supabase.auth.getSession()).data.session?.user?.id
      });
      
      if (tradingActionsError) {
        console.error('Error fetching trading actions:', tradingActionsError);
        console.log('Error details:', {
          message: tradingActionsError.message,
          details: tradingActionsError.details,
          hint: tradingActionsError.hint,
          code: tradingActionsError.code
        });
        console.log('Will proceed without trading actions data');
      }
      
      if (tradingActions) {
        console.log('All trading actions with alpaca_order_id:', tradingActions.filter(a => a.alpaca_order_id));
        console.log('All trading actions with analysis_id:', tradingActions.filter(a => a.analysis_id));
      }

      // Create a map of alpaca order ID to trading action
      const alpacaOrderMap = new Map();
      if (tradingActions) {
        tradingActions.forEach(action => {
          // Try both alpaca_order_id field and metadata->alpaca_order->id
          const alpacaOrderId = action.alpaca_order_id || action.metadata?.alpaca_order?.id;
          console.log('Processing trading action:', { 
            action, 
            alpacaOrderId, 
            alpaca_order_id_field: action.alpaca_order_id,
            metadata_alpaca_id: action.metadata?.alpaca_order?.id 
          });
          if (alpacaOrderId) {
            alpacaOrderMap.set(alpacaOrderId, action);
          }
        });
      }
      console.log('Alpaca order map:', alpacaOrderMap);

      // Convert Alpaca orders to AIDecision format
      const decisions: AIDecision[] = recentOrders.map(order => {
        // Use filled quantity if available, otherwise use order quantity
        const quantity = parseFloat(order.filled_qty || order.qty || '0');
        
        // For price, prioritize filled price, then limit price, then 0 for market orders
        let price = 0;
        if (order.filled_avg_price && parseFloat(order.filled_avg_price) > 0) {
          price = parseFloat(order.filled_avg_price);
        } else if (order.limit_price && parseFloat(order.limit_price) > 0) {
          price = parseFloat(order.limit_price);
        }
        
        const totalValue = quantity * price;

        // Map Alpaca status to our status
        let status: 'pending' | 'approved' | 'rejected' | 'executed';
        if (['new', 'pending_new', 'accepted', 'pending_cancel', 'pending_replace'].includes(order.status)) {
          status = 'approved'; // Order is placed/active
        } else if (['filled', 'partially_filled'].includes(order.status)) {
          status = 'executed'; // Order was filled
        } else if (['canceled', 'expired', 'rejected'].includes(order.status)) {
          status = 'rejected'; // Order was cancelled/rejected
        } else {
          status = 'pending'; // Unknown status, default to pending
        }

        // Get trading action data if available
        const tradingAction = alpacaOrderMap.get(order.id);
        console.log(`Order ${order.id} - trading action:`, tradingAction);
        console.log(`Available Alpaca Order IDs in map:`, Array.from(alpacaOrderMap.keys()));
        console.log(`Looking for order ID: ${order.id}`);

        const decision = {
          id: order.id,
          symbol: order.symbol,
          action: order.side.toUpperCase() as 'BUY' | 'SELL' | 'HOLD',
          quantity: parseFloat(order.qty || '0'), // Always show original order quantity
          dollarAmount: totalValue > 0 ? totalValue : undefined,
          price: price,
          agent: 'Alpaca Trading',
          timestamp: formatTimestamp(order.created_at),
          reasoning: `${order.type} ${order.side} order via Alpaca${order.time_in_force ? ` (${order.time_in_force})` : ''}`,
          totalValue: totalValue,
          status: status,
          executedAt: order.filled_at ? formatTimestamp(order.filled_at) : null,
          sourceType: 'alpaca_order',
          analysisId: tradingAction?.analysis_id || undefined,
          rebalanceRequestId: tradingAction?.rebalance_request_id || undefined,
          alpacaOrderId: order.id,
          alpacaOrderStatus: order.status,
          alpacaFilledQty: parseFloat(order.filled_qty || '0'),
          alpacaFilledPrice: parseFloat(order.filled_avg_price || '0')
        };
        
        console.log(`Decision for ${order.id}:`, { 
          analysisId: decision.analysisId, 
          rebalanceRequestId: decision.rebalanceRequestId 
        });
        
        return decision;
      });

      // Add trade orders from database that don't have Alpaca orders yet
      const dbTradeOrders: AIDecision[] = [];
      if (tradingActions) {
        tradingActions.forEach(action => {
          // Skip if this action already has an alpaca order (it's already in the decisions list)
          const hasAlpacaOrder = action.alpaca_order_id || action.metadata?.alpaca_order?.id;
          if (hasAlpacaOrder) return;
          
          // Include pending and rejected orders (rejected orders should still be visible)
          if (!['pending', 'rejected'].includes(action.status)) return;
          
          const dbDecision: AIDecision = {
            id: action.id,
            symbol: action.ticker,
            action: action.action.toUpperCase() as 'BUY' | 'SELL',
            quantity: parseFloat(action.shares || '0'),
            dollarAmount: parseFloat(action.dollar_amount || '0'),
            price: parseFloat(action.price || '0'),
            agent: 'Portfolio Manager',
            timestamp: formatTimestamp(action.created_at),
            reasoning: action.reasoning || `${action.action} order created by Portfolio Manager`,
            totalValue: parseFloat(action.dollar_amount || '0'),
            status: action.status as 'pending' | 'approved' | 'rejected' | 'executed',
            executedAt: null,
            sourceType: action.source_type || 'individual_analysis',
            analysisId: action.analysis_id || undefined,
            rebalanceRequestId: action.rebalance_request_id || undefined,
            alpacaOrderId: undefined,
            alpacaOrderStatus: undefined,
            alpacaFilledQty: 0,
            alpacaFilledPrice: 0
          };
          
          dbTradeOrders.push(dbDecision);
        });
      }

      // Combine Alpaca orders with database trade orders
      const allDecisions = [...decisions, ...dbTradeOrders];
      
      // Sort by created date (newest first)
      allDecisions.sort((a, b) => {
        // For Alpaca orders, use the alpaca order creation time
        const aOrder = alpacaOrders.find(o => o.id === a.id);
        const bOrder = alpacaOrders.find(o => o.id === b.id);
        
        let aTime: Date;
        let bTime: Date;
        
        if (aOrder) {
          aTime = new Date(aOrder.created_at);
        } else {
          // For trade actions, find the corresponding action
          const aAction = tradingActions?.find(action => action.id === a.id);
          aTime = new Date(aAction?.created_at || 0);
        }
        
        if (bOrder) {
          bTime = new Date(bOrder.created_at);
        } else {
          // For trade actions, find the corresponding action
          const bAction = tradingActions?.find(action => action.id === b.id);
          bTime = new Date(bAction?.created_at || 0);
        }
        
        return bTime.getTime() - aTime.getTime();
      });

      setAiDecisions(allDecisions);
    } catch (error) {
      console.error('Error fetching trading history from Alpaca:', error);
      setAiDecisions([]);
    }
  };


  // Since we're fetching directly from Alpaca, we don't need to update statuses separately
  // The data is always fresh from the source

  useEffect(() => {
    // Fetch trading history from Alpaca
    fetchAIDecisions();
  }, [user]);

  // Periodically refresh data from Alpaca
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      // Refresh trading history from Alpaca
      fetchAIDecisions();
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [user]);

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

  const handleApproveDecision = async (decision: AIDecision) => {
    setExecutingOrderId(decision.id);
    try {
      toast({
        title: "Executing Order",
        description: "Submitting order to Alpaca...",
      });

      // For pending orders from database, use the trading action ID
      // For Alpaca orders, this should already be handled differently
      const isDbOrder = decision.sourceType !== 'alpaca_order' && !decision.alpacaOrderId;
      
      if (isDbOrder) {
        // Call the edge function to execute the trade using the trading_actions ID
        const { data, error } = await supabase.functions.invoke('execute-trade', {
          body: {
            tradeActionId: decision.id,  // This is the trading_actions.id
            action: 'approve'
          }
        });

        if (error) throw error;

        if (data.success) {
          toast({
            title: "Order Executed",
            description: `${decision.action} order for ${decision.symbol} has been submitted to Alpaca${data.alpacaOrderId ? `. Order ID: ${data.alpacaOrderId.substring(0, 8)}...` : ''}`,
          });
        } else {
          toast({
            title: "Order Failed",
            description: data.message || "Failed to execute order",
            variant: "destructive",
          });
        }
      } else {
        // This is an existing Alpaca order - shouldn't normally happen for pending orders
        toast({
          title: "Order Status",
          description: "This order is already with Alpaca",
          variant: "destructive",
        });
      }

      // Refresh AI decisions to get updated status
      fetchAIDecisions();
    } catch (err: any) {
      console.error('Error executing order:', err);
      toast({
        title: "Order Failed",
        description: err.message || 'Failed to execute order on Alpaca',
        variant: "destructive"
      });

      fetchAIDecisions();
    } finally {
      setExecutingOrderId(null);
    }
  };

  // Poll Alpaca order status
  const pollAlpacaOrderStatus = async (decisionId: string) => {
    let attempts = 0;
    const maxAttempts = 12; // Poll for up to 1 minute

    const pollInterval = setInterval(async () => {
      attempts++;

      try {
        // Fetch updated trade order from database
        const { data: tradeOrder, error } = await supabase
          .from('trading_actions')
          .select('*')
          .eq('id', decisionId)
          .eq('user_id', user?.id)
          .single();

        if (!error && tradeOrder) {
          // Update local state
          setAiDecisions(prev => prev.map(d => {
            if (d.id === decisionId) {
              return {
                ...d,
                alpacaOrderStatus: tradeOrder.metadata?.alpaca_order?.status,
                alpacaFilledQty: tradeOrder.metadata?.alpaca_order?.filled_qty,
                alpacaFilledPrice: tradeOrder.metadata?.alpaca_order?.filled_avg_price,
                status: tradeOrder.status
              };
            }
            return d;
          }));

          // Check if order reached terminal state
          const alpacaStatus = tradeOrder.metadata?.alpaca_order?.status;
          if (alpacaStatus && ['filled', 'canceled', 'rejected', 'expired'].includes(alpacaStatus)) {
            clearInterval(pollInterval);

            if (alpacaStatus === 'filled') {
              const filledPrice = tradeOrder.metadata?.alpaca_order?.filled_avg_price;
              const filledQty = tradeOrder.metadata?.alpaca_order?.filled_qty;
              toast({
                title: "Order Filled",
                description: `${tradeOrder.ticker} order filled at $${Number(filledPrice || 0).toFixed(2)} for ${filledQty} shares`,
              });
            } else if (['canceled', 'rejected', 'expired'].includes(alpacaStatus)) {
              toast({
                title: "Order Not Filled",
                description: `${tradeOrder.ticker} order was ${alpacaStatus}`,
                variant: "destructive",
              });
            }
          }
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Error polling order status:', err);
        clearInterval(pollInterval);
      }
    }, 5000);
  };

  const handleRejectDecision = async (decision: AIDecision) => {
    try {
      // For pending orders from database, use the trading action ID
      const isDbOrder = decision.sourceType !== 'alpaca_order' && !decision.alpacaOrderId;
      
      if (isDbOrder) {
        // Call the edge function to reject the trade using the trading_actions ID
        const { data, error } = await supabase.functions.invoke('execute-trade', {
          body: {
            tradeActionId: decision.id,  // This is the trading_actions.id
            action: 'reject'
          }
        });

        if (error) throw error;

        toast({
          title: "Order Rejected",
          description: `${decision.action} order for ${decision.symbol} has been rejected.`,
        });
      } else {
        // This is an existing Alpaca order - shouldn't normally happen for pending orders
        toast({
          title: "Cannot Reject",
          description: "This order is already with Alpaca and cannot be rejected from here",
          variant: "destructive",
        });
      }

      // Refresh AI decisions
      fetchAIDecisions();
    } catch (err) {
      console.error('Error rejecting decision:', err);
      toast({
        title: "Failed to Reject",
        description: err instanceof Error ? err.message : 'Failed to reject decision',
        variant: "destructive"
      });
    }
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
              fetchAIDecisions();
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
      <CardContent className="space-y-3">
        {/* AI Decisions Section */}
        {aiDecisions.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              AI Trading Decisions
            </div>
            {/* Group and sort decisions */}
            {(() => {
              const pendingDecisions = aiDecisions.filter(d => d.status === 'pending');
              const processedDecisions = aiDecisions.filter(d => d.status === 'approved' || d.status === 'rejected');
              const executedDecisions = aiDecisions.filter(d => d.status === 'executed');

              return (
                <>
                  {/* Pending Decisions */}
                  {pendingDecisions.length > 0 && (
                    <>
                      {pendingDecisions.map((decision) => {
                        const isPending = decision.status === 'pending';
                        const isExecuted = decision.status === 'executed';
                        const isApproved = decision.status === 'approved';
                        const isRejected = decision.status === 'rejected';

                        return (
                          <div
                            key={decision.id}
                            className={`p-3 rounded-lg border transition-colors flex flex-col gap-3 ${isPending
                              ? 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10'
                              : 'bg-gray-500/5 border-gray-500/20'
                              }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex gap-3 flex-1">
                                <div className={`p-2 rounded-full h-fit ${decision.action === 'BUY' ? 'bg-green-500/10' : 'bg-red-500/10'
                                  }`}>
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
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {decision.reasoning}
                                  </p>
                                </div>
                              </div>

                              {/* Action buttons and details */}
                              <div className="flex flex-col gap-1">
                                {/* Analysis Detail Button - shown for all statuses */}
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

                                {/* Rebalance Detail Button - shown for all statuses */}
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

                                {/* Alpaca Order Link */}
                                {decision.alpacaOrderId && (
                                  <div className="text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <ExternalLink className="h-3 w-3" />
                                      Order: {decision.alpacaOrderId.substring(0, 8)}...
                                    </div>
                                    {decision.alpacaOrderStatus && (
                                      <Badge variant="outline" className="text-xs mt-1">
                                        {decision.alpacaOrderStatus}
                                      </Badge>
                                    )}
                                    {decision.alpacaFilledQty && (
                                      <div className="mt-1">
                                        Filled: {Number(decision.alpacaFilledQty).toFixed(2)} @ ${Number(decision.alpacaFilledPrice || 0).toFixed(2)}
                                      </div>
                                    )}
                                  </div>
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
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Processed (Approved/Rejected) Decisions */}
                  {processedDecisions.length > 0 && (
                    <>
                      {pendingDecisions.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-3 mb-2">Processed</div>
                      )}
                      {processedDecisions.map((decision) => {
                        const isPending = decision.status === 'pending';
                        const isExecuted = decision.status === 'executed';
                        const isApproved = decision.status === 'approved';
                        const isRejected = decision.status === 'rejected';

                        // Determine card background based on status and action
                        const getCardClasses = () => {
                          if (isApproved) {
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
                                <div className={`p-2 rounded-full h-fit ${decision.action === 'BUY' ? 'bg-green-500/10' : 'bg-red-500/10'
                                  }`}>
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

                              {/* Analysis and Order details */}
                              <div className="flex flex-col gap-1">
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

                                {/* Alpaca Order Link */}
                                {decision.alpacaOrderId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs border-slate-700"
                                    onClick={() => {
                                      // Default to paper trading if apiSettings is not available
                                      const isPaper = apiSettings?.alpaca_paper_trading ?? true;
                                      const baseUrl = isPaper
                                        ? 'https://paper.alpaca.markets'
                                        : 'https://app.alpaca.markets';
                                      window.open(`${baseUrl}/dashboard/order/${decision.alpacaOrderId}`, '_blank');
                                    }}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Alpaca
                                  </Button>
                                )}

                                {/* Alpaca Order Status Badge */}
                                {decision.alpacaOrderId && decision.alpacaOrderStatus && (
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
                      })}
                    </>
                  )}

                  {/* Executed Decisions */}
                  {executedDecisions.length > 0 && (
                    <>
                      {(pendingDecisions.length > 0 || processedDecisions.length > 0) && (
                        <div className="text-xs text-muted-foreground mt-3 mb-2">Executed</div>
                      )}
                      {executedDecisions.map((decision) => {
                        const isExecuted = decision.status === 'executed';

                        return (
                          <div
                            key={decision.id}
                            className={`p-3 rounded-lg border transition-colors flex flex-col gap-3 ${
                              decision.action === 'BUY' 
                                ? 'bg-green-500/5 border-green-500/20'
                                : 'bg-red-500/5 border-red-500/20'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex gap-3 flex-1">
                                <div className={`p-2 rounded-full h-fit ${decision.action === 'BUY' ? 'bg-green-500/10' : 'bg-red-500/10'
                                  }`}>
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
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {decision.reasoning}
                                  </p>
                                </div>
                              </div>

                              {/* Analysis and Order details */}
                              <div className="flex flex-col gap-1">
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

                                {/* Alpaca Order Link */}
                                {decision.alpacaOrderId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs border-slate-700"
                                    onClick={() => {
                                      // Default to paper trading if apiSettings is not available
                                      const isPaper = apiSettings?.alpaca_paper_trading ?? true;
                                      const baseUrl = isPaper
                                        ? 'https://paper.alpaca.markets'
                                        : 'https://app.alpaca.markets';
                                      window.open(`${baseUrl}/dashboard/order/${decision.alpacaOrderId}`, '_blank');
                                    }}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Alpaca
                                  </Button>
                                )}

                                {/* Alpaca Order Status Badge */}
                                {decision.alpacaOrderId && decision.alpacaOrderStatus && (
                                  <div className="flex items-center justify-center">
                                    {(() => {
                                      const status = decision.alpacaOrderStatus.toLowerCase();
                                      let variant: any = "success";
                                      let icon = <CheckCircle className="h-3 w-3 mr-1" />;
                                      let displayText = "Filled";

                                      // For executed decisions, show filled status
                                      if (status === 'filled') {
                                        variant = "success";
                                        icon = <CheckCircle className="h-3 w-3 mr-1" />;
                                        displayText = "filled";
                                      } else if (status === 'partially_filled') {
                                        variant = "default";
                                        icon = <Clock className="h-3 w-3 mr-1" />;
                                        displayText = "partial filled";
                                      }

                                      return (
                                        <Badge
                                          variant={variant}
                                          className={`text-xs ${status === 'partially_filled' ? 'bg-blue-500 text-white border-blue-500' : ''}`}
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
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Empty State */}
        {!loading && aiDecisions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No recent trading activity
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