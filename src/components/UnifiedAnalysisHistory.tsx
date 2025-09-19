import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Loader2, RefreshCw, Eye, Trash2, MoreVertical, StopCircle, Users, MessageSquare, AlertCircle, Package, Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatDistanceToNow } from "date-fns";
import AnalysisDetailModal from "./AnalysisDetailModal";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type AnalysisStatus,
  ANALYSIS_STATUS,
  convertLegacyAnalysisStatus,
  isAnalysisActive,
  isAnalysisFinished,
  getStatusDisplayText
} from "@/lib/statusTypes";

interface AnalysisHistoryItem {
  id: string;
  ticker: string;
  analysis_date: string;
  decision: 'BUY' | 'SELL' | 'HOLD' | 'CANCELED' | 'ERROR';
  confidence: number;
  agent_insights: {
    market?: string;
    news?: string;
    sentiment?: string;
    fundamentals?: string;
    risk?: string;
    [key: string]: any;
  };
  full_analysis?: any;
  created_at: string;
  analysis_status?: AnalysisStatus | number; // Support both new and legacy formats
}

interface RunningAnalysisItem {
  id: string;
  ticker: string;
  created_at: string;
  full_analysis?: any;  // Add to store progress data
  agent_insights?: any;  // Add to access agent completion data
  rebalance_request_id?: string;  // To check if part of rebalance
  status?: AnalysisStatus;  // To distinguish between pending and running
}

interface RebalanceAnalysisGroup {
  id: string;
  createdAt: string;
  status: string;
  analyses: AnalysisHistoryItem[];
}

// Calculate agent completion percentage for a single analysis
// Similar to how GitHub Actions tracks workflow steps
const calculateAgentCompletion = (analysisItem: any, isRebalanceAnalysis: boolean = false): number => {
  if (!analysisItem) return 0;

  let totalAgents = 0;
  let completedAgents = 0;

  // Primary method: Check workflow_steps structure (similar to GitHub Actions)
  // This is the most reliable way as it mirrors the workflow visualization
  if (analysisItem.full_analysis?.workflow_steps) {
    const workflowSteps = analysisItem.full_analysis.workflow_steps;
    
    // Iterate through all phases and count agents
    Object.keys(workflowSteps).forEach(phase => {
      // Skip portfolio phase for rebalance analyses
      if (phase === 'portfolio' && isRebalanceAnalysis) {
        return;
      }
      
      const phaseData = workflowSteps[phase];
      if (phaseData?.agents && Array.isArray(phaseData.agents)) {
        phaseData.agents.forEach((agent: any) => {
          totalAgents++;
          // Check if agent is completed (similar to GitHub Actions step status)
          if (agent.status === 'completed' || agent.status === 'complete') {
            completedAgents++;
          }
        });
      }
    });
    
    // Return percentage if we found agents
    if (totalAgents > 0) {
      return Math.round((completedAgents / totalAgents) * 100);
    }
  }

  // Fallback method: Count agent_insights (for when workflow_steps is not available)
  // This counts completed agents by checking which ones have insights
  if (analysisItem.agent_insights && typeof analysisItem.agent_insights === 'object') {
    const insightKeys = Object.keys(analysisItem.agent_insights);
    
    // Count valid agent insights (non-empty values)
    completedAgents = insightKeys.filter(key => {
      const value = analysisItem.agent_insights[key];
      return value !== null && value !== undefined && value !== '';
    }).length;
    
    // Use a reasonable estimate for total agents
    // Based on the workflow: 5 analysis + 3 research + 1 trader + 4 risk + 1 portfolio
    totalAgents = isRebalanceAnalysis ? 13 : 14;
    
    if (completedAgents > 0) {
      // Don't exceed 100%
      return Math.min(Math.round((completedAgents / totalAgents) * 100), 100);
    }
  }

  // If no data available, return 0
  return 0;
};

export default function UnifiedAnalysisHistory() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [runningAnalyses, setRunningAnalyses] = useState<RunningAnalysisItem[]>([]);
  const [canceledAnalyses, setCanceledAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true); // Start with loading true
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedAnalysisDate, setSelectedAnalysisDate] = useState<string | null>(null);
  const [selectedViewAnalysisId, setSelectedViewAnalysisId] = useState<string | null>(null); // For viewing specific analysis
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [selectedAnalysisTicker, setSelectedAnalysisTicker] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Date filter states - default to today (using local date to avoid timezone issues)
  const today = new Date();
  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [selectedDate, setSelectedDate] = useState<string>(todayString);

  // Track if initial data has been loaded
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Filtered data
  const [filteredHistory, setFilteredHistory] = useState<AnalysisHistoryItem[]>([]);
  const [filteredCanceled, setFilteredCanceled] = useState<AnalysisHistoryItem[]>([]);

  // No longer need client-side filtering - data comes filtered from DB

  // Helper to format date display
  const getDateDisplay = () => {
    const today = new Date();
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayString = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (selectedDate === todayString) return "Today";
    if (selectedDate === yesterdayString) return "Yesterday";

    // Parse the date parts to avoid timezone issues
    const [year, month, day] = selectedDate.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const loadAllAnalyses = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Build date range for the selected date using local date parsing
      const [year, month, day] = selectedDate.split('-').map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      // Query only analyses from the selected date
      const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('user_id', user.id)
        .gte('created_at', startOfDay.toISOString())
        .lte('created_at', endOfDay.toISOString())
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading analyses:', error);

        // Handle 500 errors gracefully - don't throw, just return
        if (error.message?.includes('500') || error.code === '500') {
          console.log('Server error, skipping update');
          return;
        }

        // Handle authentication errors
        if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
          console.log('JWT error detected, will attempt refresh on next poll');
          // Try to refresh the session
          supabase.auth.refreshSession().catch(err => {
            console.error('Failed to refresh session:', err);
          });
          return;
        }

        throw error;
      }

      // Separate running, completed, and canceled analyses based on database data
      const runningAnalyses: RunningAnalysisItem[] = [];
      const completedAnalyses: AnalysisHistoryItem[] = [];
      const canceledAnalyses: AnalysisHistoryItem[] = [];

      for (const item of data || []) {
        // Use analysis_status field if available, otherwise fall back to old logic
        if ('analysis_status' in item) {
          // Convert legacy numeric status to new string format
          const status: AnalysisStatus = typeof item.analysis_status === 'number'
            ? convertLegacyAnalysisStatus(item.analysis_status)
            : item.analysis_status as AnalysisStatus;

          if (status === ANALYSIS_STATUS.RUNNING || status === ANALYSIS_STATUS.PENDING) {
            runningAnalyses.push({
              id: item.id,
              ticker: item.ticker,
              created_at: item.created_at,
              full_analysis: item.full_analysis,
              agent_insights: item.agent_insights,  // Add this!
              rebalance_request_id: item.rebalance_request_id,
              status: status
            });
          } else if (status === ANALYSIS_STATUS.COMPLETED) {
            completedAnalyses.push(item);
          } else if (status === ANALYSIS_STATUS.ERROR || status === ANALYSIS_STATUS.CANCELLED) {
            // Show canceled/error analyses in the canceled section
            canceledAnalyses.push({
              ...item,
              decision: status === ANALYSIS_STATUS.ERROR ? 'ERROR' : 'CANCELED',
              confidence: item.confidence || 0
            });
          }
        } else {
          // Fall back to old logic for backward compatibility
          const hasAgentInsights = item.agent_insights && Object.keys(item.agent_insights).length > 0;
          const isRunning = item.analysis_status === ANALYSIS_STATUS.RUNNING ||
            (item.confidence === 0 && !hasAgentInsights);

          if (isRunning) {
            runningAnalyses.push({
              id: item.id,
              ticker: item.ticker,
              created_at: item.created_at,
              full_analysis: item.full_analysis,
              rebalance_request_id: item.rebalance_request_id,
              status: ANALYSIS_STATUS.RUNNING  // Default to running for fallback logic
            });
          } else if ((item.confidence > 0 || hasAgentInsights) && item.decision && ['BUY', 'SELL', 'HOLD'].includes(item.decision)) {
            completedAnalyses.push(item);
          }
        }
      }

      setRunningAnalyses(runningAnalyses);
      setHistory(completedAnalyses);
      setCanceledAnalyses(canceledAnalyses);

      // No need for client-side filtering anymore - data is already filtered from DB
      setFilteredHistory(completedAnalyses);
      setFilteredCanceled(canceledAnalyses);
    } catch (error) {
      console.error('Error loading analysis history:', error);
      if (!loading) { // Only show toast if not initial load
        toast({
          title: "Error Loading History",
          description: "Failed to load analysis history. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      loadAllAnalyses();
    } else {
      setHistory([]);
      setRunningAnalyses([]);
      setCanceledAnalyses([]);
      setFilteredHistory([]);
      setFilteredCanceled([]);
      setLoading(false);
    }
  }, [isAuthenticated, user, selectedDate]); // Reload when selectedDate changes

  // Only poll for running analyses updates, not the entire list
  useEffect(() => {
    if (!user || !initialLoadComplete) return;

    // Only set up polling if there are actually running analyses
    if (runningAnalyses.length === 0) return;

    let intervalId: NodeJS.Timeout;

    // Much slower polling - every 15 seconds instead of 3-5 seconds
    // Users can manually refresh if they want faster updates
    intervalId = setInterval(async () => {
      try {
        // Only check status of running analyses, don't reload everything
        const runningIds = runningAnalyses.map(a => a.id);
        
        // Build date range for the selected date
        const [year, month, day] = selectedDate.split('-').map(Number);
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

        // Only fetch the specific running analyses to check their status
        const { data, error } = await supabase
          .from('analysis_history')
          .select('*')
          .eq('user_id', user.id)
          .in('id', runningIds)
          .gte('created_at', startOfDay.toISOString())
          .lte('created_at', endOfDay.toISOString());

        if (!error && data) {
          // Check if any running analyses have completed
          const stillRunning: RunningAnalysisItem[] = [];
          const newlyCompleted: AnalysisHistoryItem[] = [];

          for (const item of data) {
            const status: AnalysisStatus = typeof item.analysis_status === 'number'
              ? convertLegacyAnalysisStatus(item.analysis_status)
              : item.analysis_status as AnalysisStatus;

            if (status === ANALYSIS_STATUS.RUNNING || status === ANALYSIS_STATUS.PENDING) {
              const existingItem = runningAnalyses.find(r => r.id === item.id);
              if (existingItem) {
                stillRunning.push({
                  ...existingItem,
                  full_analysis: item.full_analysis,
                  agent_insights: item.agent_insights,
                });
              }
            } else if (status === ANALYSIS_STATUS.COMPLETED) {
              newlyCompleted.push(item);
            }
          }

          // Only update state if something actually changed
          if (stillRunning.length !== runningAnalyses.length || newlyCompleted.length > 0) {
            setRunningAnalyses(stillRunning);
            if (newlyCompleted.length > 0) {
              setHistory(prev => [...newlyCompleted, ...prev]);
              setFilteredHistory(prev => [...newlyCompleted, ...prev]);
            }
          }
        }
      } catch (error) {
        console.error('Error checking running analyses:', error);
      }
    }, 15000); // Poll every 15 seconds instead of 3-5 seconds

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [user, runningAnalyses.length, selectedDate, initialLoadComplete]); // Keep minimal dependencies

  const viewRunningAnalysis = (ticker: string) => {
    setSelectedTicker(ticker);
    setSelectedAnalysisDate(null);
    setSelectedViewAnalysisId(null);
  };

  const viewDetails = (analysis: AnalysisHistoryItem) => {
    // Use analysis ID for viewing specific analysis
    setSelectedViewAnalysisId(analysis.id);
    setSelectedTicker(null);
    setSelectedAnalysisDate(null);
  };

  const cancelAnalysis = async (analysisId: string, ticker: string) => {
    if (!user) return;

    setCancelling(true);
    try {
      // Cancel the analysis by updating database status
      // First get the current analysis to preserve existing messages
      const { data: currentAnalysis } = await supabase
        .from('analysis_history')
        .select('full_analysis')
        .eq('id', analysisId)
        .eq('user_id', user.id)
        .single();

      const existingMessages = currentAnalysis?.full_analysis?.messages || [];

      // Mark the analysis as canceled and preserve existing messages
      const { error } = await supabase
        .from('analysis_history')
        .update({
          analysis_status: ANALYSIS_STATUS.CANCELLED,
          full_analysis: {
            ...currentAnalysis?.full_analysis,
            status: 'error',
            completedAt: new Date().toISOString(),
            canceledAt: new Date().toISOString(),
            currentPhase: 'Canceled by user',
            error: 'Analysis cancelled by user',
            messages: [
              ...existingMessages,
              {
                agent: 'System',
                message: 'Analysis was canceled by user',
                timestamp: new Date().toISOString(),
                type: 'error'
              }
            ]
          }
        })
        .eq('id', analysisId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Find the running analysis to get its created_at
      const runningItem = runningAnalyses.find(item => item.id === analysisId);
      
      // Move from running to canceled list
      setRunningAnalyses(prev => prev.filter(item => item.id !== analysisId));
      
      // Add to cancelled list with the updated data
      const cancelledItem: AnalysisHistoryItem = {
        id: analysisId,
        ticker: ticker,
        analysis_date: new Date().toISOString(),
        decision: 'CANCELED',
        confidence: 0,
        agent_insights: runningItem?.agent_insights || currentAnalysis?.full_analysis?.agent_insights || {},
        full_analysis: {
          ...currentAnalysis?.full_analysis,
          status: 'error',
          completedAt: new Date().toISOString(),
          canceledAt: new Date().toISOString(),
          currentPhase: 'Canceled by user',
          error: 'Analysis cancelled by user',
          messages: [
            ...existingMessages,
            {
              agent: 'System',
              message: 'Analysis was canceled by user',
              timestamp: new Date().toISOString(),
              type: 'error'
            }
          ]
        },
        created_at: runningItem?.created_at || new Date().toISOString(),
        analysis_status: ANALYSIS_STATUS.CANCELLED
      };
      
      setCanceledAnalyses(prev => [cancelledItem, ...prev]);
      setFilteredCanceled(prev => [cancelledItem, ...prev]);

      toast({
        title: "Analysis Cancelled",
        description: `Analysis for ${ticker} has been cancelled and moved to canceled history.`,
      });

      setShowCancelDialog(false);
      setSelectedAnalysisId(null);
      setSelectedAnalysisTicker(null);

      // Don't refresh - state is already updated

      // Close modal if this analysis was being viewed
      if (selectedTicker === ticker || selectedViewAnalysisId === analysisId) {
        setSelectedTicker(null);
        setSelectedAnalysisDate(null);
        setSelectedViewAnalysisId(null);
      }
    } catch (error) {
      console.error('Error cancelling analysis:', error);
      toast({
        title: "Cancel Failed",
        description: error instanceof Error ? error.message : "Failed to cancel analysis",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  const deleteAnalysis = async (analysisId: string, ticker: string) => {
    if (!user) return;

    setDeleting(true);
    try {
      const { error: tradeDeleteError } = await supabase
        .from('trading_actions')
        .delete()
        .eq('analysis_id', analysisId)
        .eq('user_id', user.id);

      if (tradeDeleteError) throw tradeDeleteError;

      const { error } = await supabase
        .from('analysis_history')
        .delete()
        .eq('id', analysisId)
        .eq('user_id', user.id);

      if (error) throw error;

      setHistory(prev => prev.filter(item => item.id !== analysisId));
      setRunningAnalyses(prev => prev.filter(item => item.id !== analysisId));
      setCanceledAnalyses(prev => prev.filter(item => item.id !== analysisId));
      
      // Also update filtered lists to reflect the deletion immediately
      setFilteredHistory(prev => prev.filter(item => item.id !== analysisId));
      setFilteredCanceled(prev => prev.filter(item => item.id !== analysisId));

      toast({
        title: "Analysis Deleted",
        description: `Analysis for ${ticker} has been deleted successfully.`,
      });

      setShowDeleteDialog(false);
      setSelectedAnalysisId(null);
      setSelectedAnalysisTicker(null);

      // Close modal if this analysis was being viewed
      const deletedItem = history.find(item => item.id === analysisId);
      if (deletedItem && (selectedTicker === deletedItem.ticker || selectedViewAnalysisId === analysisId)) {
        setSelectedTicker(null);
        setSelectedAnalysisDate(null);
        setSelectedViewAnalysisId(null);
      }
    } catch (error) {
      console.error('Error deleting analysis:', error);
      toast({
        title: "Delete Failed",
        description: error instanceof Error ? error.message : "Failed to delete analysis",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const getDecisionIcon = (decision: 'BUY' | 'SELL' | 'HOLD' | 'CANCELED' | 'ERROR') => {
    switch (decision) {
      case 'BUY':
        return <TrendingUp className="h-4 w-4" />;
      case 'SELL':
        return <TrendingDown className="h-4 w-4" />;
      case 'HOLD':
        return <AlertTriangle className="h-4 w-4" />;
      case 'CANCELED':
        return <StopCircle className="h-4 w-4" />;
      case 'ERROR':
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getDecisionVariant = (decision: 'BUY' | 'SELL' | 'HOLD' | 'CANCELED' | 'ERROR') => {
    switch (decision) {
      case 'BUY':
        return 'buy' as const;
      case 'SELL':
        return 'sell' as const;
      case 'HOLD':
        return 'hold' as const;
      case 'CANCELED':
        return 'outline' as const;
      case 'ERROR':
        return 'destructive' as const;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case 'info':
        return AlertCircle;
      case 'analysis':
        return Brain;
      case 'decision':
        return TrendingUp;
      case 'debate':
        return Users;
      case 'error':
        return AlertCircle;
      default:
        return MessageSquare;
    }
  };

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Group analyses by rebalance
  const groupAnalysesByRebalance = (analyses: AnalysisHistoryItem[]): (AnalysisHistoryItem | RebalanceAnalysisGroup)[] => {
    const rebalanceGroups = new Map<string, RebalanceAnalysisGroup>();
    const standaloneAnalyses: AnalysisHistoryItem[] = [];

    analyses.forEach(analysis => {
      if (analysis.full_analysis?.rebalance_request_id || (analysis as any).rebalance_request_id) {
        const rebalanceId = analysis.full_analysis?.rebalance_request_id || (analysis as any).rebalance_request_id;
        if (!rebalanceGroups.has(rebalanceId)) {
          rebalanceGroups.set(rebalanceId, {
            id: rebalanceId,
            createdAt: analysis.created_at,
            status: 'completed', // Default status
            analyses: []
          });
        }
        rebalanceGroups.get(rebalanceId)!.analyses.push(analysis);
      } else {
        standaloneAnalyses.push(analysis);
      }
    });

    // Combine all items with their creation timestamps for unified sorting
    const allItems: (AnalysisHistoryItem | RebalanceAnalysisGroup)[] = [];

    // Add rebalance groups
    Array.from(rebalanceGroups.values()).forEach(group => {
      // Sort analyses within group by creation time
      group.analyses.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      allItems.push(group);
    });

    // Add standalone analyses
    standaloneAnalyses.forEach(analysis => allItems.push(analysis));

    // Sort all items by creation time - use createdAt for groups, created_at for individual analyses
    return allItems.sort((a, b) => {
      const dateA = 'createdAt' in a ? new Date(a.createdAt) : new Date(a.created_at);
      const dateB = 'createdAt' in b ? new Date(b.createdAt) : new Date(b.created_at);
      return dateB.getTime() - dateA.getTime();
    });
  };

  // Render individual analysis card
  const renderAnalysisCard = (item: AnalysisHistoryItem, isInRebalanceGroup: boolean = false) => {
    // Prioritize Portfolio Manager's decision over Risk Manager's decision
    const displayDecision = item.agent_insights?.portfolioManager?.finalDecision?.action ||
      item.agent_insights?.portfolioManager?.decision?.action ||
      item.agent_insights?.portfolioManager?.action ||
      item.decision;

    return (
      <div
        key={item.id}
        className={`border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors ${isInRebalanceGroup ? 'bg-muted/10' : ''
          }`}
        onClick={() => viewDetails(item)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-semibold">{item.ticker}</span>
            <Badge variant={getDecisionVariant(displayDecision)}>
              <span className="flex items-center gap-1">
                {getDecisionIcon(displayDecision)}
                {displayDecision}
              </span>
            </Badge>
            {item.confidence > 0 && (
              <span className={`text-sm font-medium ${getConfidenceColor(item.confidence)}`}>
                {item.confidence}% confidence
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {item.analysis_date ?
              `Analysis date: ${new Date(item.analysis_date).toLocaleDateString()}` :
              `Started: ${new Date(item.created_at).toLocaleDateString()}`
            }
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="border border-slate-700"
              onClick={(e) => {
                e.stopPropagation();
                viewDetails(item);
              }}
            >
              <Eye className="h-4 w-4 mr-1" />
              View Details
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 border border-slate-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAnalysisId(item.id);
                    setSelectedAnalysisTicker(item.ticker);
                    setShowDeleteDialog(true);
                  }}
                  className="text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    );
  };


  // Get display counts - always use filtered data
  const displayHistory = filteredHistory;
  const displayCanceled = filteredCanceled;

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Analysis History</h3>
            <div className="flex items-center gap-2">
              {/* Manual refresh button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => loadAllAnalyses()}
                disabled={loading}
                className="h-8 w-8 p-0 hover:bg-[#fc0]/10 hover:text-[#fc0]"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              
              <div className="w-px h-6 bg-border" />
              
              <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const [year, month, day] = selectedDate.split('-').map(Number);
                  const prevDate = new Date(year, month - 1, day);
                  prevDate.setDate(prevDate.getDate() - 1);
                  const prevYear = prevDate.getFullYear();
                  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
                  const prevDay = String(prevDate.getDate()).padStart(2, '0');
                  setSelectedDate(`${prevYear}-${prevMonth}-${prevDay}`);
                }}
                className="h-8 w-8 p-0 hover:bg-[#fc0]/10 hover:text-[#fc0]"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-3 min-w-[140px] hover:border-[#fc0] hover:bg-[#fc0]/10 hover:text-[#fc0] transition-all duration-200"
                  >
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {getDateDisplay()}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0 bg-background border-border"
                  align="center"
                >
                  <div className="space-y-2 p-3">
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs hover:bg-[#fc0]/10 hover:border-[#fc0]/50 hover:text-[#fc0]"
                        onClick={() => {
                          const yesterday = new Date();
                          yesterday.setDate(yesterday.getDate() - 1);
                          const year = yesterday.getFullYear();
                          const month = String(yesterday.getMonth() + 1).padStart(2, '0');
                          const day = String(yesterday.getDate()).padStart(2, '0');
                          setSelectedDate(`${year}-${month}-${day}`);
                        }}
                      >
                        Yesterday
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-xs hover:bg-[#fc0]/10 hover:border-[#fc0]/50 hover:text-[#fc0]"
                        onClick={() => {
                          const today = new Date();
                          const year = today.getFullYear();
                          const month = String(today.getMonth() + 1).padStart(2, '0');
                          const day = String(today.getDate()).padStart(2, '0');
                          setSelectedDate(`${year}-${month}-${day}`);
                        }}
                      >
                        Today
                      </Button>
                    </div>
                  </div>
                  <Calendar
                    mode="single"
                    selected={(() => {
                      // Parse the date string properly to avoid timezone issues
                      const [year, month, day] = selectedDate.split('-').map(Number);
                      return new Date(year, month - 1, day);
                    })()}
                    onSelect={(date) => {
                      if (date) {
                        // Format the date properly without timezone issues
                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        setSelectedDate(`${year}-${month}-${day}`);
                      }
                    }}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(23, 59, 59, 999);
                      return date > today;
                    }}
                    showOutsideDays={false}
                    initialFocus
                    className="rounded-b-lg"
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const [year, month, day] = selectedDate.split('-').map(Number);
                  const nextDate = new Date(year, month - 1, day);
                  nextDate.setDate(nextDate.getDate() + 1);

                  const today = new Date();
                  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

                  const nextYear = nextDate.getFullYear();
                  const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
                  const nextDay = String(nextDate.getDate()).padStart(2, '0');
                  const next = `${nextYear}-${nextMonth}-${nextDay}`;

                  if (next <= todayString) {
                    setSelectedDate(next);
                  }
                }}
                disabled={(() => {
                  const today = new Date();
                  const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                  return selectedDate === todayString;
                })()}
                className="h-8 w-8 p-0 hover:bg-[#fc0]/10 hover:text-[#fc0] disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              </div>
            </div>
          </div>

          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">
                All <span className="hidden sm:inline">({displayHistory.length + runningAnalyses.length + displayCanceled.length})</span>
              </TabsTrigger>
              <TabsTrigger value="running">
                Active <span className="hidden sm:inline">({runningAnalyses.length})</span>
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed <span className="hidden sm:inline">({displayHistory.length})</span>
              </TabsTrigger>
              <TabsTrigger value="canceled">
                Canceled <span className="hidden sm:inline">({displayCanceled.length})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {/* Running Analyses Section */}
              {runningAnalyses.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Active Analyses</h3>
                  <div className="space-y-2">
                    {runningAnalyses.map((item) => (
                      <div
                        key={item.id}
                        className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => viewRunningAnalysis(item.ticker)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{item.ticker}</span>
                            <Badge variant={item.status === ANALYSIS_STATUS.PENDING ? "secondary" : "default"}>
                              <span className="flex items-center gap-1">
                                {item.status === ANALYSIS_STATUS.PENDING ? (
                                  <>
                                    <Clock className="h-3 w-3" />
                                    Pending
                                  </>
                                ) : (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Running
                                  </>
                                )}
                              </span>
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Started {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            {item.status === ANALYSIS_STATUS.RUNNING && (item.full_analysis || item.agent_insights) && (
                              <div className="flex items-center gap-2 mr-4">
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-yellow-500 animate-pulse transition-all"
                                    style={{
                                      width: `${calculateAgentCompletion(item, !!item.rebalance_request_id)}%`
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                  {Math.round(calculateAgentCompletion(item, !!item.rebalance_request_id))}%
                                </span>
                              </div>
                            )}
                            {item.status === ANALYSIS_STATUS.PENDING && (
                              <span className="text-xs text-muted-foreground">
                                Waiting to start...
                              </span>
                            )}
                            {item.status === ANALYSIS_STATUS.RUNNING && !item.full_analysis && (
                              <span className="text-xs text-muted-foreground">
                                Analysis in progress...
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="border border-slate-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                viewRunningAnalysis(item.ticker);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Details
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 border border-slate-700"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAnalysisId(item.id);
                                    setSelectedAnalysisTicker(item.ticker);
                                    setShowCancelDialog(true);
                                  }}
                                  className="text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400"
                                >
                                  <StopCircle className="h-4 w-4 mr-2" />
                                  Cancel Analysis
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAnalysisId(item.id);
                                    setSelectedAnalysisTicker(item.ticker);
                                    setShowDeleteDialog(true);
                                  }}
                                  className="text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Analyses Section */}
              {displayHistory.length > 0 && (
                <div className="space-y-3">
                  {runningAnalyses.length > 0 && (
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Completed Analyses</h3>
                  )}
                  {groupAnalysesByRebalance(displayHistory).map((item, index) => {
                    // Check if it's a rebalance group
                    if ('analyses' in item) {
                      const group = item as RebalanceAnalysisGroup;
                      return (
                        <div key={`rebalance-${group.id}`} className="space-y-3">
                          {/* Rebalance Group Header */}
                          <div className="p-4 rounded-lg border border-border bg-card/50">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Package className="h-5 w-5 text-muted-foreground" />
                                <span className="font-semibold">Rebalance Analysis Session</span>
                                <Badge variant="outline" className="text-xs">
                                  {group.analyses.length} analysis{group.analyses.length !== 1 ? 'es' : ''}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CalendarIcon className="h-4 w-4" />
                                {formatFullDate(group.createdAt)}
                              </div>
                            </div>

                            {/* Rebalance Analyses */}
                            <div className="space-y-3">
                              {group.analyses.map(analysis => renderAnalysisCard(analysis, true))}
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      // Standalone analysis
                      return renderAnalysisCard(item as AnalysisHistoryItem);
                    }
                  })}
                </div>
              )}

              {/* Canceled Analyses Section */}
              {displayCanceled.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Canceled Analyses</h3>
                  {displayCanceled.map((item) => {
                    // Prioritize Portfolio Manager's decision over Risk Manager's decision
                    const displayDecision = item.agent_insights?.portfolioManager?.finalDecision?.action ||
                      item.agent_insights?.portfolioManager?.decision?.action ||
                      item.agent_insights?.portfolioManager?.action ||
                      item.decision;

                    return (
                      <div
                        key={item.id}
                        className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors opacity-60"
                        onClick={() => viewDetails(item)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{item.ticker}</span>
                            <Badge variant={getDecisionVariant(displayDecision)}>
                              <span className="flex items-center gap-1">
                                {getDecisionIcon(displayDecision)}
                                {displayDecision}
                              </span>
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Started: {new Date(item.created_at).toLocaleDateString()}
                          </span>
                          <div className="flex items-center gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 border border-slate-700"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAnalysisId(item.id);
                                    setSelectedAnalysisTicker(item.ticker);
                                    setShowDeleteDialog(true);
                                  }}
                                  className="text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {!initialLoadComplete || loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading analyses...</span>
                </div>
              ) : (
                displayHistory.length === 0 && runningAnalyses.length === 0 && displayCanceled.length === 0 && (
                  <div className="flex items-center justify-center py-8">
                    <img
                      src="/goose_sit.png"
                      alt="No data"
                      className="w-32 h-32 mr-6"
                    />
                    <div className="text-left text-muted-foreground">
                      <p>No analyses on {getDateDisplay()}</p>
                      <p className="text-sm mt-2">Try selecting a different date or run a new analysis</p>
                    </div>
                  </div>
                )
              )}
            </TabsContent>

            {/* Running Only Tab */}
            <TabsContent value="running" className="space-y-4">
              {runningAnalyses.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <img
                    src="/goose_sit.png"
                    alt="No data"
                    className="w-32 h-32 mr-6"
                  />
                  <div className="text-left text-muted-foreground">
                    <p>No running analyses on {getDateDisplay()}</p>
                    <p className="text-sm mt-2">Select a different date to view more analyses</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {runningAnalyses.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => viewRunningAnalysis(item.ticker)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{item.ticker}</span>
                          <Badge variant={item.status === ANALYSIS_STATUS.PENDING ? "secondary" : "default"}>
                            <span className="flex items-center gap-1">
                              {item.status === ANALYSIS_STATUS.PENDING ? (
                                <>
                                  <Clock className="h-3 w-3" />
                                  Pending
                                </>
                              ) : (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Running
                                </>
                              )}
                            </span>
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Started {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {item.status === ANALYSIS_STATUS.RUNNING && item.full_analysis && (
                            <div className="flex items-center gap-2 mr-4">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-yellow-500 animate-pulse transition-all"
                                  style={{
                                    width: `${calculateAgentCompletion(item, !!item.rebalance_request_id)}%`
                                  }}
                                />
                              </div>
                              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                {Math.round(calculateAgentCompletion(item, !!item.rebalance_request_id))}%
                              </span>
                            </div>
                          )}
                          {item.status === ANALYSIS_STATUS.PENDING && (
                            <span className="text-xs text-muted-foreground">
                              Waiting to start...
                            </span>
                          )}
                          {item.status === ANALYSIS_STATUS.RUNNING && !item.full_analysis && (
                            <span className="text-xs text-muted-foreground">
                              Analysis in progress...
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRunningAnalysis(item.ticker);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View Details
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 border border-slate-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAnalysisId(item.id);
                                  setSelectedAnalysisTicker(item.ticker);
                                  setShowCancelDialog(true);
                                }}
                                className="bg-red-500/5 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400"
                              >
                                <StopCircle className="h-4 w-4 mr-2" />
                                Cancel Analysis
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAnalysisId(item.id);
                                  setSelectedAnalysisTicker(item.ticker);
                                  setShowDeleteDialog(true);
                                }}
                                className="bg-red-500/5 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Completed Only Tab */}
            <TabsContent value="completed" className="space-y-4">
              {!initialLoadComplete || loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading analyses...</span>
                </div>
              ) : displayHistory.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <img
                    src="/goose_sit.png"
                    alt="No data"
                    className="w-32 h-32 mr-6"
                  />
                  <div className="text-left text-muted-foreground">
                    <p>No completed analyses on {getDateDisplay()}</p>
                    <p className="text-sm mt-2">Select a different date to view more analyses</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {groupAnalysesByRebalance(displayHistory).map((item, index) => {
                    // Check if it's a rebalance group
                    if ('analyses' in item) {
                      const group = item as RebalanceAnalysisGroup;
                      return (
                        <div key={`rebalance-${group.id}`} className="space-y-3">
                          {/* Rebalance Group Header */}
                          <div className="p-4 rounded-lg border border-border bg-card/50">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Package className="h-5 w-5 text-muted-foreground" />
                                <span className="font-semibold">Rebalance Analysis Session</span>
                                <Badge variant="outline" className="text-xs">
                                  {group.analyses.length} analysis{group.analyses.length !== 1 ? 'es' : ''}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CalendarIcon className="h-4 w-4" />
                                {formatFullDate(group.createdAt)}
                              </div>
                            </div>

                            {/* Rebalance Analyses */}
                            <div className="space-y-3">
                              {group.analyses.map(analysis => renderAnalysisCard(analysis, true))}
                            </div>
                          </div>
                        </div>
                      );
                    } else {
                      // Standalone analysis
                      return renderAnalysisCard(item as AnalysisHistoryItem);
                    }
                  })}
                </div>
              )}
            </TabsContent>

            {/* Canceled Only Tab */}
            <TabsContent value="canceled" className="space-y-4">
              {!initialLoadComplete || loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span className="text-muted-foreground">Loading analyses...</span>
                </div>
              ) : displayCanceled.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <img
                    src="/goose_sit.png"
                    alt="No data"
                    className="w-32 h-32 mr-6"
                  />
                  <div className="text-left text-muted-foreground">
                    <p>No canceled analyses on {getDateDisplay()}</p>
                    <p className="text-sm mt-2">Select a different date to view more analyses</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayCanceled.map((item) => {
                    // Prioritize Portfolio Manager's decision over Risk Manager's decision
                    const displayDecision = item.agent_insights?.portfolioManager?.finalDecision?.action ||
                      item.agent_insights?.portfolioManager?.decision?.action ||
                      item.agent_insights?.portfolioManager?.action ||
                      item.decision;

                    return (
                      <div
                        key={item.id}
                        className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors opacity-60"
                        onClick={() => viewDetails(item)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{item.ticker}</span>
                            <Badge variant={getDecisionVariant(displayDecision)}>
                              <span className="flex items-center gap-1">
                                {getDecisionIcon(displayDecision)}
                                {displayDecision}
                              </span>
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Started: {new Date(item.created_at).toLocaleDateString()}
                          </span>
                          <div className="flex items-center gap-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 border border-slate-700"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedAnalysisId(item.id);
                                    setSelectedAnalysisTicker(item.ticker);
                                    setShowDeleteDialog(true);
                                  }}
                                  className="text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Analysis Detail Modal */}
      {(selectedTicker || selectedViewAnalysisId) && (
        <AnalysisDetailModal
          ticker={selectedTicker || undefined}
          analysisId={selectedViewAnalysisId || undefined}
          isOpen={!!(selectedTicker || selectedViewAnalysisId)}
          analysisDate={selectedAnalysisDate || undefined}
          onClose={() => {
            setSelectedTicker(null);
            setSelectedAnalysisDate(null);
            setSelectedViewAnalysisId(null);
            // Don't refresh on close - not needed
          }}
        />
      )}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Analysis</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel the analysis for {selectedAnalysisTicker}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              Keep Running
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedAnalysisId && selectedAnalysisTicker) {
                  cancelAnalysis(selectedAnalysisId, selectedAnalysisTicker);
                }
              }}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <StopCircle className="w-4 h-4 mr-2" />
                  Cancel Analysis
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Analysis</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the analysis for {selectedAnalysisTicker}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedAnalysisId && selectedAnalysisTicker) {
                  deleteAnalysis(selectedAnalysisId, selectedAnalysisTicker);
                }
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
