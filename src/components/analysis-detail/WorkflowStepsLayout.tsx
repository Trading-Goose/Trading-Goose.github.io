import { formatDistanceToNow } from "date-fns";
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
  XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface WorkflowStepsLayoutProps {
  analysisData: any;
  onApproveOrder?: () => void;
  onRejectOrder?: () => void;
  isOrderExecuted?: boolean;
}

// Enhanced Workflow Steps Layout Component
export default function WorkflowStepsLayout({ 
  analysisData, 
  onApproveOrder, 
  onRejectOrder, 
  isOrderExecuted 
}: WorkflowStepsLayoutProps) {
  // Check if this analysis is part of a rebalance request
  const isRebalanceAnalysis = !!analysisData.rebalance_request_id;
  
  const workflowSteps = [
    {
      id: 'analysis',
      title: 'Market Analysis',
      description: 'Gathering and analyzing market data from multiple sources',
      icon: BarChart3,
      agents: [
        { name: 'Market Analyst', key: 'marketAnalyst', icon: TrendingUp },
        { name: 'News Analyst', key: 'newsAnalyst', icon: FileText },
        { name: 'Social Media Analyst', key: 'socialMediaAnalyst', icon: MessageSquare },
        { name: 'Fundamentals Analyst', key: 'fundamentalsAnalyst', icon: Brain }
      ]
    },
    {
      id: 'research',
      title: 'Research Debate',
      description: 'Bull vs Bear research analysis with debate rounds',
      icon: Users,
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
      icon: Activity,
      agents: [
        { name: 'Trader', key: 'trader', icon: Activity }
      ]
    },
    {
      id: 'risk',
      title: 'Risk Assessment',
      description: 'Evaluating risks and final validation across scenarios',
      icon: Shield,
      agents: [
        { name: 'Risky Analyst', key: 'riskyAnalyst', icon: TrendingUp },
        { name: 'Safe Analyst', key: 'safeAnalyst', icon: Shield },
        { name: 'Neutral Analyst', key: 'neutralAnalyst', icon: Activity },
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
    // Special handling for research phase agents
    if (stepId === 'research') {
      // For research phase, only mark Bull/Bear as complete when Research Manager is done
      if (agentKey === 'bullResearcher' || agentKey === 'bearResearcher') {
        // Check if Research Manager has completed (which means all debate rounds are done)
        if (analysisData.agent_insights?.researchManager) {
          return 'completed';
        }
        // Check if there's any debate activity
        if (analysisData.agent_insights?.researchDebate && analysisData.agent_insights.researchDebate.length > 0) {
          return 'running';
        }
        // Check if individual insights exist (first round running)
        if (analysisData.agent_insights?.[agentKey]) {
          return 'running';
        }
      } else if (agentKey === 'researchManager') {
        // Research Manager is only complete when it has insights
        if (analysisData.agent_insights?.researchManager) {
          return 'completed';
        }
        // If debate rounds exist but no manager yet, it's pending
        if (analysisData.agent_insights?.researchDebate && analysisData.agent_insights.researchDebate.length > 0) {
          return 'pending';
        }
      }
    }
    
    // Default behavior for other agents
    if (analysisData.agent_insights) {
      // Check for error conditions first
      if (analysisData.agent_insights[agentKey + '_error']) {
        return 'failed';
      }
      // Then check for normal completion
      if (analysisData.agent_insights[agentKey]) {
        return 'completed';
      }
    }
    // Check in workflow steps if available
    if (analysisData.workflowSteps) {
      for (const step of analysisData.workflowSteps) {
        const agent = step.agents?.find((a: any) => a.name.toLowerCase().replace(/\s+/g, '').includes(agentKey.toLowerCase().replace(/analyst|researcher|manager/g, '').trim()));
        if (agent) {
          return agent.status || 'pending';
        }
      }
    }
    return 'pending';
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
        // For individual analysis, show Portfolio Manager's decision; for rebalance, show Risk Manager's decision
        const isRebalanceAnalysis = !!analysisData.rebalance_request_id;
        const displayDecision = isRebalanceAnalysis 
          ? analysisData.decision 
          : (analysisData.agent_insights?.portfolioManager?.finalDecision?.action || analysisData.decision);
        
        const shouldShow = displayDecision && displayDecision !== 'CANCELED' && analysisData.status === 'completed';
        
        return shouldShow && (
          <div className={`rounded-lg border p-6 ${
            displayDecision === 'BUY' 
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
                  <p className={`text-lg font-bold ${
                    analysisData.confidence >= 80 ? 'text-green-600 dark:text-green-400' :
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
                          <span className="text-red-600 dark:text-red-400">Rejected</span>
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
        const completedAgents = step.agents.filter(agent => getAgentStatus(agent.key, step.id) === 'completed').length;
        const runningAgents = step.agents.filter(agent => getAgentStatus(agent.key, step.id) === 'running').length;
        const totalAgents = step.agents.length;
        const isCompleted = completedAgents === totalAgents;
        const isActive = completedAgents > 0 || runningAgents > 0;
        const isPending = !isActive && !isCompleted;
        const progressPercentage = Math.round((completedAgents / totalAgents) * 100);
        const timestamp = getStepTimestamp(step.id);

        return (
          <div key={step.id} className="relative">
            <div className="space-y-4">
              {/* Step Header */}
              <div className={`rounded-lg border p-4 transition-all ${
                isCompleted 
                  ? 'bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10'
                  : isActive 
                  ? 'bg-primary/5 border-primary/20'
                  : 'bg-card border-border'
              }`}>
                
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      {/* Step Icon */}
                      <div className={`p-3 rounded-lg ${
                        isCompleted 
                          ? 'bg-green-500/20 dark:bg-green-500/10 text-green-600 dark:text-green-400'
                          : isActive 
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
                          {isActive && !isCompleted && (
                            <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              In Progress
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{step.description}</p>
                        
                        {/* Special handling for Research phase - show debate rounds */}
                        {step.id === 'research' && analysisData.agent_insights?.researchDebate && (
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline" className="text-xs">
                              {analysisData.agent_insights.researchDebate.length} Debate Round{analysisData.agent_insights.researchDebate.length !== 1 ? 's' : ''}
                            </Badge>
                            {!analysisData.agent_insights?.researchManager && (
                              <span className="text-muted-foreground">
                                (Running debate rounds...)
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Progress Bar */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              {step.id === 'research' && !isCompleted ? (
                                <>
                                  {analysisData.agent_insights?.researchManager ? '3/3 agents' : 
                                   analysisData.agent_insights?.researchDebate ? 'Debating...' : 
                                   `${completedAgents}/${totalAgents} agents`}
                                </>
                              ) : (
                                `${completedAgents}/${totalAgents} agents`
                              )}
                            </span>
                            <span className={isCompleted ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                              {progressPercentage}%
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                isCompleted 
                                  ? 'bg-green-500' 
                                  : isActive 
                                  ? 'bg-primary'
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pl-14">
                  {step.agents.map((agent) => {
                    const status = getAgentStatus(agent.key, step.id);
                    const AgentIcon = agent.icon;

                    return (
                      <div
                        key={agent.key}
                        className={`relative rounded-lg border p-4 transition-all ${
                          status === 'completed'
                            ? 'bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10'
                            : status === 'running'
                            ? 'bg-primary/5 border-primary/30 shadow-sm'
                            : 'bg-card border-border'
                        }`}
                      >
                        <div className="flex flex-col items-center text-center space-y-2">
                          {/* Agent Icon */}
                          <div className={`p-2 rounded-lg ${
                            status === 'completed'
                              ? 'bg-green-500/20 dark:bg-green-500/10 text-green-600 dark:text-green-400'
                              : status === 'running'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            <AgentIcon className="w-5 h-5" />
                          </div>
                          
                          {/* Agent Name */}
                          <h4 className="font-medium text-sm">{agent.name}</h4>
                        
                        {/* Status Badge */}
                        <Badge 
                          variant={status === 'completed' ? 'secondary' : 'outline'} 
                          className="text-xs"
                        >
                          {status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                          {status === 'running' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                          {status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                          {status.charAt(0).toUpperCase() + status.slice(1)}
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
            {analysisData.status === 'completed' && (
              <Badge variant="secondary" className="text-sm">
                <CheckCircle className="w-3 h-3 mr-1" />
                Complete
              </Badge>
            )}
            {analysisData.status === 'running' && (
              <Badge variant="secondary" className="text-sm">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                In Progress
              </Badge>
            )}
            {analysisData.status === 'error' && (
              <Badge variant="destructive" className="text-sm">
                <XCircle className="w-3 h-3 mr-1" />
                Error
              </Badge>
            )}
            {analysisData.status === 'canceled' && (
              <Badge variant="outline" className="text-sm">
                <XCircle className="w-3 h-3 mr-1" />
                Canceled
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}