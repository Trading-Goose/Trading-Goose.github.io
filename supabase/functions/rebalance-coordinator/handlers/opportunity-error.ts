import { REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { updateRebalanceWorkflowStep } from '../../_shared/atomicUpdate.ts';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
/**
 * Handle opportunity agent error notification
 * This function is called when the opportunity-agent encounters an error
 * and needs to ensure the rebalance status is properly set to ERROR
 */ export async function handleOpportunityError(supabase, rebalanceRequestId, errorMessage, errorType) {
  console.log(`❌ Handling opportunity agent error for rebalance: ${rebalanceRequestId}`);
  console.log(`   Error: ${errorMessage}`);
  console.log(`   Type: ${errorType || 'unknown'}`);
  try {
    // Update workflow step to error if not already done
    const workflowUpdateResult = await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'opportunity_analysis', 'error', {
      error: errorMessage,
      errorType: errorType || 'unknown',
      timestamp: new Date().toISOString(),
      handledBy: 'rebalance-coordinator'
    });
    if (!workflowUpdateResult.success) {
      console.error('⚠️ Failed to update workflow step:', workflowUpdateResult.error);
    }
    // Ensure rebalance status is set to ERROR
    // Use multiple attempts with increasing simplicity
    let updateSuccessful = false;
    // First attempt: Full update with all details
    const { error: fullUpdateError } = await supabase.from('rebalance_requests').update({
      status: REBALANCE_STATUS.ERROR,
      completed_at: new Date().toISOString(),
      error_message: `Opportunity agent error (${errorType || 'unknown'}): ${errorMessage}`,
      opportunity_reasoning: {
        error: errorMessage,
        errorType: errorType || 'unknown',
        timestamp: new Date().toISOString(),
        recommendAnalysis: false,
        selectedStocks: [],
        reasoning: `Failed to complete opportunity analysis: ${errorMessage}`,
        handledBy: 'rebalance-coordinator'
      }
    }).eq('id', rebalanceRequestId);
    if (!fullUpdateError) {
      updateSuccessful = true;
      console.log('✅ Successfully updated rebalance status to ERROR (full update)');
    } else {
      console.error('⚠️ Full update failed:', fullUpdateError);
      // Second attempt: Simpler update without opportunity_reasoning
      const { error: simpleUpdateError } = await supabase.from('rebalance_requests').update({
        status: REBALANCE_STATUS.ERROR,
        error_message: `Opportunity agent error: ${errorMessage}`,
        completed_at: new Date().toISOString()
      }).eq('id', rebalanceRequestId);
      if (!simpleUpdateError) {
        updateSuccessful = true;
        console.log('✅ Successfully updated rebalance status to ERROR (simple update)');
      } else {
        console.error('⚠️ Simple update also failed:', simpleUpdateError);
        // Third attempt: Minimal update - just status
        const { error: minimalUpdateError } = await supabase.from('rebalance_requests').update({
          status: REBALANCE_STATUS.ERROR
        }).eq('id', rebalanceRequestId);
        if (!minimalUpdateError) {
          updateSuccessful = true;
          console.log('✅ Successfully updated rebalance status to ERROR (minimal update)');
        } else {
          console.error('❌ All update attempts failed:', minimalUpdateError);
        }
      }
    }
    if (!updateSuccessful) {
      // Log the failure but still return success to prevent infinite loops
      console.error('❌ CRITICAL: Unable to set rebalance status to ERROR');
      // Try to at least log this in analysis_messages for debugging
      await supabase.from('analysis_messages').insert({
        analysis_id: rebalanceRequestId,
        agent_name: 'rebalance-coordinator',
        message: `CRITICAL: Failed to set rebalance status to ERROR for opportunity agent error: ${errorMessage}`,
        message_type: 'error',
        metadata: {
          errorType: errorType || 'unknown',
          originalError: errorMessage,
          timestamp: new Date().toISOString()
        }
      }).catch((logError) => {
        console.error('❌ Even logging failed:', logError);
      });
    }
    return createSuccessResponse({
      message: 'Opportunity error handled',
      rebalanceRequestId,
      status: REBALANCE_STATUS.ERROR,
      errorHandled: updateSuccessful
    });
  } catch (error) {
    console.error('❌ Exception in opportunity error handler:', error);
    return createErrorResponse(`Failed to handle opportunity error: ${error.message}`);
  }
}
