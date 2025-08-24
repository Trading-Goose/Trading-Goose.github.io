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
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
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
  Briefcase,
  RefreshCw
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRBAC } from "@/hooks/useRBAC";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { analysisManager } from "@/lib/analysisManager";
import type { WorkflowStep as EngineWorkflowStep } from "@/lib/tradingEngine";
import StockTickerAutocomplete from "@/components/StockTickerAutocomplete";
import { useToast } from "@/hooks/use-toast";
import AnalysisDetailModal from "@/components/AnalysisDetailModal";
import {
  type AnalysisStatus,
  ANALYSIS_STATUS,
  convertLegacyAnalysisStatus,
  isAnalysisActive,
  isRebalanceActive
} from "@/lib/statusTypes";

interface Agent {
  id: string;
  name: string;
  icon: any;
  status: 'pending' | 'running' | 'completed' | 'error';
  lastAction: string;
  progress?: number;
}

interface WorkflowStep {
  id: string;
  name: string;
  icon: any;
  status: 'pending' | 'running' | 'completed' | 'error';
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
    details: 'Five specialized analysts process data sequentially based on configuration. Each analyst has dedicated tools and clears messages before the next begins.',
    description: 'Sequential processing',
    agents: [
      {
        id: '1',
        name: 'Macro Analyst',
        icon: BarChart3,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '2',
        name: 'Market Analyst',
        icon: TrendingUp,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '3',
        name: 'Social Media Analyst',
        icon: Hash,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '4',
        name: 'News Analyst',
        icon: Search,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '5',
        name: 'Fundamentals Analyst',
        icon: Brain,
        status: 'pending',
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
        id: '6',
        name: 'Bull Researcher',
        icon: MessageSquare,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '7',
        name: 'Bear Researcher',
        icon: MessageSquare,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '8',
        name: 'Research Manager',
        icon: Users,
        status: 'pending',
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
        id: '9',
        name: 'Trader',
        icon: Activity,
        status: 'pending',
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
        id: '10',
        name: 'Risky Analyst',
        icon: TrendingUp,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '11',
        name: 'Safe Analyst',
        icon: Shield,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '12',
        name: 'Neutral Analyst',
        icon: Brain,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '13',
        name: 'Risk Judge',
        icon: Gavel,
        status: 'pending',
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
        id: '14',
        name: 'Portfolio Manager',
        icon: Briefcase,
        status: 'pending',
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
    case 'running':
      return 'text-yellow-500 bg-yellow-500/10';
    case 'error':
      return 'text-red-500 bg-red-500/10';
    case 'pending':
      return 'text-gray-500 bg-gray-500/10';
    default:
      return 'text-gray-500';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-3 h-3 text-green-500" />;
    case 'running':
      return <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />;
    case 'error':
      return <AlertCircle className="w-3 h-3 text-red-500" />;
    case 'pending':
      return <Clock className="w-3 h-3 text-gray-500" />;
    default:
      return null;
  }
};

const getStepProgress = (step: WorkflowStep): number => {
  if (step.status === 'completed') return 100;

  // Always calculate actual progress, even for pending/running status
  const totalAgents = step.agents.length;
  if (totalAgents === 0) return 0;

  const completedAgents = step.agents.filter(a => a.status === 'completed').length;
  const activeAgent = step.agents.find(a => a.status === 'running');

  const baseProgress = (completedAgents / totalAgents) * 100;
  const activeProgress = activeAgent ? (activeAgent.progress || 0) / totalAgents : 0;

  return Math.round(baseProgress + activeProgress);
};

const getStageStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-500';
    case 'running':
      return 'text-yellow-500';
    case 'error':
      return 'text-red-500';
    case 'pending':
      return 'text-gray-500';
    default:
      return 'text-gray-500';
  }
};

export default function HorizontalWorkflow() {
  const { user, apiSettings } = useAuth();
  const { getMaxParallelAnalysis } = useRBAC();
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
  const [runningAnalysesCount, setRunningAnalysesCount] = useState(0);
  const [showLimitAlert, setShowLimitAlert] = useState(false);
  const [showRebalanceAlert, setShowRebalanceAlert] = useState(false);
  const [hasRunningRebalance, setHasRunningRebalance] = useState(false);

  const maxParallelAnalysis = getMaxParallelAnalysis();

  // Check for running rebalances
  useEffect(() => {
    const checkRunningRebalance = async () => {
      if (!user) return;

      try {
        const { data: rebalanceData } = await supabase
          .from('rebalance_requests')
          .select('id, status')
          .eq('user_id', user.id);

        if (rebalanceData) {
          const hasRunning = rebalanceData.some(item =>
            isRebalanceActive(item.status)
          );
          setHasRunningRebalance(hasRunning);
        }
      } catch (error) {
        console.error('Error checking running rebalance:', error);
      }
    };

    checkRunningRebalance();
    const interval = setInterval(checkRunningRebalance, 10000);
    return () => clearInterval(interval);
  }, [user]);

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

    // Check if there's a running rebalance
    if (hasRunningRebalance) {
      setShowRebalanceAlert(true);
      return;
    }

    // Check if we've reached the parallel analysis limit
    if (runningAnalysesCount >= maxParallelAnalysis) {
      setShowLimitAlert(true);
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
          // Check both legacy numeric status and new string status
          // Also filter out cancelled analyses
          const { data, error } = await supabase
            .from('analysis_history')
            .select('ticker, analysis_status, full_analysis, created_at, id, decision, agent_insights, rebalance_request_id, is_canceled')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

          if (!error && data) {
            // Filter to only actually running analyses using centralized logic
            const runningData = data.filter(item => {
              // Convert legacy numeric status if needed
              const currentStatus = typeof item.analysis_status === 'number'
                ? convertLegacyAnalysisStatus(item.analysis_status)
                : item.analysis_status;

              // Skip cancelled analyses (check both flag and status)
              if (item.is_canceled || currentStatus === ANALYSIS_STATUS.CANCELLED) {
                return false;
              }

              // Use centralized logic to check if analysis is active
              const isRunning = isAnalysisActive(currentStatus);
              return isRunning;
            });

            // Only log if there are actually running analyses
            if (runningData.length > 0) {
              console.log('Running analyses from DB:', runningData.map(d => ({
                ticker: d.ticker,
                status: d.analysis_status
              })));
            }
            for (const item of runningData) {
              running.add(item.ticker);
            }

            // Update the count of running analyses
            setRunningAnalysesCount(running.size);

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
            .eq('is_canceled', false)
            .in('ticker', justCompleted)
            .neq('analysis_status', ANALYSIS_STATUS.CANCELLED)
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
            .neq('analysis_status', ANALYSIS_STATUS.CANCELLED)
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
    if (agentName.includes('Macro')) return BarChart3;
    if (agentName.includes('Market') && !agentName.includes('Macro')) return TrendingUp;
    if (agentName.includes('Social')) return Hash;
    if (agentName.includes('News')) return Search;
    if (agentName.includes('Fundamental')) return Brain;
    if (agentName.includes('Bull') || agentName.includes('Bear')) return MessageSquare;
    if (agentName.includes('Manager')) return Users;
    if (agentName.includes('Trader')) return TrendingUp;
    if (agentName.includes('Risk')) return Shield;
    return Brain;
  };

  // Helper function to get agent status (hybrid approach)
  const getAgentStatus = (agentKey: string, stepId: string, analysis: any) => {
    // Check if analysis is cancelled
    const isAnalysisCancelled = analysis.analysis_status === ANALYSIS_STATUS.CANCELLED ||
      analysis.is_canceled;

    const insights = analysis.agent_insights || {};

    // Debug logging for research agents
    if (agentKey.toLowerCase().includes('bull') || agentKey.toLowerCase().includes('bear') || agentKey.toLowerCase().includes('research')) {
      console.log(`Agent status check for ${agentKey}:`, {
        hasInsight: !!insights[agentKey],
        hasError: !!insights[agentKey + '_error'],
        insightKeys: Object.keys(insights).filter(k => k.toLowerCase().includes(agentKey.toLowerCase().substring(0, 4)))
      });
    }

    // HYBRID APPROACH: Check agent_insights for completion (most reliable), workflow steps for running status

    // First check agent_insights for completion and errors (most reliable)
    if (insights) {
      // Check for error conditions first
      if (insights[agentKey + '_error']) {
        return 'failed';
      }
      // Then check for normal completion
      if (insights[agentKey]) {
        return 'completed';
      }
    }

    // Then check workflow steps for running status (when agents are actively working)
    if (analysis.full_analysis?.workflowSteps) {
      for (const step of analysis.full_analysis.workflowSteps) {
        // Find the agent in workflow steps by matching names
        const agent = step.agents?.find((a: any) => {
          const agentNameLower = a.name.toLowerCase().replace(/\s+/g, '');
          const keyLower = agentKey.toLowerCase();

          // Debug logging for matching
          if (step.id === 'research' || step.id === 'research-debate') {
            console.log(`Matching agent in workflow: agent="${a.name}", agentNameLower="${agentNameLower}", keyLower="${keyLower}"`);
          }

          // Direct name matching patterns
          if (agentNameLower.includes('macro') && keyLower.includes('macro')) return true;
          if (agentNameLower.includes('market') && keyLower.includes('market') && !keyLower.includes('macro')) return true;
          if (agentNameLower.includes('news') && keyLower.includes('news')) return true;
          if (agentNameLower.includes('social') && keyLower.includes('social')) return true;
          if (agentNameLower.includes('fundamentals') && keyLower.includes('fundamentals')) return true;
          // Research debate agents - handle both with and without spaces
          if (agentNameLower.includes('bullresearcher') && keyLower.includes('bull')) return true;
          if (agentNameLower.includes('bearresearcher') && keyLower.includes('bear')) return true;
          if (agentNameLower.includes('researchmanager') && keyLower.includes('researchmanager')) return true;
          if (agentNameLower.includes('trader') && keyLower.includes('trader')) return true;
          if (agentNameLower.includes('risky') && keyLower.includes('risky')) return true;
          if (agentNameLower.includes('safe') && keyLower.includes('safe')) return true;
          if (agentNameLower.includes('neutral') && keyLower.includes('neutral')) return true;
          if (agentNameLower.includes('riskmanager') && keyLower.includes('riskmanager')) return true;
          if (agentNameLower.includes('portfoliomanager') && keyLower.includes('portfolio')) return true;

          return false;
        });

        if (agent) {
          // If cancelled, convert 'running' or 'processing' to 'pending', but keep 'completed'
          if (isAnalysisCancelled && (agent.status === 'running' || agent.status === 'processing')) {
            return 'pending';
          }
          // Only return workflow status if it's an active state (running/processing/error)
          if (agent.status === 'running' || agent.status === 'processing') return 'running';
          if (agent.status === 'error' || agent.status === 'failed') return 'failed';
        }
      }
    }

    return 'pending';
  };

  // Update workflow based on analysis data using unified agent status checking
  // Returns true if the analysis is still running, false if complete
  const updateWorkflowFromAnalysis = (analysis: any): boolean => {
    if (!analysis) return false;

    // Check if this is a rebalance analysis
    const isRebalanceAnalysis = !!analysis.rebalance_request_id;

    console.log('Analysis type check:', {
      ticker: analysis.ticker,
      rebalance_request_id: analysis.rebalance_request_id,
      isRebalanceAnalysis,
      analysis_status: analysis.analysis_status
    });

    // Update the rebalance context state
    setIsRebalanceContext(isRebalanceAnalysis);

    // Convert legacy numeric status if needed for proper checking
    const currentStatus = typeof analysis.analysis_status === 'number'
      ? convertLegacyAnalysisStatus(analysis.analysis_status)
      : analysis.analysis_status;

    // Check if analysis is cancelled - if so, don't display it
    if (currentStatus === ANALYSIS_STATUS.CANCELLED || analysis.is_canceled) {
      console.log('Analysis is cancelled, not displaying workflow');
      return false; // Don't show cancelled analyses
    }

    // Determine completion using simple analysis status
    const isCompleted = currentStatus === ANALYSIS_STATUS.COMPLETED;
    const isRunning = !isCompleted && (currentStatus === ANALYSIS_STATUS.RUNNING || currentStatus === ANALYSIS_STATUS.PENDING);


    // Build workflow steps using unified agent status checking
    let baseSteps = getInitialWorkflowSteps();

    // Filter out portfolio management step for rebalance analyses
    if (isRebalanceAnalysis) {
      baseSteps = baseSteps.filter(step =>
        step.id !== 'portfolio-management' &&
        step.id !== 'portfolio' &&
        !step.name.toLowerCase().includes('portfolio')
      );
    }

    // Update each step using unified agent status checking
    const updatedSteps = baseSteps.map((step) => {
      // Map step agents to their respective agent keys for status checking
      const agentStatusMapping = {
        'analysis': [
          { agent: step.agents[0], key: 'macroAnalyst' },
          { agent: step.agents[1], key: 'marketAnalyst' },
          { agent: step.agents[2], key: 'socialMediaAnalyst' },
          { agent: step.agents[3], key: 'newsAnalyst' },
          { agent: step.agents[4], key: 'fundamentalsAnalyst' }
        ],
        'research-debate': [
          { agent: step.agents[0], key: 'bullResearcher' },
          { agent: step.agents[1], key: 'bearResearcher' },
          { agent: step.agents[2], key: 'researchManager' }
        ],
        'trading-decision': [
          { agent: step.agents[0], key: 'trader' }
        ],
        'risk-assessment': [
          { agent: step.agents[0], key: 'riskyAnalyst' },
          { agent: step.agents[1], key: 'safeAnalyst' },
          { agent: step.agents[2], key: 'neutralAnalyst' },
          { agent: step.agents[3], key: 'riskManager' }
        ],
        'portfolio-management': [
          { agent: step.agents[0], key: 'portfolioManager' }
        ]
      };

      const stepMappings = agentStatusMapping[step.id as keyof typeof agentStatusMapping] || [];

      // Update each agent using unified status checking
      const updatedAgents = stepMappings.map(({ agent, key }) => {
        const status = getAgentStatus(key, step.id, analysis);
        
        const agentStatus: Agent['status'] = status === 'completed' ? 'completed' : 
          status === 'running' ? 'running' : 
          status === 'failed' ? 'error' : 'pending';

        // Debug for research agents
        if (step.id === 'research-debate') {
          console.log(`Agent status for ${agent.name} (key: ${key}):`, status, '→', agentStatus);
        }

        return {
          ...agent,
          status: agentStatus,
          lastAction: status === 'completed' ? 'Analysis complete' :
            status === 'running' ? 'Analyzing...' :
              status === 'failed' ? 'Failed' :
                'Waiting...',
          progress: status === 'completed' ? 100 : status === 'failed' ? 0 : (status === 'running' ? 50 : 0)
        };
      });

      // Calculate step status based on agent statuses
      const completedAgents = updatedAgents.filter(a => a.status === 'completed').length;
      const runningAgents = updatedAgents.filter(a => a.status === 'running').length;
      const totalAgents = updatedAgents.length;

      // Debug logging for research-debate step
      if (step.id === 'research-debate') {
        console.log('Research Debate step status calculation:', {
          stepId: step.id,
          agents: updatedAgents.map(a => ({ name: a.name, status: a.status })),
          completedAgents,
          runningAgents,
          totalAgents
        });
      }

      // Improved step status logic:
      // - If all agents are complete, step is complete
      // - If any agents are running, step is running
      // - If some agents are complete but not all (and none running), step is still running (in progress between agents)
      // - Only if no agents have started is the step pending
      const stepStatus: WorkflowStep['status'] = completedAgents === totalAgents ? 'completed' :
        runningAgents > 0 ? 'running' :
        completedAgents > 0 ? 'running' : 'pending';

      return {
        ...step,
        status: stepStatus,
        currentActivity: stepStatus === 'completed' ? 'Completed' :
          stepStatus === 'running' ? 'Processing...' : 'Pending',
        agents: updatedAgents
      };
    });

    setWorkflowData(updatedSteps);
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
              <form onSubmit={(e) => { e.preventDefault(); handleStartAnalysis(); }} className="flex gap-2 w-full">
                <div className="flex-1">
                  <StockTickerAutocomplete
                    value={searchTicker}
                    onChange={setSearchTicker}
                    placeholder="Enter ticker to analyze"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!searchTicker || isAnalyzing}
                  size="sm"
                >
                  <Play className="h-4 w-4 mr-1" />
                  Analyze
                </Button>
              </form>
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
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all hover:bg-muted/50 min-w-[80px] max-w-[80px] ${step.status === 'running' ? 'bg-muted' : ''
                        }`}
                    >
                      <div className="relative">
                        <div className={`p-1.5 rounded-full ${getStatusColor(step.status)}`}>
                          <Icon className="w-3 h-3" />
                        </div>
                        {step.status === 'running' && (
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
                            {step.agents.filter(a => a.status === 'completed').length}/{step.agents.length}
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
                              step.status === 'running' ? 'secondary' :
                                step.status === 'error' ? 'destructive' :
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
                                {agent.status === 'running' ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
                                ) : agent.status === 'error' ? (
                                  <AlertCircle className="h-3 w-3 text-red-500" />
                                ) : agent.status === 'completed' ? (
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Clock className="h-3 w-3 text-gray-500" />
                                )}
                                {agent.progress !== undefined && agent.progress > 0 && (
                                  <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all ${agent.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                                        agent.status === 'error' ? 'bg-red-500' : 'bg-green-500'
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
                                className={`h-full transition-all ${agent.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                                  agent.status === 'error' ? 'bg-red-500' : 'bg-green-500'
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

      {/* Limit Reached Alert Dialog */}
      <AlertDialog open={showLimitAlert} onOpenChange={setShowLimitAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Analysis Limit Reached
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You have reached your maximum limit of {maxParallelAnalysis} parallel {maxParallelAnalysis === 1 ? 'analysis' : 'analyses'}.
              </p>
              <p>
                Currently {runningAnalysesCount} {runningAnalysesCount === 1 ? 'analysis is' : 'analyses are'} running. Please wait for one to complete before starting another.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowLimitAlert(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rebalance Running Alert Dialog */}
      <AlertDialog open={showRebalanceAlert} onOpenChange={setShowRebalanceAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-yellow-500 animate-spin" />
              Portfolio Rebalance in Progress
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                A portfolio rebalance is currently running. Individual stock analyses are temporarily disabled during rebalancing.
              </p>
              <p>
                Please wait for the rebalance to complete before starting new analyses.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowRebalanceAlert(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}