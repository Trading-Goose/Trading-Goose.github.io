import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
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
  X,
  PieChart,
  RefreshCw,
  PlayCircle,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import HorizontalWorkflow from "./workflow";
import WorkflowVisualization from "./WorkflowVisualization";
import MarkdownRenderer from "./MarkdownRenderer";
import MessageRenderer from "./MessageRenderer";
import { formatDistanceToNow } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
// Import centralized status system
import {
  type AnalysisStatus,
  type RebalanceStatus,
  ANALYSIS_STATUS,
  REBALANCE_STATUS,
  getStatusDisplayText,
  isAnalysisFinished,
  isRebalanceFinished
} from "@/lib/statusTypes";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";

interface AnalysisDetailModalProps {
  ticker?: string;
  analysisId?: string; // Can open directly with analysisId
  isOpen: boolean;
  onClose: () => void;
  analysisDate?: string; // Optional: for viewing historical analyses
  initialTab?: string; // Optional: which tab to open initially
}

// Import extracted components
import TradeOrderCard from "./analysis-detail/TradeOrderCard";
import WorkflowStepsLayout from "./analysis-detail/WorkflowStepsLayout";
import AnalysisActionsTab from "./analysis-detail/AnalysisActionsTab";
import AnalysisInsightsTab from "./analysis-detail/AnalysisInsightsTab";
import { useAnalysisData } from "./analysis-detail/hooks/useAnalysisData";
import { useOrderActions } from "./analysis-detail/hooks/useOrderActions";
import { getDecisionIcon, getDecisionVariant } from "./analysis-detail/utils/statusHelpers";

// Custom DialogContent without the default close button
const DialogContentNoClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContentNoClose.displayName = "DialogContentNoClose";

export default function AnalysisDetailModal({ ticker, analysisId, isOpen, onClose, analysisDate, initialTab }: AnalysisDetailModalProps) {
  // Use extracted custom hooks
  const { analysisData, loading, error, isLiveAnalysis, updateAnalysisData, setError } = useAnalysisData({
    ticker,
    analysisId,
    analysisDate,
    isOpen
  });

  const { isOrderExecuted, isExecuting, handleApproveOrder, handleRejectOrder } = useOrderActions({
    analysisData,
    updateAnalysisData
  });

  const { toast } = useToast();
  const [isRetrying, setIsRetrying] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [collapsedCards, setCollapsedCards] = useState<Set<string>>(new Set());

  // Set initial tab value
  useEffect(() => {
    if (!activeTab && isOpen) {
      // Use initialTab if provided, otherwise default based on live status
      setActiveTab(initialTab || (isLiveAnalysis ? "actions" : "insights"));
    }
  }, [isLiveAnalysis, isOpen, activeTab, initialTab]);

  // Handle navigation to insight tab for a specific agent
  const handleNavigateToInsight = (agentKey: string) => {
    setActiveTab("insights");
    // Optionally, we could scroll to the specific agent's insight
    // This would require adding an id to each insight card and using scrollIntoView
    setTimeout(() => {
      let elementId = `insight-${agentKey}`;

      // Special handling for Bull/Bear Researcher - navigate to Research Debate if it exists
      if ((agentKey === 'bullResearcher' || agentKey === 'bearResearcher') &&
        analysisData?.agent_insights?.researchDebate) {
        // Navigate to Research Debate instead (first round has the bull researcher ID)
        elementId = agentKey === 'bullResearcher' ? 'insight-bullResearcher' : 'insight-researchDebate';
      }

      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  // Check if analysis is stale (no update in 5+ minutes)
  const isAnalysisStale = () => {
    if (!analysisData?.updated_at) {
      console.log('No updated_at field in analysisData:', analysisData);
      return false;
    }
    const lastUpdate = new Date(analysisData.updated_at);
    const timeSinceUpdate = Date.now() - lastUpdate.getTime();
    const isStale = timeSinceUpdate > 5 * 60 * 1000; // 5 minutes

    console.log('Staleness check:', {
      updated_at: analysisData.updated_at,
      lastUpdate: lastUpdate.toISOString(),
      timeSinceUpdate: Math.round(timeSinceUpdate / 1000) + 's',
      isStale,
      status: analysisData.status
    });

    return isStale;
  };

  // Handle retry for error status
  const handleRetry = async () => {
    if (!analysisData?.id) return;

    setIsRetrying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to retry the analysis",
          variant: "destructive"
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('analysis-coordinator', {
        body: {
          analysisId: analysisData.id,
          userId: user.id
        }
      });

      // Check for error in response body first (for 200 status with error)
      if (data?.error) {
        throw new Error(data.error);
      }
      
      if (error) {
        // Try to extract error message from different sources
        let errorMessage: string | undefined;
        
        // Check if error has response data (some Supabase versions expose this)
        if ((error as any)?.response?.data?.error) {
          errorMessage = (error as any).response.data.error;
        } else if ((error as any)?.data?.error) {
          errorMessage = (error as any).data.error;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        throw new Error(errorMessage);
      }

      toast({
        title: "Retry initiated",
        description: "The analysis has been restarted from the failed point",
      });

      // Refresh the analysis data
      if (updateAnalysisData) {
        setTimeout(() => {
          window.location.reload(); // Simple refresh to get updated data
        }, 1000);
      }
    } catch (error: any) {
      console.error('Retry failed:', error);
      toast({
        title: "Retry failed",
        description: error.message || "Failed to retry the analysis",
        variant: "destructive"
      });
    } finally {
      setIsRetrying(false);
    }
  };

  // Handle reactivate for stale running status
  const handleReactivate = async () => {
    if (!analysisData?.id) return;

    setIsRetrying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please log in to reactivate the analysis",
          variant: "destructive"
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('analysis-coordinator', {
        body: {
          action: 'reactivate',
          analysisId: analysisData.id,
          userId: user.id,
          forceReactivate: false
        }
      });

      // Check for error in response body first (for 200 status with error)
      if (data?.error) {
        throw new Error(data.error);
      }
      
      if (error) {
        // Try to extract error message from different sources
        let errorMessage: string | undefined;
        
        // Check if error has response data (some Supabase versions expose this)
        if ((error as any)?.response?.data?.error) {
          errorMessage = (error as any).response.data.error;
        } else if ((error as any)?.data?.error) {
          errorMessage = (error as any).data.error;
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        throw new Error(errorMessage);
      }

      toast({
        title: "Analysis reactivated",
        description: "The analysis has been resumed from where it stalled",
      });

      // Refresh the analysis data
      if (updateAnalysisData) {
        setTimeout(() => {
          window.location.reload(); // Simple refresh to get updated data
        }, 1000);
      }
    } catch (error: any) {
      console.error('Reactivate failed:', error);
      toast({
        title: "Reactivation failed",
        description: error.message || "Failed to reactivate the analysis",
        variant: "destructive"
      });
    } finally {
      setIsRetrying(false);
    }
  };


  // Helper functions (keep these as they are not extracted yet)
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
      <DialogContentNoClose className="max-w-7xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-muted-foreground" />
              <DialogTitle className="text-xl font-semibold">
                {dialogTitle}
              </DialogTitle>
              {analysisData?.status === ANALYSIS_STATUS.RUNNING && (
                <Badge variant="running" className="text-sm">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  {getStatusDisplayText(ANALYSIS_STATUS.RUNNING)}
                </Badge>
              )}
              {analysisData?.status === ANALYSIS_STATUS.PENDING && (
                <Badge variant="pending" className="text-sm">
                  <Clock className="w-3 h-3 mr-1" />
                  {getStatusDisplayText(ANALYSIS_STATUS.PENDING)}
                </Badge>
              )}
              {analysisData?.status === ANALYSIS_STATUS.COMPLETED && (
                <Badge variant="completed" className="text-sm">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {getStatusDisplayText(ANALYSIS_STATUS.COMPLETED)}
                </Badge>
              )}
              {analysisData?.status === ANALYSIS_STATUS.ERROR && (
                <Badge variant="error" className="text-sm">
                  <XCircle className="w-3 h-3 mr-1" />
                  {getStatusDisplayText(ANALYSIS_STATUS.ERROR)}
                </Badge>
              )}
              {(analysisData?.status === ANALYSIS_STATUS.CANCELLED || analysisData?.status === REBALANCE_STATUS.CANCELLED) && (
                <Badge variant="pending" className="text-sm">
                  <XCircle className="w-3 h-3 mr-1" />
                  {getStatusDisplayText(ANALYSIS_STATUS.CANCELLED)}
                </Badge>
              )}
            </div>

            {/* Action buttons container */}
            <div className="flex items-center gap-2">
              {/* Retry/Reactivate Button */}
              {analysisData && (
                <>
                  {analysisData.status === ANALYSIS_STATUS.ERROR && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRetry}
                      disabled={isRetrying}
                      className="flex items-center gap-2"
                    >
                      {isRetrying ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Retry Analysis
                    </Button>
                  )}

                  {(() => {
                    const shouldShowReactivate = analysisData.status === ANALYSIS_STATUS.RUNNING && isAnalysisStale();
                    console.log('Reactivate button check:', {
                      status: analysisData.status,
                      isRunning: analysisData.status === ANALYSIS_STATUS.RUNNING,
                      isStale: isAnalysisStale(),
                      shouldShow: shouldShowReactivate,
                      ANALYSIS_STATUS
                    });

                    return shouldShowReactivate && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReactivate}
                        disabled={isRetrying}
                        className="flex items-center gap-2"
                        title={`Last updated ${formatDistanceToNow(new Date(analysisData.updated_at))} ago`}
                      >
                        {isRetrying ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <PlayCircle className="w-4 h-4" />
                        )}
                        Reactivate
                      </Button>
                    );
                  })()}
                </>
              )}
              
              {/* Close button */}
              <Button
                size="sm"
                variant="outline"
                className="border border-slate-700"
                onClick={() => onClose()}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogDescription className="mt-2 flex justify-between items-center">
            <span>
              {isLiveAnalysis
                ? "Real-time analysis progress and agent insights"
                : analysisDate
                  ? `Historical analysis from ${new Date(analysisDate).toLocaleDateString()}`
                  : "Analysis details and agent insights"}
            </span>
            {analysisData?.updated_at && (
              <span className="text-xs text-muted-foreground">
                Last updated: {formatDistanceToNow(new Date(analysisData.updated_at))} ago
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {error ? (
            <div className="p-6">
              <div className="rounded-lg border border-red-500 bg-red-50 dark:bg-red-900/20 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-red-900 dark:text-red-400">Analysis Error</h3>
                    <p className="text-sm text-red-800 dark:text-red-300 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading analysis data...</p>
            </div>
          ) : analysisData ? (
            <>
              {/* Analysis Summary Bar */}
              {(() => {
                // Debug to see what data we have
                console.log('Analysis Summary Bar - agent_insights:', analysisData.agent_insights);
                console.log('Analysis Summary Bar - portfolioManager:', analysisData.agent_insights?.portfolioManager);
                console.log('Analysis Summary Bar - tradeOrder:', analysisData.tradeOrder);
                
                // Always show portfolio manager's decision if available, otherwise fall back to the main decision
                // Check multiple possible locations for the portfolio manager's decision
                const displayDecision = analysisData.tradeOrder?.action ||  // From actual trade order
                                       analysisData.agent_insights?.portfolioManager?.finalDecision?.action || 
                                       analysisData.agent_insights?.portfolioManager?.decision?.action ||
                                       analysisData.agent_insights?.portfolioManager?.action ||
                                       analysisData.decision;
                
                console.log('Display decision resolved to:', displayDecision);

                const shouldShow = displayDecision || analysisData.confidence !== undefined || analysisData.startedAt;

                return shouldShow && (
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

                      {(displayDecision || analysisData?.status === ANALYSIS_STATUS.CANCELLED || analysisData?.status === REBALANCE_STATUS.CANCELLED) && (
                        <Badge
                          variant={getDecisionVariant((analysisData.status === ANALYSIS_STATUS.CANCELLED || analysisData.status === REBALANCE_STATUS.CANCELLED) ? 'CANCELED' : displayDecision)}
                          className="text-sm px-3 py-1 flex items-center gap-1"
                        >
                          {getDecisionIcon((analysisData.status === ANALYSIS_STATUS.CANCELLED || analysisData.status === REBALANCE_STATUS.CANCELLED) ? 'CANCELED' : displayDecision)}
                          {(analysisData.status === ANALYSIS_STATUS.CANCELLED || analysisData.status === REBALANCE_STATUS.CANCELLED) ? 'CANCELED' : displayDecision}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })()}

              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
                <div className="px-6 pt-4 pb-4">
                  <div className="relative flex items-center justify-center">
                    <TabsList className="grid w-full grid-cols-3 max-w-3xl">
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
                    </TabsList>
                    {activeTab === "insights" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (collapsedCards.size === 0) {
                            // Collapse all - need to get all agent keys
                            const allAgentKeys = new Set<string>();
                            if (analysisData?.agent_insights) {
                              Object.keys(analysisData.agent_insights).forEach(key => {
                                allAgentKeys.add(key);
                              });
                            }
                            setCollapsedCards(allAgentKeys);
                          } else {
                            // Expand all
                            setCollapsedCards(new Set());
                          }
                        }}
                        className="text-xs absolute right-0"
                      >
                        {collapsedCards.size === 0 ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Collapse All
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Expand All
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                <ScrollArea className="h-[calc(90vh-280px)]">
                  <div className="px-6 pb-6">
                    <TabsContent value="actions" className="mt-6 space-y-4">
                      <AnalysisActionsTab
                        analysisData={analysisData}
                        handleApproveOrder={handleApproveOrder}
                        handleRejectOrder={handleRejectOrder}
                        isOrderExecuted={isOrderExecuted}
                        isExecuting={isExecuting}
                        getConfidenceColor={getConfidenceColor}
                      />
                    </TabsContent>

                    <TabsContent value="workflow" className="mt-6">
                      {(analysisData.workflowSteps?.length > 0 || analysisData.full_analysis) ? (
                        <WorkflowStepsLayout
                          analysisData={analysisData}
                          onApproveOrder={handleApproveOrder}
                          onRejectOrder={handleRejectOrder}
                          isOrderExecuted={isOrderExecuted}
                          onNavigateToInsight={handleNavigateToInsight}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                          <Activity className="w-12 h-12 mb-4 opacity-20" />
                          <p>No workflow data available yet</p>
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="insights" className="mt-6 space-y-4">
                      <AnalysisInsightsTab
                        analysisData={analysisData}
                        getMessageIcon={getMessageIcon}
                        getAgentIcon={getAgentIcon}
                        formatAgentName={formatAgentName}
                        collapsedCards={collapsedCards}
                        setCollapsedCards={setCollapsedCards}
                      />
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
      </DialogContentNoClose>
    </Dialog>
  );
}