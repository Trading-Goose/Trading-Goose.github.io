import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { RebalancePortfolioManagerRequest } from './types/interfaces.ts';
import { fetchAlpacaPortfolio } from '../_shared/portfolio/alpacaClient.ts';
import { handleRebalancePortfolio } from './handlers/rebalance.ts';
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts';
import { checkRebalanceCancellation } from '../analysis-coordinator/utils/cancellation.ts';
import { REBALANCE_STATUS } from '../_shared/statusTypes.ts';
import { AgentRequest } from '../_shared/types.ts';
import { updateRebalanceWorkflowStep } from '../_shared/atomicUpdate.ts';

serve(async (req) => {
  let timeoutId: number | null = null;
  let rebalanceRequestId: string | undefined;
  let supabase: any;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Method not allowed'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200 // Return 200 so coordinator notifications work
      });
    }

    const request: AgentRequest & RebalancePortfolioManagerRequest = await req.json();
    const {
      tickers,
      userId,
      apiSettings,
      riskManagerDecisions,
      constraints
    } = request;
    rebalanceRequestId = request.rebalanceRequestId;

    if (!userId || !apiSettings || !rebalanceRequestId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameters'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200 // Return 200 so coordinator notifications work
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseServiceKey);

    const retryStatus = getRetryStatus(request);
    console.log(`🔄 Rebalance Portfolio Manager starting for rebalance request ${rebalanceRequestId} (${retryStatus})`);

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      {
        functionName: 'rebalance-portfolio-manager',
        maxRetries: 3,
        timeoutMs: 180000,
        retryDelay: 3000   // 3 second delay between retries
      },
      'Rebalance Portfolio Manager'
    );

    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

    // Check if rebalance has been canceled before starting work
    const cancellationCheck = await checkRebalanceCancellation(supabase, rebalanceRequestId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 Rebalance Portfolio Manager stopped: ${cancellationCheck.reason}`);
      return new Response(JSON.stringify({
        success: false,
        message: `Rebalance Portfolio Manager stopped: ${cancellationCheck.reason}`,
        canceled: cancellationCheck.isCanceled
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Check if rebalance request still exists (deletion check)
    const { data: rebalanceRequest, error: rebalanceError } = await supabase
      .from('rebalance_requests')
      .select('id, status')
      .eq('id', rebalanceRequestId)
      .single();

    if (rebalanceError || !rebalanceRequest) {
      console.log(`🛑 Rebalance Portfolio Manager stopped: Rebalance request not found (likely deleted)`);
      return new Response(JSON.stringify({
        success: false,
        message: 'Rebalance Portfolio Manager stopped: Rebalance request not found (likely deleted)',
        canceled: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Log context details
    console.log(`📋 REBALANCE CONTEXT:`);
    console.log(`  - Rebalance Request ID: ${rebalanceRequestId}`);
    console.log(`  - Tickers to rebalance: ${tickers?.join(', ')}`);
    console.log(`  - Number of risk decisions: ${Object.keys(riskManagerDecisions || {}).length}`);
    console.log(`  - Risk decisions:`, JSON.stringify(riskManagerDecisions, null, 2));

    // Fetch portfolio data from Alpaca with error handling
    let portfolioData;
    try {
      portfolioData = await fetchAlpacaPortfolio(apiSettings);
    } catch (alpacaError) {
      console.error('❌ Failed to fetch Alpaca portfolio:', alpacaError);

      // Determine if it's an API key issue or other Alpaca error
      let errorType: 'api_key' | 'data_fetch' = 'data_fetch';
      if (alpacaError.message?.includes('401') || alpacaError.message?.includes('Unauthorized') ||
        alpacaError.message?.includes('API key') || alpacaError.message?.includes('authentication')) {
        errorType = 'api_key';
      }

      // Update workflow step to error status
      await updateRebalanceWorkflowStep(
        supabase,
        rebalanceRequestId,
        'portfolio_management',
        'error',
        {
          error: `Alpaca portfolio fetch failed: ${alpacaError.message || 'Unknown error'}`,
          errorType: errorType,
          timestamp: new Date().toISOString()
        }
      );

      // Update rebalance request status
      await supabase
        .from('rebalance_requests')
        .update({
          status: REBALANCE_STATUS.ERROR,
          completed_at: new Date().toISOString(),
          error_message: `Portfolio Manager error (${errorType}): Failed to fetch portfolio data from Alpaca - ${alpacaError.message}`,
        })
        .eq('id', rebalanceRequestId);

      throw new Error(`Failed to fetch portfolio data: ${alpacaError.message}`);
    }

    // Handle rebalance portfolio
    const result = await handleRebalancePortfolio(
      supabase,
      rebalanceRequestId,
      tickers || [],
      userId,
      apiSettings,
      portfolioData,
      constraints,
      riskManagerDecisions
    );

    // Clear timeout on successful completion
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Rebalance Portfolio Manager', 'completed successfully');
    }

    // Add retry info to the response
    if (result.headers.get('Content-Type')?.includes('application/json')) {
      const responseBody = await result.json();
      return new Response(JSON.stringify({
        ...responseBody,
        retryInfo: retryStatus
      }), {
        headers: result.headers,
        status: result.status
      });
    }

    return result;

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Rebalance Portfolio Manager', 'error occurred');
    }

    console.error('❌ Rebalance Portfolio Manager error:', error);

    // If we have a rebalance request ID and supabase client, update the error status
    if (rebalanceRequestId && supabase) {
      // Determine error type
      let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'timeout' | 'other' = 'other';
      let errorMessage = error.message || 'Unknown error';

      if (error.message?.includes('rate limit') || error.message?.includes('quota') ||
        error.message?.includes('insufficient_quota') || error.message?.includes('429') ||
        error.message?.includes('requires more credits') || error.message?.includes('can only afford')) {
        errorType = 'rate_limit';
      } else if (error.message?.includes('API key') || error.message?.includes('api_key') ||
        error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        errorType = 'api_key';
      } else if (error.message?.includes('AI provider') || error.message?.includes('model') ||
        error.message?.includes('callAIProvider')) {
        errorType = 'ai_error';
      } else if (error.message?.includes('fetch') || error.message?.includes('network') ||
        error.message?.includes('Alpaca') || error.message?.includes('portfolio')) {
        errorType = 'data_fetch';
      } else if (error.message?.includes('database') || error.message?.includes('supabase')) {
        errorType = 'database';
      } else if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
        errorType = 'timeout';
      }

      // Update workflow step to error status
      const workflowUpdateResult = await updateRebalanceWorkflowStep(
        supabase,
        rebalanceRequestId,
        'portfolio_management',
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

      // Update rebalance request status to error
      const { error: statusUpdateError } = await supabase
        .from('rebalance_requests')
        .update({
          status: REBALANCE_STATUS.ERROR,
          completed_at: new Date().toISOString(),
          error_message: `Portfolio Manager error (${errorType}): ${errorMessage}`,
        })
        .eq('id', rebalanceRequestId);

      if (statusUpdateError) {
        console.error('❌ Failed to update rebalance status to ERROR:', statusUpdateError);
        // Try again with simpler update
        const { error: retryError } = await supabase
          .from('rebalance_requests')
          .update({
            status: REBALANCE_STATUS.ERROR,
            error_message: `Portfolio Manager error: ${errorMessage}`,
            completed_at: new Date().toISOString()
          })
          .eq('id', rebalanceRequestId);
        
        if (retryError) {
          console.error('❌ Retry also failed:', retryError);
        }
      }

      // Notify rebalance-coordinator about the error
      console.log('🔄 Notifying rebalance-coordinator of portfolio manager error');
      
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('rebalance-coordinator', {
          body: {
            action: 'rebalance-error',
            rebalanceRequestId,
            userId,
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

    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200 // Return 200 so coordinator notifications work
    });
  }
});// Deployment trigger: Rebalance Portfolio Manager created