import {
  Activity,
  ArrowRight,
  Shield,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import { Card } from "@/components/ui/card";
import TradeOrderCard from "./TradeOrderCard";

interface AnalysisActionsTabProps {
  analysisData: any;
  handleApproveOrder: () => void;
  handleRejectOrder: () => void;
  isOrderExecuted: boolean;
  isExecuting?: boolean;
  getConfidenceColor: (confidence: number) => string;
}

export default function AnalysisActionsTab({
  analysisData,
  handleApproveOrder,
  handleRejectOrder,
  isOrderExecuted,
  isExecuting = false,
  getConfidenceColor
}: AnalysisActionsTabProps) {
  // For rebalance analyses, show a message that actions are handled at rebalance level
  if (analysisData.rebalance_request_id) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center">
        <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-semibold mb-2">Part of Rebalance Workflow</h3>
        <p className="text-sm text-muted-foreground">
          This analysis is part of a portfolio rebalance. Trade orders will be generated
          after all stock analyses complete and are managed in the Rebalance view.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Decision</span>
            {analysisData.decision === 'BUY' ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : analysisData.decision === 'SELL' ? (
              <TrendingDown className="w-4 h-4 text-red-500" />
            ) : (
              <Activity className="w-4 h-4 text-gray-500" />
            )}
          </div>
          <p className={`text-lg font-semibold ${analysisData.decision === 'BUY' ? 'text-green-600' :
              analysisData.decision === 'SELL' ? 'text-red-600' :
                'text-gray-600'
            }`}>
            {analysisData.decision}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Confidence</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className={`text-lg font-semibold ${getConfidenceColor(analysisData.confidence || 0)}`}>
            {analysisData.confidence || 0}%
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-lg font-semibold capitalize">
            {analysisData.status}
          </p>
        </Card>
      </div>

      {/* Trade Order Card */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Trade Order</h3>
        <TradeOrderCard
          analysisData={analysisData}
          onApprove={handleApproveOrder}
          onReject={handleRejectOrder}
          isExecuted={isOrderExecuted}
          isExecuting={isExecuting}
        />
      </div>

      {/* Additional Details */}
      {analysisData.agent_insights?.portfolioManager?.rationale && (
        <Card className="p-4">
          <div className="p-0 pb-3">
            <h4 className="text-sm font-semibold">Portfolio Manager Rationale</h4>
          </div>
          <div className="p-0">
            <p className="text-sm text-muted-foreground">
              {analysisData.agent_insights.portfolioManager.rationale}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}