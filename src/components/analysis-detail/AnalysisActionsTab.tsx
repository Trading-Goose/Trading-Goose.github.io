import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Shield,
  TrendingDown,
  TrendingUp,
  RefreshCw
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import TradeOrderCard from "./TradeOrderCard";
import RebalanceDetailModal from "@/components/RebalanceDetailModal";

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
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  // For rebalance analyses, show a message that actions are handled at rebalance level
  if (analysisData.rebalance_request_id) {
    return (
      <>
        <div className="rounded-lg border bg-muted/20 p-6 text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-semibold mb-2">Part of Rebalance Workflow</h3>
          <p className="text-sm text-muted-foreground mb-4">
            This analysis is part of a portfolio rebalance. Trade orders will be generated
            after all stock analyses complete and are managed in the Rebalance view.
          </p>
          <Button 
            onClick={() => setDetailModalOpen(true)}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            View Rebalance Details
          </Button>
        </div>
        
        {/* Rebalance Detail Modal */}
        <RebalanceDetailModal
          rebalanceId={analysisData.rebalance_request_id}
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
        />
      </>
    );
  }

  // Get the portfolio manager's decision - check all possible locations
  const portfolioManagerDecision = analysisData.tradeOrder?.action ||  // From actual trade order
                                   analysisData.agent_insights?.portfolioManager?.finalDecision?.action || 
                                   analysisData.agent_insights?.portfolioManager?.decision?.action ||
                                   analysisData.agent_insights?.portfolioManager?.action ||
                                   analysisData.agent_insights?.portfolioManager?.decision || 
                                   analysisData.decision;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Portfolio Decision</span>
            {portfolioManagerDecision === 'BUY' ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : portfolioManagerDecision === 'SELL' ? (
              <TrendingDown className="w-4 h-4 text-red-500" />
            ) : (
              <Activity className="w-4 h-4 text-gray-500" />
            )}
          </div>
          <p className={`text-lg font-semibold ${portfolioManagerDecision === 'BUY' ? 'text-green-600' :
              portfolioManagerDecision === 'SELL' ? 'text-red-600' :
                'text-gray-600'
            }`}>
            {portfolioManagerDecision || 'HOLD'}
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