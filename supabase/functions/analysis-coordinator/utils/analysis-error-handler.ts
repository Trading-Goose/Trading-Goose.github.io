import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';
import { invokeWithRetry } from '../../_shared/invokeWithRetry.ts';

/**
 * Unified method to mark an analysis as ERROR and notify rebalance-coordinator if needed
 * This eliminates code duplication and ensures consistent error handling
 */
export async function markAnalysisAsErrorWithRebalanceCheck(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: any,
  errorReason: string,
  additionalData?: {
    decision?: string;
    confidence?: number;
  }
): Promise<{ success: boolean; rebalanceNotified?: boolean; error?: string }> {
  try {
    console.log(`❌ Marking analysis ${analysisId} as ERROR: ${errorReason}`);
    
    // Fetch existing context so we preserve prior decision/confidence when clearing errors
    let rebalanceRequestId: string | null = null;
    let existingDecision: string | null = null;
    let existingConfidence: number | null = null;

    const { data: analysisRecord, error: fetchError } = await supabase
      .from('analysis_history')
      .select('rebalance_request_id, decision, confidence')
      .eq('id', analysisId)
      .single();

    if (fetchError) {
      console.warn(`⚠️ Could not fetch existing analysis context before marking error:`, fetchError);
    } else if (analysisRecord) {
      rebalanceRequestId = analysisRecord.rebalance_request_id ?? null;
      existingDecision = typeof analysisRecord.decision === 'string' ? analysisRecord.decision : null;
      existingConfidence = typeof analysisRecord.confidence === 'number' ? analysisRecord.confidence : null;
    }

    const decisionToPersist = additionalData?.decision
      ?? existingDecision
      ?? 'PENDING';

    const confidenceToPersist = additionalData?.confidence
      ?? (typeof existingConfidence === 'number' ? existingConfidence : 0);

    // Update the analysis status to ERROR but keep prior decision/confidence when available
    const { error: updateError } = await supabase
      .from('analysis_history')
      .update({ 
        analysis_status: ANALYSIS_STATUS.ERROR,
        decision: decisionToPersist,
        confidence: confidenceToPersist,
        updated_at: new Date().toISOString()
      })
      .eq('id', analysisId);
    
    if (updateError) {
      console.error(`❌ Failed to mark analysis as ERROR:`, updateError);
      return { success: false, error: updateError.message };
    }
    
    console.log(`✅ Analysis marked as ERROR successfully`);
    
    if (rebalanceRequestId) {
      console.log(`📊 Analysis is part of rebalance ${rebalanceRequestId} - notifying rebalance-coordinator`);
      
      const notifyResult = await invokeWithRetry(
        supabase,
        'rebalance-coordinator',
        {
          action: 'analysis-completed',
          rebalanceRequestId,
          analysisId,
          ticker,
          userId,
          apiSettings,
          success: false,
          error: errorReason
        }
      );

      if (!notifyResult.success) {
        console.error(`❌ Failed to notify rebalance-coordinator:`, notifyResult.error);
        return { success: true, rebalanceNotified: false };
      }

      console.log(`✅ Rebalance-coordinator notified of analysis failure`);
      return { success: true, rebalanceNotified: true };
    }
    
    return { success: true, rebalanceNotified: false };
  } catch (error) {
    console.error(`❌ Failed to mark analysis as ERROR:`, error);
    return { success: false, error: error.message };
  }
}
