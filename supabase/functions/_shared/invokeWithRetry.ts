import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ANALYSIS_STATUS } from './statusTypes.ts';

function buildAuthHeaders() {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const functionAccessToken =
    Deno.env.get('SUPABASE_FUNCTION_ACCESS_TOKEN') ||
    Deno.env.get('FUNCTION_ACCESS_TOKEN');

  if (!serviceRoleKey && !functionAccessToken) {
    console.error('❌ Missing service credentials for function invocation');
    return {};
  }

  const token = functionAccessToken || serviceRoleKey;

  if (!functionAccessToken && serviceRoleKey && !serviceRoleKey.startsWith('eyJ')) {
    console.warn('⚠️ Service role key does not appear to be a JWT. If Edge Functions require JWT verification, set FUNCTION_ACCESS_TOKEN.');
  }

  return {
    Authorization: `Bearer ${token}`,
    apikey: serviceRoleKey || token
  };
}

/**
 * Enhanced function invocation with retry logic for better reliability
 * This is a drop-in replacement for supabase.functions.invoke() calls
 */
export async function invokeWithRetry(
  supabase: SupabaseClient,
  functionName: string,
  body: any,
  maxRetries: number = 2,
  retryDelay: number = 2000
): Promise<{ success: boolean; data?: any; error?: string }> {

  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📡 Invoking ${functionName} (attempt ${attempt + 1}/${maxRetries + 1})`);

      // Let the Supabase client handle authentication
      // It was created with the service role key and should pass it automatically
      const result = await supabase.functions.invoke(functionName, {
        body,
        headers: buildAuthHeaders()
      });

      // Check for invocation errors
      if (result.error) {
        throw new Error(`Invocation error: ${result.error.message || JSON.stringify(result.error)}`);
      }

      // CRITICAL: Validate that we got a response
      if (!result.data) {
        throw new Error(`No response data from ${functionName} - agent was not invoked properly`);
      }

      // Validate response is an object (not a string, number, etc)
      if (typeof result.data !== 'object') {
        throw new Error(`Invalid response type from ${functionName}: expected object, got ${typeof result.data}`);
      }

      // Check for application-level errors (but allow cancellations)
      if (result.data.success === false && !result.data.canceled && !result.data.isCanceled) {
        throw new Error(`Function error: ${result.data.error || result.data.message || 'Unknown error'}`);
      }

      // Log response structure for debugging
      const responseKeys = Object.keys(result.data);
      console.log(`✅ ${functionName} responded with keys: ${responseKeys.join(', ')} (attempt ${attempt + 1})`);

      return { success: true, data: result.data };

    } catch (error) {
      lastError = error;
      console.error(`❌ ${functionName} failed (attempt ${attempt + 1}):`, error.message);

      // Don't retry on the last attempt
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying ${functionName} in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        retryDelay *= 1.5; // Increase delay for next attempt
      }
    }
  }

  const errorMessage = `Failed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`;
  console.error(`💥 ${functionName} final failure: ${errorMessage}`);

  return { success: false, error: errorMessage };
}

/**
 * Fire-and-forget version with enhanced error handling and retries
 * Use this for async invocations where you don't need to wait for the result
 */
export function invokeWithRetryAsync(
  supabase: SupabaseClient,
  functionName: string,
  body: any,
  maxRetries: number = 2,
  retryDelay: number = 2000
): void {
  invokeWithRetry(supabase, functionName, body, maxRetries, retryDelay)
    .then(result => {
      if (result.success) {
        console.log(`🎯 ${functionName} completed successfully in background`);
      } else {
        console.error(`🔥 ${functionName} failed in background: ${result.error}`);

        // For critical failures, we could add fallback logic here
        // For now, just comprehensive logging
        console.error(`📋 ${functionName} failure context:`, {
          functionName,
          bodyKeys: Object.keys(body || {}),
          error: result.error,
          timestamp: new Date().toISOString()
        });
      }
    })
    .catch(error => {
      console.error(`💥 ${functionName} background invocation critical error:`, error);
    });
}

/**
 * Enhanced invocation specifically for agent functions with additional context
 * This function now sets the agent status to "running" before invocation to prevent race conditions
 */
export async function invokeAgentWithRetry(
  supabase: SupabaseClient,
  agentName: string,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: any,
  maxRetries: number = 2,
  phase?: string,
  analysisContext?: any,
  additionalPayload?: Record<string, any>
): Promise<void> {
  // Import the function here to avoid circular imports
  const { getAgentSpecificSettings } = await import('../analysis-coordinator/utils/api-settings.ts');

  // Get agent-specific settings based on team configuration
  const agentSpecificSettings = getAgentSpecificSettings(apiSettings, agentName);

  const body: any = {
    analysisId,
    ticker,
    userId,
    apiSettings: agentSpecificSettings
  };

  // Always include analysisContext so downstream agents have full workflow context
  if (analysisContext) {
    body.analysisContext = analysisContext;
  }

  if (additionalPayload && typeof additionalPayload === 'object') {
    Object.assign(body, additionalPayload);
  }

  console.log(`🤖 Starting ${agentName} for ${ticker} (analysis: ${analysisId})`);

  // Determine phase if not provided
  if (!phase) {
    // Try to infer phase from analysis context or agent name
    if (analysisContext?.phase) {
      phase = analysisContext.phase;
    } else {
      // Default phase mapping based on agent name
      if (agentName.includes('macro-analyst') || agentName.includes('market-analyst') ||
        agentName.includes('fundamentals') || agentName.includes('news-analyst') ||
        agentName.includes('social-media')) {
        phase = 'analysis';
      } else if (agentName.includes('bull-researcher') || agentName.includes('bear-researcher') ||
        agentName.includes('research-manager')) {
        phase = 'research';
      } else if (agentName.includes('risky-analyst') || agentName.includes('safe-analyst') ||
        agentName.includes('neutral-analyst') || agentName.includes('risk-manager')) {
        phase = 'risk';
      } else if (agentName.includes('portfolio-manager')) {
        phase = 'portfolio';
      } else {
        phase = 'unknown';
      }
    }
  }

  // Set agent status to "running" before invoking to prevent duplicates
  const agentDisplayName = getAgentDisplayName(agentName);
  const agentFunctionName = getAgentFunctionName(agentName);
  console.log(`📍 Setting ${agentDisplayName} status to "running" before invocation (phase: ${phase})`);

  async function handleInvocationFailure(rawError: unknown) {
    const failureMessage = typeof rawError === 'string'
      ? rawError
      : (rawError as { message?: string })?.message || 'Unknown invocation failure';

    console.error(`⚠️ Invocation failure for ${agentName}: ${failureMessage}`);

    try {
      const { updateWorkflowStepStatus } = await import('./atomicUpdate.ts');
      const resetResult = await updateWorkflowStepStatus(
        supabase,
        analysisId,
        phase,
        agentDisplayName,
        'pending'
      );
      if (!resetResult.success) {
        console.error(`⚠️ Failed to reset status for ${agentDisplayName}:`, resetResult.error);
      } else {
        console.log(`🔄 ${agentDisplayName} status reset to pending after invocation failure`);
      }
    } catch (statusError) {
      console.error(`⚠️ Failed to reset status for ${agentDisplayName}:`, statusError);
    }

   try {
      const { notifyCoordinator } = await import('./coordinatorNotification.ts');
      await notifyCoordinator(
        supabase,
        {
          analysisId,
          ticker,
          userId,
          phase,
          agent: agentFunctionName,
          apiSettings,
          analysisContext,
          error: `Invocation failed: ${failureMessage}`,
          errorType: 'other',
          completionType: 'invocation_failed'
        },
        agentDisplayName
      );
    } catch (notifyError) {
      console.error(`❌ Failed to notify coordinator about invocation failure for ${agentDisplayName}:`, notifyError);
    }
  }

  try {
    const { updateWorkflowStepStatus } = await import('./atomicUpdate.ts');
    const updateResult = await updateWorkflowStepStatus(
      supabase,
      analysisId,
      phase,
      agentDisplayName,
      'running'
    );

    if (!updateResult.success) {
      console.error(`❌ Failed to set status for ${agentDisplayName}:`, updateResult.error);
    } else {
      console.log(`✅ Successfully set ${agentDisplayName} status to running`);
    }
  } catch (statusError) {
    console.error(`⚠️ Exception setting status for ${agentDisplayName}:`, statusError);
    // Continue with invocation even if status update fails
  }

  // Set up coordinator-level timeout monitoring
  setupCoordinatorTimeoutMonitoring(supabase, agentFunctionName, analysisId, ticker);

  // Fire-and-forget the actual invocation with error handling
  // This IIFE runs independently and doesn't block the caller
  (async () => {
    try {
      console.log(`🚀 Starting async invocation of ${agentName}`);
      const result = await invokeWithRetry(supabase, agentName, body, maxRetries, 2000);
      if (!result.success) {
        await handleInvocationFailure(result.error || 'Unknown invocation failure');
        return;
      }
    } catch (error: any) {
      console.error(`❌ Agent invocation threw for ${agentName}:`, error);
      console.error(`   Error details:`, error?.message, error?.stack);
      await handleInvocationFailure(error);
      return;
    }
  })().catch((error: any) => {
    // Catch any uncaught errors in the IIFE itself
    console.error(`💥 CRITICAL: Uncaught error in fire-and-forget invocation for ${agentName}:`, error);
    console.error(`   Error details:`, error?.message, error?.stack);
    handleInvocationFailure(error).catch((err: any) => console.error(`Failed to handle invocation failure for ${agentDisplayName}:`, err));
  });

  // Return immediately after starting the fire-and-forget invocation
  // The caller can continue without waiting for the agent to complete
  return;
}

/**
 * Get display name for an agent function name
 */
function getAgentDisplayName(agentFunctionName: string): string {
  const nameMap: { [key: string]: string } = {
    'agent-macro-analyst': 'Macro Analyst',
    'agent-market-analyst': 'Market Analyst',
    'agent-fundamentals-analyst': 'Fundamentals Analyst',
    'agent-news-analyst': 'News Analyst',
    'agent-social-media-analyst': 'Social Media Analyst',
    'agent-research-manager': 'Research Manager',
    'agent-bull-researcher': 'Bull Researcher',
    'agent-bear-researcher': 'Bear Researcher',
    'agent-risky-analyst': 'Risky Analyst',
    'agent-safe-analyst': 'Safe Analyst',
    'agent-neutral-analyst': 'Neutral Analyst',
    'agent-risk-manager': 'Risk Manager',
    'agent-trader': 'Trader',
    'analysis-portfolio-manager': 'Analysis Portfolio Manager'
  };

  return nameMap[agentFunctionName] || agentFunctionName;
}

function getAgentFunctionName(agentName: string): string {
  if (agentName.startsWith('agent-') || agentName === 'analysis-portfolio-manager') {
    return agentName;
  }

  const normalized = agentName.toLowerCase().replace(/\s+/g, '-');
  if (normalized === 'portfolio-manager' || normalized === 'analysis-portfolio-manager') {
    return 'analysis-portfolio-manager';
  }
  return normalized.startsWith('agent-') ? normalized : `agent-${normalized}`;
}

/**
 * Set up coordinator-level timeout monitoring for agent invocations
 * This creates a safety net in case agents fail to start or callback
 */
function setupCoordinatorTimeoutMonitoring(
  supabase: SupabaseClient,
  agentName: string,
  analysisId: string,
  ticker: string
): void {
  // Capture the current updated_at timestamp at invocation time
  const invocationTime = Date.now();
  let initialUpdatedAt: string | null = null;

  // First, get the current updated_at value
  supabase
    .from('analysis_history')
    .select('updated_at')
    .eq('id', analysisId)
    .single()
    .then(({ data, error }: { data: any, error: any }) => {
      if (!error && data) {
        initialUpdatedAt = data.updated_at;
        console.log(`📍 Agent ${agentName} invoked at ${new Date(invocationTime).toISOString()}, last update was at ${initialUpdatedAt}`);
      }
    })
    .catch((err: any) => console.error('Failed to get initial updated_at:', err));

  // Set a timeout to check if the agent has made progress
  const timeoutMs = 3.1 * 60 * 1000; // 3.15 minutes timeout

  setTimeout(async () => {
    try {
      console.log(`⏰ Coordinator timeout check for ${agentName} (${ticker})`);

      // Check if analysis is still running and agent hasn't reported back
      const { data: analysis } = await supabase
        .from('analysis_history')
        .select('analysis_status, agent_insights, updated_at')
        .eq('id', analysisId)
        .single();

      if (!analysis) {
        console.warn(`⚠️ Analysis ${analysisId} not found during timeout check`);
        return;
      }

      // If analysis is still active (pending or running)
      if (analysis.analysis_status === ANALYSIS_STATUS.RUNNING || analysis.analysis_status === ANALYSIS_STATUS.PENDING) {
        const currentUpdatedAt = analysis.updated_at;
        const timeSinceInvocation = Date.now() - invocationTime;

        // Check if updated_at hasn't changed since invocation
        if (initialUpdatedAt && currentUpdatedAt === initialUpdatedAt) {
          console.warn(`⚠️ Potential stuck agent detected: ${agentName} for ${ticker}`);
          console.warn(`   No database updates since invocation ${Math.round(timeSinceInvocation / 60000)} minutes ago`);
          console.warn(`   Initial updated_at: ${initialUpdatedAt}`);
          console.warn(`   Current updated_at: ${currentUpdatedAt}`);

          // Check if this specific agent has provided any insights
          const agentKey = agentName.replace('agent-', '').replace('-', '_');
          const hasAgentInsight = analysis.agent_insights && analysis.agent_insights[agentKey];

          if (!hasAgentInsight) {
            console.warn(`🚨 Agent ${agentName} appears to have failed to start or complete`);
            console.warn(`   Consider manual intervention or analysis restart`);

            // Log this for monitoring without failing the analysis
            // The agent retry mechanisms should handle most cases
            await supabase
              .from('analysis_messages')
              .insert({
                analysis_id: analysisId,
                agent_name: agentName,
                message: `COORDINATOR_TIMEOUT_WARNING: Agent ${agentName} may have failed to start or complete. No updates since invocation ${Math.round(timeSinceInvocation / 60000)} minutes ago.`,
                message_type: 'warning',
                metadata: {
                  timeoutType: 'coordinator_monitoring',
                  timeSinceInvocation: timeSinceInvocation,
                  initialUpdatedAt: initialUpdatedAt,
                  currentUpdatedAt: currentUpdatedAt,
                  agentName: agentName,
                  ticker: ticker,
                  timestamp: new Date().toISOString()
                }
              })
              .then(() => console.log(`📝 Logged timeout warning for ${agentName}`))
              .catch((err: any) => console.error('Failed to log timeout warning:', err));
          }
        } else {
          console.log(`✅ Agent ${agentName} has made progress (updated_at changed from ${initialUpdatedAt} to ${currentUpdatedAt})`);
        }
      }
    } catch (error) {
      console.error(`❌ Error in coordinator timeout monitoring for ${agentName}:`, error);
    }
  }, timeoutMs);
}
