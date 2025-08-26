/**
 * Step detail dialog component
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import React from 'react';
import type { WorkflowStep } from '../types';
import { getStatusColor, getStatusIcon, getStatusIconClassName } from '../utils/statusHelpers';

interface StepDetailDialogProps {
  selectedStep: WorkflowStep | null;
  onClose: () => void;
}

export function StepDetailDialog({ selectedStep, onClose }: StepDetailDialogProps) {
  return (
    <Dialog open={!!selectedStep} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedStep && (
              <>
                <selectedStep.icon className="w-5 h-5" />
                {selectedStep.name}
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {selectedStep?.details}
          </DialogDescription>
        </DialogHeader>

        {selectedStep && (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold mb-2">Active Agents</h4>
              <div className="space-y-2">
                {selectedStep.agents.map((agent) => {
                  const AgentIcon = agent.icon;
                  return (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                    >
                      <div className="flex items-center gap-3">
                        <AgentIcon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.lastAction}</p>
                        </div>
                      </div>
                      {agent.progress !== undefined && (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                agent.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                                  agent.status === 'error' ? 'bg-red-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${agent.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{agent.progress}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Current Activity</h4>
              <div className="flex items-center gap-2">
                <div className={`p-1 rounded-full ${getStatusColor(selectedStep.status)}`}>
                  {(() => {
                    const StatusIcon = getStatusIcon(selectedStep.status);
                    return StatusIcon ? <StatusIcon className={getStatusIconClassName(selectedStep.status)} /> : null;
                  })()}
                </div>
                <span className="text-sm text-muted-foreground">
                  {selectedStep.currentActivity}
                </span>
              </div>
            </div>

            {selectedStep.insights && selectedStep.insights.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Key Insights</h4>
                <div className="space-y-2">
                  {selectedStep.insights.map((insight, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5" />
                      <span className="text-sm">{insight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Status: {selectedStep.status}</span>
                <span>Last updated: 2 minutes ago</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}