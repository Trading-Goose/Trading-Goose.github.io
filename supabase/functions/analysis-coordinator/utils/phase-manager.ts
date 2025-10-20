import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { WORKFLOW_PHASES } from '../config/workflow.ts';
import { initializeDebateRound } from '../../_shared/atomicUpdate.ts';
import { invokeAgentWithRetry, invokeWithRetryAsync, invokeWithRetry } from '../../_shared/invokeWithRetry.ts';
import { createSuccessResponse, createErrorResponse } from './response-helpers.ts';
import { checkPhaseHealth } from './phase-health-checker.ts';

/**
 * Get the next agent in the current phase based on the completed agent
 * Returns null if this is the last agent in the phase
 */
export function getNextAgentInPhase(phase: string, completedAgent: string): string | null {
  const phaseConfig = WORKFLOW_PHASES[phase];
  if (!phaseConfig || !phaseConfig.agents) {
    return null;
  }
  
  // Convert agent name to function name format (e.g. "market-analyst" -> "agent-market-analyst")
  const agentFunctionName = completedAgent.startsWith('agent-') ? completedAgent : `agent-${completedAgent}`;
  
  // Find current agent index
  const currentIndex = phaseConfig.agents.indexOf(agentFunctionName);
  if (currentIndex === -1) {
    console.warn(`⚠️ Agent ${agentFunctionName} not found in ${phase} phase agents`);
    return null;
  }
  
  // Return next agent if it exists
  const nextIndex = currentIndex + 1;
  if (nextIndex < phaseConfig.agents.length) {
    return phaseConfig.agents[nextIndex];
  }
  
  return null; // No more agents in this phase
}

/**
 * Move to the next phase in the workflow
 */
export async function moveToNextPhase(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  currentPhase: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
) {
  // Verify current phase is actually complete before moving forward
  const currentPhaseHealth = await checkPhaseHealth(supabase, analysisId, currentPhase);
  if (!currentPhaseHealth.canProceed) {
    console.error(`❌ Cannot move to next phase - current phase ${currentPhase} is not healthy: ${currentPhaseHealth.reason}`);
    throw new Error(`Phase ${currentPhase} is not ready for transition: ${currentPhaseHealth.reason}`);
  }
  
  const phaseConfig = WORKFLOW_PHASES[currentPhase];
  const nextPhase = phaseConfig?.nextPhase;
  
  if (!nextPhase) {
    console.log('✅ All phases complete!');
    return;
  }
  
  console.log(`➡️ Moving from ${currentPhase} to ${nextPhase}`);
  console.log(`   Phase health summary: ${currentPhaseHealth.successfulAgents}/${currentPhaseHealth.totalAgents} succeeded`);
  console.log(`   Analysis context: ${JSON.stringify(analysisContext)}`);
  
  // CRITICAL: Debug rebalance phase transitions
  if (analysisContext?.type === 'rebalance') {
    console.log(`🔄 REBALANCE PHASE TRANSITION: ${currentPhase} → ${nextPhase}`);
    if (currentPhase === 'analysis' && nextPhase !== 'research') {
      console.error(`❌ WRONG TRANSITION: Analysis should go to Research, not ${nextPhase}!`);
    }
  }
  
  // Check if the next phase has any incomplete agents
  const nextPhaseHealth = await checkPhaseHealth(supabase, analysisId, nextPhase);
  console.log(`📊 Next phase (${nextPhase}) health:`, {
    completed: nextPhaseHealth.completedAgents,
    total: nextPhaseHealth.totalAgents,
    failed: nextPhaseHealth.failedAgents,
    pending: nextPhaseHealth.pendingAgents,
    running: nextPhaseHealth.runningAgents,
    canProceed: nextPhaseHealth.canProceed
  });
  
  // CRITICAL DEBUG: Log exactly what's happening with rebalance phase transitions
  if (analysisContext?.type === 'rebalance') {
    console.log(`🔍 REBALANCE DEBUG - Phase transition from ${currentPhase} to ${nextPhase}:`);
    console.log(`   Next phase completed agents: ${nextPhaseHealth.completedAgents}`);
    console.log(`   Next phase total agents: ${nextPhaseHealth.totalAgents}`);
    console.log(`   Will skip? ${nextPhaseHealth.completedAgents === nextPhaseHealth.totalAgents && nextPhaseHealth.totalAgents > 0}`);
  }
  
  // If all agents in next phase are already complete, recursively move to the next phase
  if (nextPhaseHealth.completedAgents === nextPhaseHealth.totalAgents && nextPhaseHealth.totalAgents > 0) {
    console.warn(`⚠️ Phase ${nextPhase} shows as already complete - this is suspicious`);
    console.warn(`   Completed agents: ${nextPhaseHealth.completedAgents}`);
    console.warn(`   Total agents: ${nextPhaseHealth.totalAgents}`);
    
    // CRITICAL: For rebalance context, phases should NOT be pre-completed
    if (analysisContext?.type === 'rebalance') {
      console.error(`❌ CRITICAL BUG: Rebalance phase ${nextPhase} is marked as complete but shouldn't be!`);
      console.error(`   This will cause the workflow to skip phases incorrectly`);
      
      // Instead of skipping, we should reinitialize this phase
      console.log(`🔄 Reinitializing phase ${nextPhase} for rebalance workflow`);
      
      // Reset the phase by starting its first agent
      const nextPhaseConfig = WORKFLOW_PHASES[nextPhase];
      if (nextPhaseConfig && nextPhaseConfig.agents && nextPhaseConfig.agents.length > 0) {
        const firstAgent = nextPhaseConfig.agents[0];
        console.log(`🚀 Starting first agent of ${nextPhase}: ${firstAgent}`);
        
        invokeAgentWithRetry(
          supabase,
          firstAgent,
          analysisId,
          ticker,
          userId,
          apiSettings,
          2,
          nextPhase,
          analysisContext
        );
        
        return; // Don't recurse, just start the phase properly
      }
    }
    
    // For non-rebalance context, allow skipping completed phases (backward compatibility)
    // Check if the phase can actually proceed (e.g., no critical failures)
    if (nextPhaseHealth.canProceed) {
      // Recursively move to the next phase
      return await moveToNextPhase(supabase, analysisId, ticker, userId, nextPhase, apiSettings, analysisContext);
    } else {
      console.warn(`⚠️ Phase ${nextPhase} is complete but cannot proceed: ${nextPhaseHealth.reason}`);
      throw new Error(`Phase ${nextPhase} has critical failures: ${nextPhaseHealth.reason}`);
    }
  }
  
  // Special handling for research phase - it needs debate initialization
  if (nextPhase === 'research') {
    console.log('🔬 Special handling for research phase - initializing debate mechanism');
    
    // Import phase initialization handler
    const { initializePhase } = await import('../handlers/phase-initialization.ts');
    
    // Call the proper research phase initialization which handles debate rounds
    await initializePhase(supabase, 'research', analysisId, ticker, userId, apiSettings, analysisContext);
    
    console.log('✅ Research phase initialized with debate mechanism');
    return;
  }
  
  // Find the first incomplete agent in the next phase (for non-research phases)
  const nextPhaseConfig = WORKFLOW_PHASES[nextPhase];
  if (nextPhaseConfig && nextPhaseConfig.agents && nextPhaseConfig.agents.length > 0) {
    // Get workflow steps to check agent status
    const { data: analysis } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();
    
    const workflowSteps = analysis?.full_analysis?.workflowSteps || [];
    const phaseStep = workflowSteps.find((step: any) => step.id === nextPhase);
    
    // Find first agent that isn't completed
    let agentToStart = null;
    for (const agentFunc of nextPhaseConfig.agents) {
      const agentDisplayName = agentFunc.split('-').slice(1)
        .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
      
      const agentStatus = phaseStep?.agents?.find((a: any) => 
        a.name === agentDisplayName ||
        a.functionName === agentFunc ||
        (agentDisplayName === 'Analysis Portfolio Manager' && a.name === 'Portfolio Manager')
      );
      
      if (!agentStatus || agentStatus.status !== 'completed') {
        agentToStart = agentFunc;
        console.log(`🎯 Found incomplete agent to start: ${agentFunc} (status: ${agentStatus?.status || 'not started'})`);
        break;
      }
    }
    
    if (agentToStart) {
      console.log(`🚀 Starting incomplete agent of ${nextPhase} phase: ${agentToStart}`);
      
      // Fire-and-forget invocation of the next phase's first agent
      invokeAgentWithRetry(
        supabase,
        agentToStart,
        analysisId,
        ticker,
        userId,
        apiSettings,
        2, // maxRetries
        nextPhase, // phase parameter
        analysisContext // Pass context through to next phase's first agent
      );
    } else {
      console.log(`✅ All agents in ${nextPhase} are complete`);
      // If all agents are complete but phase can proceed, move to next phase
      if (nextPhaseHealth.canProceed) {
        return await moveToNextPhase(supabase, analysisId, ticker, userId, nextPhase, apiSettings, analysisContext);
      }
    }
  } else {
    console.warn(`⚠️ No agents defined for phase: ${nextPhase}`);
  }
}

/**
 * Run a research debate round
 */
export async function runResearchDebateRound(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  round: number,
  analysisContext?: any
) {
  console.log(`🔄 Starting research debate round ${round}`);
  
  // Initialize debate round atomically
  const initResult = await initializeDebateRound(supabase, analysisId, round);
  if (!initResult.success) {
    console.error('Failed to initialize debate round:', initResult.error);
  }
  
  // Only start Bull researcher - Bear will be triggered after Bull completes
  // This ensures sequential debate where Bear responds to Bull's arguments
  console.log(`🐂 Starting Bull researcher for round ${round}...`);
  // Fire-and-forget invocation of Bull researcher
  invokeAgentWithRetry(
    supabase,
    'agent-bull-researcher',
    analysisId,
    ticker,
    userId,
    apiSettings,
    2, // maxRetries
    'research', // phase parameter
    analysisContext // Pass context through to Bull researcher
  );
}

/**
 * Handle fallback invocation when an agent fails to directly invoke the next agent
 * This is the critical fix for the coordinator bug
 */
export async function handleFailedInvocationFallback(
  supabase: any,
  phase: string,
  completedAgent: string,
  failedToInvoke: string,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<Response> {
  console.log(`🔄 FALLBACK: ${completedAgent} failed to invoke ${failedToInvoke}, coordinator taking over`);
  
  // Validate that the failed agent is actually the next agent in sequence
  const nextAgent = getNextAgentInPhase(phase, completedAgent);
  
  if (!nextAgent) {
    console.warn(`⚠️ No next agent found for ${completedAgent} in phase ${phase}`);
    return createErrorResponse(`No next agent found for ${completedAgent} in phase ${phase}`);
  }
  
  if (nextAgent !== failedToInvoke) {
    console.warn(`⚠️ Fallback mismatch: expected ${nextAgent}, got ${failedToInvoke}`);
    // Continue with the expected next agent
  }
  
  // Use the validated next agent
  const targetAgent = nextAgent;
  
  console.log(`🎯 Coordinator attempting to invoke ${targetAgent} as fallback for ${completedAgent}`);
  
  // Set target agent status to "running" before invoking to prevent duplicates
  const agentDisplayName = getAgentDisplayName(targetAgent);
  console.log(`📍 Setting ${agentDisplayName} status to "running" before fallback invocation`);
  
  try {
    await supabase.rpc('update_workflow_step_status', {
      p_analysis_id: analysisId,
      p_phase_id: phase,
      p_agent_name: agentDisplayName,
      p_status: 'running'
    });
  } catch (statusError) {
    console.error(`⚠️ Failed to set status for ${agentDisplayName}:`, statusError);
    // Continue with invocation even if status update fails
  }
  
  // Try to invoke the failed agent with enhanced retry
  const result = await invokeWithRetry(supabase, targetAgent, {
    analysisId,
    ticker,
    userId,
    apiSettings,
    analysisContext
  });
  
  if (result.success) {
    console.log(`✅ Coordinator successfully invoked ${targetAgent} as fallback`);
    return createSuccessResponse({
      message: `Fallback successful - ${targetAgent} started by coordinator`,
      fallbackSuccess: true,
      targetAgent
    });
  } else {
    console.error(`❌ Coordinator fallback failed for ${targetAgent}: ${result.error}`);
    
    // Set status to error if invocation fails
    try {
      await supabase.rpc('update_workflow_step_status', {
        p_analysis_id: analysisId,
        p_phase_id: phase,
        p_agent_name: agentDisplayName,
        p_status: 'error'
      });
    } catch (statusError) {
      console.error(`⚠️ Failed to set error status for ${agentDisplayName}:`, statusError);
    }
    
    // Try to continue with the next agent after the failed one
    const nextAfterFailed = getNextAgentInPhase(phase, targetAgent.replace('agent-', ''));
    if (nextAfterFailed) {
      console.log(`🔄 Attempting to skip failed agent and continue with: ${nextAfterFailed}`);
      
      // Set next agent status before invoking
      const nextAgentDisplayName = getAgentDisplayName(nextAfterFailed);
      console.log(`📍 Setting ${nextAgentDisplayName} status to "running" before skip invocation`);
      
      try {
        await supabase.rpc('update_workflow_step_status', {
          p_analysis_id: analysisId,
          p_phase_id: phase,
          p_agent_name: nextAgentDisplayName,
          p_status: 'running'
        });
      } catch (statusError) {
        console.error(`⚠️ Failed to set status for ${nextAgentDisplayName}:`, statusError);
      }
      
      const skipResult = await invokeWithRetry(supabase, nextAfterFailed, {
        analysisId,
        ticker,
        userId,
        apiSettings,
        analysisContext
      });
      
      if (skipResult.success) {
        console.log(`✅ Successfully skipped failed agent and continued with: ${nextAfterFailed}`);
        return createSuccessResponse({
          message: `Skipped failed agent ${targetAgent}, continued with ${nextAfterFailed}`,
          fallbackSuccess: true,
          skippedAgent: targetAgent,
          continueWithAgent: nextAfterFailed
        });
      } else {
        // Set error status for the skipped agent too
        try {
          await supabase.rpc('update_workflow_step_status', {
            p_analysis_id: analysisId,
            p_phase_id: phase,
            p_agent_name: nextAgentDisplayName,
            p_status: 'error'
          });
        } catch (statusError) {
          console.error(`⚠️ Failed to set error status for ${nextAgentDisplayName}:`, statusError);
        }
      }
    }
    
    // All fallback attempts failed - mark analysis as error for retry capability
    console.error(`❌ CRITICAL: All fallback attempts failed - marking analysis as error`);
    
    // Import required modules for status updates
    const { markAnalysisAsErrorWithRebalanceCheck } = await import('./analysis-error-handler.ts');
    const { updateWorkflowStepStatus } = await import('../../_shared/atomicUpdate.ts');
    
    // Use unified helper to mark analysis as error and notify rebalance if needed
    const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
      supabase,
      analysisId,
      ticker,
      userId,
      apiSettings,
      `${targetAgent || 'Phase'} invocation failed after retries`
    );
    
    if (!errorResult.success) {
      console.error(`❌ Failed to mark analysis as ERROR:`, errorResult.error);
    } else {
      console.log(`✅ Marked analysis ${analysisId} as error status for retry capability`);
      if (errorResult.rebalanceNotified) {
        console.log(`📊 Rebalance-coordinator notified of fallback failure`);
      }
    }
    
    // Mark the failed agent in workflow for retry targeting
    try {
      const agentDisplayName = targetAgent.replace('agent-', '').split('-')
        .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
      
      const workflowResult = await updateWorkflowStepStatus(
        supabase,
        analysisId,
        phase,
        agentDisplayName,
        'error'
      );
      
      if (workflowResult.success) {
        console.log(`✅ Marked ${agentDisplayName} as error in workflow for retry targeting`);
      } else {
        console.error('Failed to update workflow status:', workflowResult.error);
      }
    } catch (workflowError: any) {
      console.error('Failed to update workflow step status:', workflowError);
    }
    
    // Return error with retry-friendly information
    return createErrorResponse(
      `Analysis failed: All fallback attempts failed for ${targetAgent}. Analysis marked for retry.`,
      500,
      {
        retryable: true,
        failedAgent: targetAgent,
        failedPhase: phase,
        analysisId
      }
    );
  }
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
