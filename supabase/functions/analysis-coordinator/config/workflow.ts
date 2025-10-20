import { WorkflowPhases } from '../types/index.ts';

/**
 * Workflow phases configuration for the stock analysis pipeline
 */
export const WORKFLOW_PHASES: WorkflowPhases = {
  analysis: {
    agents: [
      'agent-macro-analyst',
      'agent-market-analyst',
      'agent-news-analyst',
      'agent-social-media-analyst',
      'agent-fundamentals-analyst'
    ],
    nextPhase: 'research'
  },
  research: {
    agents: [
      'agent-bull-researcher',
      'agent-bear-researcher'
    ],
    nextPhase: 'trading'
  },
  trading: {
    agents: [
      'agent-trader'
    ],
    nextPhase: 'risk'
  },
  risk: {
    agents: [
      'agent-risky-analyst',
      'agent-safe-analyst',
      'agent-neutral-analyst'
    ],
    finalAgent: 'agent-risk-manager'
  },
  portfolio: {
    agents: [
      'analysis-portfolio-manager'
    ],
    finalAgent: null
  }
};