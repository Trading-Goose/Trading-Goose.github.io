import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { invokeWithRetry } from '../../_shared/invokeWithRetry.ts';
import { updateWorkflowStepStatus } from '../../_shared/atomicUpdate.ts';
import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';
import { attemptPhaseRecovery, findLastSuccessfulPhase, resumeFromPhase } from '../utils/error-recovery.ts';
import { checkPhaseHealth } from '../utils/phase-health-checker.ts';
import { buildAnalysisContext, persistAnalysisContext } from '../utils/context-builder.ts';

/**
 * Retry a failed analysis by scanning workflow state and resuming from the first failed agent
 */
export async function retryFailedAnalysis(
  supabase: any,
  analysisId: string,
  userId: string,
  apiSettings: ApiSettings
): Promise<Response> {
  
  console.log(`🔄 Retry request for analysis: ${analysisId}`);
  
  try {
    // Fetch the failed analysis (security: ensure user owns this analysis)
    const { data: analysis, error: fetchError } = await supabase
      .from('analysis_history')
      .select('*')
      .eq('id', analysisId)
      .eq('user_id', userId)
      .single();
      
    if (fetchError || !analysis) {
      console.error('❌ Analysis not found:', fetchError?.message);
      return createErrorResponse('Analysis not found');
    }
    
    if (analysis.analysis_status !== ANALYSIS_STATUS.ERROR) {
      console.warn(`⚠️ Analysis ${analysisId} is not in error state: ${analysis.analysis_status}`);
      return createErrorResponse(
        `Cannot retry analysis that is not in error state. Current status: ${analysis.analysis_status}`
      );
    }
    
    // Additional check: prevent retrying cancelled analyses
    if (analysis.analysis_status === ANALYSIS_STATUS.CANCELLED) {
      console.warn(`⚠️ Analysis ${analysisId} was cancelled and cannot be retried`);
      return createErrorResponse(
        'Cannot retry cancelled analysis. Please start a new analysis instead.'
      );
    }
    
    console.log(`📋 Found failed analysis for ${analysis.ticker} - scanning for failed agent`);

    // Reset metadata flags that are only used by automatic stale detection
    const updatedMetadata = {
      ...(analysis.metadata || {}),
      max_reactivations_reached: false,
      reactivation_attempts: 0
    };
    console.log('🧹 Resetting stale detection metadata for manual retry', {
      previous: analysis.metadata,
      updated: updatedMetadata
    });
    
    // First, try to identify which phase needs recovery
    const lastSuccessfulPhase = await findLastSuccessfulPhase(supabase, analysisId);
    console.log(`📊 Last successful phase: ${lastSuccessfulPhase || 'none'}`);
    
    // Find failed agent to retry
    const { retryAgent, retryPhase, retryAgentName, failedAgents } = await findFailedAgent(analysis);

    // Ensure every failed agent is reset to pending before we start the retry flow
    if (failedAgents.length > 0) {
      console.log(`🧼 Resetting ${failedAgents.length} failed agents back to pending before retry`);
      for (const agentInfo of failedAgents) {
        try {
          const resetResult = await updateWorkflowStepStatus(
            supabase,
            analysisId,
            agentInfo.phase,
            agentInfo.displayName,
            'pending'
          );
          if (!resetResult.success) {
            console.warn(`⚠️ Failed to reset ${agentInfo.displayName} to pending:`, resetResult.error);
          } else {
            console.log(`✅ ${agentInfo.displayName} reset to pending`);
          }
        } catch (resetError: any) {
          console.error(`❌ Exception resetting ${agentInfo.displayName} to pending:`, resetError);
        }
      }
    }
    
    // CRITICAL: For rebalance analyses, NEVER retry portfolio manager
    if (analysis.rebalance_request_id && retryAgent === 'analysis-portfolio-manager') {
      console.log('⚠️ Skipping portfolio manager retry for rebalance analysis');
      // Instead, notify rebalance-coordinator that the analysis is complete
      const result = await invokeWithRetry(
        supabase,
        'rebalance-coordinator',
        {
          action: 'analysis-completed',
          rebalanceRequestId: analysis.rebalance_request_id,
          analysisId,
          ticker: analysis.ticker,
          userId,
          apiSettings,
          success: false,
          error: 'Analysis failed - cannot retry portfolio manager for rebalance'
        }
      );
      
      return createSuccessResponse({
        message: 'Rebalance analysis complete - skipped portfolio manager',
        analysisId,
        rebalanceRequestId: analysis.rebalance_request_id
      });
    }
    
    if (!retryAgent) {
      console.warn('⚠️ No failed agent found in workflow steps');
      
      // Try to resume from the beginning of the first incomplete phase
      const phases = ['analysis', 'research', 'trading', 'risk', 'portfolio'];
      for (const phase of phases) {
        const phaseHealth = await checkPhaseHealth(supabase, analysisId, phase);
        if (phaseHealth.pendingAgents > 0 || phaseHealth.failedAgents > 0) {
          console.log(`🔄 Attempting to resume from phase: ${phase}`);
          
          const resumeResult = await resumeFromPhase(
            supabase,
            analysisId,
            phase,
            analysis.ticker,
            userId,
            apiSettings,
            analysis.full_analysis?.analysisContext
          );
          
          if (resumeResult.success) {
            return createSuccessResponse({
              message: resumeResult.message,
              analysisId,
              phase,
              ticker: analysis.ticker
            });
          }
        }
      }

      console.log('ℹ️ No agent eligible for retry - evaluating workflow completion');

      const workflowSteps = Array.isArray(analysis.full_analysis?.workflowSteps)
        ? analysis.full_analysis?.workflowSteps
        : Array.isArray((analysis.full_analysis as any)?.workflow_steps)
          ? (analysis.full_analysis as any).workflow_steps
          : [];

      const allAgentsCompleted = workflowSteps.every((phase: any) =>
          Array.isArray(phase?.agents)
            ? phase.agents.every((agent: any) =>
                agent?.status === 'completed'
                || agent?.status === 'skipped'
                || agent?.status === 'cancelled'
              )
            : true
        );

      if (allAgentsCompleted) {
        console.log('✅ Workflow already complete - marking analysis as completed');

        const completionTimestamp = new Date().toISOString();
        const { data: completionUpdate, error: completionError } = await supabase
          .from('analysis_history')
          .update({
            analysis_status: ANALYSIS_STATUS.COMPLETED,
            metadata: updatedMetadata,
            updated_at: completionTimestamp
          })
          .eq('id', analysisId)
          .select('analysis_status')
          .single();

        if (completionError) {
          console.error('❌ Failed to mark analysis as completed after no failed agents:', completionError);
          return createErrorResponse('Unable to finalize analysis status after retry check');
        }

        if (completionUpdate?.analysis_status === ANALYSIS_STATUS.COMPLETED) {
          return createSuccessResponse({
            message: 'Analysis already completed - no retry required',
            analysisId,
            status: ANALYSIS_STATUS.COMPLETED
          });
        }

        console.error('❌ Unexpected response while marking analysis as completed:', completionUpdate);
        return createErrorResponse('Unexpected database response while finalizing analysis');
      }

      return createErrorResponse(
        'No failed agent found to retry and unable to resume from any phase.'
      );
    }

    console.log(`🎯 Found failed agent: ${retryAgent} in phase: ${retryPhase}`);
    
    // ALWAYS update analysis status from 'error' to 'running' when retrying
    console.log(`📝 Updating analysis status from error to running for analysis ${analysisId}`);
    
    // First attempt to update
    const retryTimestamp = new Date().toISOString();

    let cleanedAgentInsights = analysis.agent_insights ? { ...analysis.agent_insights } : null;
    let removedAgentError = false;

    if (cleanedAgentInsights && failedAgents.length > 0) {
      const toCamelCase = (value: string) => value
        .replace(/^agent-/, '')
        .replace(/^analysis-/, '')
        .split(/[-_\s]/)
        .filter(Boolean)
        .map((segment, index) => {
          const lower = segment.toLowerCase();
          if (index === 0) return lower;
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join('');

      for (const agentInfo of failedAgents) {
        const normalizedDisplayKey = agentInfo.displayName.toLowerCase().replace(/\s+/g, '');
        const normalizedFunctionKey = agentInfo.functionName.replace('agent-', '').replace(/[-_\s]/g, '');
        const displayCamel = agentInfo.displayName
          .split(/\s+/)
          .map((segment, index) => {
            const lower = segment.toLowerCase();
            return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
          })
          .join('');
        const functionCamel = toCamelCase(agentInfo.functionName);

        const candidateKeys = new Set([
          normalizedDisplayKey,
          normalizedFunctionKey,
          agentInfo.functionName,
          displayCamel,
          functionCamel
        ]);

        for (const keyCandidate of candidateKeys) {
          if (!keyCandidate) continue;
          const possibleKeys = [keyCandidate, `${keyCandidate}_error`];
          for (const key of possibleKeys) {
            if (key && cleanedAgentInsights[key] !== undefined) {
              delete cleanedAgentInsights[key];
              removedAgentError = true;
              console.log(`🧽 Cleared stored insight key ${key}`);
            }
          }
        }
      }
    }

    let cleanedFullAnalysis = analysis.full_analysis
      ? JSON.parse(JSON.stringify(analysis.full_analysis))
      : null;
    let removedAgentHistory = false;

    const workflowStepsRef = Array.isArray(cleanedFullAnalysis?.workflowSteps)
      ? cleanedFullAnalysis.workflowSteps
      : Array.isArray((cleanedFullAnalysis as any)?.workflow_steps)
        ? (cleanedFullAnalysis as any).workflow_steps
        : null;

    if (workflowStepsRef && failedAgents.length > 0) {
      const normalizeDisplay = (value: string) => value.toLowerCase().replace(/\s+/g, '');
      const normalizeFunction = (value: string) => value.replace(/^agent-/, '').replace(/[-_\s]/g, '');

      for (const agentInfo of failedAgents) {
        const phaseStep = workflowStepsRef.find((step: any) => step?.id === agentInfo.phase);
        if (!phaseStep || !Array.isArray(phaseStep.agents)) {
          continue;
        }

        const agentIndex = phaseStep.agents.findIndex((agent: any) => {
          const candidateNames: string[] = [];
          if (typeof agent?.name === 'string') candidateNames.push(agent.name);
          if (typeof agent?.displayName === 'string') candidateNames.push(agent.displayName);

          const nameMatch = candidateNames.some(name =>
            normalizeDisplay(name) === normalizeDisplay(agentInfo.displayName)
          );

          const functionMatch = typeof agent?.functionName === 'string'
            && normalizeFunction(agent.functionName) === normalizeFunction(agentInfo.functionName);

          const portfolioFallback = agentInfo.displayName === 'Analysis Portfolio Manager'
            && candidateNames.some(name => normalizeDisplay(name) === 'portfoliomanager');

          return nameMatch || functionMatch || portfolioFallback;
        });

        if (agentIndex === -1) {
          continue;
        }

        const existingAgent = phaseStep.agents[agentIndex] || {};
        const preservedKeys = ['name', 'functionName', 'id', 'displayName', 'role', 'description', 'priority'];
        const baseAgent: Record<string, any> = {};

        for (const key of preservedKeys) {
          if (existingAgent[key] !== undefined) {
            baseAgent[key] = existingAgent[key];
          }
        }

        if (!baseAgent.name) {
          baseAgent.name = agentInfo.displayName;
        }
        if (agentInfo.functionName && !baseAgent.functionName) {
          baseAgent.functionName = agentInfo.functionName;
        }

        baseAgent.status = 'pending';
        baseAgent.progress = 0;
        baseAgent.updatedAt = retryTimestamp;

        phaseStep.agents[agentIndex] = baseAgent;
        removedAgentHistory = true;
        console.log(`🧼 Cleared stored history for ${agentInfo.displayName} in phase ${agentInfo.phase}`);
      }

      if (removedAgentHistory) {
        cleanedFullAnalysis.lastUpdated = retryTimestamp;
      }
    }

    // Check if analysis has been cancelled before attempting retry
    const { data: currentAnalysis, error: checkError } = await supabase
      .from('analysis_history')
      .select('analysis_status')
      .eq('id', analysisId)
      .single();
    
    if (checkError || !currentAnalysis) {
      console.error('❌ Failed to check current analysis status:', checkError);
      return createErrorResponse('Failed to check analysis status');
    }
    
    // Don't retry if analysis has been cancelled
    if (currentAnalysis.analysis_status === ANALYSIS_STATUS.CANCELLED) {
      console.log('⏩ Analysis has been cancelled, skipping retry');
      return createErrorResponse('Cannot retry cancelled analysis');
    }
    
    const baseUpdatePayload: Record<string, any> = {
      analysis_status: ANALYSIS_STATUS.RUNNING,
      metadata: updatedMetadata,
      updated_at: retryTimestamp
    };

    if (removedAgentError) {
      baseUpdatePayload.agent_insights = cleanedAgentInsights;
    }

    if (removedAgentHistory && cleanedFullAnalysis) {
      baseUpdatePayload.full_analysis = cleanedFullAnalysis;
      analysis.full_analysis = cleanedFullAnalysis;
    }

    const { data: updateResult, error: statusUpdateError } = await supabase
      .from('analysis_history')
      .update(baseUpdatePayload)
      .eq('id', analysisId)
      .eq('analysis_status', ANALYSIS_STATUS.ERROR)  // Only update if currently ERROR
      .neq('analysis_status', ANALYSIS_STATUS.CANCELLED)  // Never override cancelled status
      .select('analysis_status')
      .single();
    
    if (statusUpdateError) {
      console.error('❌ Failed to update analysis status:', statusUpdateError);
      
      // Try one more time without the status check
      const fallbackPayload = { ...baseUpdatePayload };
      const { data: secondAttempt, error: secondError } = await supabase
        .from('analysis_history')
        .update(fallbackPayload)
        .eq('id', analysisId)
        .select('analysis_status')
        .single();
      
      if (secondError || secondAttempt?.analysis_status !== ANALYSIS_STATUS.RUNNING) {
        console.error('❌ Second attempt also failed:', secondError);
        return createErrorResponse('Failed to update analysis status for retry');
      }
      
      console.log('✅ Updated analysis status to running on second attempt');
    } else if (!updateResult || updateResult.analysis_status !== ANALYSIS_STATUS.RUNNING) {
      console.error('❌ Status update returned but status is:', updateResult?.analysis_status);
      return createErrorResponse('Failed to set analysis status to running');
    } else {
      console.log(`✅ Updated analysis status to running`);
    }
    
    // Reset the failed agent status to pending so it can be retried
    console.log(`🔄 Resetting ${retryAgentName} status from error to pending`);
    
    const stepUpdateResult = await updateWorkflowStepStatus(
      supabase,
      analysisId,
      retryPhase,
      retryAgentName,
      'pending'
    );
    
    if (!stepUpdateResult.success) {
      console.error(`❌ Failed to reset ${retryAgentName} status:`, stepUpdateResult.error);
    } else {
      console.log(`✅ Reset ${retryAgentName} status to pending`);
    }
    
    // Directly invoke the failed agent exactly as it would be invoked normally
    console.log(`🚀 Retrying ${retryAgentName} by directly invoking ${retryAgent}`);
    
    // Import invokeAgentWithRetry for direct agent invocation
    const { invokeAgentWithRetry } = await import('../../_shared/invokeWithRetry.ts');

    const baseContext: AnalysisContext = {
      ...(analysis.full_analysis?.analysisContext || {}),
      type: analysis.rebalance_request_id ? 'rebalance' : 'individual',
      rebalanceRequestId: analysis.rebalance_request_id || analysis.full_analysis?.analysisContext?.rebalanceRequestId
    } as AnalysisContext;

    const refreshedContext = await buildAnalysisContext(
      supabase,
      userId,
      analysis.ticker,
      apiSettings,
      baseContext
    );

    try {
      await persistAnalysisContext(
        supabase,
        analysisId,
        analysis.full_analysis,
        refreshedContext
      );
    } catch (persistError) {
      console.error('Failed to persist refreshed analysis context:', persistError);
    }
    
    // Add a delay to ensure database updates have fully propagated
    // This is critical for preventing agents from seeing stale ERROR status
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Final verification that status is RUNNING before invoking agent
    const { data: finalCheck } = await supabase
      .from('analysis_history')
      .select('analysis_status')
      .eq('id', analysisId)
      .single();
    
    if (finalCheck?.analysis_status !== ANALYSIS_STATUS.RUNNING) {
      console.error(`❌ Status is still ${finalCheck?.analysis_status} after update - aborting retry`);
      return createErrorResponse('Failed to update analysis status - database issue');
    }
    
    try {
      const contextWithPhase = {
        ...refreshedContext,
        phase: retryPhase
      };

      // Set the primary retry agent to running before invocation
      const runningUpdate = await updateWorkflowStepStatus(
        supabase,
        analysisId,
        retryPhase,
        retryAgentName,
        'running'
      );
      if (!runningUpdate.success) {
        console.warn(`⚠️ Failed to set ${retryAgentName} to running before invocation:`, runningUpdate.error);
      }

      await invokeAgentWithRetry(
        supabase,
        retryAgent,
        analysisId,
        analysis.ticker,
        userId,
        apiSettings,
        2,
        retryPhase,
        contextWithPhase,
        {
          retryCount: 1,
          isRetryFromCoordinator: true
        }
      );

      console.log(`✅ ${retryAgent} scheduled for retry via invokeAgentWithRetry`);
    } catch (invokeError) {
      console.error(`❌ Failed to schedule ${retryAgent} for retry:`, invokeError);
      const errorMessage = invokeError instanceof Error ? invokeError.message : String(invokeError);
      return createErrorResponse(
        `Failed to invoke ${retryAgentName} for retry`,
        500,
        errorMessage
      );
    }

    return createSuccessResponse({
      message: `Analysis retry started from ${retryAgentName}`,
      analysisId,
      phase: retryPhase,
      agent: retryAgent,
      ticker: analysis.ticker
    });
    
  } catch (error: any) {
    console.error('❌ Retry failed with error:', error);
    return createErrorResponse(
      `Failed to retry analysis: ${error.message}`,
      500
    );
  }
}


/**
 * Find the failed agent to retry from workflow steps
 */
async function findFailedAgent(analysis: any) {
  // Define critical agents that must succeed for analysis to be meaningful
  const criticalAgents = new Set([
    'agent-market-analyst',    // Core technical analysis - essential
    'agent-trader',           // Trading decision - essential  
    'agent-risk-manager',     // Final risk assessment - essential
  ]);
  
  // Only add portfolio manager as critical for individual analyses (not rebalance)
  if (!analysis.rebalance_request_id) {
    criticalAgents.add('analysis-portfolio-manager');
  }
  
  // Define optional agents that can be skipped if they fail
  const optionalAgents = new Set([
    'agent-news-analyst',        // News analysis - helpful but not critical
    'agent-social-media-analyst', // Sentiment - helpful but not critical
    'agent-fundamentals-analyst', // Fundamentals - important but has fallbacks
    'agent-risky-analyst',       // Risk perspective - others can compensate
    'agent-safe-analyst',        // Risk perspective - others can compensate  
    'agent-neutral-analyst',     // Risk perspective - others can compensate
    'agent-bull-researcher',     // Research debate - can skip if needed
    'agent-bear-researcher'      // Research debate - can skip if needed
  ]);
  
  // Scan workflowSteps to find failed agents, prioritizing critical ones
  const workflowStepsRaw = Array.isArray(analysis.full_analysis?.workflowSteps)
    ? analysis.full_analysis.workflowSteps
    : Array.isArray((analysis.full_analysis as any)?.workflow_steps)
      ? (analysis.full_analysis as any).workflow_steps
      : [];

  const workflowSteps = Array.isArray(workflowStepsRaw) ? workflowStepsRaw : [];
  const includeRunningAgents = analysis.analysis_status === ANALYSIS_STATUS.ERROR;
  let failedAgents: Array<{
    phase: string;
    functionName: string;
    displayName: string;
    isCritical: boolean;
    isOptional: boolean;
    status: string;
    isStalePending: boolean;
  }> = [];
  
  // First pass: collect all failed and stale pending agents
  for (const phase of workflowSteps) {
    const agents = phase.agents || [];
    for (const agent of agents) {
      // Include agents with error status OR pending agents that are stale (> 5 minutes old) 
      // OR pending agents in portfolio phase (which often don't have updatedAt)
      const isError = agent.status === 'error';
      const isRunning = includeRunningAgents && agent.status === 'running';
      const isStalePending = agent.status === 'pending' && (
        (agent.updatedAt && Date.now() - new Date(agent.updatedAt).getTime() > 5 * 60 * 1000) ||
        (!agent.updatedAt && phase.id === 'portfolio') // Portfolio phase pending without updatedAt
      );
      
      if (isError || isStalePending || isRunning) {
        // Special handling for Portfolio Manager function name
        let agentFunctionName = agent.functionName;
        if (!agentFunctionName) {
          if (agent.name === 'Portfolio Manager' || agent.name === 'Analysis Portfolio Manager') {
            agentFunctionName = 'analysis-portfolio-manager';
          } else {
            agentFunctionName = `agent-${agent.name.toLowerCase().replace(/\s+/g, '-')}`;
          }
        }
        
        failedAgents.push({
          phase: phase.id,
          functionName: agentFunctionName,
          displayName: agent.name,
          isCritical: criticalAgents.has(agentFunctionName),
          isOptional: optionalAgents.has(agentFunctionName),
          status: agent.status,
          isStalePending
        });
      }
    }
  }

  const buildAgentRecord = (phase: any, agent: any) => {
    const functionName = agent.functionName ||
      ((agent.name === 'Portfolio Manager' || agent.name === 'Analysis Portfolio Manager')
        ? 'analysis-portfolio-manager'
        : `agent-${agent.name.toLowerCase().replace(/\s+/g, '-')}`);

    return {
      phase: phase.id,
      functionName,
      displayName: agent.name,
      isCritical: criticalAgents.has(functionName),
      isOptional: optionalAgents.has(functionName),
      status: agent.status,
      isStalePending: false
    };
  };

  if (failedAgents.length === 0) {
    console.log('ℹ️ No agents marked as error/stale pending during retry scan. Attempting running-agent fallback.');

    const runningAgentRecord = workflowSteps.reduce<ReturnType<typeof buildAgentRecord> | null>((acc, phase) => {
      if (acc) return acc;
      const runningAgent = (phase.agents || []).find((agent: any) => agent.status === 'running');
      if (runningAgent) {
        return buildAgentRecord(phase, runningAgent);
      }
      return null;
    }, null);

    if (runningAgentRecord) {
      console.log(`🎯 Falling back to running agent: ${runningAgentRecord.displayName} (${runningAgentRecord.functionName}) in phase ${runningAgentRecord.phase}`);
      failedAgents.push(runningAgentRecord);
    }
  }

  if (failedAgents.length === 0) {
    console.log('ℹ️ No running agents found. Attempting pending-agent fallback.');

    const pendingAgentRecord = workflowSteps.reduce<ReturnType<typeof buildAgentRecord> | null>((acc, phase) => {
      if (acc) return acc;
      const pendingAgent = (phase.agents || []).find((agent: any) => agent.status === 'pending');
      if (pendingAgent) {
        return buildAgentRecord(phase, pendingAgent);
      }
      return null;
    }, null);

    if (pendingAgentRecord) {
      console.log(`🎯 Falling back to pending agent: ${pendingAgentRecord.displayName} (${pendingAgentRecord.functionName}) in phase ${pendingAgentRecord.phase}`);
      failedAgents.push(pendingAgentRecord);
    }
  }

  if (failedAgents.length === 0) {
    return { retryAgent: null, retryPhase: null, retryAgentName: null, failedAgents: [] };
  }

  console.log(`📊 Found ${failedAgents.length} failed/stale agents:`, failedAgents.map(a => `${a.displayName} (${a.status === 'pending' ? 'stale pending' : a.status}, ${a.isCritical ? 'critical' : 'optional'})`));
  
  // Prioritize critical agents for retry
  let targetAgent = failedAgents.find(a => a.isCritical);
  if (!targetAgent) {
    // If no critical agents failed, retry the first optional agent
    targetAgent = failedAgents[0];
    console.log(`ℹ️ No critical agents failed, retrying optional agent: ${targetAgent.displayName}`);
  } else {
    console.log(`🎯 Retrying critical agent: ${targetAgent?.displayName}`);
  }
  
  if (!targetAgent) {
    // This shouldn't happen since we check failedAgents.length > 0 earlier
    throw new Error('No target agent found for retry');
  }
  
  return {
    retryAgent: targetAgent.functionName,
    retryPhase: targetAgent.phase,
    retryAgentName: targetAgent.displayName,
    failedAgents
  };
}
