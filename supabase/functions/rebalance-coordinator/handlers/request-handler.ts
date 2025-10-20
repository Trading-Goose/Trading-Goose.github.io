import { handleRebalanceStart } from './rebalance-start.ts';
import { handleAnalysisCompletion } from './analysis-completion.ts';
import { handleRebalanceCompletion } from './rebalance-completion.ts';
import { fetchApiSettings } from '../utils/api-settings.ts';
import { REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { updateRebalanceWorkflowStep } from '../../_shared/atomicUpdate.ts';
import { createOptionsResponse, createMethodNotAllowedResponse, createErrorResponse } from '../utils/response-helpers.ts';
export async function handleRebalanceRequest(req, supabase, authContext) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return createOptionsResponse();
  }
  if (req.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }
  try {
    const body = await req.json();
    const { action, rebalanceRequestId, userId, tickers, portfolioData, skipOpportunityAgent, skipThresholdCheck, rebalanceThreshold, constraints, analysisId, ticker, success, error, riskManagerDecision } = body;
    const { userId: authUserId, isServiceRequest } = authContext;
    let resolvedUserId = userId;
    if (isServiceRequest) {
      if (!resolvedUserId) {
        return createErrorResponse('Service requests must include userId', 400);
      }
    } else {
      if (!authUserId) {
        return createErrorResponse('Authentication required', 401);
      }
      if (resolvedUserId && resolvedUserId !== authUserId) {
        return createErrorResponse('User mismatch', 403);
      }
      resolvedUserId = authUserId;
    }
    console.log(`🔄 Rebalance coordinator request: action=${action}, rebalanceId=${rebalanceRequestId}`);
    // Fetch API settings if userId is provided
    let apiSettings = null;
    if (resolvedUserId) {
      const { settings, error: settingsError } = await fetchApiSettings(supabase, resolvedUserId);
      if (settingsError) {
        // If this is a rebalance-related action and we have a rebalanceRequestId,
        // update the status to ERROR before returning
        if (rebalanceRequestId && (action === 'start-rebalance' || action === 'retry-rebalance')) {
          console.error(`❌ API settings error for rebalance ${rebalanceRequestId}, updating status to ERROR`);
          const { error: updateError } = await supabase.from('rebalance_requests').update({
            status: REBALANCE_STATUS.ERROR,
            error_message: 'Failed to fetch API settings: No AI provider configured or API key missing',
            completed_at: new Date().toISOString()
          }).eq('id', rebalanceRequestId);
          if (updateError) {
            console.error('❌ Failed to update rebalance status to ERROR:', updateError);
          }
          // Also update workflow step if starting
          if (action === 'start-rebalance') {
            await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'initialization', 'error', {
              error: 'No AI provider configured or API key missing',
              errorType: 'api_config',
              timestamp: new Date().toISOString()
            });
          }
        }
        return settingsError;
      }
      apiSettings = settings;
    }
    // Route to appropriate handler based on action
    switch (action) {
      case 'start-rebalance':
        if (!resolvedUserId || !apiSettings) {
          return createErrorResponse('Missing userId or API settings for rebalance start', 400);
        }
        return await handleRebalanceStart(supabase, resolvedUserId, rebalanceRequestId, tickers || [], apiSettings, portfolioData, skipOpportunityAgent, skipThresholdCheck, rebalanceThreshold, constraints);
      case 'analysis-completed':
        if (!rebalanceRequestId || !analysisId || !ticker || !resolvedUserId || !apiSettings) {
          return createErrorResponse('Missing required parameters for analysis completion', 400);
        }
        return await handleAnalysisCompletion(supabase, rebalanceRequestId, analysisId, ticker, resolvedUserId, apiSettings, success || false, error);
      case 'complete-rebalance':
        if (!rebalanceRequestId || !resolvedUserId || !apiSettings) {
          return createErrorResponse('Missing required parameters for rebalance completion', 400);
        }
        return await handleRebalanceCompletion(supabase, rebalanceRequestId, resolvedUserId, apiSettings);
      case 'opportunity-completed':
        if (!rebalanceRequestId || !resolvedUserId) {
          return createErrorResponse('Missing required parameters for opportunity completion', 400);
        }
        const { handleOpportunityCompletion } = await import('./opportunity-completion.ts');
        return await handleOpportunityCompletion(supabase, rebalanceRequestId, resolvedUserId, apiSettings, body.selectedStocks, body.recommendAnalysis);
      case 'retry-rebalance':
        if (!rebalanceRequestId || !resolvedUserId || !apiSettings) {
          return createErrorResponse('Missing required parameters for rebalance retry', 400);
        }
        const { handleRebalanceRetry } = await import('./rebalance-retry.ts');
        return await handleRebalanceRetry(supabase, rebalanceRequestId, resolvedUserId, apiSettings);
      case 'opportunity-error':
        if (!rebalanceRequestId || !error) {
          return createErrorResponse('Missing required parameters for opportunity error', 400);
        }
        const { handleOpportunityError } = await import('./opportunity-error.ts');
        return await handleOpportunityError(supabase, rebalanceRequestId, error, body.errorType);
      case 'rebalance-error':
        if (!rebalanceRequestId || !error || !resolvedUserId) {
          return createErrorResponse('Missing required parameters for rebalance error', 400);
        }
        const { handleRebalanceError } = await import('./portfolio-error.ts');
        return await handleRebalanceError(supabase, rebalanceRequestId, resolvedUserId, error, body.errorType);
      default:
        return createErrorResponse(`Unknown action: ${action}`, 400);
    }
  } catch (error) {
    console.error('❌ Rebalance coordinator request handling error:', error);
    return createErrorResponse(error.message || 'Internal server error');
  }
}
