import { CancellationCheckResult } from '../types/index.ts';
import { checkAnalysisCancellation } from '../../_shared/cancellationCheck.ts';
import { ANALYSIS_STATUS, REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { invokeWithRetry } from '../../_shared/invokeWithRetry.ts';

// Re-export the shared cancellation check for analysis
export { checkAnalysisCancellation };

/**
 * Check if a rebalance request has been canceled
 */
export async function checkRebalanceCancellation(
  supabase: any,
  rebalanceRequestId: string
): Promise<CancellationCheckResult> {
  try {
    console.log(`🔍 Checking rebalance cancellation status for ${rebalanceRequestId}`);
    
    const { data: rebalance, error } = await supabase
      .from('rebalance_requests')
      .select('status')
      .eq('id', rebalanceRequestId)
      .single();

    if (error) {
      console.error('Error checking rebalance cancellation:', error);
      return {
        isCanceled: false,
        shouldContinue: true,
        reason: 'Unable to check cancellation status'
      };
    }

    if (!rebalance) {
      console.warn('Rebalance request not found during cancellation check');
      return {
        isCanceled: false,
        shouldContinue: false,
        reason: 'Rebalance request not found'
      };
    }

    const isCanceled = rebalance.status === REBALANCE_STATUS.CANCELLED;

    if (isCanceled) {
      console.log(`🛑 Rebalance ${rebalanceRequestId} has been canceled`);
      return {
        isCanceled: true,
        shouldContinue: false,
        reason: 'Rebalance canceled by user'
      };
    }

    console.log(`✅ Rebalance ${rebalanceRequestId} is active, continuing...`);
    return {
      isCanceled: false,
      shouldContinue: true
    };

  } catch (error) {
    console.error('Exception during rebalance cancellation check:', error);
    return {
      isCanceled: false,
      shouldContinue: true,
      reason: 'Exception during cancellation check'
    };
  }
}

/**
 * Check both analysis and rebalance cancellation status
 * - First checks if the specific analysis was cancelled
 * - If analysis is cancelled AND it's part of a rebalance, notifies rebalance-coordinator
 * - If analysis is not cancelled but parent rebalance is cancelled, cancels the analysis
 */
export async function checkCombinedCancellation(
  supabase: any,
  analysisId: string
): Promise<CancellationCheckResult> {
  // Check analysis cancellation first
  const analysisCancellation = await checkAnalysisCancellation(supabase, analysisId);
  
  if (!analysisCancellation.shouldContinue) {
    console.log(`🛑 Analysis ${analysisId} is cancelled: ${analysisCancellation.reason}`);
    
    // Check if this cancelled analysis is part of a rebalance
    const { data: analysisData } = await supabase
      .from('analysis_history')
      .select('rebalance_request_id, ticker, user_id')
      .eq('id', analysisId)
      .single();
    
    if (analysisData?.rebalance_request_id) {
      // This analysis was cancelled AND it's part of a rebalance
      // Notify rebalance-coordinator about the cancellation
      console.log(`📊 Analysis ${analysisId} is part of rebalance ${analysisData.rebalance_request_id} - notifying rebalance-coordinator`);
      
      const notifyResult = await invokeWithRetry(
        supabase,
        'rebalance-coordinator',
        {
          action: 'analysis-completed',
          rebalanceRequestId: analysisData.rebalance_request_id,
          analysisId,
          ticker: analysisData.ticker,
          userId: analysisData.user_id,
          success: false,
          error: 'Analysis cancelled by user'
        }
      );

      if (!notifyResult.success) {
        console.error('❌ Failed to notify rebalance-coordinator of analysis cancellation:', notifyResult.error);
      }
    }
    
    return analysisCancellation;
  }
  
  // Analysis is not cancelled, but check if it's part of a rebalance that might be cancelled
  const { data: analysisData } = await supabase
    .from('analysis_history')
    .select('rebalance_request_id, full_analysis')
    .eq('id', analysisId)
    .single();
  
  if (analysisData?.rebalance_request_id) {
    // This analysis is part of a rebalance, check if the rebalance is cancelled
    const rebalanceCheck = await checkRebalanceCancellation(supabase, analysisData.rebalance_request_id);
    if (!rebalanceCheck.shouldContinue) {
      console.log(`🛑 Parent rebalance ${analysisData.rebalance_request_id} is cancelled - cancelling analysis ${analysisId}`);
      
      // Mark the analysis as cancelled due to parent rebalance cancellation
      await supabase
        .from('analysis_history')
        .update({
          analysis_status: ANALYSIS_STATUS.CANCELLED,
          full_analysis: {
            ...(analysisData?.full_analysis || {}),
            canceledAt: new Date().toISOString(),
            cancelReason: 'Parent rebalance cancelled'
          }
        })
        .eq('id', analysisId);
      
      return {
        isCanceled: true,
        shouldContinue: false,
        reason: 'Parent rebalance cancelled'
      };
    }
  }
  
  // Neither analysis nor its parent rebalance (if any) are cancelled
  return analysisCancellation;
}
