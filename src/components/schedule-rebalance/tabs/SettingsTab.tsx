// Settings tab component (reusing components from RebalanceModal)
// Extracted from ScheduleRebalanceModal.tsx

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { TabsContent } from "@/components/ui/tabs";
// Reuse components from RebalanceModal
import { ConfigurationSummary } from "@/components/rebalance/components/ConfigurationSummary";
import { WorkflowExplanation } from "@/components/rebalance/components/WorkflowExplanation";
import { useRBAC } from "@/hooks/useRBAC";
import type { RebalanceConfig } from "../types";

interface SettingsTabProps {
  rebalanceConfig: RebalanceConfig;
  setRebalanceConfig: (config: RebalanceConfig) => void;
  handleStockAllocationChange: (value: number[]) => void;
  selectedPositionsCount: number;
  includeWatchlist: boolean;
  watchlistSelectedCount: number;
}

export function SettingsTab({
  rebalanceConfig,
  setRebalanceConfig,
  handleStockAllocationChange,
  selectedPositionsCount,
  includeWatchlist,
  watchlistSelectedCount
}: SettingsTabProps) {
  const { hasOpportunityAgentAccess } = useRBAC();
  const hasOppAccess = hasOpportunityAgentAccess();
  
  return (
    <TabsContent value="settings" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 data-[state=inactive]:hidden">
      <div className="space-y-6">
        <Card className="p-6">
          <div className="space-y-6">
            {/* Use Default Settings */}
            <div className="flex items-center space-x-3">
              <Checkbox
                id="useDefault"
                checked={rebalanceConfig.useDefaultSettings}
                onCheckedChange={(checked) =>
                  setRebalanceConfig({ ...rebalanceConfig, useDefaultSettings: checked as boolean })
                }
              />
              <Label htmlFor="useDefault" className="text-sm font-medium">
                Use default rebalance configuration from user settings
              </Label>
            </div>

            {/* Configuration Fields */}
            <div className={`space-y-6 ${rebalanceConfig.useDefaultSettings ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* Position Size Limits */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="minPosition">Minimum Position Size ($)</Label>
                  <Input
                    id="minPosition"
                    type="number"
                    value={rebalanceConfig.minPosition}
                    onChange={(e) => setRebalanceConfig({
                      ...rebalanceConfig,
                      minPosition: Number(e.target.value)
                    })}
                    disabled={rebalanceConfig.useDefaultSettings}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum dollar amount for any position
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxPosition">Maximum Position Size ($)</Label>
                  <Input
                    id="maxPosition"
                    type="number"
                    value={rebalanceConfig.maxPosition}
                    onChange={(e) => setRebalanceConfig({
                      ...rebalanceConfig,
                      maxPosition: Number(e.target.value)
                    })}
                    disabled={rebalanceConfig.useDefaultSettings}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum dollar amount for any position
                  </p>
                </div>
              </div>

              {/* Rebalance Threshold */}
              <div className="space-y-2">
                <Label htmlFor="threshold">
                  Rebalance Threshold: {rebalanceConfig.rebalanceThreshold}%
                </Label>
                <Slider
                  id="threshold"
                  min={1}
                  max={50}
                  step={1}
                  value={[rebalanceConfig.rebalanceThreshold]}
                  onValueChange={(value) => setRebalanceConfig({
                    ...rebalanceConfig,
                    rebalanceThreshold: value[0]
                  })}
                  disabled={rebalanceConfig.useDefaultSettings || rebalanceConfig.skipThresholdCheck}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum allocation drift to trigger rebalancing. When drift is below this threshold, only stocks with compelling market signals will be analyzed (via Opportunity Agent).
                </p>

                {/* Skip Threshold Check Option */}
                <div className="flex items-center space-x-3 pt-2">
                  <Checkbox
                    id="skipThreshold"
                    checked={rebalanceConfig.skipThresholdCheck}
                    onCheckedChange={(checked) => {
                      setRebalanceConfig({
                        ...rebalanceConfig,
                        skipThresholdCheck: checked as boolean,
                        // If forcing rebalance, automatically disable opportunity agent
                        skipOpportunityAgent: checked ? true : rebalanceConfig.skipOpportunityAgent
                      });
                    }}
                    disabled={rebalanceConfig.useDefaultSettings}
                  />
                  <Label htmlFor="skipThreshold" className="text-sm font-normal cursor-pointer">
                    Skip Threshold Check
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  When enabled, all selected stocks will be analyzed for rebalance agent regardless of rebalance threshold
                </p>
              </div>

              {/* Opportunity Agent Option */}
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="skipOpportunity"
                    checked={!hasOppAccess ? true : rebalanceConfig.skipOpportunityAgent}
                    onCheckedChange={(checked) =>
                      setRebalanceConfig({ ...rebalanceConfig, skipOpportunityAgent: checked as boolean })
                    }
                    disabled={rebalanceConfig.useDefaultSettings || rebalanceConfig.skipThresholdCheck || !hasOppAccess}
                  />
                  <Label
                    htmlFor="skipOpportunity"
                    className={`text-sm font-normal ${!hasOppAccess ? 'opacity-50' : 'cursor-pointer'} ${rebalanceConfig.skipThresholdCheck ? 'opacity-50' : ''
                      }`}
                  >
                    Skip opportunity analysis (analyze all selected stocks)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  {!hasOppAccess
                    ? "Opportunity Agent access is not available in your subscription plan"
                    : rebalanceConfig.skipThresholdCheck
                    ? "Opportunity analysis is automatically skipped when forcing rebalance (skip threshold check)"
                    : "When disabled, the Opportunity Agent evaluates market conditions to filter stocks for analysis when drift is below threshold"
                  }
                </p>
              </div>

              {/* Portfolio Allocation */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Portfolio Allocation</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Stock Allocation: {rebalanceConfig.targetStockAllocation}%</Label>
                      <Slider
                        min={0}
                        max={100}
                        step={5}
                        value={[rebalanceConfig.targetStockAllocation]}
                        onValueChange={handleStockAllocationChange}
                        disabled={rebalanceConfig.useDefaultSettings}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Cash Allocation: {rebalanceConfig.targetCashAllocation}%</Label>
                      <Progress value={rebalanceConfig.targetCashAllocation} className="h-2 mt-6" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Target allocation between stocks and cash in your portfolio
                  </p>
                </div>
              </div>
            </div>

            {/* Reuse WorkflowExplanation from RebalanceModal */}
            {!rebalanceConfig.skipThresholdCheck && !rebalanceConfig.skipOpportunityAgent && (
              <WorkflowExplanation rebalanceThreshold={rebalanceConfig.rebalanceThreshold} />
            )}

            {/* Reuse ConfigurationSummary from RebalanceModal */}
            <ConfigurationSummary
              config={rebalanceConfig}
              selectedPositionsCount={selectedPositionsCount}
              includeWatchlist={includeWatchlist}
              watchlistSelectedCount={watchlistSelectedCount}
            />
          </div>
        </Card>
      </div>
    </TabsContent>
  );
}