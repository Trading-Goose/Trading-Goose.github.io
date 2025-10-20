import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { appendAnalysisMessage, updateAgentInsights, updateWorkflowStepStatus, updateAnalysisPhase, setAgentToError } from '../_shared/atomicUpdate.ts'
import { notifyCoordinatorAsync } from '../_shared/coordinatorNotification.ts'
import { invokeNextAgentInSequence } from '../_shared/phaseProgressChecker.ts'
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts'
import { checkAgentCompletion, checkForBlockingOperations } from '../_shared/agentCompletionCheck.ts'
import { AgentRequest } from '../_shared/types.ts'
import { callPerplefina } from '../_shared/perplefinaClient.ts'

// Extended interface for Social Media Analyst specific settings
interface SocialMediaAnalystRequest extends AgentRequest {
  apiSettings: AgentRequest['apiSettings'] & {
    ai_provider: string;
    ai_api_key: string;
    ai_model?: string;
    analysis_optimization?: string;
    analysis_max_tokens?: number;
  };
}

const SOCIAL_RETRY_CONFIG = {
  functionName: 'agent-social-media-analyst',
  maxRetries: 3,
  timeoutMs: 180000, // keep under Supabase's ~200s hard limit
  retryDelay: 3000
} as const;

serve(async (req) => {
  let timeoutId: number | null = null;

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

    const request: SocialMediaAnalystRequest = await req.json();
    const { analysisId, ticker, userId, apiSettings, analysisContext } = request;

    if (!analysisId || !ticker || !userId || !apiSettings) {
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const retryStatus = getRetryStatus(request);
    console.log(`📱 Social Media Analyst starting for ${ticker} (${retryStatus})`);
    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

    // Check if this agent has already completed for this analysis
    const isRetryAttempt = request.retryCount !== undefined && request.retryCount > 0;

    const completionStatus = await checkAgentCompletion(
      supabase,
      analysisId,
      'agent-social-media-analyst',
      'Social Media Analyst',
      isRetryAttempt
    );

    if (completionStatus.hasCompleted && completionStatus.status === 'completed') {
      console.log(`✅ Social Media Analyst already completed for analysis ${analysisId}`);
      console.log(`   Skipping duplicate execution to save API calls`);

      // Clear any timeout that might have been set
      if (timeoutId !== null) {
        clearAgentTimeout(timeoutId, 'Social Media Analyst', 'already completed');
      }

      // Return the existing insights if available
      return new Response(JSON.stringify({
        success: true,
        agent: 'Social Media Analyst',
        message: 'Agent already completed for this analysis',
        alreadyCompleted: true,
        existingInsights: completionStatus.existingInsights,
        retryInfo: retryStatus
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Don't check for "already running" - the coordinator handles that before invocation
    // The agent will see itself as "running" because the coordinator marks it as such
    // Only check for "already completed" to avoid re-doing work

    // Check for any blocking operations
    const blockingCheck = await checkForBlockingOperations(supabase, analysisId, 'agent-social-media-analyst');
    if (!blockingCheck.canProceed) {
      console.log(`🛑 Social Media Analyst cannot proceed: ${blockingCheck.reason}`);
      return new Response(JSON.stringify({
        success: false,
        error: `Social Media Analyst cannot proceed: ${blockingCheck.reason}`,
        isCanceled: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      SOCIAL_RETRY_CONFIG,
      'Social Media Analyst'
    );

    // Check if analysis still exists by trying to update it (deletion check)
    const updateResult = await updateAnalysisPhase(supabase, analysisId, 'Social Media Analyst analyzing', {
      agent: 'Social Media Analyst',
      message: 'Starting social media sentiment analysis',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // If analysis phase update fails, it likely means analysis was deleted
    if (!updateResult.success) {
      console.log(`🛑 Social Media Analyst stopped: ${updateResult.error}`);
      return new Response(JSON.stringify({
        success: false,
        message: `Social Media Analyst stopped: ${updateResult.error}`,
        canceled: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Update analysis status
    await updateAnalysisPhase(supabase, analysisId, 'Social Media Analyst analyzing sentiment', {
      agent: 'Social Media Analyst',
      message: 'Analyzing social media sentiment and discussions using Perplefina',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // Get optimization mode and search sources from settings
    const optimizationMode = apiSettings.analysis_optimization || 'speed';
    // Use analysis_search_sources from settings, with fallback based on optimization mode
    const maxSources = apiSettings.analysis_search_sources || (optimizationMode === 'balanced' ? 15 : 10);

    console.log(`📊 Using optimization: ${optimizationMode} with ${maxSources} sources`);

    // Call Perplefina API for social media analysis
    let aiResponse = '';
    let agentError = null;
    let perplefinaData = null;

    try {
      // Get current date for more precise social media queries
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Note: Position context is available in analysisContext but not included in prompt

      const data = await callPerplefina({
        focusMode: 'social',
        query: `Social media sentiment analysis for ${ticker} stock including Reddit, Twitter, Discord, Thread, Facebook, Linked-In and trading communities discussion as of ${currentDate}.`,
        optimizationMode: optimizationMode,
        maxSources: maxSources,
        chatModel: {
          provider: apiSettings.ai_provider,
          model: apiSettings.ai_model || 'default',
          apiKey: apiSettings.ai_api_key
        },
        maxTokens: apiSettings.analysis_max_tokens || 1200,
        timeoutMs: 180000,
        systemInstructions: `You are a social media analyst for ${ticker}.

Analyze sentiment across platforms (Reddit, Twitter, StockTwits). Include: 1) Overall sentiment momentum, 2) Key themes in discussions, 3) Retail investor sentiment, 4) Concerns/red flags, 5) Social media volume trends. Based on social media sentiment analysis, provide a clear BUY/SELL/HOLD recommendation with supporting rationale. Append Markdown table: Overall Sentiment Score, Platform Consensus, Key Bullish Factors, Key Bearish Factors, Social Media Recommendation (BUY/SELL/HOLD), Social Risk Level.`
      });

      aiResponse = data.message || 'No analysis content received from Perplefina';
      perplefinaData = data.sources || [];

    } catch (aiError) {
      console.error('❌ Perplefina call failed:', aiError);
      agentError = aiError.message || 'Failed to get Perplefina response';

      const currentAttempt = request._retry?.attempt ?? 0;
      const maxSelfRetries = request._retry?.maxRetries ?? SOCIAL_RETRY_CONFIG.maxRetries;
      if (currentAttempt < maxSelfRetries) {
        console.log('⏳ Social Media Analyst encountered an error but retries remain. Deferring error status.');
        if (timeoutId !== null) {
          clearAgentTimeout(timeoutId, 'Social Media Analyst', 'error handled - retry scheduled');
          timeoutId = null;
        }
        return new Response(JSON.stringify({
          success: true,
          agent: 'Social Media Analyst',
          retryScheduled: true,
          retryAttempt: currentAttempt + 1,
          maxRetries: maxSelfRetries,
          message: 'Perplefina error encountered; automatic retry scheduled'
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200
        });
      }

      aiResponse = `Error: Unable to complete social media analysis due to Perplefina error.

Error details: ${agentError}

Please retry the analysis or check your Perplefina configuration.`;
    }

    // Save agent output (even if there was an error)
    const agentOutput = {
      agent: 'Social Media Analyst',
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
        'Social Media Analyst',
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
    } else {
      // Update agent insights for successful completion
      const insightsResult = await updateAgentInsights(supabase, analysisId, 'socialMediaAnalyst', agentOutput);
      if (!insightsResult.success) {
        console.error('Failed to update insights:', insightsResult.error);
      }

      // Append message atomically
      const messageResult = await appendAnalysisMessage(
        supabase,
        analysisId,
        'Social Media Analyst',
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
        'Social Media Analyst',
        'completed'
      );
      if (!statusResult.success) {
        console.error('Failed to update workflow status:', statusResult.error);
      }
    }

    // Clear timeout on successful completion
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Social Media Analyst', 'completed successfully');
    }

    console.log('✅ Social Media Analyst data saved successfully');

    // Only invoke next agent if this agent completed successfully
    if (agentError) {
      // Notify coordinator about the error - do NOT invoke next agent
      console.log(`⚠️ Social Media Analyst completed with errors - notifying coordinator, NOT invoking next agent`);
      notifyCoordinatorAsync(supabase, {
        analysisId,
        ticker,
        userId,
        phase: 'analysis',
        agent: 'social-media-analyst',
        apiSettings,
        error: agentError,
        errorType: agentError.includes('rate limit') || agentError.includes('quota') ? 'rate_limit' :
          agentError.includes('API key') || agentError.includes('invalid key') || agentError.includes('api_key') ? 'api_key' :
            agentError.includes('Perplefina') || agentError.includes('perplefina') ? 'data_fetch' :
              agentError.includes('AI provider') || agentError.includes('No API key provided') ? 'ai_error' : 'other',
        completionType: 'error',
        analysisContext: request.analysisContext
      }, 'Social Media Analyst');
    } else {
      // Success case - invoke next agent
      console.log(`🔄 Social Media Analyst attempting to invoke next agent in analysis phase...`);

      const nextAgentResult = await invokeNextAgentInSequence(
        supabase,
        analysisId,
        'analysis',
        'social-media-analyst',
        ticker,
        userId,
        apiSettings,
        request.analysisContext
      );

      if (nextAgentResult.success) {
        if (nextAgentResult.isLastInPhase) {
          // We're the last agent in analysis phase - notify coordinator for phase transition
          console.log(`📋 Social Media Analyst is last in analysis phase - notifying coordinator for phase transition`);
          notifyCoordinatorAsync(supabase, {
            analysisId,
            ticker,
            userId,
            phase: 'analysis',
            agent: 'social-media-analyst',
            apiSettings,
            completionType: 'last_in_phase',
            analysisContext: request.analysisContext
          }, 'Social Media Analyst');
        } else {
          console.log(`✅ Social Media Analyst successfully handed off to: ${nextAgentResult.nextAgent}`);
        }
      } else {
        // Failed to invoke next agent - fallback to coordinator
        console.log(`⚠️ Failed to invoke next agent, falling back to coordinator: ${nextAgentResult.error}`);
        notifyCoordinatorAsync(supabase, {
          analysisId,
          ticker,
          userId,
          phase: 'analysis',
          agent: 'social-media-analyst',
          apiSettings,
          completionType: 'fallback_invocation_failed',
          failedToInvoke: nextAgentResult.intendedAgent,
          analysisContext: request.analysisContext
        }, 'Social Media Analyst');
      }
    }

    console.log(`✅ Social Media Analyst completed for ${ticker} (${retryStatus})`);

    return new Response(JSON.stringify({
      success: true,
      agent: 'Social Media Analyst',
      summary: agentOutput.summary,
      retryInfo: retryStatus
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Social Media Analyst', 'error occurred');
    }

    console.error('❌ Social Media Analyst error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200 // Return 200 so coordinator notifications work
    });
  }
});
