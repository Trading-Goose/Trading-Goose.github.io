// Settings tab component (reusing components from RebalanceModal)
// Extracted from ScheduleRebalanceModal.tsx

import { Card } from "@/components/ui/card";
import { LabelWithHelp } from "@/components/ui/help-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { TabsContent } from "@/components/ui/tabs";
// Reuse components from RebalanceModal
import { ConfigurationSummary } from "@/components/rebalance/components/ConfigurationSummary";
import { WorkflowExplanation } from "@/components/rebalance/components/WorkflowExplanation";
import { useRBAC } from "@/hooks/useRBAC";
import type { RebalanceConfig } from "../types";

interface SettingsTabProps {
  rebalanceConfig: RebalanceConfig;
  setRebalanceConfig: (config: RebalanceConfig) => void;
  selectedPositionsCount: number;
  includeWatchlist: boolean;
  watchlistSelectedCount: number;
}

export function SettingsTab({
  rebalanceConfig,
  setRebalanceConfig,
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
            {/* Configuration Fields */}
            <div className="space-y-6">
              {/* Rebalance Threshold - Now at the top like RebalanceTab */}
              <div className="space-y-2">
                <LabelWithHelp
                  htmlFor="threshold"
                  label={`Rebalance Threshold: ${rebalanceConfig.rebalanceThreshold}%`}
                  helpContent="Triggers rebalance when portfolio drifts by this percentage. Lower values (1-5%) result in frequent rebalancing, higher values (10-20%) result in less frequent rebalancing. Recommended: 5-10%"
                />
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
                  disabled={rebalanceConfig.skipThresholdCheck}
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
                    checked={!hasOppAccess ? true : rebalanceConfig.skipOpportunityAgent}
                    onCheckedChange={(checked) =>
                      setRebalanceConfig({ ...rebalanceConfig, skipOpportunityAgent: checked as boolean })
                    }
                    disabled={rebalanceConfig.skipThresholdCheck || !hasOppAccess}
                  />
                  <LabelWithHelp
                    htmlFor="skipOpportunity"
                    label="Skip opportunity analysis (analyze all selected stocks)"
                    helpContent="Scans market for new investment opportunities when portfolio is balanced. Only activates when within rebalance threshold"
                    className={`text-sm font-normal ${!hasOppAccess ? 'opacity-50' : 'cursor-pointer'} ${rebalanceConfig.skipThresholdCheck ? 'opacity-50' : ''}`}
                  />
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