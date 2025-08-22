import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
// Import centralized status system
import {
  type TradeOrderStatus,
  type AlpacaOrderStatus,
  TRADE_ORDER_STATUS,
  ALPACA_ORDER_STATUS,
  isAlpacaOrderTerminal,
  isAlpacaOrderFilled
} from "@/lib/statusTypes";

interface UseOrderActionsProps {
  analysisData: any;
  updateAnalysisData: (updates: Partial<any>) => void;
}

export function useOrderActions({ analysisData, updateAnalysisData }: UseOrderActionsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOrderExecuted, setIsOrderExecuted] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // Poll Alpaca order status
  const pollAlpacaOrderStatus = async (alpacaOrderId: string) => {
    let attempts = 0;
    const maxAttempts = 12; // Poll for up to 1 minute

    const pollInterval = setInterval(async () => {
      attempts++;

      try {
        // Fetch updated trade order from database
        const { data: tradeOrder, error } = await supabase
          .from('trading_actions')
          .select('*')
          .eq('analysis_id', analysisData.id)
          .eq('user_id', user?.id)
          .single();

        if (!error && tradeOrder) {
          // Update local state
          if (analysisData.tradeOrder) {
            const updatedTradeOrder = {
              ...analysisData.tradeOrder,
              alpacaOrderStatus: tradeOrder.alpaca_order_status,
              alpacaFilledQty: tradeOrder.alpaca_filled_qty,
              alpacaFilledPrice: tradeOrder.alpaca_filled_price,
              status: tradeOrder.status
            };
            updateAnalysisData({
              tradeOrder: updatedTradeOrder
            });
          }

          // Check if order reached terminal state
          const alpacaStatus = tradeOrder.alpaca_order_status as AlpacaOrderStatus;
          if (isAlpacaOrderTerminal(alpacaStatus)) {
            clearInterval(pollInterval);

            if (alpacaStatus === ALPACA_ORDER_STATUS.FILLED) {
              toast({
                title: "Order Filled",
                description: `${analysisData.ticker} order filled at $${tradeOrder.alpaca_filled_price?.toFixed(2)} for ${tradeOrder.alpaca_filled_qty} shares`,
              });
            } else if ([ALPACA_ORDER_STATUS.CANCELED, ALPACA_ORDER_STATUS.REJECTED, ALPACA_ORDER_STATUS.EXPIRED].includes(alpacaStatus)) {
              toast({
                title: "Order Not Filled",
                description: `${analysisData.ticker} order was ${tradeOrder.alpaca_order_status}`,
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

  // Handle order approval
  const handleApproveOrder = async () => {
    if (!analysisData?.tradeOrder?.id) {
      toast({
        title: "Error",
        description: "Trade order ID not found",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    try {
      console.log('Approving order with data:', {
        tradeActionId: analysisData.tradeOrder.id,
        action: 'approve',
        analysisData: analysisData
      });

      toast({
        title: "Executing Order",
        description: "Submitting order to Alpaca...",
      });

      // Call the edge function to execute the trade
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          tradeActionId: analysisData.tradeOrder.id,
          action: 'approve'
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        // Try to get the actual error response
        if (error.context && typeof error.context.text === 'function') {
          try {
            const errorText = await error.context.text();
            console.error('Error response body:', errorText);
          } catch (e) {
            console.error('Could not read error response:', e);
          }
        }
        throw error;
      }

      if (data.success) {
        setIsOrderExecuted(true);

        // Update the local trade order data
        if (analysisData.tradeOrder) {
          const updatedTradeOrder = {
            ...analysisData.tradeOrder,
            status: TRADE_ORDER_STATUS.APPROVED,
            alpacaOrderId: data.alpacaOrderId,
            alpacaOrderStatus: data.alpacaStatus
          };
          updateAnalysisData({
            tradeOrder: updatedTradeOrder
          });
        }

        toast({
          title: "Order Executed",
          description: `${analysisData.decision} order for ${analysisData.ticker} has been submitted to Alpaca. Order ID: ${data.alpacaOrderId?.substring(0, 8)}...`,
        });

        // Start polling for order status updates
        if (data.alpacaOrderId) {
          pollAlpacaOrderStatus(data.alpacaOrderId);
        }
      } else {
        toast({
          title: "Order Failed",
          description: data.message || "Failed to execute order",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error executing order:', error);
      console.error('Error details:', {
        message: error.message,
        context: error.context,
        details: error.details,
        status: error.status
      });
      toast({
        title: "Order Failed",
        description: error.message || "Failed to execute order on Alpaca",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Handle order rejection  
  const handleRejectOrder = async () => {
    if (!analysisData?.tradeOrder?.id) {
      toast({
        title: "Error",
        description: "Trade order ID not found",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    try {

      // Call the edge function to reject the trade
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          tradeActionId: analysisData.tradeOrder.id,
          action: 'reject'
        }
      });

      if (error) {
        console.error('Supabase function error:', error);
        // Try to get the actual error response
        if (error.context && typeof error.context.text === 'function') {
          try {
            const errorText = await error.context.text();
            console.error('Error response body:', errorText);
          } catch (e) {
            console.error('Could not read error response:', e);
          }
        }
        throw error;
      }

      if (data.success) {
        // Update the local trade order data
        if (analysisData.tradeOrder) {
          const updatedTradeOrder = {
            ...analysisData.tradeOrder,
            status: TRADE_ORDER_STATUS.REJECTED
          };
          updateAnalysisData({
            tradeOrder: updatedTradeOrder
          });
        }

        toast({
          title: "Order Rejected",
          description: `${analysisData.decision} order for ${analysisData.ticker} has been rejected.`,
        });
      }
    } catch (error: any) {
      console.error('Error rejecting order:', error);
      console.error('Error details:', {
        message: error.message,
        context: error.context,
        details: error.details,
        status: error.status
      });
      toast({
        title: "Error",
        description: error.message || "Failed to reject order",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return {
    isOrderExecuted,
    isExecuting,
    handleApproveOrder,
    handleRejectOrder,
    pollAlpacaOrderStatus
  };
}