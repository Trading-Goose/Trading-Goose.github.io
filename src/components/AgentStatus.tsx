import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Brain, TrendingUp, Shield, MessageSquare, Search, BarChart3, Hash, Users, Gavel } from "lucide-react";

interface AgentGroup {
  stage: string;
  status: 'waiting' | 'active' | 'completed';
  agents: Agent[];
  description?: string;
}

interface Agent {
  id: string;
  name: string;
  icon: any;
  status: 'active' | 'idle' | 'processing';
  lastAction: string;
  progress?: number;
}

const agentGroups: AgentGroup[] = [
  {
    stage: 'Stage 1: Analysis Phase',
    status: 'completed',
    description: 'Sequential processing',
    agents: [
      {
        id: '1',
        name: 'Market Analyst',
        icon: TrendingUp,
        status: 'idle',
        lastAction: 'Technical patterns analyzed',
        progress: 100
      },
      {
        id: '2',
        name: 'Social Media Analyst',
        icon: Hash,
        status: 'idle',
        lastAction: 'Sentiment: 78% bullish',
        progress: 100
      },
      {
        id: '3',
        name: 'News Analyst',
        icon: Search,
        status: 'idle',
        lastAction: 'No risk events detected',
        progress: 100
      },
      {
        id: '4',
        name: 'Fundamentals Analyst',
        icon: BarChart3,
        status: 'idle',
        lastAction: 'P/E below sector average',
        progress: 100
      }
    ]
  },
  {
    stage: 'Stage 2: Research Debate',
    status: 'active',
    description: 'Round 1 of 2',
    agents: [
      {
        id: '5',
        name: 'Bull Researcher',
        icon: MessageSquare,
        status: 'processing',
        lastAction: 'Building bullish thesis...',
        progress: 75
      },
      {
        id: '6',
        name: 'Bear Researcher',
        icon: MessageSquare,
        status: 'processing',
        lastAction: 'Identifying risk factors...',
        progress: 60
      },
      {
        id: '7',
        name: 'Research Manager',
        icon: Users,
        status: 'idle',
        lastAction: 'Awaiting debate completion',
        progress: 0
      }
    ]
  },
  {
    stage: 'Stage 3: Trading Decision',
    status: 'waiting',
    agents: [
      {
        id: '8',
        name: 'Trader',
        icon: Activity,
        status: 'idle',
        lastAction: 'Ready to analyze',
        progress: 0
      }
    ]
  },
  {
    stage: 'Stage 4: Risk Assessment',
    status: 'waiting',
    description: 'Max 3 rounds',
    agents: [
      {
        id: '9',
        name: 'Risky Analyst',
        icon: TrendingUp,
        status: 'idle',
        lastAction: 'Standing by',
        progress: 0
      },
      {
        id: '10',
        name: 'Safe Analyst',
        icon: Shield,
        status: 'idle',
        lastAction: 'Standing by',
        progress: 0
      },
      {
        id: '11',
        name: 'Neutral Analyst',
        icon: Brain,
        status: 'idle',
        lastAction: 'Standing by',
        progress: 0
      },
      {
        id: '12',
        name: 'Risk Judge',
        icon: Gavel,
        status: 'idle',
        lastAction: 'Awaiting risk analysis',
        progress: 0
      }
    ]
  }
];

const getStageStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-green-500';
    case 'active':
      return 'text-blue-500';
    case 'waiting':
      return 'text-gray-500';
    default:
      return 'text-gray-500';
  }
};

export default function AgentStatus() {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Agent Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {agentGroups.map((group) => (
          <div key={group.stage} className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`text-sm font-semibold ${getStageStatusColor(group.status)}`}>
                  {group.stage}
                </h4>
                {group.description && (
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                )}
              </div>
              <Badge variant={group.status === 'active' ? 'default' : 'outline'} className="text-xs">
                {group.status}
              </Badge>
            </div>
            
            <div className="space-y-2 ml-2">
              {group.agents.map((agent) => {
                const Icon = agent.icon;
                return (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-foreground">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{agent.lastAction}</p>
                      </div>
                    </div>
                    
                    {agent.progress !== undefined && agent.progress > 0 && (
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${
                            agent.status === 'processing' ? 'bg-blue-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${agent.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            Full cycle: ~5-10 minutes • LangGraph orchestrated
          </p>
        </div>
      </CardContent>
    </Card>
  );
}