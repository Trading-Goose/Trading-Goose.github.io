import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { ANALYSIS_STATUS, REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { invokeWithRetry } from '../../_shared/invokeWithRetry.ts';
import { updateRebalanceWorkflowStep } from '../../_shared/atomicUpdate.ts';
/**
 * Retry all failed analyses within a rebalance request
 * This function finds all analyses with error status and retries them
 */ export async function handleRebalanceRetry(supabase, rebalanceRequestId, userId, apiSettings) {
  console.log(`🔄 Retry request for rebalance: ${rebalanceRequestId}`);
  try {
    // Fetch the rebalance request (security: ensure user owns this rebalance)
    const { data: rebalance, error: fetchError } = await supabase.from('rebalance_requests').select('*').eq('id', rebalanceRequestId).eq('user_id', userId).single();
    if (fetchError || !rebalance) {
      console.error('❌ Rebalance not found:', fetchError?.message);
      return createErrorResponse('Rebalance request not found', 404);
    }
    // Check if rebalance is in error state
    if (rebalance.status !== REBALANCE_STATUS.ERROR && rebalance.status !== 'error') {
      console.warn(`⚠️ Rebalance ${rebalanceRequestId} is not in error state: ${rebalance.status}`);
      return createErrorResponse(`Cannot retry rebalance that is not in error state. Current status: ${rebalance.status}`, 400);
    }
    console.log(`📋 Found failed rebalance - checking failure type`);
    // Check workflow steps to see what failed
    const workflowSteps = rebalance.workflow_steps || {};
    const opportunityFailed = workflowSteps.opportunity_analysis?.status === 'error';
    const portfolioManagerFailed = workflowSteps.portfolio_manager?.status === 'error';
    // Handle opportunity-agent failure
    if (opportunityFailed) {
      console.log('🔄 Opportunity agent failed - restarting rebalance from beginning');
      // Update rebalance status to RUNNING
      const { error: statusUpdateError } = await supabase.from('rebalance_requests').update({
        status: REBALANCE_STATUS.RUNNING,
        error_message: null,
        updated_at: new Date().toISOString()
      }).eq('id', rebalanceRequestId);
      if (statusUpdateError) {
        console.error('❌ Failed to update rebalance status:', statusUpdateError);
        return createErrorResponse('Failed to update rebalance status for retry');
      }
      // Restart the entire rebalance by re-invoking with start-rebalance action
      const result = await invokeWithRetry(supabase, 'rebalance-coordinator', {
        action: 'start-rebalance',
        rebalanceRequestId,
        userId,
        tickers: rebalance.selected_stocks || [],
        portfolioData: rebalance.portfolio_data,
        skipOpportunityAgent: false,
        rebalanceThreshold: rebalance.rebalance_threshold,
        constraints: rebalance.constraints
      });
      return createSuccessResponse({
        message: 'Restarting rebalance due to opportunity agent failure',
        rebalanceRequestId,
        restartedFromBeginning: true
      });
    }
    // Check for failed analyses first
    const { data: failedAnalyses, error: analysesError } = await supabase.from('analysis_history').select('id, ticker, analysis_status').eq('rebalance_request_id', rebalanceRequestId).eq('analysis_status', ANALYSIS_STATUS.ERROR);
    if (analysesError) {
      console.error('❌ Failed to fetch analyses:', analysesError);
      return createErrorResponse('Failed to fetch failed analyses', 500);
    }
    // Handle portfolio-manager failure
    if (portfolioManagerFailed) {
      // Check if there are failed analyses that need to be retried first
      if (failedAnalyses && failedAnalyses.length > 0) {
        console.log(`📋 Portfolio manager failed, but found ${failedAnalyses.length} failed analyses to retry first`);
        // Continue to retry the failed analyses below
      } else {
        // No failed analyses, so retry portfolio manager directly
        console.log('🔄 Portfolio manager failed with no failed analyses - retrying portfolio manager only');
        // Update rebalance status to RUNNING
        const { error: statusUpdateError } = await supabase.from('rebalance_requests').update({
          status: REBALANCE_STATUS.RUNNING,
          error_message: null,
          updated_at: new Date().toISOString()
        }).eq('id', rebalanceRequestId);
        if (statusUpdateError) {
          console.error('❌ Failed to update rebalance status:', statusUpdateError);
          return createErrorResponse('Failed to update rebalance status for retry');
        }
        // Reset portfolio manager workflow step to trigger re-invocation
        const portfolioResetResult = await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'portfolio_manager', 'pending', {
          retryStartedAt: new Date().toISOString(),
          message: 'Retrying portfolio manager'
        });
        if (!portfolioResetResult.success) {
          console.error('⚠️ Failed to reset portfolio manager step:', portfolioResetResult.error);
        }
        // Get any successful analysis to trigger the completion flow
        const { data: anyAnalysis } = await supabase.from('analysis_history').select('id, ticker').eq('rebalance_request_id', rebalanceRequestId).eq('analysis_status', ANALYSIS_STATUS.COMPLETED).limit(1).single();
        if (!anyAnalysis) {
          return createErrorResponse('Cannot retry portfolio manager - no successful analyses found', 400);
        }
        // Trigger analysis-completed action which will check if all are complete and re-invoke portfolio manager
        await invokeWithRetry(supabase, 'rebalance-coordinator', {
          action: 'analysis-completed',
          rebalanceRequestId,
          analysisId: anyAnalysis.id,
          ticker: anyAnalysis.ticker,
          userId,
          success: true,
          error: null
        });
        return createSuccessResponse({
          message: 'Retrying portfolio manager',
          rebalanceRequestId,
          portfolioManagerRetried: true
        });
      }
    }
    // Check if we have any failed analyses to retry
    if (!failedAnalyses || failedAnalyses.length === 0) {
      console.log('ℹ️ No failed analyses found in this rebalance');
      // Check if there are pending/running analyses that might be stale
      const { data: pendingAnalyses } = await supabase.from('analysis_history').select('id, ticker, analysis_status').eq('rebalance_request_id', rebalanceRequestId).in('analysis_status', [
        ANALYSIS_STATUS.PENDING,
        ANALYSIS_STATUS.RUNNING
      ]);
      if (pendingAnalyses && pendingAnalyses.length > 0) {
        console.log(`Found ${pendingAnalyses.length} pending/running analyses that might be stale`);
        // Could handle stale analyses here if needed
      }
      return createErrorResponse('No failed components found to retry in this rebalance', 400);
    }
    console.log(`🎯 Found ${failedAnalyses.length} failed analyses to retry`);
    // Update rebalance status to RUNNING
    console.log(`📝 Updating rebalance status from error to running`);
    const { error: statusUpdateError } = await supabase.from('rebalance_requests').update({
      status: REBALANCE_STATUS.RUNNING,
      error_message: null,
      updated_at: new Date().toISOString()
    }).eq('id', rebalanceRequestId);
    if (statusUpdateError) {
      console.error('❌ Failed to update rebalance status:', statusUpdateError);
      return createErrorResponse('Failed to update rebalance status for retry');
    }
    console.log(`✅ Updated rebalance status to running`);
    // Update workflow step to show retry in progress
    const workflowUpdateResult = await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'parallel_analysis', 'running', {
      retryStartedAt: new Date().toISOString(),
      retryingAnalyses: failedAnalyses.length,
      message: `Retrying ${failedAnalyses.length} failed analyses`
    });
    if (!workflowUpdateResult.success) {
      console.error('⚠️ Failed to update workflow step:', workflowUpdateResult.error);
    }
    // Retry each failed analysis
    const retryPromises = failedAnalyses.map(async (analysis) => {
      console.log(`🚀 Retrying analysis for ${analysis.ticker} (${analysis.id})`);
      try {
        // Call analysis-coordinator's retry handler
        const result = await invokeWithRetry(supabase, 'analysis-coordinator', {
          analysisId: analysis.id,
          userId: userId
        });
        if (!result.success) {
          console.error(`❌ Failed to retry analysis for ${analysis.ticker}:`, result.error);
          return {
            ticker: analysis.ticker,
            success: false,
            error: result.error
          };
        }
        console.log(`✅ Successfully initiated retry for ${analysis.ticker}`);
        return {
          ticker: analysis.ticker,
          success: true
        };
      } catch (error) {
        console.error(`❌ Exception retrying ${analysis.ticker}:`, error);
        return {
          ticker: analysis.ticker,
          success: false,
          error: error.message
        };
      }
    });
    // Wait for all retry attempts
    const retryResults = await Promise.all(retryPromises);
    // Count successes and failures
    const successfulRetries = retryResults.filter((r) => r.success);
    const failedRetries = retryResults.filter((r) => !r.success);
    console.log(`📊 Retry results:`);
    console.log(`   Successful: ${successfulRetries.length}/${failedAnalyses.length}`);
    console.log(`   Failed: ${failedRetries.length}/${failedAnalyses.length}`);
    if (failedRetries.length > 0) {
      console.warn('⚠️ Some retries failed:', failedRetries);
    }
    // Return success response with retry summary
    return createSuccessResponse({
      message: `Rebalance retry initiated for ${failedAnalyses.length} analyses`,
      rebalanceRequestId,
      totalRetried: failedAnalyses.length,
      successfulRetries: successfulRetries.length,
      failedRetries: failedRetries.length,
      retryDetails: retryResults
    });
  } catch (error) {
    console.error('❌ Rebalance retry failed with error:', error);
    return createErrorResponse(`Failed to retry rebalance: ${error.message}`, 500);
  }
}
