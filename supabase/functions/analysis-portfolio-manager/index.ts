import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AnalysisPortfolioManagerRequest } from './types/interfaces.ts';
import { fetchAlpacaPortfolio } from '../_shared/portfolio/alpacaClient.ts';
import { handleIndividualAnalysis } from './handlers/individual.ts';
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts';
import { updateWorkflowStepStatus, updateAnalysisPhase, setAgentToError } from '../_shared/atomicUpdate.ts';
import { checkAnalysisCancellation } from '../_shared/cancellationCheck.ts';
import { ANALYSIS_STATUS } from '../_shared/statusTypes.ts';
import { AgentRequest } from '../_shared/types.ts';
import {
  createMethodNotAllowedResponse,
  createMissingParametersResponse,
  createCanceledResponse,
  createSuccessResponse,
  createErrorResponse,
  createApiErrorResponse,
  createConfigurationErrorResponse
} from '../_shared/responseHelpers.ts';

serve(async (req) => {
  let timeoutId: number | null = null;
  let analysisId: string | null = null;
  let requestContext: {
    ticker?: string;
    userId?: string;
    apiSettings?: any;
  } = {};

  try {
    if (req.method !== 'POST') {
      return createMethodNotAllowedResponse();
    }

    const request: AgentRequest & AnalysisPortfolioManagerRequest = await req.json();
    const {
      analysisId: requestAnalysisId,
      ticker,
      userId,
      apiSettings
    } = request;

    requestContext = { ticker, userId, apiSettings };

    // Store analysisId for error handling
    analysisId = requestAnalysisId;

    if (!userId || !apiSettings || !analysisId || !ticker) {
      const missingParams = [];
      if (!userId) missingParams.push('userId');
      if (!apiSettings) missingParams.push('apiSettings');
      if (!analysisId) missingParams.push('analysisId');
      if (!ticker) missingParams.push('ticker');
      return createMissingParametersResponse(missingParams);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const retryStatus = getRetryStatus(request);
    console.log(`📊 Analysis Portfolio Manager starting for ${ticker} (${retryStatus})`);

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      {
        functionName: 'analysis-portfolio-manager',
        maxRetries: 3,
        timeoutMs: 180000,
        retryDelay: 3000   // 3 second delay between retries
      },
      'Analysis Portfolio Manager'
    );

    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

    // Check if analysis has been canceled before starting work
    const cancellationCheck = await checkAnalysisCancellation(supabase, analysisId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 Analysis Portfolio Manager stopped: ${cancellationCheck.reason}`);
      return createCanceledResponse(
        `Analysis Portfolio Manager stopped: ${cancellationCheck.reason}`,
        cancellationCheck.isCanceled
      );
    }

    // Check if analysis still exists by trying to update it (deletion check)
    const updateResult = await updateAnalysisPhase(supabase, analysisId, 'Analysis Portfolio Manager processing', {
      agent: 'Analysis Portfolio Manager',
      message: 'Processing individual stock portfolio recommendations',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // If analysis phase update fails, it likely means analysis was deleted
    if (!updateResult.success) {
      console.log(`🛑 Analysis Portfolio Manager stopped: ${updateResult.error}`);
      return createCanceledResponse(
        `Analysis Portfolio Manager stopped: ${updateResult.error}`,
        true
      );
    }

    // Log context details
    console.log(`📋 INDIVIDUAL ANALYSIS CONTEXT:`);
    console.log(`  - Analysis ID: ${analysisId}`);
    console.log(`  - Ticker: ${ticker}`);
    // Fetch portfolio data from Alpaca
    const portfolioData = await fetchAlpacaPortfolio(apiSettings);

    // Handle individual stock analysis
    const result = await handleIndividualAnalysis(
      supabase,
      analysisId,
      ticker,
      userId,
      apiSettings,
      portfolioData
    );

    // Clear timeout on successful completion
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Analysis Portfolio Manager', 'completed successfully');
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
      clearAgentTimeout(timeoutId, 'Analysis Portfolio Manager', 'error occurred');
    }

    console.error('❌ Analysis Portfolio Manager critical error:', error);

    // If we have analysisId, mark the analysis as failed (like risk-manager)
    if (analysisId) {
      console.log('❌ Analysis Portfolio Manager failed - marking analysis as failed');

      // Initialize Supabase client for error handling
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      try {
        // Determine error type
        let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'timeout' | 'other' = 'other';
        const errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('rate limit') || errorMessage.includes('quota') || errorMessage.includes('insufficient_quota')) {
          errorType = 'rate_limit';
        } else if (errorMessage.includes('API key') || errorMessage.includes('api_key') || errorMessage.includes('invalid key') || errorMessage.includes('Incorrect API key')) {
          errorType = 'api_key';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          errorType = 'timeout';
        } else if (errorMessage.includes('database') || errorMessage.includes('supabase')) {
          errorType = 'database';
        } else if (errorMessage.includes('Alpaca') || errorMessage.includes('portfolio') || errorMessage.includes('fetch')) {
          errorType = 'data_fetch';
        }

        // Use setAgentToError for consistent error handling
        await setAgentToError(
          supabase,
          analysisId,
          'portfolio',
          'Analysis Portfolio Manager',
          errorMessage,
          errorType,
          requestContext.ticker,
          requestContext.userId,
          requestContext.apiSettings
        );

        // Also mark analysis as failed
        await supabase
          .from('analysis_history')
          .update({
            analysis_status: ANALYSIS_STATUS.ERROR,
            decision: 'ERROR',
            confidence: 0
          })
          .eq('id', analysisId);

        console.log('✅ Analysis marked as failed - retry will be available');
      } catch (updateError) {
        console.error('Failed to mark analysis as failed:', updateError);
      }
    }

    // Determine the type of error and provide helpful message
    if (error.message.includes('API key') || error.message.includes('api_key') || error.message.includes('invalid key')) {
      return createApiErrorResponse('Trading API', 'key');
    } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
      return createApiErrorResponse('Trading API', 'quota');
    } else if (error.message.includes('Alpaca') || error.message.includes('portfolio')) {
      return createErrorResponse('Failed to fetch portfolio data. Please check your Alpaca API configuration.', 200);
    } else if (error.message.includes('Supabase') || error.message.includes('database')) {
      return createErrorResponse('Database error occurred during portfolio analysis. Please try again.', 200);
    } else if (error.message.includes('SUPABASE_URL') || error.message.includes('SERVICE_ROLE_KEY')) {
      return createConfigurationErrorResponse('Server');
    } else {
      return createErrorResponse(
        `Portfolio analysis failed: ${error.message}`,
        200,
        { criticalError: true }
      );
    }
  }
});// Deployment trigger: Analysis Portfolio Manager created
