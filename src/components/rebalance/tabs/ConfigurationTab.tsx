// Configuration tab component
// Extracted from RebalanceModal.tsx maintaining exact same styles and behavior

import { TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { ConfigurationSummary } from "../components/ConfigurationSummary";
import { WorkflowExplanation } from "../components/WorkflowExplanation";
import { useRBAC } from "@/hooks/useRBAC";
import type { RebalanceConfig } from "../types";

interface ConfigurationTabProps {
  config: RebalanceConfig;
  setConfig: (config: RebalanceConfig | ((prev: RebalanceConfig) => RebalanceConfig)) => void;
  selectedPositionsCount: number;
  includeWatchlist: boolean;
  watchlistSelectedCount: number;
}

export function ConfigurationTab({
  config,
  setConfig,
  selectedPositionsCount,
  includeWatchlist,
  watchlistSelectedCount
}: ConfigurationTabProps) {
  const { hasOpportunityAgentAccess } = useRBAC();
  const hasOppAccess = hasOpportunityAgentAccess();
  
  // Validate that stock + cash allocation equals 100%
  const handleStockAllocationChange = (value: number[]) => {
    setConfig(prev => ({
      ...prev,
      targetStockAllocation: value[0],
      targetCashAllocation: 100 - value[0]
    }));
  };

  return (
    <TabsContent value="config" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 data-[state=inactive]:hidden">
      <div className="space-y-6">
        <Card className="p-6">
          <div className="space-y-6">
            {/* Use Default Settings */}
            <div className="flex items-center space-x-3">
              <Checkbox
                id="useDefault"
                checked={config.useDefaultSettings}
                onCheckedChange={(checked) =>
                  setConfig(prev => ({ ...prev, useDefaultSettings: checked as boolean }))
                }
              />
              <Label htmlFor="useDefault" className="text-sm font-medium">
                Use default rebalance configuration from user settings
              </Label>
            </div>

            {/* Configuration Fields */}
            <div className={`space-y-6 ${config.useDefaultSettings ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* Position Size Limits */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="minPosition">Minimum Position Size ($)</Label>
                  <Input
                    id="minPosition"
                    type="number"
                    value={config.minPosition}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      minPosition: Number(e.target.value)
                    }))}
                    disabled={config.useDefaultSettings}
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
                    value={config.maxPosition}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      maxPosition: Number(e.target.value)
                    }))}
                    disabled={config.useDefaultSettings}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum dollar amount for any position
                  </p>
                </div>
              </div>

              {/* Rebalance Threshold */}
              <div className="space-y-2">
                <Label htmlFor="threshold">
                  Rebalance Threshold: {config.rebalanceThreshold}%
                </Label>
                <Slider
                  id="threshold"
                  min={1}
                  max={50}
                  step={1}
                  value={[config.rebalanceThreshold]}
                  onValueChange={(value) => setConfig(prev => ({
                    ...prev,
                    rebalanceThreshold: value[0]
                  }))}
                  disabled={config.useDefaultSettings || config.skipThresholdCheck}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum allocation drift to trigger rebalancing. When drift is below this threshold, only stocks with compelling market signals will be analyzed (via Opportunity Agent).
                </p>

                {/* Skip Threshold Check Option */}
                <div className="flex items-center space-x-3 pt-2">
                  <Checkbox
                    id="skipThreshold"
                    checked={config.skipThresholdCheck}
                    onCheckedChange={(checked) => {
                      setConfig(prev => ({
                        ...prev,
                        skipThresholdCheck: checked as boolean,
                        // If forcing rebalance, automatically disable opportunity agent
                        skipOpportunityAgent: checked ? true : prev.skipOpportunityAgent
                      }));
                    }}
                    disabled={config.useDefaultSettings}
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
                    checked={!hasOppAccess ? true : config.skipOpportunityAgent}
                    onCheckedChange={(checked) =>
                      setConfig(prev => ({ ...prev, skipOpportunityAgent: checked as boolean }))
                    }
                    disabled={config.useDefaultSettings || config.skipThresholdCheck || !hasOppAccess}
                  />
                  <Label
                    htmlFor="skipOpportunity"
                    className={`text-sm font-normal ${!hasOppAccess ? 'opacity-50' : 'cursor-pointer'} ${config.skipThresholdCheck ? 'opacity-50' : ''
                      }`}
                  >
                    Skip opportunity analysis (analyze all selected stocks)
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  {!hasOppAccess
                    ? "Opportunity Agent access is not available in your subscription plan"
                    : config.skipThresholdCheck
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
                      <Label className="text-sm">Stock Allocation: {config.targetStockAllocation}%</Label>
                      <Slider
                        min={0}
                        max={100}
                        step={5}
                        value={[config.targetStockAllocation]}
                        onValueChange={handleStockAllocationChange}
                        disabled={config.useDefaultSettings}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Cash Allocation: {config.targetCashAllocation}%</Label>
                      <Progress value={config.targetCashAllocation} className="h-2 mt-6" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Target allocation between stocks and cash in your portfolio
                  </p>
                </div>
              </div>
            </div>

            {/* Workflow Explanation */}
            <WorkflowExplanation config={config} />

            {/* Summary */}
            <ConfigurationSummary
              config={config}
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