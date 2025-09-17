import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
// Import centralized status system
import {
  type AnalysisStatus,
  ANALYSIS_STATUS,
  isAnalysisActive
} from "@/lib/statusTypes";
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
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>();
  const isFetchingRef = useRef(false);
  const lastDatabaseUpdateRef = useRef<string | null>(null); // Track the actual DB updated_at

  useEffect(() => {
    if (!isOpen || (!ticker && !analysisId) || !user) {
      // Reset the ref when modal closes
      if (!isOpen) {
        lastDatabaseUpdateRef.current = null;
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = undefined;
      }
      return;
    }

    let mounted = true;

    const clearPollTimeout = () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = undefined;
      }
    };

    const schedulePoll = (delay = 3000) => {
      clearPollTimeout();
      pollTimeoutRef.current = setTimeout(() => {
        loadAnalysis();
      }, delay);
    };

    const loadAnalysis = async (isInitialLoad = false) => {
      if (!mounted) return;

      if (typeof window !== 'undefined' && (window as any).__supabaseRefreshingToken) {
        // Pause polling while a token refresh is in flight to avoid unnecessary aborts
        schedulePoll(2000);
        return;
      }

      if (isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;

      if (isInitialLoad) {
        setLoading(true);
      }

      let shouldContinuePolling = false;
      let nextPollDelay = 3000;

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
          setError(null);
          // Determine status - use new string-based status or fallback to numeric for backward compatibility
          let status = 'running';

          if (typeof analysisToLoad.analysis_status === 'string') {
            // New string-based status system
            status = analysisToLoad.analysis_status;

            // Special handling for rebalance workflows
            if (status === ANALYSIS_STATUS.RUNNING && analysisToLoad.rebalance_request_id &&
              analysisToLoad.agent_insights?.riskManager) {
              // For rebalance workflows, consider complete when Risk Manager finishes
              console.log('Rebalance analysis with Risk Manager complete - marking as completed');
              status = ANALYSIS_STATUS.COMPLETED;
            }
          } else {
            // Legacy numeric status system
            if (analysisToLoad.analysis_status === -1) {
              status = ANALYSIS_STATUS.ERROR; // Simplified - all errors/cancellations show as error
            } else if (analysisToLoad.analysis_status === 0) {
              // Check if this is a rebalance analysis and Risk Manager has completed
              if (analysisToLoad.rebalance_request_id &&
                analysisToLoad.agent_insights?.riskManager) {
                // For rebalance workflows, consider complete when Risk Manager finishes
                console.log('Rebalance analysis with Risk Manager complete - marking as completed');
                status = ANALYSIS_STATUS.COMPLETED;
              } else {
                status = ANALYSIS_STATUS.RUNNING;
              }
            } else if (analysisToLoad.analysis_status === 1) {
              status = ANALYSIS_STATUS.COMPLETED;
            }
          }

          setIsLiveAnalysis(isAnalysisActive(status as AnalysisStatus));

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
          console.log('Looking for trade orders for analysis_id:', analysisToLoad.id);
          const { data: tradeOrders, error: tradeError } = await supabase
            .from('trading_actions')
            .select('*')
            .eq('analysis_id', analysisToLoad.id)
            .order('created_at', { ascending: false })
            .limit(1);

          console.log('Trade orders query result:', { tradeOrders, tradeError });

          if (!tradeError && tradeOrders && tradeOrders.length > 0) {
            const order = tradeOrders[0];
            tradeOrderData = {
              id: order.id,
              action: order.action || order.action_type || order.metadata?.action,  // Include the action (BUY/SELL/HOLD)
              ticker: order.ticker,
              shares: parseFloat(order.shares || 0),
              dollarAmount: parseFloat(order.dollar_amount || 0),
              status: order.status,
              alpacaOrderId: order.alpaca_order_id || order.metadata?.alpaca_order?.id,
              alpacaOrderStatus: order.alpaca_order_status || order.metadata?.alpaca_order?.status,
              alpacaFilledQty: order.alpaca_filled_qty ? parseFloat(order.alpaca_filled_qty) : (order.metadata?.alpaca_order?.filled_qty ? parseFloat(order.metadata.alpaca_order.filled_qty) : null),
              alpacaFilledPrice: order.alpaca_filled_price ? parseFloat(order.alpaca_filled_price) : (order.metadata?.alpaca_order?.filled_avg_price ? parseFloat(order.metadata.alpaca_order.filled_avg_price) : null),
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

          // Track the database updated_at value
          const currentDbUpdatedAt = analysisToLoad.updated_at;
          
          // Only update our ref if the database value actually changed
          if (lastDatabaseUpdateRef.current === null) {
            // First load - initialize with current value
            lastDatabaseUpdateRef.current = currentDbUpdatedAt;
            console.log('Initial database updated_at:', currentDbUpdatedAt);
          } else if (currentDbUpdatedAt !== lastDatabaseUpdateRef.current) {
            // Database was actually updated
            console.log('Database updated_at changed:', {
              old: lastDatabaseUpdateRef.current,
              new: currentDbUpdatedAt
            });
            lastDatabaseUpdateRef.current = currentDbUpdatedAt;
          }

          setAnalysisData({
            ...analysisToLoad,
            status,
            messages: messageResult.success ? messageResult.messages : (analysisToLoad.full_analysis?.messages || []),
            workflowSteps: analysisToLoad.full_analysis?.workflowSteps || [],
            tradeOrder: tradeOrderData,
            // Explicitly include agent_insights
            agent_insights: analysisToLoad.agent_insights || {},
            // Always use the actual database updated_at for staleness check
            updated_at: analysisToLoad.updated_at
          });

          if (messageResult.success && messageResult.queueCount > 0) {
            console.log(`Loaded ${messageResult.totalCount} messages (${messageResult.historyCount} from history, ${messageResult.queueCount} from queue)`);
          }

          shouldContinuePolling = isAnalysisActive(status as AnalysisStatus) && !analysisDate;
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          console.warn('Analysis polling aborted; will retry shortly.', err);
          shouldContinuePolling = true;
          nextPollDelay = 5000;
        } else {
          console.error('Error loading analysis:', err);
          if (mounted) {
            setError(err.message || 'Failed to load analysis');
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }

        isFetchingRef.current = false;

        if (mounted) {
          if (shouldContinuePolling) {
            schedulePoll(nextPollDelay);
          } else {
            clearPollTimeout();
          }
        }
      }
    };

    // Reset stale state on new mount/context and kick off initial load
    setError(null);
    loadAnalysis(true);

    return () => {
      mounted = false;
      clearPollTimeout();
      isFetchingRef.current = false;
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
