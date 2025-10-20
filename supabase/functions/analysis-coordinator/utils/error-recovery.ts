import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { WORKFLOW_PHASES } from '../config/workflow.ts';
import { invokeAgentWithRetry, invokeWithRetry } from '../../_shared/invokeWithRetry.ts';
import { checkPhaseHealth, categorizeAgentError } from './phase-health-checker.ts';
import { buildAnalysisContext, persistAnalysisContext } from './context-builder.ts';

export interface RecoveryStrategy {
  action: 'retry' | 'skip' | 'abort' | 'continue';
  targetAgent?: string;
  reason: string;
  waitTime?: number;
}

/**
 * Determine recovery strategy for a failed agent
 */
export function determineRecoveryStrategy(
  agent: string,
  errorType?: string,
  attemptCount: number = 1
): RecoveryStrategy {
  const errorCategory = categorizeAgentError(agent, errorType);
  
  // API key errors - abort immediately
  if (errorType === 'api_key') {
    return {
      action: 'abort',
      reason: 'Invalid API key - cannot proceed'
    };
  }
  
  // Rate limit errors - retry with backoff
  if (errorType === 'rate_limit') {
    if (attemptCount < 3) {
      return {
        action: 'retry',
        targetAgent: agent,
        reason: 'Rate limit - retrying with backoff',
        waitTime: Math.min(attemptCount * 5000, 15000) // 5s, 10s, 15s max
      };
    } else {
      return {
        action: 'skip',
        reason: 'Rate limit persists after retries'
      };
    }
  }
  
  // Critical agents must succeed
  if (errorCategory.isCritical) {
    if (attemptCount < 2 && errorCategory.isRetryable) {
      return {
        action: 'retry',
        targetAgent: agent,
        reason: `Critical agent ${agent} failed - retrying`,
        waitTime: 3000
      };
    } else {
      return {
        action: 'abort',
        reason: `Critical agent ${agent} failed after retries`
      };
    }
  }
  
  // Non-critical agents can be skipped after retry
  if (attemptCount < 2 && errorCategory.isRetryable) {
    return {
      action: 'retry',
      targetAgent: agent,
      reason: `Retrying ${agent}`,
      waitTime: 2000
    };
  }
  
  return {
    action: 'skip',
    reason: `Skipping non-critical agent ${agent} after failures`
  };
}

/**
 * Attempt to recover from a phase failure
 */
export async function attemptPhaseRecovery(
  supabase: any,
  analysisId: string,
  phase: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<{ success: boolean; message: string }> {
  console.log(`\ud83d\udd27 Attempting recovery for phase ${phase}`);
  
  // Get phase health status
  const phaseHealth = await checkPhaseHealth(supabase, analysisId, phase);
  console.log(`\ud83d\udcca Phase health:`, phaseHealth);

  const { data: analysisData, error: analysisLoadError } = await supabase
    .from('analysis_history')
    .select('full_analysis, rebalance_request_id')
    .eq('id', analysisId)
    .single();

  if (analysisLoadError || !analysisData) {
    return {
      success: false,
      message: 'Failed to fetch analysis data for recovery'
    };
  }

  const storedContext = analysisData.full_analysis?.analysisContext as AnalysisContext | undefined;
  const seedContext: AnalysisContext = {
    ...(storedContext || {}),
    ...(analysisContext || {}),
    type: analysisContext?.type || storedContext?.type || 'individual',
    rebalanceRequestId: analysisContext?.rebalanceRequestId || storedContext?.rebalanceRequestId || analysisData.rebalance_request_id || undefined
  } as AnalysisContext;

  const refreshedContext = await buildAnalysisContext(
    supabase,
    userId,
    ticker,
    apiSettings,
    seedContext
  );

  try {
    await persistAnalysisContext(
      supabase,
      analysisId,
      analysisData.full_analysis,
      refreshedContext
    );
  } catch (persistError) {
    console.error('Failed to persist refreshed analysis context during recovery:', persistError);
  }
  
  // If phase is healthy but has failed agents, return false to trigger fallback retry
  if (phaseHealth.canProceed && phaseHealth.failedAgents > 0) {
    console.log(`📊 Phase can proceed (${phaseHealth.successfulAgents}/${phaseHealth.totalAgents} succeeded) but has ${phaseHealth.failedAgents} failed agents`);
    console.log(`📊 Failed agents will be retried via fallback mechanism`);
    return {
      success: false,
      message: `Phase has ${phaseHealth.failedAgents} failed agents that need retry`
    };
  } else if (phaseHealth.canProceed) {
    // Phase is healthy with no failures - need to continue workflow
    console.log(`✅ Phase ${phase} is complete and healthy - invoking coordinator to continue workflow`);
    
    // Invoke the coordinator to continue from this phase
    // Use invokeWithRetry for coordinator, not invokeAgentWithRetry which is for agents
    invokeWithRetry(
      supabase,
      'analysis-coordinator',
      {
        analysisId,
        ticker,
        userId,
        apiSettings,
        analysisContext: {
          ...refreshedContext,
          action: 'phase-completed',
          phase: phase,
          completedPhase: phase,
          agent: 'retry-handler'
        }
      }
    );
    
    return {
      success: true,
      message: `Phase ${phase} is complete - coordinator invoked to continue workflow`
    };
  }
  
  // Check what failed
  const phaseConfig = WORKFLOW_PHASES[phase];
  if (!phaseConfig) {
    return {
      success: false,
      message: `Unknown phase: ${phase}`
    };
  }
  
  // Extract workflow steps for this phase from JSONB
  const workflowSteps = analysisData.full_analysis?.workflowSteps || [];
  const phaseStep = workflowSteps.find((s: any) => s.id === phase);
  const allAgents = phaseStep?.agents || [];
  
  // Filter for failed/pending agents
  const steps = allAgents.filter((agent: any) => 
    agent.status === 'error' || agent.status === 'pending'
  );
  
  // Attempt to retry failed/pending agents
  let recoveryAttempts = 0;
  let successfulRecoveries = 0;
  
  for (const step of steps) {
    const agentFunc = phaseConfig.agents.find(a => {
      const displayName = a.split('-').slice(1)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
      return displayName === step.name;
    });
    
    if (!agentFunc) continue;
    
    recoveryAttempts++;
    
    // Determine recovery strategy
    const strategy = determineRecoveryStrategy(
      agentFunc,
      step.error_type,
      step.attempt_count || 1
    );
    
    console.log(`\ud83c\udfaf Recovery strategy for ${agentFunc}:`, strategy);
    
    if (strategy.action === 'abort') {
      console.error(`\u274c Aborting recovery: ${strategy.reason}`);
      return {
        success: false,
        message: strategy.reason
      };
    }
    
    if (strategy.action === 'retry' && strategy.targetAgent) {
      // Wait if specified
      if (strategy.waitTime) {
        console.log(`\u23f1\ufe0f Waiting ${strategy.waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, strategy.waitTime));
      }
      
      // Retry the agent
      console.log(`\ud83d\udd04 Retrying ${strategy.targetAgent}...`);
      
      // Fire-and-forget invocation for retry
      const contextForAgent = {
        ...refreshedContext,
        phase
      };

      invokeAgentWithRetry(
        supabase,
        strategy.targetAgent,
        analysisId,
        ticker,
        userId,
        apiSettings,
        1, // Single retry attempt
        phase,
        contextForAgent
      );
      
      successfulRecoveries++;
    }
  }
  
  // Re-check phase health after recovery attempts
  const newPhaseHealth = await checkPhaseHealth(supabase, analysisId, phase);
  
  // If we attempted recovery and now have agents running or phase can proceed
  if (recoveryAttempts > 0 && (successfulRecoveries > 0 || newPhaseHealth.runningAgents > 0)) {
    console.log(`🔄 Recovery initiated - ${successfulRecoveries} agents started, ${newPhaseHealth.runningAgents} running`);
    return {
      success: true,
      message: `Recovery initiated - ${successfulRecoveries}/${recoveryAttempts} agents retried, workflow continuing`
    };
  }
  
  if (newPhaseHealth.canProceed) {
    return {
      success: true,
      message: `Recovery successful - ${successfulRecoveries}/${recoveryAttempts} agents recovered`
    };
  }
  
  // Check if we made any progress
  if (successfulRecoveries > 0) {
    return {
      success: false,
      message: `Partial recovery - ${successfulRecoveries}/${recoveryAttempts} recovered but phase still unhealthy`
    };
  }
  
  return {
    success: false,
    message: `Recovery failed - unable to recover phase ${phase}`
  };
}

/**
 * Find the last successful phase for an analysis
 */
export async function findLastSuccessfulPhase(
  supabase: any,
  analysisId: string
): Promise<string | null> {
  const phases = ['analysis', 'research', 'trading', 'risk'];
  
  for (let i = phases.length - 1; i >= 0; i--) {
    const phase = phases[i];
    const health = await checkPhaseHealth(supabase, analysisId, phase);
    
    if (health.successfulAgents > 0 && health.completedAgents === health.totalAgents) {
      return phase;
    }
  }
  
  return null;
}

/**
 * Resume workflow from a specific phase
 */
export async function resumeFromPhase(
  supabase: any,
  analysisId: string,
  phase: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<{ success: boolean; message: string }> {
  console.log(`\ud83d\udd04 Resuming workflow from phase ${phase}`);
  
  const phaseConfig = WORKFLOW_PHASES[phase];
  if (!phaseConfig) {
    return {
      success: false,
      message: `Unknown phase: ${phase}`
    };
  }
  
  // Find the first incomplete agent in the phase from JSONB
  const { data: analysisData } = await supabase
    .from('analysis_history')
    .select('full_analysis, rebalance_request_id')
    .eq('id', analysisId)
    .single();

  if (!analysisData) {
    return {
      success: false,
      message: 'Failed to fetch analysis data'
    };
  }

  const storedContext = analysisData.full_analysis?.analysisContext as AnalysisContext | undefined;
  const seedContext: AnalysisContext = {
    ...(storedContext || {}),
    ...(analysisContext || {}),
    type: analysisContext?.type || storedContext?.type || 'individual',
    rebalanceRequestId: analysisContext?.rebalanceRequestId || storedContext?.rebalanceRequestId || analysisData.rebalance_request_id || undefined
  } as AnalysisContext;

  const refreshedContext = await buildAnalysisContext(
    supabase,
    userId,
    ticker,
    apiSettings,
    seedContext
  );

  try {
    await persistAnalysisContext(
      supabase,
      analysisId,
      analysisData.full_analysis,
      refreshedContext
    );
  } catch (persistError) {
    console.error('Failed to persist refreshed analysis context while resuming phase:', persistError);
  }

  // Extract workflow steps for this phase from JSONB
  const workflowSteps = analysisData.full_analysis?.workflowSteps || [];
  const phaseStep = workflowSteps.find((s: any) => s.id === phase);
  const allAgents = phaseStep?.agents || [];
  
  // Find first incomplete agent
  const steps = allAgents
    .filter((agent: any) => agent.status === 'pending' || agent.status === 'error')
    .slice(0, 1);
  
  let targetAgent: string | null = null;
  
  if (steps && steps.length > 0) {
    // Find the corresponding agent function
    targetAgent = phaseConfig.agents.find(a => {
      const displayName = a.split('-').slice(1)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
      return displayName === steps[0].name;
    }) || null;
  }
  
  // If no incomplete agent found, start with the first agent of the phase
  if (!targetAgent && phaseConfig.agents.length > 0) {
    targetAgent = phaseConfig.agents[0];
  }
  
  if (!targetAgent) {
    return {
      success: false,
      message: `No agent to resume in phase ${phase}`
    };
  }
  
  console.log(`\ud83c\udfaf Resuming with agent: ${targetAgent}`);
  
  // Fire-and-forget invocation to resume phase
  const contextForAgent = {
    ...refreshedContext,
    phase
  };

  invokeAgentWithRetry(
    supabase,
    targetAgent,
    analysisId,
    ticker,
    userId,
    apiSettings,
    2,
    phase,
    contextForAgent
  );
  
  return {
    success: true,
    message: `Successfully initiated phase ${phase} resumption from ${targetAgent}`
  };
}
