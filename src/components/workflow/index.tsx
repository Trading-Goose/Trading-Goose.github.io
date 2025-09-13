/**
 * Main HorizontalWorkflow component - orchestrates the workflow visualization
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRBAC } from '@/hooks/useRBAC';
import { useToast } from '@/hooks/use-toast';
import AnalysisDetailModal from '@/components/AnalysisDetailModal';

// Import custom hooks
import { useRebalanceCheck } from './hooks/useRebalanceCheck';
import { useAnalysisState } from './hooks/useAnalysisState';
import { useWorkflowData } from './hooks/useWorkflowData';

// Import components
import { AnalysisControls } from './components/AnalysisControls';
import { WorkflowSteps } from './components/WorkflowSteps';
import { AgentStatusDetails } from './components/AgentStatusDetails';
import { StepDetailDialog } from './components/StepDetailDialog';
import { AlertDialogs } from './components/AlertDialogs';

// Import services
import { startAnalysis } from './services/analysisService';

// Import types
import type { WorkflowStep } from './types';

function HorizontalWorkflow() {
  const { user } = useAuth();
  const { getMaxParallelAnalysis } = useRBAC();
  const { toast } = useToast();
  
  // Local state
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [searchTicker, setSearchTicker] = useState('');
  const [showAnalysisDetail, setShowAnalysisDetail] = useState(false);
  const [showLimitAlert, setShowLimitAlert] = useState(false);
  const [showRebalanceAlert, setShowRebalanceAlert] = useState(false);

  const maxParallelAnalysis = getMaxParallelAnalysis();

  // Use custom hooks
  const { hasRunningRebalance } = useRebalanceCheck();
  
  // Note: We need to pass setIsRebalanceContext first to get updateWorkflowFromAnalysis
  const [isRebalanceContext, setIsRebalanceContext] = useState(false);
  const { workflowData, updateWorkflowFromAnalysis } = useWorkflowData(setIsRebalanceContext);
  
  const {
    currentAnalysis,
    setCurrentAnalysis,
    activeAnalysisTicker,
    setActiveAnalysisTicker,
    isAnalyzing,
    setIsAnalyzing,
    runningAnalysesCount,
    isInitialLoading
  } = useAnalysisState(updateWorkflowFromAnalysis);

  // Handle starting a new analysis
  const handleStartAnalysis = async () => {
    if (!searchTicker || !user) {
      toast({
        title: "Cannot Start Analysis",
        description: "Please enter a stock ticker",
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
    
    // Immediately show "Starting analysis" state
    setIsAnalyzing(true);
    setActiveAnalysisTicker(ticker);
    setIsRebalanceContext(false);
    
    // Clear the search field immediately
    setSearchTicker('');
    
    // Show starting toast
    toast({
      title: "Starting Analysis",
      description: `Initializing AI analysis for ${ticker}...`,
    });

    // Now make the API call
    const result = await startAnalysis({ ticker, userId: user.id });

    if (result.success) {
      // Open the detail modal
      setShowAnalysisDetail(true);

      // Set current analysis with the ID if returned
      if (result.analysisId) {
        setCurrentAnalysis({ id: result.analysisId, ticker });
      }

      // Update toast to show success
      toast({
        title: "Analysis Started",
        description: `Running AI analysis for ${ticker} on the server`,
      });
    } else {
      // On failure, reset the UI state
      setIsAnalyzing(false);
      setActiveAnalysisTicker(null);
      
      toast({
        title: "Analysis Failed",
        description: result.error || "Failed to start analysis",
        variant: "destructive",
      });
    }
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
          {/* Stock search bar for starting analysis */}
          <AnalysisControls
            activeAnalysisTicker={activeAnalysisTicker}
            isAnalyzing={isAnalyzing}
            searchTicker={searchTicker}
            setSearchTicker={setSearchTicker}
            handleStartAnalysis={handleStartAnalysis}
            setShowAnalysisDetail={setShowAnalysisDetail}
            isInitialLoading={isInitialLoading}
          />

          {/* Horizontal workflow steps */}
          <WorkflowSteps
            workflowData={workflowData}
            isRebalanceContext={isRebalanceContext}
            setSelectedStep={setSelectedStep}
          />

          {/* Expandable agent status details */}
          <AgentStatusDetails
            workflowData={workflowData}
            isRebalanceContext={isRebalanceContext}
            isAnalyzing={isAnalyzing}
            activeAnalysisTicker={activeAnalysisTicker}
          />
        </CardContent>
      </Card>

      {/* Step Detail Dialog */}
      <StepDetailDialog
        selectedStep={selectedStep}
        onClose={() => setSelectedStep(null)}
      />

      {/* Analysis Detail Modal */}
      {activeAnalysisTicker && (
        <AnalysisDetailModal
          ticker={activeAnalysisTicker}
          isOpen={showAnalysisDetail}
          onClose={() => setShowAnalysisDetail(false)}
          analysisId={currentAnalysis?.id}
        />
      )}

      {/* Alert Dialogs */}
      <AlertDialogs
        showLimitAlert={showLimitAlert}
        setShowLimitAlert={setShowLimitAlert}
        showRebalanceAlert={showRebalanceAlert}
        setShowRebalanceAlert={setShowRebalanceAlert}
        maxParallelAnalysis={maxParallelAnalysis}
        runningAnalysesCount={runningAnalysesCount}
      />
    </>
  );
}

export default React.memo(HorizontalWorkflow);