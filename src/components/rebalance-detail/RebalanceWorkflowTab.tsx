import { TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  Activity,
  ChartBar,
  MessageSquare,
  Shield,
  XCircle,
  Lightbulb,
  ChartColumn,
  RefreshCcw,
  ChartCandlestick
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { isRebalanceActive, convertLegacyRebalanceStatus } from "@/lib/statusTypes";

interface RebalanceWorkflowTabProps {
  workflowData: any;
  onNavigateToInsight?: (agentKey: string) => void;
  onOpenAnalysisModal?: (ticker: string, analysisId: string) => void;
}

// Calculate completion percentage based on agent step completion (same logic as RebalanceHistoryTable)
const calculateAgentStepCompletion = (stockAnalyses: any[]): number => {
  if (!stockAnalyses || stockAnalyses.length === 0) return 0;

  let totalAgentSteps = 0;
  let completedAgentSteps = 0;

  // Define expected agents per analysis (matching RebalanceHistoryTable)
  const expectedAgents = [
    'macro-analyst', 'market-analyst', 'news-analyst', 'social-media-analyst', 'fundamentals-analyst',
    'bull-researcher', 'bear-researcher', 'research-manager',
    'risky-analyst', 'safe-analyst', 'neutral-analyst', 'risk-manager',
    'trader'
  ];

  stockAnalyses.forEach((stockAnalysis: any) => {
    // Count expected agent steps for this stock
    totalAgentSteps += expectedAgents.length;

    // Count completed agents based on messages in fullAnalysis
    const messages = stockAnalysis.fullAnalysis?.messages || [];
    const completedAgents = new Set<string>();

    messages.forEach((msg: any) => {
      if (msg.agent && msg.timestamp) {
        // Consider an agent completed if it has a timestamp (indicating it posted a message)
        const normalizedAgent = msg.agent.toLowerCase().replace(/\s+/g, '-');
        completedAgents.add(normalizedAgent);
      }
    });

    // Count how many expected agents have completed
    expectedAgents.forEach(agentKey => {
      if (completedAgents.has(agentKey)) {
        completedAgentSteps++;
      }
    });
  });

  const percentage = totalAgentSteps > 0 ? (completedAgentSteps / totalAgentSteps) * 100 : 0;
  return percentage;
};

// Workflow Steps Component
function RebalanceWorkflowSteps({
  workflowData,
  onNavigateToInsight,
  onOpenAnalysisModal
}: {
  workflowData: any;
  onNavigateToInsight?: (agentKey: string) => void;
  onOpenAnalysisModal?: (ticker: string, analysisId: string) => void;
}) {
  const getStepStatus = (step: any) => {
    // Check if step should be skipped
    if (step.id === 'threshold' && workflowData.skipThresholdCheck) {
      return 'skipped';
    }
    if (step.id === 'opportunity' && workflowData.skipOpportunityAgent) {
      return 'skipped';
    }
    // Check for error status in step data
    if (step.data?.error || step.status === 'error') {
      return 'error';
    }

    // Special handling for analysis step - check if all analyses are complete
    if (step.id === 'analysis' && step.stockAnalyses?.length > 0) {
      const completionPercentage = calculateAgentStepCompletion(step.stockAnalyses);
      if (completionPercentage >= 100) {
        return 'completed';
      } else if (completionPercentage > 0) {
        return 'running';
      }
    }

    return step.status || 'pending';
  };

  const getAgentStatus = (agentKey: string, stockAnalysis?: any) => {
    // The agents object contains the actual status for each agent
    if (stockAnalysis && stockAnalysis.agents) {
      const status = stockAnalysis.agents[agentKey];
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
        const isError = stepStatus === 'error';

        // Don't show skipped steps
        if (isSkipped) return null;

        return (
          <div key={step.id} className="relative">
            <div className="space-y-4">
              {/* Step Header */}
              <div
                className={`rounded-lg border p-4 transition-all ${(step.id === 'opportunity' || step.id === 'portfolio') && onNavigateToInsight
                  ? 'cursor-pointer hover:shadow-md'
                  : ''
                  } ${isCompleted
                    ? 'border-green-500/30 bg-green-500/5 dark:bg-green-500/5'
                    : isError
                      ? 'border-red-500/30 bg-red-500/5 dark:bg-red-500/5'
                      : isRunning
                        ? 'border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-500/5'
                        : 'border-border'
                  }`}
                onClick={() => {
                  // Handle clicks for opportunity and portfolio agents
                  if (step.id === 'opportunity' && onNavigateToInsight) {
                    onNavigateToInsight('opportunityAgent');
                  } else if (step.id === 'portfolio' && onNavigateToInsight) {
                    onNavigateToInsight('portfolioManager');
                  }
                }}
                title={
                  step.id === 'opportunity' || step.id === 'portfolio'
                    ? 'Click to view insight'
                    : undefined
                }>
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Step Icon */}
                      <div className={`p-3 rounded-lg ${isCompleted
                        ? 'bg-green-500/10 dark:bg-green-500/5 text-green-600 dark:text-green-400'
                        : isError
                          ? 'bg-red-500/10 dark:bg-red-500/5 text-red-600 dark:text-red-400'
                          : isRunning
                            ? 'bg-yellow-500/10 dark:bg-yellow-100/5 text-yellow-600 dark:text-yellow-400'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                        <Icon className="w-6 h-6" />
                      </div>

                      {/* Step Details */}
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold">{step.title}</h3>
                          {isCompleted && (
                            <Badge variant="completed" className="text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Complete
                            </Badge>
                          )}
                          {isRunning && (
                            <Badge variant="running" className="text-xs">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              In Progress
                            </Badge>
                          )}
                          {isPending && (
                            <Badge variant="pending" className="text-xs">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                          {isError && (
                            <Badge variant="error" className="text-xs">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Failed
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{step.description}</p>

                        {/* Show error details if step failed */}
                        {isError && step.data?.error && (
                          <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded text-sm">
                            <p className="text-destructive font-medium">Error:</p>
                            <p className="text-muted-foreground mt-1">
                              {(() => {
                                let errorMsg = step.data.error;
                                // Try to extract cleaner error message
                                if (typeof errorMsg === 'string' && errorMsg.includes('{') && errorMsg.includes('}')) {
                                  try {
                                    const jsonMatch = errorMsg.match(/"message"\s*:\s*"([^"]+)"/i);
                                    if (jsonMatch) {
                                      return jsonMatch[1];
                                    } else if (errorMsg.includes('Insufficient credits')) {
                                      const creditMatch = errorMsg.match(/Insufficient credits[^"\}]*/i);
                                      if (creditMatch) {
                                        return creditMatch[0];
                                      }
                                    }
                                  } catch (e) {
                                    // Fall through to return original
                                  }
                                }
                                return errorMsg;
                              })()}
                            </p>
                          </div>
                        )}

                        {/* Progress for stock analysis step - matches RebalanceHistoryTable exactly */}
                        {step.id === 'analysis' && step.stockAnalyses?.length > 0 && (
                          (() => {
                            // Calculate completion percentage
                            const completionPercentage = calculateAgentStepCompletion(step.stockAnalyses);
                            const isFullyComplete = completionPercentage >= 100;

                            // Check if overall rebalance is active (same as RebalanceHistoryTable)
                            const rebalanceIsActive = workflowData.status && isRebalanceActive(convertLegacyRebalanceStatus(workflowData.status));

                            if (rebalanceIsActive && !isFullyComplete) {
                              // Active rebalance and not complete - show yellow with pulse animation
                              return (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-yellow-500 animate-pulse transition-all "
                                      style={{
                                        width: `${completionPercentage}%`
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                    {Math.round(completionPercentage)}%
                                  </span>
                                </div>
                              );
                            } else if (isFullyComplete || isCompleted) {
                              // 100% complete or step marked as completed - show green
                              return (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-green-500 transition-all duration-300"
                                      style={{
                                        width: `${completionPercentage}%`
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-green-600 dark:text-green-400">
                                    {Math.round(completionPercentage)}%
                                  </span>
                                </div>
                              );
                            } else {
                              // Other states - show gray
                              return (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-muted-foreground/30 transition-all duration-300"
                                      style={{
                                        width: `${completionPercentage}%`
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {Math.round(completionPercentage)}%
                                  </span>
                                </div>
                              );
                            }
                          })()
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
                    // Get research and other steps from full_analysis workflow steps
                    const fullAnalysis = stockAnalysis.fullAnalysis || {};
                    const fullWorkflowSteps = fullAnalysis.workflowSteps || [];

                    const getStepStatusFromWorkflow = (stepId: string) => {
                      const step = fullWorkflowSteps.find((s: any) => s.id === stepId);
                      if (!step) return 'pending';

                      // Check if all agents in this step are completed
                      const agents = step.agents || [];
                      
                      // Debug logging for research phase
                      if (stepId === 'research' && agents.length > 0) {
                        console.log(`Research phase full step data:`, step);
                        console.log(`Research phase agents:`, agents.map((a: any) => ({
                          name: a.name,
                          status: a.status,
                          error: a.error,
                          errorAt: a.errorAt
                        })));
                      }
                      
                      const anyError = agents.some((a: any) => a.status === 'error' || a.status === 'failed');
                      const allCompleted = agents.length > 0 && agents.every((a: any) => a.status === 'completed');
                      const anyRunning = agents.some((a: any) => a.status === 'running');
                      const anyCompleted = agents.some((a: any) => a.status === 'completed');
                      
                      // Check if analysis is complete (by checking if later phases have completed agents)
                      const analysisComplete = fullWorkflowSteps.some((s: any) => 
                        (s.id === 'risk' || s.id === 'portfolio') && 
                        s.agents?.some((a: any) => a.status === 'completed')
                      );

                      // If analysis is complete but this phase has agents still "running", they actually failed
                      if (analysisComplete && anyRunning) {
                        return 'error';  // Agents got stuck/failed
                      }

                      if (anyError) return 'error';
                      if (allCompleted) return 'completed';
                      if (anyRunning || anyCompleted) return 'running';
                      return 'pending';
                    };

                    const workflowSteps = [
                      {
                        name: 'Data Analysis',
                        key: 'dataAnalysis',
                        icon: ChartBar,
                        status: getStepStatusFromWorkflow('analysis')  // Use consistent method like other phases
                      },
                      {
                        name: 'Research',
                        key: 'research',
                        icon: MessageSquare,
                        status: getStepStatusFromWorkflow('research')
                      },
                      {
                        name: 'Trading Decision',
                        key: 'trading',
                        icon: ChartCandlestick,
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
                                stockAnalysis.decision === 'BUY' ? 'buy' :
                                  stockAnalysis.decision === 'SELL' ? 'sell' :
                                    'hold'
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
                                className={`relative rounded-lg border p-3 transition-all cursor-pointer ${stepStatus === 'completed'
                                  ? 'border-green-500/30 bg-green-500/5 dark:bg-green-500/5 hover:shadow-md'
                                  : stepStatus === 'running'
                                    ? 'border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-500/5 shadow-sm hover:shadow-md'
                                    : stepStatus === 'error'
                                      ? 'border-red-500/30 bg-red-500/5 dark:bg-red-500/5 hover:border-red-500/50'
                                      : 'border-border hover:shadow-md'
                                  }`}
                                onClick={() => {
                                  // Open analysis modal for this stock at the specific workflow step
                                  if (onOpenAnalysisModal && stockAnalysis.id) {
                                    onOpenAnalysisModal(stockAnalysis.ticker, stockAnalysis.id);
                                  }
                                }}
                                title={stepStatus === 'error' ? "Click to view error details" : "Click to view analysis details"}
                              >
                                <div className="flex flex-col items-center text-center space-y-2">
                                  <div className={`p-2 rounded-lg ${stepStatus === 'completed'
                                    ? 'bg-green-500/10 dark:bg-green-500/5 text-green-600 dark:text-green-400'
                                    : stepStatus === 'running'
                                      ? 'bg-yellow-500/10 dark:bg-yellow-500/5 text-yellow-600 dark:text-yellow-400'
                                      : stepStatus === 'error'
                                        ? 'bg-red-500/10 dark:bg-red-500/5 text-red-600 dark:text-red-400'
                                        : 'bg-muted text-muted-foreground'
                                    }`}>
                                    <StepIcon className="w-4 h-4" />
                                  </div>

                                  <h4 className="font-medium text-xs">{step.name}</h4>

                                  <Badge
                                    variant={
                                      stepStatus === 'completed' ? 'completed' :
                                        stepStatus === 'running' ? 'running' :
                                          stepStatus === 'error' ? 'error' :
                                            'pending' as any
                                    }
                                    className="text-xs"
                                  >
                                    {stepStatus === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                                    {stepStatus === 'running' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                    {stepStatus === 'error' && <XCircle className="w-3 h-3 mr-1" />}
                                    {stepStatus === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                                    {stepStatus === 'error' ? 'Failed' : stepStatus.charAt(0).toUpperCase() + stepStatus.slice(1)}
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
            {(workflowData.status === 'completed' || workflowData.status === 'pending_approval') && (
              <Badge variant="completed" className="text-sm">
                <CheckCircle className="w-3 h-3 mr-1" />
                Complete
              </Badge>
            )}
            {workflowData.status === 'running' && (
              <Badge variant="running" className="text-sm">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                In Progress
              </Badge>
            )}
            {workflowData.status === 'error' && (
              <Badge variant="error" className="text-sm">
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

export default function RebalanceWorkflowTab({
  workflowData,
  onNavigateToInsight,
  onOpenAnalysisModal
}: RebalanceWorkflowTabProps) {
  return (
    <TabsContent value="workflow" className="data-[state=active]:block hidden">
      <ScrollArea className="h-[calc(90vh-220px)] px-6 pt-6">
        <div className="pb-6">
          <RebalanceWorkflowSteps
            workflowData={workflowData}
            onNavigateToInsight={onNavigateToInsight}
            onOpenAnalysisModal={onOpenAnalysisModal}
          />
        </div>
      </ScrollArea>
    </TabsContent>
  );
}