import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, Clock, CheckCircle, XCircle, TrendingUp, RefreshCw, Loader2, ExternalLink, FileText } from "lucide-react";
import { alpacaAPI } from "@/lib/alpaca";
import { useAuth } from "@/lib/auth-supabase";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import AnalysisDetailModal from "@/components/AnalysisDetailModal";

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
  alpacaOrderId?: string;
  alpacaOrderStatus?: string;
  alpacaFilledQty?: number;
  alpacaFilledPrice?: number;
}


export default function RecentTrades() {
  const [loading, setLoading] = useState(false);
  const [aiDecisions, setAiDecisions] = useState<AIDecision[]>([]);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [executingOrderId, setExecutingOrderId] = useState<string | null>(null);
  const { apiSettings, user } = useAuth();
  const { toast } = useToast();

  // Fetch AI decisions from trading_actions table
  const fetchAIDecisions = async () => {
    if (!user?.id) return;

    try {
      // Get all recent trading actions (not just pending)
      const { data, error } = await supabase
        .from('trading_actions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      if (data && data.length > 0) {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        
        // Filter decisions: show all pending, or approved/rejected within 3 days
        const filteredData = data.filter(item => {
          if (item.status === 'pending') return true;
          const createdDate = new Date(item.created_at);
          return createdDate > threeDaysAgo;
        });

        const decisions: AIDecision[] = filteredData.map(item => ({
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
          alpacaOrderId: item.metadata?.alpaca_order?.id,
          alpacaOrderStatus: item.metadata?.alpaca_order?.status,
          alpacaFilledQty: item.metadata?.alpaca_order?.filled_qty ? Number(item.metadata.alpaca_order.filled_qty) : undefined,
          alpacaFilledPrice: item.metadata?.alpaca_order?.filled_avg_price ? Number(item.metadata.alpaca_order.filled_avg_price) : undefined
        }));

        setAiDecisions(decisions);
      } else {
        setAiDecisions([]);
      }
    } catch (error) {
      console.error('Error fetching AI decisions:', error);
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
      
      // Refresh the decisions
      fetchAIDecisions();
    } catch (err) {
      console.error('Error updating Alpaca order status:', err);
    }
  };

  useEffect(() => {
    const hasCredentials = apiSettings?.alpaca_paper_api_key || apiSettings?.alpaca_live_api_key;
    
    // Always fetch AI decisions from database
    fetchAIDecisions();
    
    if (hasCredentials) {
      // Check Alpaca order status for approved orders
      updateAlpacaOrderStatus();
    }
  }, [apiSettings, user]);
  
  // Periodically update Alpaca order status
  useEffect(() => {
    const hasCredentials = apiSettings?.alpaca_paper_api_key || apiSettings?.alpaca_live_api_key;
    
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

  const handleApproveDecision = async (decision: AIDecision) => {
    setExecutingOrderId(decision.id);
    try {
      toast({
        title: "Executing Order",
        description: "Submitting order to Alpaca...",
      });

      // Call the edge function to execute the trade
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          analysisId: decision.analysisId,
          action: 'approve'
        }
      });

      if (error) throw error;

      if (data.success) {
        // Update local state with the Alpaca order info
        const updatedDecision = {
          ...decision,
          status: 'approved' as const,
          alpacaOrderId: data.alpacaOrderId,
          alpacaOrderStatus: data.alpacaStatus
        };
        
        // Update the local decisions array
        setAiDecisions(prev => prev.map(d => 
          d.id === decision.id ? updatedDecision : d
        ));

        toast({
          title: "Order Executed",
          description: `${decision.action} order for ${decision.symbol} has been submitted to Alpaca. Order ID: ${data.alpacaOrderId?.substring(0, 8)}...`,
        });
        
        // Start polling for order status updates
        if (data.alpacaOrderId) {
          pollAlpacaOrderStatus(decision.id);
        }
      } else {
        toast({
          title: "Order Failed",
          description: data.message || "Failed to execute order",
          variant: "destructive",
        });
      }
      
      // Refresh AI decisions
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
                description: `${tradeOrder.ticker} order filled at $${filledPrice?.toFixed(2)} for ${filledQty} shares`,
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
      // Update the status in database to 'rejected'
      const { error: updateError } = await supabase
        .from('trading_actions')
        .update({ status: 'rejected' })
        .eq('id', decision.id);

      if (updateError) throw updateError;

      // Refresh AI decisions
      fetchAIDecisions();
    } catch (err) {
      console.error('Error rejecting decision:', err);
      alert('Failed to reject decision: ' + (err instanceof Error ? err.message : 'Unknown error'));
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
              fetchOrders();
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
                  className={`p-3 rounded-lg border transition-colors ${
                    isPending 
                      ? 'bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10' 
                      : isExecuted
                      ? 'bg-green-500/5 border-green-500/20'
                      : isApproved
                      ? 'bg-yellow-500/5 border-yellow-500/20'
                      : 'bg-gray-500/5 border-gray-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3 flex-1">
                      <div className={`p-2 rounded-full h-fit ${
                        decision.action === 'BUY' ? 'bg-green-500/10' : 'bg-red-500/10'
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
                          <Badge variant={decision.action === 'BUY' ? 'secondary' : 'destructive'} className="text-xs">
                            {decision.action}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {decision.dollarAmount && decision.dollarAmount > 0
                              ? `$${decision.dollarAmount.toFixed(2)} order`
                              : decision.quantity > 0
                                ? `${decision.quantity} shares ${decision.price > 0 ? `@ $${decision.price}` : '(market price)'}`
                                : 'Order details pending'
                            }
                          </span>
                          {decision.price > 0 && (
                            <span className="text-xs font-medium">
                              ${decision.totalValue.toLocaleString()}
                            </span>
                          )}
                          {/* Status Badge */}
                          {isExecuted && (
                            <Badge variant="success" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Executed
                            </Badge>
                          )}
                          {isApproved && (
                            <Badge variant="outline" className="text-xs text-yellow-600">
                              <Clock className="h-3 w-3 mr-1" />
                              Approved
                            </Badge>
                          )}
                          {isRejected && (
                            <Badge variant="outline" className="text-xs text-gray-600">
                              <XCircle className="h-3 w-3 mr-1" />
                              Rejected
                            </Badge>
                          )}
                          {isPending && (
                            <Badge variant="outline" className="text-xs text-blue-600">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {decision.reasoning}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                    </div>

                    {/* Action buttons and details */}
                    <div className="flex flex-col gap-1">
                      {/* Analysis Detail Button */}
                      {decision.analysisId && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 px-3 text-xs"
                          onClick={() => setSelectedAnalysisId(decision.analysisId!)}
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          Analysis
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
                              Filled: {decision.alpacaFilledQty} @ ${decision.alpacaFilledPrice?.toFixed(2)}
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
                        
                        return (
                          <div
                            key={decision.id}
                            className={`p-3 rounded-lg border transition-colors ${
                              isPending 
                                ? 'bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10' 
                                : isExecuted
                                ? 'bg-green-500/5 border-green-500/20'
                                : isApproved
                                ? 'bg-yellow-500/5 border-yellow-500/20'
                                : 'bg-gray-500/5 border-gray-500/20'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex gap-3 flex-1">
                                <div className={`p-2 rounded-full h-fit ${
                                  decision.action === 'BUY' ? 'bg-green-500/10' : 'bg-red-500/10'
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
                                    <Badge variant={decision.action === 'BUY' ? 'secondary' : 'destructive'} className="text-xs">
                                      {decision.action}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {decision.dollarAmount && decision.dollarAmount > 0
                                        ? `$${decision.dollarAmount.toFixed(2)} order`
                                        : decision.quantity > 0
                                          ? `${decision.quantity} shares ${decision.price > 0 ? `@ $${decision.price}` : '(market price)'}`
                                          : 'Order details pending'
                                      }
                                    </span>
                                    {decision.price > 0 && (
                                      <span className="text-xs font-medium">
                                        ${decision.totalValue.toLocaleString()}
                                      </span>
                                    )}
                                    {/* Status Badge */}
                                    {isApproved && (
                                      <>
                                        <Badge variant="outline" className="text-xs text-yellow-600">
                                          <Clock className="h-3 w-3 mr-1" />
                                          Approved
                                        </Badge>
                                        {decision.alpacaOrderStatus && (
                                          <Badge 
                                            variant={decision.alpacaOrderStatus === 'filled' ? 'success' : 
                                                    decision.alpacaOrderStatus === 'rejected' || decision.alpacaOrderStatus === 'canceled' ? 'destructive' : 
                                                    'outline'}
                                            className="text-xs"
                                          >
                                            {decision.alpacaOrderStatus === 'filled' ? (
                                              <><CheckCircle className="h-3 w-3 mr-1" />Filled</>
                                            ) : decision.alpacaOrderStatus === 'pending_new' || decision.alpacaOrderStatus === 'new' ? (
                                              <><Clock className="h-3 w-3 mr-1" />Placed</>
                                            ) : decision.alpacaOrderStatus === 'partially_filled' ? (
                                              <><Clock className="h-3 w-3 mr-1" />Partial</>
                                            ) : decision.alpacaOrderStatus === 'canceled' || decision.alpacaOrderStatus === 'rejected' ? (
                                              <><XCircle className="h-3 w-3 mr-1" />{decision.alpacaOrderStatus}</>
                                            ) : (
                                              decision.alpacaOrderStatus
                                            )}
                                          </Badge>
                                        )}
                                      </>
                                    )}
                                    {isRejected && (
                                      <Badge variant="outline" className="text-xs text-gray-600">
                                        <XCircle className="h-3 w-3 mr-1" />
                                        Rejected
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {decision.reasoning}
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                                          Filled: {decision.alpacaFilledQty} @ ${decision.alpacaFilledPrice.toFixed(2)}
                                        </span>
                                      </>
                                    )}
                                  </div>
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
                                
                                {/* Alpaca Order Link */}
                                {decision.alpacaOrderId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs border-slate-700"
                                    onClick={() => {
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
                                      
                                      if (status === 'filled') {
                                        variant = "success";
                                        icon = <CheckCircle className="h-3 w-3 mr-1" />;
                                        displayText = "Filled";
                                      } else if (status === 'partially_filled') {
                                        variant = "secondary";
                                        icon = <Clock className="h-3 w-3 mr-1" />;
                                        displayText = "Partial";
                                      } else if (['new', 'pending_new', 'accepted'].includes(status)) {
                                        variant = "outline";
                                        icon = <Clock className="h-3 w-3 mr-1" />;
                                        displayText = "Placed";
                                      } else if (['canceled', 'cancelled'].includes(status)) {
                                        variant = "outline";
                                        displayText = "Cancelled";
                                      } else if (status === 'rejected') {
                                        variant = "destructive";
                                        icon = <XCircle className="h-3 w-3 mr-1" />;
                                        displayText = "Rejected";
                                      }
                                      
                                      return (
                                        <Badge 
                                          variant={variant} 
                                          className={`text-xs ${
                                            status === 'filled' ? 'text-green-600' : 
                                            status === 'partially_filled' ? 'text-blue-600' :
                                            ['new', 'pending_new', 'accepted'].includes(status) ? 'text-yellow-600' :
                                            ['canceled', 'cancelled'].includes(status) ? 'text-gray-600' :
                                            status === 'rejected' ? 'text-red-600' : ''
                                          }`}
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
                                    {decision.alpacaFilledQty} @ ${decision.alpacaFilledPrice.toFixed(2)}
                                  </div>
                                )}
                              </div>
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
                            className="p-3 rounded-lg border transition-colors bg-green-500/5 border-green-500/20"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex gap-3 flex-1">
                                <div className={`p-2 rounded-full h-fit ${
                                  decision.action === 'BUY' ? 'bg-green-500/10' : 'bg-red-500/10'
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
                                    <Badge variant={decision.action === 'BUY' ? 'secondary' : 'destructive'} className="text-xs">
                                      {decision.action}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {decision.dollarAmount && decision.dollarAmount > 0
                                        ? `$${decision.dollarAmount.toFixed(2)} order`
                                        : decision.quantity > 0
                                          ? `${decision.quantity} shares ${decision.price > 0 ? `@ $${decision.price}` : '(market price)'}`
                                          : 'Order details pending'
                                      }
                                    </span>
                                    {decision.price > 0 && (
                                      <span className="text-xs font-medium">
                                        ${decision.totalValue.toLocaleString()}
                                      </span>
                                    )}
                                    <Badge variant="success" className="text-xs">
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Executed
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {decision.reasoning}
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                                
                                {/* Alpaca Order Link */}
                                {decision.alpacaOrderId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs border-slate-700"
                                    onClick={() => {
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
                                        displayText = "Filled";
                                      } else if (status === 'partially_filled') {
                                        variant = "secondary";
                                        icon = <Clock className="h-3 w-3 mr-1" />;
                                        displayText = "Partial";
                                      }
                                      
                                      return (
                                        <Badge 
                                          variant={variant} 
                                          className={`text-xs ${
                                            status === 'filled' ? 'text-green-600' : 
                                            status === 'partially_filled' ? 'text-blue-600' : ''
                                          }`}
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
                                    {decision.alpacaFilledQty} @ ${decision.alpacaFilledPrice.toFixed(2)}
                                  </div>
                                )}
                              </div>
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
    </Card>
  );
}