import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { invokeWithRetry } from './invokeWithRetry.ts';

/**
 * Reliably notify the coordinator with retry logic and proper error checking
 * @param supabase - Supabase client instance
 * @param params - Parameters to pass to the coordinator
 * @param agentName - Name of the calling agent for logging
 * @returns Promise that resolves when notification succeeds or all retries fail
 */
export async function notifyCoordinator(
  supabase: SupabaseClient,
  params: {
    analysisId: string;
    ticker: string;
    userId: string;
    phase: string;
    agent: string;
    apiSettings: any;
    analysisContext?: any;
    error?: string; // Optional error to report to coordinator
    errorType?: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'other';
    completionType?: 'normal' | 'last_in_phase' | 'fallback_invocation_failed' | 'agent_error' | 'invocation_failed'; // NEW: Why coordinator is being called
    failedToInvoke?: string; // NEW: Which agent failed to be invoked (for fallback scenarios)
  },
  agentName: string
): Promise<{ success: boolean; error?: string }> {
  console.log(`📡 ${agentName}: Notifying coordinator of completion...`);

  try {
    let coordinatorFunction: string;
    let coordinatorBody: any;

    if (params.agent === 'rebalance-portfolio-manager') {
      coordinatorFunction = 'rebalance-coordinator';
      coordinatorBody = {
        action: 'complete-rebalance',
        rebalanceRequestId: params.analysisContext?.rebalanceRequestId,
        userId: params.userId,
        apiSettings: params.apiSettings
      };
      console.log(`📊 Rebalance Portfolio Manager completion - notifying rebalance-coordinator (rebalanceId: ${params.analysisContext?.rebalanceRequestId})`);
    } else {
      coordinatorFunction = 'analysis-coordinator';
      coordinatorBody = params;

      if (params.analysisContext?.type === 'rebalance' && params.analysisContext?.rebalanceRequestId) {
        console.log(`📊 Rebalance context detected - notifying analysis-coordinator (rebalanceId: ${params.analysisContext.rebalanceRequestId})`);
      }
    }

    const invocationResult = await invokeWithRetry(
      supabase,
      coordinatorFunction,
      coordinatorBody,
      2,
      1000
    );

    if (!invocationResult.success) {
      throw new Error(invocationResult.error || 'Failed to notify coordinator');
    }

    const responseData = invocationResult.data;

    if (responseData?.success === false && (responseData?.canceled || responseData?.isCanceled)) {
      console.log(`⚠️ ${agentName}: Coordinator reported analysis was canceled`);
      return { success: true };
    }

    console.log(`✅ ${agentName}: Coordinator notified successfully`);
    if (responseData) {
      console.log(`📋 ${agentName}: Coordinator response:`, responseData);
    }

    return { success: true };

  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to notify coordinator after retries';
    console.error(`❌ ${agentName}: Coordinator notification failed:`, errorMessage);

    try {
      await supabase
        .from('analysis_messages')
        .insert({
          analysis_id: params.analysisId,
          agent_name: params.agent,
          message: `COORDINATOR_NOTIFICATION_FAILED: ${errorMessage}`,
          message_type: 'error',
          metadata: {
            error: errorMessage,
            agentName,
            params,
            timestamp: new Date().toISOString()
          }
        });
    } catch (dbError) {
      console.error(`❌ ${agentName}: Failed to log notification failure to database:`, dbError);
    }

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Notify coordinator without waiting (fire-and-forget with retry)
 * Use this when you don't want to block on the notification
 */
export function notifyCoordinatorAsync(
  supabase: SupabaseClient,
  params: {
    analysisId: string;
    ticker: string;
    userId: string;
    phase: string;
    agent: string;
    apiSettings: any;
    analysisContext?: any;
    error?: string; // Optional error to report to coordinator
    errorType?: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'other';
    completionType?: 'normal' | 'last_in_phase' | 'fallback_invocation_failed' | 'agent_error' | 'invocation_failed'; // NEW: Why coordinator is being called
    failedToInvoke?: string; // NEW: Which agent failed to be invoked (for fallback scenarios)
  },
  agentName: string
): void {
  notifyCoordinator(supabase, params, agentName)
    .then(result => {
      if (!result.success) {
        console.error(`${agentName}: Background coordinator notification failed:`, result.error);
      }
    })
    .catch(err => {
      console.error(`${agentName}: Background coordinator notification error:`, err);
    });
}
