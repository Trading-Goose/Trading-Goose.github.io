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
  rebalanceData: any;
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

      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          tradeActionId: position.tradeActionId,
          action: 'approve'
        }
      });

      if (error) throw error;

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
        toast({
          title: "Order Failed",
          description: data?.message || "Failed to execute order",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error executing order:', error);
      toast({
        title: "Order Failed",
        description: error.message || "Failed to execute order on Alpaca",
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

      results.forEach((result, index) => {
        const position = pendingPositions[index];
        if (result.status === 'fulfilled' && result.value.data?.success) {
          successCount++;
          newExecutedTickers.add(position.ticker);
          position.executed = true;
          position.orderStatus = 'approved';
          position.alpacaOrderId = result.value.data.alpacaOrderId;
        } else {
          failedCount++;
          console.error(`Failed to execute order for ${position.ticker}:`, result);
        }
      });

      setExecutedTickers(newExecutedTickers);

      if (successCount > 0) {
        toast({
          title: "Orders Executed",
          description: `${successCount} order${successCount !== 1 ? 's' : ''} submitted successfully${failedCount > 0 ? `, ${failedCount} failed` : ''}`,
        });
      } else {
        toast({
          title: "Execution Failed",
          description: "Failed to execute any orders",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error executing orders:', error);
      toast({
        title: "Execution Failed",
        description: error.message || "Failed to execute orders",
        variant: "destructive",
      });
    }
  };

  // Calculate values only if rebalanceData is available
  const pendingPositions = rebalanceData?.recommendedPositions
    ?.filter((p: RebalancePosition) => {
      const orderStatus = orderStatuses.get(p.ticker);
      // Include positions that have share changes and either:
      // 1. Have explicit 'pending' status, OR
      // 2. Have no order status yet (new positions awaiting approval), OR  
      // 3. Are not in executed or rejected sets and have no status
      return p.shareChange !== 0 && (
        orderStatus?.status === 'pending' ||
        (!orderStatus && rebalanceData.status === 'pending_approval') ||
        (!executedTickers.has(p.ticker) && !rejectedTickers.has(p.ticker) && !orderStatus?.status)
      );
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

          // State 6: Has positions to show (including pending approval)
          if (hasPositions || isPendingApproval) {
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

                {/* Executed Orders Section */}
                {executedTickers.size > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-medium">Executed Orders</h3>
                        <p className="text-xs text-muted-foreground">
                          Orders that have been successfully submitted to your broker
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {executedTickers.size} executed
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {rebalanceData.recommendedPositions?.map((position: RebalancePosition) => {
                        const orderStatus = orderStatuses.get(position.ticker);
                        const isExecuted = orderStatus?.status === 'executed' ||
                          orderStatus?.status === 'approved' ||
                          (orderStatus?.status === 'approved' && orderStatus?.alpacaStatus === 'filled') ||
                          executedTickers.has(position.ticker);

                        if (!isExecuted) return null;

                        return (
                          <RebalancePositionCard
                            key={`executed-${position.ticker}`}
                            position={position}
                            isExecuted={isExecuted}
                            orderStatus={orderStatus}
                            isExecuting={false}
                            onApprove={() => { }} // No action needed for executed orders
                            onReject={() => { }} // No action needed for executed orders
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

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
                    {rebalanceData.recommendedPositions?.map((position: RebalancePosition) => {
                      const orderStatus = orderStatuses.get(position.ticker);
                      const isExecuted = orderStatus?.status === 'approved' ||
                        orderStatus?.status === 'approved' ||
                        (orderStatus?.status === 'approved' && orderStatus?.alpacaStatus === 'filled') ||
                        executedTickers.has(position.ticker);
                      const isRejected = orderStatus?.status === 'rejected' || rejectedTickers.has(position.ticker);
                      // Updated pending logic to match pendingPositions calculation
                      const isPending = orderStatus?.status === 'pending' ||
                        (!orderStatus && rebalanceData.status === 'pending_approval') ||
                        (!executedTickers.has(position.ticker) && !rejectedTickers.has(position.ticker) && !orderStatus?.status);

                      // Only show pending orders in this section
                      if (!isPending || isExecuted || isRejected) return null;

                      // Don't show HOLD positions (no change needed)
                      if (position.shareChange === 0) return null;

                      return (
                        <RebalancePositionCard
                          key={position.ticker}
                          position={position}
                          isExecuted={isExecuted}
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
                {rejectedTickers.size > 0 && (
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
                        {rejectedTickers.size} rejected
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      {rebalanceData.recommendedPositions?.map((position: RebalancePosition) => {
                        const orderStatus = orderStatuses.get(position.ticker);
                        const isRejected = orderStatus?.status === 'rejected' || rejectedTickers.has(position.ticker);

                        if (!isRejected) return null;

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
                )}
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