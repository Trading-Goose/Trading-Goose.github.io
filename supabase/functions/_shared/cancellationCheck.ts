/**
 * Cancellation check utilities for Supabase Edge Functions
 * Prevents agents from continuing work on canceled analyses
 */

import { ANALYSIS_STATUS } from './statusTypes.ts';

export interface CancellationResult {
  isCanceled: boolean;
  shouldContinue: boolean;
  reason?: string;
}

/**
 * Check if an analysis has been canceled by the user
 * @param supabase - Supabase client
 * @param analysisId - Analysis ID to check
 * @returns CancellationResult indicating if analysis should continue
 */
export async function checkAnalysisCancellation(
  supabase: any,
  analysisId: string
): Promise<CancellationResult> {
  try {
    console.log(`🔍 Checking cancellation status for analysis ${analysisId}`);
    
    // Don't use .single() to avoid errors when no rows exist
    const { data: analyses, error } = await supabase
      .from('analysis_history')
      .select('analysis_status')
      .eq('id', analysisId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error checking cancellation:', error);
      // If we can't check, assume we should continue (fail-safe)
      return {
        isCanceled: false,
        shouldContinue: true,
        reason: 'Unable to check cancellation status'
      };
    }

    // Handle no results (analysis doesn't exist)
    if (!analyses || analyses.length === 0) {
      console.warn(`Analysis ${analysisId} not found during cancellation check`);
      // Analysis doesn't exist - it may have been deleted
      return {
        isCanceled: false,
        shouldContinue: false,
        reason: 'Analysis not found - may have been deleted'
      };
    }
    
    // Handle multiple results (shouldn't happen but be safe)
    if (analyses.length > 1) {
      console.warn(`⚠️ Multiple analyses found with same ID - using most recent`);
    }
    
    const analysis = analyses[0];
    const isCanceled = analysis.analysis_status === ANALYSIS_STATUS.CANCELED;
    
    if (isCanceled) {
      console.log(`🛑 Analysis ${analysisId} has been canceled`);
      return {
        isCanceled: true,
        shouldContinue: false,
        reason: 'User canceled the analysis'
      };
    }
    
    // Check for other terminal states
    // NOTE: ERROR state should NOT prevent agents from running during retry
    // Only COMPLETED state should stop agents
    if (analysis.analysis_status === ANALYSIS_STATUS.COMPLETED) {
      return {
        isCanceled: false,
        shouldContinue: false,
        reason: 'Analysis already completed'
      };
    }

    // Analysis exists and is not in a terminal state - can continue
    console.log(`✅ Analysis ${analysisId} can continue (status: ${analysis.analysis_status})`);
    return {
      isCanceled: false,
      shouldContinue: true
    };

  } catch (error) {
    console.error('Exception during cancellation check:', error);
    // If there's an exception, assume we should continue (fail-safe)
    return {
      isCanceled: false,
      shouldContinue: true,
      reason: 'Exception during cancellation check'
    };
  }
}

/**
 * Mark an analysis as canceled with proper status updates
 * @param supabase - Supabase client
 * @param analysisId - Analysis ID to cancel
 * @param reason - Reason for cancellation
 */
export async function markAnalysisAsCanceled(
  supabase: any,
  analysisId: string,
  reason: string = 'Canceled during execution'
): Promise<void> {
  try {
    console.log(`🛑 Marking analysis ${analysisId} as canceled: ${reason}`);
    
    // First get current analysis to preserve existing data
    const { data: currentAnalysis } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();

    const existingMessages = currentAnalysis?.full_analysis?.messages || [];
    
    await supabase
      .from('analysis_history')
      .update({
        analysis_status: ANALYSIS_STATUS.CANCELLED,
        full_analysis: {
          ...currentAnalysis?.full_analysis,
          canceledAt: new Date().toISOString(),
          currentPhase: 'Canceled',
          cancelReason: reason,
          messages: [
            ...existingMessages,
            {
              agent: 'System',
              message: `Analysis canceled: ${reason}`,
              timestamp: new Date().toISOString(),
              type: 'info'
            }
          ]
        }
      })
      .eq('id', analysisId);

    console.log(`✅ Analysis ${analysisId} marked as canceled`);
  } catch (error) {
    console.error('Error marking analysis as canceled:', error);
    throw error;
  }
}