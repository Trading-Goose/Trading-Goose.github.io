import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  XCircle,
  Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
// Import centralized status system
import {
  type TradeOrderStatus,
  type AlpacaOrderStatus,
  TRADE_ORDER_STATUS,
  ALPACA_ORDER_STATUS,
  isTradeOrderPending,
  isTradeOrderApproved,
  isTradeOrderRejected,
  getTradeOrderStatusDisplayText,
  getAlpacaStatusDisplayText,
  isValidAlpacaOrderStatus
} from "@/lib/statusTypes";

interface TradeOrderCardProps {
  analysisData: any;
  onApprove: () => void;
  onReject: () => void;
  isExecuted?: boolean;
  isExecuting?: boolean;
}

// Trade Order Card Component - similar to RebalancePositionCard
export default function TradeOrderCard({
  analysisData,
  onApprove,
  onReject,
  isExecuted = false,
  isExecuting = false
}: TradeOrderCardProps) {
  // Use the actual trade order data if available (from trading_actions table)
  const tradeOrder = analysisData.tradeOrder;

  // Use Portfolio Manager's decision if available, preferring trade order action
  const decision = tradeOrder?.action ||
    analysisData.agent_insights?.portfolioManager?.finalDecision?.action ||
    analysisData.agent_insights?.portfolioManager?.decision?.action ||
    analysisData.agent_insights?.portfolioManager?.action ||
    analysisData.decision;
  const confidence = analysisData.confidence;
  const ticker = analysisData.ticker;

  // For individual analysis, only use Portfolio Manager's finalDecision (not Risk Manager's decision)
  const portfolioManagerInsight = analysisData.agent_insights?.portfolioManager;

  // Only use trade order data if Portfolio Manager actually created one (not HOLD)
  // Otherwise use Portfolio Manager's final decision data
  const finalDecision = portfolioManagerInsight?.finalDecision;

  // Check if the order has been rejected
  const orderStatus = tradeOrder?.status as TradeOrderStatus;
  const isOrderRejected = isTradeOrderRejected(orderStatus);

  // Extract allocation values from various possible locations
  // For rejected orders, ALWAYS use the saved trade order data if available
  // to show what was intended at the time of creation, not current values
  const beforeAllocation = (isOrderRejected && tradeOrder?.beforeAllocation !== undefined) 
    ? tradeOrder.beforeAllocation
    : tradeOrder?.beforeAllocation ||
      finalDecision?.beforeAllocation ||
      finalDecision?.currentAllocation ||
      finalDecision?.beforePosition?.allocation ||
      finalDecision?.currentPosition?.allocation ||
      portfolioManagerInsight?.currentAllocation ||
      0;

  const afterAllocation = (isOrderRejected && tradeOrder?.afterAllocation !== undefined)
    ? tradeOrder.afterAllocation  
    : tradeOrder?.afterAllocation ||
      finalDecision?.afterAllocation ||
      finalDecision?.targetAllocation ||
      finalDecision?.afterPosition?.allocation ||
      finalDecision?.targetPosition?.allocation ||
      finalDecision?.percentOfPortfolio ||
      portfolioManagerInsight?.targetAllocation ||
      portfolioManagerInsight?.percentOfPortfolio ||
      0;

  const percentOfPortfolio = (isOrderRejected && tradeOrder?.afterAllocation !== undefined)
    ? tradeOrder.afterAllocation
    : tradeOrder?.afterAllocation ||
      finalDecision?.percentOfPortfolio ||
      finalDecision?.targetAllocation ||
      afterAllocation;

  // Extract order size information
  // For rejected orders, always use saved data to show what was intended
  const orderDollarAmount = (isOrderRejected && tradeOrder?.dollarAmount !== undefined)
    ? tradeOrder.dollarAmount
    : tradeOrder?.dollarAmount ||
      finalDecision?.dollarAmount ||
      finalDecision?.orderSize?.dollarAmount ||
      finalDecision?.changes?.value ||
      portfolioManagerInsight?.dollarAmount ||
      portfolioManagerInsight?.finalDecision?.dollarAmount;

  const orderShares = (isOrderRejected && tradeOrder?.shares !== undefined)
    ? tradeOrder.shares
    : tradeOrder?.shares ||
      finalDecision?.shares ||
      finalDecision?.orderSize?.shares ||
      finalDecision?.quantity ||
      finalDecision?.shareChange ||
      portfolioManagerInsight?.shares ||
      portfolioManagerInsight?.finalDecision?.shares;

  // Also extract before/after shares and values if available
  const beforeShares = (isOrderRejected && tradeOrder?.beforeShares !== undefined)
    ? tradeOrder.beforeShares
    : tradeOrder?.beforeShares || finalDecision?.beforePosition?.shares || 0;
  
  const afterShares = (isOrderRejected && tradeOrder?.afterShares !== undefined)
    ? tradeOrder.afterShares
    : tradeOrder?.afterShares || finalDecision?.afterPosition?.shares || orderShares;
  
  const beforeValue = (isOrderRejected && tradeOrder?.beforeValue !== undefined)
    ? tradeOrder.beforeValue
    : tradeOrder?.beforeValue || finalDecision?.beforePosition?.value || 0;
  
  const afterValue = (isOrderRejected && tradeOrder?.afterValue !== undefined)
    ? tradeOrder.afterValue
    : tradeOrder?.afterValue || finalDecision?.afterPosition?.value || orderDollarAmount;

  // Debug logging to understand data structure
  console.log('TradeOrderCard - Full analysisData:', analysisData);
  console.log('TradeOrderCard - Portfolio Manager insight:', portfolioManagerInsight);
  console.log('TradeOrderCard - Trade Order:', tradeOrder);
  console.log('TradeOrderCard - Final Decision:', finalDecision);
  console.log('TradeOrderCard - Decision variable:', decision);
  console.log('TradeOrderCard - Allocations:', {
    beforeAllocation,
    afterAllocation,
    percentOfPortfolio,
    orderDollarAmount,
    orderShares,
    beforeShares,
    afterShares,
    beforeValue,
    afterValue
  });

  // If we have an actual trade order from the database, always show it
  // Only show HOLD message if there's no trade order AND the decision is HOLD
  if (!tradeOrder && !finalDecision && decision === 'HOLD') {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 opacity-60">
        <div className="flex items-center gap-3">
          <Badge variant="outline">HOLD</Badge>
          <span className="text-sm text-muted-foreground">Portfolio Manager decided to hold - no action required</span>
        </div>
      </div>
    );
  }

  // Show different states based on Portfolio Manager's decision status
  if (!finalDecision && !tradeOrder) {
    if (confidence < 60) {
      return (
        <div className="rounded-lg border bg-orange-500/5 border-orange-500/20 p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <span className="text-sm">No trade order generated (confidence below 60% threshold)</span>
          </div>
        </div>
      );
    } else {
      // High confidence but Portfolio Manager hasn't made final decision yet
      return (
        <div className="rounded-lg border bg-blue-500/5 border-blue-500/20 p-4">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-sm">Waiting for Portfolio Manager to finalize position sizing and create trade order</span>
          </div>
        </div>
      );
    }
  }

  // Check the actual order status from database or props
  // The tradeOrder status is updated immediately in the parent component
  // orderStatus is already defined above
  const isPending = !orderStatus || isTradeOrderPending(orderStatus);
  const isApproved = isTradeOrderApproved(orderStatus) || isExecuted;  // Also check isExecuted prop
  const isRejected = isOrderRejected;  // Use the already computed value
  
  // Get Alpaca order details if available
  const alpacaOrderId = tradeOrder?.alpacaOrderId;
  const alpacaOrderStatus = tradeOrder?.alpacaOrderStatus;
  const isOrderExecuted = alpacaOrderStatus === ALPACA_ORDER_STATUS.FILLED || isExecuted;

  // Determine card background based on status and action
  const getCardClasses = () => {
    // For HOLD orders, use default outline style
    if (decision === 'HOLD') {
      return '';
    }

    if (isPending) {
      return 'bg-yellow-500/5 border-yellow-500/20 hover:bg-yellow-500/10';
    } else if (isOrderExecuted) {
      if (decision === 'BUY') {
        return 'bg-green-500/5 border-green-500/20';
      } else if (decision === 'SELL') {
        return 'bg-red-500/5 border-red-500/20';
      }
    } else if (isApproved) {
      if (decision === 'BUY') {
        return 'bg-green-500/5 border-green-500/20';
      } else if (decision === 'SELL') {
        return 'bg-red-500/5 border-red-500/20';
      }
    } else if (isRejected) {
      return 'bg-gray-500/5 border-gray-500/20';
    }
    return 'bg-gray-500/5 border-gray-500/20';
  };

  return (
    <div className={`p-3 rounded-lg border transition-colors flex flex-col gap-3 ${getCardClasses()}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3 flex-1">
          <div className={`p-2 rounded-full h-fit ${decision === 'BUY' ? 'bg-green-500/10' : decision === 'SELL' ? 'bg-red-500/10' : 'bg-gray-500/10'}`}>
            {decision === 'BUY' ? (
              <ArrowUpRight className="h-4 w-4 text-green-500" />
            ) : decision === 'SELL' ? (
              <ArrowDownRight className="h-4 w-4 text-red-500" />
            ) : (
              <Activity className="h-4 w-4 text-gray-500" />
            )}
          </div>

          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{ticker}</span>
              <Badge
                variant={decision === 'BUY' ? 'buy' : decision === 'SELL' ? 'sell' : 'hold'}
                className="text-xs"
              >
                {decision}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {orderDollarAmount > 0
                  ? `$${Number(orderDollarAmount).toLocaleString()} order`
                  : orderShares
                    ? `${Number(orderShares).toFixed(2)} shares`
                    : 'Order details pending'
                }
              </span>
              {orderDollarAmount > 0 && (
                <span className="text-xs font-medium">
                  ${Number(orderDollarAmount).toLocaleString()}
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
              {portfolioManagerInsight?.rationale || 'Trade order ready for execution'}
            </p>
          </div>
        </div>

        {/* Action buttons and details */}
        <div className="flex flex-col gap-1">
          {/* Alpaca Order Status Badge */}
          {tradeOrder?.alpacaOrderId && tradeOrder?.alpacaOrderStatus && (
            <div className="flex flex-col items-center justify-center">
              {(() => {
                let rawStatus = tradeOrder.alpacaOrderStatus.toString().toLowerCase();
                if (rawStatus === 'cancelled') {
                  rawStatus = ALPACA_ORDER_STATUS.CANCELED;
                }

                const isKnownStatus = isValidAlpacaOrderStatus(rawStatus);
                const normalizedStatus = isKnownStatus ? (rawStatus as AlpacaOrderStatus) : null;

                let variant: any = "outline";
                let icon = null;
                let customClasses = "";

                const pendingStatuses: AlpacaOrderStatus[] = [
                  ALPACA_ORDER_STATUS.NEW,
                  ALPACA_ORDER_STATUS.PENDING_NEW,
                  ALPACA_ORDER_STATUS.ACCEPTED,
                  ALPACA_ORDER_STATUS.PENDING_REPLACE,
                  ALPACA_ORDER_STATUS.PENDING_CANCEL,
                  ALPACA_ORDER_STATUS.ACCEPTED_FOR_BIDDING
                ];

                const negativeStatuses: AlpacaOrderStatus[] = [
                  ALPACA_ORDER_STATUS.CANCELED,
                  ALPACA_ORDER_STATUS.EXPIRED,
                  ALPACA_ORDER_STATUS.REPLACED,
                  ALPACA_ORDER_STATUS.REJECTED,
                  ALPACA_ORDER_STATUS.STOPPED,
                  ALPACA_ORDER_STATUS.SUSPENDED
                ];

                if (normalizedStatus === ALPACA_ORDER_STATUS.FILLED) {
                  variant = "success";
                  icon = <CheckCircle className="h-3 w-3 mr-1" />;
                } else if (normalizedStatus === ALPACA_ORDER_STATUS.PARTIALLY_FILLED) {
                  variant = "default";
                  icon = <Clock className="h-3 w-3 mr-1" />;
                  customClasses = "bg-blue-500 text-white border-blue-500";
                } else if (normalizedStatus && pendingStatuses.includes(normalizedStatus)) {
                  variant = "warning";
                  icon = <Clock className="h-3 w-3 mr-1" />;
                } else if (normalizedStatus && negativeStatuses.includes(normalizedStatus)) {
                  variant = "destructive";
                  icon = <XCircle className="h-3 w-3 mr-1" />;
                }

                const displayText = normalizedStatus
                  ? getAlpacaStatusDisplayText(normalizedStatus)
                  : tradeOrder.alpacaOrderStatus;

                const filledQty = typeof tradeOrder.alpacaFilledQty === 'number'
                  ? tradeOrder.alpacaFilledQty
                  : tradeOrder.alpacaFilledQty
                    ? Number(tradeOrder.alpacaFilledQty)
                    : 0;

                const totalOrderShares = typeof tradeOrder.shares === 'number'
                  ? tradeOrder.shares
                  : tradeOrder.shares
                    ? Number(tradeOrder.shares)
                    : 0;

                const showPartialDetails = normalizedStatus === ALPACA_ORDER_STATUS.PARTIALLY_FILLED &&
                  filledQty > 0 && totalOrderShares > 0;

                const filledPrice = typeof tradeOrder.alpacaFilledPrice === 'number'
                  ? tradeOrder.alpacaFilledPrice
                  : tradeOrder.alpacaFilledPrice
                    ? Number(tradeOrder.alpacaFilledPrice)
                    : 0;

                const hasFillDetails = filledQty > 0 && filledPrice > 0;

                return (
                  <>
                    <Badge
                      variant={variant}
                      className={`text-xs ${customClasses}`}
                    >
                      {icon}
                      {displayText}
                      {showPartialDetails && (
                        <span className="ml-1">
                          ({filledQty.toFixed(2)}/{totalOrderShares.toFixed(2)})
                        </span>
                      )}
                    </Badge>
                    {hasFillDetails && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {filledQty.toFixed(2)} @ ${filledPrice.toFixed(2)}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Show status badge for approved/rejected orders */}
          {isApproved && !alpacaOrderStatus && (
            <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
              <CheckCircle className="h-3 w-3 mr-1" />
              Approved
            </Badge>
          )}

          {isRejected && (
            <Badge variant="outline" className="text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              Rejected
            </Badge>
          )}

          {/* Only show action buttons for pending decisions and NOT HOLD orders */}
          {isPending && !isApproved && !isRejected && decision !== 'HOLD' && (
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

      {/* Additional Details - Confidence and Portfolio Impact */}
      <div className="space-y-3">
        {/* Confidence Level */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Confidence Level</span>
            <span className={`font-medium ${confidence >= 80 ? 'text-green-600 dark:text-green-400' :
              confidence >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              }`}>
              {confidence}%
            </span>
          </div>
          <Progress value={confidence} className="h-2" />
        </div>

        {/* Portfolio Allocation - show if we have either tradeOrder or finalDecision data */}
        {(tradeOrder || finalDecision) && (
          <div className="space-y-2">
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-16">Current:</span>
              <Progress value={beforeAllocation} className="flex-1 h-2" />
              <span className="text-xs font-medium w-12 text-right">
                {beforeAllocation.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-16">Target:</span>
              <Progress value={afterAllocation} className="flex-1 h-2" />
              <span className="text-xs font-medium w-12 text-right">
                {afterAllocation.toFixed(2)}%
              </span>
            </div>
            {/* Additional position details */}
            {percentOfPortfolio > 0 && (
              <div className="text-xs text-muted-foreground pt-1 border-t">
                Position represents {percentOfPortfolio.toFixed(2)}% of total portfolio
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metadata - at bottom of card */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground border-t border-slate-800 pt-2">
        <span>Portfolio Manager</span>
        <span>•</span>
        <span className="capitalize">Analysis</span>
        <span>•</span>
        <span>Confidence: {confidence}%</span>
        {tradeOrder?.createdAt && (
          <>
            <span>•</span>
            <span>{new Date(tradeOrder.createdAt).toLocaleDateString()}</span>
          </>
        )}
      </div>
    </div>
  );
}
