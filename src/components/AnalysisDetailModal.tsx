import React from "react";
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
  X,
  PieChart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import HorizontalWorkflow from "./HorizontalWorkflow";
import WorkflowVisualization from "./WorkflowVisualization";
import MarkdownRenderer from "./MarkdownRenderer";
import MessageRenderer from "./MessageRenderer";
import { formatDistanceToNow } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface AnalysisDetailModalProps {
  ticker?: string;
  analysisId?: string; // Can open directly with analysisId
  isOpen: boolean;
  onClose: () => void;
  analysisDate?: string; // Optional: for viewing historical analyses
}

// Import extracted components
import TradeOrderCard from "./analysis-detail/TradeOrderCard";
import WorkflowStepsLayout from "./analysis-detail/WorkflowStepsLayout";
import AnalysisActionsTab from "./analysis-detail/AnalysisActionsTab";
import AnalysisInsightsTab from "./analysis-detail/AnalysisInsightsTab";
import { useAnalysisData } from "./analysis-detail/hooks/useAnalysisData";
import { useOrderActions } from "./analysis-detail/hooks/useOrderActions";
import { getStatusIcon, getDecisionIcon, getDecisionVariant } from "./analysis-detail/utils/statusHelpers";


export default function AnalysisDetailModal({ ticker, analysisId, isOpen, onClose, analysisDate }: AnalysisDetailModalProps) {
  // Use extracted custom hooks
  const { analysisData, loading, error, isLiveAnalysis, updateAnalysisData, setError } = useAnalysisData({
    ticker,
    analysisId,
    analysisDate,
    isOpen
  });
  
  const { isOrderExecuted, handleApproveOrder, handleRejectOrder } = useOrderActions({
    analysisData,
    updateAnalysisData
  });


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
              {(() => {
                // Determine which decision to display based on analysis type
                const isRebalanceAnalysis = !!analysisData.rebalance_request_id;
                const displayDecision = isRebalanceAnalysis 
                  ? analysisData.decision 
                  : (analysisData.agent_insights?.portfolioManager?.finalDecision?.action || analysisData.decision);
                
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
                      
                        {(displayDecision || analysisData?.status === 'canceled') && (
                          <Badge 
                            variant={getDecisionVariant(analysisData.status === 'canceled' ? 'CANCELED' : displayDecision)} 
                            className="text-sm px-3 py-1 flex items-center gap-1"
                          >
                            {getDecisionIcon(analysisData.status === 'canceled' ? 'CANCELED' : displayDecision)}
                            {analysisData.status === 'canceled' ? 'CANCELED' : displayDecision}
                          </Badge>
                      )}
                  </div>
                </div>
                );
              })()}

              <Tabs defaultValue={isLiveAnalysis ? "actions" : "insights"} className="flex-1">
                <div className="px-6 pt-4 pb-4">
                  <TabsList className="grid w-full grid-cols-3 max-w-3xl mx-auto">
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
                </div>

                <ScrollArea className="h-[calc(90vh-280px)]">
                  <div className="px-6 pb-6">
                    <TabsContent value="actions" className="mt-6 space-y-4">
                      <AnalysisActionsTab 
                        analysisData={analysisData}
                        handleApproveOrder={handleApproveOrder}
                        handleRejectOrder={handleRejectOrder}
                        isOrderExecuted={isOrderExecuted}
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
      </DialogContent>
    </Dialog>
  );
}