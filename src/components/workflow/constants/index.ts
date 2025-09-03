/**
 * Constants and initial configuration for the Workflow system
 */

import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  Users,
  Shield,
  ShieldCheck,
  Briefcase,
  ChartBar,
  History,
  FileText,
  Share2,
  Grid2x2Check,
  ChartCandlestick,
  OctagonAlert,
  CircleSlash
} from 'lucide-react';
import type { WorkflowStep } from '../types';

export const getInitialWorkflowSteps = (): WorkflowStep[] => [
  {
    id: 'analysis',
    name: 'Analysis Phase',
    icon: ChartBar,
    status: 'pending',
    currentActivity: 'Waiting to start',
    details: 'Five specialized analysts process data sequentially based on configuration. Each analyst has dedicated tools and clears messages before the next begins.',
    description: 'Sequential processing',
    agents: [
      {
        id: '1',
        name: 'Macro Analyst',
        icon: BarChart3,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '2',
        name: 'Market Analyst',
        icon: History,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '3',
        name: 'Social Media Analyst',
        icon: Share2,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '4',
        name: 'News Analyst',
        icon: FileText,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '5',
        name: 'Fundamentals Analyst',
        icon: Grid2x2Check,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  },
  {
    id: 'research-debate',
    name: 'Research Debate',
    icon: MessageSquare,
    status: 'pending',
    currentActivity: 'Waiting for analysis',
    details: 'Bull and Bear researchers engage in structured debate (max 2 rounds) to balance opportunities and risks. Research Manager synthesizes the final consensus.',
    description: 'Max 2 rounds',
    agents: [
      {
        id: '6',
        name: 'Bull Researcher',
        icon: TrendingUp,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '7',
        name: 'Bear Researcher',
        icon: TrendingDown,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '8',
        name: 'Research Manager',
        icon: Users,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  },
  {
    id: 'trading-decision',
    name: 'Trading Decision',
    icon: ChartCandlestick,
    status: 'pending',
    currentActivity: 'Awaiting research',
    details: 'Trader processes all analyst reports and research debate outcomes to create comprehensive trading recommendations with specific entry/exit points.',
    agents: [
      {
        id: '9',
        name: 'Trader',
        icon: ChartCandlestick,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  },
  {
    id: 'risk-assessment',
    name: 'Risk Assessment',
    icon: Shield,
    status: 'pending',
    currentActivity: 'Awaiting decision',
    details: 'Three risk perspectives rotate through discussion (max 3 rounds) before Risk Manager makes final approval/rejection decision on the trade.',
    description: 'Max 3 rounds',
    agents: [
      {
        id: '10',
        name: 'Risky Analyst',
        icon: OctagonAlert,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '11',
        name: 'Safe Analyst',
        icon: ShieldCheck,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '12',
        name: 'Neutral Analyst',
        icon: CircleSlash,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      },
      {
        id: '13',
        name: 'Risk Manager',
        icon: Shield,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  },
  {
    id: 'portfolio-management',
    name: 'Portfolio Management',
    icon: Briefcase,
    status: 'pending',
    currentActivity: 'Awaiting activation',
    details: 'Portfolio Manager analyzes portfolio allocation and generates trade orders with position sizing.',
    description: 'Position sizing',
    agents: [
      {
        id: '14',
        name: 'Portfolio Manager',
        icon: Briefcase,
        status: 'pending',
        lastAction: 'Not started',
        progress: 0
      }
    ],
    insights: []
  }
];