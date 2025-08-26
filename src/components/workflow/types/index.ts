/**
 * Type definitions for the Workflow component system
 */

export interface Agent {
  id: string;
  name: string;
  icon: any;
  status: 'pending' | 'running' | 'completed' | 'error';
  lastAction: string;
  progress?: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  icon: any;
  status: 'pending' | 'running' | 'completed' | 'error';
  agents: Agent[];
  currentActivity?: string;
  details?: string;
  insights?: string[];
  description?: string;
}

export interface AgentStatusMapping {
  agent: Agent;
  key: string;
}

export type StepAgentMapping = {
  [key: string]: AgentStatusMapping[];
};