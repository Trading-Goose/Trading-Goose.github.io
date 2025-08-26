/**
 * Hook for managing analysis state and real-time updates
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { checkRunningAnalyses } from './helpers/analysisChecker';

export function useAnalysisState(updateWorkflowFromAnalysis: (analysis: any) => boolean) {
  const { user } = useAuth();
  const [currentAnalysis, setCurrentAnalysis] = useState<any>(null);
  const [activeAnalysisTicker, setActiveAnalysisTicker] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [runningAnalysesCount, setRunningAnalysesCount] = useState(0);
  const [isRebalanceContext, setIsRebalanceContext] = useState(false);
  const previousRunningRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleCheckRunningAnalyses = async () => {
      await checkRunningAnalyses({
        user,
        previousRunningRef,
        activeAnalysisTicker,
        updateWorkflowFromAnalysis,
        setCurrentAnalysis,
        setActiveAnalysisTicker,
        setIsAnalyzing,
        setRunningAnalysesCount
      });
    };

    handleCheckRunningAnalyses();
    // Check periodically - every 10 seconds instead of 2 seconds
    const interval = setInterval(handleCheckRunningAnalyses, 10000);

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
  }, [user, updateWorkflowFromAnalysis]);  // Include updateWorkflowFromAnalysis in deps

  return {
    currentAnalysis,
    setCurrentAnalysis,
    activeAnalysisTicker,
    setActiveAnalysisTicker,
    isAnalyzing,
    setIsAnalyzing,
    runningAnalysesCount,
    isRebalanceContext,
    setIsRebalanceContext
  };
}