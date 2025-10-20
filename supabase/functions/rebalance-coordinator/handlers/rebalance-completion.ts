import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { checkAndExecuteAutoTrades } from '../../_shared/autoTradeChecker.ts';
/**
 * Handle final rebalance completion
 * This is called when rebalance-portfolio-manager completes
 */ export async function handleRebalanceCompletion(supabase, rebalanceRequestId, userId, apiSettings) {
  console.log(`🎆 Handling final rebalance completion for ${rebalanceRequestId}`);
  try {
    // Check and execute auto-trades if enabled
    const autoTradeResult = await checkAndExecuteAutoTrades(supabase, userId, 'rebalance', rebalanceRequestId);
    if (autoTradeResult.autoTradeEnabled) {
      console.log(`🤖 Auto-trade executed for rebalance: ${autoTradeResult.ordersExecuted} orders`);
      if (autoTradeResult.errors.length > 0) {
        console.error(`⚠️ Auto-trade errors:`, autoTradeResult.errors);
      }
    }
    // Get existing metadata to merge with new data
    const { data: existingReq } = await supabase.from('rebalance_requests').select('metadata').eq('id', rebalanceRequestId).single();
    const existingMetadata = existingReq?.metadata || {};
    // Mark rebalance as completed (portfolio manager no longer does this)
    const { error: updateError } = await supabase.from('rebalance_requests').update({
      status: REBALANCE_STATUS.COMPLETED,
      completed_at: new Date().toISOString(),
      metadata: {
        ...existingMetadata,
        autoTradeEnabled: autoTradeResult.autoTradeEnabled,
        ordersAutoExecuted: autoTradeResult.ordersExecuted,
        autoTradeErrors: autoTradeResult.errors
      }
    }).eq('id', rebalanceRequestId);
    if (updateError) {
      console.error('❌ Failed to mark rebalance as completed:', updateError);
      return createErrorResponse(`Failed to mark rebalance as completed: ${updateError.message}`);
    }
    // Update final workflow step
    try {
      await supabase.rpc('update_rebalance_workflow_step', {
        p_request_id: rebalanceRequestId,
        p_step_name: 'portfolio_manager',
        p_step_status: 'completed',
        p_step_data: {
          completedAt: new Date().toISOString(),
          message: 'Rebalance portfolio management completed successfully'
        }
      });
    } catch (workflowError) {
      console.error('❌ Failed to update final workflow step:', workflowError);
      // Don't fail the completion - this is just for UI tracking
    }
    console.log(`✅ Rebalance ${rebalanceRequestId} marked as completed`);
    return createSuccessResponse({
      message: 'Rebalance completed successfully',
      rebalanceRequestId,
      status: REBALANCE_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
      autoTradeEnabled: autoTradeResult.autoTradeEnabled,
      ordersExecuted: autoTradeResult.ordersExecuted,
      autoTradeErrors: autoTradeResult.errors
    });
  } catch (error) {
    console.error('❌ Error in rebalance completion:', error);
    // Mark rebalance as failed
    try {
      await supabase.from('rebalance_requests').update({
        status: REBALANCE_STATUS.ERROR,
        error_message: `Completion error: ${error.message}`,
        completed_at: new Date().toISOString()
      }).eq('id', rebalanceRequestId);
    } catch (markError) {
      console.error('❌ Failed to mark rebalance as failed:', markError);
    }
    return createErrorResponse(`Error in rebalance completion: ${error.message}`);
  }
}
