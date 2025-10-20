import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { appendAnalysisMessage, updateAgentInsights, updateWorkflowStepStatus, updateAnalysisPhase, setAgentToError } from '../_shared/atomicUpdate.ts'
import { checkAnalysisCancellation } from '../_shared/cancellationCheck.ts'
import { notifyCoordinatorAsync } from '../_shared/coordinatorNotification.ts'
import { invokeNextAgentInSequence } from '../_shared/phaseProgressChecker.ts'
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts'
import { checkAgentCompletion, checkForBlockingOperations } from '../_shared/agentCompletionCheck.ts'
import { AgentRequest } from '../_shared/types.ts'
import { callPerplefina } from '../_shared/perplefinaClient.ts'
import {
  createMethodNotAllowedResponse,
  createMissingParametersResponse,
  createCanceledResponse,
  createSuccessResponse,
  createErrorResponse,
  createApiErrorResponse
} from '../_shared/responseHelpers.ts'

const NEWS_RETRY_CONFIG = {
  functionName: 'agent-news-analyst',
  maxRetries: 3,
  timeoutMs: 180000, // keep under Supabase's ~200s hard limit
  retryDelay: 3000
} as const;

serve(async (req) => {
  let timeoutId: number | null = null;

  try {
    if (req.method !== 'POST') {
      return createMethodNotAllowedResponse();
    }

    const request: AgentRequest = await req.json();
    const { analysisId, ticker, userId, apiSettings, analysisContext } = request;

    if (!analysisId || !ticker || !userId || !apiSettings) {
      const missingParams = [];
      if (!analysisId) missingParams.push('analysisId');
      if (!ticker) missingParams.push('ticker');
      if (!userId) missingParams.push('userId');
      if (!apiSettings) missingParams.push('apiSettings');
      return createMissingParametersResponse(missingParams);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const retryStatus = getRetryStatus(request);
    console.log(`📰 News Analyst starting for ${ticker} (${retryStatus})`);
    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

    // Check if this agent has already completed for this analysis
    // Check if this is a retry attempt (from retry count in request)
    const isRetryAttempt = request.retryCount !== undefined && request.retryCount > 0;
    
    const completionStatus = await checkAgentCompletion(
      supabase,
      analysisId,
      'agent-news-analyst',
      'News Analyst',
      isRetryAttempt
    );
    
    if (completionStatus.hasCompleted && completionStatus.status === 'completed') {
      console.log(`✅ News Analyst already completed for analysis ${analysisId}`);
      console.log(`   Skipping duplicate execution to save API calls`);
      
      // Return the existing insights if available
      return createSuccessResponse({
        agent: 'News Analyst',
        message: 'Agent already completed for this analysis',
        alreadyCompleted: true,
        existingInsights: completionStatus.existingInsights,
        retryInfo: retryStatus
      });
    }
    
    // Don't check for "already running" - the coordinator handles that before invocation
    // The agent will see itself as "running" because the coordinator marks it as such
    // Only check for "already completed" to avoid re-doing work
    
    // Check for any blocking operations
    const blockingCheck = await checkForBlockingOperations(supabase, analysisId, 'agent-news-analyst');
    if (!blockingCheck.canProceed) {
      console.log(`🛑 News Analyst cannot proceed: ${blockingCheck.reason}`);
      return createCanceledResponse(
        `News Analyst cannot proceed: ${blockingCheck.reason}`,
        true
      );
    }

    // Debug token values
    console.log(`🔍 DEBUG: apiSettings.analysis_max_tokens = ${apiSettings.analysis_max_tokens}`);
    console.log(`🔍 DEBUG: typeof apiSettings.analysis_max_tokens = ${typeof apiSettings.analysis_max_tokens}`);
    if (apiSettings.analysis_max_tokens > 10000) {
      console.warn(`⚠️ WARNING: Extremely high analysis_max_tokens detected: ${apiSettings.analysis_max_tokens}`);
      console.log(`🔍 DEBUG: Full apiSettings:`, JSON.stringify(apiSettings, null, 2));
    }

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      NEWS_RETRY_CONFIG,
      'News Analyst'
    );

    // Check if analysis has been canceled before starting work
    const cancellationCheck = await checkAnalysisCancellation(supabase, analysisId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 News Analyst stopped: ${cancellationCheck.reason}`);
      return createCanceledResponse(
        `News Analyst stopped: ${cancellationCheck.reason}`,
        cancellationCheck.isCanceled
      );
    }

    // Update analysis status
    const updateResult = await updateAnalysisPhase(supabase, analysisId, 'News Analyst analyzing recent news', {
      agent: 'News Analyst',
      message: 'Analyzing recent news and press releases using Perplefina',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // If analysis phase update fails, it likely means analysis was deleted
    if (!updateResult.success) {
      console.log(`🛑 News Analyst stopped: ${updateResult.error}`);
      return createCanceledResponse(
        `News Analyst stopped: ${updateResult.error}`,
        true
      );
    }

    // Get optimization mode and search sources from settings
    const optimizationMode = apiSettings.analysis_optimization || 'speed';
    // Use analysis_search_sources from settings, with fallback based on optimization mode
    const maxSources = apiSettings.analysis_search_sources || (optimizationMode === 'balanced' ? 15 : 10);

    console.log(`📊 Using optimization: ${optimizationMode} with ${maxSources} sources`);

    // Call Perplefina API for news analysis
    let aiResponse = '';
    let agentError = null;
    let perplefinaData = null;

    try {
      // Get current date for more precise news queries
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Note: Position context is available in analysisContext but not included in prompt

      const data = await callPerplefina({
        focusMode: 'news',
        query: `What's the trading recommendation based on news analysis and sentiment for ${ticker} stock as of ${currentDate}? Focus on recent developments and their impact on trading decisions.`,
        optimizationMode: optimizationMode,
        maxSources: maxSources,
        chatModel: {
          provider: apiSettings.ai_provider,
          model: apiSettings.ai_model || 'default',
          apiKey: apiSettings.ai_api_key
        },
        maxTokens: apiSettings.analysis_max_tokens || 1200,
        timeoutMs: 180000,
        systemInstructions: `You are a news researcher tasked with analyzing recent news for ${ticker}.

Provide detailed and finegrained analysis and insights that may help traders make decisions. Include sentiment analysis, key developments, and trading implications. Based on your news analysis, provide a clear BUY/SELL/HOLD recommendation with supporting rationale. Make sure to append a Markdown table at the end organizing key points: Overall Sentiment, Key Positive Developments, Risk Factors, Trading Implications, News-Based Recommendation (BUY/SELL/HOLD), Confidence Level.`
      });

      aiResponse = data.message || 'No analysis content received from Perplefina';
      perplefinaData = data.sources || [];

    } catch (aiError) {
      console.error('❌ Perplefina call failed:', aiError);
      agentError = aiError.message || 'Failed to get Perplefina response';

      const currentAttempt = request._retry?.attempt ?? 0;
      const maxSelfRetries = request._retry?.maxRetries ?? NEWS_RETRY_CONFIG.maxRetries;
      if (currentAttempt < maxSelfRetries) {
        console.log('⏳ News Analyst encountered an error but retries remain. Deferring error status.');
        if (timeoutId !== null) {
          clearAgentTimeout(timeoutId, 'News Analyst', 'error handled - retry scheduled');
          timeoutId = null;
        }
        return createSuccessResponse({
          agent: 'News Analyst',
          retryScheduled: true,
          retryAttempt: currentAttempt + 1,
          maxRetries: maxSelfRetries,
          message: 'Perplefina error encountered; automatic retry scheduled'
        });
      }

      aiResponse = `Error: Unable to complete news analysis due to Perplefina error.

Error details: ${agentError}

Please retry the analysis or check your Perplefina configuration.`;
    }

    // Save agent output (even if there was an error)
    const agentOutput = {
      agent: 'News Analyst',
      timestamp: new Date().toISOString(),
      sources: perplefinaData,
      analysis: aiResponse,
      error: agentError
    };

    // Update analysis atomically to prevent race conditions
    console.log('💾 Updating analysis results atomically...');

    // Handle agent completion - either success or error
    if (agentError) {
      // Set agent to error status using the new helper function
      const errorResult = await setAgentToError(
        supabase,
        analysisId,
        'analysis',
        'News Analyst',
        agentError,
        agentError.includes('rate limit') || agentError.includes('quota') ? 'rate_limit' :
          agentError.includes('API key') || agentError.includes('invalid key') || agentError.includes('api_key') ? 'api_key' :
            agentError.includes('Perplefina') || agentError.includes('perplefina') ? 'data_fetch' :
              agentError.includes('AI provider') || agentError.includes('No API key provided') ? 'ai_error' : 'other',
        ticker,
        userId,
        apiSettings
      );
      if (!errorResult.success) {
        console.error('Failed to set agent to error:', errorResult.error);
      }
      console.log('⚠️ News Analyst completed with errors - analysis will continue');
    } else {
      // Update agent insights for successful completion
      const insightsResult = await updateAgentInsights(supabase, analysisId, 'newsAnalyst', agentOutput);
      if (!insightsResult.success) {
        console.error('Failed to update insights:', insightsResult.error);
      }

      // Append message atomically
      const messageResult = await appendAnalysisMessage(
        supabase,
        analysisId,
        'News Analyst',
        aiResponse,
        'analysis'
      );
      if (!messageResult.success) {
        console.error('Failed to append message:', messageResult.error);
      }

      // Update workflow step status to completed
      const statusResult = await updateWorkflowStepStatus(
        supabase,
        analysisId,
        'analysis',
        'News Analyst',
        'completed'
      );
      if (!statusResult.success) {
        console.error('Failed to update workflow status:', statusResult.error);
      }
      console.log('✅ News Analyst data saved successfully');
    }

    // Clear timeout on successful completion
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'News Analyst', 'completed successfully');
    }

    // Only invoke next agent if this agent completed successfully
    if (agentError) {
      // Notify coordinator about the error - do NOT invoke next agent
      console.log(`⚠️ News Analyst completed with errors - notifying coordinator, NOT invoking next agent`);
      notifyCoordinatorAsync(supabase, {
        analysisId,
        ticker,
        userId,
        phase: 'analysis',
        agent: 'news-analyst',
        apiSettings,
        error: agentError,
        errorType: agentError.includes('rate limit') || agentError.includes('quota') ? 'rate_limit' :
          agentError.includes('API key') || agentError.includes('invalid key') || agentError.includes('api_key') ? 'api_key' :
            agentError.includes('Perplefina') || agentError.includes('perplefina') ? 'data_fetch' :
              agentError.includes('AI provider') || agentError.includes('No API key provided') ? 'ai_error' : 'other',
        completionType: 'error',
        analysisContext: request.analysisContext
      }, 'News Analyst');
    } else {
      // Success case - invoke next agent
      console.log(`🔄 News Analyst attempting to invoke next agent in analysis phase...`);

      const nextAgentResult = await invokeNextAgentInSequence(
        supabase,
        analysisId,
        'analysis',
        'news-analyst',
        ticker,
        userId,
        apiSettings,
        request.analysisContext
      );

      if (nextAgentResult.success) {
        if (nextAgentResult.isLastInPhase) {
          // We're the last agent in analysis phase - notify coordinator for phase transition
          console.log(`📋 News Analyst is last in analysis phase - notifying coordinator for phase transition`);
          notifyCoordinatorAsync(supabase, {
            analysisId,
            ticker,
            userId,
            phase: 'analysis',
            agent: 'news-analyst',
            apiSettings,
            completionType: 'last_in_phase',
            analysisContext: request.analysisContext
          }, 'News Analyst');
        } else {
          console.log(`✅ News Analyst successfully handed off to: ${nextAgentResult.nextAgent}`);
        }
      } else {
        // Failed to invoke next agent - fallback to coordinator
        console.log(`⚠️ Failed to invoke next agent, falling back to coordinator: ${nextAgentResult.error}`);
        notifyCoordinatorAsync(supabase, {
          analysisId,
          ticker,
          userId,
          phase: 'analysis',
          agent: 'news-analyst',
          apiSettings,
          completionType: 'fallback_invocation_failed',
          failedToInvoke: nextAgentResult.intendedAgent,
          analysisContext: request.analysisContext
        }, 'News Analyst');
      }
    }

    console.log(`✅ News Analyst completed for ${ticker} (${retryStatus})`);

    return createSuccessResponse({
      agent: 'News Analyst',
      summary: agentOutput.summary,
      retryInfo: retryStatus
    });

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'News Analyst', 'error occurred');
    }

    console.error('❌ News Analyst error:', error);

    // Determine the type of error and provide a helpful message
    if (error.message.includes('API key') || error.message.includes('api_key') || error.message.includes('invalid key')) {
      return createApiErrorResponse('AI Provider', 'key');
    } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
      return createApiErrorResponse('AI Provider', 'quota');
    } else if (error.message.includes('Perplefina') || error.message.includes('perplefina')) {
      return createApiErrorResponse('Perplefina', 'connection');
    } else if (error.message.includes('Supabase') || error.message.includes('database')) {
      return createErrorResponse('Database error occurred during news analysis. Please try again.', 200);
    } else {
      return createErrorResponse(
        `News analysis failed: ${error.message}`,
        200,
        { agent: 'News Analyst' }
      );
    }
  }
});
