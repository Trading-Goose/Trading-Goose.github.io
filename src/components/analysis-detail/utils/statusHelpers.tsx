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

export const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    case 'canceled':
      return <XCircle className="w-4 h-4 text-orange-500" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-red-500" />;
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

export const getDecisionVariant = (decision: string): "default" | "secondary" | "destructive" | "outline" | "buy" | "sell" | "hold" => {
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