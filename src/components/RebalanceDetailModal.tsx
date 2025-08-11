import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Activity,
  ArrowRight,
  Zap,
  PieChart,
  Target,
  Eye,
  Brain,
  MessageSquare,
  FileText,
  Shield,
  BarChart3,
  CheckSquare,
  Users,
  XCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-supabase";
import { useToast } from "@/hooks/use-toast";
import MarkdownRenderer from "./MarkdownRenderer";
import AnalysisDetailModal from "./AnalysisDetailModal";

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
}

// Helper functions for analysis card rendering
const getDecisionVariant = (decision: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (decision) {
    case 'BUY': return 'default';
    case 'SELL': return 'destructive';
    case 'HOLD': return 'secondary';
    default: return 'outline';
  }
};

const getDecisionIcon = (decision: string) => {
  switch (decision) {
    case 'BUY': return <TrendingUp className="w-3 h-3" />;
    case 'SELL': return <TrendingDown className="w-3 h-3" />;
    default: return <Activity className="w-3 h-3" />;
  }
};

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 80) return 'text-green-600 dark:text-green-400';
  if (confidence >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
};

// Workflow Steps Component
function RebalanceWorkflowSteps({ workflowData }: { workflowData: any }) {
  const getStepStatus = (step: any) => {
    // Check if step should be skipped
    if (step.id === 'threshold' && workflowData.skipThresholdCheck) {
      return 'skipped';
    }
    if (step.id === 'opportunity' && workflowData.skipOpportunityAgent) {
      return 'skipped';
    }
    return step.status || 'pending';
  };

  const getAgentStatus = (agentKey: string, stockAnalysis?: any) => {
    // The agents object contains the actual status for each agent
    if (stockAnalysis && stockAnalysis.agents) {
      const status = stockAnalysis.agents[agentKey];
      console.log(`🎯 Getting status for ${agentKey} in ${stockAnalysis.ticker}: ${status}`);
      return status || 'pending';
    }
    return 'pending';
  };

  return (
    <div className="space-y-6">
      {workflowData.workflowSteps?.map((step: any) => {
        const Icon = step.icon || Activity;
        const stepStatus = getStepStatus(step);
        const isSkipped = stepStatus === 'skipped';
        const isCompleted = stepStatus === 'completed';
        const isRunning = stepStatus === 'running';
        const isPending = stepStatus === 'pending';

        // Don't show skipped steps
        if (isSkipped) return null;

        return (
          <div key={step.id} className="relative">
            <div className="space-y-4">
              {/* Step Header */}
              <div className={`rounded-lg border p-4 transition-all ${isCompleted
                ? 'bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10'
                : isRunning
                  ? 'bg-primary/5 border-primary/20'
                  : 'bg-card border-border'
                }`}>
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Step Icon */}
                      <div className={`p-3 rounded-lg ${isCompleted
                        ? 'bg-green-500/20 dark:bg-green-500/10 text-green-600 dark:text-green-400'
                        : isRunning
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                        }`}>
                        <Icon className="w-6 h-6" />
                      </div>

                      {/* Step Details */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold">{step.title}</h3>
                          {isCompleted && (
                            <Badge variant="secondary" className="text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Complete
                            </Badge>
                          )}
                          {isRunning && (
                            <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              In Progress
                            </Badge>
                          )}
                          {isPending && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{step.description}</p>



                        {/* Progress for stock analysis step */}
                        {step.id === 'analysis' && step.stockAnalyses?.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {step.stockAnalyses.filter((sa: any) =>
                                  sa.status === 'completed' || (sa.decision && sa.decision !== 'PENDING' && sa.confidence > 0)
                                ).length}/{step.stockAnalyses.length} stocks analyzed
                              </span>
                              <span className={isCompleted ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                                {Math.round((step.stockAnalyses.filter((sa: any) =>
                                  sa.status === 'completed' || (sa.decision && sa.decision !== 'PENDING' && sa.confidence > 0)
                                ).length / step.stockAnalyses.length) * 100)}%
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${isCompleted
                                  ? 'bg-green-500'
                                  : isRunning
                                    ? 'bg-primary'
                                    : 'bg-muted-foreground/30'
                                  }`}
                                style={{
                                  width: `${Math.round((step.stockAnalyses.filter((sa: any) =>
                                    sa.status === 'completed' || (sa.decision && sa.decision !== 'PENDING' && sa.confidence > 0)
                                  ).length / step.stockAnalyses.length) * 100)}%`
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Timestamp */}
                    {step.completedAt && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {isCompleted ? 'Completed' : 'Started'}
                        </p>
                        <p className="text-sm">
                          {formatDistanceToNow(new Date(step.completedAt), { addSuffix: true })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Stock Analysis Details - Show expanded view for analysis step */}
              {step.id === 'analysis' && step.stockAnalyses && (
                <div className="space-y-4 pl-14">
                  {step.stockAnalyses.map((stockAnalysis: any) => {
                    console.log(`🔍 Rendering stock analysis for ${stockAnalysis.ticker}:`, {
                      ticker: stockAnalysis.ticker,
                      status: stockAnalysis.status,
                      agents: stockAnalysis.agents
                    });


                    // Define workflow steps and determine their status based on agent completion
                    const getWorkflowStepStatus = (agentKeys: string[]) => {
                      const agentStatuses = agentKeys.map(key => stockAnalysis.agents?.[key] || 'pending');
                      const hasCompleted = agentStatuses.some(s => s === 'completed');
                      const hasRunning = agentStatuses.some(s => s === 'running');
                      const allCompleted = agentStatuses.every(s => s === 'completed');

                      if (allCompleted && agentStatuses.length > 0) return 'completed';
                      if (hasCompleted || hasRunning) return 'running';
                      return 'pending';
                    };

                    // Get research and other steps from full_analysis workflow steps
                    const fullAnalysis = stockAnalysis.fullAnalysis || {};
                    const fullWorkflowSteps = fullAnalysis.workflowSteps || [];

                    const getStepStatusFromWorkflow = (stepId: string) => {
                      const step = fullWorkflowSteps.find((s: any) => s.id === stepId);
                      if (!step) return 'pending';

                      // Check if all agents in this step are completed
                      const agents = step.agents || [];
                      const allCompleted = agents.length > 0 && agents.every((a: any) => a.status === 'completed');
                      const anyRunning = agents.some((a: any) => a.status === 'running');
                      const anyCompleted = agents.some((a: any) => a.status === 'completed');

                      if (allCompleted) return 'completed';
                      if (anyRunning || anyCompleted) return 'running';
                      return 'pending';
                    };

                    const workflowSteps = [
                      {
                        name: 'Data Analysis',
                        key: 'dataAnalysis',
                        icon: BarChart3,
                        status: getWorkflowStepStatus(['marketAnalyst', 'newsAnalyst', 'socialMediaAnalyst', 'fundamentalsAnalyst'])
                      },
                      {
                        name: 'Research',
                        key: 'research',
                        icon: Brain,
                        status: getStepStatusFromWorkflow('research')
                      },
                      {
                        name: 'Trading Decision',
                        key: 'trading',
                        icon: Activity,
                        status: getStepStatusFromWorkflow('trading')
                      },
                      {
                        name: 'Risk Assessment',
                        key: 'risk',
                        icon: Shield,
                        status: getStepStatusFromWorkflow('risk')
                      }
                    ];

                    return (
                      <div key={stockAnalysis.ticker} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {stockAnalysis.ticker}
                          </Badge>
                          <span className="text-sm text-muted-foreground">Analysis</span>
                          {stockAnalysis.decision && stockAnalysis.decision !== 'PENDING' && (
                            <Badge
                              variant={
                                stockAnalysis.decision === 'BUY' ? 'default' :
                                  stockAnalysis.decision === 'SELL' ? 'destructive' :
                                    'secondary'
                              }
                              className="text-xs"
                            >
                              {stockAnalysis.decision}
                            </Badge>
                          )}
                          {stockAnalysis.confidence > 0 && (
                            <span className={`text-xs font-medium ${stockAnalysis.confidence >= 80 ? 'text-green-600 dark:text-green-400' :
                              stockAnalysis.confidence >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-red-600 dark:text-red-400'
                              }`}>
                              {stockAnalysis.confidence}%
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {workflowSteps.map((step) => {
                            const stepStatus = step.status;
                            const StepIcon = step.icon;

                            return (
                              <div
                                key={step.key}
                                className={`relative rounded-lg border p-3 transition-all ${stepStatus === 'completed'
                                  ? 'bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10'
                                  : stepStatus === 'running'
                                    ? 'bg-primary/5 border-primary/30 shadow-sm'
                                    : 'bg-card border-border'
                                  }`}
                              >
                                <div className="flex flex-col items-center text-center space-y-2">
                                  <div className={`p-2 rounded-lg ${stepStatus === 'completed'
                                    ? 'bg-green-500/20 dark:bg-green-500/10 text-green-600 dark:text-green-400'
                                    : stepStatus === 'running'
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-muted text-muted-foreground'
                                    }`}>
                                    <StepIcon className="w-4 h-4" />
                                  </div>

                                  <h4 className="font-medium text-xs">{step.name}</h4>

                                  <Badge
                                    variant={stepStatus === 'completed' ? 'secondary' : 'outline'}
                                    className="text-xs"
                                  >
                                    {stepStatus === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                                    {stepStatus === 'running' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                    {stepStatus === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                                    {stepStatus.charAt(0).toUpperCase() + stepStatus.slice(1)}
                                  </Badge>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Overall Progress Summary */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Overall Progress
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Rebalance workflow execution status
            </p>
          </div>
          <div>
            {workflowData.status === 'completed' && (
              <Badge variant="secondary" className="text-sm">
                <CheckCircle className="w-3 h-3 mr-1" />
                Complete
              </Badge>
            )}
            {workflowData.status === 'running' && (
              <Badge variant="secondary" className="text-sm">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                In Progress
              </Badge>
            )}
            {workflowData.status === 'error' && (
              <Badge variant="destructive" className="text-sm">
                <XCircle className="w-3 h-3 mr-1" />
                Error
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RebalancePositionCard({ position, onApprove, onReject, isExecuted }: {
  position: RebalancePosition;
  onApprove: () => void;
  onReject: () => void;
  isExecuted: boolean;
}) {
  const pricePerShare = position.currentShares > 0
    ? position.currentValue / position.currentShares
    : 200; // Default price for new positions

  const isPending = !isExecuted && position.shareChange !== 0;
  const isHold = position.shareChange === 0;

  return (
    <div
      className={`p-4 rounded-lg border transition-all ${isExecuted
        ? 'bg-green-500/5 border-green-500/20'
        : isPending
          ? 'bg-blue-500/5 border-blue-500/20'
          : 'bg-muted/20 border-muted opacity-60'
        }`}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-lg">{position.ticker}</span>
            <Badge variant={
              position.action === 'BUY' ? 'secondary' :
                position.action === 'SELL' ? 'destructive' :
                  'outline'
            }>
              {position.action}
            </Badge>
            {position.shareChange !== 0 && (
              <span className={`text-sm font-medium ${position.shareChange > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                {position.shareChange > 0 ? '+' : ''}{position.shareChange} shares
              </span>
            )}
            {isExecuted && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="w-3 h-3 mr-1" />
                Executed
              </Badge>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              ${Math.abs(position.shareChange * pricePerShare).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              @ ${pricePerShare.toFixed(2)}/share
            </p>
          </div>
        </div>

        {/* Allocation Bars - Before and After */}
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground w-16">Before:</span>
            <Progress value={position.currentAllocation} className="flex-1 h-2" />
            <span className="text-xs font-medium w-12 text-right">
              {position.currentAllocation.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground w-16">After:</span>
            <Progress value={position.targetAllocation} className="flex-1 h-2" />
            <span className="text-xs font-medium w-12 text-right">
              {position.targetAllocation.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Position Changes */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {position.currentShares} shares
            </span>
            {position.shareChange !== 0 && (
              <>
                <ArrowRight className="w-4 h-4" />
                <span className="font-medium">
                  {position.recommendedShares} shares
                </span>
              </>
            )}
          </div>
        </div>

        {/* Reasoning */}
        <MarkdownRenderer content={position.reasoning} className="text-xs text-muted-foreground italic" />

        {/* Action Buttons */}
        {isPending && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs border-green-500/50 text-green-600 hover:bg-green-500/10 hover:border-green-500"
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              Execute Order
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs border-red-500/50 text-red-600 hover:bg-red-500/10 hover:border-red-500"
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
            >
              <XCircle className="w-3 h-3 mr-1" />
              Skip
            </Button>
          </div>
        )}
      </div>
    </div>
  );
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

  // Load rebalance data
  useEffect(() => {
    if (!isOpen || !rebalanceId || !user) return;

    let mounted = true;

    const loadRebalance = async () => {
      if (!mounted) return;

      try {
        // Fetch rebalance request data
        const { data: rebalanceRequest, error: requestError } = await supabase
          .from('rebalance_requests')
          .select('*')
          .eq('id', rebalanceId)
          .eq('user_id', user.id)
          .single();

        if (requestError) {
          if (requestError.code === 'PGRST116') {
            throw new Error('Rebalance not found. It may have been deleted.');
          }
          throw requestError;
        }

        if (!rebalanceRequest) {
          throw new Error('Rebalance data not found');
        }

        console.log('🔍 Full rebalance request:', rebalanceRequest);
        console.log('🔍 Rebalance request keys:', Object.keys(rebalanceRequest));

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

        // Determine status
        let status = rebalanceRequest.status;
        const isRunning = ['initializing', 'analyzing', 'planning', 'executing', 'pending_trades'].includes(status);
        const isPendingApproval = status === 'pending_approval';
        const isCompleted = status === 'completed' || status === 'no_action_needed';
        const isCancelled = status === 'cancelled';
        const isFailed = status === 'failed';

        setIsLiveRebalance(isRunning);

        // Parse the rebalance plan if available
        const rebalancePlan = rebalanceRequest.rebalance_plan || {};
        const portfolioSnapshot = rebalanceRequest.portfolio_snapshot || {};
        const targetAllocations = rebalanceRequest.target_allocations || {};

        console.log('📊 Rebalance plan:', rebalancePlan);
        console.log('📊 Rebalance plan positions:', rebalancePlan.positions);
        console.log('📊 Rebalance request status:', status);

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

        console.log('📊 Found positions array:', positionsArray);
        console.log('📊 Positions array length:', positionsArray.length);

        // TEMPORARY: If we're in pending_approval but have no positions, create sample data
        // This helps identify if the issue is with data extraction or UI rendering
        if (status === 'pending_approval' && positionsArray.length === 0) {
          console.warn('⚠️ No positions found for pending_approval status. This is likely a data extraction issue.');
          console.log('📊 Available rebalance_plan keys:', Object.keys(rebalancePlan));

          // Check if there's any text-based plan we can parse
          if (rebalancePlan.portfolioManagerInsights || rebalancePlan.portfolio_manager_insights || rebalancePlan.plan_text) {
            console.log('📊 Found plan text, but unable to extract structured positions');
          }
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
          alpacaOrderId: position.alpaca_order_id || position.alpacaOrderId
        }));

        // Build workflow steps based on status and workflow_steps data
        const workflowStepsData = rebalanceRequest.workflow_steps || {};
        console.log('📊 Workflow steps data from DB:', workflowStepsData);
        const workflowSteps = [];

        // Add threshold check step
        if (!rebalanceRequest.skip_threshold_check) {
          const thresholdStep = workflowStepsData.threshold_check || {};
          console.log('🔍 Threshold step data:', thresholdStep);
          console.log('🔍 Threshold step status:', thresholdStep.status);
          console.log('🔍 Has threshold data:', !!thresholdStep.data);

          // Determine threshold step status
          // Priority: 1) Check explicit status field, 2) Check if data exists, 3) Check overall workflow status
          let thresholdStatus = 'pending';
          if (thresholdStep.status === 'completed' || thresholdStep.data) {
            thresholdStatus = 'completed';
          } else if (status === 'initializing') {
            thresholdStatus = 'running';
          } else if (['analyzing', 'planning', 'pending_approval', 'executing', 'completed'].includes(status)) {
            // If we've moved past initializing, threshold must be complete
            thresholdStatus = 'completed';
          }

          workflowSteps.push({
            id: 'threshold',
            title: 'Threshold Check',
            description: 'Evaluating portfolio drift against rebalance threshold',
            status: thresholdStatus,
            completedAt: thresholdStep.data?.timestamp || thresholdStep.timestamp || thresholdStep.completedAt,
            insights: thresholdStep.data // Add the insights data
          });
        }

        // Add opportunity analysis step
        if (!rebalanceRequest.skip_opportunity_agent) {
          const opportunityStep = workflowStepsData.opportunity_analysis || {};
          console.log('🎯 Opportunity step data:', opportunityStep);
          console.log('🎯 Opportunity step status:', opportunityStep.status);
          console.log('🎯 Has opportunity data:', !!opportunityStep.data);

          // Determine opportunity step status
          // Priority: 1) Check explicit status field, 2) Check if data exists, 3) Check overall workflow status
          let opportunityStatus = 'pending';
          if (opportunityStep.status === 'completed' || opportunityStep.data) {
            opportunityStatus = 'completed';
          } else if (status === 'initializing' || status === 'analyzing') {
            opportunityStatus = 'running';
          } else if (['planning', 'pending_approval', 'executing', 'completed'].includes(status)) {
            // If we've moved past analyzing, opportunity must be complete
            opportunityStatus = 'completed';
          }

          // Parse the AI response if it's stored as a string
          let insights = opportunityStep.data;
          if (insights && typeof insights === 'string') {
            console.log('🔍 Parsing opportunity insights from string');
            try {
              insights = JSON.parse(insights);
            } catch (e) {
              console.error('Failed to parse opportunity insights:', e);
              // Try to extract from AI response text
              insights = {
                reasoning: insights,
                recommendAnalysis: true // Default to true if we can't parse
              };
            }
          }

          workflowSteps.push({
            id: 'opportunity',
            title: 'Opportunity Analysis',
            description: 'Scanning market for new investment opportunities',
            status: opportunityStatus,
            completedAt: opportunityStep.data?.timestamp || opportunityStep.timestamp || opportunityStep.completedAt,
            insights: insights // Use the parsed insights
          });
        }

        // Add stock analysis step
        if (rebalanceAnalyses && rebalanceAnalyses.length > 0) {
          const stockAnalysisStep = workflowStepsData.stock_analysis || {};
          console.log('📊 Stock analysis step from DB:', stockAnalysisStep);

          const stockAnalyses = rebalanceAnalyses.map((analysis: any) => {
            console.log(`📊 Analysis for ${analysis.ticker}:`, {
              analysis_status: analysis.analysis_status,
              decision: analysis.decision,
              confidence: analysis.confidence,
              has_insights: !!analysis.agent_insights
            });

            // Determine individual analysis status based on analysis_status field
            let analysisStatus = 'pending';

            // Be very explicit about the status checking
            if (analysis.analysis_status === 1) {
              analysisStatus = 'completed';
            } else if (analysis.analysis_status === 0) {
              // For rebalance analyses, check if Risk Manager has completed
              // In rebalance workflows, individual stock analyses are complete when Risk Manager finishes
              // (Portfolio Manager runs after all stocks are done)
              if (analysis.rebalance_request_id && analysis.agent_insights?.riskManager) {
                console.log(`📊 ${analysis.ticker}: Rebalance analysis with Risk Manager complete - marking as completed`);
                analysisStatus = 'completed';
              } else {
                analysisStatus = 'running';
              }
            } else if (analysis.analysis_status === -1 || analysis.is_canceled) {
              analysisStatus = 'cancelled';
            } else if (analysis.analysis_status === null || analysis.analysis_status === undefined) {
              // If no status is set, check if we have any agent insights to determine if it's running
              const insights = analysis.agent_insights || {};
              const hasAnyInsights = Object.keys(insights).length > 0;
              analysisStatus = hasAnyInsights ? 'running' : 'pending';
            }

            // Check agent completion from agent_insights
            const insights = analysis.agent_insights || {};

            // Check if we have the full_analysis field which contains workflow steps
            const fullAnalysis = analysis.full_analysis || {};
            const workflowSteps = fullAnalysis.workflowSteps || [];

            console.log(`📊 Full analysis for ${analysis.ticker}:`, {
              hasFullAnalysis: !!fullAnalysis,
              workflowStepsCount: workflowSteps.length,
              workflowSteps: workflowSteps
            });

            // Try to get agent status from workflow steps first (more reliable)
            let agents = {
              marketAnalyst: 'pending',
              newsAnalyst: 'pending',
              socialMediaAnalyst: 'pending',
              fundamentalsAnalyst: 'pending'
            };

            // Find the analysis step in workflow
            const analysisStep = workflowSteps.find((s: any) => s.id === 'analysis');
            console.log(`📊 Analysis step for ${analysis.ticker}:`, analysisStep);

            if (analysisStep && analysisStep.agents && analysisStep.agents.length > 0) {
              // Read the actual agent statuses from the workflow steps
              analysisStep.agents.forEach((agent: any) => {
                const agentName = agent.name.toLowerCase().replace(/\s+/g, '');
                const agentStatus = agent.status || 'pending';

                console.log(`📊 Agent ${agent.name} status from workflow: ${agentStatus}`);

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
              const isAnalysisRunning = analysisStatus === 'running';

              agents = {
                marketAnalyst: insights.marketAnalyst ? 'completed' :
                  isAnalysisRunning ? 'running' : 'pending',
                newsAnalyst: insights.newsAnalyst ? 'completed' :
                  isAnalysisRunning ? 'running' : 'pending',
                socialMediaAnalyst: insights.socialMediaAnalyst ? 'completed' :
                  isAnalysisRunning ? 'running' : 'pending',
                fundamentalsAnalyst: insights.fundamentalsAnalyst ? 'completed' :
                  isAnalysisRunning ? 'running' : 'pending'
              };

              console.log(`📊 Fallback agent status for ${analysis.ticker}:`, agents);
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

          // Count completed analyses more accurately
          // An analysis is ONLY complete when analysis_status === 1
          const completedAnalyses = stockAnalyses.filter((sa: any) => sa.status === 'completed').length;
          const runningAnalyses = stockAnalyses.filter((sa: any) => sa.status === 'running').length;
          const pendingAnalyses = stockAnalyses.filter((sa: any) => sa.status === 'pending').length;

          console.log(`📊 Stock analyses breakdown: ${completedAnalyses} completed, ${runningAnalyses} running, ${pendingAnalyses} pending, ${stockAnalyses.length} total`);

          // Determine overall status for the stock analysis step
          // Be very strict about when to mark as completed
          let stockAnalysisStatus = 'pending';

          if (completedAnalyses === rebalanceAnalyses.length && completedAnalyses > 0) {
            // ALL analyses must be complete
            stockAnalysisStatus = 'completed';
          } else if (runningAnalyses > 0) {
            // If ANY are running, the step is running
            stockAnalysisStatus = 'running';
          } else if (completedAnalyses > 0) {
            // If some are complete but none are running, still mark as running (waiting for others to start)
            stockAnalysisStatus = 'running';
          } else {
            // Otherwise it's pending
            stockAnalysisStatus = 'pending';
          }

          // NEVER trust DB status over our calculation
          if (stockAnalysisStep.status === 'completed' && stockAnalysisStatus !== 'completed') {
            console.warn('⚠️ DB says stock analysis completed but we have incomplete analyses - using our calculation');
          }

          console.log(`📊 Final stock analysis status: ${stockAnalysisStatus}`);

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

        // Check if portfolio manager is complete or running
        // It's complete if either the rebalance_agent step is complete OR if we have a rebalance_plan
        // It's running if status is 'planning'
        let portfolioManagerStatus = 'pending';
        if (rebalanceAgentStep.status === 'completed' || portfolioManagerStep.status === 'completed' || rebalanceRequest.rebalance_plan || status === 'pending_approval') {
          portfolioManagerStatus = 'completed';
        } else if (isRunning && status === 'planning') {
          portfolioManagerStatus = 'running';
        }

        workflowSteps.push({
          id: 'rebalance',
          title: 'Portfolio Manager',
          description: 'Calculating optimal portfolio rebalancing strategy and generating trade orders',
          status: portfolioManagerStatus,
          completedAt: rebalanceAgentStep.data?.completedAt || portfolioManagerStep.data?.completedAt || rebalanceRequest.plan_generated_at
        });

        const rebalanceData = {
          id: rebalanceRequest.id,
          status: isCompleted ? 'completed' : isPendingApproval ? 'pending_approval' : isRunning ? 'running' : isCancelled ? 'canceled' : isFailed ? 'error' : status,
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

          agentInsights: {
            rebalanceAgent: rebalancePlan.rebalance_agent_insight || '',
            opportunityAgent: rebalancePlan.opportunity_agent_insight || ''
          },

          opportunityAgentUsed: !rebalanceRequest.skip_opportunity_agent,
          skipThresholdCheck: rebalanceRequest.skip_threshold_check,
          skipOpportunityAgent: rebalanceRequest.skip_opportunity_agent,
          workflowSteps,

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

  const handleApproveOrder = async (ticker: string) => {
    if (!rebalanceData?.id) {
      toast({
        title: "Error",
        description: "Rebalance ID not found",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Executing Order",
        description: `Submitting order for ${ticker} to Alpaca...`,
      });

      // Call edge function to execute the rebalance trade
      const { data, error } = await supabase.functions.invoke('execute-rebalance-trade', {
        body: {
          rebalanceId: rebalanceData.id,
          ticker,
          action: 'approve'
        }
      });

      if (error) throw error;

      if (data?.success) {
        setExecutedTickers(new Set([...executedTickers, ticker]));

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

    try {
      // Call edge function to reject the rebalance trade
      const { data, error } = await supabase.functions.invoke('execute-rebalance-trade', {
        body: {
          rebalanceId: rebalanceData.id,
          ticker,
          action: 'reject'
        }
      });

      if (error) throw error;

      if (data?.success) {
        setRejectedTickers(new Set([...rejectedTickers, ticker]));

        // Update the local position data
        const position = rebalanceData.recommendedPositions.find((p: RebalancePosition) => p.ticker === ticker);
        if (position) {
          position.orderStatus = 'rejected';
        }

        toast({
          title: "Order Skipped",
          description: `Order for ${ticker} has been skipped`,
        });
      }
    } catch (error: any) {
      console.error('Error rejecting order:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject order",
        variant: "destructive",
      });
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
        pendingPositions.map((position: RebalancePosition) =>
          supabase.functions.invoke('execute-rebalance-trade', {
            body: {
              rebalanceId: rebalanceData.id,
              ticker: position.ticker,
              action: 'approve'
            }
          })
        )
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
          title: "Orders Failed",
          description: `Failed to submit orders`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Error executing all orders:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to execute orders",
        variant: "destructive",
      });
    }
  };

  // Calculate values only if rebalanceData is available
  const pendingPositions = rebalanceData?.recommendedPositions
    ?.filter((p: RebalancePosition) => p.shareChange !== 0 && !executedTickers.has(p.ticker) && !rejectedTickers.has(p.ticker)) || [];

  const totalBuyValue = pendingPositions
    .filter((p: RebalancePosition) => p.action === 'BUY')
    .reduce((sum: number, p: RebalancePosition) => sum + Math.abs(p.shareChange * (p.currentValue / p.currentShares || 200)), 0);

  const totalSellValue = pendingPositions
    .filter((p: RebalancePosition) => p.action === 'SELL')
    .reduce((sum: number, p: RebalancePosition) => sum + Math.abs(p.shareChange * (p.currentValue / p.currentShares)), 0);

  const netCashFlow = totalSellValue - totalBuyValue;
  const hasPendingOrders = pendingPositions.length > 0;

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
                {rebalanceData?.status === 'running' && (
                  <Badge variant="outline" className="text-sm">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Running
                  </Badge>
                )}
                {rebalanceData?.status === 'pending_approval' && (
                  <Badge variant="default" className="text-sm">
                    <Clock className="w-3 h-3 mr-1" />
                    Pending Approval
                  </Badge>
                )}
                {rebalanceData?.status === 'completed' && (
                  <Badge variant="secondary" className="text-sm">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Completed
                  </Badge>
                )}
                {rebalanceData?.status === 'error' && (
                  <Badge variant="destructive" className="text-sm">
                    <XCircle className="w-3 h-3 mr-1" />
                    Error
                  </Badge>
                )}
                {rebalanceData?.status === 'canceled' && (
                  <Badge variant="outline" className="text-sm">
                    <XCircle className="w-3 h-3 mr-1" />
                    Canceled
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
              <TabsList className="grid w-full grid-cols-3 max-w-lg mx-auto">
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
                  <ScrollArea className="flex-1 px-6 pb-4 mt-6">
                    {/* Different states based on rebalance status */}
                    {(() => {
                      const isRunning = rebalanceData.status === 'running';
                      const isAnalyzing = rebalanceData.status === 'analyzing' || rebalanceData.status === 'initializing';
                      const isPlanning = rebalanceData.status === 'planning';
                      const isPendingApproval = rebalanceData.status === 'pending_approval';
                      const isExecuting = rebalanceData.status === 'executing' || rebalanceData.status === 'pending_trades';
                      const isCompleted = rebalanceData.status === 'completed';
                      const isCanceled = rebalanceData.status === 'canceled';
                      const isError = rebalanceData.status === 'error';
                      const hasPositions = rebalanceData.recommendedPositions && rebalanceData.recommendedPositions.length > 0;
                      const allPositionsProcessed = rebalanceData.recommendedPositions?.every((p: RebalancePosition) =>
                        executedTickers.has(p.ticker) || rejectedTickers.has(p.ticker) || p.shareChange === 0
                      );

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

                      // State 3: Error occurred
                      if (isError) {
                        return (
                          <div className="flex flex-col items-center justify-center p-12 space-y-6">
                            <div className="relative">
                              <XCircle className="w-20 h-20 text-destructive" />
                            </div>
                            <div className="text-center space-y-2">
                              <h3 className="text-lg font-semibold">Rebalance Failed</h3>
                              <p className="text-sm text-muted-foreground max-w-md">
                                An error occurred during the rebalancing process. Please try again or contact support if the issue persists.
                              </p>
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

                      // State 5: No actions needed
                      if (hasPositions && rebalanceData.recommendedPositions.every((p: RebalancePosition) => p.shareChange === 0)) {
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
                                      console.log('🔍 Trades count calculation:', {
                                        recommendedPositions: rebalanceData.recommendedPositions,
                                        positionsLength: rebalanceData.recommendedPositions?.length,
                                        tradesWithChanges: rebalanceData.recommendedPositions?.filter((p: RebalancePosition) => p.shareChange !== 0),
                                        tradesCount
                                      });
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
                                      {rejectedTickers.size} skipped
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

                            {/* Rebalancing Positions */}
                            <div className="space-y-3 mb-6">
                              {rebalanceData.recommendedPositions?.map((position: RebalancePosition) => {
                                const isExecuted = executedTickers.has(position.ticker);
                                const isRejected = rejectedTickers.has(position.ticker);

                                if (isRejected) return null;

                                return (
                                  <RebalancePositionCard
                                    key={position.ticker}
                                    position={position}
                                    isExecuted={isExecuted}
                                    onApprove={() => handleApproveOrder(position.ticker)}
                                    onReject={() => handleRejectOrder(position.ticker)}
                                  />
                                );
                              })}
                            </div>
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
                                      {rejectedTickers.size} order{rejectedTickers.size !== 1 ? 's' : ''} skipped
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
                </TabsContent>

                <TabsContent value="workflow" className="data-[state=active]:block hidden">
                  <ScrollArea className="h-[calc(90vh-220px)] px-6 pt-6">
                    <div className="pb-6">
                      <RebalanceWorkflowSteps workflowData={rebalanceData} />
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="insights" className="data-[state=active]:block hidden">
                  <ScrollArea className="h-[calc(90vh-220px)] px-6 pt-6">
                    <div className="pb-6 space-y-4">
                      {/* Threshold Check Insights */}
                      {!rebalanceData.skipThresholdCheck && (() => {
                        const thresholdStep = rebalanceData.workflowSteps?.find((s: any) => s.id === 'threshold');
                        if (thresholdStep?.insights) {
                          return (
                            <Card className="overflow-hidden">
                              <CardHeader className="bg-muted/30">
                                <CardTitle className="text-base flex items-center gap-2">
                                  <AlertCircle className="w-4 h-4" />
                                  Threshold Check Analysis
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-4 space-y-3">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Rebalance Threshold</p>
                                    <p className="text-lg font-semibold">{thresholdStep.insights.threshold}%</p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Maximum Drift Detected</p>
                                    <p className={`text-lg font-semibold ${thresholdStep.insights.exceededThreshold ? 'text-orange-500' : 'text-green-500'}`}>
                                      {thresholdStep.insights.maxPriceChange?.toFixed(2)}%
                                    </p>
                                  </div>
                                </div>

                                {thresholdStep.insights.positionDrifts && thresholdStep.insights.positionDrifts.length > 0 && (
                                  <div className="border-t pt-3">
                                    <p className="text-sm font-medium mb-2">
                                      {thresholdStep.insights.positionsExceedingThreshold} of {thresholdStep.insights.totalPositions} positions exceeded threshold
                                    </p>
                                    <div className="space-y-2">
                                      {thresholdStep.insights.positionDrifts
                                        .filter((d: any) => d.exceedsThreshold)
                                        .map((drift: any) => (
                                          <div key={drift.ticker} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                            <span className="font-mono font-medium">{drift.ticker}</span>
                                            <span className={`text-sm ${drift.exceedsThreshold ? 'text-orange-500' : ''}`}>
                                              Price change: {drift.priceChangePercent > 0 ? '+' : ''}{drift.priceChangePercent.toFixed(1)}%
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                )}

                                <div className="border-t pt-3">
                                  <MarkdownRenderer content={thresholdStep.insights.reasoning} className="text-sm text-muted-foreground italic" />
                                </div>
                              </CardContent>
                            </Card>
                          );
                        }
                        return null;
                      })()}

                      {/* Opportunity Analysis Insights */}
                      {!rebalanceData.skipOpportunityAgent && (() => {
                        const opportunityStep = rebalanceData.workflowSteps?.find((s: any) => s.id === 'opportunity');
                        if (opportunityStep?.insights) {
                          // Handle case where insights might be a string (raw AI response)
                          let parsedInsights = opportunityStep.insights;
                          if (typeof parsedInsights === 'string') {
                            console.log('📝 Opportunity insights is string, displaying as raw text');
                            return (
                              <Card className="overflow-hidden">
                                <CardHeader className="bg-muted/30">
                                  <CardTitle className="text-base flex items-center gap-2">
                                    <Zap className="w-4 h-4" />
                                    Opportunity Analysis
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                  <div className="p-3 bg-muted/30 rounded">
                                    <p className="text-sm text-muted-foreground mb-2">AI Response (JSON parsing failed):</p>
                                    <MarkdownRenderer content={parsedInsights} className="text-xs" />
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          }

                          return (
                            <Card className="overflow-hidden">
                              <CardHeader className="bg-muted/30">
                                <CardTitle className="text-base flex items-center gap-2">
                                  <Zap className="w-4 h-4" />
                                  Opportunity Analysis
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-4 space-y-3">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Recommendation</p>
                                    <p className={`text-lg font-semibold ${parsedInsights.recommendAnalysis ? 'text-green-500' : 'text-gray-500'}`}>
                                      {parsedInsights.recommendAnalysis ? 'Analysis Recommended' : 'No Action Needed'}
                                    </p>
                                  </div>
                                  {parsedInsights.marketConditions && (
                                    <div className="space-y-1">
                                      <p className="text-sm text-muted-foreground">Market Conditions</p>
                                      <p className="text-lg font-semibold capitalize">
                                        {parsedInsights.marketConditions.trend} / {parsedInsights.marketConditions.volatility}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {parsedInsights.selectedStocks && parsedInsights.selectedStocks.length > 0 && (
                                  <div className="border-t pt-3">
                                    <p className="text-sm font-medium mb-2">
                                      Selected {parsedInsights.selectedStocksCount} of {parsedInsights.evaluatedStocksCount} stocks for analysis
                                    </p>
                                    <div className="space-y-2">
                                      {parsedInsights.selectedStocks.map((stock: any) => (
                                        <div key={stock.ticker} className="p-2 bg-muted/30 rounded">
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono font-medium">{stock.ticker}</span>
                                            <Badge variant="outline" className="text-xs">
                                              {stock.priority}
                                            </Badge>
                                          </div>
                                          <MarkdownRenderer content={stock.reason} className="text-sm text-muted-foreground" />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="border-t pt-3">
                                  <MarkdownRenderer content={parsedInsights.reasoning} className="text-sm text-muted-foreground italic" />
                                </div>
                              </CardContent>
                            </Card>
                          );
                        }
                        return null;
                      })()}

                      {/* Related Stock Analyses */}
                      {rebalanceData.relatedAnalyses && rebalanceData.relatedAnalyses.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-medium text-muted-foreground">Individual Stock Analyses</h3>
                          {rebalanceData.relatedAnalyses.map((analysis: any) => (
                            <div
                              key={analysis.id}
                              className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => setSelectedAnalysis({
                                ticker: analysis.ticker,
                                date: analysis.analysis_date || analysis.created_at
                              })}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold">{analysis.ticker}</span>
                                  {analysis.decision && (
                                    <Badge variant={getDecisionVariant(analysis.decision)}>
                                      <span className="flex items-center gap-1">
                                        {getDecisionIcon(analysis.decision)}
                                        {analysis.decision}
                                      </span>
                                    </Badge>
                                  )}
                                  {analysis.confidence && (
                                    <span className={`text-sm font-medium ${getConfidenceColor(analysis.confidence)}`}>
                                      {analysis.confidence}% confidence
                                    </span>
                                  )}
                                  {analysis.analysis_status === 0 && (
                                    <Badge variant="outline" className="text-xs">
                                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                      Analyzing
                                    </Badge>
                                  )}
                                  {analysis.analysis_status === -1 && (
                                    <Badge variant="destructive" className="text-xs">
                                      <XCircle className="w-3 h-3 mr-1" />
                                      Failed
                                    </Badge>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="border border-slate-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAnalysis({
                                      ticker: analysis.ticker,
                                      date: analysis.analysis_date || analysis.created_at
                                    });
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View Details
                                </Button>
                              </div>

                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  Analysis date: {new Date(analysis.created_at).toLocaleDateString()}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })}
                                </span>
                              </div>

                              {/* Show agent insights preview if available */}
                              {analysis.agent_insights && (
                                <div className="text-xs text-muted-foreground">
                                  {Object.keys(analysis.agent_insights).filter(k => analysis.agent_insights[k]).length} agents completed
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Portfolio Manager Insights */}
                      {(() => {
                        const portfolioStep = rebalanceData.workflowSteps?.find((s: any) => s.id === 'rebalance');
                        // Check all possible locations where Portfolio Manager insights might be stored
                        // Priority: portfolioManager key first, then rebalanceAgent for backward compatibility
                        const portfolioInsights = 
                          rebalanceData.rebalance_plan?.agentInsights?.portfolioManager ||
                          rebalanceData.rebalance_plan?.agentInsights?.rebalanceAgent ||
                          rebalanceData.rebalance_plan?.portfolioManagerInsights ||
                          rebalanceData.agentInsights?.portfolioManager ||
                          rebalanceData.agentInsights?.rebalanceAgent;

                        // Debug logging to understand the data structure
                        console.log('Portfolio Manager Insights Debug:', {
                          portfolioStepStatus: portfolioStep?.status,
                          hasPortfolioInsights: !!portfolioInsights,
                          foundAt: portfolioInsights ? (
                            rebalanceData.rebalance_plan?.agentInsights?.portfolioManager ? 'rebalance_plan.agentInsights.portfolioManager' :
                            rebalanceData.rebalance_plan?.agentInsights?.rebalanceAgent ? 'rebalance_plan.agentInsights.rebalanceAgent' :
                            rebalanceData.rebalance_plan?.portfolioManagerInsights ? 'rebalance_plan.portfolioManagerInsights' :
                            rebalanceData.agentInsights?.portfolioManager ? 'agentInsights.portfolioManager' :
                            rebalanceData.agentInsights?.rebalanceAgent ? 'agentInsights.rebalanceAgent' :
                            'unknown'
                          ) : 'not found',
                          rebalancePlan: rebalanceData.rebalance_plan,
                          agentInsights: rebalanceData.agentInsights,
                          nestedAgentInsights: rebalanceData.rebalance_plan?.agentInsights
                        });

                        // Show insights if they exist, even if status isn't marked complete yet
                        if (portfolioInsights) {
                          return (
                            <Card className="overflow-hidden">
                              <CardHeader className="bg-muted/30">
                                <CardTitle className="text-base flex items-center gap-2">
                                  <PieChart className="w-4 h-4" />
                                  Portfolio Manager Analysis
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-4">
                                <MarkdownRenderer content={portfolioInsights} />
                              </CardContent>
                            </Card>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </ScrollArea>
                </TabsContent>
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

