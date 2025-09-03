import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import {
  Activity,
  BarChart3,
  Brain,
  Briefcase,
  CheckCircle,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
  AlertTriangle,
  AlertCircle,
  History,
  ChartBar,
  Grid2x2Check,
  Share2,
  ChartCandlestick,
  OctagonAlert,
  ShieldCheck,
  CircleSlash
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
// Import centralized status system
import {
  type AnalysisStatus,
  type RebalanceStatus,
  ANALYSIS_STATUS,
  REBALANCE_STATUS,
  getStatusDisplayText
} from "@/lib/statusTypes";

interface WorkflowStepsLayoutProps {
  analysisData: any;
  onApproveOrder?: () => void;
  onRejectOrder?: () => void;
  isOrderExecuted?: boolean;
  onNavigateToInsight?: (agentKey: string) => void;
}

// Enhanced Workflow Steps Layout Component
export default function WorkflowStepsLayout({
  analysisData,
  onApproveOrder,
  onRejectOrder,
  isOrderExecuted,
  onNavigateToInsight
}: WorkflowStepsLayoutProps) {
  // State for error modal
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [selectedAgentError, setSelectedAgentError] = useState<{
    agentName: string;
    error: string;
    details?: any;
  } | null>(null);

  // Check if this analysis is part of a rebalance request
  const isRebalanceAnalysis = !!analysisData.rebalance_request_id;

  const workflowSteps = [
    {
      id: 'analysis',
      title: 'Market Analysis',
      description: 'Gathering and analyzing market data from multiple sources',
      icon: ChartBar,
      agents: [
        { name: 'Macro Analyst', key: 'macroAnalyst', icon: BarChart3 },
        { name: 'Market Analyst', key: 'marketAnalyst', icon: History },
        { name: 'News Analyst', key: 'newsAnalyst', icon: FileText },
        { name: 'Social Media Analyst', key: 'socialMediaAnalyst', icon: Share2 },
        { name: 'Fundamentals Analyst', key: 'fundamentalsAnalyst', icon: Grid2x2Check }
      ]
    },
    {
      id: 'research',
      title: 'Research Debate',
      description: 'Bull vs Bear research analysis with debate rounds',
      icon: MessageSquare,
      agents: [
        { name: 'Bull Researcher', key: 'bullResearcher', icon: TrendingUp },
        { name: 'Bear Researcher', key: 'bearResearcher', icon: TrendingDown },
        { name: 'Research Manager', key: 'researchManager', icon: Users }
      ]
    },
    {
      id: 'trading',
      title: 'Trading Decision',
      description: 'Making the final trading call based on research',
      icon: ChartCandlestick,
      agents: [
        { name: 'Trader', key: 'trader', icon: ChartCandlestick }
      ]
    },
    {
      id: 'risk',
      title: 'Risk Assessment',
      description: 'Evaluating risks and final validation across scenarios',
      icon: Shield,
      agents: [
        { name: 'Risky Analyst', key: 'riskyAnalyst', icon: OctagonAlert },
        { name: 'Safe Analyst', key: 'safeAnalyst', icon: ShieldCheck },
        { name: 'Neutral Analyst', key: 'neutralAnalyst', icon: CircleSlash },
        { name: 'Risk Manager', key: 'riskManager', icon: Shield }
      ]
    }
  ];

  // Only add Portfolio Management step if this is NOT a rebalance analysis
  // For rebalance analyses, the portfolio manager runs once for all stocks together
  if (!isRebalanceAnalysis) {
    workflowSteps.push({
      id: 'portfolio',
      title: 'Portfolio Management',
      description: 'Position sizing and trade order generation',
      icon: Briefcase,
      agents: [
        { name: 'Portfolio Manager', key: 'portfolioManager', icon: Briefcase }
      ]
    });
  }

  const getAgentStatus = (agentKey: string, stepId?: string) => {
    // Check if analysis is cancelled
    const isAnalysisCancelled = analysisData.status === ANALYSIS_STATUS.CANCELLED || 
        analysisData.status === REBALANCE_STATUS.CANCELLED ||
        analysisData.is_canceled;
    
    // HYBRID APPROACH: Check agent_insights FIRST for completion (most reliable), then workflow steps for running status
    
    // First check agent_insights for completion and errors (most reliable)
    if (analysisData.agent_insights) {
      // Check for error conditions first
      // Backend stores errors with lowercase keys without camelCase (e.g., "marketanalyst_error" not "marketAnalyst_error")
      const errorKey = agentKey.toLowerCase() + '_error';
      if (analysisData.agent_insights[errorKey]) {
        console.log(`Found error for ${agentKey} at key ${errorKey}:`, analysisData.agent_insights[errorKey]);
        return 'error';
      }
      // Also check the original format for backward compatibility
      if (analysisData.agent_insights[agentKey + '_error']) {
        console.log(`Found error for ${agentKey} at legacy key ${agentKey + '_error'}:`, analysisData.agent_insights[agentKey + '_error']);
        return 'error';
      }
      // Then check for normal completion - allow completed agents to show even if cancelled
      if (analysisData.agent_insights[agentKey]) {
        return 'completed';
      }
    }
    
    // Then check workflow steps for running status (when agents are actively working)
    if (analysisData.workflowSteps) {
      for (const step of analysisData.workflowSteps) {
        // Find the agent in workflow steps by matching names
        const agent = step.agents?.find((a: any) => {
          const agentNameLower = a.name.toLowerCase().replace(/\s+/g, '');
          const keyLower = agentKey.toLowerCase();
          
          // More flexible name matching patterns
          // Handle both camelCase keys and display names
          if (agentNameLower.includes('macroanalyst') && keyLower.includes('macro')) return true;
          if (agentNameLower.includes('marketanalyst') && keyLower.includes('market')) return true;
          if (agentNameLower.includes('newsanalyst') && keyLower.includes('news')) return true;
          if (agentNameLower.includes('socialmediaanalyst') && keyLower.includes('social')) return true;
          if (agentNameLower.includes('fundamentalsanalyst') && keyLower.includes('fundamentals')) return true;
          if (agentNameLower.includes('bullresearcher') && keyLower.includes('bull')) return true;
          if (agentNameLower.includes('bearresearcher') && keyLower.includes('bear')) return true;
          if (agentNameLower.includes('researchmanager') && keyLower.includes('researchmanager')) return true;
          if (agentNameLower.includes('trader') && keyLower.includes('trader')) return true;
          if (agentNameLower.includes('riskyanalyst') && keyLower.includes('risky')) return true;
          if (agentNameLower.includes('safeanalyst') && keyLower.includes('safe')) return true;
          if (agentNameLower.includes('neutralanalyst') && keyLower.includes('neutral')) return true;
          if (agentNameLower.includes('riskmanager') && keyLower.includes('riskmanager')) return true;
          if (agentNameLower.includes('portfoliomanager') && keyLower.includes('portfolio')) return true;
          
          return false;
        });
        
        if (agent) {
          // If cancelled, convert 'running' or 'processing' to 'pending', but keep 'completed' and 'error'
          if (isAnalysisCancelled && (agent.status === 'running' || agent.status === 'processing')) {
            return 'pending';
          }
          // Return workflow status for active states (running/processing/error/completed)
          // This ensures error status is properly returned
          if (agent.status === 'running' || agent.status === 'processing' || agent.status === 'error' || agent.status === 'completed') {
            return agent.status;
          }
        }
      }
    }
    
    return 'pending';
  };

  // Get error details for an agent
  const getAgentError = (agentKey: string) => {
    // First check if the agent insight itself contains an error field
    if (analysisData.agent_insights?.[agentKey]?.error) {
      return {
        error: analysisData.agent_insights[agentKey].error,
        analysis: analysisData.agent_insights[agentKey].analysis,
        timestamp: analysisData.agent_insights[agentKey].timestamp
      };
    }
    
    // Backend stores errors with lowercase keys (e.g., "marketanalyst_error")
    const errorKey = agentKey.toLowerCase() + '_error';
    if (analysisData.agent_insights?.[errorKey]) {
      return analysisData.agent_insights[errorKey];
    }
    // Also check the original format for backward compatibility
    if (analysisData.agent_insights?.[agentKey + '_error']) {
      return analysisData.agent_insights[agentKey + '_error'];
    }
    return null;
  };

  // Handle showing error details in modal
  const handleShowError = (agentName: string, agentKey: string) => {
    const errorData = getAgentError(agentKey);
    if (errorData) {
      setSelectedAgentError({
        agentName,
        error: typeof errorData === 'string' ? errorData : (errorData.error || 'Unknown error'),
        details: typeof errorData === 'object' ? errorData : null
      });
      setErrorModalOpen(true);
    }
  };

  // Handle clicking on a completed agent to navigate to its insight
  const handleAgentClick = (status: string, agentName: string, agentKey: string) => {
    if (status === 'error') {
      handleShowError(agentName, agentKey);
    } else if (status === 'completed' && onNavigateToInsight) {
      onNavigateToInsight(agentKey);
    }
  };

  const getStepTimestamp = (stepId: string) => {
    if (analysisData.workflowSteps) {
      const step = analysisData.workflowSteps.find((s: any) => s.id === stepId);
      if (step?.completedAt) return step.completedAt;
      if (step?.startedAt) return step.startedAt;
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Trade Decision Summary Card - Show at top if decision is made */}
      {(() => {
        // Always show Portfolio Manager's decision if available
        const displayDecision = analysisData.tradeOrder?.action ||  // From actual trade order
                               analysisData.agent_insights?.portfolioManager?.finalDecision?.action || 
                               analysisData.agent_insights?.portfolioManager?.decision?.action ||
                               analysisData.agent_insights?.portfolioManager?.action ||
                               analysisData.decision;

        const shouldShow = displayDecision && displayDecision !== 'CANCELED' && 
          (analysisData.status === ANALYSIS_STATUS.COMPLETED || analysisData.status === REBALANCE_STATUS.COMPLETED) &&
          analysisData.status !== ANALYSIS_STATUS.CANCELLED && analysisData.status !== REBALANCE_STATUS.CANCELLED;

        return shouldShow && (
          <div className={`rounded-lg border p-6 ${displayDecision === 'BUY'
            ? 'bg-gradient-to-r from-green-500/5 to-green-600/5 border-green-500/20'
            : displayDecision === 'SELL'
              ? 'bg-gradient-to-r from-red-500/5 to-red-600/5 border-red-500/20'
              : displayDecision === 'HOLD'
                ? 'bg-gradient-to-r from-gray-500/5 to-gray-600/5 border-gray-500/20'
                : 'bg-gradient-to-r from-blue-500/5 to-primary/5 border-border'
            }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Activity className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {isRebalanceAnalysis ? 'Analysis Complete - Decision Ready' : 'Portfolio Manager Decision Ready'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {displayDecision === 'HOLD'
                      ? 'Recommendation: Maintain current position'
                      : `Recommendation: ${displayDecision} ${analysisData.ticker}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    displayDecision === 'BUY' ? 'default' :
                      displayDecision === 'SELL' ? 'destructive' :
                        'secondary'
                  }
                  className="text-sm px-3 py-1"
                >
                  {displayDecision === 'BUY' && <TrendingUp className="w-4 h-4 mr-1" />}
                  {displayDecision === 'SELL' && <TrendingDown className="w-4 h-4 mr-1" />}
                  {displayDecision === 'HOLD' && <Activity className="w-4 h-4 mr-1" />}
                  {displayDecision}
                </Badge>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Confidence</p>
                  <p className={`text-lg font-bold ${analysisData.confidence >= 80 ? 'text-green-600 dark:text-green-400' :
                    analysisData.confidence >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                    {analysisData.confidence}%
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Stats if available */}
            {analysisData.agent_insights?.portfolioManager?.finalDecision && displayDecision !== 'HOLD' && (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/50">
                <div>
                  <p className="text-xs text-muted-foreground">Order Size</p>
                  <p className="font-semibold">
                    {(() => {
                      const finalDecision = analysisData.agent_insights?.portfolioManager?.finalDecision;
                      if (finalDecision?.dollarAmount) {
                        return `$${finalDecision.dollarAmount.toLocaleString()}`;
                      } else if (finalDecision?.shares) {
                        return `${finalDecision.shares} shares`;
                      } else if (finalDecision?.changes?.value) {
                        return `$${Math.abs(finalDecision.changes.value).toLocaleString()}`;
                      }
                      return 'Pending';
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Order Type</p>
                  <p className="font-semibold">
                    {(() => {
                      const finalDecision = analysisData.agent_insights?.portfolioManager?.finalDecision;
                      return finalDecision?.dollarAmount ? 'Dollar-based' : 'Share-based';
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-semibold flex items-center gap-1">
                    {(() => {
                      const tradeOrder = analysisData.tradeOrder;
                      const orderStatus = tradeOrder?.status;
                      const isExecuted = orderStatus === 'executed' || isOrderExecuted;

                      if (isExecuted) {
                        return (
                          <>
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span className="text-green-600 dark:text-green-400">Executed</span>
                          </>
                        );
                      } else if (orderStatus === 'approved') {
                        return (
                          <>
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span className="text-green-600 dark:text-green-400">Approved</span>
                          </>
                        );
                      } else if (orderStatus === 'rejected') {
                        return (
                          <>
                            <XCircle className="w-3 h-3 text-red-500" />
                            <span className="text-white-600 dark:text-red-400">Rejected</span>
                          </>
                        );
                      } else {
                        return (
                          <>
                            <Clock className="w-3 h-3 text-yellow-500" />
                            <span className="text-yellow-600 dark:text-yellow-400">Pending Approval</span>
                          </>
                        );
                      }
                    })()}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {workflowSteps.map((step, stepIndex) => {
        const Icon = step.icon;
        
        // Check if overall analysis is cancelled first
        const isAnalysisCancelled = analysisData.status === ANALYSIS_STATUS.CANCELLED || 
                                   analysisData.status === REBALANCE_STATUS.CANCELLED ||
                                   analysisData.is_canceled;
        
        // Use unified agent status checking for all step-level calculations
        const agentStatuses = step.agents.map(agent => getAgentStatus(agent.key, step.id));
        const completedAgents = agentStatuses.filter(status => status === 'completed').length;
        const runningAgents = agentStatuses.filter(status => status === 'running' || status === 'processing').length;
        const errorAgents = agentStatuses.filter(status => status === 'error').length;
        const totalAgents = step.agents.length;
        
        // Step status with cancellation awareness
        const isCompleted = completedAgents === totalAgents;
        const hasErrors = errorAgents > 0;
        // If cancelled, don't show active state unless agents are actually completed
        const isActive = !isAnalysisCancelled && (runningAgents > 0 || (completedAgents > 0 && !isCompleted));
        const progressPercentage = Math.round((completedAgents / totalAgents) * 100);
        const timestamp = getStepTimestamp(step.id);

        return (
          <div key={step.id} className="relative">
            <div className="space-y-4">
              {/* Step Header */}
              <div className={`rounded-lg border p-4 transition-all ${isCompleted
                ? 'border-green-500/30 bg-green-500/5 dark:bg-green-500/5'
                : hasErrors
                  ? 'border-red-500/30 bg-red-500/5 dark:bg-red-500/5'
                  : isActive
                    ? 'border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-500/5'
                    : 'border-border'
                }`}>

                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Step Icon */}
                      <div className={`p-3 rounded-lg ${isCompleted
                        ? 'bg-green-500/10 dark:bg-green-500/5 text-green-600 dark:text-green-400'
                        : hasErrors
                          ? 'bg-red-500/10 dark:bg-red-500/5 text-red-600 dark:text-red-400'
                          : isActive
                            ? 'bg-yellow-500/10 dark:bg-yellow-500/5 text-yellow-600 dark:text-yellow-400'
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
                          {hasErrors && (
                            <Badge variant="error" className="text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {errorAgents} Error{errorAgents !== 1 ? 's' : ''}
                            </Badge>
                          )}
                          {isActive && !isCompleted && !hasErrors && (
                            <Badge variant="running" className="text-xs">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              In Progress
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{step.description}</p>

                        {/* Research phase debate rounds info */}
                        {step.id === 'research' && analysisData.agent_insights?.researchDebate && (
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-xs">
                              {analysisData.agent_insights.researchDebate.length} Debate Round{analysisData.agent_insights.researchDebate.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        )}

                        {/* Progress Bar */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {completedAgents}/{totalAgents} agents
                            </span>
                            <span className={isCompleted ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                              {progressPercentage}%
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${isCompleted
                                ? 'bg-green-500'
                                : isActive
                                  ? 'bg-yellow-500'
                                  : 'bg-muted-foreground/30'
                                }`}
                              style={{ width: `${progressPercentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Timestamp */}
                    {timestamp && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          {isCompleted ? 'Completed' : 'Started'}
                        </p>
                        <p className="text-sm">
                          {formatDistanceToNow(new Date(timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Agents Grid - Skip for single agent steps like Trading Decision and Portfolio Management */}
              {step.agents.length > 1 ? (
                <div 
                  className={`grid gap-3 pl-14 ${
                    step.agents.length === 2 ? 'grid-cols-2' :
                    step.agents.length === 3 ? 'grid-cols-3' :
                    step.agents.length === 4 ? 'grid-cols-2 md:grid-cols-4' :
                    step.agents.length === 5 ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5' :
                    'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                  }`}
                >
                  {step.agents.map((agent) => {
                    const status = getAgentStatus(agent.key, step.id);
                    const agentError = getAgentError(agent.key);
                    const AgentIcon = agent.icon;

                    return (
                      <div
                        key={agent.key}
                        className={`relative rounded-lg border p-4 transition-all ${status === 'completed'
                          ? 'border-green-500/30 bg-green-500/5 dark:bg-green-500/5 cursor-pointer hover:border-green-500/50'
                          : status === 'error'
                            ? 'border-red-500/30 bg-red-500/5 dark:bg-red-500/5 cursor-pointer hover:border-red-500/50'
                            : status === 'running'
                              ? 'border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-500/5 shadow-sm'
                              : 'border-border'
                          }`}
                        onClick={status === 'error' || status === 'completed' ? () => handleAgentClick(status, agent.name, agent.key) : undefined}
                        title={status === 'error' ? 'Click to view error details' : status === 'completed' ? 'Click to view insight' : undefined}
                      >
                        <div className="flex flex-col items-center text-center space-y-2">
                          {/* Agent Icon */}
                          <div className={`p-2 rounded-lg ${status === 'completed'
                            ? 'bg-green-500/10 dark:bg-green-500/5 text-green-600 dark:text-green-400'
                            : status === 'error'
                              ? 'bg-red-500/10 dark:bg-red-500/5 text-red-600 dark:text-red-400'
                              : status === 'running'
                                ? 'bg-yellow-500/10 dark:bg-yellow-500/5 text-yellow-600 dark:text-yellow-400'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                            <AgentIcon className="w-5 h-5" />
                          </div>

                          {/* Agent Name */}
                          <h4 className="font-medium text-sm">{agent.name}</h4>

                          {/* Status Badge */}
                          <Badge
                            variant={
                              status === 'completed' ? 'completed' :
                                status === 'error' ? 'error' :
                                  status === 'running' ? 'running' :
                                    'pending' as any
                            }
                            className="text-xs"
                          >
                            {status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                            {status === 'error' && <XCircle className="w-3 h-3 mr-1" />}
                            {status === 'running' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                            {status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                            {status === 'error' ? 'Failed' : (status.charAt(0).toUpperCase() + status.slice(1))}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
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
              {isRebalanceAnalysis
                ? "Stock analysis for rebalance workflow (Portfolio Manager runs after all stocks complete)"
                : "Analysis workflow execution status"}
            </p>
          </div>
          <div>
            {(() => {
              const status = analysisData.status;
              if (status === ANALYSIS_STATUS.COMPLETED || status === REBALANCE_STATUS.COMPLETED) {
                return (
                  <Badge variant="completed" className="text-sm">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Complete
                  </Badge>
                );
              } else if (status === ANALYSIS_STATUS.RUNNING || status === REBALANCE_STATUS.RUNNING) {
                return (
                  <Badge variant="running" className="text-sm">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    In Progress
                  </Badge>
                );
              } else if (status === ANALYSIS_STATUS.ERROR || status === REBALANCE_STATUS.ERROR) {
                return (
                  <Badge variant="error" className="text-sm">
                    <XCircle className="w-3 h-3 mr-1" />
                    Error
                  </Badge>
                );
              } else if (status === ANALYSIS_STATUS.CANCELLED || status === REBALANCE_STATUS.CANCELLED) {
                return (
                  <Badge variant="outline" className="text-sm">
                    <XCircle className="w-3 h-3 mr-1" />
                    Canceled
                  </Badge>
                );
              }
              return null;
            })()}
          </div>
        </div>
      </div>

      {/* Error Details Modal */}
      <Dialog open={errorModalOpen} onOpenChange={setErrorModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              {selectedAgentError?.agentName} - Error Details
            </DialogTitle>
            <DialogDescription>
              The agent encountered an error during analysis
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Main Error Message */}
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <h4 className="font-medium text-sm mb-2 text-red-600 dark:text-red-400">Error Message</h4>
              <p className="text-sm">{selectedAgentError?.error}</p>
            </div>

            {/* Additional Details if available */}
            {selectedAgentError?.details && (
              <>
                {/* Timestamp */}
                {selectedAgentError.details.timestamp && (
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm text-muted-foreground">Occurred At</h4>
                    <p className="text-sm">
                      {new Date(selectedAgentError.details.timestamp).toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Fallback Analysis if present */}
                {selectedAgentError.details.analysis && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Fallback Analysis</h4>
                    <ScrollArea className="h-[200px] rounded-lg border p-3">
                      <p className="text-sm whitespace-pre-wrap">{selectedAgentError.details.analysis}</p>
                    </ScrollArea>
                  </div>
                )}

                {/* Additional metadata */}
                {selectedAgentError.details.data && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Additional Information</h4>
                    <div className="rounded-lg border p-3 bg-muted/30">
                      <pre className="text-xs overflow-x-auto">
                        {JSON.stringify(selectedAgentError.details.data, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setErrorModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}