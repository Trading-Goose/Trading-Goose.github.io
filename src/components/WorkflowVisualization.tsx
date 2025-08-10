import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  BarChart3,
  Hash,
  Search,
  MessageSquare,
  Users,
  TrendingUp,
  Shield,
  Brain,
  Gavel,
  Activity,
  CheckCircle,
  Clock,
  AlertCircle
} from "lucide-react";

interface Agent {
  name: string;
  status: 'completed' | 'active' | 'pending';
  progress?: number;
  message?: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  status: 'completed' | 'active' | 'pending';
  agents: Agent[];
}

interface WorkflowVisualizationProps {
  workflowSteps?: WorkflowStep[];
  fullAnalysis?: any;
}

const getAgentIcon = (agentName: string) => {
  const name = agentName.toLowerCase();
  if (name.includes('market')) return BarChart3;
  if (name.includes('social')) return Hash;
  if (name.includes('news')) return Search;
  if (name.includes('fundamental')) return BarChart3;
  if (name.includes('bull') || name.includes('bear')) return MessageSquare;
  if (name.includes('manager')) return Users;
  if (name.includes('trader')) return TrendingUp;
  if (name.includes('risky')) return TrendingUp;
  if (name.includes('safe')) return Shield;
  if (name.includes('neutral')) return Brain;
  if (name.includes('judge')) return Gavel;
  return Activity;
};

const getStepIcon = (stepId: string) => {
  switch (stepId) {
    case 'analysis':
      return Brain;
    case 'research':
    case 'research-debate':
      return MessageSquare;
    case 'decision':
    case 'trading-decision':
      return TrendingUp;
    case 'risk':
    case 'risk-assessment':
      return Shield;
    default:
      return Activity;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-3 h-3 text-green-500" />;
    case 'active':
      return <Clock className="w-3 h-3 text-blue-500" />;
    case 'pending':
      return <AlertCircle className="w-3 h-3 text-gray-400" />;
    default:
      return null;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-500 bg-green-500/10';
    case 'active':
      return 'text-blue-500 bg-blue-500/10';
    case 'pending':
      return 'text-gray-500 bg-gray-500/10';
    default:
      return 'text-gray-500';
  }
};

// Extract workflow steps from full analysis data
const extractWorkflowSteps = (fullAnalysis: any): WorkflowStep[] => {
  if (!fullAnalysis) return [];

  // If we already have workflowSteps, use them
  if (fullAnalysis.workflowSteps && Array.isArray(fullAnalysis.workflowSteps)) {
    return fullAnalysis.workflowSteps;
  }

  // Otherwise, build from agent data
  const steps: WorkflowStep[] = [
    {
      id: 'analysis',
      name: 'Analysis Phase',
      status: 'pending',
      agents: [
        { name: 'Market Analyst', status: 'pending' },
        { name: 'Social Media Analyst', status: 'pending' },
        { name: 'News Analyst', status: 'pending' },
        { name: 'Fundamentals Analyst', status: 'pending' }
      ]
    },
    {
      id: 'research-debate',
      name: 'Research Debate',
      status: 'pending',
      agents: [
        { name: 'Bull Researcher', status: 'pending' },
        { name: 'Bear Researcher', status: 'pending' },
        { name: 'Research Manager', status: 'pending' }
      ]
    },
    {
      id: 'trading-decision',
      name: 'Trading Decision',
      status: 'pending',
      agents: [
        { name: 'Trader', status: 'pending' }
      ]
    },
    {
      id: 'risk-assessment',
      name: 'Risk Assessment',
      status: 'pending',
      agents: [
        { name: 'Risky Analyst', status: 'pending' },
        { name: 'Safe Analyst', status: 'pending' },
        { name: 'Neutral Analyst', status: 'pending' },
        { name: 'Risk Judge', status: 'pending' }
      ]
    }
  ];

  // Update status based on messages
  if (fullAnalysis.messages && Array.isArray(fullAnalysis.messages)) {
    const completedAgents = new Set<string>();
    fullAnalysis.messages.forEach((msg: any) => {
      if (msg.agent && msg.type === 'analysis') {
        completedAgents.add(msg.agent);
      }
    });

    // Update agent statuses
    steps.forEach(step => {
      let hasCompleted = false;
      let hasActive = false;
      
      step.agents.forEach(agent => {
        if (completedAgents.has(agent.name)) {
          agent.status = 'completed';
          hasCompleted = true;
        }
      });

      // Update step status
      if (hasCompleted) {
        const allCompleted = step.agents.every(a => a.status === 'completed');
        step.status = allCompleted ? 'completed' : 'active';
      }
    });

    // Make sure steps are in correct status order
    let foundIncomplete = false;
    steps.forEach(step => {
      if (foundIncomplete && step.status !== 'pending') {
        step.status = 'pending';
        step.agents.forEach(a => a.status = 'pending');
      } else if (step.status !== 'completed') {
        foundIncomplete = true;
      }
    });
  }

  return steps;
};

export default function WorkflowVisualization({ workflowSteps, fullAnalysis }: WorkflowVisualizationProps) {
  const steps = workflowSteps || extractWorkflowSteps(fullAnalysis);

  return (
    <div className="space-y-4">
      {/* Horizontal workflow steps */}
      <div className="flex items-center justify-between overflow-x-auto pb-2">
        {steps.map((step, index) => {
          const StepIcon = getStepIcon(step.id);
          return (
            <div key={step.id} className="flex items-center">
              <div className="flex flex-col items-center gap-1 min-w-[100px]">
                <div className={`p-2 rounded-full ${getStatusColor(step.status)}`}>
                  <StepIcon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-center">{step.name}</span>
                <div className="flex items-center gap-1">
                  {getStatusIcon(step.status)}
                  <span className="text-xs text-muted-foreground capitalize">{step.status}</span>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 ${
                  steps[index + 1].status !== 'pending' 
                    ? 'bg-primary' 
                    : 'bg-muted-foreground/20'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Agent details */}
      <div className="space-y-3">
        {steps.map((step) => (
          <Card key={step.id} className="p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">{step.name}</h4>
                <Badge variant={step.status === 'completed' ? 'default' : step.status === 'active' ? 'secondary' : 'outline'}>
                  {step.status}
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {step.agents.map((agent) => {
                  const AgentIcon = getAgentIcon(agent.name);
                  return (
                    <div
                      key={agent.name}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/30"
                    >
                      <AgentIcon className="w-3 h-3 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{agent.name}</p>
                        {agent.message && (
                          <p className="text-xs text-muted-foreground truncate">{agent.message}</p>
                        )}
                      </div>
                      {getStatusIcon(agent.status)}
                    </div>
                  );
                })}
              </div>
              
              {step.status === 'active' && (
                <Progress value={50} className="h-1" />
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}