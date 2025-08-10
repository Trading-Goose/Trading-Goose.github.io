import { useState } from "react";
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
import MarkdownRenderer from "./MarkdownRenderer";
import AnalysisDetailModal from "./AnalysisDetailModal";

interface RebalanceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  executed?: boolean; // Track if order has been executed
}

// Mock data for UI demo
const mockRebalanceData = {
  id: "demo-rebalance-001",
  status: "completed",
  startedAt: new Date(Date.now() - 5 * 60000).toISOString(),
  completedAt: new Date(Date.now() - 2 * 60000).toISOString(),
  
  // Portfolio Overview
  portfolio: {
    totalValue: 150000,
    cashAvailable: 30000,
    stockValue: 120000,
    targetStockAllocation: 80,
    targetCashAllocation: 20,
    currentStockAllocation: 85,
    currentCashAllocation: 15,
  },
  
  // Recommended positions with actions
  recommendedPositions: [
    {
      ticker: 'NVDA',
      currentShares: 50,
      currentValue: 25125,
      currentAllocation: 28.5,
      targetAllocation: 20,
      recommendedShares: 35,
      shareChange: -15,
      action: 'SELL' as const,
      reasoning: 'Reduce overweight position to maintain diversification'
    },
    {
      ticker: 'AAPL',
      currentShares: 100,
      currentValue: 17825,
      currentAllocation: 12.2,
      targetAllocation: 18,
      recommendedShares: 130,
      shareChange: 30,
      action: 'BUY' as const,
      reasoning: 'Increase allocation to match target weight, strong fundamentals'
    },
    {
      ticker: 'MSFT',
      currentShares: 50,
      currentValue: 21445,
      currentAllocation: 20.1,
      targetAllocation: 20,
      recommendedShares: 50,
      shareChange: 0,
      action: 'HOLD' as const,
      reasoning: 'Position already at target allocation'
    },
    {
      ticker: 'GOOGL',
      currentShares: 75,
      currentValue: 11235,
      currentAllocation: 15.8,
      targetAllocation: 10,
      recommendedShares: 50,
      shareChange: -25,
      action: 'SELL' as const,
      reasoning: 'Reduce exposure due to recent underperformance'
    },
    {
      ticker: 'TSLA',
      currentShares: 0,
      currentValue: 0,
      currentAllocation: 0,
      targetAllocation: 12,
      recommendedShares: 40,
      shareChange: 40,
      action: 'BUY' as const,
      reasoning: 'Initiate position based on positive agent analysis'
    },
    {
      ticker: 'V',
      currentShares: 0,
      currentValue: 0,
      currentAllocation: 0,
      targetAllocation: 5,
      recommendedShares: 25,
      shareChange: 25,
      action: 'BUY' as const,
      reasoning: 'New opportunity identified - strong payment volume growth'
    }
  ] as RebalancePosition[],
  
  // Related stock analyses (for opportunity agent)
  relatedAnalyses: [
    {
      id: 'analysis-001',
      ticker: 'V',
      analysis_date: new Date(Date.now() - 24 * 60 * 60000).toISOString(),
      decision: 'BUY' as const,
      confidence: 85,
      created_at: new Date(Date.now() - 24 * 60 * 60000).toISOString(),
      agent_insights: {
        marketAnalyst: 'Strong technical indicators with breakout pattern',
        fundamentalsAnalyst: 'Excellent revenue growth and expanding margins'
      }
    },
    {
      id: 'analysis-002', 
      ticker: 'TSLA',
      analysis_date: new Date(Date.now() - 48 * 60 * 60000).toISOString(),
      decision: 'BUY' as const,
      confidence: 78,
      created_at: new Date(Date.now() - 48 * 60 * 60000).toISOString(),
      agent_insights: {
        newsAnalyst: 'Positive news on new product launches',
        socialMediaAnalyst: 'Bullish sentiment across social platforms'
      }
    }
  ],
  
  // Agent Insights
  agentInsights: {
    rebalanceAgent: `## Portfolio Rebalance Analysis

### Current Portfolio State
- **Total Value**: $150,000
- **Stock Allocation**: 85% (Target: 80%)
- **Cash Allocation**: 15% (Target: 20%)
- **Allocation Drift**: 5% from target

### Key Overweight Positions
1. **NVDA**: +8.5% over target - Recommend reducing by 15 shares
2. **GOOGL**: +5.8% over target - Recommend reducing by 25 shares

### Key Underweight Positions
1. **AAPL**: -5.8% under target - Recommend adding 30 shares
2. **TSLA**: -12% under target - Recommend initiating with 40 shares

### Rebalancing Strategy
The proposed rebalancing will:
- Reduce concentration risk in overweight positions
- Improve diversification across sectors
- Align portfolio with target allocations
- Free up $8,750 in cash to reach target cash allocation

### Expected Outcome
After rebalancing:
- Stock allocation: 80.2% (within tolerance)
- Cash allocation: 19.8% (within tolerance)
- Maximum position size: 20% (MSFT)
- Improved risk-adjusted returns`,
    
    opportunityAgent: `## Market Opportunity Analysis

### Market Overview
- **Current Trend**: Bullish momentum in financial and tech sectors
- **Volatility**: Moderate levels providing good entry points
- **Sector Rotation**: Movement into value and growth stocks

### Top Opportunities Identified

#### 1. Visa (V) - Score: 8.5/10
**Recommendation**: BUY - Initiate 5% position

**Bullish Factors:**
- Payment volume growth accelerating (+12% YoY)
- Digital payment adoption expanding globally
- Strong competitive moat with network effects
- Consistent free cash flow generation
- Trading near support with oversold RSI

**Target Allocation**: 5% of portfolio
**Risk Level**: Low-Moderate

#### 2. Tesla (TSLA) - Score: 7.8/10
**Recommendation**: BUY - Initiate 12% position

**Bullish Factors:**
- New product launches gaining traction
- Energy business showing strong growth
- Autonomous driving progress accelerating
- Positive social sentiment and brand strength

**Target Allocation**: 12% of portfolio
**Risk Level**: Moderate-High

### Market Conditions Assessment
- Favorable entry points for quality growth stocks
- Sector diversification opportunities available
- Risk/reward profile supports selective additions`
  },
  
  // Whether opportunity agent was used
  opportunityAgentUsed: true,
  
  // Execution configuration
  autoExecuteEnabled: false, // Whether auto-execute was enabled
  ordersExecuted: false, // Whether orders have been executed
  
  // Workflow Steps with detailed agent information
  workflowSteps: [
    {
      id: 'threshold',
      title: 'Threshold Check',
      description: 'Evaluating portfolio drift against rebalance threshold',
      icon: CheckSquare,
      status: 'completed',
      skipThresholdCheck: false, // This step is skipped if true
      startedAt: new Date(Date.now() - 5 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 4.8 * 60000).toISOString(),
      agents: [] // No sub-agents for this step
    },
    {
      id: 'opportunity',
      title: 'Opportunity Analysis',
      description: 'Scanning market for new investment opportunities',
      icon: Zap,
      status: 'completed',
      skipOpportunityAgent: false, // This step is skipped if true
      startedAt: new Date(Date.now() - 4.8 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 4 * 60000).toISOString(),
      agents: [] // No sub-agents for this step
    },
    {
      id: 'analysis',
      title: 'Stock Analysis',
      description: 'Analyzing individual stocks for rebalancing decisions',
      icon: BarChart3,
      status: 'completed',
      startedAt: new Date(Date.now() - 4 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 2.5 * 60000).toISOString(),
      // These are the stocks being analyzed with their agent progress
      agents: [
        { name: 'NVDA Analysis', key: 'nvda', icon: TrendingUp, status: 'completed' },
        { name: 'AAPL Analysis', key: 'aapl', icon: TrendingUp, status: 'completed' },
        { name: 'V Analysis', key: 'v', icon: TrendingUp, status: 'completed' },
        { name: 'TSLA Analysis', key: 'tsla', icon: TrendingUp, status: 'completed' }
      ],
      // Nested analysis workflow for each stock
      stockAnalyses: [
        {
          ticker: 'NVDA',
          status: 'completed',
          agents: {
            marketAnalyst: 'completed',
            newsAnalyst: 'completed',
            socialMediaAnalyst: 'completed',
            fundamentalsAnalyst: 'completed'
          }
        },
        {
          ticker: 'AAPL',
          status: 'completed',
          agents: {
            marketAnalyst: 'completed',
            newsAnalyst: 'completed',
            socialMediaAnalyst: 'completed',
            fundamentalsAnalyst: 'completed'
          }
        },
        {
          ticker: 'V',
          status: 'completed',
          agents: {
            marketAnalyst: 'completed',
            newsAnalyst: 'completed',
            socialMediaAnalyst: 'completed',
            fundamentalsAnalyst: 'completed'
          }
        },
        {
          ticker: 'TSLA',
          status: 'completed',
          agents: {
            marketAnalyst: 'completed',
            newsAnalyst: 'completed',
            socialMediaAnalyst: 'completed',
            fundamentalsAnalyst: 'completed'
          }
        }
      ]
    },
    {
      id: 'rebalance',
      title: 'Rebalance Agent',
      description: 'Calculating optimal portfolio rebalancing strategy',
      icon: RefreshCw,
      status: 'completed',
      startedAt: new Date(Date.now() - 2.5 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 2 * 60000).toISOString(),
      agents: [] // No sub-agents for this step
    }
  ],
  
  // Configuration flags
  skipThresholdCheck: false,
  skipOpportunityAgent: false
};

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

// Workflow Steps Component similar to AnalysisDetailModal
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
    if (stockAnalysis && stockAnalysis.agents) {
      return stockAnalysis.agents[agentKey] || 'pending';
    }
    return 'pending';
  };

  return (
    <div className="space-y-6">
      {workflowData.workflowSteps.map((step: any) => {
        const Icon = step.icon;
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
              <div className={`rounded-lg border p-4 transition-all ${
                isCompleted 
                  ? 'bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10'
                  : isRunning 
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
                        {step.id === 'analysis' && step.agents.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">
                                {step.agents.filter((a: any) => a.status === 'completed').length}/{step.agents.length} stocks analyzed
                              </span>
                              <span className={isCompleted ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
                                {Math.round((step.agents.filter((a: any) => a.status === 'completed').length / step.agents.length) * 100)}%
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  isCompleted 
                                    ? 'bg-green-500' 
                                    : isRunning 
                                    ? 'bg-primary'
                                    : 'bg-muted-foreground/30'
                                }`}
                                style={{ width: `${Math.round((step.agents.filter((a: any) => a.status === 'completed').length / step.agents.length) * 100)}%` }}
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
                    const analysisAgents = [
                      { name: 'Market Analyst', key: 'marketAnalyst', icon: TrendingUp },
                      { name: 'News Analyst', key: 'newsAnalyst', icon: FileText },
                      { name: 'Social Media', key: 'socialMediaAnalyst', icon: MessageSquare },
                      { name: 'Fundamentals', key: 'fundamentalsAnalyst', icon: Brain }
                    ];
                    
                    return (
                      <div key={stockAnalysis.ticker} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {stockAnalysis.ticker}
                          </Badge>
                          <span className="text-sm text-muted-foreground">Analysis</span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {analysisAgents.map((agent) => {
                            const agentStatus = getAgentStatus(agent.key, stockAnalysis);
                            const AgentIcon = agent.icon;
                            
                            return (
                              <div
                                key={agent.key}
                                className={`relative rounded-lg border p-3 transition-all ${
                                  agentStatus === 'completed'
                                    ? 'bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10'
                                    : agentStatus === 'running'
                                    ? 'bg-primary/5 border-primary/30 shadow-sm'
                                    : 'bg-card border-border'
                                }`}
                              >
                                <div className="flex flex-col items-center text-center space-y-2">
                                  <div className={`p-2 rounded-lg ${
                                    agentStatus === 'completed'
                                      ? 'bg-green-500/20 dark:bg-green-500/10 text-green-600 dark:text-green-400'
                                      : agentStatus === 'running'
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    <AgentIcon className="w-4 h-4" />
                                  </div>
                                  
                                  <h4 className="font-medium text-xs">{agent.name}</h4>
                                  
                                  <Badge 
                                    variant={agentStatus === 'completed' ? 'secondary' : 'outline'} 
                                    className="text-xs"
                                  >
                                    {agentStatus === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                                    {agentStatus === 'running' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                    {agentStatus === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                                    {agentStatus.charAt(0).toUpperCase() + agentStatus.slice(1)}
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
      className={`p-4 rounded-lg border transition-all ${
        isExecuted 
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
              <span className={`text-sm font-medium ${
                position.shareChange > 0 ? 'text-green-600' : 'text-red-600'
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
        <p className="text-xs text-muted-foreground italic">
          {position.reasoning}
        </p>
        
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

export default function RebalanceDetailModal({ isOpen, onClose }: RebalanceDetailModalProps) {
  const [activeTab, setActiveTab] = useState("actions");
  const [selectedAnalysis, setSelectedAnalysis] = useState<{
    ticker: string;
    date: string;
  } | null>(null);
  const [executedTickers, setExecutedTickers] = useState<Set<string>>(
    new Set(mockRebalanceData.recommendedPositions
      .filter(p => p.executed)
      .map(p => p.ticker))
  );
  const [rejectedTickers, setRejectedTickers] = useState<Set<string>>(new Set());
  
  const data = mockRebalanceData;
  
  const handleApproveOrder = (ticker: string) => {
    // Mark position as executed
    setExecutedTickers(new Set([...executedTickers, ticker]));
    
    // In real implementation, this would call an API to execute the order
    console.log('Executing order for:', ticker);
  };
  
  const handleRejectOrder = (ticker: string) => {
    // Mark position as rejected/skipped
    setRejectedTickers(new Set([...rejectedTickers, ticker]));
    
    // In real implementation, this would update the database
    console.log('Rejecting order for:', ticker);
  };
  
  const handleExecuteAllOrders = () => {
    // Execute all pending (non-executed, non-rejected) positions
    const pendingPositions = data.recommendedPositions
      .filter(p => p.shareChange !== 0 && !executedTickers.has(p.ticker) && !rejectedTickers.has(p.ticker))
      .map(p => p.ticker);
    
    setExecutedTickers(new Set([...executedTickers, ...pendingPositions]));
    
    // In real implementation, this would call an API to execute all pending orders
    console.log('Executing all pending orders:', pendingPositions);
  };
  
  // Calculate values for pending orders only
  const pendingPositions = data.recommendedPositions
    .filter(p => p.shareChange !== 0 && !executedTickers.has(p.ticker) && !rejectedTickers.has(p.ticker));
  
  const totalBuyValue = pendingPositions
    .filter(p => p.action === 'BUY')
    .reduce((sum, p) => sum + Math.abs(p.shareChange * (p.currentValue / p.currentShares || 200)), 0);

  const totalSellValue = pendingPositions
    .filter(p => p.action === 'SELL')
    .reduce((sum, p) => sum + Math.abs(p.shareChange * (p.currentValue / p.currentShares)), 0);

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
                <Badge variant="secondary" className="text-sm">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Demo Data
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                Completed {formatDistanceToNow(new Date(data.completedAt))} ago
              </div>
            </div>
            <DialogDescription className="mt-2">
              Review rebalancing recommendations and related analyses
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
            
            <ScrollArea className="h-[calc(90vh-220px)]">
              <div className="px-6 pb-6">
                <TabsContent value="actions" className="mt-6 space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <Card className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Total Buy Value</span>
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      </div>
                      <p className="text-lg font-semibold text-green-600">
                        ${totalBuyValue.toLocaleString()}
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
                    </Card>
                    <Card className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Net Cash Flow</span>
                        <AlertCircle className="w-4 h-4 text-blue-500" />
                      </div>
                      <p className={`text-lg font-semibold ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {netCashFlow >= 0 ? '+' : ''}${netCashFlow.toLocaleString()}
                      </p>
                    </Card>
                  </div>

                  {/* Rebalancing Positions */}
                  <div className="space-y-3">
                    {data.recommendedPositions.map((position) => {
                      const isExecuted = executedTickers.has(position.ticker);
                      const isRejected = rejectedTickers.has(position.ticker);
                      
                      // Don't show rejected positions
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
                  
                  {/* Execute Orders Button */}
                  <div className="flex justify-between items-center mt-6">
                    <div className="text-sm text-muted-foreground">
                      {executedTickers.size > 0 && (
                        <span className="text-green-600">
                          {executedTickers.size} order{executedTickers.size !== 1 ? 's' : ''} executed
                        </span>
                      )}
                      {executedTickers.size > 0 && rejectedTickers.size > 0 && ' • '}
                      {rejectedTickers.size > 0 && (
                        <span className="text-orange-600">
                          {rejectedTickers.size} order{rejectedTickers.size !== 1 ? 's' : ''} skipped
                        </span>
                      )}
                    </div>
                    <Button
                      onClick={handleExecuteAllOrders}
                      disabled={!hasPendingOrders}
                      className="min-w-[180px]"
                    >
                      {hasPendingOrders ? (
                        <>
                          <Activity className="w-4 h-4 mr-2" />
                          Execute All Pending ({pendingPositions.length})
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          All Orders Processed
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="workflow" className="mt-6">
                  <RebalanceWorkflowSteps workflowData={data} />
                </TabsContent>
                
                <TabsContent value="insights" className="mt-6 space-y-4">
                  {/* Opportunity Agent Section - Only show if opportunity agent was used */}
                  {data.opportunityAgentUsed && (
                    <>
                      <Card className="overflow-hidden">
                        <CardHeader className="bg-muted/30">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            Opportunity Analysis
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <MarkdownRenderer content={data.agentInsights.opportunityAgent} />
                        </CardContent>
                      </Card>
                      
                      {/* Related Stock Analyses */}
                      {data.relatedAnalyses.length > 0 && (
                        <div className="space-y-3">
                          <h3 className="text-sm font-medium text-muted-foreground">Related Stock Analyses</h3>
                          {data.relatedAnalyses.map((analysis) => (
                            <div
                              key={analysis.id}
                              className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => setSelectedAnalysis({
                                ticker: analysis.ticker,
                                date: analysis.analysis_date
                              })}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="font-semibold">{analysis.ticker}</span>
                                  <Badge variant={getDecisionVariant(analysis.decision)}>
                                    <span className="flex items-center gap-1">
                                      {getDecisionIcon(analysis.decision)}
                                      {analysis.decision}
                                    </span>
                                  </Badge>
                                  <span className={`text-sm font-medium ${getConfidenceColor(analysis.confidence)}`}>
                                    {analysis.confidence}% confidence
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="border border-slate-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAnalysis({
                                      ticker: analysis.ticker,
                                      date: analysis.analysis_date
                                    });
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View Details
                                </Button>
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  Analysis date: {new Date(analysis.analysis_date).toLocaleDateString()}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Rebalance Agent Insights */}
                  <Card className="overflow-hidden">
                    <CardHeader className="bg-muted/30">
                      <CardTitle className="text-base flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Rebalance Agent Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <MarkdownRenderer content={data.agentInsights.rebalanceAgent} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </ScrollArea>
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