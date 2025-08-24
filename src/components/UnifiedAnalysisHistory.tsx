import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Loader2, RefreshCw, Eye, Trash2, MoreVertical, StopCircle, Users, MessageSquare, AlertCircle, Package, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { analysisManager } from "@/lib/analysisManager";
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
const calculateAgentCompletion = (fullAnalysis: any, isRebalanceAnalysis: boolean = false): number => {
  if (!fullAnalysis?.messages) return 0;

  // Define expected agents (including macro-analyst)
  // For rebalance analyses, exclude portfolio-manager as it runs at rebalance level
  const expectedAgents = [
    'macro-analyst', 'market-analyst', 'news-analyst', 'social-media-analyst', 'fundamentals-analyst',
    'bull-researcher', 'bear-researcher', 'research-manager',
    'risky-analyst', 'safe-analyst', 'neutral-analyst', 'risk-manager',
    'trader'
  ];
  
  // Only add portfolio-manager for standalone analyses (not part of rebalance)
  if (!isRebalanceAnalysis) {
    expectedAgents.push('portfolio-manager');
  }

  const messages = fullAnalysis.messages || [];
  const completedAgents = new Set<string>();

  messages.forEach((msg: any) => {
    if (msg.agent && msg.timestamp) {
      const normalizedAgent = msg.agent.toLowerCase().replace(/\s+/g, '-');
      completedAgents.add(normalizedAgent);
    }
  });

  // Count matches
  let matchedAgents = 0;
  expectedAgents.forEach(agentKey => {
    if (completedAgents.has(agentKey)) {
      matchedAgents++;
    }
  });

  return expectedAgents.length > 0 ? (matchedAgents / expectedAgents.length) * 100 : 0;
};

export default function UnifiedAnalysisHistory() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [runningAnalyses, setRunningAnalyses] = useState<RunningAnalysisItem[]>([]);
  const [canceledAnalyses, setCanceledAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedAnalysisDate, setSelectedAnalysisDate] = useState<string | null>(null);
  const [selectedViewAnalysisId, setSelectedViewAnalysisId] = useState<string | null>(null); // For viewing specific analysis
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [selectedAnalysisTicker, setSelectedAnalysisTicker] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadAllAnalyses = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading analyses:', error);
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
    }
  };

  useEffect(() => {
    if (isAuthenticated && user) {
      loadAllAnalyses();
    } else {
      setHistory([]);
      setRunningAnalyses([]);
      setCanceledAnalyses([]);
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  // Poll for updates only when there are running analyses
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      // Only poll if there are running analyses
      if (runningAnalyses.length > 0) {
        loadAllAnalyses();
      }
    }, 3000); // Poll every 3 seconds instead of 2

    return () => clearInterval(interval);
  }, [user, runningAnalyses.length]);

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
      await analysisManager.cancelAnalysis(ticker, user.id);

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
            canceledAt: new Date().toISOString(),
            currentPhase: 'Canceled by user',
            messages: [
              ...existingMessages,
              {
                agent: 'System',
                message: 'Analysis was canceled by user',
                timestamp: new Date().toISOString(),
                type: 'info'
              }
            ]
          }
        })
        .eq('id', analysisId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Move from running to canceled list
      setRunningAnalyses(prev => prev.filter(item => item.id !== analysisId));

      toast({
        title: "Analysis Cancelled",
        description: `Analysis for ${ticker} has been cancelled and moved to canceled history.`,
      });

      setShowCancelDialog(false);
      setSelectedAnalysisId(null);
      setSelectedAnalysisTicker(null);

      // Refresh the analysis lists to show the canceled item
      loadAllAnalyses();

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
      const { error } = await supabase
        .from('analysis_history')
        .delete()
        .eq('id', analysisId)
        .eq('user_id', user.id);

      if (error) throw error;

      setHistory(prev => prev.filter(item => item.id !== analysisId));
      setRunningAnalyses(prev => prev.filter(item => item.id !== analysisId));
      setCanceledAnalyses(prev => prev.filter(item => item.id !== analysisId));

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
  const renderAnalysisCard = (item: AnalysisHistoryItem, isInRebalanceGroup: boolean = false) => (
    <div
      key={item.id}
      className={`border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors ${isInRebalanceGroup ? 'bg-muted/10' : ''
        }`}
      onClick={() => viewDetails(item)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-semibold">{item.ticker}</span>
          <Badge variant={getDecisionVariant(item.decision)}>
            <span className="flex items-center gap-1">
              {getDecisionIcon(item.decision)}
              {item.decision}
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
                className="text-red-500 hover:text-white hover:bg-red-600"
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Analysis History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">
                All <span className="hidden sm:inline">({history.length + runningAnalyses.length + canceledAnalyses.length})</span>
              </TabsTrigger>
              <TabsTrigger value="running">
                Active <span className="hidden sm:inline">({runningAnalyses.length})</span>
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed <span className="hidden sm:inline">({history.length})</span>
              </TabsTrigger>
              <TabsTrigger value="canceled">
                Canceled <span className="hidden sm:inline">({canceledAnalyses.length})</span>
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
                            {item.status === ANALYSIS_STATUS.RUNNING && item.full_analysis && (
                              <div className="flex items-center gap-2 mr-4">
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-yellow-500 animate-pulse transition-all"
                                    style={{
                                      width: `${calculateAgentCompletion(item.full_analysis, !!item.rebalance_request_id)}%`
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                  {Math.round(calculateAgentCompletion(item.full_analysis, !!item.rebalance_request_id))}%
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
                                  className="text-red-500 hover:text-white hover:bg-red-600"
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
                                  className="text-red-500 hover:text-white hover:bg-red-600"
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
              {history.length > 0 && (
                <div className="space-y-3">
                  {runningAnalyses.length > 0 && (
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Completed Analyses</h3>
                  )}
                  {groupAnalysesByRebalance(history).map((item, index) => {
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
                                <Calendar className="h-4 w-4" />
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
              {canceledAnalyses.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Canceled Analyses</h3>
                  {canceledAnalyses.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors opacity-60"
                      onClick={() => viewDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{item.ticker}</span>
                          <Badge variant={getDecisionVariant(item.decision)}>
                            <span className="flex items-center gap-1">
                              {getDecisionIcon(item.decision)}
                              {item.decision}
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
                                className="text-red-500 hover:text-white hover:bg-red-600"
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

              {/* Empty state */}
              {history.length === 0 && runningAnalyses.length === 0 && canceledAnalyses.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No analysis history yet</p>
                  <p className="text-sm mt-2">Run your first AI analysis from the watchlist or analysis tab</p>
                </div>
              )}
            </TabsContent>

            {/* Running Only Tab */}
            <TabsContent value="running" className="space-y-4">
              {runningAnalyses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No running analyses</p>
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
                                    width: `${calculateAgentCompletion(item.full_analysis, !!item.rebalance_request_id)}%`
                                  }}
                                />
                              </div>
                              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                {Math.round(calculateAgentCompletion(item.full_analysis, !!item.rebalance_request_id))}%
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
                                className="text-red-500 hover:text-white hover:bg-red-600"
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
                                className="text-red-500 hover:text-white hover:bg-red-600"
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
              {history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No completed analyses</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {groupAnalysesByRebalance(history).map((item, index) => {
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
                                <Calendar className="h-4 w-4" />
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
              {canceledAnalyses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No canceled analyses</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {canceledAnalyses.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors opacity-60"
                      onClick={() => viewDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">{item.ticker}</span>
                          <Badge variant={getDecisionVariant(item.decision)}>
                            <span className="flex items-center gap-1">
                              {getDecisionIcon(item.decision)}
                              {item.decision}
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
                                className="text-red-500 hover:text-white hover:bg-red-600"
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
            loadAllAnalyses();
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