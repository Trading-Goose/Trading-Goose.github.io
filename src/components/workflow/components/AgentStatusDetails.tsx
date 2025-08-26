/**
 * Expandable agent status details component
 */

import { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, CheckCircle, Loader2, AlertCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { WorkflowStep } from '../types';
import { getStageStatusColor } from '../utils/statusHelpers';

interface AgentStatusDetailsProps {
  workflowData: WorkflowStep[];
  isRebalanceContext: boolean;
  isAnalyzing: boolean;
  activeAnalysisTicker: string | null;
}

export function AgentStatusDetails({
  workflowData,
  isRebalanceContext,
  isAnalyzing,
  activeAnalysisTicker
}: AgentStatusDetailsProps) {
  const [expandedAgents, setExpandedAgents] = useState(false);

  const filteredSteps = isRebalanceContext
    ? workflowData.filter(step =>
      step.id !== 'portfolio-management' &&
      step.id !== 'portfolio' &&
      !step.name.toLowerCase().includes('portfolio'))
    : workflowData;

  return (
    <div className="border-t pt-4">
      <button
        onClick={() => setExpandedAgents(!expandedAgents)}
        className="flex items-center justify-between w-full text-sm font-medium hover:text-primary transition-colors"
      >
        <span className="flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Agent Status Details
        </span>
        {expandedAgents ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expandedAgents && (
        <div className="mt-4 space-y-4">
          {filteredSteps.map((step) => (
            <div key={step.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className={`text-sm font-semibold ${getStageStatusColor(step.status)}`}>
                    {step.name}
                  </h4>
                  {step.description && (
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  )}
                </div>
                <Badge
                  variant={
                    step.status === 'completed' ? 'default' :
                      step.status === 'running' ? 'secondary' :
                        step.status === 'error' ? 'destructive' :
                          'outline'
                  }
                  className={`text-xs ${
                    step.status === 'completed' ? 'bg-green-500/10 text-green-600 border-green-500/50' :
                      step.status === 'running' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/50' :
                        ''
                  }`}
                >
                  {step.status}
                </Badge>
              </div>

              <div className="space-y-2 ml-2">
                {step.agents.map((agent) => {
                  const AgentIcon = agent.icon;
                  return (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50"
                    >
                      <div className="flex items-center gap-2">
                        <AgentIcon className="h-3 w-3 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-foreground">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.lastAction}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {agent.status === 'running' ? (
                          <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
                        ) : agent.status === 'error' ? (
                          <AlertCircle className="h-3 w-3 text-red-500" />
                        ) : agent.status === 'completed' ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : (
                          <Clock className="h-3 w-3 text-gray-500" />
                        )}
                        {agent.progress !== undefined && agent.progress > 0 && (
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                agent.status === 'running' ? 'bg-yellow-500 animate-pulse' :
                                  agent.status === 'error' ? 'bg-red-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${agent.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              {isAnalyzing ? (
                <>Full cycle in progress • ~5-10 minutes</>
              ) : activeAnalysisTicker ? (
                <>Analysis completed for {activeAnalysisTicker}</>
              ) : (
                <>Ready to analyze • LangGraph orchestrated</>
              )}
              {isRebalanceContext && (
                <> • Rebalance mode (Portfolio Manager runs at rebalance level)</>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}