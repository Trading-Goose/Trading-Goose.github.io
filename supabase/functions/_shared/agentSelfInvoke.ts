import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyCoordinator } from './coordinatorNotification.ts';
import { AgentRequest } from './types.ts';
import { ANALYSIS_STATUS } from './statusTypes.ts';
import { invokeWithRetry } from './invokeWithRetry.ts';

/**
 * Configuration for agent retry behavior
 */
export interface AgentRetryConfig {
  functionName: string;      // Agent function name (e.g. 'agent-risk-manager')
  maxRetries: number;        // Maximum retry attempts (default: 3)
  timeoutMs: number;         // Timeout per attempt in milliseconds (default: 180000 = 4.5 min)
  retryDelay: number;        // Delay between retries in milliseconds (default: 30000 = 30s)
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Partial<AgentRetryConfig> = {
  maxRetries: 3,
  timeoutMs: 180000,  // 3 minutes
  retryDelay: 3000   // 3 second delay between retries
};

/**
 * Sets up a timeout that will trigger agent self-retry if the agent doesn't complete in time
 * 
 * @param supabase - Supabase client instance
 * @param request - Original agent request parameters
 * @param config - Retry configuration
 * @param agentName - Human-readable agent name for logging
 * @returns timeoutId that can be cleared if agent completes successfully
 */
export function setupAgentTimeout(
  supabase: SupabaseClient,
  request: AgentRequest,
  config: AgentRetryConfig,
  agentName: string
): number {
  // Merge with defaults
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config } as AgentRetryConfig;

  // Get current retry state
  const currentAttempt = request._retry?.attempt || 0;
  const maxRetries = request._retry?.maxRetries || retryConfig.maxRetries;
  const originalStartTime = request._retry?.originalStartTime || new Date().toISOString();

  console.log(`⏰ ${agentName}: Setting up ${retryConfig.timeoutMs}ms timeout (attempt ${currentAttempt + 1}/${maxRetries + 1})`);

  const timeoutId = setTimeout(async () => {
    console.log(`⏱️ ${agentName}: Timeout reached after ${retryConfig.timeoutMs}ms (attempt ${currentAttempt + 1})`);

    if (currentAttempt < maxRetries) {
      // Still have retries left - attempt self-invocation
      console.log(`🔄 ${agentName}: Attempting retry ${currentAttempt + 1}/${maxRetries}...`);

      try {
        await selfInvoke(supabase, retryConfig.functionName, request, agentName, retryConfig);
        console.log(`✅ ${agentName}: Successfully triggered retry ${currentAttempt + 1}`);
      } catch (retryError) {
        console.error(`❌ ${agentName}: Failed to trigger retry ${currentAttempt + 1}:`, retryError);
        // If retry invocation fails, try to notify coordinator of the failure
        await handleRetryFailure(supabase, request, agentName, `Retry invocation failed: ${retryError.message}`);
      }
    } else {
      // Max retries reached - notify coordinator of final failure
      console.log(`🛑 ${agentName}: Max retries (${maxRetries}) reached, notifying coordinator of failure`);
      await handleRetryFailure(supabase, request, agentName, `Agent timed out after ${maxRetries + 1} attempts`);
    }
  }, retryConfig.timeoutMs);

  return timeoutId;
}

/**
 * Re-invokes the same agent function with incremented retry parameters
 * 
 * @param supabase - Supabase client instance
 * @param functionName - Name of the agent function to invoke
 * @param originalRequest - Original request parameters
 * @param agentName - Human-readable agent name for logging
 * @param config - Retry configuration
 */
export async function selfInvoke(
  supabase: SupabaseClient,
  functionName: string,
  originalRequest: AgentRequest,
  agentName: string,
  config: AgentRetryConfig
): Promise<void> {
  const currentAttempt = originalRequest._retry?.attempt || 0;
  const nextAttempt = currentAttempt + 1;

  // Wait for retry delay before invoking
  if (config.retryDelay > 0) {
    console.log(`⏳ ${agentName}: Waiting ${config.retryDelay}ms before retry ${nextAttempt}...`);
    await new Promise(resolve => setTimeout(resolve, config.retryDelay));
  }

  // Create updated request with incremented retry counter
  const retryRequest: AgentRequest = {
    ...originalRequest,
    _retry: {
      attempt: nextAttempt,
      maxRetries: config.maxRetries,
      timeoutMs: config.timeoutMs,
      originalStartTime: originalRequest._retry?.originalStartTime || new Date().toISOString(),
      functionName: functionName
    }
  };

  console.log(`🚀 ${agentName}: Self-invoking ${functionName} for retry attempt ${nextAttempt}`);

  // Self-invoke the agent function
  const result = await invokeWithRetry(supabase, functionName, retryRequest);

  if (!result.success) {
    throw new Error(result.error || 'Self-invocation failed');
  }

  console.log(`✅ ${agentName}: Self-invocation for retry ${nextAttempt} triggered successfully`);
}

/**
 * Determines the workflow phase based on agent name
 * 
 * @param agentName - Human-readable agent name
 * @returns The phase the agent belongs to
 */
function getPhaseFromAgentName(agentName: string): string {
  const nameLower = agentName.toLowerCase();

  // Analysis phase agents
  if (nameLower.includes('market') || nameLower.includes('news') ||
    nameLower.includes('social') || nameLower.includes('fundamentals')) {
    return 'analysis';
  }

  // Research phase agents
  if (nameLower.includes('bull') || nameLower.includes('bear') ||
    nameLower.includes('research')) {
    return 'research';
  }

  // Trading phase
  if (nameLower.includes('trader') || nameLower.includes('trading')) {
    return 'trading';
  }

  // Risk phase agents
  if (nameLower.includes('risk') || nameLower.includes('risky') ||
    nameLower.includes('safe') || nameLower.includes('neutral')) {
    return 'risk';
  }

  // Portfolio phase
  if (nameLower.includes('portfolio')) {
    return 'portfolio';
  }

  // Rebalance-specific agents
  if (nameLower.includes('opportunity')) {
    return 'opportunity';
  }

  // Default to analysis if unclear
  return 'analysis';
}

/**
 * Handles final failure after max retries by notifying coordinator
 * 
 * @param supabase - Supabase client instance
 * @param request - Original request parameters
 * @param agentName - Human-readable agent name for logging
 * @param errorMessage - Description of the failure
 */
export async function handleRetryFailure(
  supabase: SupabaseClient,
  request: AgentRequest,
  agentName: string,
  errorMessage: string
): Promise<void> {
  console.error(`💥 ${agentName}: Final failure - ${errorMessage}`);

  // Calculate total time spent
  const originalStartTime = request._retry?.originalStartTime || new Date().toISOString();
  const totalTimeMs = Date.now() - new Date(originalStartTime).getTime();
  const totalTimeMin = Math.round(totalTimeMs / 60000);

  const finalError = `${errorMessage}. Total attempts: ${(request._retry?.attempt || 0) + 1}/${(request._retry?.maxRetries || 3) + 1}. Total time: ${totalTimeMin} minutes.`;

  try {
    // Determine the correct phase based on agent name
    const phase = getPhaseFromAgentName(agentName);

    // Notify coordinator of the failure
    await notifyCoordinator(
      supabase,
      {
        analysisId: request.analysisId,
        ticker: request.ticker,
        userId: request.userId,
        phase: phase,
        agent: agentName.toLowerCase().replace(/\s+/g, '-'),
        apiSettings: request.apiSettings,
        analysisContext: request.analysisContext,
        error: finalError,
        errorType: 'timeout',
        completionType: 'error'
      },
      agentName
    );

    console.log(`📡 ${agentName}: Coordinator notified of final failure`);
  } catch (notifyError) {
    console.error(`❌ ${agentName}: Failed to notify coordinator of failure:`, notifyError);

    // DO NOT mark the analysis as ERROR directly!
    // The coordinator should decide whether the workflow can continue
    // based on the specific agent that failed and the phase health.
    // Marking it as ERROR here bypasses the coordinator's logic and
    // can cause issues where research manager runs but analysis is already marked as error.
    console.error(`💥 ${agentName}: Failed to notify coordinator - workflow may be stuck`);
    
    // Log the failure for monitoring but don't change analysis status
    try {
      await supabase
        .from('analysis_messages')
        .insert({
          analysis_id: request.analysisId,
          agent_name: agentName,
          message: `CRITICAL: Failed to notify coordinator after timeout - ${finalError}`,
          message_type: 'error',
          metadata: { 
            error: finalError,
            timestamp: new Date().toISOString() 
          }
        });
    } catch (logError) {
      console.error(`❌ ${agentName}: Failed to log critical error:`, logError);
    }
  }
}

/**
 * Utility function to clear a timeout and log the cancellation
 * 
 * @param timeoutId - The timeout ID to clear
 * @param agentName - Human-readable agent name for logging
 * @param reason - Reason for clearing (e.g., 'completed successfully', 'error occurred')
 */
export function clearAgentTimeout(timeoutId: number, agentName: string, reason: string): void {
  clearTimeout(timeoutId);
  console.log(`⏰ ${agentName}: Timeout cleared - ${reason}`);
}

/**
 * Gets retry information for logging/debugging
 * 
 * @param request - Agent request with potential retry information
 * @returns formatted retry status string
 */
export function getRetryStatus(request: AgentRequest): string {
  if (!request._retry) {
    return 'First attempt';
  }

  const { attempt, maxRetries, originalStartTime } = request._retry;
  const timeElapsed = Math.round((Date.now() - new Date(originalStartTime).getTime()) / 60000);

  return `Retry ${attempt + 1}/${maxRetries + 1} (${timeElapsed}m elapsed)`;
}
