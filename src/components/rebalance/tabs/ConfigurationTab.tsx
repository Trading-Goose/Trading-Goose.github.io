// Configuration tab component
// Extracted from RebalanceModal.tsx maintaining exact same styles and behavior

import { TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LabelWithHelp } from "@/components/ui/help-button";
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
              <LabelWithHelp
                htmlFor="useDefault"
                label="Use default rebalance configuration from user settings"
                helpContent="Automatically uses settings from Settings > Rebalance tab. When checked, all fields below become read-only"
                className="text-sm font-medium cursor-pointer"
              />
            </div>

            {/* Configuration Fields */}
            <div className={`space-y-6 ${config.useDefaultSettings ? 'opacity-50 pointer-events-none' : ''}`}>
              {/* Position Size Limits */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <LabelWithHelp
                    label="Min Position Size"
                    helpContent="Minimum position size as percentage of portfolio. Prevents too many small positions. Lower values allow more positions but may increase trading costs."
                  />
                  <div className="flex items-center space-x-4 py-3 min-h-[40px]">
                    <span className="w-8 text-sm text-muted-foreground">5%</span>
                    <Slider
                      value={[config.minPosition]}
                      onValueChange={(value) => {
                        const newMin = value[0];
                        setConfig(prev => ({
                          ...prev,
                          minPosition: newMin,
                          // Ensure max is always greater than min
                          maxPosition: prev.maxPosition <= newMin ? Math.min(newMin + 5, 50) : prev.maxPosition
                        }));
                      }}
                      min={5}
                      max={25}
                      step={5}
                      className="flex-1"
                      disabled={config.useDefaultSettings}
                    />
                    <span className="w-12 text-sm text-muted-foreground">25%</span>
                    <span className="w-12 text-center font-medium">{config.minPosition}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimum percentage of portfolio per position (currently {config.minPosition}%)
                  </p>
                </div>

                <div className="space-y-2">
                  <LabelWithHelp
                    label="Max Position Size"
                    helpContent="Maximum position size as percentage of portfolio. Ensures diversification by limiting exposure to any single stock. Recommended: 20-30% for balanced diversification."
                  />
                  <div className="flex items-center space-x-4 py-3 min-h-[40px]">
                    <span className="w-12 text-sm text-muted-foreground">{config.minPosition}%</span>
                    <Slider
                      value={[config.maxPosition]}
                      onValueChange={(value) => {
                        const newMax = value[0];
                        setConfig(prev => ({
                          ...prev,
                          maxPosition: newMax
                          // Max is always at least min position size
                        }));
                      }}
                      min={config.minPosition}
                      max={50}
                      step={5}
                      className="flex-1"
                      disabled={config.useDefaultSettings}
                    />
                    <span className="w-12 text-sm text-muted-foreground">50%</span>
                    <span className="w-12 text-center font-medium">{config.maxPosition}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Maximum percentage of portfolio per position (currently {config.maxPosition}%)
                  </p>
                </div>
              </div>

              {/* Rebalance Threshold */}
              <div className="space-y-2">
                <LabelWithHelp
                  htmlFor="threshold"
                  label={`Rebalance Threshold: ${config.rebalanceThreshold}%`}
                  helpContent="Triggers rebalance when portfolio drifts by this percentage. Lower values (1-5%) result in frequent rebalancing, higher values (10-20%) result in less frequent rebalancing. Recommended: 5-10%"
                />
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
                        // If skipping threshold check, must also skip opportunity agent
                        // because opportunity agent only runs when threshold is NOT exceeded
                        skipOpportunityAgent: checked ? true : prev.skipOpportunityAgent
                      }));
                    }}
                    disabled={config.useDefaultSettings}
                  />
                  <LabelWithHelp
                    htmlFor="skipThreshold"
                    label="Skip Threshold Check"
                    helpContent="When enabled, all selected stocks will be analyzed for rebalance agent regardless of rebalance threshold"
                    className="text-sm font-normal cursor-pointer"
                  />
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
                    checked={!hasOppAccess ? true : (config.skipThresholdCheck ? true : config.skipOpportunityAgent)}
                    onCheckedChange={(checked) => {
                      // Only allow changing if threshold check is not skipped
                      if (!config.skipThresholdCheck) {
                        setConfig(prev => ({ ...prev, skipOpportunityAgent: checked as boolean }))
                      }
                    }}
                    disabled={config.useDefaultSettings || config.skipThresholdCheck || !hasOppAccess}
                  />
                  <LabelWithHelp
                    htmlFor="skipOpportunity"
                    label="Skip opportunity analysis (analyze all selected stocks)"
                    helpContent="Scans market for new investment opportunities when portfolio is balanced. Only activates when within rebalance threshold"
                    className={`text-sm font-normal ${!hasOppAccess ? 'opacity-50' : 'cursor-pointer'} ${config.skipThresholdCheck ? 'opacity-50' : ''}`}
                  />
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  {!hasOppAccess
                    ? "Opportunity Agent access is not available in your subscription plan"
                    : config.skipThresholdCheck
                    ? "Opportunity analysis is automatically skipped when threshold check is skipped"
                    : "When disabled, the Opportunity Agent evaluates market conditions to filter stocks for analysis when drift is below threshold"
                  }
                </p>
              </div>

              {/* Portfolio Allocation */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <LabelWithHelp
                    label="Portfolio Allocation"
                    helpContent="Target allocation between stocks and cash"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <LabelWithHelp
                        label={`Stock Allocation: ${config.targetStockAllocation}%`}
                        helpContent="Percentage to invest in stocks. Higher = more growth potential, more risk. Age-based rule: 100 minus your age = stock percentage"
                        className="text-sm"
                      />
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
                      <LabelWithHelp
                        label={`Cash Allocation: ${config.targetCashAllocation}%`}
                        helpContent="Percentage to keep in cash for opportunities and stability. Higher cash = more defensive, lower returns"
                        className="text-sm"
                      />
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
            <WorkflowExplanation rebalanceThreshold={config.rebalanceThreshold} />

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