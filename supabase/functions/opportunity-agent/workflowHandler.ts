import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { updateRebalanceWorkflowStep } from '../_shared/atomicUpdate.ts';
import { REBALANCE_STATUS } from '../_shared/statusTypes.ts';
import { AgentRequest } from '../_shared/types.ts';
import { OpportunityEvaluation } from './types.ts';

/**
 * Handle workflow updates for rebalance requests
 */
export async function handleWorkflowUpdates(
  rebalanceRequestId: string | undefined,
  request: AgentRequest,
  opportunities: OpportunityEvaluation
): Promise<void> {
  // If this is part of a rebalance workflow, update the rebalance request directly
  if (!rebalanceRequestId) return;

  console.log(`📝 Updating rebalance request with opportunity evaluation`);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) return;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Update rebalance request with opportunity evaluation results
  await supabase
    .from('rebalance_requests')
    .update({
      opportunity_reasoning: opportunities,
      updated_at: new Date().toISOString()
    })
    .eq('id', rebalanceRequestId);

  console.log(`💡 Opportunity evaluation saved to rebalance request`);

  // Update workflow step as completed
  await updateRebalanceWorkflowStep(
    supabase,
    rebalanceRequestId,
    'opportunity_analysis',
    'completed',
    opportunities
  );

  // Notify rebalance-coordinator that opportunity agent is complete
  console.log(`🔄 Notifying rebalance-coordinator of opportunity agent completion`);

  supabase.functions.invoke('rebalance-coordinator', {
    body: {
      action: 'opportunity-completed',
      rebalanceRequestId,
      userId: request.userId,
      apiSettings: request.apiSettings,
      selectedStocks: opportunities.selectedStocks,
      recommendAnalysis: opportunities.recommendAnalysis
    }
  }).then(() => {
    console.log('✅ Successfully notified rebalance-coordinator');
  }).catch((error: any) => {
    console.error('❌ Failed to notify rebalance-coordinator:', error);
    // Still return success - the evaluation was completed
  });
}

/**
 * Handle workflow errors for rebalance requests
 */
export async function handleWorkflowError(
  rebalanceRequestId: string | undefined,
  error: any
): Promise<void> {
  if (!rebalanceRequestId) return;

  console.log('📝 Updating rebalance workflow status to failed');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) return;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Determine error type
  let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'timeout' | 'other' = 'other';
  let errorMessage = error.message || 'Unknown error';

  if (error.message?.includes('rate limit') || error.message?.includes('quota') ||
    error.message?.includes('insufficient_quota') || error.message?.includes('429') ||
    error.message?.includes('requires more credits') || error.message?.includes('can only afford')) {
    errorType = 'rate_limit';
  } else if (error.message?.includes('API key') || error.message?.includes('api_key') ||
    error.message?.includes('Unauthorized') || error.message?.includes('401') ||
    error.message?.includes('No API key configured')) {
    errorType = 'api_key';
  } else if (error.message?.includes('AI provider') || error.message?.includes('model') ||
    error.message?.includes('empty response') || error.message?.includes('invalid JSON') ||
    error.message?.includes('callAIProvider')) {
    errorType = 'ai_error';
  } else if (error.message?.includes('fetch') || error.message?.includes('network') ||
    error.message?.includes('Alpaca') || error.message?.includes('market data')) {
    errorType = 'data_fetch';
  } else if (error.message?.includes('database') || error.message?.includes('supabase') ||
    error.message?.includes('insert') || error.message?.includes('update')) {
    errorType = 'database';
  } else if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
    errorType = 'timeout';
  } else if (error['errorType']) {
    // Use error type if already categorized
    errorType = error['errorType'];
  }

  // Update workflow step status to error with proper error tracking
  const workflowUpdateResult = await updateRebalanceWorkflowStep(
    supabase,
    rebalanceRequestId,
    'opportunity_analysis',
    'error',
    {
      error: errorMessage,
      errorType: errorType,
      timestamp: new Date().toISOString()
    }
  );

  if (!workflowUpdateResult.success) {
    console.error('Failed to update workflow step status:', workflowUpdateResult.error);
  }

  // Store detailed error information
  const { error: statusUpdateError } = await supabase
    .from('rebalance_requests')
    .update({
      status: REBALANCE_STATUS.ERROR,
      completed_at: new Date().toISOString(),
      error_message: `Opportunity agent error (${errorType}): ${errorMessage}`,
      opportunity_reasoning: {
        error: errorMessage,
        errorType: errorType,
        timestamp: new Date().toISOString(),
        recommendAnalysis: false,
        selectedStocks: [],
        reasoning: `Failed to complete opportunity analysis: ${errorMessage}`,
        estimatedCost: 0,
        marketConditions: { trend: 'unknown', volatility: 'unknown', keyEvents: [] }
      }
    })
    .eq('id', rebalanceRequestId);

  if (statusUpdateError) {
    console.error('❌ Failed to update rebalance status to ERROR:', statusUpdateError);
    // Try again with simpler update
    const { error: retryError } = await supabase
      .from('rebalance_requests')
      .update({
        status: REBALANCE_STATUS.ERROR,
        error_message: `Opportunity agent error: ${errorMessage}`,
        completed_at: new Date().toISOString()
      })
      .eq('id', rebalanceRequestId);
    
    if (retryError) {
      console.error('❌ Retry also failed:', retryError);
    }
  }

  // Notify rebalance-coordinator about the error
  console.log('🔄 Notifying rebalance-coordinator of opportunity agent error');
  
  try {
    const { data, error: invokeError } = await supabase.functions.invoke('rebalance-coordinator', {
      body: {
        action: 'opportunity-error',
        rebalanceRequestId,
        error: errorMessage,
        errorType: errorType
      }
    });

    if (invokeError) {
      console.error('❌ Failed to notify rebalance-coordinator of error:', invokeError);
    } else {
      console.log('✅ Successfully notified rebalance-coordinator of error');
    }
  } catch (notifyError) {
    console.error('❌ Exception notifying rebalance-coordinator:', notifyError);
  }
}