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
import { Separator } from "@/components/ui/separator";
import { 
  Activity,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Loader2,
  CheckCircle,
  Clock,
  MessageCircle,
  AlertCircle,
  XCircle,
  Brain,
  Users,
  Shield,
  BarChart3,
  FileText,
  Briefcase,
  DollarSign,
  ArrowRight,
  CheckSquare,
  X
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-supabase";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
// Removed analysisManager import - using database polling instead
import HorizontalWorkflow from "./HorizontalWorkflow";
import WorkflowVisualization from "./WorkflowVisualization";
import MarkdownRenderer from "./MarkdownRenderer";
import MessageRenderer from "./MessageRenderer";
import { formatDistanceToNow } from "date-fns";
import { getCompleteMessages } from "@/lib/getCompleteMessages";

interface AnalysisDetailModalProps {
  ticker?: string;
  analysisId?: string; // Can open directly with analysisId
  isOpen: boolean;
  onClose: () => void;
  analysisDate?: string; // Optional: for viewing historical analyses
}

// Trade Order Card Component - similar to RebalancePositionCard
function TradeOrderCard({ 
  analysisData, 
  onApprove, 
  onReject, 
  isExecuted = false 
}: { 
  analysisData: any;
  onApprove: () => void;
  onReject: () => void;
  isExecuted?: boolean;
}) {
  const decision = analysisData.decision;
  const confidence = analysisData.confidence;
  const ticker = analysisData.ticker;
  
  // Use the actual trade order data if available (from trading_actions table)
  const tradeOrder = analysisData.tradeOrder;
  
  // Fallback to portfolio manager's final decision if no trade order exists yet
  const portfolioManagerInsight = analysisData.agent_insights?.portfolioManager;
  const finalDecision = tradeOrder || portfolioManagerInsight?.finalDecision || portfolioManagerInsight;
  
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
  
  // Don't show if HOLD decision
  if (decision === 'HOLD') {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 opacity-60">
        <div className="flex items-center gap-3">
          <Badge variant="outline">HOLD</Badge>
          <span className="text-sm text-muted-foreground">No action required - maintaining current position</span>
        </div>
      </div>
    );
  }
  
  if (!finalDecision && confidence < 60) {
    return (
      <div className="rounded-lg border bg-orange-500/5 border-orange-500/20 p-4">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-orange-500" />
          <span className="text-sm">No trade order generated (confidence below 60% threshold)</span>
        </div>
      </div>
    );
  }
  
  // Check the actual order status from database
  const orderStatus = tradeOrder?.status;
  const isPending = orderStatus === 'pending' || (!orderStatus && !isExecuted && decision !== 'HOLD');
  const isApproved = orderStatus === 'approved';
  const isRejected = orderStatus === 'rejected';
  const isOrderExecuted = orderStatus === 'executed' || isExecuted;
  
  return (
    <div className={`rounded-lg border transition-all ${
      isOrderExecuted 
        ? 'bg-green-500/5 border-green-500/20' 
        : isApproved
        ? 'bg-yellow-500/5 border-yellow-500/20'
        : isRejected
        ? 'bg-gray-500/5 border-gray-500/20'
        : isPending
        ? 'bg-blue-500/5 border-blue-500/20'
        : 'bg-muted/20 border-muted opacity-60'
    }`}>
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-lg">{ticker}</h4>
                <Badge variant={decision === 'BUY' ? 'secondary' : 'destructive'}>
                  {decision === 'BUY' ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
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
                      orderStatus === 'pending' ? 'secondary' : 'outline'
                    } 
                    className={`text-xs ${
                      orderStatus === 'executed' ? 'text-green-600' :
                      orderStatus === 'approved' ? 'text-yellow-600' :
                      orderStatus === 'rejected' ? 'text-red-600' :
                      orderStatus === 'pending' ? 'text-blue-600' : ''
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
                        className={`text-xs mt-1 ${
                          tradeOrder.alpacaOrderStatus === 'filled' ? 'text-green-600' :
                          tradeOrder.alpacaOrderStatus === 'partially_filled' ? 'text-blue-600' :
                          ['new', 'pending_new', 'accepted'].includes(tradeOrder.alpacaOrderStatus) ? 'text-yellow-600' :
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
              <span className={`font-medium ${
                confidence >= 80 ? 'text-green-600 dark:text-green-400' :
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
              className="flex-1 h-9 text-xs border-green-500/50 text-green-600 hover:bg-green-500/10 hover:border-green-500"
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
              className="flex-1 h-9 text-xs border-red-500/50 text-red-600 hover:bg-red-500/10 hover:border-red-500"
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

// Enhanced Workflow Steps Layout Component
function WorkflowStepsLayout({ analysisData, onApproveOrder, onRejectOrder, isOrderExecuted }: { 
  analysisData: any;
  onApproveOrder?: () => void;
  onRejectOrder?: () => void;
  isOrderExecuted?: boolean;
}) {
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
    },
    {
      id: 'portfolio',
      title: 'Portfolio Management',
      description: 'Position sizing and trade order generation',
      icon: Briefcase,
      agents: [
        { name: 'Portfolio Manager', key: 'portfolioManager', icon: Briefcase }
      ]
    }
  ];

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
    if (analysisData.agent_insights && analysisData.agent_insights[agentKey]) {
      return 'completed';
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
      {analysisData.decision && analysisData.decision !== 'CANCELED' && analysisData.status === 'completed' && (
        <div className="rounded-lg border bg-gradient-to-r from-blue-500/5 to-primary/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Analysis Complete - Decision Ready</h3>
                <p className="text-sm text-muted-foreground">
                  {analysisData.decision === 'HOLD' 
                    ? 'Recommendation: Maintain current position' 
                    : `Recommendation: ${analysisData.decision} ${analysisData.ticker}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge 
                variant={
                  analysisData.decision === 'BUY' ? 'default' : 
                  analysisData.decision === 'SELL' ? 'destructive' : 
                  'secondary'
                } 
                className="text-sm px-3 py-1"
              >
                {analysisData.decision === 'BUY' && <TrendingUp className="w-4 h-4 mr-1" />}
                {analysisData.decision === 'SELL' && <TrendingDown className="w-4 h-4 mr-1" />}
                {analysisData.decision === 'HOLD' && <Activity className="w-4 h-4 mr-1" />}
                {analysisData.decision}
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
          {analysisData.agent_insights?.portfolioManager?.finalDecision && analysisData.decision !== 'HOLD' && (
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
                  {isOrderExecuted ? (
                    <>
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">Executed</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3 text-yellow-500" />
                      <span className="text-yellow-600 dark:text-yellow-400">Pending Approval</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      
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
              Analysis workflow execution status
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

export default function AnalysisDetailModal({ ticker, analysisId, isOpen, onClose, analysisDate }: AnalysisDetailModalProps) {
  const { user, apiSettings } = useAuth();
  const { toast } = useToast();
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiveAnalysis, setIsLiveAnalysis] = useState(false);
  const [isOrderExecuted, setIsOrderExecuted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | undefined>();

  // Handle order approval
  const handleApproveOrder = async () => {
    if (!analysisData?.id) {
      toast({
        title: "Error",
        description: "Analysis ID not found",
        variant: "destructive",
      });
      return;
    }

    try {
      toast({
        title: "Executing Order",
        description: "Submitting order to Alpaca...",
      });

      // Call the edge function to execute the trade
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          analysisId: analysisData.id,
          action: 'approve'
        }
      });

      if (error) throw error;

      if (data.success) {
        setIsOrderExecuted(true);
        
        // Update the local trade order data
        if (analysisData.tradeOrder) {
          analysisData.tradeOrder.status = 'approved';
          analysisData.tradeOrder.alpacaOrderId = data.alpacaOrderId;
          analysisData.tradeOrder.alpacaOrderStatus = data.alpacaStatus;
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
      toast({
        title: "Order Failed",
        description: error.message || "Failed to execute order on Alpaca",
        variant: "destructive",
      });
    }
  };

  // Handle order rejection  
  const handleRejectOrder = async () => {
    if (!analysisData?.id) {
      toast({
        title: "Error",
        description: "Analysis ID not found",
        variant: "destructive",
      });
      return;
    }

    try {
      // Call the edge function to reject the trade
      const { data, error } = await supabase.functions.invoke('execute-trade', {
        body: {
          analysisId: analysisData.id,
          action: 'reject'
        }
      });

      if (error) throw error;

      if (data.success) {
        // Update the local trade order data
        if (analysisData.tradeOrder) {
          analysisData.tradeOrder.status = 'rejected';
        }

        toast({
          title: "Order Rejected",
          description: `${analysisData.decision} order for ${analysisData.ticker} has been rejected.`,
          variant: "destructive",
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
            analysisData.tradeOrder.alpacaOrderStatus = tradeOrder.alpaca_order_status;
            analysisData.tradeOrder.alpacaFilledQty = tradeOrder.alpaca_filled_qty;
            analysisData.tradeOrder.alpacaFilledPrice = tradeOrder.alpaca_filled_price;
            analysisData.tradeOrder.status = tradeOrder.status;
          }

          // Check if order reached terminal state
          if (['filled', 'canceled', 'rejected', 'expired'].includes(tradeOrder.alpaca_order_status)) {
            clearInterval(pollInterval);
            
            if (tradeOrder.alpaca_order_status === 'filled') {
              toast({
                title: "Order Filled",
                description: `${analysisData.ticker} order filled at $${tradeOrder.alpaca_filled_price?.toFixed(2)} for ${tradeOrder.alpaca_filled_qty} shares`,
              });
            } else if (['canceled', 'rejected', 'expired'].includes(tradeOrder.alpaca_order_status)) {
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
            status = 'running';
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
          
          // Fetch trade order if analysis is completed
          let tradeOrderData = null;
          if (status === 'completed' && analysisToLoad.decision !== 'HOLD') {
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
            console.log('Starting polling...');
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
            }
            intervalRef.current = setInterval(() => {
              loadAnalysis();
            }, 2000);
          } else if (status !== 'running' && intervalRef.current) {
            console.log('Stopping polling, analysis completed');
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'canceled':
        return <XCircle className="w-4 h-4 text-orange-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'error':
        return AlertCircle;
      case 'decision':
        return TrendingUp;
      case 'debate':
        return MessageSquare;
      default:
        return MessageCircle;
    }
  };

  const getDecisionVariant = (decision: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (decision) {
      case 'BUY': return 'default';
      case 'SELL': return 'destructive';
      case 'CANCELED': return 'outline';
      default: return 'secondary';
    }
  };

  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'BUY': return <TrendingUp className="w-4 h-4" />;
      case 'SELL': return <TrendingDown className="w-4 h-4" />;
      case 'CANCELED': return <XCircle className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600 dark:text-green-400';
    if (confidence >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getAgentIcon = (agent: string) => {
    const agentLower = agent.toLowerCase();
    if (agentLower.includes('trader')) return <Activity className="w-4 h-4" />;
    if (agentLower.includes('market')) return <BarChart3 className="w-4 h-4" />;
    if (agentLower.includes('news')) return <FileText className="w-4 h-4" />;
    if (agentLower.includes('social') || agentLower.includes('sentiment')) return <Users className="w-4 h-4" />;
    if (agentLower.includes('fundamental')) return <TrendingUp className="w-4 h-4" />;
    if (agentLower.includes('risk')) return <Shield className="w-4 h-4" />;
    if (agentLower.includes('research')) return <Brain className="w-4 h-4" />;
    return <Brain className="w-4 h-4" />;
  };

  const formatAgentName = (agent: string) => {
    return agent
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const dialogTitle = analysisData?.ticker 
    ? (analysisDate 
        ? `${analysisData.ticker} - ${new Date(analysisDate).toLocaleDateString()}`
        : analysisData.ticker)
    : (analysisDate 
        ? `${ticker} - ${new Date(analysisDate).toLocaleDateString()}`
        : ticker || 'Analysis Details');

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-7xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-muted-foreground" />
              <DialogTitle className="text-xl font-semibold">
                {dialogTitle}
              </DialogTitle>
              {analysisData && (
                <div className="flex items-center gap-2">
                  {getStatusIcon(analysisData.status)}
                  <span className={`text-sm capitalize ${
                    analysisData.status === 'canceled' 
                      ? 'text-orange-600 dark:text-orange-400' 
                      : 'text-muted-foreground'
                  }`}>
                    {analysisData.status === 'canceled' ? 'Canceled by User' : analysisData.status}
                  </span>
                  {analysisData.status === 'canceled' && analysisData.full_analysis?.canceledAt && (
                    <span className="text-xs text-muted-foreground">
                      • {formatDistanceToNow(new Date(analysisData.full_analysis.canceledAt))} ago
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <DialogDescription className="mt-2">
            {isLiveAnalysis
              ? "Real-time analysis progress and agent insights"
              : analysisDate
              ? `Historical analysis from ${new Date(analysisDate).toLocaleDateString()}`
              : "Analysis details and agent insights"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {error ? (
            <div className="flex items-center gap-2 text-destructive p-6">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading analysis data...</p>
            </div>
          ) : analysisData ? (
            <>
              {/* Analysis Summary Bar */}
              {(analysisData.decision || analysisData.confidence !== undefined || analysisData.startedAt) && (
                <div className="px-6 py-4 bg-muted/50 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      {analysisData.confidence !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Confidence:</span>
                          <span className={`font-semibold ${getConfidenceColor(analysisData.confidence)}`}>
                            {analysisData.confidence}%
                          </span>
                        </div>
                      )}
                      {analysisData.startedAt && (
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Started {formatDistanceToNow(new Date(analysisData.startedAt))} ago
                          </span>
                        </div>
                      )}
                    </div>
                    {analysisData.completedAt && (
                      <span className="text-sm text-muted-foreground">
                        Completed in {Math.round((new Date(analysisData.completedAt).getTime() - new Date(analysisData.startedAt).getTime()) / 1000)}s
                      </span>
                    )}
                    
                      {(analysisData?.decision || analysisData?.status === 'canceled') && (
                        <Badge 
                          variant={getDecisionVariant(analysisData.status === 'canceled' ? 'CANCELED' : analysisData.decision)} 
                          className="text-sm px-3 py-1 flex items-center gap-1"
                        >
                          {getDecisionIcon(analysisData.status === 'canceled' ? 'CANCELED' : analysisData.decision)}
                          {analysisData.status === 'canceled' ? 'CANCELED' : analysisData.decision}
                        </Badge>
                      )}
                  </div>
                </div>
              )}

              <Tabs defaultValue={isLiveAnalysis ? "actions" : "insights"} className="flex-1">
                <div className="px-6 pt-4 pb-4">
                  <TabsList className="grid w-full grid-cols-4 max-w-3xl mx-auto">
                    <TabsTrigger 
                      value="actions" 
                      className="flex items-center gap-2"
                    >
                      <CheckSquare className="w-4 h-4" />
                      Actions
                    </TabsTrigger>
                    <TabsTrigger 
                      value="workflow" 
                      className="flex items-center gap-2"
                    >
                      <Activity className="w-4 h-4" />
                      Workflow
                    </TabsTrigger>
                    <TabsTrigger 
                      value="insights" 
                      className="flex items-center gap-2"
                    >
                      <Brain className="w-4 h-4" />
                      Insights
                    </TabsTrigger>
                    <TabsTrigger 
                      value="messages" 
                      className="flex items-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Messages
                    </TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="h-[calc(90vh-280px)]">
                  <div className="px-6 pb-6">
                    <TabsContent value="actions" className="mt-6 space-y-4">
                      {/* Trade Order Section */}
                      <div className="space-y-4">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-3 gap-4">
                          <Card className="p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Decision</span>
                              {analysisData.decision === 'BUY' ? (
                                <TrendingUp className="w-4 h-4 text-green-500" />
                              ) : analysisData.decision === 'SELL' ? (
                                <TrendingDown className="w-4 h-4 text-red-500" />
                              ) : (
                                <Activity className="w-4 h-4 text-gray-500" />
                              )}
                            </div>
                            <p className={`text-lg font-semibold ${
                              analysisData.decision === 'BUY' ? 'text-green-600' :
                              analysisData.decision === 'SELL' ? 'text-red-600' :
                              'text-gray-600'
                            }`}>
                              {analysisData.decision}
                            </p>
                          </Card>
                          <Card className="p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Confidence</span>
                              <Brain className="w-4 h-4 text-blue-500" />
                            </div>
                            <p className="text-lg font-semibold text-blue-600">
                              {analysisData.confidence}%
                            </p>
                          </Card>
                          <Card className="p-4">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Order Status</span>
                              {analysisData.tradeOrder?.status === 'executed' ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : analysisData.tradeOrder?.status === 'approved' ? (
                                <Clock className="w-4 h-4 text-yellow-500" />
                              ) : analysisData.tradeOrder?.status === 'rejected' ? (
                                <XCircle className="w-4 h-4 text-red-500" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-gray-500" />
                              )}
                            </div>
                            <p className={`text-lg font-semibold ${
                              analysisData.tradeOrder?.status === 'executed' ? 'text-green-600' :
                              analysisData.tradeOrder?.status === 'approved' ? 'text-yellow-600' :
                              analysisData.tradeOrder?.status === 'rejected' ? 'text-red-600' :
                              'text-gray-600'
                            }`}>
                              {analysisData.tradeOrder?.status ? 
                                analysisData.tradeOrder.status.charAt(0).toUpperCase() + analysisData.tradeOrder.status.slice(1) : 
                                'Pending'
                              }
                            </p>
                          </Card>
                        </div>

                        {/* Trade Order Card */}
                        <div>
                          <h3 className="text-lg font-semibold mb-3">Trade Order</h3>
                          <TradeOrderCard 
                            analysisData={analysisData}
                            onApprove={handleApproveOrder}
                            onReject={handleRejectOrder}
                            isExecuted={isOrderExecuted}
                          />
                        </div>

                        {/* Additional Details */}
                        {analysisData.agent_insights?.portfolioManager?.rationale && (
                          <Card className="p-4">
                            <CardHeader className="p-0 pb-3">
                              <CardTitle className="text-sm">Portfolio Manager Rationale</CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                              <p className="text-sm text-muted-foreground">
                                {analysisData.agent_insights.portfolioManager.rationale}
                              </p>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="workflow" className="mt-6">
                      {(analysisData.workflowSteps?.length > 0 || analysisData.full_analysis) ? (
                        <WorkflowStepsLayout 
                          analysisData={analysisData}
                          onApproveOrder={() => {
                            // Handle order approval
                            setIsOrderExecuted(true);
                            toast({
                              title: "Order Approved",
                              description: `${analysisData.decision} order for ${ticker} has been approved for execution`,
                            });
                            // In real implementation, this would call API to execute the order
                            console.log('Executing order:', analysisData.tradeOrder);
                          }}
                          onRejectOrder={() => {
                            // Handle order rejection
                            toast({
                              title: "Order Rejected",
                              description: `${analysisData.decision} order for ${ticker} has been rejected`,
                              variant: "destructive"
                            });
                            // In real implementation, this would update the database
                            console.log('Rejecting order:', analysisData.tradeOrder);
                          }}
                          isOrderExecuted={isOrderExecuted}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Activity className="w-12 h-12 mb-4 opacity-20" />
                          <p>No workflow data available yet</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="insights" className="mt-6 space-y-4">
                      {console.log('Insights tab - analysisData.agent_insights:', analysisData.agent_insights)}
                      {console.log('Market Analyst insight:', analysisData.agent_insights?.marketAnalyst)}
                      {console.log('Fundamentals Analyst insight:', analysisData.agent_insights?.fundamentalsAnalyst)}
                      {analysisData.agent_insights && Object.keys(analysisData.agent_insights).length > 0 ? (
                        (() => {
                          // Define the display order for insights
                          const orderMap: { [key: string]: number } = {
                            // 1. Analysts (order: 1-4)
                            'marketAnalyst': 1,
                            'newsAnalyst': 2,
                            'socialMediaAnalyst': 3,
                            'fundamentalsAnalyst': 4,
                            
                            // 2. Research (order: 5-7)
                            'bullResearcher': 5,
                            'bearResearcher': 6,
                            'researchDebate': 7,
                            'researchManager': 8,
                            
                            // 3. Trader (order: 9)
                            'trader': 9,
                            
                            // 4. Risk (order: 10-14)
                            'riskyAnalyst': 10,
                            'safeAnalyst': 11,
                            'neutralAnalyst': 12,
                            'riskDebate': 13,
                            'riskManager': 14,
                            
                            // 5. Portfolio (order: 15)
                            'portfolioManager': 15
                          };
                          
                          // Sort entries based on the defined order
                          // Get entries from agent_insights
                          let entries = Object.entries(analysisData.agent_insights);
                          
                          // Add missing agents that have messages but no insights
                          const missingAgents = ['fundamentalsAnalyst', 'safeAnalyst'];
                          missingAgents.forEach(agentKey => {
                            if (!analysisData.agent_insights[agentKey]) {
                              // Check if this agent has messages
                              const agentDisplayName = agentKey === 'fundamentalsAnalyst' ? 'Fundamentals Analyst' : 'Safe Analyst';
                              const hasMessage = analysisData.messages?.some((msg: any) => msg.agent === agentDisplayName);
                              if (hasMessage) {
                                // Add a placeholder entry so it gets processed
                                entries.push([agentKey, null]);
                              }
                            }
                          });
                          
                          const sortedEntries = entries.sort(([agentA], [agentB]) => {
                            const orderA = orderMap[agentA] || 999;
                            const orderB = orderMap[agentB] || 999;
                            return orderA - orderB;
                          });
                          
                          console.log('Sorted insight entries (including missing):', sortedEntries.map(([agent]) => agent));
                          
                          return sortedEntries.map(([agent, insight]) => {
                            console.log(`Processing insight for ${agent}:`, typeof insight, insight);
                            
                            // Handle debate rounds specially
                            if ((agent === 'researchDebate' || agent === 'riskDebate') && Array.isArray(insight)) {
                            const isResearchDebate = agent === 'researchDebate';
                            return (
                              <Card key={agent} className="overflow-hidden">
                                <CardHeader className="bg-muted/30">
                                  <CardTitle className="text-base flex items-center gap-2">
                                    <Users className="w-4 h-4" />
                                    {isResearchDebate ? 'Research' : 'Risk'} Debate
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                  {insight.map((round: any, index: number) => (
                                    <div key={index} className={index > 0 ? "border-t" : ""}>
                                      <div className="p-4 bg-muted/10">
                                        <h4 className="font-medium text-sm">Round {round.round}</h4>
                                      </div>
                                      <div className="p-4 space-y-3">
                                        {isResearchDebate ? (
                                          <>
                                            <div className="rounded-lg border bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10 p-4">
                                              <div className="flex items-center gap-2 mb-2">
                                                <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                                                <span className="text-sm font-medium">
                                                  Bull Researcher
                                                </span>
                                              </div>
                                              <MarkdownRenderer content={round.bull} className="text-sm" />
                                            </div>
                                            <div className="rounded-lg border bg-red-500/10 dark:bg-red-500/5 border-red-500/20 dark:border-red-500/10 p-4">
                                              <div className="flex items-center gap-2 mb-2">
                                                <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                                                <span className="text-sm font-medium">
                                                  Bear Researcher
                                                </span>
                                              </div>
                                              <MarkdownRenderer content={round.bear} className="text-sm" />
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div className="rounded-lg border bg-red-500/10 dark:bg-red-500/5 border-red-500/20 dark:border-red-500/10 p-4">
                                              <div className="flex items-center gap-2 mb-2">
                                                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                                <span className="text-sm font-medium">
                                                  Risky Analyst
                                                </span>
                                              </div>
                                              <MarkdownRenderer content={round.risky} className="text-sm" />
                                            </div>
                                            <div className="rounded-lg border bg-blue-500/10 dark:bg-blue-500/5 border-blue-500/20 dark:border-blue-500/10 p-4">
                                              <div className="flex items-center gap-2 mb-2">
                                                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                                <span className="text-sm font-medium">
                                                  Safe Analyst
                                                </span>
                                              </div>
                                              <MarkdownRenderer content={round.safe} className="text-sm" />
                                            </div>
                                            <div className="rounded-lg border bg-muted/50 p-4">
                                              <div className="flex items-center gap-2 mb-2">
                                                <Activity className="w-4 h-4 text-muted-foreground" />
                                                <span className="text-sm font-medium">
                                                  Neutral Analyst
                                                </span>
                                              </div>
                                              <MarkdownRenderer content={round.neutral} className="text-sm" />
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </CardContent>
                              </Card>
                            );
                          }

                          // Handle all other insights
                          // First extract the content from the insight regardless of type
                          let insightContent = '';
                          let additionalData = null;
                          
                          if (typeof insight === 'string') {
                            insightContent = insight;
                          } else if (typeof insight === 'object' && insight !== null && !Array.isArray(insight)) {
                            // Extract the analysis text from various possible fields
                            insightContent = insight.analysis || insight.assessment || insight.content || insight.summary || '';
                            
                            // For market and fundamental analysts, also capture additional data
                            if (agent === 'marketAnalyst' || agent === 'fundamentalsAnalyst') {
                              additionalData = insight.data || null;
                              
                              // If still no content, try to extract from nested structures
                              if (!insightContent && insight.data) {
                                insightContent = insight.data.analysis || insight.data.assessment || '';
                              }
                              
                              // FALLBACK: If still no content, try to find it in messages
                              if (!insightContent || insightContent.trim() === '') {
                                const agentDisplayName = formatAgentName(agent);
                                const agentMessage = analysisData.messages?.find((msg: any) => 
                                  msg.agent === agentDisplayName || 
                                  msg.agent === agent.replace(/([A-Z])/g, ' $1').trim()
                                );
                                if (agentMessage?.message) {
                                  insightContent = agentMessage.message;
                                  console.log(`Using message fallback for ${agent}:`, insightContent.substring(0, 100));
                                }
                              }
                              
                              // Log for debugging
                              console.log(`${agent} insight structure:`, {
                                hasAnalysis: !!insight.analysis,
                                hasData: !!insight.data,
                                keys: Object.keys(insight),
                                contentLength: insightContent?.length || 0,
                                usingMessageFallback: !insight.analysis && insightContent.length > 0
                              });
                            }
                          }
                          
                          // For missing fundamentalsAnalyst, try to get from messages
                          if (agent === 'fundamentalsAnalyst' && !insight) {
                            const fundamentalsMessage = analysisData.messages?.find((msg: any) => 
                              msg.agent === 'Fundamentals Analyst'
                            );
                            if (fundamentalsMessage?.message) {
                              insightContent = fundamentalsMessage.message;
                              console.log('Using message for missing Fundamentals Analyst insight');
                            }
                          }
                          
                          // Skip if no content
                          if (!insightContent) {
                            console.warn(`Skipping empty insight for ${agent}. Full insight:`, insight);
                            return null;
                          }
                          
                          // Special styling for bull and bear researchers
                          if (agent === 'bullResearcher') {
                              return (
                                <Card key={agent} className="overflow-hidden">
                                  <CardHeader className="bg-muted/30">
                                    <CardTitle className="text-base flex items-center gap-2">
                                      <TrendingUp className="w-4 h-4" />
                                      Bull Researcher
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="pt-4">
                                    <div className="rounded-lg border bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10 p-4">
                                      <MarkdownRenderer content={insightContent} className="text-sm" />
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            }
                            
                            if (agent === 'bearResearcher') {
                              return (
                                <Card key={agent} className="overflow-hidden">
                                  <CardHeader className="bg-muted/30">
                                    <CardTitle className="text-base flex items-center gap-2">
                                      <TrendingDown className="w-4 h-4" />
                                      Bear Researcher
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="pt-4">
                                    <div className="rounded-lg border bg-red-500/10 dark:bg-red-500/5 border-red-500/20 dark:border-red-500/10 p-4">
                                      <MarkdownRenderer content={insightContent} className="text-sm" />
                                    </div>
                                  </CardContent>
                                </Card>
                              );
                            }
                            
                            // Special rendering for Market Analyst with data
                            if (agent === 'marketAnalyst' && additionalData) {
                              return (
                                <Card key={agent} className="overflow-hidden">
                                  <CardHeader className="bg-muted/30">
                                    <CardTitle className="text-base flex items-center gap-2">
                                      <BarChart3 className="w-4 h-4" />
                                      Market Analyst
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="pt-4 space-y-4">
                                    {/* Display market data if available */}
                                    {additionalData && (
                                      <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                                        {additionalData.currentPrice && (
                                          <div>
                                            <span className="text-muted-foreground">Price:</span>
                                            <span className="ml-2 font-medium">${additionalData.currentPrice?.toFixed(2)}</span>
                                          </div>
                                        )}
                                        {additionalData.dayChangePercent && (
                                          <div>
                                            <span className="text-muted-foreground">Change:</span>
                                            <span className={`ml-2 font-medium ${
                                              additionalData.dayChangePercent > 0 ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                              {additionalData.dayChangePercent > 0 ? '+' : ''}{additionalData.dayChangePercent.toFixed(2)}%
                                            </span>
                                          </div>
                                        )}
                                        {additionalData.volume && (
                                          <div>
                                            <span className="text-muted-foreground">Volume:</span>
                                            <span className="ml-2 font-medium">{(additionalData.volume / 1000000).toFixed(2)}M</span>
                                          </div>
                                        )}
                                        {additionalData.marketCap && (
                                          <div>
                                            <span className="text-muted-foreground">Market Cap:</span>
                                            <span className="ml-2 font-medium">${(additionalData.marketCap / 1000000000).toFixed(2)}B</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <MarkdownRenderer content={insightContent} />
                                  </CardContent>
                                </Card>
                              );
                            }
                            
                            // Special rendering for Fundamentals Analyst with data
                            if (agent === 'fundamentalsAnalyst' && additionalData) {
                              return (
                                <Card key={agent} className="overflow-hidden">
                                  <CardHeader className="bg-muted/30">
                                    <CardTitle className="text-base flex items-center gap-2">
                                      <TrendingUp className="w-4 h-4" />
                                      Fundamentals Analyst
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="pt-4 space-y-4">
                                    {/* Display fundamental data if available */}
                                    {additionalData && (
                                      <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
                                        {additionalData.PERatio && (
                                          <div>
                                            <span className="text-muted-foreground">P/E Ratio:</span>
                                            <span className="ml-2 font-medium">{parseFloat(additionalData.PERatio).toFixed(2)}</span>
                                          </div>
                                        )}
                                        {additionalData.EPS && (
                                          <div>
                                            <span className="text-muted-foreground">EPS:</span>
                                            <span className="ml-2 font-medium">${additionalData.EPS}</span>
                                          </div>
                                        )}
                                        {additionalData.DividendYield && additionalData.DividendYield !== 'None' && (
                                          <div>
                                            <span className="text-muted-foreground">Dividend Yield:</span>
                                            <span className="ml-2 font-medium">{(parseFloat(additionalData.DividendYield) * 100).toFixed(2)}%</span>
                                          </div>
                                        )}
                                        {additionalData.ProfitMargin && (
                                          <div>
                                            <span className="text-muted-foreground">Profit Margin:</span>
                                            <span className="ml-2 font-medium">{(parseFloat(additionalData.ProfitMargin) * 100).toFixed(2)}%</span>
                                          </div>
                                        )}
                                        {additionalData.Beta && (
                                          <div>
                                            <span className="text-muted-foreground">Beta:</span>
                                            <span className="ml-2 font-medium">{parseFloat(additionalData.Beta).toFixed(2)}</span>
                                          </div>
                                        )}
                                        {additionalData['52WeekHigh'] && (
                                          <div>
                                            <span className="text-muted-foreground">52W High:</span>
                                            <span className="ml-2 font-medium">${additionalData['52WeekHigh']}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <MarkdownRenderer content={insightContent} />
                                  </CardContent>
                                </Card>
                              );
                            }
                            
                            // Special rendering for Portfolio Manager
                            if (agent === 'portfolioManager') {
                              const pmInsight = insight as any;
                              
                              // Extract the analysis text and final decision
                              const analysisText = pmInsight?.analysis || '';
                              const finalDecision = pmInsight?.finalDecision;
                              
                              return (
                                <Card key={agent} className="overflow-hidden">
                                  <CardHeader className="bg-muted/30">
                                    <CardTitle className="text-base flex items-center gap-2">
                                      <Briefcase className="w-4 h-4" />
                                      Portfolio Manager
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="pt-4 space-y-4">
                                    {/* Display analysis text if available */}
                                    {analysisText && (
                                      <div>
                                        <MarkdownRenderer content={analysisText} />
                                      </div>
                                    )}
                                    
                                    {/* Display final decision details if available */}
                                    {finalDecision && (
                                      <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                                        <h4 className="font-semibold text-sm">Position Sizing Decision</h4>
                                        
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          <div>
                                            <span className="text-muted-foreground">Action:</span>
                                            <span className="ml-2 font-medium">{finalDecision.action}</span>
                                          </div>
                                          
                                          {finalDecision.dollarAmount > 0 && (
                                            <div>
                                              <span className="text-muted-foreground">Amount:</span>
                                              <span className="ml-2 font-medium">${finalDecision.dollarAmount?.toLocaleString()}</span>
                                            </div>
                                          )}
                                          
                                          {finalDecision.shares > 0 && (
                                            <div>
                                              <span className="text-muted-foreground">Shares:</span>
                                              <span className="ml-2 font-medium">{finalDecision.shares}</span>
                                            </div>
                                          )}
                                          
                                          {finalDecision.percentOfPortfolio && (
                                            <div>
                                              <span className="text-muted-foreground">% of Portfolio:</span>
                                              <span className="ml-2 font-medium">{finalDecision.percentOfPortfolio?.toFixed(2)}%</span>
                                            </div>
                                          )}
                                          
                                          {finalDecision.entryPrice && (
                                            <div>
                                              <span className="text-muted-foreground">Entry Price:</span>
                                              <span className="ml-2 font-medium">${finalDecision.entryPrice?.toFixed(2)}</span>
                                            </div>
                                          )}
                                          
                                          {finalDecision.stopLoss && (
                                            <div>
                                              <span className="text-muted-foreground">Stop Loss:</span>
                                              <span className="ml-2 font-medium">${finalDecision.stopLoss?.toFixed(2)}</span>
                                            </div>
                                          )}
                                          
                                          {finalDecision.takeProfit && (
                                            <div>
                                              <span className="text-muted-foreground">Take Profit:</span>
                                              <span className="ml-2 font-medium">${finalDecision.takeProfit?.toFixed(2)}</span>
                                            </div>
                                          )}
                                          
                                          {finalDecision.riskRewardRatio && (
                                            <div>
                                              <span className="text-muted-foreground">Risk/Reward:</span>
                                              <span className="ml-2 font-medium">1:{finalDecision.riskRewardRatio?.toFixed(1)}</span>
                                            </div>
                                          )}
                                        </div>
                                        
                                        {/* Position changes if available */}
                                        {finalDecision.beforePosition && finalDecision.afterPosition && (
                                          <div className="pt-3 border-t space-y-2">
                                            <div className="flex items-center gap-4 text-sm">
                                              <span className="text-muted-foreground">Before:</span>
                                              <span>{finalDecision.beforePosition.shares} shares (${finalDecision.beforePosition.value?.toLocaleString()} - {finalDecision.beforePosition.allocation?.toFixed(2)}%)</span>
                                            </div>
                                            <div className="flex items-center gap-4 text-sm">
                                              <span className="text-muted-foreground">After:</span>
                                              <span>{finalDecision.afterPosition.shares} shares (${finalDecision.afterPosition.value?.toLocaleString()} - {finalDecision.afterPosition.allocation?.toFixed(2)}%)</span>
                                            </div>
                                          </div>
                                        )}
                                        
                                        {finalDecision.reasoning && (
                                          <div className="pt-3 border-t">
                                            <p className="text-sm text-muted-foreground">{finalDecision.reasoning}</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>
                              );
                            }
                            
                            // Default rendering for all other agents
                            return (
                              <Card key={agent} className="overflow-hidden">
                                <CardHeader className="bg-muted/30">
                                  <CardTitle className="text-base flex items-center gap-2">
                                    {getAgentIcon(agent)}
                                    {formatAgentName(agent)}
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                  <MarkdownRenderer content={insightContent} />
                                </CardContent>
                              </Card>
                            );
                          });
                        })()
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Brain className="w-12 h-12 mb-4 opacity-20" />
                          <p>No insights available yet</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="messages" className="mt-6 space-y-2">
                      {console.log('Messages tab - total messages:', analysisData.messages?.length)}
                      {console.log('First 3 messages:', analysisData.messages?.slice(0, 3))}
                      {analysisData.messages?.length > 0 ? (
                        analysisData.messages.map((message: any, index: number) => {
                          const Icon = getMessageIcon(message.type);
                          
                          // Ensure message content is a string
                          let messageContent = message.message;
                          if (typeof messageContent === 'object' && messageContent !== null) {
                            messageContent = JSON.stringify(messageContent, null, 2);
                            console.warn(`Message ${index} from ${message.agent} was an object, converting to string`);
                          }
                          
                          return (
                            <div
                              key={index}
                              className={`rounded-lg border p-4 ${
                                message.type === 'error'
                                  ? 'bg-destructive/5 border-destructive/20'
                                  : message.type === 'decision'
                                  ? 'bg-primary/5 border-primary/20'
                                  : message.type === 'debate'
                                  ? 'bg-orange-50 dark:bg-orange-950/10 border-orange-200 dark:border-orange-800'
                                  : 'bg-muted/50'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`mt-0.5 ${
                                  message.type === 'error' ? 'text-destructive' :
                                  message.type === 'decision' ? 'text-primary' :
                                  message.type === 'debate' ? 'text-orange-600 dark:text-orange-400' :
                                  'text-muted-foreground'
                                }`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{message.agent}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(message.timestamp).toLocaleTimeString()}
                                    </span>
                                  </div>
                                  <div className="text-sm">
                                    <MessageRenderer content={messageContent} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <MessageCircle className="w-12 h-12 mb-4 opacity-20" />
                          <p>No messages available yet</p>
                        </div>
                      )}
                    </TabsContent>

                  </div>
                </ScrollArea>
              </Tabs>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mb-4 opacity-20" />
              <p>No analysis data available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}