import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { getCompleteMessages } from "@/lib/getCompleteMessages";

interface UseAnalysisDataProps {
  ticker?: string;
  analysisId?: string;
  analysisDate?: string;
  isOpen: boolean;
}

export function useAnalysisData({ ticker, analysisId, analysisDate, isOpen }: UseAnalysisDataProps) {
  const { user } = useAuth();
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiveAnalysis, setIsLiveAnalysis] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | undefined>();

  useEffect(() => {
    if (!isOpen || (!ticker && !analysisId) || !user) return;

    let mounted = true;

    const loadAnalysis = async () => {
      if (!mounted) return;
      
      try {
        let analysisToLoad = null;

        if (analysisId) {
          // Load specific analysis by ID
          const { data, error } = await supabase
            .from('analysis_history')
            .select('*')
            .eq('id', analysisId)
            .eq('user_id', user.id)
            .single();

          if (error) {
            if (error.code === 'PGRST116') {
              throw new Error('Analysis not found. It may have been deleted.');
            }
            throw error;
          }
          analysisToLoad = data;
        } else if (analysisDate) {
          // Load specific historical analysis - get the most recent one for that date
          const { data, error } = await supabase
            .from('analysis_history')
            .select('*')
            .eq('user_id', user.id)
            .eq('ticker', ticker)
            .eq('analysis_date', analysisDate)
            .order('created_at', { ascending: false })
            .limit(1);

          if (error) throw error;
          analysisToLoad = data?.[0] || null;
        } else {
          // First check for running analysis
          const { data: runningData, error: runningError } = await supabase
            .from('analysis_history')
            .select('*')
            .eq('user_id', user.id)
            .eq('ticker', ticker)
            .eq('analysis_status', 0)
            .order('created_at', { ascending: false })
            .limit(1);

          if (!runningError && runningData && runningData.length > 0) {
            analysisToLoad = runningData[0];
            console.log('Found running analysis for', ticker);
          } else {
            // No running analysis, get most recent
            const { data: recentData, error: recentError } = await supabase
              .from('analysis_history')
              .select('*')
              .eq('user_id', user.id)
              .eq('ticker', ticker)
              .order('created_at', { ascending: false })
              .limit(1);

            if (recentError) throw recentError;
            analysisToLoad = recentData?.[0];
          }
        }

        if (!analysisToLoad) {
          console.warn(`No analysis found for ${ticker}${analysisDate ? ` on ${analysisDate}` : ''}`);
          setError(`No analysis found for ${ticker}${analysisDate ? ` on ${analysisDate}` : ''}`);
          return;
        }

        if (analysisToLoad && mounted) {
          // Determine status
          let status = 'running';
          if (analysisToLoad.analysis_status === -1) {
            status = analysisToLoad.is_canceled ? 'canceled' : 'error';
          } else if (analysisToLoad.analysis_status === 0) {
            // Check if this is a rebalance analysis and Risk Manager has completed
            if (analysisToLoad.rebalance_request_id && 
                analysisToLoad.agent_insights?.riskManager) {
              // For rebalance workflows, consider complete when Risk Manager finishes
              console.log('Rebalance analysis with Risk Manager complete - marking as completed');
              status = 'completed';
            } else {
              status = 'running';
            }
          } else if (analysisToLoad.analysis_status === 1) {
            status = 'completed';
          }

          setIsLiveAnalysis(status === 'running');
          
          console.log('Loaded analysis:', {
            ticker: analysisToLoad.ticker,
            analysis_status: analysisToLoad.analysis_status,
            status: status,
            id: analysisToLoad.id,
            created_at: analysisToLoad.created_at
          });

          // Fetch complete messages including those in queue
          const messageResult = await getCompleteMessages(analysisToLoad.id);
          
          // Fetch trade order if it exists (regardless of analysis completion status)
          let tradeOrderData = null;
          const { data: tradeOrders, error: tradeError } = await supabase
            .from('trading_actions')
            .select('*')
            .eq('analysis_id', analysisToLoad.id)
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (!tradeError && tradeOrders && tradeOrders.length > 0) {
            const order = tradeOrders[0];
            tradeOrderData = {
              id: order.id,
              shares: parseFloat(order.shares || 0),
              dollarAmount: parseFloat(order.dollar_amount || 0),
              status: order.status,
              alpacaOrderId: order.alpaca_order_id,
              alpacaOrderStatus: order.alpaca_order_status,
              alpacaFilledQty: order.alpaca_filled_qty ? parseFloat(order.alpaca_filled_qty) : null,
              alpacaFilledPrice: order.alpaca_filled_price ? parseFloat(order.alpaca_filled_price) : null,
              createdAt: order.created_at,
              executedAt: order.executed_at,
              price: order.price,
              beforeAllocation: order.metadata?.beforePosition?.allocation,
              afterAllocation: order.metadata?.afterPosition?.allocation,
              beforeShares: order.metadata?.beforePosition?.shares,
              afterShares: order.metadata?.afterPosition?.shares,
              beforeValue: order.metadata?.beforePosition?.value,
              afterValue: order.metadata?.afterPosition?.value
            };
          }
          
          // Debug logging to understand data structure
          console.log('analysisToLoad:', analysisToLoad);
          console.log('analysisToLoad.agent_insights:', analysisToLoad.agent_insights);
          console.log('analysisToLoad.full_analysis:', analysisToLoad.full_analysis);
          
          setAnalysisData({
            ...analysisToLoad,
            status,
            messages: messageResult.success ? messageResult.messages : (analysisToLoad.full_analysis?.messages || []),
            workflowSteps: analysisToLoad.full_analysis?.workflowSteps || [],
            tradeOrder: tradeOrderData,
            // Explicitly include agent_insights
            agent_insights: analysisToLoad.agent_insights || {}
          });
          
          if (messageResult.success && messageResult.queueCount > 0) {
            console.log(`Loaded ${messageResult.totalCount} messages (${messageResult.historyCount} from history, ${messageResult.queueCount} from queue)`);
          }

          // Start polling if running
          if (status === 'running' && !analysisDate) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            intervalRef.current = setInterval(() => {
              loadAnalysis();
            }, 3000); // Poll every 3 seconds
          } else if (status !== 'running' && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = undefined;
          }
        }
      } catch (err: any) {
        console.error('Error loading analysis:', err);
        if (mounted) {
          setError(err.message || 'Failed to load analysis');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    // Initial load
    loadAnalysis();

    return () => {
      mounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, [isOpen, ticker, analysisId, user, analysisDate]);

  // Update analysis data helper
  const updateAnalysisData = (updates: Partial<any>) => {
    setAnalysisData((current: any) => ({
      ...current,
      ...updates
    }));
  };

  return {
    analysisData,
    loading,
    error,
    isLiveAnalysis,
    updateAnalysisData,
    setError
  };
}