// Workflow explanation component
// Extracted from RebalanceModal.tsx maintaining exact same styles and behavior

interface WorkflowExplanationProps {
  rebalanceThreshold: number;
}

export function WorkflowExplanation({ rebalanceThreshold }: WorkflowExplanationProps) {
  return (
    <div className="pt-4 border-t">
      <h4 className="text-sm font-semibold mb-2">How Scheduled Rebalancing Works</h4>
      <div className="space-y-2 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <span className="font-medium">1.</span>
          <span>Schedule triggers at configured time intervals</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-medium">2.</span>
          <span>Calculate allocation drift for all selected stocks</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-medium">3.</span>
          <span>
            If max drift &lt; {rebalanceThreshold}%: Opportunity Agent evaluates market signals to identify high-priority stocks
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-medium">4.</span>
          <span>
            If max drift &ge; {rebalanceThreshold}%: Analyze all selected stocks immediately
          </span>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-medium">5.</span>
          <span>Run full multi-agent analysis on selected stocks</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="font-medium">6.</span>
          <span>Portfolio Manager creates optimal rebalance trades</span>
        </div>
      </div>
    </div>
  );
}