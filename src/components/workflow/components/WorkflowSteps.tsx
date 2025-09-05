/**
 * Horizontal workflow steps visualization component
 */

import React from 'react';
import type { WorkflowStep } from '../types';
import { getStatusColor, getStatusIcon, getStatusIconClassName, getStepProgress } from '../utils/statusHelpers';

interface WorkflowStepsProps {
  workflowData: WorkflowStep[];
  isRebalanceContext: boolean;
  setSelectedStep: (step: WorkflowStep) => void;
}

export const WorkflowSteps = React.memo(function WorkflowSteps({
  workflowData,
  isRebalanceContext,
  setSelectedStep
}: WorkflowStepsProps) {
  const filteredSteps = isRebalanceContext
    ? workflowData.filter(step =>
      step.id !== 'portfolio-management' &&
      step.id !== 'portfolio' &&
      !step.name.toLowerCase().includes('portfolio'))
    : workflowData;

  // Remove console.log to prevent re-render logging

  return (
    <div className="flex items-center justify-center overflow-hidden">
      {filteredSteps.map((step) => {
        const Icon = step.icon;
        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => setSelectedStep(step)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all hover:bg-muted/50 min-w-[80px] max-w-[80px] ${
                step.status === 'running' ? 'bg-muted' : ''
              }`}
            >
              <div className="relative">
                <div className={`p-1.5 rounded-full ${getStatusColor(step.status)}`}>
                  <Icon className="w-3 h-3" />
                </div>
              </div>
              <span className="text-xs font-medium text-center leading-tight mt-1">{step.name}</span>
              <div className="flex items-center gap-0.5">
                {(() => {
                  const StatusIcon = getStatusIcon(step.status);
                  return StatusIcon ? <StatusIcon className={getStatusIconClassName(step.status)} /> : null;
                })()}
                {step.agents && (
                  <span className="text-[10px] text-muted-foreground">
                    {step.agents.filter(a => a.status === 'completed').length}/{step.agents.length}
                  </span>
                )}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
});