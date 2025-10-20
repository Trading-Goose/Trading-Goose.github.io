import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { invokeAgentWithRetry } from '../../_shared/invokeWithRetry.ts';
import { updateWorkflowStepStatus } from '../../_shared/atomicUpdate.ts';
import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';
import { WORKFLOW_PHASES } from '../config/workflow.ts';
import { buildAnalysisContext, persistAnalysisContext } from '../utils/context-builder.ts';

/**
 * Reactivate a stale running analysis by finding the last completed agent and resuming from the next one
 * This is for analyses that are stuck in 'running' state without errors
 */
export async function reactivateStaleAnalysis(
  supabase: any,
  analysisId: string,
  userId: string,
  apiSettings: ApiSettings,
  forceReactivate: boolean = false
): Promise<Response> {

  console.log(`🔄 Reactivation request for analysis: ${analysisId}`);
  const resolvedUserId = typeof userId === 'string' ? userId.trim() : '';

  if (!resolvedUserId) {
    console.error('❌ Invalid user ID provided for reactivation', { analysisId, userId });
    return createErrorResponse('Invalid user identifier for reactivation');
  }

  try {
    // Fetch the analysis (security: ensure user owns this analysis)
    const { data: analysis, error: fetchError } = await supabase
      .from('analysis_history')
      .select('*')
      .eq('id', analysisId)
      .eq('user_id', resolvedUserId)
      .single();

    if (fetchError || !analysis) {
      console.error('❌ Analysis not found:', fetchError?.message);
      return createErrorResponse('Analysis not found');
    }

    // Check if analysis is in running state (NOT pending - pending might be part of a rebalance queue)
    if (analysis.analysis_status !== ANALYSIS_STATUS.RUNNING) {
      console.warn(`⚠️ Analysis ${analysisId} is not in running state: ${analysis.analysis_status}`);
      return createErrorResponse(
        `Cannot reactivate analysis that is not in running state. Current status: ${analysis.analysis_status}`
      );
    }

    // Check if analysis is actually stale (unless force flag is set)
    if (!forceReactivate) {
      const lastUpdate = new Date(analysis.updated_at);
      const timeSinceUpdate = Date.now() - lastUpdate.getTime();
      const staleThreshold = 3.5 * 60 * 1000; // 5 minutes

      if (timeSinceUpdate < staleThreshold) {
        console.warn(`⚠️ Analysis ${analysisId} was updated ${Math.round(timeSinceUpdate / 1000)}s ago, not considered stale`);
        return createErrorResponse(
          `Analysis was updated ${Math.round(timeSinceUpdate / 1000)} seconds ago and is not stale. Use forceReactivate=true to override.`
        );
      }

      console.log(`✅ Analysis is stale (last update: ${Math.round(timeSinceUpdate / 60000)} minutes ago)`);
    }

    console.log(`📋 Analyzing workflow state for ${analysis.ticker}`);

    // Find the next agent to run based on workflow state
    const nextAgentInfo = findNextAgentToRun(analysis);

    if (!nextAgentInfo) {
      console.warn('⚠️ Could not determine next agent to run');

      // Check if analysis might actually be complete
      const workflowSteps = analysis.full_analysis?.workflowSteps || [];
      const allComplete = workflowSteps.every((phase: any) =>
        phase.agents?.every((agent: any) =>
          agent.status === 'completed' || agent.status === 'skipped'
        )
      );

      if (allComplete) {
        console.log('✅ All agents appear complete, marking analysis as completed');
        await supabase
          .from('analysis_history')
          .update({
            analysis_status: ANALYSIS_STATUS.COMPLETED,
            updated_at: new Date().toISOString()
          })
          .eq('id', analysisId);

        return createSuccessResponse({
          message: 'Analysis appears complete, status updated',
          analysisId
        });
      }

      return createErrorResponse(
        'Unable to determine next agent to run from workflow state'
      );
    }

    const { agent, phase, agentName, reason } = nextAgentInfo;

    console.log(`🎯 Next agent to run: ${agent} in phase: ${phase}`);
    console.log(`📝 Reason: ${reason}`);

    const baseContext: AnalysisContext = {
      ...(analysis.full_analysis?.analysisContext || {}),
      type: analysis.rebalance_request_id ? 'rebalance' : 'individual',
      rebalanceRequestId: analysis.rebalance_request_id || analysis.full_analysis?.analysisContext?.rebalanceRequestId
    } as AnalysisContext;

    const refreshedContext = await buildAnalysisContext(
      supabase,
      resolvedUserId,
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
      console.error('Failed to persist refreshed analysis context during reactivation:', persistError);
    }

    // Update the agent status to pending (from its current state)
    const stepUpdateResult = await updateWorkflowStepStatus(
      supabase,
      analysisId,
      phase,
      agentName,
      'pending'
    );

    if (!stepUpdateResult.success) {
      console.error('❌ Failed to update agent status:', stepUpdateResult.error);
      // Continue anyway - the agent can still run
    } else {
      console.log(`✅ Reset ${agentName} status to pending`);
    }

    // Update analysis updated_at to show activity
    await supabase
      .from('analysis_history')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('id', analysisId);

    // Invoke the next agent to continue the analysis
    console.log(`🚀 Invoking ${agent} to continue stale analysis`);

    // For research phase, we need to handle debate rounds specially
    if (phase === 'research' && agent === 'agent-bull-researcher') {
      // Check current debate round
      const currentRound = analysis.full_analysis?.debateRounds?.currentRound || 1;
      const maxRounds = apiSettings.research_debate_rounds || 2;

      console.log(`📊 Research phase: Round ${currentRound}/${maxRounds}`);

      const researchContext = {
        ...refreshedContext,
        phase: 'research',
        round: currentRound,
        maxRounds
      };

      invokeAgentWithRetry(
        supabase,
        agent,
        analysisId,
        analysis.ticker,
        resolvedUserId,
        apiSettings,
        2,
        phase,
        researchContext // Keep context for research phase to preserve debate round
      );
    } else {
      // Normal agent invocation
      const contextForAgent = {
        ...refreshedContext,
        phase
      };

      invokeAgentWithRetry(
        supabase,
        agent,
        analysisId,
        analysis.ticker,
        resolvedUserId,
        apiSettings,
        2,
        phase,
        contextForAgent
      );
    }

    return createSuccessResponse({
      message: `Analysis reactivated, continuing from ${agentName}`,
      analysisId,
      phase,
      agent,
      agentName,
      ticker: analysis.ticker,
      reactivationInfo: {
        reason,
        lastUpdate: analysis.updated_at,
        timeSinceUpdate: Math.round((Date.now() - new Date(analysis.updated_at).getTime()) / 60000) + ' minutes'
      }
    });

  } catch (error: any) {
    console.error('❌ Reactivation failed with error:', error);
    return createErrorResponse(
      `Failed to reactivate analysis: ${error.message}`
    );
  }
}

/**
 * Find the next agent to run based on workflow state
 * Returns the first pending/error agent, or the next agent after the last completed one
 */
function findNextAgentToRun(analysis: any): {
  agent: string;
  phase: string;
  agentName: string;
  reason: string;
} | null {
  const workflowSteps = analysis.full_analysis?.workflowSteps || [];

  // Define the expected workflow order
  const phaseOrder = ['analysis', 'research', 'trading', 'risk', 'portfolio'];

  const agentOrder = {
    'analysis': [
      'Macro Analyst',
      'Market Analyst',
      'News Analyst',
      'Social Media Analyst',
      'Fundamentals Analyst'
    ],
    'research': [
      'Bull Researcher',
      'Bear Researcher',
      'Research Manager'
    ],
    'trading': ['Trader'],
    'risk': [
      'Risky Analyst',
      'Safe Analyst',
      'Neutral Analyst',
      'Risk Manager'
    ],
    'portfolio': ['Analysis Portfolio Manager', 'Portfolio Manager']
  };

  // First, look for any running agents that might be stuck
  for (const phaseName of phaseOrder) {
    const phase = workflowSteps.find((p: any) => p.id === phaseName);
    if (!phase) continue;

    const agents = phase.agents || [];
    const runningAgent = agents.find((a: any) => a.status === 'running');

    if (runningAgent) {
      // Check if this agent has been running too long (no insights)
      const agentKey = runningAgent.name.toLowerCase().replace(/\s+/g, '_').replace('agent_', '');
      const hasInsights = analysis.agent_insights && analysis.agent_insights[agentKey];

      if (!hasInsights) {
        // Special case for Portfolio Manager which uses 'analysis-portfolio-manager'
        const functionName = runningAgent.functionName ||
          ((runningAgent.name === 'Portfolio Manager' || runningAgent.name === 'Analysis Portfolio Manager')
            ? 'analysis-portfolio-manager'
            : `agent-${runningAgent.name.toLowerCase().replace(/\s+/g, '-')}`);

        return {
          agent: functionName,
          phase: phase.id,
          agentName: runningAgent.name,
          reason: 'Found running agent with no insights (likely stuck)'
        };
      }
    }
  }

  // Next, look for any pending agents (these should run next when no one is running)
  for (const phaseName of phaseOrder) {
    const phase = workflowSteps.find((p: any) => p.id === phaseName);
    if (!phase) continue;

    const agents = phase.agents || [];
    const pendingAgent = agents.find((a: any) => a.status === 'pending');

    if (pendingAgent) {
      // Special case for Portfolio Manager which uses 'analysis-portfolio-manager'
      const functionName = pendingAgent.functionName ||
        ((pendingAgent.name === 'Portfolio Manager' || pendingAgent.name === 'Analysis Portfolio Manager')
          ? 'analysis-portfolio-manager'
          : `agent-${pendingAgent.name.toLowerCase().replace(/\s+/g, '-')}`);

      return {
        agent: functionName,
        phase: phase.id,
        agentName: pendingAgent.name,
        reason: 'Found pending agent that was never started'
      };
    }
  }

  // Find the last completed agent and return the next one
  let lastCompletedPhaseIndex = -1;
  let lastCompletedAgentIndex = -1;

  for (let phaseIdx = 0; phaseIdx < phaseOrder.length; phaseIdx++) {
    const phaseName = phaseOrder[phaseIdx];
    const phase = workflowSteps.find((p: any) => p.id === phaseName);
    if (!phase) continue;

    const expectedAgents = agentOrder[phaseName as keyof typeof agentOrder] || [];
    const agents = phase.agents || [];

    for (let agentIdx = 0; agentIdx < expectedAgents.length; agentIdx++) {
      const expectedAgentName = expectedAgents[agentIdx];
      const agent = agents.find((a: any) => a.name === expectedAgentName ||
        (expectedAgentName === 'Analysis Portfolio Manager' && a.name === 'Portfolio Manager'));

      if (agent && agent.status === 'completed') {
        lastCompletedPhaseIndex = phaseIdx;
        lastCompletedAgentIndex = agentIdx;
      } else if (agent && (agent.status === 'pending' || agent.status === 'running' || agent.status === 'error')) {
        // This is the next agent that should run
        const functionName = agent.functionName ||
          ((agent.name === 'Portfolio Manager' || agent.name === 'Analysis Portfolio Manager')
            ? 'analysis-portfolio-manager'
            : `agent-${agent.name.toLowerCase().replace(/\s+/g, '-')}`);

        return {
          agent: functionName,
          phase: phase.id,
          agentName: agent.name,
          reason: `Next agent after last completed (${lastCompletedPhaseIndex >= 0 ? phaseOrder[lastCompletedPhaseIndex] : 'none'})`
        };
      }
    }
  }

  // If we've completed all agents in current phases, move to next phase
  if (lastCompletedPhaseIndex >= 0 && lastCompletedPhaseIndex < phaseOrder.length - 1) {
    const nextPhaseIndex = lastCompletedPhaseIndex + 1;
    const nextPhaseName = phaseOrder[nextPhaseIndex];
    const expectedAgents = agentOrder[nextPhaseName as keyof typeof agentOrder] || [];

    if (expectedAgents.length > 0) {
      const firstAgentName = expectedAgents[0];
      // Special case for Portfolio Manager which uses 'analysis-portfolio-manager'
      const functionName = (firstAgentName === 'Portfolio Manager' || firstAgentName === 'Analysis Portfolio Manager')
        ? 'analysis-portfolio-manager'
        : `agent-${firstAgentName.toLowerCase().replace(/\s+/g, '-')}`;

      return {
        agent: functionName,
        phase: nextPhaseName,
        agentName: firstAgentName,
        reason: `Starting next phase (${nextPhaseName}) after completing ${phaseOrder[lastCompletedPhaseIndex]}`
      };
    }
  }

  return null;
}
