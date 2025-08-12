import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  MessageSquare,
  Shield,
  CheckCircle,
  Clock,
  AlertCircle,
  BarChart3,
  Hash,
  Search,
  Brain,
  Users,
  Gavel,
  Activity,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Play,
  Briefcase
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-supabase"; import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { analysisManager } from "@/lib/analysisManager";
import type { WorkflowStep as EngineWorkflowStep } from "@/lib/tradingEngine";
import StockTickerAutocomplete from "@/components/StockTickerAutocomplete";
import { useToast } from "@/hooks/use-toast";
import AnalysisDetailModal from "@/components/AnalysisDetailModal";

interface Agent {
  id: string;
  name: string;
  icon: any;
  status: 'active' | 'idle' | 'processing';
  lastAction: string;
  progress?: number;
}

interface WorkflowStep {
  id: string;
  name: string;
  icon: any;
  status: 'pending' | 'active' | 'completed' | 'running';
  agents: Agent[];
  currentActivity?: string;
  details?: string;
  insights?: string[];
  description?: string;
}

// Map workflow step IDs to icons
const workflowStepIcons: Record<string, any> = {
  analysis: Brain,
  research: MessageSquare,
  decision: TrendingUp,
  risk: Shield,
};

// Initial empty workflow steps - will be populated with real data
const getInitialWorkflowSteps = (): WorkflowStep[] => [
  {
    id: 'analysis',
    name: 'Analysis Phase',
    icon: BarChart3,
    status: 'pending',
    currentActivity: 'Waiting to start',
    details: 'Four specialized analysts process data sequentially based on configuration. Each analyst has dedicated tools and clears messages before the next begins.',
    description: 'Sequential processing',
    agents: [
      {
        id: '1',
        name: 'Market Analyst',
        icon: TrendingUp,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '2',
        name: 'Social Media Analyst',
        icon: Hash,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '3',
        name: 'News Analyst',
        icon: Search,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '4',
        name: 'Fundamentals Analyst',
        icon: BarChart3,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  },
  {
    id: 'research-debate',
    name: 'Research Debate',
    icon: MessageSquare,
    status: 'pending',
    currentActivity: 'Waiting for analysis',
    details: 'Bull and Bear researchers engage in structured debate (max 2 rounds) to balance opportunities and risks. Research Manager synthesizes the final consensus.',
    description: 'Max 2 rounds',
    agents: [
      {
        id: '5',
        name: 'Bull Researcher',
        icon: MessageSquare,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '6',
        name: 'Bear Researcher',
        icon: MessageSquare,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '7',
        name: 'Research Manager',
        icon: Users,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  },
  {
    id: 'trading-decision',
    name: 'Trading Decision',
    icon: TrendingUp,
    status: 'pending',
    currentActivity: 'Awaiting research',
    details: 'Trader processes all analyst reports and research debate outcomes to create comprehensive trading recommendations with specific entry/exit points.',
    agents: [
      {
        id: '8',
        name: 'Trader',
        icon: Activity,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  },
  {
    id: 'risk-assessment',
    name: 'Risk Assessment',
    icon: Shield,
    status: 'pending',
    currentActivity: 'Awaiting decision',
    details: 'Three risk perspectives rotate through discussion (max 3 rounds) before Risk Judge makes final approval/rejection decision on the trade.',
    description: 'Max 3 rounds',
    agents: [
      {
        id: '9',
        name: 'Risky Analyst',
        icon: TrendingUp,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '10',
        name: 'Safe Analyst',
        icon: Shield,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '11',
        name: 'Neutral Analyst',
        icon: Brain,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '12',
        name: 'Risk Judge',
        icon: Gavel,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  },
  {
    id: 'portfolio-management',
    name: 'Portfolio Management',
    icon: Briefcase,
    status: 'pending',
    currentActivity: 'Awaiting activation',
    details: 'Portfolio Manager analyzes portfolio allocation and generates trade orders with position sizing.',
    description: 'Position sizing',
    agents: [
      {
        id: '13',
        name: 'Portfolio Manager',
        icon: Briefcase,
        status: 'idle',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  }
];

const workflowSteps = getInitialWorkflowSteps();

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-500 bg-green-500/10';
    case 'active':
      return 'text-blue-500 bg-blue-500/10 animate-pulse';
    case 'running':
      return 'text-yellow-500 bg-yellow-500/10';
    case 'pending':
      return 'text-gray-500 bg-gray-500/10';
    default:
      return 'text-gray-500';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-3 h-3" />;
    case 'active':
      return <Loader2 className="w-3 h-3 animate-spin" />;
    case 'running':
      return <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />;
    case 'pending':
      return <Clock className="w-3 h-3" />;
    default:
      return null;
  }
};

const getStepProgress = (step: WorkflowStep): number => {
  if (step.status === 'completed') return 100;

  // Always calculate actual progress, even for pending/running status
  const totalAgents = step.agents.length;
  if (totalAgents === 0) return 0;

  const completedAgents = step.agents.filter(a => a.progress === 100).length;
  const activeAgent = step.agents.find(a => a.status === 'processing');

  const baseProgress = (completedAgents / totalAgents) * 100;
  const activeProgress = activeAgent ? (activeAgent.progress || 0) / totalAgents : 0;

  return Math.round(baseProgress + activeProgress);
};

const getStageStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-500';
    case 'active':
      return 'text-blue-500';
    case 'running':
      return 'text-yellow-500';
    case 'pending':
      return 'text-gray-500';
    default:
      return 'text-gray-500';
  }
};

export default function HorizontalWorkflow() {
  const { user, apiSettings } = useAuth();
  const { toast } = useToast();
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [expandedAgents, setExpandedAgents] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);
  const [activeAnalysisTicker, setActiveAnalysisTicker] = useState<string | null>(null);
  const [workflowData, setWorkflowData] = useState<WorkflowStep[]>(() => getInitialWorkflowSteps());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchTicker, setSearchTicker] = useState('');
  const [showAnalysisDetail, setShowAnalysisDetail] = useState(false);
  const [isRebalanceContext, setIsRebalanceContext] = useState(false);
  const previousRunningRef = useRef<Set<string>>(new Set());

  // Handle starting a new analysis
  const handleStartAnalysis = async () => {
    if (!searchTicker || !apiSettings || !user) {
      toast({
        title: "Cannot Start Analysis",
        description: !apiSettings ? "Please configure your API settings first" : "Please enter a stock ticker",
        variant: "destructive",
      });
      return;
    }

    const ticker = searchTicker.toUpperCase();

    try {
      // Start the analysis using analysisManager (note: parameter order is ticker, apiSettings, userId)
      const analysisId = await analysisManager.startAnalysis(ticker, apiSettings, user.id);

      // This is an individual analysis, not part of rebalance
      setIsRebalanceContext(false);

      // Set the active ticker and open the detail modal
      setActiveAnalysisTicker(ticker);
      setShowAnalysisDetail(true);

      // Set current analysis with the ID if returned
      if (analysisId) {
        setCurrentAnalysis({ id: analysisId, ticker });
      }

      // Clear the search field
      setSearchTicker('');

      toast({
        title: "Analysis Started",
        description: `Starting comprehensive analysis for ${ticker}`,
      });
    } catch (error) {
      console.error('Failed to start analysis:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to start analysis",
        variant: "destructive",
      });
    }
  };

  // Check for running analyses and completed analyses (exact same logic as StandaloneWatchlist)
  useEffect(() => {
    const checkRunningAnalyses = async () => {
      const running = new Set<string>();

      // Check database for running analyses if user is authenticated
      if (user) {
        try {
          // Get all analyses that might be running
          // Check both analysis_status = 0 and full_analysis->>'status' = 'running'
          const { data, error } = await supabase
            .from('analysis_history')
            .select('ticker, analysis_status, full_analysis, created_at, id, decision, agent_insights, rebalance_request_id')
            .eq('user_id', user.id)
            .or('analysis_status.eq.0,full_analysis->>status.eq.running');

          if (!error && data) {
            // Filter to only actually running analyses
            const runningData = data.filter(item => {
              // Consider running if analysis_status is 0 OR full_analysis.status is 'running'
              const isRunning = item.analysis_status === 0 ||
                (item.full_analysis && item.full_analysis.status === 'running');
              return isRunning;
            });

            // Only log if there are actually running analyses
            if (runningData.length > 0) {
              console.log('Running analyses from DB:', runningData.map(d => ({
                ticker: d.ticker,
                status: d.analysis_status,
                fullAnalysisStatus: d.full_analysis?.status
              })));
            }
            for (const item of runningData) {
              running.add(item.ticker);
            }

            // Use the most recent running analysis for display
            if (runningData.length > 0) {
              const mostRecent = runningData.sort((a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              )[0];
              console.log('Most recent running analysis:', {
                ticker: mostRecent.ticker,
                rebalance_request_id: mostRecent.rebalance_request_id,
                analysis_status: mostRecent.analysis_status
              });
              setCurrentAnalysis(mostRecent);
              setActiveAnalysisTicker(mostRecent.ticker);
              const stillRunning = updateWorkflowFromAnalysis(mostRecent);
              setIsAnalyzing(stillRunning);
            }
          }
        } catch (error) {
          console.error('Error checking running analyses:', error);
        }
      }

      // Check if any analyses just completed (were running before but not now)
      const justCompleted = Array.from(previousRunningRef.current).filter(ticker => !running.has(ticker));
      if (justCompleted.length > 0) {
        console.log('Analyses completed, reloading for:', justCompleted);

        // Fetch the completed analysis data
        try {
          const { data, error } = await supabase
            .from('analysis_history')
            .select('*')
            .eq('user_id', user.id)
            .in('ticker', justCompleted)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error && data) {
            setCurrentAnalysis(data);
            setActiveAnalysisTicker(data.ticker);
            const stillRunning = updateWorkflowFromAnalysis(data);
            setIsAnalyzing(stillRunning);
          }
        } catch (error) {
          console.error('Error fetching completed analysis:', error);
        }
      }

      // If no running analyses and we were analyzing, keep showing the last one
      if (running.size === 0 && previousRunningRef.current.size > 0) {
        setIsAnalyzing(false);
        // Keep the current analysis display, don't reset
      } else if (running.size === 0 && !activeAnalysisTicker && user) {
        // No analyses at all - check for recent completed ones
        try {
          const thirtyMinutesAgo = new Date();
          thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

          const { data, error } = await supabase
            .from('analysis_history')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_canceled', false)
            .gte('created_at', thirtyMinutesAgo.toISOString())
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error && data) {
            setCurrentAnalysis(data);
            setActiveAnalysisTicker(data.ticker);
            const stillRunning = updateWorkflowFromAnalysis(data);
            setIsAnalyzing(stillRunning);
          }
        } catch (error) {
          console.error('Error fetching recent analysis:', error);
        }
      }

      // Only log if there are running analyses or if status changed
      const runningArray = Array.from(running);
      const prevArray = Array.from(previousRunningRef.current);
      if (runningArray.length > 0 || prevArray.length > 0) {
        if (runningArray.join(',') !== prevArray.join(',')) {
          console.log('Running analyses changed:', {
            current: runningArray,
            previous: prevArray
          });
        }
      }

      // Update the ref with current running set
      previousRunningRef.current = running;
    };

    checkRunningAnalyses();
    // Check periodically - every 10 seconds instead of 2 seconds
    const interval = setInterval(checkRunningAnalyses, 10000);

    // Subscribe to real-time updates for new analyses
    const subscription = user ? supabase
      .channel('analysis_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'analysis_history',
          filter: `user_id=eq.${user?.id}`
        },
        (payload) => {
          // New analysis started - update immediately
          setCurrentAnalysis(payload.new);
          setActiveAnalysisTicker(payload.new.ticker);
          const stillRunning = updateWorkflowFromAnalysis(payload.new);
          setIsAnalyzing(stillRunning);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'analysis_history',
          filter: `user_id=eq.${user?.id}`
        },
        (payload) => {
          // Analysis updated - check if it's the current one
          if (payload.new && payload.new.ticker === activeAnalysisTicker) {
            setCurrentAnalysis(payload.new);
            const updatedIsAnalyzing = updateWorkflowFromAnalysis(payload.new);
            setIsAnalyzing(updatedIsAnalyzing);
          }
        }
      )
      .subscribe() : { unsubscribe: () => { } };

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, [user]);  // Only depend on user, not activeAnalysisTicker to avoid re-subscribing



  // Helper to get agent icon
  const getAgentIcon = (agentName: string): any => {
    if (agentName.includes('Market')) return BarChart3;
    if (agentName.includes('Social')) return Hash;
    if (agentName.includes('News')) return Search;
    if (agentName.includes('Fundamental')) return BarChart3;
    if (agentName.includes('Bull') || agentName.includes('Bear')) return MessageSquare;
    if (agentName.includes('Manager')) return Users;
    if (agentName.includes('Trader')) return TrendingUp;
    if (agentName.includes('Risk')) return Shield;
    return Brain;
  };

  // Helper function to get agent status (same logic as AnalysisDetailModal)
  const getAgentStatus = (agentKey: string, stepId: string, analysis: any) => {
    const insights = analysis.agent_insights || {};

    // Special handling for research phase agents
    if (stepId === 'research' || stepId === 'research-debate') {
      // For research phase, only mark Bull/Bear as complete when Research Manager is done
      if (agentKey === 'bullResearcher' || agentKey === 'bearResearcher') {
        // Check if Research Manager has completed (which means all debate rounds are done)
        if (insights.researchManager) {
          return 'completed';
        }
        // Check if there's any debate activity
        if (insights.researchDebate && insights.researchDebate.length > 0) {
          return 'running';
        }
        // Check if individual insights exist (first round running)
        if (insights[agentKey]) {
          return 'running';
        }
      } else if (agentKey === 'researchManager') {
        // Research Manager is only complete when it has insights
        if (insights.researchManager) {
          return 'completed';
        }
        // If debate rounds exist but no manager yet, it's pending
        if (insights.researchDebate && insights.researchDebate.length > 0) {
          return 'pending';
        }
      }
    }

    // Default behavior for other agents
    if (insights && insights[agentKey]) {
      return 'completed';
    }
    // Check in workflow steps if available
    if (analysis.full_analysis?.workflowSteps) {
      for (const step of analysis.full_analysis.workflowSteps) {
        const agent = step.agents?.find((a: any) =>
          a.name.toLowerCase().replace(/\s+/g, '').includes(agentKey.toLowerCase().replace(/analyst|researcher|manager/g, '').trim())
        );
        if (agent) {
          return agent.status || 'pending';
        }
      }
    }
    return 'pending';
  };

  // Update workflow based on analysis data
  // Returns true if the analysis is still running, false if complete
  const updateWorkflowFromAnalysis = (analysis: any): boolean => {
    if (!analysis) return false;

    // First try to use full_analysis if available for more detailed agent data
    const fullAnalysis = analysis.full_analysis;
    const insights = analysis.agent_insights || {};

    // Check if this is a rebalance analysis
    const isRebalanceAnalysis = !!analysis.rebalance_request_id;

    console.log('Analysis rebalance check:', {
      rebalance_request_id: analysis.rebalance_request_id,
      isRebalanceAnalysis
    });

    // Update the rebalance context state
    setIsRebalanceContext(isRebalanceAnalysis);

    // Determine if analysis is completed or running
    // For rebalance analyses, consider complete after risk stage (no portfolio manager)
    let isCompleted = analysis.analysis_status === 1 ||
      (analysis.analysis_status !== 0 &&
        (!fullAnalysis?.status || fullAnalysis.status !== 'running'));

    // Special handling for rebalance analyses
    if (isRebalanceAnalysis && analysis.analysis_status === 0) {
      // For rebalance analyses, check if risk assessment is complete
      // Risk Manager is the final agent for individual stock analysis in rebalance
      const hasRiskManagerInsights = insights.riskManager || insights.riskJudge;

      // Also check if all risk agents have completed
      const riskAgentsComplete = insights.riskyAnalyst && insights.safeAnalyst &&
        insights.neutralAnalyst && (insights.riskManager || insights.riskJudge);

      if (hasRiskManagerInsights || riskAgentsComplete) {
        console.log('Rebalance analysis - risk assessment complete, marking as done');
        isCompleted = true;
      }
    }

    const isRunning = !isCompleted && (analysis.analysis_status === 0 ||
      (fullAnalysis?.status === 'running'));


    // If full_analysis has workflowSteps, use them directly
    if (fullAnalysis?.workflowSteps && Array.isArray(fullAnalysis.workflowSteps)) {
      console.log('Using fullAnalysis.workflowSteps data');
      const mappedSteps = fullAnalysis.workflowSteps.map((step: any) => {
        const agents = step.agents.map((agent: any) => ({
          id: agent.name.toLowerCase().replace(/\s+/g, '-'),
          name: agent.name,
          icon: getAgentIcon(agent.name),
          status: agent.status === 'completed' ? 'idle' : agent.status === 'processing' ? 'processing' : 'idle',
          lastAction: agent.status === 'completed' ? 'Analysis complete' :
            agent.status === 'processing' ? 'Analyzing...' : 'Waiting...',
          progress: agent.progress || (agent.status === 'completed' ? 100 : 0)
        }));

        // SIMPLIFIED: Calculate step status based on agent completion
        const completedAgents = agents.filter((agent: any) => agent.progress === 100).length;
        const totalAgents = agents.length;

        // Simple rule: 0 = pending, some = running, all = completed
        let stepStatus = completedAgents === 0 ? 'pending' :
          completedAgents === totalAgents ? 'completed' :
            'running';

        // Special handling for rebalance analyses - mark as complete if risk stage is done
        if (isRebalanceAnalysis && step.id === 'risk' && stepStatus === 'completed') {
          // This is the last step for rebalance analyses
          console.log('Rebalance analysis - risk stage complete, marking analysis as done');
        }

        console.log(`Step ${step.name}:`, {
          id: step.id,
          completedAgents,
          totalAgents,
          calculatedStatus: stepStatus,
          originalStatus: step.status,
          isRebalanceAnalysis
        });

        return {
          id: step.id,
          name: step.name,
          icon: workflowStepIcons[step.id] || Brain,
          status: stepStatus,
          currentActivity: stepStatus === 'completed' ? 'Completed' :
            stepStatus === 'running' ? 'Processing...' :
              'Pending',
          details: step.description,
          agents: agents,
          insights: []
        };
      });

      // Filter out portfolio management step for rebalance analyses
      console.log('Before filtering mappedSteps:', mappedSteps.map((s: any) => ({ id: s.id, name: s.name })));
      const filteredSteps = isRebalanceAnalysis
        ? mappedSteps.filter((step: any) =>
          step.id !== 'portfolio-management' &&
          step.id !== 'portfolio' &&
          !step.name.toLowerCase().includes('portfolio'))
        : mappedSteps;
      console.log('After filtering filteredSteps:', filteredSteps.map((s: any) => ({ id: s.id, name: s.name })));

      setWorkflowData(filteredSteps);
      return isRunning;
    }

    // Otherwise, build from agent insights
    // Start with initial steps, but filter out portfolio management for rebalance
    let updatedSteps = isRebalanceAnalysis
      ? getInitialWorkflowSteps().filter(step => step.id !== 'portfolio-management')
      : [...getInitialWorkflowSteps()];

    // If the analysis is completed but we don't have detailed insights, mark all steps as completed
    if (isCompleted && Object.keys(insights).length === 0) {
      updatedSteps.forEach((step, index) => {
        // Mark all steps as completed for a finished analysis
        const maxSteps = isRebalanceAnalysis ? 3 : 4; // 4 steps for rebalance, 5 for regular
        if (index <= maxSteps) {
          step.status = 'completed';
          step.currentActivity = 'Completed';
          step.agents.forEach(agent => {
            agent.progress = 100;
            agent.lastAction = 'Analysis complete';
          });
        }
        // Portfolio management only for non-rebalance analyses
        if (!isRebalanceAnalysis && index === 4 && analysis.decision) {
          step.status = 'completed';
          step.currentActivity = 'Completed';
          step.agents.forEach(agent => {
            agent.progress = 100;
            agent.lastAction = 'Position sizing calculated';
          });
        }
      });
      setWorkflowData(updatedSteps);
      return false; // Analysis is complete
    }

    // If we have full analysis, extract more detailed agent information
    if (fullAnalysis && typeof fullAnalysis === 'object') {
      // Process each agent's full data
      Object.entries(fullAnalysis).forEach(([agentName, agentData]: [string, any]) => {
        if (agentData && agentData.messages && Array.isArray(agentData.messages)) {
          // Get all messages from this agent
          const messages = agentData.messages;
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.content) {
              // Override insights with full message content
              insights[agentName] = lastMessage.content;
            }
          }
        }
      });
    }

    // SIMPLIFIED: Analysis Phase - just count completed agents
    const analysisAgents = ['marketAnalyst', 'socialMediaAnalyst', 'newsAnalyst', 'fundamentalsAnalyst'];
    const analysisCompleted = analysisAgents.filter(agent => insights[agent]).length;
    const analysisTotal = analysisAgents.length;

    // Simple rule: 0 = pending, some = running, all = completed
    const analysisStepStatus = analysisCompleted === 0 ? 'pending' :
      analysisCompleted === analysisTotal ? 'completed' :
        'running';

    console.log('Analysis Step Debug:', {
      insights: Object.keys(insights),
      analysisAgents,
      analysisCompleted,
      analysisTotal,
      calculatedStatus: analysisStepStatus
    });

    updatedSteps[0] = {
      ...updatedSteps[0],
      status: analysisStepStatus,
      currentActivity: analysisStepStatus === 'completed' ? 'Completed' :
        analysisStepStatus === 'running' ? 'Processing...' :
          'Waiting to start',
      agents: [
        {
          ...updatedSteps[0].agents[0],
          status: 'idle',
          lastAction: insights['marketAnalyst'] ? 'Analysis complete' : 'Waiting...',
          progress: insights['marketAnalyst'] ? 100 : 0
        },
        {
          ...updatedSteps[0].agents[1],
          status: 'idle',
          lastAction: insights['socialMediaAnalyst'] ? 'Social sentiment analyzed' : 'Waiting...',
          progress: insights['socialMediaAnalyst'] ? 100 : 0
        },
        {
          ...updatedSteps[0].agents[2],
          status: 'idle',
          lastAction: insights['newsAnalyst'] ? 'News analysis complete' : 'Waiting...',
          progress: insights['newsAnalyst'] ? 100 : 0
        },
        {
          ...updatedSteps[0].agents[3],
          status: 'idle',
          lastAction: insights['fundamentalsAnalyst'] ? 'Fundamentals analyzed' : 'Waiting...',
          progress: insights['fundamentalsAnalyst'] ? 100 : 0
        }
      ]
    };

    // SIMPLIFIED: Research Debate - just count completed agents
    const researchAgents = ['bullResearcher', 'bearResearcher', 'researchManager'];
    const researchCompleted = researchAgents.filter(agent => insights[agent]).length;
    const researchTotal = researchAgents.length;

    // Simple rule: 0 = pending, some = running, all = completed
    const researchStepStatus = researchCompleted === 0 ? 'pending' :
      researchCompleted === researchTotal ? 'completed' :
        'running';

    updatedSteps[1] = {
      ...updatedSteps[1],
      status: researchStepStatus,
      currentActivity: researchStepStatus === 'completed' ? 'Completed' :
        researchStepStatus === 'running' ? 'Debate in progress...' :
          'Waiting for analysis',
      agents: [
        {
          ...updatedSteps[1].agents[0],
          status: 'idle',
          lastAction: insights['bullResearcher'] ? 'Bull case presented' : 'Waiting...',
          progress: insights['bullResearcher'] ? 100 : 0
        },
        {
          ...updatedSteps[1].agents[1],
          status: 'idle',
          lastAction: insights['bearResearcher'] ? 'Bear case presented' : 'Waiting...',
          progress: insights['bearResearcher'] ? 100 : 0
        },
        {
          ...updatedSteps[1].agents[2],
          status: 'idle',
          lastAction: insights['researchManager'] ? 'Debate concluded' : 'Waiting...',
          progress: insights['researchManager'] ? 100 : 0
        }
      ]
    };

    // SIMPLIFIED: Trading Decision - single agent
    const hasTraderData = insights['trader'] || analysis.decision;

    updatedSteps[2] = {
      ...updatedSteps[2],
      status: hasTraderData ? 'completed' : 'pending',
      currentActivity: hasTraderData ? `Decision: ${analysis.decision || 'Made'}` :
        'Awaiting research',
      agents: [
        {
          ...updatedSteps[2].agents[0],
          status: 'idle',
          lastAction: hasTraderData ? `${analysis.decision || 'Trading'} decision made` : 'Waiting...',
          progress: hasTraderData ? 100 : 0
        }
      ]
    };

    // SIMPLIFIED: Risk Assessment - just count completed agents
    const riskAgents = ['riskyAnalyst', 'safeAnalyst', 'neutralAnalyst', 'riskManager'];
    const riskCompleted = riskAgents.filter(agent => insights[agent]).length;
    const riskTotal = riskAgents.length;

    // Simple rule: 0 = pending, some = running, all = completed
    const riskStepStatus = riskCompleted === 0 ? 'pending' :
      riskCompleted === riskTotal ? 'completed' :
        'running';

    updatedSteps[3] = {
      ...updatedSteps[3],
      status: riskStepStatus,
      currentActivity: riskStepStatus === 'completed' ? 'Completed' :
        riskStepStatus === 'running' ? 'Risk assessment in progress...' :
          'Awaiting decision',
      agents: [
        {
          ...updatedSteps[3].agents[0],
          status: 'idle',
          lastAction: insights['riskyAnalyst'] ? 'Risk tolerance assessed' : 'Waiting...',
          progress: insights['riskyAnalyst'] ? 100 : 0
        },
        {
          ...updatedSteps[3].agents[1],
          status: 'idle',
          lastAction: insights['safeAnalyst'] ? 'Conservative view analyzed' : 'Waiting...',
          progress: insights['safeAnalyst'] ? 100 : 0
        },
        {
          ...updatedSteps[3].agents[2],
          status: 'idle',
          lastAction: insights['neutralAnalyst'] ? 'Balanced perspective provided' : 'Waiting...',
          progress: insights['neutralAnalyst'] ? 100 : 0
        },
        {
          ...updatedSteps[3].agents[3],
          status: 'idle',
          lastAction: insights['riskManager'] ? 'Risk assessment complete' : 'Waiting...',
          progress: insights['riskManager'] ? 100 : 0
        }
      ]
    };

    // SIMPLIFIED: Portfolio Management - single agent (only for non-rebalance analyses)
    if (!isRebalanceAnalysis) {
      const hasPortfolioData = insights['portfolioManager'];

      // Find the portfolio management step index (it might be at index 4 if not filtered)
      const portfolioStepIndex = updatedSteps.findIndex(s => s.id === 'portfolio-management');
      if (portfolioStepIndex !== -1) {
        updatedSteps[portfolioStepIndex] = {
          ...updatedSteps[portfolioStepIndex],
          status: hasPortfolioData ? 'completed' : 'pending',
          currentActivity: hasPortfolioData ? 'Position sizing complete' : 'Awaiting activation',
          agents: [
            {
              ...updatedSteps[portfolioStepIndex].agents[0],
              status: 'idle',
              lastAction: hasPortfolioData ? 'Position sizing calculated' : 'Waiting...',
              progress: hasPortfolioData ? 100 : 0
            }
          ]
        };
      }
    }

    // Removed override logic - we're using simple agent-based status determination

    // Filter out portfolio management step for rebalance analyses before setting
    const finalSteps = isRebalanceAnalysis
      ? updatedSteps.filter(step =>
        step.id !== 'portfolio-management' &&
        step.id !== 'portfolio' &&
        !step.name.toLowerCase().includes('portfolio'))
      : updatedSteps;

    // Set the workflow data directly - status is already determined by agent completion
    console.log('Final workflow steps before setting:', finalSteps.map(step => ({
      name: step.name,
      status: step.status,
      agents: step.agents.filter(a => a.progress === 100).length + '/' + step.agents.length
    })));
    setWorkflowData(finalSteps);

    // Return the running state
    return isRunning;
  };

  // Helper function to get agent message from various possible agent names
  const getAgentMessage = (insights: any, possibleNames: string[], defaultMessage: string): string => {
    for (const name of possibleNames) {
      if (insights[name]) {
        const message = insights[name];
        return typeof message === 'string' ? message.substring(0, 50) + '...' : defaultMessage;
      }
    }
    return defaultMessage;
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              {isAnalyzing ? 'Analysis Progress' :
                activeAnalysisTicker ? `Most Recent Analysis: ${activeAnalysisTicker}` :
                  'Analysis Progress'}
              {isRebalanceContext && (
                <Badge variant="secondary" className="text-xs font-normal">
                  Rebalance
                </Badge>
              )}
            </CardTitle>
            {isAnalyzing ? (
              <Badge variant="default" className="flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analyzing
              </Badge>
            ) : activeAnalysisTicker && currentAnalysis ? (
              <Badge variant="outline" className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                {currentAnalysis.decision || 'Complete'}
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Stock search bar for starting analysis or show running analysis */}
          <div className="flex items-center justify-center p-2 rounded-lg mb-2 min-h-[36px]">
            {activeAnalysisTicker && isAnalyzing ? (
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center">
                  <Activity className="w-4 h-4 mr-2 animate-pulse text-primary" />
                  <span className="text-sm font-medium">
                    Running analysis for {activeAnalysisTicker}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (activeAnalysisTicker) {
                      setShowAnalysisDetail(true);
                    }
                  }}
                  className="ml-2"
                >
                  <Info className="h-3 w-3 mr-1" />
                  View Details
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 w-full">
                <div className="flex-1">
                  <StockTickerAutocomplete
                    value={searchTicker}
                    onChange={setSearchTicker}
                    placeholder="Enter ticker to analyze"
                    onKeyPress={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' && searchTicker) {
                        handleStartAnalysis();
                      }
                    }}
                  />
                </div>
                <Button
                  onClick={handleStartAnalysis}
                  disabled={!searchTicker || isAnalyzing}
                  size="sm"
                >
                  <Play className="h-4 w-4 mr-1" />
                  Analyze
                </Button>
              </div>
            )}
          </div>

          {/* Horizontal workflow steps */}
          <div className="flex items-center justify-center overflow-hidden">
            {(() => {
              const filteredSteps = isRebalanceContext
                ? workflowData.filter(step =>
                  step.id !== 'portfolio-management' &&
                  step.id !== 'portfolio' &&
                  !step.name.toLowerCase().includes('portfolio'))
                : workflowData;
              console.log('Displaying workflow steps:', {
                isRebalanceContext,
                totalSteps: workflowData.length,
                filteredSteps: filteredSteps.length,
                stepNames: filteredSteps.map(s => s.name)
              });
              return filteredSteps;
            })()
              .map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.id} className="flex items-center">
                    <button
                      onClick={() => setSelectedStep(step)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all hover:bg-muted/50 min-w-[80px] max-w-[80px] ${step.status === 'active' || step.status === 'running' ? 'bg-muted' : ''
                        }`}
                    >
                      <div className="relative">
                        <div className={`p-1.5 rounded-full ${getStatusColor(step.status)}`}>
                          <Icon className="w-3 h-3" />
                        </div>
                        {step.status === 'active' && (
                          <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
                            <div className="text-[10px] font-medium text-primary">
                              {getStepProgress(step)}%
                            </div>
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-medium text-center leading-tight mt-1">{step.name}</span>
                      <div className="flex items-center gap-0.5">
                        {getStatusIcon(step.status)}
                        {step.agents && (
                          <span className="text-[10px] text-muted-foreground">
                            {step.agents.filter(a => a.progress === 100).length}/{step.agents.length}
                          </span>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
          </div>

          {/* Expandable agent status details */}
          <div className="border-t pt-4">
            <button
              onClick={() => setExpandedAgents(!expandedAgents)}
              className="flex items-center justify-between w-full text-sm font-medium hover:text-primary transition-colors"
            >
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Agent Status Details
              </span>
              {expandedAgents ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {expandedAgents && (
              <div className="mt-4 space-y-4">
                {(isRebalanceContext
                  ? workflowData.filter(step =>
                    step.id !== 'portfolio-management' &&
                    step.id !== 'portfolio' &&
                    !step.name.toLowerCase().includes('portfolio'))
                  : workflowData)
                  .map((step) => (
                    <div key={step.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className={`text-sm font-semibold ${getStageStatusColor(step.status)}`}>
                            {step.name}
                          </h4>
                          {step.description && (
                            <p className="text-xs text-muted-foreground">{step.description}</p>
                          )}
                        </div>
                        <Badge
                          variant={
                            step.status === 'completed' ? 'default' :
                              step.status === 'active' ? 'default' :
                                step.status === 'running' ? 'secondary' :
                                  'outline'
                          }
                          className={`text-xs ${step.status === 'completed' ? 'bg-green-500/10 text-green-600 border-green-500/50' :
                              step.status === 'running' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/50' :
                                ''
                            }`}
                        >
                          {step.status}
                        </Badge>
                      </div>

                      <div className="space-y-2 ml-2">
                        {step.agents.map((agent) => {
                          const AgentIcon = agent.icon;
                          return (
                            <div
                              key={agent.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50"
                            >
                              <div className="flex items-center gap-2">
                                <AgentIcon className="h-3 w-3 text-muted-foreground" />
                                <div className="flex-1">
                                  <p className="text-xs font-medium text-foreground">{agent.name}</p>
                                  <p className="text-xs text-muted-foreground">{agent.lastAction}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {agent.status === 'processing' ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                ) : agent.progress === 100 ? (
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                )}
                                {agent.progress !== undefined && agent.progress > 0 && (
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all duration-500 ${agent.status === 'processing' ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
                                        }`}
                                      style={{ width: `${agent.progress}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">
                    {isAnalyzing ? (
                      <>Full cycle in progress • ~5-10 minutes</>
                    ) : activeAnalysisTicker ? (
                      <>Analysis completed for {activeAnalysisTicker}</>
                    ) : (
                      <>Ready to analyze • LangGraph orchestrated</>
                    )}
                    {isRebalanceContext && (
                      <> • Rebalance mode (Portfolio Manager runs at rebalance level)</>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedStep} onOpenChange={() => setSelectedStep(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedStep && (
                <>
                  <selectedStep.icon className="w-5 h-5" />
                  {selectedStep.name}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedStep?.details}
            </DialogDescription>
          </DialogHeader>

          {selectedStep && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Active Agents</h4>
                <div className="space-y-2">
                  {selectedStep.agents.map((agent) => {
                    const AgentIcon = agent.icon;
                    return (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                      >
                        <div className="flex items-center gap-3">
                          <AgentIcon className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{agent.name}</p>
                            <p className="text-xs text-muted-foreground">{agent.lastAction}</p>
                          </div>
                        </div>
                        {agent.progress !== undefined && (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${agent.status === 'processing' ? 'bg-blue-500' : 'bg-green-500'
                                  }`}
                                style={{ width: `${agent.progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{agent.progress}%</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Current Activity</h4>
                <div className="flex items-center gap-2">
                  <div className={`p-1 rounded-full ${getStatusColor(selectedStep.status)}`}>
                    {getStatusIcon(selectedStep.status)}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {selectedStep.currentActivity}
                  </span>
                </div>
              </div>

              {selectedStep.insights && selectedStep.insights.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Key Insights</h4>
                  <div className="space-y-2">
                    {selectedStep.insights.map((insight, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                        <span className="text-sm">{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Status: {selectedStep.status}</span>
                  <span>Last updated: 2 minutes ago</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Analysis Detail Modal */}
      {activeAnalysisTicker && (
        <AnalysisDetailModal
          ticker={activeAnalysisTicker}
          isOpen={showAnalysisDetail}
          onClose={() => setShowAnalysisDetail(false)}
          analysisId={currentAnalysis?.id}
        />
      )}
    </>
  );
}