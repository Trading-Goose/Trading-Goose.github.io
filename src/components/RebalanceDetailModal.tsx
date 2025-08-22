import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  Target,
  Brain,
  Activity,
  XCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  type RebalanceStatus,
  type AnalysisStatus,
  type TradeOrderStatus,
  type AlpacaOrderStatus,
  REBALANCE_STATUS,
  ANALYSIS_STATUS,
  convertLegacyRebalanceStatus,
  isRebalanceActive,
  isAnalysisActive,
  isTradeOrderApproved,
  isTradeOrderRejected,
  isAlpacaOrderFilled,
  getStatusDisplayText
} from "@/lib/statusTypes";
import AnalysisDetailModal from "./AnalysisDetailModal";
import RebalanceActionsTab from "./rebalance-detail/RebalanceActionsTab";
import RebalanceWorkflowTab from "./rebalance-detail/RebalanceWorkflowTab";
import RebalanceInsightsTab from "./rebalance-detail/RebalanceInsightsTab";

interface RebalanceDetailModalProps {
  rebalanceId?: string;
  isOpen: boolean;
  onClose: () => void;
  rebalanceDate?: string;
}

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



export default function RebalanceDetailModal({ rebalanceId, isOpen, onClose, rebalanceDate }: RebalanceDetailModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("actions");
  const [rebalanceData, setRebalanceData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiveRebalance, setIsLiveRebalance] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | undefined>();

  const [selectedAnalysis, setSelectedAnalysis] = useState<{
    ticker: string;
    date: string;
  } | null>(null);

  const [executedTickers, setExecutedTickers] = useState<Set<string>>(new Set());
  const [rejectedTickers, setRejectedTickers] = useState<Set<string>>(new Set());
  const [orderStatuses, setOrderStatuses] = useState<Map<string, { status: string, alpacaOrderId?: string, alpacaStatus?: string }>>(new Map());

  // Load rebalance data
  useEffect(() => {
    if (!isOpen || !rebalanceId || !user?.id) return;

    let mounted = true;

    const loadRebalance = async () => {
      if (!mounted || !user?.id) return;

      try {
        // Add a small delay to ensure auth state is stable
        await new Promise(resolve => setTimeout(resolve, 100));

        // Fetch rebalance request data
        const { data: rebalanceRequest, error: requestError } = await supabase
          .from('rebalance_requests')
          .select('*')
          .eq('id', rebalanceId)
          .eq('user_id', user.id)
          .single();

        if (requestError) {
          if (requestError.code === 'PGRST116') {
            // Try once more without user_id filter to check if rebalance exists at all
            const { data: anyRebalance } = await supabase
              .from('rebalance_requests')
              .select('id, user_id')
              .eq('id', rebalanceId)
              .single();

            if (anyRebalance) {
              throw new Error('Access denied. This rebalance belongs to another user.');
            } else {
              throw new Error('Rebalance not found. It may have been deleted.');
            }
          }
          throw requestError;
        }

        if (!rebalanceRequest) {
          throw new Error('Rebalance data not found');
        }


        // Fetch related rebalance analyses from analysis_history table
        // Include all fields including the full_analysis JSON field that contains workflow steps
        const { data: rebalanceAnalyses, error: analysesError } = await supabase
          .from('analysis_history')
          .select('*, full_analysis')
          .eq('rebalance_request_id', rebalanceId)
          .order('created_at', { ascending: false });

        if (analysesError) {
          console.error('Error fetching rebalance analyses:', analysesError);
        }

        // Determine status using centralized status system
        let status: RebalanceStatus = convertLegacyRebalanceStatus(rebalanceRequest.status);
        
        // If we're in legacy pending_trades state but have a rebalance plan (portfolio manager is done), 
        // consider it as awaiting_approval since the planning is complete
        if (rebalanceRequest.status === 'pending_trades' && rebalanceRequest.rebalance_plan) {
          status = REBALANCE_STATUS.AWAITING_APPROVAL;
        }
        
        const isRunning = isRebalanceActive(status);
        const isPendingApproval = status === REBALANCE_STATUS.AWAITING_APPROVAL;
        const isCompleted = status === REBALANCE_STATUS.COMPLETED;
        const isCancelled = status === REBALANCE_STATUS.CANCELLED;
        const isFailed = status === REBALANCE_STATUS.ERROR;

        setIsLiveRebalance(isRunning);

        // Parse the rebalance plan if available
        const rebalancePlan = rebalanceRequest.rebalance_plan || {};
        const portfolioSnapshot = rebalanceRequest.portfolio_snapshot || {};
        const targetAllocations = rebalanceRequest.target_allocations || {};


        // Transform recommended positions from rebalance plan
        // Look for positions in multiple possible locations
        let positionsArray = rebalancePlan.positions ||
          rebalancePlan.recommendedPositions ||
          rebalancePlan.recommended_positions ||
          rebalancePlan.trades ||
          rebalancePlan.orders ||
          rebalancePlan.trade_orders ||
          rebalanceRequest.positions ||
          rebalanceRequest.recommended_positions ||
          rebalanceRequest.trades ||
          rebalanceRequest.orders ||
          [];

        // If positions are empty but we have a rebalance plan with trade decisions, try to extract from there
        if (positionsArray.length === 0 && rebalancePlan.tradeDecisions) {
          positionsArray = rebalancePlan.tradeDecisions;
        }

        // If still empty, try to extract from rebalance plan text or create from portfolio data
        if (positionsArray.length === 0 && rebalancePlan.portfolio_changes) {
          positionsArray = rebalancePlan.portfolio_changes;
        }

        // Also check for camelCase variations
        if (positionsArray.length === 0 && rebalancePlan.tradeOrders) {
          positionsArray = rebalancePlan.tradeOrders;
        }



        const recommendedPositions = positionsArray.map((position: any) => ({
          ticker: position.ticker || position.symbol || position.stock,
          currentShares: position.current_shares || position.currentShares || position.current_quantity || 0,
          currentValue: position.current_value || position.currentValue || position.current_market_value || 0,
          currentAllocation: position.current_allocation || position.currentAllocation || position.current_percent || 0,
          targetAllocation: position.target_allocation || position.targetAllocation || position.target_percent || 0,
          recommendedShares: position.recommended_shares || position.recommendedShares || position.target_shares || position.new_quantity || position.current_shares || 0,
          shareChange: position.share_change || position.shareChange || position.shares_to_trade || position.quantity_change || 0,
          action: position.action || position.trade_action || position.trade_type || 'HOLD',
          reasoning: position.reasoning || position.reason || position.rationale || '',
          executed: position.executed || false,
          orderStatus: position.order_status || position.orderStatus,
          alpacaOrderId: position.alpaca_order_id || position.alpacaOrderId,
          tradeActionId: position.trade_action_id || position.tradeActionId
        }));

        // Fetch order statuses for all positions in this rebalance
        const { data: tradingActions } = await supabase
          .from('trading_actions')
          .select('id, ticker, status, metadata')
          .eq('rebalance_request_id', rebalanceId)
          .eq('user_id', user.id);

        if (tradingActions && tradingActions.length > 0) {
          const newOrderStatuses = new Map();
          const newExecutedTickers = new Set<string>();
          const newRejectedTickers = new Set<string>();

          // Create a map of ticker to trade action for easier lookup
          const tradeActionMap = new Map();

          tradingActions.forEach(action => {
            const alpacaOrderId = action.metadata?.alpaca_order?.id;
            const alpacaStatus = action.metadata?.alpaca_order?.status;

            newOrderStatuses.set(action.ticker, {
              status: action.status,
              alpacaOrderId,
              alpacaStatus
            });

            tradeActionMap.set(action.ticker, action.id);

            // Update executed/rejected sets based on actual status
            if (isTradeOrderApproved(action.status as TradeOrderStatus)) {
              // Check if Alpaca order is filled
              if (alpacaStatus && isAlpacaOrderFilled(alpacaStatus as AlpacaOrderStatus)) {
                newExecutedTickers.add(action.ticker);
              } else {
                // Approved orders should also be treated as executed for UI purposes
                newExecutedTickers.add(action.ticker);
              }
            } else if (isTradeOrderRejected(action.status as TradeOrderStatus)) {
              newRejectedTickers.add(action.ticker);
            }
          });

          // Update positions with trade action IDs
          recommendedPositions.forEach(position => {
            const tradeActionId = tradeActionMap.get(position.ticker);
            if (tradeActionId) {
              position.tradeActionId = tradeActionId;
            }
          });

          if (mounted) {
            setOrderStatuses(newOrderStatuses);
            setExecutedTickers(newExecutedTickers);
            setRejectedTickers(newRejectedTickers);
          }
        }

        // Build workflow steps based on status and workflow_steps data
        // Handle both array and object formats for workflow_steps
        let workflowStepsData = rebalanceRequest.workflow_steps || {};

        // If workflow_steps is an array, convert it to an object with named keys
        if (Array.isArray(rebalanceRequest.workflow_steps)) {
          workflowStepsData = {};
          for (const step of rebalanceRequest.workflow_steps) {
            if (step.name) {
              workflowStepsData[step.name] = step;
            }
          }
        }
        const workflowSteps = [];

        // Add threshold check step
        if (!rebalanceRequest.skip_threshold_check) {
          const thresholdStep = workflowStepsData.threshold_check || {};

          // Determine threshold step status
          // Priority: 1) Check explicit status field, 2) Check if data exists, 3) Check overall workflow status
          let thresholdStatus = 'pending';
          if (thresholdStep.status === 'error' || (thresholdStep.data && thresholdStep.data.error)) {
            thresholdStatus = 'error';
          } else if (thresholdStep.status === 'completed' || (thresholdStep.data && !thresholdStep.data.error)) {
            thresholdStatus = 'completed';
          } else if (isRebalanceActive(status)) {
            thresholdStatus = 'running';
          } else if (isCompleted || isPendingApproval) {
            // If we've moved past initializing, threshold must be complete
            thresholdStatus = 'completed';
          } else if (isFailed && thresholdStep.data?.error) {
            // If rebalance failed and threshold has error, mark it as error
            thresholdStatus = 'error';
          }

          workflowSteps.push({
            id: 'threshold',
            title: 'Threshold Check',
            description: 'Evaluating portfolio drift against rebalance threshold',
            status: thresholdStatus,
            completedAt: thresholdStep.data?.timestamp || thresholdStep.timestamp || thresholdStep.completedAt,
            insights: thresholdStep.data, // Add the insights data
            data: thresholdStatus === 'error' ? thresholdStep.data : undefined // Include error data if failed
          });
        }

        // Add opportunity analysis step
        if (!rebalanceRequest.skip_opportunity_agent) {
          // Try to get opportunity data from multiple sources
          let opportunityStep = workflowStepsData.opportunity_analysis || {};

          // If not found in workflow_steps, check opportunity_reasoning field directly
          // BUT only if we're past the opportunity_evaluation phase
          if (!opportunityStep.data && rebalanceRequest.opportunity_reasoning &&
            (isRebalanceActive(status) || isCompleted || isPendingApproval)) {
            opportunityStep = {
              status: 'completed',
              data: rebalanceRequest.opportunity_reasoning,
              timestamp: rebalanceRequest.opportunity_reasoning?.timestamp
            };
          }

          // If we still don't have opportunity step data but have opportunity_reasoning, use it anyway
          if (!opportunityStep.data && rebalanceRequest.opportunity_reasoning) {
            opportunityStep = {
              status: 'completed',
              data: rebalanceRequest.opportunity_reasoning,
              timestamp: rebalanceRequest.opportunity_reasoning?.timestamp
            };
          }

          // Parse the AI response if it's stored as a string (declare insights first)  
          let insights = opportunityStep.data;

          // Determine opportunity step status
          // Priority: 1) Check explicit status field, 2) Check overall workflow status
          let opportunityStatus = 'pending';
          if (opportunityStep.status === 'error' || (opportunityStep.data && opportunityStep.data.error)) {
            opportunityStatus = 'error';
            // If the opportunity agent failed, the whole rebalance should show as failed
            insights = opportunityStep.data; // Keep the error data
          } else if (opportunityStep.status === 'completed') {
            // Only mark as completed if the workflow step explicitly says so
            opportunityStatus = 'completed';
          } else if (opportunityStep.status === 'running' || isRebalanceActive(status)) {
            // Opportunity agent is currently running
            opportunityStatus = 'running';
          } else if ((isCompleted || isPendingApproval) && opportunityStep.status === 'completed') {
            // If we've moved past opportunity_evaluation AND the step is marked complete
            opportunityStatus = 'completed';
          } else if (isFailed && opportunityStep.data?.error) {
            // If rebalance failed and opportunity has error, mark it as error
            opportunityStatus = 'error';
          } else {
            // Default to pending if we can't determine status
            opportunityStatus = 'pending';
          }

          // Parse insights if it's a string
          if (insights && typeof insights === 'string') {
            try {
              insights = JSON.parse(insights);
            } catch (e) {
              // Try to extract from AI response text
              insights = {
                reasoning: insights,
                recommendAnalysis: true // Default to true if we can't parse
              };
            }
          }

          const opportunityWorkflowStep = {
            id: 'opportunity',
            title: 'Opportunity Analysis',
            description: 'Scanning market for new investment opportunities',
            status: opportunityStatus,
            completedAt: opportunityStep.data?.timestamp || opportunityStep.timestamp || opportunityStep.completedAt,
            insights: insights, // Use the parsed insights
            data: opportunityStatus === 'error' ? opportunityStep.data : undefined // Include error data if failed
          };

          workflowSteps.push(opportunityWorkflowStep);
        }

        // Add stock analysis step
        if (rebalanceAnalyses && rebalanceAnalyses.length > 0) {
          const stockAnalysisStep = workflowStepsData.stock_analysis || {};

          const stockAnalyses = rebalanceAnalyses.map((analysis: any) => {

            // Determine individual analysis status based on analysis_status field using centralized system
            let analysisStatus: AnalysisStatus = ANALYSIS_STATUS.PENDING;

            // Be very explicit about the status checking - convert legacy numeric status
            if (analysis.analysis_status === 1) {
              analysisStatus = ANALYSIS_STATUS.COMPLETED;
            } else if (analysis.analysis_status === 0) {
              // Analysis is still running (Portfolio Manager will mark it as complete)
              analysisStatus = ANALYSIS_STATUS.RUNNING;
            } else if (analysis.analysis_status === -1 || analysis.is_canceled) {
              analysisStatus = ANALYSIS_STATUS.CANCELLED;
            } else if (analysis.analysis_status === null || analysis.analysis_status === undefined) {
              // If no status is set, check if we have any agent insights to determine if it's running
              const insights = analysis.agent_insights || {};
              const hasAnyInsights = Object.keys(insights).length > 0;
              analysisStatus = hasAnyInsights ? ANALYSIS_STATUS.RUNNING : ANALYSIS_STATUS.PENDING;
            }

            // Check agent completion from agent_insights
            const insights = analysis.agent_insights || {};

            // Check if we have the full_analysis field which contains workflow steps
            const fullAnalysis = analysis.full_analysis || {};
            const workflowSteps = fullAnalysis.workflowSteps || [];

            // Try to get agent status from workflow steps first (more reliable)
            let agents = {
              marketAnalyst: 'pending',
              newsAnalyst: 'pending',
              socialMediaAnalyst: 'pending',
              fundamentalsAnalyst: 'pending'
            };

            // Find the analysis step in workflow
            const analysisStep = workflowSteps.find((s: any) => s.id === 'analysis');

            if (analysisStep && analysisStep.agents && analysisStep.agents.length > 0) {
              // Read the actual agent statuses from the workflow steps
              analysisStep.agents.forEach((agent: any) => {
                const agentName = agent.name.toLowerCase().replace(/\s+/g, '');
                const agentStatus = agent.status || 'pending';

                if (agentName.includes('market')) {
                  agents.marketAnalyst = agentStatus;
                } else if (agentName.includes('news')) {
                  agents.newsAnalyst = agentStatus;
                } else if (agentName.includes('social')) {
                  agents.socialMediaAnalyst = agentStatus;
                } else if (agentName.includes('fundamental')) {
                  agents.fundamentalsAnalyst = agentStatus;
                }
              });
            } else {
              // Fallback: determine from insights presence and analysis status
              // If analysis is running but no workflow steps yet, agents are pending/running
              // Only mark as completed if the agent actually has insights
              const isAnalysisRunning = isAnalysisActive(analysisStatus);

              agents = {
                marketAnalyst: insights.marketAnalyst ? ANALYSIS_STATUS.COMPLETED :
                  isAnalysisRunning ? ANALYSIS_STATUS.RUNNING : ANALYSIS_STATUS.PENDING,
                newsAnalyst: insights.newsAnalyst ? ANALYSIS_STATUS.COMPLETED :
                  isAnalysisRunning ? ANALYSIS_STATUS.RUNNING : ANALYSIS_STATUS.PENDING,
                socialMediaAnalyst: insights.socialMediaAnalyst ? ANALYSIS_STATUS.COMPLETED :
                  isAnalysisRunning ? ANALYSIS_STATUS.RUNNING : ANALYSIS_STATUS.PENDING,
                fundamentalsAnalyst: insights.fundamentalsAnalyst ? ANALYSIS_STATUS.COMPLETED :
                  isAnalysisRunning ? ANALYSIS_STATUS.RUNNING : ANALYSIS_STATUS.PENDING
              };
            }

            return {
              ticker: analysis.ticker,
              status: analysisStatus,
              agents,
              decision: analysis.decision,
              confidence: analysis.confidence,
              insights,
              fullAnalysis: analysis.full_analysis // Pass the full_analysis data
            };
          });

          // Count completed analyses more accurately using centralized status system
          // An analysis is ONLY complete when analysis_status === 1
          const completedAnalyses = stockAnalyses.filter((sa: any) => sa.status === ANALYSIS_STATUS.COMPLETED).length;
          const runningAnalyses = stockAnalyses.filter((sa: any) => sa.status === ANALYSIS_STATUS.RUNNING).length;
          // Note: pendingAnalyses count available if needed for future features

          // Determine overall status for the stock analysis step
          // Be very strict about when to mark as completed
          let stockAnalysisStatus: AnalysisStatus = ANALYSIS_STATUS.PENDING;

          if (completedAnalyses === rebalanceAnalyses.length && completedAnalyses > 0) {
            // ALL analyses must be complete
            stockAnalysisStatus = ANALYSIS_STATUS.COMPLETED;
          } else if (runningAnalyses > 0) {
            // If ANY are running, the step is running
            stockAnalysisStatus = ANALYSIS_STATUS.RUNNING;
          } else if (completedAnalyses > 0) {
            // If some are complete but none are running, still mark as running (waiting for others to start)
            stockAnalysisStatus = ANALYSIS_STATUS.RUNNING;
          } else {
            // Otherwise it's pending
            stockAnalysisStatus = ANALYSIS_STATUS.PENDING;
          }


          workflowSteps.push({
            id: 'analysis',
            title: 'Stock Analysis',
            description: 'Analyzing individual stocks for rebalancing decisions',
            status: stockAnalysisStatus,
            agents: stockAnalyses.map((sa: any) => ({
              name: `${sa.ticker} Analysis`,
              key: sa.ticker.toLowerCase(),
              status: sa.status
            })),
            stockAnalyses,
            completedAt: stockAnalysisStep.data?.timestamp || rebalanceRequest.analysis_completed_at
          });
        }

        // Add Portfolio Manager step (rebalance planning)
        const rebalanceAgentStep = workflowStepsData.rebalance_agent || {};
        const portfolioManagerStep = workflowStepsData.portfolio_manager || {};

        // Check if portfolio manager is complete or running using centralized status system
        // It's complete if either the rebalance_agent step is complete OR if we have a rebalance_plan
        // It's running if rebalance is active
        let portfolioManagerStatus: AnalysisStatus = ANALYSIS_STATUS.PENDING;
        if (rebalanceAgentStep.status === 'completed' || portfolioManagerStep.status === 'completed' || rebalanceRequest.rebalance_plan || isPendingApproval) {
          portfolioManagerStatus = ANALYSIS_STATUS.COMPLETED;
        } else if (isRunning) {
          portfolioManagerStatus = ANALYSIS_STATUS.RUNNING;
        }

        workflowSteps.push({
          id: 'rebalance',
          title: 'Portfolio Manager',
          description: 'Calculating optimal portfolio rebalancing strategy and generating trade orders',
          status: portfolioManagerStatus,
          completedAt: rebalanceAgentStep.data?.completedAt || portfolioManagerStep.data?.completedAt || rebalanceRequest.plan_generated_at
        });

        // Check if the portfolio manager is complete using centralized status system
        const portfolioManagerComplete = portfolioManagerStatus === ANALYSIS_STATUS.COMPLETED || rebalanceRequest.rebalance_plan;

        // Overall workflow status should be 'completed' when portfolio manager is done, even if orders are pending
        let overallStatus: RebalanceStatus;
        if (isFailed) {
          // If the rebalance is marked as failed, use that status
          overallStatus = REBALANCE_STATUS.ERROR;
        } else if (portfolioManagerComplete && !isRunning) {
          // Portfolio manager is done and no agents are running - mark as complete
          overallStatus = REBALANCE_STATUS.COMPLETED;
        } else if (isCompleted) {
          overallStatus = REBALANCE_STATUS.COMPLETED;
        } else if (isPendingApproval) {
          overallStatus = REBALANCE_STATUS.AWAITING_APPROVAL;
        } else if (isRunning) {
          overallStatus = REBALANCE_STATUS.RUNNING;
        } else if (isCancelled) {
          overallStatus = REBALANCE_STATUS.CANCELLED;
        } else {
          overallStatus = status;
        }

        const rebalanceData = {
          id: rebalanceRequest.id,
          status: overallStatus,
          startedAt: rebalanceRequest.created_at,
          completedAt: rebalanceRequest.completed_at,

          portfolio: {
            totalValue: portfolioSnapshot.total_value || 0,
            cashAvailable: portfolioSnapshot.cash_available || 0,
            stockValue: portfolioSnapshot.stock_value || 0,
            targetStockAllocation: targetAllocations.stock_allocation || 80,
            targetCashAllocation: targetAllocations.cash_allocation || 20,
            currentStockAllocation: portfolioSnapshot.stock_allocation || 0,
            currentCashAllocation: portfolioSnapshot.cash_allocation || 0,
          },

          recommendedPositions,

          // Include the full rebalance_plan so Portfolio Manager insights can be accessed
          rebalance_plan: rebalancePlan,

          agentInsights: {
            rebalanceAgent: rebalancePlan.rebalance_agent_insight || '',
            opportunityAgent: rebalancePlan.opportunity_agent_insight || '',
            // Also include Portfolio Manager insights here for easier access
            portfolioManager: rebalancePlan.portfolioManagerAnalysis ||
              rebalancePlan.portfolioManagerInsights ||
              rebalancePlan.rebalance_agent_insight || ''
          },

          opportunityAgentUsed: !rebalanceRequest.skip_opportunity_agent,
          skipThresholdCheck: rebalanceRequest.skip_threshold_check,
          skipOpportunityAgent: rebalanceRequest.skip_opportunity_agent,
          workflowSteps,

          // Include opportunity reasoning for insights tab access
          opportunity_reasoning: rebalanceRequest.opportunity_reasoning,

          relatedAnalyses: rebalanceAnalyses || []
        };

        if (mounted) {
          setRebalanceData(rebalanceData);
        }

        // Start polling if running
        if (isRunning && !rebalanceDate) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          // Poll every 2 seconds for updates
          intervalRef.current = setInterval(async () => {
            // Don't update state if component is unmounted
            if (!mounted) {
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = undefined;
              }
              return;
            }
            // Recursively call loadRebalance to fetch fresh data
            await loadRebalance();
          }, 3000); // Poll every 3 seconds instead of 2
        } else if (!isRunning && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = undefined;
        }
      } catch (err: any) {
        console.error('Error loading rebalance:', err);
        if (mounted) {
          setError(err.message || 'Failed to load rebalance');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadRebalance();

    return () => {
      mounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, [isOpen, rebalanceId, user, rebalanceDate]);



  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-7xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-muted-foreground" />
                <DialogTitle className="text-xl font-semibold">
                  Portfolio Rebalance Detail
                </DialogTitle>
                {rebalanceData?.status === REBALANCE_STATUS.RUNNING && (
                  <Badge variant="running" className="text-sm">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    {getStatusDisplayText(REBALANCE_STATUS.RUNNING)}
                  </Badge>
                )}
                {rebalanceData?.status === REBALANCE_STATUS.AWAITING_APPROVAL && (
                  <Badge variant="pending" className="text-sm">
                    <Clock className="w-3 h-3 mr-1" />
                    {getStatusDisplayText(REBALANCE_STATUS.AWAITING_APPROVAL)}
                  </Badge>
                )}
                {rebalanceData?.status === REBALANCE_STATUS.COMPLETED && (
                  <Badge variant="completed" className="text-sm">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {getStatusDisplayText(REBALANCE_STATUS.COMPLETED)}
                  </Badge>
                )}
                {rebalanceData?.status === REBALANCE_STATUS.ERROR && (
                  <Badge variant="error" className="text-sm">
                    <XCircle className="w-3 h-3 mr-1" />
                    {getStatusDisplayText(REBALANCE_STATUS.ERROR)}
                  </Badge>
                )}
                {rebalanceData?.status === REBALANCE_STATUS.CANCELLED && (
                  <Badge variant="pending" className="text-sm">
                    <XCircle className="w-3 h-3 mr-1" />
                    {getStatusDisplayText(REBALANCE_STATUS.CANCELLED)}
                  </Badge>
                )}
              </div>
              {rebalanceData?.completedAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  Completed {formatDistanceToNow(new Date(rebalanceData.completedAt))} ago
                </div>
              )}
            </div>
            <DialogDescription className="mt-2">
              {isLiveRebalance
                ? "Real-time rebalancing progress and portfolio adjustments"
                : "Review rebalancing recommendations and related analyses"}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
            <div className="px-6 pt-4 pb-4">
              <TabsList className="grid w-full grid-cols-3 max-w-3xl mx-auto">
                <TabsTrigger value="actions" className="flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  Actions
                </TabsTrigger>
                <TabsTrigger value="workflow" className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Workflow
                </TabsTrigger>
                <TabsTrigger value="insights" className="flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  Insights
                </TabsTrigger>
              </TabsList>
            </div>

            {error ? (
              <div className="flex items-center gap-2 text-destructive p-6">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center p-12 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading rebalance data...</p>
              </div>
            ) : !rebalanceData ? (
              <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
                <p>No rebalance data available</p>
              </div>
            ) : (
              <>
                <TabsContent value="actions" className="flex flex-col h-[calc(90vh-220px)] mt-0 data-[state=inactive]:hidden">
                  <RebalanceActionsTab
                    rebalanceData={rebalanceData}
                    executedTickers={executedTickers}
                    setExecutedTickers={setExecutedTickers}
                    rejectedTickers={rejectedTickers}
                    setRejectedTickers={setRejectedTickers}
                    orderStatuses={orderStatuses}
                    setOrderStatuses={setOrderStatuses}
                    onClose={onClose}
                  />
                </TabsContent>

                <RebalanceWorkflowTab workflowData={rebalanceData} />

                <RebalanceInsightsTab 
                  rebalanceData={rebalanceData}
                  selectedAnalysis={selectedAnalysis}
                  setSelectedAnalysis={setSelectedAnalysis}
                />
              </>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Analysis Detail Modal */}
      {selectedAnalysis && (
        <AnalysisDetailModal
          ticker={selectedAnalysis.ticker}
          analysisDate={selectedAnalysis.date}
          isOpen={true}
          onClose={() => setSelectedAnalysis(null)}
        />
      )}
    </>
  );
}

