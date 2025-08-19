import {
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
  TrendingDown,
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface TradeOrderCardProps {
  analysisData: any;
  onApprove: () => void;
  onReject: () => void;
  isExecuted?: boolean;
}

// Trade Order Card Component - similar to RebalancePositionCard
export default function TradeOrderCard({
  analysisData,
  onApprove,
  onReject,
  isExecuted = false
}: TradeOrderCardProps) {
  const decision = analysisData.decision;
  const confidence = analysisData.confidence;
  const ticker = analysisData.ticker;

  // Use the actual trade order data if available (from trading_actions table)
  const tradeOrder = analysisData.tradeOrder;

  // For individual analysis, only use Portfolio Manager's finalDecision (not Risk Manager's decision)
  const portfolioManagerInsight = analysisData.agent_insights?.portfolioManager;

  // Only use trade order data if Portfolio Manager actually created one (not HOLD)
  // Otherwise use Portfolio Manager's final decision data
  const finalDecision = portfolioManagerInsight?.finalDecision;

  // Extract allocation values from various possible locations
  // First check if we have the data from the trade order (fetched from database)
  // Then fallback to portfolio manager's insight data
  const beforeAllocation = tradeOrder?.beforeAllocation ||
    finalDecision?.beforeAllocation ||
    finalDecision?.currentAllocation ||
    finalDecision?.beforePosition?.allocation ||
    finalDecision?.currentPosition?.allocation ||
    portfolioManagerInsight?.currentAllocation ||
    0;

  const afterAllocation = tradeOrder?.afterAllocation ||
    finalDecision?.afterAllocation ||
    finalDecision?.targetAllocation ||
    finalDecision?.afterPosition?.allocation ||
    finalDecision?.targetPosition?.allocation ||
    finalDecision?.percentOfPortfolio ||
    portfolioManagerInsight?.targetAllocation ||
    portfolioManagerInsight?.percentOfPortfolio ||
    0;

  const percentOfPortfolio = tradeOrder?.afterAllocation ||
    finalDecision?.percentOfPortfolio ||
    finalDecision?.targetAllocation ||
    afterAllocation;

  // Extract order size information
  const orderDollarAmount = tradeOrder?.dollarAmount ||
    finalDecision?.dollarAmount ||
    finalDecision?.orderSize?.dollarAmount ||
    finalDecision?.changes?.value ||
    portfolioManagerInsight?.dollarAmount ||
    portfolioManagerInsight?.finalDecision?.dollarAmount;

  const orderShares = tradeOrder?.shares ||
    finalDecision?.shares ||
    finalDecision?.orderSize?.shares ||
    finalDecision?.quantity ||
    finalDecision?.shareChange ||
    portfolioManagerInsight?.shares ||
    portfolioManagerInsight?.finalDecision?.shares;

  // Also extract before/after shares and values if available
  const beforeShares = tradeOrder?.beforeShares || finalDecision?.beforePosition?.shares || 0;
  const afterShares = tradeOrder?.afterShares || finalDecision?.afterPosition?.shares || orderShares;
  const beforeValue = tradeOrder?.beforeValue || finalDecision?.beforePosition?.value || 0;
  const afterValue = tradeOrder?.afterValue || finalDecision?.afterPosition?.value || orderDollarAmount;

  // Debug logging to understand data structure
  console.log('TradeOrderCard - Full analysisData:', analysisData);
  console.log('TradeOrderCard - Portfolio Manager insight:', portfolioManagerInsight);
  console.log('TradeOrderCard - Trade Order:', tradeOrder);
  console.log('TradeOrderCard - Final Decision:', finalDecision);
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

  // Check Portfolio Manager's final decision action (not Risk Manager's decision)
  const portfolioManagerAction = portfolioManagerInsight?.finalDecision?.action ||
    portfolioManagerInsight?.action ||
    tradeOrder?.action;

  // Don't show trade order if Portfolio Manager decided HOLD
  if (portfolioManagerAction === 'HOLD') {
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
  if (!finalDecision) {
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

  // Check the actual order status from database
  const orderStatus = tradeOrder?.status;
  const isPending = orderStatus === 'pending';
  const isApproved = orderStatus === 'approved';
  const isRejected = orderStatus === 'rejected';
  const isOrderExecuted = orderStatus === 'executed' || isExecuted;

  return (
    <div className={`rounded-lg border transition-all ${isOrderExecuted
      ? (decision === 'BUY' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20')
      : isApproved
        ? (decision === 'BUY' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20')
        : isRejected
          ? 'bg-gray-500/5 border-gray-500/20'
          : isPending
            ? (decision === 'BUY' ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20')
            : 'bg-muted/20 border-muted opacity-60'
      }`}>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${decision === 'BUY'
              ? 'bg-green-500/10'
              : decision === 'SELL'
                ? 'bg-red-500/10'
                : 'bg-primary/10'
              }`}>
              {decision === 'BUY' ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : decision === 'SELL' ? (
                <TrendingDown className="w-5 h-5 text-red-600" />
              ) : (
                <DollarSign className="w-5 h-5 text-primary" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-lg">{ticker}</h4>
                <Badge variant={decision === 'BUY' ? 'buy' : decision === 'SELL' ? 'sell' : 'hold'}>
                  {decision === 'BUY' ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : decision === 'SELL' ? (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {decision}
                </Badge>
                {/* Show actual order status */}
                {orderStatus && (
                  <Badge
                    variant={
                      orderStatus === 'executed' ? 'success' :
                        orderStatus === 'approved' ? 'outline' :
                          orderStatus === 'rejected' ? 'destructive' :
                            orderStatus === 'pending' ? 'outline' : 'outline'
                    }
                    className={`text-xs ${orderStatus === 'executed' ? 'text-green-600' :
                      orderStatus === 'approved' ? 'text-green-600' :
                        orderStatus === 'rejected' ? 'text-red-600' :
                          orderStatus === 'pending' ? 'tex-white-600' : ''
                      }`}
                  >
                    {orderStatus === 'executed' && <CheckCircle className="w-3 h-3 mr-1" />}
                    {orderStatus === 'rejected' && <XCircle className="w-3 h-3 mr-1" />}
                    {orderStatus === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                    {orderStatus === 'approved' && <Clock className="w-3 h-3 mr-1" />}
                    {orderStatus.charAt(0).toUpperCase() + orderStatus.slice(1)}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Trade order ready for execution</p>
            </div>
          </div>
          <div className="text-right">
            {(tradeOrder || finalDecision) && (
              <>
                <p className="text-sm font-semibold">
                  {orderDollarAmount && orderDollarAmount > 0 ? (
                    `$${Math.abs(orderDollarAmount).toLocaleString()}`
                  ) : orderShares ? (
                    `${orderShares} shares`
                  ) : (
                    'Order details pending'
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {orderDollarAmount && orderDollarAmount > 0 ? 'Dollar-based order' :
                    orderShares ? 'Share-based order' : 'Pending'}
                </p>
                {/* Show Alpaca order details if available */}
                {tradeOrder?.alpacaOrderId && (
                  <div className="mt-1">
                    <p className="text-xs text-muted-foreground">
                      Order: {tradeOrder.alpacaOrderId.substring(0, 8)}...
                    </p>
                    {tradeOrder.alpacaOrderStatus && (
                      <Badge
                        variant={
                          tradeOrder.alpacaOrderStatus === 'filled' ? 'success' :
                            tradeOrder.alpacaOrderStatus === 'partially_filled' ? 'secondary' :
                              ['new', 'pending_new', 'accepted'].includes(tradeOrder.alpacaOrderStatus) ? 'outline' :
                                'destructive'
                        }
                        className={`text-xs mt-1 ${tradeOrder.alpacaOrderStatus === 'filled' ? 'text-green-600' :
                          tradeOrder.alpacaOrderStatus === 'partially_filled' ? 'text-blue-600' :
                            ['new', 'pending_new', 'accepted'].includes(tradeOrder.alpacaOrderStatus) ? 'text-green-600' :
                              'text-red-600'
                          }`}
                      >
                        {tradeOrder.alpacaOrderStatus === 'filled' ? 'Filled' :
                          tradeOrder.alpacaOrderStatus === 'partially_filled' ? 'Partial' :
                            ['new', 'pending_new', 'accepted'].includes(tradeOrder.alpacaOrderStatus) ? 'Placed' :
                              tradeOrder.alpacaOrderStatus}
                      </Badge>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Confidence and Portfolio Impact */}
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

        {/* Risk Assessment Summary */}
        {analysisData.agent_insights?.riskManager && (
          <div className="pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground italic">
              {analysisData.agent_insights.riskManager.recommendation ||
                analysisData.agent_insights.riskManager.assessment ||
                'Risk assessment completed'}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {isPending && (
          <div className="flex gap-2 pt-3 border-t border-border/50">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 text-xs border-green-500/50 text-green-600 hover:bg-green-500/10 hover:border-green-500 hover:text-green-600"
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              Approve & Execute
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-9 text-xs border-red-500/50 text-red-600 hover:bg-red-500/10 hover:border-red-500 hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
            >
              <XCircle className="w-3 h-3 mr-1" />
              Reject Order
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}