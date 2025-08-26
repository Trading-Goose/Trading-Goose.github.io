/**
 * Agent-related utility functions
 */

import {
  BarChart3,
  TrendingUp,
  Hash,
  Search,
  Brain,
  MessageSquare,
  Users,
  Shield
} from 'lucide-react';
import { ANALYSIS_STATUS } from '@/lib/statusTypes';
import type { Agent } from '../types';

export const getAgentIcon = (agentName: string): any => {
  if (agentName.includes('Macro')) return BarChart3;
  if (agentName.includes('Market') && !agentName.includes('Macro')) return TrendingUp;
  if (agentName.includes('Social')) return Hash;
  if (agentName.includes('News')) return Search;
  if (agentName.includes('Fundamental')) return Brain;
  if (agentName.includes('Bull') || agentName.includes('Bear')) return MessageSquare;
  if (agentName.includes('Manager')) return Users;
  if (agentName.includes('Trader')) return TrendingUp;
  if (agentName.includes('Risk')) return Shield;
  return Brain;
};

export const getAgentStatus = (agentKey: string, stepId: string, analysis: any) => {
  // Check if analysis is cancelled
  const isAnalysisCancelled = analysis.analysis_status === ANALYSIS_STATUS.CANCELLED ||
    analysis.is_canceled;

  const insights = analysis.agent_insights || {};

  // Debug logging for research agents
  if (agentKey.toLowerCase().includes('bull') || agentKey.toLowerCase().includes('bear') || agentKey.toLowerCase().includes('research')) {
    console.log(`Agent status check for ${agentKey}:`, {
      hasInsight: !!insights[agentKey],
      hasError: !!insights[agentKey + '_error'],
      insightKeys: Object.keys(insights).filter(k => k.toLowerCase().includes(agentKey.toLowerCase().substring(0, 4)))
    });
  }

  // HYBRID APPROACH: Check agent_insights for completion (most reliable), workflow steps for running status

  // First check agent_insights for completion and errors (most reliable)
  if (insights) {
    // Check for error conditions first
    if (insights[agentKey + '_error']) {
      return 'failed';
    }
    // Then check for normal completion
    if (insights[agentKey]) {
      return 'completed';
    }
  }

  // Then check workflow steps for running status (when agents are actively working)
  if (analysis.full_analysis?.workflowSteps) {
    for (const step of analysis.full_analysis.workflowSteps) {
      // Find the agent in workflow steps by matching names
      const agent = step.agents?.find((a: any) => {
        const agentNameLower = a.name.toLowerCase().replace(/\s+/g, '');
        const keyLower = agentKey.toLowerCase();

        // Debug logging for matching
        if (step.id === 'research' || step.id === 'research-debate') {
          console.log(`Matching agent in workflow: agent="${a.name}", agentNameLower="${agentNameLower}", keyLower="${keyLower}"`);
        }

        // Direct name matching patterns
        if (agentNameLower.includes('macro') && keyLower.includes('macro')) return true;
        if (agentNameLower.includes('market') && keyLower.includes('market') && !keyLower.includes('macro')) return true;
        if (agentNameLower.includes('news') && keyLower.includes('news')) return true;
        if (agentNameLower.includes('social') && keyLower.includes('social')) return true;
        if (agentNameLower.includes('fundamentals') && keyLower.includes('fundamentals')) return true;
        // Research debate agents - handle both with and without spaces
        if (agentNameLower.includes('bullresearcher') && keyLower.includes('bull')) return true;
        if (agentNameLower.includes('bearresearcher') && keyLower.includes('bear')) return true;
        if (agentNameLower.includes('researchmanager') && keyLower.includes('researchmanager')) return true;
        if (agentNameLower.includes('trader') && keyLower.includes('trader')) return true;
        if (agentNameLower.includes('risky') && keyLower.includes('risky')) return true;
        if (agentNameLower.includes('safe') && keyLower.includes('safe')) return true;
        if (agentNameLower.includes('neutral') && keyLower.includes('neutral')) return true;
        if (agentNameLower.includes('riskmanager') && keyLower.includes('riskmanager')) return true;
        if (agentNameLower.includes('portfoliomanager') && keyLower.includes('portfolio')) return true;

        return false;
      });

      if (agent) {
        // If cancelled, convert 'running' or 'processing' to 'pending', but keep 'completed'
        if (isAnalysisCancelled && (agent.status === 'running' || agent.status === 'processing')) {
          return 'pending';
        }
        // Only return workflow status if it's an active state (running/processing/error)
        if (agent.status === 'running' || agent.status === 'processing') return 'running';
        if (agent.status === 'error' || agent.status === 'failed') return 'failed';
      }
    }
  }

  return 'pending';
};

export const getAgentMessage = (insights: any, possibleNames: string[], defaultMessage: string): string => {
  for (const name of possibleNames) {
    if (insights[name]) {
      const message = insights[name];
      return typeof message === 'string' ? message.substring(0, 50) + '...' : defaultMessage;
    }
  }
  return defaultMessage;
};

export const convertAgentStatus = (status: string): Agent['status'] => {
  return status === 'completed' ? 'completed' :
    status === 'running' ? 'running' :
      status === 'failed' ? 'error' : 'pending';
};