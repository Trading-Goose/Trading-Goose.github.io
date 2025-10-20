import { WORKFLOW_PHASES } from '../config/workflow.ts';

export interface PhaseHealthStatus {
  phase: string;
  totalAgents: number;
  completedAgents: number;
  successfulAgents: number;
  failedAgents: number;
  runningAgents: number;
  pendingAgents: number;
  criticalFailures: string[];
  canProceed: boolean;
  reason?: string;
}

export interface AgentErrorCategory {
  isCritical: boolean;
  isRetryable: boolean;
  shouldStopPhase: boolean;
  shouldStopWorkflow: boolean;
}

/**
 * Categorize agent errors by severity and impact
 */
export function categorizeAgentError(
  agent: string,
  errorType?: string
): AgentErrorCategory {
  // Critical agents that must succeed
  const criticalAgents = [
    'agent-risk-manager',
    'agent-trader',
    'analysis-portfolio-manager'  // Portfolio manager is critical for individual analyses
  ];
  
  // Semi-critical agents (important but not workflow-stopping)
  const importantAgents = [
    'agent-bull-researcher',
    'agent-bear-researcher',
    'agent-research-manager'
  ];
  
  const isCritical = criticalAgents.includes(agent);
  const isImportant = importantAgents.includes(agent);
  
  // API key errors stop everything
  if (errorType === 'api_key') {
    return {
      isCritical: true,
      isRetryable: false,
      shouldStopPhase: true,
      shouldStopWorkflow: true
    };
  }
  
  // Rate limit errors are retryable
  if (errorType === 'rate_limit') {
    return {
      isCritical: false,
      isRetryable: true,
      shouldStopPhase: false,
      shouldStopWorkflow: false
    };
  }
  
  // Critical agent failures
  if (isCritical) {
    return {
      isCritical: true,
      isRetryable: errorType !== 'data_fetch',
      shouldStopPhase: true,
      shouldStopWorkflow: agent === 'agent-risk-manager'
    };
  }
  
  // Important agent failures
  if (isImportant) {
    return {
      isCritical: false,
      isRetryable: true,
      shouldStopPhase: agent !== 'agent-research-manager',
      shouldStopWorkflow: false
    };
  }
  
  // Non-critical agent failures
  return {
    isCritical: false,
    isRetryable: true,
    shouldStopPhase: false,
    shouldStopWorkflow: false
  };
}

/**
 * Check if a phase can proceed based on agent completion status
 */
export async function checkPhaseHealth(
  supabase: any,
  analysisId: string,
  phase: string
): Promise<PhaseHealthStatus> {
  const phaseConfig = WORKFLOW_PHASES[phase];
  if (!phaseConfig) {
    return {
      phase,
      totalAgents: 0,
      completedAgents: 0,
      successfulAgents: 0,
      failedAgents: 0,
      runningAgents: 0,
      pendingAgents: 0,
      criticalFailures: [],
      canProceed: false,
      reason: 'Unknown phase'
    };
  }
  
  // Query workflow steps for this phase from JSONB data
  const { data: analysisData, error } = await supabase
    .from('analysis_history')
    .select('full_analysis')
    .eq('id', analysisId)
    .single();
  
  if (error || !analysisData) {
    console.error('Error fetching analysis data:', error);
    return {
      phase,
      totalAgents: phaseConfig.agents.length,
      completedAgents: 0,
      successfulAgents: 0,
      failedAgents: 0,
      runningAgents: 0,
      pendingAgents: 0,
      criticalFailures: [],
      canProceed: false,
      reason: 'Failed to fetch analysis data'
    };
  }
  
  // Extract workflow steps for this phase from JSONB
  const workflowSteps = analysisData.full_analysis?.workflowSteps || [];
  const phaseStep = workflowSteps.find((s: any) => s.id === phase);
  const steps = phaseStep?.agents || [];
  
  // Count agent statuses
  const status: PhaseHealthStatus = {
    phase,
    totalAgents: phaseConfig.agents.length,
    completedAgents: 0,
    successfulAgents: 0,
    failedAgents: 0,
    runningAgents: 0,
    pendingAgents: 0,
    criticalFailures: [],
    canProceed: true
  };
  
  // Map agent function names to display names for comparison
  const agentNameMap: { [key: string]: string } = {
    'agent-macro-analyst': 'Macro Analyst',
    'agent-market-analyst': 'Market Analyst',
    'agent-fundamentals-analyst': 'Fundamentals Analyst',
    'agent-news-analyst': 'News Analyst',
    'agent-social-media-analyst': 'Social Media Analyst',
    'agent-bull-researcher': 'Bull Researcher',
    'agent-bear-researcher': 'Bear Researcher',
    'agent-research-manager': 'Research Manager',
    'agent-trader': 'Trader',
    'agent-risky-analyst': 'Risky Analyst',
    'agent-safe-analyst': 'Safe Analyst',
    'agent-neutral-analyst': 'Neutral Analyst',
    'agent-risk-manager': 'Risk Manager',
    'analysis-portfolio-manager': 'Analysis Portfolio Manager'
  };

  // Process each expected agent
  for (const agentFunc of phaseConfig.agents) {
    const agentName = agentNameMap[agentFunc] || agentFunc;
    const step = steps?.find((s: any) => s.name === agentName ||
      (agentName === 'Analysis Portfolio Manager' && s.name === 'Portfolio Manager'));
    
    if (!step) {
      status.pendingAgents++;
      continue;
    }
    
    switch (step.status) {
      case 'completed':
        status.completedAgents++;
        status.successfulAgents++;
        break;
      case 'error':
        status.completedAgents++;
        status.failedAgents++;
        
        // Check if this is a critical failure
        const errorCategory = categorizeAgentError(agentFunc, step.error_type);
        if (errorCategory.isCritical) {
          status.criticalFailures.push(agentFunc);
        }
        break;
      case 'running':
        status.runningAgents++;
        break;
      case 'pending':
        status.pendingAgents++;
        break;
    }
  }
  
  // Apply phase-specific rules
  status.canProceed = evaluatePhaseReadiness(phase, status, steps);
  
  return status;
}

/**
 * Evaluate if a phase is ready to transition based on completion status
 */
function evaluatePhaseReadiness(
  phase: string,
  status: PhaseHealthStatus,
  steps: any[]
): boolean {
  // Still have running agents - not ready
  if (status.runningAgents > 0) {
    status.reason = 'Agents still running';
    return false;
  }
  
  // Check for critical failures
  if (status.criticalFailures.length > 0) {
    status.reason = `Critical agents failed: ${status.criticalFailures.join(', ')}`;
    
    // Special handling for specific phases
    if (phase === 'risk' && status.criticalFailures.includes('agent-risk-manager')) {
      return false; // Risk Manager is absolutely critical
    }
    
    if (phase === 'trading' && status.criticalFailures.includes('agent-trader')) {
      return false; // Trader is critical for trading phase
    }
  }
  
  // Phase-specific rules
  switch (phase) {
    case 'analysis': {
      // Analysis phase: require at least 3 successful agents (or all of them if fewer than 3 exist)
      const requiredSuccesses = Math.min(3, status.totalAgents);

      if (status.pendingAgents > 0) {
        status.reason = 'Pending agents remaining in analysis phase';
        return false;
      }

      if (status.successfulAgents < requiredSuccesses) {
        status.reason = `Insufficient successful agents: ${status.successfulAgents}/${status.totalAgents} (need ${requiredSuccesses})`;
        return false;
      }

      return true;
    }
      
    case 'research':
      // Research phase: Check if we have completed debate rounds
      // IMPORTANT: In multi-round debates, Bull/Bear may fail in later rounds
      // but this is acceptable if we have at least one complete round
      
      // The Research Manager is the final arbiter of the research phase
      // If it's running or completed, trust that the debate validation already happened
      const researchManagerStatus = steps?.find((s: any) => 
        s.name === 'Research Manager'
      );
      
      if (researchManagerStatus) {
        if (researchManagerStatus.status === 'completed' || 
            researchManagerStatus.status === 'running') {
          // Research Manager is running or completed - phase can proceed
          // The coordinator already validated debate rounds before invoking RM
          console.log('✅ Research Manager active/completed - phase can proceed');
          return true;
        }
        if (researchManagerStatus.status === 'error') {
          // Research Manager itself failed - this is more serious but not critical
          status.reason = 'Research Manager failed but debate content exists';
          return true; // Still proceed since we have debate content
        }
      }
      
      // For mid-phase checks (before Research Manager starts)
      // Don't count failed agents against us if we're still in debate rounds
      // The debate handler will decide when to move to Research Manager
      if (status.runningAgents > 0) {
        // Agents still running - let them finish
        return false;
      }
      
      // If all agents are done but Research Manager hasn't started,
      // this might be the moment to check if we should start it
      // But don't fail the phase - let the debate handler decide
      return true;
      
    case 'trading':
      // Trading phase: Must complete successfully
      if (status.failedAgents > 0) {
        status.reason = 'Trading phase has failures';
        return false;
      }
      return true;
      
    case 'risk':
      // Risk phase: Can proceed if Risk Manager hasn't failed
      // Individual risk analysts can fail
      const riskManagerFailed = status.criticalFailures.includes('agent-risk-manager');
      if (riskManagerFailed) {
        status.reason = 'Risk Manager failed';
        return false;
      }
      
      // Need at least 1 risk analyst to succeed for Risk Manager to have input
      const riskAnalysts = ['agent-risky-analyst', 'agent-safe-analyst', 'agent-neutral-analyst'];
      const successfulRiskAnalysts = riskAnalysts.filter(agent => {
        const agentName = agent.split('-').slice(1).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        const step = status.successfulAgents > 0; // Simplified check
        return step;
      });
      
      if (status.successfulAgents === 0 && phase === 'risk') {
        status.reason = 'No risk analysts succeeded';
        return false;
      }
      return true;
      
    case 'portfolio':
      // Portfolio phase: Must have the portfolio manager complete
      // This phase only has one agent and it's critical
      if (status.pendingAgents > 0) {
        status.reason = 'Analysis Portfolio Manager not started';
        return false;
      }
      if (status.failedAgents > 0) {
        status.reason = 'Analysis Portfolio Manager failed';
        return false;
      }
      if (status.runningAgents > 0) {
        status.reason = 'Analysis Portfolio Manager still running';
        return false;
      }
      // Only proceed if portfolio manager completed successfully
      if (status.successfulAgents === 0) {
        status.reason = 'Analysis Portfolio Manager not completed';
        return false;
      }
      return true;
      
    default:
      // Unknown phase - be conservative
      if (status.failedAgents > status.successfulAgents) {
        status.reason = 'More failures than successes';
        return false;
      }
      return true;
  }
}

/**
 * Determine if the workflow should continue after an agent error
 */
export async function shouldContinueAfterError(
  supabase: any,
  analysisId: string,
  phase: string,
  agent: string,
  errorType?: string,
  isLastInPhase?: boolean
): Promise<{ shouldContinue: boolean; reason: string }> {
  const errorCategory = categorizeAgentError(agent, errorType);
  
  // Workflow-stopping errors
  if (errorCategory.shouldStopWorkflow) {
    return {
      shouldContinue: false,
      reason: `Critical agent ${agent} failed - workflow cannot continue`
    };
  }
  
  // Phase-stopping errors
  if (errorCategory.shouldStopPhase && isLastInPhase) {
    return {
      shouldContinue: false,
      reason: `Agent ${agent} failed - phase cannot complete`
    };
  }
  
  // Check overall phase health
  const phaseHealth = await checkPhaseHealth(supabase, analysisId, phase);
  
  // If this was the last agent and phase can't proceed, stop
  if (isLastInPhase && !phaseHealth.canProceed) {
    return {
      shouldContinue: false,
      reason: phaseHealth.reason || 'Phase cannot proceed due to failures'
    };
  }
  
  // Otherwise, continue with the workflow
  return {
    shouldContinue: true,
    reason: 'Error is non-critical or recoverable'
  };
}

/**
 * Determine if a phase should abort immediately after an agent error
 * Used by the coordinator to avoid continuing work when recovery is impossible
 */
export function evaluatePostErrorPhaseHealth(
  phase: string,
  failingAgent: string,
  status: PhaseHealthStatus
): { abort: boolean; reason?: string } {
  if (status.canProceed) {
    return { abort: false };
  }

  if (status.reason === 'Agents still running') {
    return { abort: false };
  }

  if (status.criticalFailures.length > 0) {
    return {
      abort: true,
      reason: status.reason || `Critical agents failed: ${status.criticalFailures.join(', ')}`
    };
  }

  switch (phase) {
    case 'analysis': {
      const requiredSuccesses = Math.ceil(status.totalAgents * 0.5);
      const maxPossibleSuccesses =
        status.successfulAgents +
        status.pendingAgents +
        status.runningAgents;

      if (maxPossibleSuccesses < requiredSuccesses) {
        return {
          abort: true,
          reason:
            status.reason ||
            `Insufficient agents remaining to reach ${requiredSuccesses}/${status.totalAgents} success threshold`
        };
      }
      return { abort: false };
    }
    case 'trading': {
      if (status.failedAgents > 0) {
        return {
          abort: true,
          reason: status.reason || `Trading agent ${failingAgent} failed`
        };
      }
      return { abort: false };
    }
    case 'risk': {
      const remainingAnalysts = status.pendingAgents + status.runningAgents;
      if (status.successfulAgents === 0 && remainingAnalysts === 0) {
        return {
          abort: true,
          reason: status.reason || 'All risk analysts failed to produce input for Risk Manager'
        };
      }
      return { abort: false };
    }
    case 'portfolio': {
      if (status.failedAgents > 0) {
        return {
          abort: true,
          reason: status.reason || 'Analysis Portfolio Manager failed'
        };
      }
      return { abort: false };
    }
    default:
      return { abort: false };
  }
}
