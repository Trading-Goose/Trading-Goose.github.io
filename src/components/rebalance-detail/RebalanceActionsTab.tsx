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
  ExternalLink,
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
            {/* Alpaca Order Link and Status Badge - Horizontal Layout */}
            {orderStatus?.alpacaOrderId && (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs border-slate-700"
                  onClick={() => {
                    const baseUrl = 'https://app.alpaca.markets';
                    window.open(`${baseUrl}/dashboard/order/${orderStatus.alpacaOrderId}`, '_blank');
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" />
                  Alpaca
                </Button>

                {/* Alpaca Order Status Badge */}
                {orderStatus?.alpacaStatus && (
                  <div className="flex items-center justify-center">
                    {(() => {
                      const status = (orderStatus.alpacaStatus || '').toLowerCase();
                      let variant: any = "outline";
                      let icon = null;
                      let customClasses = "";

                      if (status === 'filled') {
                        variant = "success";
                        icon = <CheckCircle className="h-3 w-3 mr-1" />;
                      } else if (status === 'partially_filled') {
                        variant = "default";
                        icon = <Clock className="h-3 w-3 mr-1" />;
                        customClasses = "bg-blue-500 text-white border-blue-500";
                      } else if ([
                        'new',
                        'pending_new',
                        'accepted',
                        'pending_replace',
                        'pending_cancel'
                      ].includes(status)) {
                        variant = "warning";
                        icon = <Clock className="h-3 w-3 mr-1" />;
                      } else if ([
                        'canceled',
                        'cancelled',
                        'expired',
                        'replaced'
                      ].includes(status)) {
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
                          {orderStatus.alpacaStatus}
                        </Badge>
                      );
                    })()}
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
          alpacaOrderId: data.alpacaOrderId,
          alpacaStatus: data.alpacaStatus
        })));

        // Update the local position data
        const position = rebalanceData.recommendedPositions.find((p: RebalancePosition) => p.ticker === ticker);
        if (position) {
          position.executed = true;
          position.orderStatus = 'approved';
          position.alpacaOrderId = data.alpacaOrderId;
        }

        // Update trading_actions in rebalanceData to reflect the approval
        if (position?.tradeActionId && rebalanceData.trading_actions) {
          const tradeActionIndex = rebalanceData.trading_actions.findIndex((ta: any) => 
            ta.id === position.tradeActionId
          );
          if (tradeActionIndex >= 0) {
            rebalanceData.trading_actions[tradeActionIndex] = {
              ...rebalanceData.trading_actions[tradeActionIndex],
              status: 'approved',
              alpaca_order_id: data.alpacaOrderId,
              metadata: {
                ...rebalanceData.trading_actions[tradeActionIndex].metadata,
                alpaca_order: {
                  id: data.alpacaOrderId,
                  status: data.alpacaStatus
                }
              }
            };
          }
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
          
          // Update trading_actions in rebalanceData to reflect the rejection
          if (position.tradeActionId && rebalanceData.trading_actions) {
            const tradeActionIndex = rebalanceData.trading_actions.findIndex((ta: any) => 
              ta.id === position.tradeActionId
            );
            if (tradeActionIndex >= 0) {
              rebalanceData.trading_actions[tradeActionIndex] = {
                ...rebalanceData.trading_actions[tradeActionIndex],
                status: 'rejected'
              };
            }
          }
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
            
            // Update trading_actions in rebalanceData to reflect the approval
            if (position.tradeActionId && rebalanceData.trading_actions) {
              const tradeActionIndex = rebalanceData.trading_actions.findIndex((ta: any) => 
                ta.id === position.tradeActionId
              );
              if (tradeActionIndex >= 0) {
                rebalanceData.trading_actions[tradeActionIndex] = {
                  ...rebalanceData.trading_actions[tradeActionIndex],
                  status: 'approved',
                  alpaca_order_id: data.alpacaOrderId,
                  metadata: {
                    ...rebalanceData.trading_actions[tradeActionIndex].metadata,
                    alpaca_order: {
                      id: data.alpacaOrderId,
                      status: data.alpacaStatus
                    }
                  }
                };
              }
            }
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

  const tradingActions = Array.isArray(rebalanceData?.trading_actions)
    ? rebalanceData.trading_actions
    : [];

  const recommendedPositions = Array.isArray(rebalanceData?.recommendedPositions)
    ? rebalanceData.recommendedPositions
    : [];

  const planActionsArray = Array.isArray(rebalanceData?.rebalance_plan?.actions)
    ? rebalanceData.rebalance_plan.actions
    : [];

  const tradeActionById = new Map<string, any>();
  const tradeActionByTicker = new Map<string, any>();
  tradingActions.forEach((action: any) => {
    if (action?.id) {
      tradeActionById.set(action.id, action);
    }
    if (action?.ticker) {
      tradeActionByTicker.set(action.ticker, action);
    }
  });

  const positionByTradeActionId = new Map<string, RebalancePosition>();
  const positionByTicker = new Map<string, RebalancePosition>();
  recommendedPositions.forEach((position: RebalancePosition) => {
    if (position?.tradeActionId) {
      positionByTradeActionId.set(position.tradeActionId, position);
    }
    if (position?.ticker) {
      positionByTicker.set(position.ticker, position);
    }
  });

  const planActionByTicker = new Map<string, any>();
  planActionsArray.forEach((action: any) => {
    if (action?.ticker) {
      planActionByTicker.set(action.ticker, action);
    }
  });

  const parseNumeric = (value: any): number => {
    if (value === null || value === undefined) return 0;
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const extractPositiveNumbers = (...values: any[]): number[] =>
    values
      .map(parseNumeric)
      .filter((value) => Number.isFinite(value) && value > 0);

  const extractNonZeroNumbers = (...values: any[]): number[] =>
    values
      .map(parseNumeric)
      .filter((value) => Number.isFinite(value) && value !== 0);

  const calculateOrderNotional = (
    position: RebalancePosition | undefined,
    tradeAction: any,
    planAction: any
  ): number => {
    const directValue = extractPositiveNumbers(
      tradeAction?.dollar_amount,
      tradeAction?.dollarAmount,
      tradeAction?.metadata?.dollarAmount,
      planAction?.dollarAmount,
      planAction?.dollar_amount,
      planAction?.amount
    );
    if (directValue.length > 0) {
      return directValue[0];
    }

    const valueChange = extractNonZeroNumbers(
      tradeAction?.metadata?.changes?.value,
      planAction?.valueChange,
      planAction?.value_change,
      planAction?.valueDelta,
      planAction?.deltaValue
    );
    if (valueChange.length > 0) {
      return Math.abs(valueChange[0]);
    }

    const shareCandidates = extractNonZeroNumbers(
      tradeAction?.shares,
      tradeAction?.metadata?.changes?.shares,
      planAction?.shareChange,
      planAction?.share_change,
      planAction?.shares,
      planAction?.quantity,
      planAction?.qty,
      position?.shareChange,
      planAction?.targetShares && planAction?.currentShares
        ? planAction.targetShares - planAction.currentShares
        : 0
    );

    let priceCandidates = extractPositiveNumbers(
      tradeAction?.price,
      tradeAction?.metadata?.price,
      tradeAction?.metadata?.targetPrice,
      tradeAction?.metadata?.target_price,
      planAction?.price,
      planAction?.targetPrice,
      planAction?.pricePerShare,
      planAction?.averagePrice,
      planAction?.estimatedPrice
    );

    if (tradeAction?.metadata?.beforePosition) {
      const beforeShares = parseNumeric(tradeAction.metadata.beforePosition.shares);
      const beforeValue = parseNumeric(tradeAction.metadata.beforePosition.value);
      if (beforeShares > 0 && beforeValue > 0) {
        const impliedPrice = beforeValue / beforeShares;
        if (Number.isFinite(impliedPrice) && impliedPrice > 0) {
          priceCandidates.push(impliedPrice);
        }
      }
    }

    if (tradeAction?.metadata?.afterPosition) {
      const afterShares = parseNumeric(tradeAction.metadata.afterPosition.shares);
      const afterValue = parseNumeric(tradeAction.metadata.afterPosition.value);
      if (afterShares > 0 && afterValue > 0) {
        const impliedPrice = afterValue / afterShares;
        if (Number.isFinite(impliedPrice) && impliedPrice > 0) {
          priceCandidates.push(impliedPrice);
        }
      }
    }

    if (position) {
      const currentShares = parseNumeric(position.currentShares);
      const currentValue = parseNumeric(position.currentValue);
      if (currentShares > 0 && currentValue > 0) {
        const currentPrice = currentValue / currentShares;
        if (Number.isFinite(currentPrice) && currentPrice > 0) {
          priceCandidates.push(currentPrice);
        }
      }

      const recommendedShares = parseNumeric(position.recommendedShares);
      const planTargetValue = parseNumeric(planAction?.targetValue);
      if (recommendedShares > 0 && planTargetValue > 0) {
        const impliedPrice = planTargetValue / recommendedShares;
        if (Number.isFinite(impliedPrice) && impliedPrice > 0) {
          priceCandidates.push(impliedPrice);
        }
      }
    }

    if (shareCandidates.length > 0 && priceCandidates.length > 0) {
      return Math.abs(shareCandidates[0]) * priceCandidates[0];
    }

    if (shareCandidates.length > 0) {
      const metadataValue = parseNumeric(tradeAction?.metadata?.changes?.value);
      const metadataShares = parseNumeric(tradeAction?.metadata?.changes?.shares);
      if (metadataValue !== 0 && metadataShares !== 0) {
        const impliedPrice = Math.abs(metadataValue) / Math.abs(metadataShares);
        if (Number.isFinite(impliedPrice) && impliedPrice > 0) {
          return Math.abs(shareCandidates[0]) * impliedPrice;
        }
      }
    }

    const beforeValue = parseNumeric(tradeAction?.metadata?.beforePosition?.value);
    const afterValue = parseNumeric(tradeAction?.metadata?.afterPosition?.value);
    if (beforeValue !== 0 || afterValue !== 0) {
      const delta = afterValue - beforeValue;
      if (delta !== 0) {
        return Math.abs(delta);
      }
    }

    const planTargetValue = parseNumeric(planAction?.targetValue);
    const planCurrentValue = parseNumeric(planAction?.currentValue);
    if (planTargetValue !== 0 || planCurrentValue !== 0) {
      const delta = planTargetValue - planCurrentValue;
      if (delta !== 0) {
        return Math.abs(delta);
      }
    }

    return 0;
  };

  const actionableTradeActions = tradingActions.filter((action: any) => {
    if (!action) return false;
    const status = (action.status || '').toString().toLowerCase();
    if (status === 'rejected') return false;
    const actionType = (action.action || '').toString().toUpperCase();
    return actionType === 'BUY' || actionType === 'SELL';
  });

  const tradeActionsNeedingFallback: Array<{ position?: RebalancePosition; planAction?: any; action: any }> = [];

  const summaryMetrics = actionableTradeActions.reduce(
    (acc: { totalBuyValue: number; totalSellValue: number; buyCount: number; sellCount: number }, action: any) => {
      const position = action?.id
        ? positionByTradeActionId.get(action.id) || positionByTicker.get(action.ticker)
        : positionByTicker.get(action?.ticker);
      const planAction = planActionByTicker.get(action?.ticker);
      const orderValue = calculateOrderNotional(position, action, planAction);
      if (!Number.isFinite(orderValue) || orderValue <= 0) {
        tradeActionsNeedingFallback.push({ position, planAction, action });
        return acc;
      }

      const actionType = (action.action || '').toString().toUpperCase();
      if (actionType === 'BUY') {
        acc.totalBuyValue += orderValue;
        acc.buyCount += 1;
      } else if (actionType === 'SELL') {
        acc.totalSellValue += orderValue;
        acc.sellCount += 1;
      }
      return acc;
    },
    { totalBuyValue: 0, totalSellValue: 0, buyCount: 0, sellCount: 0 }
  );

  tradeActionsNeedingFallback.forEach(({ position, planAction, action }) => {
    const fallbackValue = calculateOrderNotional(position, undefined, planAction);
    if (!Number.isFinite(fallbackValue) || fallbackValue <= 0) {
      return;
    }
    const actionType = (action?.action || '').toString().toUpperCase();
    if (actionType === 'BUY') {
      summaryMetrics.totalBuyValue += fallbackValue;
      summaryMetrics.buyCount += 1;
    } else if (actionType === 'SELL') {
      summaryMetrics.totalSellValue += fallbackValue;
      summaryMetrics.sellCount += 1;
    }
  });

  const unmatchedPositions = recommendedPositions.filter((position: RebalancePosition) => {
    if (position.shareChange === 0 || position.action === 'HOLD') {
      return false;
    }
    if (rejectedTickers.has(position.ticker)) {
      return false;
    }
    const tradeAction = position.tradeActionId
      ? tradeActionById.get(position.tradeActionId)
      : tradeActionByTicker.get(position.ticker);
    return !tradeAction;
  });

  unmatchedPositions.forEach((position: RebalancePosition) => {
    const planAction = planActionByTicker.get(position.ticker);
    const orderValue = calculateOrderNotional(position, undefined, planAction);
    if (!Number.isFinite(orderValue) || orderValue <= 0) {
      return;
    }
    if (position.action === 'BUY') {
      summaryMetrics.totalBuyValue += orderValue;
      summaryMetrics.buyCount += 1;
    } else if (position.action === 'SELL') {
      summaryMetrics.totalSellValue += orderValue;
      summaryMetrics.sellCount += 1;
    }
  });

  const netCashFlow = summaryMetrics.totalSellValue - summaryMetrics.totalBuyValue;
  const hasPendingOrders = pendingPositions.length > 0;

  const formatCurrency = (value: number) =>
    Number.isFinite(value)
      ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '0.00';

  const formatSignedCurrency = (value: number) => {
    if (!Number.isFinite(value) || value === 0) {
      return '$0.00';
    }
    const prefix = value > 0 ? '+' : '-';
    return `${prefix}$${formatCurrency(Math.abs(value))}`;
  };

  const totalActionableOrders = summaryMetrics.buyCount + summaryMetrics.sellCount;

  const executedOrdersInfo = actionableTradeActions.reduce<{
    executedCount: number;
    executedValue: number;
    processedTickers: Set<string>;
  }>((acc, action: any) => {
    const ticker = action?.ticker;
    if (!ticker) {
      return acc;
    }

    const status = (action.status || '').toString().toLowerCase();
    const orderStatus = orderStatuses.get(ticker);
    const isExecuted = status === 'approved'
      || executedTickers.has(ticker)
      || orderStatus?.status === 'approved';

    if (!isExecuted) {
      return acc;
    }

    const position = action?.id
      ? positionByTradeActionId.get(action.id) || positionByTicker.get(ticker)
      : positionByTicker.get(ticker);
    const planAction = planActionByTicker.get(ticker);

    let orderValue = calculateOrderNotional(position, action, planAction);
    if (!Number.isFinite(orderValue) || orderValue <= 0) {
      orderValue = calculateOrderNotional(position, undefined, planAction);
    }

    const actionType = (action.action || '').toString().toUpperCase();
    if (Number.isFinite(orderValue) && orderValue > 0) {
      acc.executedValue += actionType === 'SELL' ? orderValue : -orderValue;
    }

    acc.executedCount += 1;
    acc.processedTickers.add(ticker);
    return acc;
  }, {
    executedCount: 0,
    executedValue: 0,
    processedTickers: new Set<string>()
  });

  recommendedPositions.forEach((position: RebalancePosition) => {
    const ticker = position.ticker;
    if (!ticker) {
      return;
    }

    const orderStatus = orderStatuses.get(ticker);
    const isExecuted = executedTickers.has(ticker) || orderStatus?.status === 'approved';
    if (!isExecuted || executedOrdersInfo.processedTickers.has(ticker)) {
      return;
    }

    const planAction = planActionByTicker.get(ticker);
    const orderValue = calculateOrderNotional(position, undefined, planAction);
    if (!Number.isFinite(orderValue) || orderValue <= 0) {
      return;
    }

    executedOrdersInfo.executedValue += position.action === 'SELL'
      ? orderValue
      : -orderValue;
    executedOrdersInfo.executedCount += 1;
    executedOrdersInfo.processedTickers.add(ticker);
  });

  const executedSummaryText = (totalActionableOrders > 0 && executedOrdersInfo.executedCount > 0)
    ? `${executedOrdersInfo.executedCount}/${totalActionableOrders} executed -> actual change: ${formatSignedCurrency(executedOrdersInfo.executedValue)}`
    : null;

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
                      ${formatCurrency(summaryMetrics.totalBuyValue)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summaryMetrics.buyCount} {summaryMetrics.buyCount === 1 ? 'position' : 'positions'}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Sell Value</span>
                      <TrendingDown className="w-4 h-4 text-red-500" />
                    </div>
                    <p className="text-lg font-semibold text-red-600">
                      ${formatCurrency(summaryMetrics.totalSellValue)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summaryMetrics.sellCount} {summaryMetrics.sellCount === 1 ? 'position' : 'positions'}
                    </p>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Net Cash Flow</span>
                      <DollarSign className="w-4 h-4 text-blue-500" />
                    </div>
                    <p className="text-lg font-semibold" style={{ color: '#fc0' }}>
                      {formatSignedCurrency(netCashFlow)}
                    </p>
                    {executedSummaryText && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {executedSummaryText}
                      </p>
                    )}
                  </Card>
                </div>

                {/* Approved Orders Section */}
                {(() => {
                  // Get approved positions from multiple sources
                  const approvedPositions = rebalanceData?.recommendedPositions?.filter((position: RebalancePosition) => {
                    // Skip HOLD positions
                    if (position.shareChange === 0) return false;
                    
                    // Check if this position has been approved via orderStatuses (immediate update)
                    const orderStatus = orderStatuses.get(position.ticker);
                    if (orderStatus?.status === 'approved') {
                      return true;
                    }
                    
                    // Check if it's in executedTickers (immediate update)
                    if (executedTickers.has(position.ticker)) {
                      return true;
                    }
                    
                    // Also check trading_actions for persisted approved status
                    if (rebalanceData.trading_actions && position.tradeActionId) {
                      const tradeAction = rebalanceData.trading_actions.find((ta: any) => 
                        ta.id === position.tradeActionId
                      );
                      if (tradeAction && tradeAction.status === 'approved') {
                        return true;
                      }
                    }
                    
                    return false;
                  }) || [];
                  
                  console.log('Checking for approved orders:', {
                    approvedCount: approvedPositions.length,
                    orderStatuses: Array.from(orderStatuses.entries()),
                    executedTickers: Array.from(executedTickers)
                  });
                  
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
                        {approvedPositions.map((position: RebalancePosition) => {
                          // Find the trading action for metadata if it exists
                          const tradeAction = rebalanceData.trading_actions?.find((ta: any) => 
                            ta.id === position.tradeActionId || 
                            (ta.ticker === position.ticker && ta.status === 'approved')
                          );
                          
                          // Get the order status from local state first (most up-to-date)
                          const localOrderStatus = orderStatuses.get(position.ticker);
                          
                          const effectiveOrderStatus = {
                            status: 'approved',
                            alpacaOrderId: localOrderStatus?.alpacaOrderId || 
                                          tradeAction?.metadata?.alpaca_order?.id || 
                                          tradeAction?.alpaca_order_id ||
                                          position.alpacaOrderId,
                            alpacaStatus: localOrderStatus?.alpacaStatus ||
                                         tradeAction?.metadata?.alpaca_order?.status
                          };
                          
                          return (
                            <RebalancePositionCard
                              key={`approved-${position.ticker}`}
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
