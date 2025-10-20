import { WORKFLOW_PHASES } from '../analysis-coordinator/config/workflow.ts';
import { invokeWithRetry } from './invokeWithRetry.ts';

/**
 * Phase Progress Checker
 * 
 * Utilities for agents to check phase progress and determine next agent
 * without going through the coordinator for every handoff.
 */

/**
 * Get the next agent in sequence for the current phase
 * Returns null if current agent is the last in the phase
 */
export async function getNextAgentInSequence(
  supabase: any,
  analysisId: string,
  phase: string,
  currentAgentName: string
): Promise<string | null> {
  const phaseConfig = WORKFLOW_PHASES[phase];
  if (!phaseConfig || !phaseConfig.agents) {
    console.warn(`⚠️ No phase config found for phase: ${phase}`);
    return null;
  }

  // Convert agent name to function name format if needed
  const currentAgentFunction = currentAgentName.startsWith('agent-')
    ? currentAgentName
    : `agent-${currentAgentName}`;

  // Find current agent index in the phase
  const currentIndex = phaseConfig.agents.indexOf(currentAgentFunction);

  if (currentIndex === -1) {
    console.warn(`⚠️ Current agent ${currentAgentFunction} not found in ${phase} phase agents`);
    return null;
  }

  // Check if there's a next agent in sequence
  const nextIndex = currentIndex + 1;
  if (nextIndex < phaseConfig.agents.length) {
    const nextAgent = phaseConfig.agents[nextIndex];
    console.log(`📋 Next agent in ${phase} phase: ${nextAgent}`);
    return nextAgent;
  }

  // Current agent is the last in the phase
  console.log(`✅ ${currentAgentFunction} is the last agent in ${phase} phase`);
  return null;
}

/**
 * Check if the current agent is the last one in the phase
 */
export async function isLastAgentInPhase(
  supabase: any,
  analysisId: string,
  phase: string,
  currentAgentName: string
): Promise<boolean> {
  const nextAgent = await getNextAgentInSequence(supabase, analysisId, phase, currentAgentName);
  return nextAgent === null;
}

/**
 * Get phase configuration for a given phase
 */
export function getPhaseConfig(phase: string) {
  return WORKFLOW_PHASES[phase] || null;
}

/**
 * Get all agents for a phase in order
 */
export function getPhaseAgents(phase: string): string[] {
  const phaseConfig = WORKFLOW_PHASES[phase];
  return phaseConfig ? phaseConfig.agents : [];
}

/**
 * Check if a phase exists
 */
export function isValidPhase(phase: string): boolean {
  return phase in WORKFLOW_PHASES;
}

/**
 * Get the final agent for a phase (if any)
 */
export function getFinalAgentForPhase(phase: string): string | null {
  const phaseConfig = WORKFLOW_PHASES[phase];
  return phaseConfig?.finalAgent || null;
}

/**
 * Check if all regular agents in a phase are complete and it's time for the final agent
 */
export async function shouldStartFinalAgent(
  supabase: any,
  analysisId: string,
  phase: string,
  completedAgent: string
): Promise<boolean> {
  const phaseConfig = WORKFLOW_PHASES[phase];
  if (!phaseConfig || !phaseConfig.finalAgent) {
    return false;
  }

  // Check if the completed agent was the last regular agent
  const regularAgents = phaseConfig.agents || [];
  const completedAgentFunction = completedAgent.startsWith('agent-')
    ? completedAgent
    : `agent-${completedAgent}`;

  const completedIndex = regularAgents.indexOf(completedAgentFunction);
  const isLastRegularAgent = completedIndex >= 0 && completedIndex === regularAgents.length - 1;

  console.log(`🎯 Checking final agent for ${phase}: completed=${completedAgent}, isLast=${isLastRegularAgent}, finalAgent=${phaseConfig.finalAgent}`);

  return isLastRegularAgent;
}

/**
 * Get incomplete agents (pending or error status) in the current phase
 */
async function getIncompleteAgentsInPhase(
  supabase: any,
  analysisId: string,
  phase: string
): Promise<string[]> {
  try {
    // Fetch the current analysis workflow status
    const { data: analysis, error } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();

    if (error || !analysis) {
      console.error('Failed to fetch analysis:', error);
      return [];
    }

    const workflowSteps = analysis.full_analysis?.workflowSteps || [];
    const phaseStep = workflowSteps.find((step: any) => step.id === phase);

    if (!phaseStep) {
      console.warn(`Phase ${phase} not found in workflow steps`);
      return [];
    }

    // Get all agents in this phase from config
    const phaseConfig = WORKFLOW_PHASES[phase];
    if (!phaseConfig || !phaseConfig.agents) {
      return [];
    }

    const incompleteAgents: string[] = [];

    // Check each agent in the phase configuration
    for (const agentFunction of phaseConfig.agents) {
      // Find the agent in workflow steps
      const agentDisplayName = getAgentDisplayName(agentFunction);
      const agentStatus = phaseStep.agents?.find((a: any) =>
        a.name === agentDisplayName ||
        (agentDisplayName === 'Analysis Portfolio Manager' && a.name === 'Portfolio Manager') ||
        a.functionName === agentFunction
      );

      // Treat agents with no status as pending; only include those that still need to run
      // Skip agents already marked as error so the coordinator can decide how to handle them
      if (!agentStatus || agentStatus.status === 'pending') {
        incompleteAgents.push(agentFunction);
      }
    }

    return incompleteAgents;
  } catch (error) {
    console.error('Error getting incomplete agents:', error);
    return [];
  }
}

/**
 * Direct invoke next agent with smart selection (random from incomplete/error agents)
 */
export async function invokeNextAgentInSequence(
  supabase: any,
  analysisId: string,
  phase: string,
  currentAgentName: string,
  ticker: string,
  userId: string,
  apiSettings: any,
  analysisContext?: any
): Promise<{ success: boolean; nextAgent?: string; isLastInPhase?: boolean; error?: string; intendedAgent?: string }> {

  let intendedNextAgent: string | null = null;

  try {
    // First, get all incomplete agents in this phase
    let incompleteAgents = await getIncompleteAgentsInPhase(supabase, analysisId, phase);

    // Filter out the current agent from the incomplete list (since it's currently running)
    const currentAgentFunction = currentAgentName.startsWith('agent-')
      ? currentAgentName
      : `agent-${currentAgentName}`;
    incompleteAgents = incompleteAgents.filter(agent => agent !== currentAgentFunction);

    console.log(`📊 Found ${incompleteAgents.length} incomplete agents in ${phase} phase (excluding current agent ${currentAgentFunction}):`, incompleteAgents);

    // If no other incomplete agents, check if we should invoke final agent
    if (incompleteAgents.length === 0) {
      const finalAgent = getFinalAgentForPhase(phase);
      if (finalAgent) {
        // Check if final agent is already complete
        const { data: analysis } = await supabase
          .from('analysis_history')
          .select('full_analysis')
          .eq('id', analysisId)
          .single();

        const workflowSteps = analysis?.full_analysis?.workflowSteps || [];
        const phaseStep = workflowSteps.find((step: any) => step.id === phase);
        const finalAgentStatus = phaseStep?.agents?.find((a: any) =>
          a.name === getFinalAgentDisplayName(finalAgent) ||
          a.functionName === finalAgent
        );

        if (!finalAgentStatus || finalAgentStatus.status !== 'completed') {
          console.log(`🎯 Invoking final agent for ${phase} phase: ${finalAgent}`);

          // Set final agent status to "running" before invoking to prevent duplicates
          const agentDisplayName = getFinalAgentDisplayName(finalAgent);
          console.log(`📍 Setting ${agentDisplayName} status to "running" before invocation`);
          await supabase.rpc('update_workflow_step_status', {
            p_analysis_id: analysisId,
            p_phase_id: phase,
            p_agent_name: agentDisplayName,
            p_status: 'running'
          });

          const finalResult = await invokeWithRetry(
            supabase,
            finalAgent,
            {
              analysisId,
              ticker,
              userId,
              apiSettings,
              analysisContext
            }
          );

          if (!finalResult.success) {
            // Update status to error if invocation fails
            await supabase.rpc('update_workflow_step_status', {
              p_analysis_id: analysisId,
              p_phase_id: phase,
              p_agent_name: agentDisplayName,
              p_status: 'error'
            });
            throw new Error(`Failed to invoke final agent ${finalAgent}: ${finalResult.error}`);
          }

          return {
            success: true,
            nextAgent: finalAgent,
            isLastInPhase: false
          };
        }
      }

      // All agents complete, this is the last agent in the phase
      console.log(`✅ All agents in ${phase} phase are complete`);
      return {
        success: true,
        isLastInPhase: true
      };
    }

    // Randomly select one of the incomplete agents
    const randomIndex = Math.floor(Math.random() * incompleteAgents.length);
    const nextAgent = incompleteAgents[randomIndex];
    intendedNextAgent = nextAgent;

    console.log(`🎲 Randomly selected incomplete agent: ${nextAgent} from ${incompleteAgents.length} options`);

    // Set next agent status to "running" before invoking to prevent duplicates
    const nextAgentDisplayName = getAgentDisplayName(nextAgent);
    console.log(`📍 Setting ${nextAgentDisplayName} status to "running" before invocation`);
    await supabase.rpc('update_workflow_step_status', {
      p_analysis_id: analysisId,
      p_phase_id: phase,
      p_agent_name: nextAgentDisplayName,
      p_status: 'running'
    });

    // Invoke the selected agent with retry logic
    console.log(`🚀 Directly invoking selected agent: ${nextAgent}`);

    const result = await invokeWithRetry(
      supabase,
      nextAgent,
      {
        analysisId,
        ticker,
        userId,
        apiSettings,
        analysisContext
      }
    );

    if (!result.success) {
      // Update status to error if invocation fails
      await supabase.rpc('update_workflow_step_status', {
        p_analysis_id: analysisId,
        p_phase_id: phase,
        p_agent_name: nextAgentDisplayName,
        p_status: 'error'
      });
      throw new Error(`Failed to invoke agent ${nextAgent}: ${result.error}`);
    }

    console.log(`✅ Successfully invoked ${nextAgent}`);

    return {
      success: true,
      nextAgent: nextAgent,
      isLastInPhase: false
    };

  } catch (error: any) {
    console.error(`❌ Failed to invoke next agent in ${phase} phase:`, error);

    return {
      success: false,
      error: error.message,
      isLastInPhase: false,
      intendedAgent: intendedNextAgent || undefined
    };
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

/**
 * Get display name for final agent function name
 */
function getFinalAgentDisplayName(finalAgentName: string): string {
  const nameMap: { [key: string]: string } = {
    'agent-research-manager': 'Research Manager',
    'agent-risk-manager': 'Risk Manager',
    'analysis-portfolio-manager': 'Analysis Portfolio Manager'
  };

  return nameMap[finalAgentName] || finalAgentName;
}
