// Configuration tab component
// Extracted from RebalanceModal.tsx maintaining exact same styles and behavior

import { TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LabelWithHelp } from "@/components/ui/help-button";
import { Slider } from "@/components/ui/slider";
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

  return (
    <TabsContent value="config" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 data-[state=inactive]:hidden">
      <div className="space-y-6">
        <Card className="p-6">
          <div className="space-y-6">
            {/* Configuration Fields */}
            <div className="space-y-6">
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
                  disabled={config.skipThresholdCheck}
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
                    disabled={config.skipThresholdCheck || !hasOppAccess}
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