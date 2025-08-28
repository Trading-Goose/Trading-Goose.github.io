import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  RefreshCw,
  Loader2,
  Eye,
  Trash2,
  XCircle,
  CheckCircle,
  Clock,
  AlertCircle,
  MoreVertical,
  StopCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import RebalanceDetailModal from './RebalanceDetailModal';
import {
  type RebalanceStatus,
  REBALANCE_STATUS,
  convertLegacyRebalanceStatus,
  isRebalanceActive,
  isRebalanceFinished,
  getStatusDisplayText
} from "@/lib/statusTypes";

interface RebalanceAnalysis {
  id: string;
  ticker: string;
  action: string;
  confidence: number;
  agent_insights: any;
}

interface RebalanceRequest {
  id: string;
  user_id: string;
  status: RebalanceStatus | string; // Support both new RebalanceStatus and legacy strings
  created_at: string;
  total_stocks: number;
  stocks_analyzed: number;
  rebalance_plan?: any;
  error_message?: string;
  constraints?: any;
  target_allocations?: any;
  portfolio_snapshot?: any;
}

export default function RebalanceHistoryTable() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [runningRebalances, setRunningRebalances] = useState<RebalanceRequest[]>([]);
  const [completedRebalances, setCompletedRebalances] = useState<RebalanceRequest[]>([]);
  const [cancelledRebalances, setCancelledRebalances] = useState<RebalanceRequest[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedRebalanceId, setSelectedRebalanceId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetailId, setSelectedDetailId] = useState<string | undefined>(undefined);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [analysisData, setAnalysisData] = useState<{ [key: string]: any[] }>({});

  useEffect(() => {
    if (user) {
      fetchRebalanceRequests();
      // Set up real-time subscription for instant updates
      const subscription = supabase
        .channel('rebalance_updates')
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'rebalance_requests',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            fetchRebalanceRequests();
          }
        )
        .subscribe();

      // Poll for updates every 3 seconds to catch status changes quickly
      // This ensures failed rebalances are detected promptly
      const interval = setInterval(() => {
        fetchRebalanceRequests();
      }, 3000);

      return () => {
        subscription.unsubscribe();
        clearInterval(interval);
      };
    }
  }, [user, runningRebalances.length]);

  const fetchAnalysisDataForRebalance = async (rebalanceId: string) => {
    try {
      const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('rebalance_request_id', rebalanceId);

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching analysis data:', error);
      return [];
    }
  };

  const fetchRebalanceRequests = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('rebalance_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Debug logging
      console.log('Fetched rebalance requests:', data?.map(r => ({
        id: r.id,
        status: r.status,
        error_message: r.error_message,
        rebalance_plan: r.rebalance_plan ? 'exists' : 'null'
      })));

      // Separate running, completed, and cancelled rebalances
      const running: RebalanceRequest[] = [];
      const completed: RebalanceRequest[] = [];
      const cancelled: RebalanceRequest[] = [];

      for (const item of data || []) {
        // Convert legacy status to new format
        const status: RebalanceStatus = convertLegacyRebalanceStatus(item.status);

        if (status === REBALANCE_STATUS.ERROR || status === REBALANCE_STATUS.CANCELLED) {
          cancelled.push(item);
        } else if (status === REBALANCE_STATUS.RUNNING) {
          // Running status means still analyzing
          running.push(item);
        } else if (status === REBALANCE_STATUS.COMPLETED) {
          completed.push(item);
        }
      }

      setRunningRebalances(running);
      setCompletedRebalances(completed);
      setCancelledRebalances(cancelled);

      // Fetch analysis data for running rebalances to calculate progress
      const analysisDataMap: { [key: string]: any[] } = {};
      for (const rebalance of running) {
        const analyses = await fetchAnalysisDataForRebalance(rebalance.id);
        analysisDataMap[rebalance.id] = analyses;
      }
      setAnalysisData(analysisDataMap);

    } catch (error) {
      console.error('Error fetching rebalance requests:', error);
      if (!loading) {
        toast({
          title: 'Error Loading History',
          description: 'Failed to load rebalance history. Please try again.',
          variant: 'destructive'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedRebalanceId) return;

    setDeleting(true);
    try {
      // Delete related analyses first from analysis_history table
      const { error: analysesError } = await supabase
        .from('analysis_history')
        .delete()
        .eq('rebalance_request_id', selectedRebalanceId);

      if (analysesError && analysesError.code !== '23503') {
        // Ignore foreign key constraint errors as cascade delete should handle it
        console.warn('Error deleting related analyses:', analysesError);
      }

      // Then delete the rebalance request
      const { error } = await supabase
        .from('rebalance_requests')
        .delete()
        .eq('id', selectedRebalanceId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Rebalance record deleted successfully'
      });

      // Refresh the list
      fetchRebalanceRequests();
    } catch (error) {
      console.error('Error deleting rebalance:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete rebalance record',
        variant: 'destructive'
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setSelectedRebalanceId(null);
    }
  };

  const handleCancel = async () => {
    if (!selectedRebalanceId || !user) return;

    setCancelling(true);
    try {
      // First check if the rebalance exists and belongs to the user
      const { data: checkData, error: checkError } = await supabase
        .from('rebalance_requests')
        .select('id, status')
        .eq('id', selectedRebalanceId)
        .eq('user_id', user.id)
        .single();

      if (checkError || !checkData) {
        throw new Error('Rebalance request not found or already cancelled');
      }

      // Only cancel if it's in a cancellable state
      if (isRebalanceFinished(convertLegacyRebalanceStatus(checkData.status))) {
        toast({
          title: 'Info',
          description: `Rebalance is already ${checkData.status}`,
          variant: 'default'
        });
        return;
      }

      // Use the RPC function to cancel the rebalance (bypasses RLS issues)
      const { error: cancelError } = await supabase
        .rpc('cancel_rebalance_request', {
          p_request_id: selectedRebalanceId
        });

      if (cancelError) {
        // Fallback to direct update if RPC function doesn't exist yet
        const { error: updateError } = await supabase
          .from('rebalance_requests')
          .update({
            status: REBALANCE_STATUS.CANCELLED
          })
          .eq('id', selectedRebalanceId)
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      }


      toast({
        title: 'Success',
        description: 'Rebalance cancelled successfully'
      });

      // Refresh the list
      await fetchRebalanceRequests();
    } catch (error: any) {
      console.error('Error cancelling rebalance:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel rebalance',
        variant: 'destructive'
      });
    } finally {
      setCancelling(false);
      setCancelDialogOpen(false);
      setSelectedRebalanceId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    // Convert legacy status to new format for consistent icon display
    const normalizedStatus = convertLegacyRebalanceStatus(status);

    switch (normalizedStatus) {
      case REBALANCE_STATUS.COMPLETED:
        return <CheckCircle className="h-3 w-3" />;
      case REBALANCE_STATUS.CANCELLED:
        return <XCircle className="h-3 w-3" />;
      case REBALANCE_STATUS.ERROR:
        return <AlertCircle className="h-3 w-3" />;
      case REBALANCE_STATUS.RUNNING:
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case REBALANCE_STATUS.PENDING:
        return <Clock className="h-3 w-3" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" | undefined => {
    // Convert legacy status to new format for consistent variant display
    const normalizedStatus = convertLegacyRebalanceStatus(status);

    switch (normalizedStatus) {
      case REBALANCE_STATUS.COMPLETED:
        return undefined; // No variant, use className only
      case REBALANCE_STATUS.CANCELLED:
      case REBALANCE_STATUS.ERROR:
        return 'destructive';
      case REBALANCE_STATUS.RUNNING:
        return 'default'; // Use default variant like UnifiedAnalysisHistory
      case REBALANCE_STATUS.PENDING:
        return 'secondary';
      default:
        return 'outline';
    }
  };
  
  const getStatusClassName = (status: string): string => {
    // Convert legacy status to new format for consistent variant display
    const normalizedStatus = convertLegacyRebalanceStatus(status);

    switch (normalizedStatus) {
      case REBALANCE_STATUS.COMPLETED:
        return 'border border-green-500/30 bg-green-500/10 text-green-600 font-semibold hover:bg-green-500/20';
      case REBALANCE_STATUS.RUNNING:
        return ''; // Let default variant handle the styling
      default:
        return '';
    }
  };

  // Calculate completion percentage based on agent step completion
  const calculateAgentStepCompletion = (rebalanceRequest: RebalanceRequest): number => {
    const analyses = analysisData[rebalanceRequest.id] || [];

    console.log('calculateAgentStepCompletion - rebalanceRequest:', {
      id: rebalanceRequest.id,
      status: rebalanceRequest.status,
      hasRebalancePlan: !!rebalanceRequest.rebalance_plan,
      analysesCount: analyses.length
    });

    // For completed rebalances with workflow steps, use the workflow data
    if (rebalanceRequest.rebalance_plan?.workflowSteps) {
      const workflowSteps = rebalanceRequest.rebalance_plan.workflowSteps;
      const analysisStep = workflowSteps.find((step: any) => step.id === 'analysis');

      if (analysisStep?.stockAnalyses) {
        const stockAnalyses = analysisStep.stockAnalyses;
        let totalSteps = 0;
        let completedSteps = 0;

        stockAnalyses.forEach((stockAnalysis: any) => {
          const fullAnalysis = stockAnalysis.fullAnalysis || {};
          const fullWorkflowSteps = fullAnalysis.workflowSteps || [];
          const expectedSteps = ['analysis', 'research', 'trading', 'risk'];

          expectedSteps.forEach(stepId => {
            totalSteps++;
            const step = fullWorkflowSteps.find((s: any) => s.id === stepId);

            if (step?.agents) {
              const allAgentsCompleted = step.agents.length > 0 &&
                step.agents.every((agent: any) => agent.status === 'completed');
              if (allAgentsCompleted) {
                completedSteps++;
              }
            } else if (stepId === 'analysis') {
              const agents = stockAnalysis.agents || {};
              const analysisAgents = ['marketAnalyst', 'newsAnalyst', 'socialMediaAnalyst', 'fundamentalsAnalyst'];
              const allAnalysisCompleted = analysisAgents.every(agentKey =>
                agents[agentKey] === 'completed'
              );
              if (allAnalysisCompleted) {
                completedSteps++;
              }
            }
          });
        });

        return totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
      }
    }

    // For running rebalances, use the analysis_history data
    if (analyses.length === 0) {
      console.log('calculateAgentStepCompletion - No analyses found, using legacy fallback');
      return rebalanceRequest.total_stocks > 0
        ? (rebalanceRequest.stocks_analyzed / rebalanceRequest.total_stocks) * 100
        : 0;
    }

    let totalAgentSteps = 0;
    let completedAgentSteps = 0;

    // Define expected agents per analysis (based on actual agent names from messages)
    const expectedAgents = [
      'macro-analyst', 'market-analyst', 'news-analyst', 'social-media-analyst', 'fundamentals-analyst',
      'bull-researcher', 'bear-researcher', 'research-manager',
      'risky-analyst', 'safe-analyst', 'neutral-analyst', 'risk-manager',
      'trader'
    ];

    console.log('calculateAgentStepCompletion - Expected agents:', expectedAgents);

    analyses.forEach((analysis: any) => {
      console.log(`calculateAgentStepCompletion - Analysis ${analysis.ticker}:`, {
        ticker: analysis.ticker,
        status: analysis.status,
        hasMessages: !!analysis.full_analysis?.messages,
        messageCount: analysis.full_analysis?.messages?.length || 0
      });

      // Count expected agent steps for this stock
      totalAgentSteps += expectedAgents.length;

      // Count completed agents based on messages in full_analysis
      const messages = analysis.full_analysis?.messages || [];
      const completedAgents = new Set<string>();

      console.log(`calculateAgentStepCompletion - Stock ${analysis.ticker} messages sample:`,
        messages.slice(0, 5).map((msg: any) => ({
          agent: msg.agent,
          type: msg.type,
          hasContent: !!msg.content,
          timestamp: msg.timestamp
        })));

      messages.forEach((msg: any) => {
        if (msg.agent && msg.timestamp) {
          // Consider an agent completed if it has a timestamp (indicating it posted a message)
          const normalizedAgent = msg.agent.toLowerCase().replace(/\s+/g, '-');
          completedAgents.add(normalizedAgent);
          console.log(`calculateAgentStepCompletion - Added agent: ${msg.agent} -> ${normalizedAgent}`);
        }
      });

      console.log(`calculateAgentStepCompletion - Stock ${analysis.ticker} completed agents:`,
        Array.from(completedAgents));

      // Count how many expected agents have completed
      expectedAgents.forEach(agentKey => {
        if (completedAgents.has(agentKey)) {
          completedAgentSteps++;
          console.log(`calculateAgentStepCompletion - Matched agent: ${agentKey} for ${analysis.ticker}`);
        }
      });

      console.log(`calculateAgentStepCompletion - Stock ${analysis.ticker} matching:`, {
        expectedAgents,
        completedAgents: Array.from(completedAgents),
        matches: expectedAgents.filter(key => completedAgents.has(key))
      });
    });

    const percentage = totalAgentSteps > 0 ? (completedAgentSteps / totalAgentSteps) * 100 : 0;
    console.log('calculateAgentStepCompletion - Final result:', {
      totalAgentSteps,
      completedAgentSteps,
      percentage
    });

    return percentage;
  };

  const viewRebalanceDetails = (rebalance: RebalanceRequest) => {
    setSelectedDetailId(rebalance.id);
    setDetailModalOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Rebalance History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalCount = runningRebalances.length + completedRebalances.length + cancelledRebalances.length;

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">
                All <span className="hidden sm:inline">({totalCount})</span>
              </TabsTrigger>
              <TabsTrigger value="running">
                Running <span className="hidden sm:inline">({runningRebalances.length})</span>
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed <span className="hidden sm:inline">({completedRebalances.length})</span>
              </TabsTrigger>
              <TabsTrigger value="cancelled">
                Cancelled <span className="hidden sm:inline">({cancelledRebalances.length})</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {/* Running Rebalances Section */}
              {runningRebalances.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Currently Running</h3>
                  <div className="space-y-2">
                    {runningRebalances.map((item) => (
                      <div
                        key={item.id}
                        className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => viewRebalanceDetails(item)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">Portfolio Rebalance</span>
                            <Badge variant={getStatusVariant(item.status)} className={getStatusClassName(item.status)}>
                              <span className="flex items-center gap-1">
                                {getStatusIcon(item.status)}
                                {item.status.replace('_', ' ')}
                              </span>
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Started {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            {isRebalanceActive(convertLegacyRebalanceStatus(item.status)) && (
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2  bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-yellow-500 animate-pulse transition-all"
                                    style={{
                                      width: `${calculateAgentStepCompletion(item)}%`
                                    }}
                                  />
                                </div>
                                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                  {Math.round(calculateAgentStepCompletion(item))}%
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="border border-slate-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                viewRebalanceDetails(item);
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
                                    setSelectedRebalanceId(item.id);
                                    setCancelDialogOpen(true);
                                  }}
                                  className="text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400"
                                  disabled={cancelling}
                                >
                                  <StopCircle className="h-4 w-4 mr-2" />
                                  Cancel Rebalance
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRebalanceId(item.id);
                                    setDeleteDialogOpen(true);
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

              {/* Completed Rebalances Section */}
              {completedRebalances.length > 0 && (
                <div className="space-y-3">
                  {runningRebalances.length > 0 && (
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">Completed Rebalances</h3>
                  )}
                  {completedRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge className="border border-green-500/30 bg-green-500/10 text-green-600 font-semibold hover:bg-green-500/20">
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Completed
                            </span>
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {item.total_stocks} stocks analyzed
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Completed on: {new Date(item.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
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
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
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
              )}

              {/* Cancelled Rebalances Section */}
              {cancelledRebalances.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Cancelled/Failed</h3>
                  {cancelledRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors opacity-75"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge variant="destructive">
                            <span className="flex items-center gap-1">
                              {getStatusIcon(item.status)}
                              {getStatusDisplayText(convertLegacyRebalanceStatus(item.status))}
                            </span>
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {convertLegacyRebalanceStatus(item.status) === REBALANCE_STATUS.ERROR
                            ? (item.error_message || item.rebalance_plan?.error || item.rebalance_plan?.errorDetails || 'Rebalance failed')
                            : (item.error_message || 'Rebalance was cancelled by user')}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
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
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
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
              )}

              {totalCount === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No rebalance records found</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="running" className="space-y-4">
              {runningRebalances.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No running rebalances</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {runningRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge variant={getStatusVariant(item.status)} className={getStatusClassName(item.status)}>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(item.status)}
                              {getStatusDisplayText(convertLegacyRebalanceStatus(item.status))}
                            </span>
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Started {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {isRebalanceActive(convertLegacyRebalanceStatus(item.status)) && (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 transition-all "
                                  style={{
                                    width: `${calculateAgentStepCompletion(item)}%`
                                  }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(calculateAgentStepCompletion(item))}%
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
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
                                  setSelectedRebalanceId(item.id);
                                  setCancelDialogOpen(true);
                                }}
                                className="text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400"
                                disabled={cancelling}
                              >
                                <StopCircle className="h-4 w-4 mr-2" />
                                Cancel Rebalance
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
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
              )}
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              {completedRebalances.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No completed rebalances</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {completedRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge className="border border-green-500/30 bg-green-500/10 text-green-600 font-semibold hover:bg-green-500/20">
                            <span className="flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              Completed
                            </span>
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {item.total_stocks} stocks analyzed
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Completed on: {new Date(item.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
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
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
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
              )}
            </TabsContent>

            <TabsContent value="cancelled" className="space-y-4">
              {cancelledRebalances.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No cancelled rebalances</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cancelledRebalances.map((item) => (
                    <div
                      key={item.id}
                      className="border border-border rounded-lg p-4 space-y-3 cursor-pointer hover:bg-muted/50 transition-colors opacity-75"
                      onClick={() => viewRebalanceDetails(item)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold">Portfolio Rebalance</span>
                          <Badge variant="destructive">
                            <span className="flex items-center gap-1">
                              {getStatusIcon(item.status)}
                              {getStatusDisplayText(convertLegacyRebalanceStatus(item.status))}
                            </span>
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {convertLegacyRebalanceStatus(item.status) === REBALANCE_STATUS.ERROR
                            ? (item.error_message || item.rebalance_plan?.error || item.rebalance_plan?.errorDetails || 'Rebalance failed')
                            : (item.error_message || 'Rebalance was cancelled by user')}
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="border border-slate-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              viewRebalanceDetails(item);
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
                                  setSelectedRebalanceId(item.id);
                                  setDeleteDialogOpen(true);
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
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rebalance Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this rebalance record? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedRebalanceId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Rebalance</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this rebalance operation? Any pending analyses will be stopped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedRebalanceId(null)}>
              Keep Running
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Rebalance'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Modal */}
      <RebalanceDetailModal
        rebalanceId={selectedDetailId}
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedDetailId(undefined);
        }}
      />
    </>
  );
}