import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  PieChart,
  Target,
  TrendingUp,
  TrendingDown,
  Shield,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface RebalancePosition {
  ticker: string;
  currentShares: number;
  currentValue: number;
  currentAllocation: number;
  targetAllocation: number;
  recommendedShares: number;
  shareChange: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
  executed?: boolean;
  orderStatus?: string;
  alpacaOrderId?: string;
  tradeActionId?: string;
}

interface RebalanceActionsTabProps {
  rebalanceData: any & {
    trading_actions?: Array<{
      id: string;
      status: string;
      ticker?: string;
      action_type?: string;
      quantity?: number;
      alpaca_order_id?: string;
    }>;
  };
  executedTickers: Set<string>;
  setExecutedTickers: (tickers: Set<string>) => void;
  rejectedTickers: Set<string>;
  setRejectedTickers: (tickers: Set<string>) => void;
  orderStatuses: Map<string, { status: string; alpacaOrderId?: string; alpacaStatus?: string }>;
  setOrderStatuses: (statuses: Map<string, { status: string; alpacaOrderId?: string; alpacaStatus?: string }>) => void;
  onClose: () => void;
}

function RebalancePositionCard({ position, onApprove, onReject, isExecuted, orderStatus, isExecuting }: {
  position: RebalancePosition;
  onApprove: () => void;
  onReject: () => void;
  isExecuted: boolean;
  orderStatus?: { status: string; alpacaOrderId?: string; alpacaStatus?: string };
  isExecuting?: boolean;
}) {
  const pricePerShare = position.currentShares > 0
    ? position.currentValue / position.currentShares
    : 200; // Default price for new positions

  const isPending = orderStatus?.status === 'pending' && position.shareChange !== 0;
  const isApproved = orderStatus?.status === 'approved';
  const isRejected = orderStatus?.status === 'rejected';
  const isHold = position.shareChange === 0;

  // Determine card background based on status and action
  const getCardClasses = () => {
    if (isPending) {
      return 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10';
    } else if (isExecuted) {
      if (position.action === 'BUY') {
        return 'bg-green-500/5 border-green-500/20';
      } else if (position.action === 'SELL') {
        return 'bg-red-500/5 border-red-500/20';
      }
    } else if (isApproved) {
      if (position.action === 'BUY') {
        return 'bg-green-500/5 border-green-500/20';
      } else if (position.action === 'SELL') {
        return 'bg-red-500/5 border-red-500/20';
      }
    } else if (isRejected || isHold) {
      return 'bg-gray-500/5 border-gray-500/20';
    }
    return 'bg-gray-500/5 border-gray-500/20';
  };

  return (
    <div className={`p-3 rounded-lg border transition-colors flex flex-col gap-3 ${getCardClasses()}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3 flex-1">
            <div className={`p-2 rounded-full h-fit ${position.action === 'BUY' ? 'bg-green-500/10' : position.action === 'SELL' ? 'bg-red-500/10' : 'bg-gray-500/10'}`}>
              {position.action === 'BUY' ? (
                <ArrowUpRight className="h-4 w-4 text-green-500" />
              ) : position.action === 'SELL' ? (
                <ArrowDownRight className="h-4 w-4 text-red-500" />
              ) : (
                <Activity className="h-4 w-4 text-gray-500" />
              )}
            </div>

            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">{position.ticker}</span>
                <Badge 
                  variant={position.action === 'BUY' ? 'buy' : position.action === 'SELL' ? 'sell' : 'hold'} 
                  className="text-xs"
                >
                  {position.action}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {position.shareChange !== 0
                    ? `${Math.abs(position.shareChange)} shares ${position.shareChange > 0 ? 'buy' : 'sell'} @ $${pricePerShare.toFixed(2)}`
                    : 'No change needed'
                  }
                </span>
                {position.shareChange !== 0 && (
                  <span className="text-xs font-medium">
                    ${Math.abs(position.shareChange * pricePerShare).toLocaleString()}
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
                {position.reasoning}
              </p>
            </div>
          </div>

          {/* Action buttons and details */}
          <div className="flex flex-col gap-1">
            {/* Alpaca Order Status Badge */}
            {orderStatus?.alpacaOrderId && orderStatus?.alpacaStatus && (
              <div className="flex items-center justify-center">
                {(() => {
                  const status = (orderStatus.alpacaStatus || '').toLowerCase();
                  let variant: any = "outline";
                  let icon = null;
                  let displayText = orderStatus.alpacaStatus;
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
                    </Badge>
                  );
                })()}
              </div>
            )}

            {/* Only show action buttons for pending decisions */}
            {isPending && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs border-green-500/50 text-green-600 hover:bg-green-500/10 hover:border-green-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove();
                  }}
                  disabled={isExecuting}
                >
                  {isExecuting ? (
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onReject();
                  }}
                  disabled={isExecuting}
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>

        
        {/* Additional Details - Portfolio Allocation */}
        {position.shareChange !== 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-16">Current:</span>
              <Progress value={position.currentAllocation} className="flex-1 h-2" />
              <span className="text-xs font-medium w-12 text-right">
                {position.currentAllocation.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-16">Target:</span>
              <Progress value={position.targetAllocation} className="flex-1 h-2" />
              <span className="text-xs font-medium w-12 text-right">
                {position.targetAllocation.toFixed(2)}%
              </span>
            </div>
          </div>
        )}
        
        {/* Metadata - at bottom of card */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-slate-800 pt-2">
          <span>Portfolio Manager</span>
          <span>•</span>
          <span className="capitalize">rebalance</span>
          <span>•</span>
          <span>{position.currentShares} → {position.recommendedShares} shares</span>
        </div>
    </div>
  );
}

export default function RebalanceActionsTab({
  rebalanceData,
  executedTickers,
  setExecutedTickers,
  rejectedTickers,
  setRejectedTickers,
  orderStatuses,
  setOrderStatuses,
  onClose,
}: RebalanceActionsTabProps) {
  const { toast } = useToast();
  const [executingTicker, setExecutingTicker] = useState<string | null>(null);
  
  // Debug log to see what data we have
  console.log('RebalanceActionsTab data:', {
    hasRebalanceData: !!rebalanceData,
    tradingActions: rebalanceData?.trading_actions,
    recommendedPositions: rebalanceData?.recommendedPositions?.map((p: RebalancePosition) => ({
      ticker: p.ticker,
      tradeActionId: p.tradeActionId,
      orderStatus: p.orderStatus,
      shareChange: p.shareChange
    }))
  });

  const handleApproveOrder = async (ticker: string) => {
    if (!rebalanceData?.id) {
      toast({
        title: "Error",
        description: "Rebalance ID not found",
        variant: "destructive",
      });
      return;
    }

    setExecutingTicker(ticker);
    try {
      toast({
        title: "Executing Order",
        description: `Submitting order for ${ticker} to Alpaca...`,
      });

      // Call edge function to execute the trade
      const position = rebalanceData.recommendedPositions.find((p: RebalancePosition) => p.ticker === ticker);
      if (!position?.tradeActionId) {
        throw new Error('Trade action ID not found for this position');
      }

      const response = await supabase.functions.invoke('execute-trade', {
        body: {
          tradeActionId: position.tradeActionId,
          action: 'approve'
        }
      });

      console.log('Execute trade response:', response);

      // Check if the function call itself failed (network error, etc)
      if (response.error) {
        console.error('Supabase function error:', response.error);
        let errorMessage = "Failed to execute order";
        
        // Parse the error message
        if (typeof response.error === 'string') {
          errorMessage = response.error;
        } else if (response.error?.message) {
          errorMessage = response.error.message;
        }
        
        throw new Error(errorMessage);
      }

      // Parse the response data
      const data = response.data;
      
      // Check if the edge function returned an error in the response body
      if (data?.error) {
        console.error('Edge function returned error:', data.error);
        let errorMessage = data.error;
        
        // Clean up common error messages
        if (errorMessage.includes('Alpaca API error:')) {
          // Extract the actual Alpaca error
          const alpacaError = errorMessage.replace('Alpaca API error:', '').trim();
          try {
            const alpacaErrorJson = JSON.parse(alpacaError);
            errorMessage = alpacaErrorJson.message || alpacaErrorJson.error || alpacaError;
          } catch {
            errorMessage = alpacaError;
          }
        }
        
        throw new Error(errorMessage);
      }

      // Check for success flag
      if (data?.success) {
        setExecutedTickers(new Set([...executedTickers, ticker]));

        setOrderStatuses(prev => new Map(prev.set(ticker, {
          status: 'approved',
          alpacaOrderId: data.alpacaOrderId
        })));

        // Update the local position data
        const position = rebalanceData.recommendedPositions.find((p: RebalancePosition) => p.ticker === ticker);
        if (position) {
          position.executed = true;
          position.orderStatus = 'approved';
          position.alpacaOrderId = data.alpacaOrderId;
        }

        toast({
          title: "Order Executed",
          description: `Order for ${ticker} has been submitted to Alpaca. Order ID: ${data.alpacaOrderId?.substring(0, 8)}...`,
        });
      } else {
        // Handle case where data.success is false
        const errorMessage = data?.message || data?.error || "Failed to execute order";
        console.error('Order execution failed:', data);
        toast({
          title: "Order Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error executing order:', error);
      
      // Extract error message with better parsing
      let errorMessage = error.message || "Failed to execute order";
      
      // Clean up common error patterns
      if (errorMessage.includes('insufficient') || errorMessage.includes('Insufficient')) {
        errorMessage = "Insufficient buying power or balance";
      } else if (errorMessage.includes('market') || errorMessage.includes('Market')) {
        errorMessage = "Market is closed or order cannot be placed at this time";
      } else if (errorMessage.includes('API settings not found')) {
        errorMessage = "API settings not found. Please configure in Settings.";
      } else if (errorMessage.includes('Alpaca credentials not configured')) {
        errorMessage = "Alpaca credentials not configured. Please add them in Settings.";
      } else if (errorMessage.includes('Invalid order')) {
        errorMessage = "Invalid order: no quantity or dollar amount specified";
      } else if (errorMessage.includes('Order already executed')) {
        // This is actually not an error - the order was already executed
        toast({
          title: "Order Already Executed",
          description: `Order for ${ticker} was already submitted to Alpaca`,
          variant: "default",
        });
        setExecutingTicker(null);
        return;
      }
      
      toast({
        title: "Order Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setExecutingTicker(null);
    }
  };

  const handleRejectOrder = async (ticker: string) => {
    if (!rebalanceData?.id) {
      toast({
        title: "Error",
        description: "Rebalance ID not found",
        variant: "destructive",
      });
      return;
    }

    setExecutingTicker(ticker);
    try {
      // Call edge function to reject the trade
      const position = rebalanceData.recommendedPositions.find((p: RebalancePosition) => p.ticker === ticker);
      if (!position?.tradeActionId) {
        throw new Error('Trade action ID not found for this position');
      }

      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          tradeActionId: position.tradeActionId,
          action: 'reject'
        }
      });

      if (error) throw error;

      if (data?.success) {
        setRejectedTickers(new Set([...rejectedTickers, ticker]));
        setOrderStatuses(prev => new Map(prev.set(ticker, {
          status: 'rejected'
        })));

        // Update the local position data
        const position = rebalanceData.recommendedPositions.find((p: RebalancePosition) => p.ticker === ticker);
        if (position) {
          position.orderStatus = 'rejected';
        }

        toast({
          title: "Order Rejected",
          description: `Order for ${ticker} has been rejected`,
        });
      }
    } catch (error: any) {
      console.error('Error rejecting order:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject order",
        variant: "destructive",
      });
    } finally {
      setExecutingTicker(null);
    }
  };

  const handleExecuteAllOrders = async () => {
    if (!rebalanceData) return;

    const pendingPositions = rebalanceData.recommendedPositions
      .filter((p: RebalancePosition) => p.shareChange !== 0 && !executedTickers.has(p.ticker) && !rejectedTickers.has(p.ticker));

    if (pendingPositions.length === 0) {
      toast({
        title: "No Pending Orders",
        description: "All orders have already been processed",
      });
      return;
    }

    try {
      toast({
        title: "Executing Orders",
        description: `Submitting ${pendingPositions.length} orders to Alpaca...`,
      });

      // Execute all pending orders
      const results = await Promise.allSettled(
        pendingPositions.map((position: RebalancePosition) => {
          if (!position.tradeActionId) {
            return Promise.reject(new Error(`Trade action ID not found for ${position.ticker}`));
          }
          return supabase.functions.invoke('execute-trade', {
            body: {
              tradeActionId: position.tradeActionId,
              action: 'approve'
            }
          });
        })
      );

      // Process results
      let successCount = 0;
      let failedCount = 0;
      const newExecutedTickers = new Set(executedTickers);
      const failedOrders: { ticker: string; error: string }[] = [];

      results.forEach((result, index) => {
        const position = pendingPositions[index];
        if (result.status === 'fulfilled') {
          const response = result.value;
          const data = response.data;
          const error = response.error;
          
          // Check for errors in the response
          if (error || data?.error) {
            failedCount++;
            let errorMessage = "Unknown error";
            
            if (error) {
              errorMessage = typeof error === 'string' ? error : (error.message || "Failed to execute order");
            } else if (data?.error) {
              errorMessage = data.error;
              // Clean up Alpaca API errors
              if (errorMessage.includes('Alpaca API error:')) {
                const alpacaError = errorMessage.replace('Alpaca API error:', '').trim();
                try {
                  const alpacaErrorJson = JSON.parse(alpacaError);
                  errorMessage = alpacaErrorJson.message || alpacaErrorJson.error || alpacaError;
                } catch {
                  errorMessage = alpacaError;
                }
              }
            }
            
            failedOrders.push({
              ticker: position.ticker,
              error: errorMessage
            });
            console.error(`Failed to execute order for ${position.ticker}:`, error || data);
          } else if (data?.success) {
            // Success case
            successCount++;
            newExecutedTickers.add(position.ticker);
            position.executed = true;
            position.orderStatus = 'approved';
            position.alpacaOrderId = data.alpacaOrderId;
            
            // Update order status
            setOrderStatuses(prev => new Map(prev.set(position.ticker, {
              status: 'approved',
              alpacaOrderId: data.alpacaOrderId,
              alpacaStatus: data.alpacaStatus
            })));
          } else {
            // Unexpected response format
            failedCount++;
            failedOrders.push({
              ticker: position.ticker,
              error: "Unexpected response from server"
            });
            console.error(`Unexpected response for ${position.ticker}:`, data);
          }
        } else {
          // Promise was rejected
          failedCount++;
          const errorMessage = result.reason?.message || "Failed to execute order";
          failedOrders.push({
            ticker: position.ticker,
            error: errorMessage
          });
          console.error(`Failed to execute order for ${position.ticker}:`, result.reason);
        }
      });

      setExecutedTickers(newExecutedTickers);

      if (successCount > 0 && failedCount === 0) {
        toast({
          title: "Orders Executed",
          description: `All ${successCount} order${successCount !== 1 ? 's' : ''} submitted successfully`,
        });
      } else if (successCount > 0 && failedCount > 0) {
        // Show success with warning about failures
        toast({
          title: "Partial Success",
          description: `${successCount} order${successCount !== 1 ? 's' : ''} submitted, ${failedCount} failed`,
          variant: "default",
        });
        
        // Show details of failed orders
        if (failedOrders.length > 0) {
          const failedTickerList = failedOrders.map(f => f.ticker).join(', ');
          toast({
            title: "Failed Orders",
            description: `Failed to execute: ${failedTickerList}`,
            variant: "destructive",
          });
        }
      } else {
        // All failed
        let errorDescription = "Failed to execute any orders";
        if (failedOrders.length > 0 && failedOrders[0].error) {
          // Show the first error message if available
          errorDescription = failedOrders[0].error;
        }
        toast({
          title: "Execution Failed",
          description: errorDescription,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error executing orders:', error);
      
      // Better error message extraction
      let errorMessage = "Failed to execute orders";
      if (error.message) {
        errorMessage = error.message;
        
        // Check for common error patterns
        if (errorMessage.includes('Edge function returned non-2xx')) {
          errorMessage = "Service error - please check your API configuration";
        } else if (errorMessage.includes('insufficient') || errorMessage.includes('Insufficient')) {
          errorMessage = "Insufficient buying power for all orders";
        } else if (errorMessage.includes('market') || errorMessage.includes('Market')) {
          errorMessage = "Market is closed or orders cannot be placed at this time";
        }
      }
      
      toast({
        title: "Execution Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Calculate values only if rebalanceData is available - SIMPLIFIED
  const pendingPositions = rebalanceData?.recommendedPositions
    ?.filter((p: RebalancePosition) => {
      // Skip HOLD positions
      if (p.shareChange === 0) return false;
      
      // Check if this position has been approved
      if (rebalanceData.trading_actions && p.tradeActionId) {
        const tradeAction = rebalanceData.trading_actions.find((ta: any) => 
          ta.id === p.tradeActionId
        );
        if (tradeAction && tradeAction.status === 'approved') {
          return false; // Not pending if approved
        }
        if (tradeAction && tradeAction.status === 'rejected') {
          return false; // Not pending if rejected
        }
      }
      
      // Check local state
      const orderStatus = orderStatuses.get(p.ticker);
      if (orderStatus?.status === 'approved') {
        return false; // Not pending if approved
      }
      if (orderStatus?.status === 'rejected') {
        return false; // Not pending if rejected
      }
      
      // Check sets
      if (executedTickers.has(p.ticker)) {
        return false; // Not pending if executed
      }
      if (rejectedTickers.has(p.ticker)) {
        return false; // Not pending if rejected
      }
      
      // If we get here, it's pending
      return true;
    }) || [];

  const totalBuyValue = pendingPositions
    .filter((p: RebalancePosition) => p.action === 'BUY')
    .reduce((sum: number, p: RebalancePosition) => sum + Math.abs(p.shareChange * (p.currentValue / p.currentShares || 200)), 0);

  const totalSellValue = pendingPositions
    .filter((p: RebalancePosition) => p.action === 'SELL')
    .reduce((sum: number, p: RebalancePosition) => sum + Math.abs(p.shareChange * (p.currentValue / p.currentShares)), 0);

  const netCashFlow = totalSellValue - totalBuyValue;
  const hasPendingOrders = pendingPositions.length > 0;

  const isRunning = rebalanceData.status === 'running';
  const isAnalyzing = rebalanceData.status === 'analyzing' || rebalanceData.status === 'initializing';
  const isPlanning = rebalanceData.status === 'planning';
  const isPendingApproval = rebalanceData.status === 'pending_approval';
  const isExecuting = rebalanceData.status === 'executing' || rebalanceData.status === 'pending_trades';
  const isCompleted = rebalanceData.status === 'completed';
  const isCanceled = rebalanceData.status === 'canceled';
  const isError = rebalanceData.status === 'error' || rebalanceData.status === 'failed';
  const hasPositions = rebalanceData.recommendedPositions && rebalanceData.recommendedPositions.length > 0;
  const allPositionsProcessed = rebalanceData.recommendedPositions?.every((p: RebalancePosition) =>
    executedTickers.has(p.ticker) || rejectedTickers.has(p.ticker) || p.shareChange === 0
  );

  return (
    <div className="flex flex-col h-[calc(90vh-220px)] mt-0">
      <ScrollArea className="flex-1 px-6 pb-4 mt-6">
        {/* Different states based on rebalance status */}
        {(() => {
          // State 1: Still analyzing stocks
          if (isAnalyzing) {
            return (
              <div className="flex flex-col items-center justify-center p-12 space-y-6">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full border-4 border-primary/20 animate-pulse" />
                  <Loader2 className="w-20 h-20 absolute inset-0 animate-spin text-primary" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Analyzing Portfolio</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Our AI agents are analyzing your holdings and market conditions to determine optimal rebalancing actions...
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>This typically takes 2-5 minutes</span>
                </div>
              </div>
            );
          }

          // State 2: Planning rebalance (only when still planning and no positions yet)
          if (isPlanning && !hasPositions) {
            return (
              <div className="flex flex-col items-center justify-center p-12 space-y-6">
                <div className="relative">
                  <PieChart className="w-20 h-20 text-primary animate-pulse" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Calculating Optimal Strategy</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Portfolio Manager is determining the best rebalancing strategy based on the analysis results...
                  </p>
                </div>
                <Progress value={65} className="w-48" />
              </div>
            );
          }

          // State 3: Error occurred or Failed status
          if (isError || rebalanceData.status === 'failed') {
            // Extract cleaner error message from various sources
            let errorMessage = 'Unknown error occurred';
            let errorDetails = rebalanceData.rebalance_plan?.error || rebalanceData.error_message || '';

            // Try to parse error message if it's a JSON string
            if (errorDetails && typeof errorDetails === 'string') {
              // Check if it's a JSON error response
              if (errorDetails.includes('{') && errorDetails.includes('}')) {
                try {
                  // Try to extract the actual error message from JSON
                  const jsonMatch = errorDetails.match(/"message"\s*:\s*"([^"]+)"/i);
                  if (jsonMatch) {
                    errorMessage = jsonMatch[1];
                  } else if (errorDetails.includes('Insufficient credits')) {
                    // Extract the specific error message for OpenRouter
                    const creditMatch = errorDetails.match(/Insufficient credits[^"\}]*/i);
                    if (creditMatch) {
                      errorMessage = creditMatch[0];
                    }
                  } else {
                    // Try parsing as JSON
                    const parsed = JSON.parse(errorDetails);
                    errorMessage = parsed.error?.message || parsed.message || parsed.error || errorDetails;
                  }
                } catch (e) {
                  // If not valid JSON, use as is
                  errorMessage = errorDetails;
                }
              } else {
                // Plain text error
                errorMessage = errorDetails;
              }
            }

            const errorDetailsText = rebalanceData.rebalance_plan?.errorDetails || '';
            const failedAt = rebalanceData.rebalance_plan?.failedAt || '';

            return (
              <div className="flex flex-col items-center justify-center p-12 space-y-6">
                <div className="relative">
                  <XCircle className="w-20 h-20 text-destructive" />
                </div>
                <div className="text-center space-y-4 max-w-2xl">
                  <h3 className="text-lg font-semibold">Rebalance Failed</h3>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {errorMessage}
                    </p>
                    {errorDetailsText && errorDetailsText !== errorMessage && (
                      <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-left">
                        <p className="text-sm font-medium text-destructive mb-1">Additional Details:</p>
                        <p className="text-sm text-muted-foreground">{errorDetailsText}</p>
                        {failedAt && (
                          <p className="text-xs text-muted-foreground mt-2">Failed at: {failedAt.replace(/_/g, ' ')}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
              </div>
            );
          }

          // State 4: Canceled
          if (isCanceled) {
            return (
              <div className="flex flex-col items-center justify-center p-12 space-y-6">
                <div className="relative">
                  <XCircle className="w-20 h-20 text-muted-foreground" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Rebalance Canceled</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    This rebalancing session was canceled. No orders were executed.
                  </p>
                </div>
              </div>
            );
          }

          // State 5: No actions needed (only if no executed/pending/rejected orders exist)
          if (hasPositions &&
            rebalanceData.recommendedPositions.every((p: RebalancePosition) => p.shareChange === 0) &&
            executedTickers.size === 0 && rejectedTickers.size === 0 &&
            !Array.from(orderStatuses.values()).some(status => ['pending', 'executed', 'approved'].includes(status.status))) {
            return (
              <div className="flex flex-col items-center justify-center p-12 space-y-6">
                <div className="relative">
                  <CheckCircle className="w-20 h-20 text-green-500" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-lg font-semibold">Portfolio is Balanced</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Your portfolio is already well-balanced. No rebalancing actions are needed at this time.
                  </p>
                </div>
                <Card className="p-4 bg-green-500/5 border-green-500/20">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-green-500" />
                    <div className="text-sm">
                      <p className="font-medium">All positions within target allocations</p>
                      <p className="text-xs text-muted-foreground">Next review recommended in 30 days</p>
                    </div>
                  </div>
                </Card>
              </div>
            );
          }

          // State 6: Has positions to show (show for pending_approval, executing, completed, or when positions exist)
          if (hasPositions || isPendingApproval || isExecuting || isCompleted) {
            return (
              <>
                {/* Status Banner for pending approval state */}
                {isPendingApproval && (
                  <Card className="p-4 bg-blue-500/5 border-blue-500/20 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-500" />
                        <div>
                          <p className="font-medium">Ready for Approval</p>
                          <p className="text-xs text-muted-foreground">
                            Review the recommended trades below and approve to execute
                          </p>
                        </div>
                      </div>
                      <Badge variant="default" className="text-xs">
                        {(() => {
                          const tradesCount = rebalanceData.recommendedPositions?.filter((p: RebalancePosition) => p.shareChange !== 0).length || 0;
                          return `${tradesCount} trades`;
                        })()}
                      </Badge>
                    </div>
                  </Card>
                )}

                {/* Status Banner for running/executing states */}
                {(isRunning || isExecuting) && (
                  <Card className="p-4 bg-primary/5 border-primary/20 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                        <div>
                          <p className="font-medium">
                            {isExecuting ? 'Executing Orders' : 'Rebalance in Progress'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isExecuting
                              ? 'Orders are being submitted to your broker...'
                              : 'Preparing rebalancing recommendations...'}
                          </p>
                        </div>
                      </div>
                      {isExecuting && (
                        <Badge variant="outline" className="text-xs">
                          <Activity className="w-3 h-3 mr-1" />
                          Live Trading
                        </Badge>
                      )}
                    </div>
                  </Card>
                )}

                {/* Completion Banner */}
                {isCompleted && allPositionsProcessed && (
                  <Card className="p-4 bg-green-500/5 border-green-500/20 mb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <div>
                          <p className="font-medium">Rebalance Complete</p>
                          <p className="text-xs text-muted-foreground">
                            All orders have been processed successfully
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {executedTickers.size} executed
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rejectedTickers.size} rejected
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Buy Value</span>
                      <TrendingUp className="w-4 h-4 text-green-500" />
                    </div>
                    <p className="text-lg font-semibold text-green-600">
                      ${totalBuyValue.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pendingPositions.filter((p: RebalancePosition) => p.action === 'BUY').length} positions
                    </p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Sell Value</span>
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    </div>
                    <p className="text-lg font-semibold text-red-600">
                      ${totalSellValue.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pendingPositions.filter((p: RebalancePosition) => p.action === 'SELL').length} positions
                    </p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Net Cash Flow</span>
                      <DollarSign className="w-4 h-4 text-blue-500" />
                    </div>
                    <p className={`text-lg font-semibold ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {netCashFlow >= 0 ? '+' : ''}${Math.abs(netCashFlow).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {netCashFlow >= 0 ? 'Cash inflow' : 'Cash needed'}
                    </p>
                  </Card>
                </div>

                {/* Approved Orders Section - VERY SIMPLE */}
                {(() => {
                  // Check if we have any approved trading actions
                  const approvedTradingActions = rebalanceData?.trading_actions?.filter((ta: any) => 
                    ta.status === 'approved'
                  ) || [];
                  
                  console.log('Checking for approved orders:', {
                    tradingActions: rebalanceData?.trading_actions,
                    approvedCount: approvedTradingActions.length
                  });
                  
                  if (approvedTradingActions.length === 0) {
                    return null;
                  }
                  
                  // For each approved trading action, find the corresponding position
                  const approvedPositions = approvedTradingActions.map((ta: any) => {
                    // Find position by ticker
                    const position = rebalanceData.recommendedPositions?.find((p: RebalancePosition) => 
                      p.ticker === ta.ticker
                    );
                    
                    if (!position) {
                      // Create a position from the trading action data if not found
                      return {
                        ticker: ta.ticker,
                        action: ta.action_type || ta.action || 'UNKNOWN',
                        shareChange: ta.quantity || ta.shares || 0,
                        currentShares: 0,
                        currentValue: 0,
                        currentAllocation: 0,
                        targetAllocation: 0,
                        recommendedShares: ta.quantity || ta.shares || 0,
                        reasoning: ta.reasoning || '',
                        tradeActionId: ta.id,
                        alpacaOrderId: ta.metadata?.alpaca_order?.id || ta.alpaca_order_id
                      };
                    }
                    
                    return {
                      ...position,
                      tradeActionId: ta.id,
                      alpacaOrderId: ta.metadata?.alpaca_order?.id || ta.alpaca_order_id || position.alpacaOrderId
                    };
                  }).filter(Boolean); // Remove any null entries
                  
                  if (approvedPositions.length === 0) {
                    return null;
                  }
                  
                  return (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-medium">Approved Orders</h3>
                          <p className="text-xs text-muted-foreground">
                            Orders that have been approved for execution
                          </p>
                        </div>
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {approvedPositions.length} approved
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        {approvedPositions.map((position: RebalancePosition, index: number) => {
                          // Find the trading action for metadata
                          const tradeAction = approvedTradingActions.find((ta: any) => 
                            ta.ticker === position.ticker
                          );
                          
                          const effectiveOrderStatus = {
                            status: 'approved',
                            alpacaOrderId: tradeAction?.metadata?.alpaca_order?.id || tradeAction?.alpaca_order_id,
                            alpacaStatus: tradeAction?.metadata?.alpaca_order?.status
                          };
                          
                          return (
                            <RebalancePositionCard
                              key={`approved-${position.ticker}-${index}`}
                              position={position}
                              isExecuted={true}
                              orderStatus={effectiveOrderStatus}
                              isExecuting={false}
                              onApprove={() => { }} // No action needed for approved orders
                              onReject={() => { }} // No action needed for approved orders
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Section Header */}
                {pendingPositions.length > 0 && (
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-medium">Pending Orders</h3>
                      <p className="text-xs text-muted-foreground">
                        Review and approve each order before execution
                      </p>
                    </div>
                    <Badge variant="outline">
                      {pendingPositions.length} pending
                    </Badge>
                  </div>
                )}

                {/* Pending Orders (only show pending, not executed) */}
                {pendingPositions.length > 0 && (
                  <div className="space-y-3 mb-6">
                    {pendingPositions.map((position: RebalancePosition) => {
                      const orderStatus = orderStatuses.get(position.ticker);
                      return (
                        <RebalancePositionCard
                          key={position.ticker}
                          position={position}
                          isExecuted={false}
                          orderStatus={orderStatus}
                          isExecuting={executingTicker === position.ticker}
                          onApprove={() => handleApproveOrder(position.ticker)}
                          onReject={() => handleRejectOrder(position.ticker)}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Rejected Orders Section */}
                {(() => {
                  const rejectedPositions = rebalanceData?.recommendedPositions?.filter((position: RebalancePosition) => {
                    // Skip HOLD positions
                    if (position.shareChange === 0) return false;
                    
                    const orderStatus = orderStatuses.get(position.ticker);
                    const isRejected = rejectedTickers.has(position.ticker) || 
                                      orderStatus?.status === 'rejected';
                    return isRejected;
                  }) || [];

                  if (rejectedPositions.length === 0) return null;

                  return (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-medium">Rejected Orders</h3>
                          <p className="text-xs text-muted-foreground">
                            Orders that were rejected
                          </p>
                        </div>
                        <Badge variant="outline" className="text-gray-600 border-gray-500/20">
                          <XCircle className="w-3 h-3 mr-1" />
                          {rejectedPositions.length} rejected
                        </Badge>
                      </div>
                      <div className="space-y-3">
                        {rejectedPositions.map((position: RebalancePosition) => {
                          const orderStatus = orderStatuses.get(position.ticker);
                          return (
                            <RebalancePositionCard
                              key={`rejected-${position.ticker}`}
                              position={position}
                              isExecuted={false}
                              orderStatus={{ ...orderStatus, status: 'rejected' }}
                              isExecuting={false}
                              onApprove={() => { }} // No action needed for rejected orders
                              onReject={() => { }} // No action needed for rejected orders
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            );
          }

          // Default empty state
          return (
            <div className="flex flex-col items-center justify-center p-12 space-y-6">
              <div className="relative">
                <Target className="w-20 h-20 text-muted-foreground/50" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-semibold">No Actions Available</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Waiting for rebalancing recommendations...
                </p>
              </div>
            </div>
          );
        })()}
      </ScrollArea>

      {/* Fixed Execute Orders Section at bottom */}
      {(() => {
        const isPendingApproval = rebalanceData.status === 'pending_approval';
        const isExecuting = rebalanceData.status === 'executing' || rebalanceData.status === 'pending_trades';
        const hasPositions = rebalanceData.recommendedPositions && rebalanceData.recommendedPositions.length > 0;

        if ((isPendingApproval || hasPositions) && rebalanceData.recommendedPositions?.some((p: RebalancePosition) => p.shareChange !== 0)) {
          return (
            <div className="border-t px-6 py-4 bg-background shrink-0">
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">
                    {executedTickers.size > 0 && (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-green-600 font-medium">
                          {executedTickers.size} order{executedTickers.size !== 1 ? 's' : ''} executed
                        </span>
                      </div>
                    )}
                    {rejectedTickers.size > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <XCircle className="w-4 h-4 text-orange-600" />
                        <span className="text-orange-600 font-medium">
                          {rejectedTickers.size} order{rejectedTickers.size !== 1 ? 's' : ''} rejected
                        </span>
                      </div>
                    )}
                  </div>
                  {hasPendingOrders && (
                    <p className="text-xs text-muted-foreground">
                      Execute all pending orders with one click
                    </p>
                  )}
                </div>
                <Button
                  onClick={handleExecuteAllOrders}
                  disabled={!hasPendingOrders || isExecuting}
                  className="min-w-[200px]"
                  variant={hasPendingOrders ? "default" : "secondary"}
                >
                  {isExecuting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Executing Orders...
                    </>
                  ) : hasPendingOrders ? (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Execute All ({pendingPositions.length})
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      All Orders Processed
                    </>
                  )}
                </Button>
              </div>
            </div>
          );
        }
        return null;
      })()}
    </div>
  );
}