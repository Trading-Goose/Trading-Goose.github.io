/**
 * Helper functions for checking and managing analysis state
 */

import { supabase } from '@/lib/supabase';
import {
  ANALYSIS_STATUS,
  convertLegacyAnalysisStatus,
  isAnalysisActive
} from '@/lib/statusTypes';

interface CheckRunningAnalysesParams {
  user: any;
  previousRunningRef: React.MutableRefObject<Set<string>>;
  activeAnalysisTicker: string | null;
  updateWorkflowFromAnalysis: (analysis: any) => boolean;
  setCurrentAnalysis: (analysis: any) => void;
  setActiveAnalysisTicker: (ticker: string | null) => void;
  setIsAnalyzing: (value: boolean) => void;
  setRunningAnalysesCount: (count: number) => void;
}

export async function checkRunningAnalyses({
  user,
  previousRunningRef,
  activeAnalysisTicker,
  updateWorkflowFromAnalysis,
  setCurrentAnalysis,
  setActiveAnalysisTicker,
  setIsAnalyzing,
  setRunningAnalysesCount
}: CheckRunningAnalysesParams) {
  const running = new Set<string>();

  // Check database for running analyses if user is authenticated
  if (user) {
    try {
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
        .eq('user_id', user!.id)
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
}