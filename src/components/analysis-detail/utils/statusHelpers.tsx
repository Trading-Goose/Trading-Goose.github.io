import {
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  MessageCircle,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  XCircle
} from "lucide-react";
import {
  type AnalysisStatus,
  type RebalanceStatus,
  ANALYSIS_STATUS,
  REBALANCE_STATUS
} from "@/lib/statusTypes";

export const getStatusIcon = (status: AnalysisStatus | RebalanceStatus | string) => {
  switch (status) {
    case ANALYSIS_STATUS.COMPLETED:
    case REBALANCE_STATUS.COMPLETED:
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case ANALYSIS_STATUS.RUNNING:
    case REBALANCE_STATUS.RUNNING:
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    case ANALYSIS_STATUS.CANCELLED:
    case REBALANCE_STATUS.CANCELLED:
      return <XCircle className="w-4 h-4 text-orange-500" />;
    case ANALYSIS_STATUS.ERROR:
    case REBALANCE_STATUS.ERROR:
      return <XCircle className="w-4 h-4 text-red-500" />;
    case ANALYSIS_STATUS.PENDING:
    case REBALANCE_STATUS.PENDING:
      return <Clock className="w-4 h-4 text-gray-400" />;
    case ANALYSIS_STATUS.AWAITING_APPROVAL:
    case REBALANCE_STATUS.AWAITING_APPROVAL:
      return <Clock className="w-4 h-4 text-yellow-500" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
};

export const getMessageIcon = (type: string) => {
  switch (type) {
    case 'error':
      return AlertCircle;
    case 'decision':
      return TrendingUp;
    case 'debate':
      return MessageSquare;
    default:
      return MessageCircle;
  }
};

export const getDecisionVariant = (decision: string): "default" | "secondary" | "destructive" | "outline" | "buy" | "sell" | "hold" | "completed" | "running" | "error" | "pending" => {
  switch (decision) {
    case 'BUY': return 'buy';
    case 'SELL': return 'sell';
    case 'HOLD': return 'hold';
    case 'CANCELED': return 'outline';
    default: return 'secondary';
  }
};

export const getDecisionIcon = (decision: string) => {
  switch (decision) {
    case 'BUY':
      return <TrendingUp className="w-3 h-3 mr-1" />;
    case 'SELL':
      return <TrendingDown className="w-3 h-3 mr-1" />;
    default:
      return null;
  }
};