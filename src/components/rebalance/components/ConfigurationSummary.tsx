// Configuration summary component
// Extracted from RebalanceModal.tsx maintaining exact same styles and behavior

import type { RebalanceConfig } from "../types";

interface ConfigurationSummaryProps {
  config: RebalanceConfig;
  selectedPositionsCount: number;
  includeWatchlist: boolean;
  watchlistSelectedCount: number;
}

export function ConfigurationSummary({
  config,
  selectedPositionsCount,
  includeWatchlist,
  watchlistSelectedCount
}: ConfigurationSummaryProps) {
  return (
    <div className="pt-4 border-t">
      <h4 className="text-sm font-semibold mb-3">Configuration Summary</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Position Range:</span>
          <span className="font-medium">
            ${config.minPosition.toLocaleString()} - ${config.maxPosition.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Rebalance Threshold:</span>
          <span className="font-medium">
            {config.skipThresholdCheck ? 'Skipped' : `${config.rebalanceThreshold}%`}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Stock Allocation:</span>
          <span className="font-medium">{config.targetStockAllocation}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Cash Allocation:</span>
          <span className="font-medium">{config.targetCashAllocation}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Opportunity Analysis:</span>
          <span className="font-medium">
            {config.skipOpportunityAgent || config.skipThresholdCheck ? 
              'Disabled (all stocks analyzed)' : 
              'Enabled (smart filtering)'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Selected Stocks:</span>
          <span className="font-medium">
            {selectedPositionsCount} {selectedPositionsCount === 1 ? 'stock' : 'stocks'}
            {includeWatchlist && watchlistSelectedCount > 0 && 
              ` (${watchlistSelectedCount} from watchlist)`
            }
          </span>
        </div>
      </div>
      {config.skipThresholdCheck && (
        <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            ⚠️ Force rebalance enabled - will proceed regardless of current allocation drift
          </p>
        </div>
      )}
      {!config.skipThresholdCheck && !config.skipOpportunityAgent && (
        <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <p className="text-xs text-blue-700 dark:text-blue-400">
            💡 Opportunity analysis enabled - When allocation drift is below threshold, AI will evaluate selected stocks (including watchlist) to identify which ones have compelling market signals and warrant full analysis
          </p>
        </div>
      )}
    </div>
  );
}