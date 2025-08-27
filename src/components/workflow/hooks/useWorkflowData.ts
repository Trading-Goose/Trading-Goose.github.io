/**
 * Hook for managing workflow data and updates
 */

import { useState, useCallback } from 'react';
import { getInitialWorkflowSteps } from '../constants';
import { getAgentStatus, convertAgentStatus } from '../utils/agentHelpers';
import {
  ANALYSIS_STATUS,
  convertLegacyAnalysisStatus
} from '@/lib/statusTypes';
import type { WorkflowStep, StepAgentMapping } from '../types';

export function useWorkflowData(setIsRebalanceContext: (value: boolean) => void) {
  const [workflowData, setWorkflowData] = useState<WorkflowStep[]>(() => getInitialWorkflowSteps());

  const updateWorkflowFromAnalysis = useCallback((analysis: any): boolean => {
    if (!analysis) return false;

    // Check if this is a rebalance analysis
    const isRebalanceAnalysis = !!analysis.rebalance_request_id;

    console.log('Analysis type check:', {
      ticker: analysis.ticker,
      rebalance_request_id: analysis.rebalance_request_id,
      isRebalanceAnalysis,
      analysis_status: analysis.analysis_status
    });

    // Update the rebalance context state
    setIsRebalanceContext(isRebalanceAnalysis);

    // Convert legacy numeric status if needed for proper checking
    const currentStatus = typeof analysis.analysis_status === 'number'
      ? convertLegacyAnalysisStatus(analysis.analysis_status)
      : analysis.analysis_status;

    // Check if analysis is cancelled - if so, don't display it
    if (currentStatus === ANALYSIS_STATUS.CANCELLED || analysis.is_canceled) {
      console.log('Analysis is cancelled, not displaying workflow');
      return false; // Don't show cancelled analyses
    }

    // Determine completion using simple analysis status
    const isCompleted = currentStatus === ANALYSIS_STATUS.COMPLETED || currentStatus === ANALYSIS_STATUS.ERROR;
    const isRunning = currentStatus === ANALYSIS_STATUS.RUNNING || currentStatus === ANALYSIS_STATUS.PENDING;

    // Build workflow steps using unified agent status checking
    let baseSteps = getInitialWorkflowSteps();

    // Filter out portfolio management step for rebalance analyses
    if (isRebalanceAnalysis) {
      baseSteps = baseSteps.filter(step =>
        step.id !== 'portfolio-management' &&
        step.id !== 'portfolio' &&
        !step.name.toLowerCase().includes('portfolio')
      );
    }

    // Update each step using unified agent status checking
    const updatedSteps = baseSteps.map((step) => {
      // Map step agents to their respective agent keys for status checking
      const agentStatusMapping: StepAgentMapping = {
        'analysis': [
          { agent: step.agents[0], key: 'macroAnalyst' },
          { agent: step.agents[1], key: 'marketAnalyst' },
          { agent: step.agents[2], key: 'socialMediaAnalyst' },
          { agent: step.agents[3], key: 'newsAnalyst' },
          { agent: step.agents[4], key: 'fundamentalsAnalyst' }
        ],
        'research-debate': [
          { agent: step.agents[0], key: 'bullResearcher' },
          { agent: step.agents[1], key: 'bearResearcher' },
          { agent: step.agents[2], key: 'researchManager' }
        ],
        'trading-decision': [
          { agent: step.agents[0], key: 'trader' }
        ],
        'risk-assessment': [
          { agent: step.agents[0], key: 'riskyAnalyst' },
          { agent: step.agents[1], key: 'safeAnalyst' },
          { agent: step.agents[2], key: 'neutralAnalyst' },
          { agent: step.agents[3], key: 'riskManager' }
        ],
        'portfolio-management': [
          { agent: step.agents[0], key: 'portfolioManager' }
        ]
      };

      const stepMappings = agentStatusMapping[step.id as keyof typeof agentStatusMapping] || [];

      // Update each agent using unified status checking
      const updatedAgents = stepMappings.map(({ agent, key }) => {
        const status = getAgentStatus(key, step.id, analysis);
        const agentStatus = convertAgentStatus(status);

        // Debug for research agents
        if (step.id === 'research-debate') {
          console.log(`Agent status for ${agent.name} (key: ${key}):`, status, '→', agentStatus);
        }

        return {
          ...agent,
          status: agentStatus,
          lastAction: status === 'completed' ? 'Analysis complete' :
            status === 'running' ? 'Analyzing...' :
              status === 'failed' ? 'Failed' :
                'Waiting...',
          progress: status === 'completed' ? 100 : status === 'failed' ? 0 : (status === 'running' ? 50 : 0)
        };
      });

      // Calculate step status based on agent statuses
      const completedAgents = updatedAgents.filter(a => a.status === 'completed').length;
      const runningAgents = updatedAgents.filter(a => a.status === 'running').length;
      const totalAgents = updatedAgents.length;

      // Debug logging for research-debate step
      if (step.id === 'research-debate') {
        console.log('Research Debate step status calculation:', {
          stepId: step.id,
          agents: updatedAgents.map(a => ({ name: a.name, status: a.status })),
          completedAgents,
          runningAgents,
          totalAgents
        });
      }

      // Improved step status logic:
      // - If all agents are complete, step is complete
      // - If any agents are running, step is running
      // - If some agents are complete but not all (and none running), step is still running (in progress between agents)
      // - Only if no agents have started is the step pending
      const stepStatus: WorkflowStep['status'] = completedAgents === totalAgents ? 'completed' :
        runningAgents > 0 ? 'running' :
          completedAgents > 0 ? 'running' : 'pending';

      return {
        ...step,
        status: stepStatus,
        currentActivity: stepStatus === 'completed' ? 'Completed' :
          stepStatus === 'running' ? 'Processing...' : 'Pending',
        agents: updatedAgents
      };
    });

    setWorkflowData(updatedSteps);
    return isRunning;
  }, [setIsRebalanceContext]);

  return {
    workflowData,
    updateWorkflowFromAnalysis
  };
}