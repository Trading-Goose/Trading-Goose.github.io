/**
 * Status-related utility functions for workflow visualization
 */

import {
  CheckCircle,
  Loader2,
  AlertCircle,
  Clock
} from 'lucide-react';
import type { WorkflowStep } from '../types';

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-500 bg-green-500/10';
    case 'running':
      return 'text-yellow-500 bg-yellow-500/10';
    case 'error':
      return 'text-red-500 bg-red-500/10';
    case 'pending':
      return 'text-gray-500 bg-gray-500/10';
    default:
      return 'text-gray-500';
  }
};

export const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return CheckCircle;
    case 'running':
      return Loader2;
    case 'error':
      return AlertCircle;
    case 'pending':
      return Clock;
    default:
      return null;
  }
};

export const getStatusIconClassName = (status: string) => {
  switch (status) {
    case 'completed':
      return 'w-3 h-3 text-green-500';
    case 'running':
      return 'w-3 h-3 animate-spin text-yellow-500';
    case 'error':
      return 'w-3 h-3 text-red-500';
    case 'pending':
      return 'w-3 h-3 text-gray-500';
    default:
      return 'w-3 h-3 text-gray-500';
  }
};

export const getStepProgress = (step: WorkflowStep): number => {
  if (step.status === 'completed') return 100;

  // Always calculate actual progress, even for pending/running status
  const totalAgents = step.agents.length;
  if (totalAgents === 0) return 0;

  const completedAgents = step.agents.filter(a => a.status === 'completed').length;
  const activeAgent = step.agents.find(a => a.status === 'running');

  const baseProgress = (completedAgents / totalAgents) * 100;
  const activeProgress = activeAgent ? (activeAgent.progress || 0) / totalAgents : 0;

  return Math.round(baseProgress + activeProgress);
};

export const getStageStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-500';
    case 'running':
      return 'text-yellow-500';
    case 'error':
      return 'text-red-500';
    case 'pending':
      return 'text-gray-500';
    default:
      return 'text-gray-500';
  }
};