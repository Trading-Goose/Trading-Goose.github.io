import { RequestBody, ApiSettings, AnalysisContext } from '../types/index.ts';
import { fetchApiSettings } from '../utils/api-settings.ts';
import { checkAndHandleCancellation } from '../utils/cancellation-handler.ts';
import { fetchAnalysisData } from '../utils/analysis-fetcher.ts';
import { startSingleAnalysis } from './analysis-handler.ts';
import { handleAgentCompletion } from './agent-completion-handler.ts';
import { handlePortfolioRouting } from './portfolio-routing.ts';
import { retryFailedAnalysis } from './retry-handler.ts';
import { reactivateStaleAnalysis } from './reactivate-handler.ts';
import { initializePhase } from './phase-initialization.ts';
import { handleDebateRoundCompletion } from './debate-handler.ts';
import { 
  createOptionsResponse, createMethodNotAllowedResponse,
  createErrorResponse, createSuccessResponse,
} from '../utils/response-helpers.ts';
/**
 * Main request handler for the analysis-coordinator function
 * Handles individual stock analysis workflow requests
 */
interface AuthContext {
  userId: string | null;
  isServiceRequest: boolean;
}

function normalizeUserId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'object') {
    const candidateKeys = ['id', 'user_id', 'userId', 'uuid', 'value'];
    for (const key of candidateKeys) {
      const candidate = (value as Record<string, unknown>)[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
  }

  return null;
}

export async function handleAnalysisRequest(
  req: Request,
  supabase: any,
  authContext: AuthContext
): Promise<Response> {
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return createOptionsResponse();
  }
  
  if (req.method !== 'POST') {
    return createMethodNotAllowedResponse();
  }
  
  try {
    const body: RequestBody = await req.json();
    const {
      action,
      analysisId,
      ticker,
      userId,
      phase,
      agent,
      analysisContext,
      error,
      errorType,
      completionType,
      failedToInvoke,
      riskManagerDecision,
      apiSettings: passedApiSettings  // Extract apiSettings from body
    } = body;

    const { userId: authUserId, isServiceRequest } = authContext;
    let resolvedUserId: string | null = null;

    if (isServiceRequest) {
      resolvedUserId = normalizeUserId(userId);
      if (!resolvedUserId) {
        return createErrorResponse('Service requests must include userId');
      }
    } else {
      if (!authUserId) {
        return createErrorResponse('Authentication required', 401);
      }

      const providedUserId = normalizeUserId(userId);
      if (providedUserId && providedUserId !== authUserId) {
        return createErrorResponse('User mismatch', 403);
      }

      resolvedUserId = authUserId;
    }

    // Use passed apiSettings if provided, otherwise fetch from database
    let apiSettings: ApiSettings | null = passedApiSettings || null;
    if (!apiSettings && resolvedUserId) {
      const { settings, error } = await fetchApiSettings(supabase, resolvedUserId);
      if (error) return error;
      apiSettings = settings;
    }
    
    // Handle action-based requests (new pattern)
    if (action) {
      switch (action) {
        case 'start-analysis':
          if (!ticker || !resolvedUserId || !apiSettings) {
            return createErrorResponse(
              'Missing required parameters for start-analysis'
            );
          }
          return await startSingleAnalysis(supabase, resolvedUserId, ticker, apiSettings, analysisContext);
          
        case 'reactivate':
          if (!analysisId || !resolvedUserId || !apiSettings) {
            return createErrorResponse(
              'Missing required parameters for reactivate action'
            );
          }
          // Extract forceReactivate flag from body if provided
          const forceReactivate = (body as any).forceReactivate === true;
          return await reactivateStaleAnalysis(supabase, analysisId, resolvedUserId, apiSettings, forceReactivate);
          
        case 'agent-completion':
          // Handle agent completion callback
          if (!analysisId || !ticker || !resolvedUserId || !phase || !agent || !apiSettings) {
            return createErrorResponse(
              'Missing required parameters for agent-completion'
            );
          }
          return await handleAgentCompletion(
            supabase,
            phase,
            agent,
            analysisId,
            ticker,
            resolvedUserId,
            apiSettings,
            analysisContext,
            error,
            errorType,
            completionType,
            failedToInvoke
          );
          
        default:
          return createErrorResponse(`Unknown action: ${action}`);
      }
    }
    
    // Handle legacy requests (no phase/agent specified)
    if (!phase && !agent) {
      // Check if this is a retry request (has analysisId but no ticker)
      if (analysisId && !ticker) {
        if (!resolvedUserId || !apiSettings) {
          return createErrorResponse(
            'Missing required parameters for retry request'
          );
        }
        return await retryFailedAnalysis(supabase, analysisId, resolvedUserId, apiSettings);
      }
      
      // Otherwise it's a new analysis request
      if (!ticker || !resolvedUserId || !apiSettings) {
        return createErrorResponse(
          'Missing required parameters for new analysis'
        );
      }
      return await startSingleAnalysis(supabase, resolvedUserId, ticker, apiSettings, analysisContext);
    }
    
    // Handle agent callbacks
    if (!analysisId || !ticker || !resolvedUserId || !phase || !apiSettings) {
      return createErrorResponse(
        'Missing required parameters for agent callback'
      );
    }
    
    return await handleAgentCallback(
      supabase,
      analysisId,
      ticker,
      resolvedUserId,
      phase,
      agent,
      apiSettings,
      analysisContext,
      error,
      errorType,
      completionType,
      failedToInvoke
    );
    
  } catch (error: any) {
    console.error('❌ Request handling error:', error);
    return createErrorResponse(
      error.message || 'Internal server error'
    );
  }
}

/**
 * Handle agent callback requests for individual stock analysis
 */
async function handleAgentCallback(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  phase: string,
  agent: string | undefined,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext,
  error?: string,
  errorType?: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'other',
  completionType?: 'normal' | 'last_in_phase' | 'fallback_invocation_failed',
  failedToInvoke?: string
): Promise<Response> {
  
  console.log(`🎯 Analysis coordinator callback: phase=${phase}, agent=${agent}, context=${analysisContext?.type || 'individual'}`);
  
  // Check cancellation status
  const cancellationResponse = await checkAndHandleCancellation(supabase, analysisId, analysisContext);
  if (cancellationResponse) {
    return cancellationResponse;
  }
  
  // Get current analysis state
  const analysisData = await fetchAnalysisData(supabase, analysisId);
  
  // If analysis not found, it may have been deleted
  if (!analysisData) {
    console.log(`⚠️ Analysis ${analysisId} not found - may have been deleted`);
    return createErrorResponse(
      `Analysis not found - it may have been deleted or completed`
    );
  }
  
  const { analysis, fullAnalysis } = analysisData;
  
  // Handle research debate rounds
  if (phase === 'research' && agent === 'check-debate-rounds') {
    return await handleDebateRoundCompletion(
      supabase,
      analysisId,
      ticker,
      userId,
      apiSettings,
      fullAnalysis,
      analysisContext
    );
  }
  
  // Handle agent completion
  if (agent) {
    return await handleAgentCompletion(
      supabase,
      phase,
      agent,
      analysisId,
      ticker,
      userId,
      apiSettings,
      analysisContext,
      error,
      errorType,
      completionType,
      failedToInvoke
    );
  }
  
  // Start new phase by launching its first agent
  if (phase === 'portfolio') {
    // Handle portfolio routing decisions from risk completion
    if (analysisContext?.source === 'risk-completion') {
      return await handlePortfolioRouting(
        supabase,
        analysisId,
        ticker,
        userId,
        apiSettings,
        analysisContext
      );
    }
    
    // Analysis Portfolio Manager has completed - this is the final step for individual analyses
    console.log('🎆 Analysis Portfolio Manager completed - analysis workflow finished');
    
    return createSuccessResponse({
      message: 'Analysis Portfolio Manager completed - analysis workflow finished',
      analysisComplete: true
    });
  }
  
  // Initialize other phases
  return await initializePhase(
    supabase,
    phase,
    analysisId,
    ticker,
    userId,
    apiSettings,
    analysisContext
  );
}
