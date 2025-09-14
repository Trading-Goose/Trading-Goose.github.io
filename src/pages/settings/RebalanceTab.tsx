import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw,
  Save,
  AlertCircle,
  Check,
  Lock,
} from "lucide-react";
import { HelpButton, LabelWithHelp } from "@/components/ui/help-button";
import type { RebalanceTabProps } from "./types";

export default function RebalanceTab({
  aiProviders,
  rebalanceThreshold,
  rebalanceMinPositionSize,
  rebalanceMaxPositionSize,
  nearPositionThreshold,
  targetStockAllocation,
  targetCashAllocation,
  opportunityAgentProviderId,
  opportunityAgentModel,
  opportunityCustomModel,
  opportunityMaxTokens,
  opportunityMarketRange,
  defaultAiModel,
  defaultCustomModel,
  saved,
  activeTab,
  errors,
  setRebalanceThreshold,
  setRebalanceMinPositionSize,
  setRebalanceMaxPositionSize,
  setNearPositionThreshold,
  setTargetStockAllocation,
  setTargetCashAllocation,
  setOpportunityAgentProviderId,
  setOpportunityAgentModel,
  setOpportunityCustomModel,
  setOpportunityMaxTokens,
  setOpportunityMarketRange,
  handleSaveTab,
  getModelOptions,
  getConfiguredProviders,
  getDefaultModelValue,
  hasOpportunityAgentAccess = true,
  hasRebalanceAccess = true,
}: RebalanceTabProps) {
  const defaultProviderId = aiProviders.length > 0 ? aiProviders[0].id : '1';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Rebalance Configuration
        </CardTitle>
        <CardDescription>
          Configure portfolio rebalancing settings and agents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasRebalanceAccess && (
          <Alert className="mb-6">
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Rebalance configuration requires a higher subscription plan. Upgrade to customize portfolio rebalancing settings.
            </AlertDescription>
          </Alert>
        )}

        {/* Portfolio Limits - New separate section */}
        <div className={`space-y-4 p-4 border rounded-lg bg-card ${!hasRebalanceAccess ? 'opacity-50' : ''}`}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Portfolio Limits
            <HelpButton 
              content="Define position size constraints and target allocations for your portfolio"
              iconSize={16}
            />
            {!hasRebalanceAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>

          {/* Position Size Limits */}
          <div className="space-y-2">
            <LabelWithHelp
              label="Position Size Limits"
              helpContent="Set minimum and maximum position sizes as percentage of portfolio. Min prevents too many small positions, Max ensures diversification. Recommended: Min 5-10%, Max 20-30%"
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <LabelWithHelp
                  label={`Min Size: ${rebalanceMinPositionSize}%`}
                  helpContent="Minimum position size prevents too many small positions"
                  className="text-sm"
                />
                <Slider
                  value={[rebalanceMinPositionSize]}
                  onValueChange={(value) => {
                    const newMin = value[0];
                    setRebalanceMinPositionSize(newMin);
                    // Ensure max is always greater than min
                    if (rebalanceMaxPositionSize <= newMin) {
                      setRebalanceMaxPositionSize(Math.min(newMin + 5, 50));
                    }
                  }}
                  min={5}
                  max={25}
                  step={5}
                  className="w-full"
                  disabled={!hasRebalanceAccess}
                />
              </div>
              <div className="space-y-2">
                <LabelWithHelp
                  label={`Max Size: ${rebalanceMaxPositionSize}%`}
                  helpContent="Maximum position size ensures diversification"
                  className="text-sm"
                />
                <Slider
                  value={[rebalanceMaxPositionSize]}
                  onValueChange={(value) => {
                    setRebalanceMaxPositionSize(value[0]);
                  }}
                  min={rebalanceMinPositionSize}
                  max={50}
                  step={5}
                  className="w-full"
                  disabled={!hasRebalanceAccess}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Position sizes must be between {rebalanceMinPositionSize}% and {rebalanceMaxPositionSize}% of portfolio
            </p>
          </div>

          {/* Near Position Threshold */}
          <div className="space-y-2">
            <LabelWithHelp
              label={`Near Position Threshold: ${nearPositionThreshold}%`}
              helpContent="Defines when a position is considered 'near' the minimum or maximum size limits. For example, if set to 20% with a max size of 25%, positions at 20% or above (80% of max) are considered 'near maximum'. This helps the AI make more nuanced decisions about position sizing."
            />
            <Slider
              value={[nearPositionThreshold]}
              onValueChange={(value) => setNearPositionThreshold(value[0])}
              min={5}
              max={25}
              step={1}
              className="w-full"
              disabled={!hasRebalanceAccess}
            />
            <p className="text-xs text-muted-foreground">
              Positions within {nearPositionThreshold}% of limits trigger warnings
            </p>
          </div>

          {/* Portfolio Allocation */}
          <div className="space-y-2">
            <LabelWithHelp
              label="Portfolio Allocation"
              helpContent="Target allocation between stocks and cash"
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <LabelWithHelp
                  label={`Stock Allocation: ${targetStockAllocation}%`}
                  helpContent="Percentage to invest in stocks. Higher = more growth potential, more risk. Age-based rule: 100 minus your age = stock percentage"
                  className="text-sm"
                />
                <Slider
                  value={[targetStockAllocation]}
                  onValueChange={(value) => {
                    setTargetStockAllocation(value[0]);
                    setTargetCashAllocation(100 - value[0]);
                  }}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                  disabled={!hasRebalanceAccess}
                />
              </div>
              <div className="space-y-2">
                <LabelWithHelp
                  label={`Cash Allocation: ${targetCashAllocation}%`}
                  helpContent="Percentage to keep in cash for opportunities and stability. Higher cash = more defensive, lower returns"
                  className="text-sm"
                />
                <Slider
                  value={[targetCashAllocation]}
                  onValueChange={(value) => {
                    setTargetCashAllocation(value[0]);
                    setTargetStockAllocation(100 - value[0]);
                  }}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                  disabled={!hasRebalanceAccess}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Target allocation between stocks and cash in your portfolio. These values must total 100%.
            </p>
          </div>
        </div>

        {!hasOpportunityAgentAccess && hasRebalanceAccess && (
          <Alert className="mb-4">
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Opportunity Agent access requires a higher subscription plan.
            </AlertDescription>
          </Alert>
        )}

        {/* Opportunity Agent Configuration */}
        <div className={`space-y-4 p-4 border rounded-lg bg-card ${!hasOpportunityAgentAccess ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                Opportunity Agent
                <HelpButton 
                  content="Scans market for new investment opportunities when portfolio is balanced. Only activates when within rebalance threshold"
                  iconSize={16}
                />
                {!hasOpportunityAgentAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
              </h3>
              <p className="text-sm text-muted-foreground">
                Identifies market opportunities when portfolio is within threshold
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <LabelWithHelp
                label="AI Provider"
                helpContent="Select which API key configuration to use. Uses Default AI provider if not changed"
              />
              <Select
                value={opportunityAgentProviderId}
                onValueChange={setOpportunityAgentProviderId}
                disabled={!hasOpportunityAgentAccess}>
                <SelectTrigger>
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {getConfiguredProviders().map(provider => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.nickname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <LabelWithHelp
                label="Model"
                helpContent="Choose the AI model for opportunity scanning"
              />
              {opportunityAgentProviderId === defaultProviderId ? (
                <div>
                  <Select
                    disabled
                    value={getDefaultModelValue()}
                  >
                    <SelectTrigger>
                      <SelectValue>{getDefaultModelValue()}</SelectValue>
                    </SelectTrigger>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Using Default AI provider's model
                  </p>
                </div>
              ) : (
                <div>
                  <Select
                    value={opportunityAgentModel}
                    onValueChange={setOpportunityAgentModel}
                    disabled={!hasOpportunityAgentAccess}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelOptions(aiProviders.find(p => p.id === opportunityAgentProviderId)?.provider || 'openai').map(model => (
                        <SelectItem key={model} value={model}>
                          {model === 'custom' ? 'Custom (enter manually)' : model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {opportunityAgentModel === 'custom' && (
                    <Input
                      className={`mt-2 ${!opportunityCustomModel ? 'border-red-500' : ''}`}
                      placeholder="Enter custom model name *"
                      value={opportunityCustomModel}
                      onChange={(e) => setOpportunityCustomModel(e.target.value)}
                      disabled={!hasOpportunityAgentAccess}
                      required
                    />
                  )}
                  {opportunityAgentModel === 'custom' && !opportunityCustomModel && (
                    <p className="text-sm text-red-500 mt-1">Custom model name is required</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <LabelWithHelp
              label="Market Data Time Range"
              helpContent="Historical data range. 1D: momentum plays, 1W: short-term, 1M: swing trading, 3M-1Y: value opportunities"
            />
            <Select
              value={opportunityMarketRange}
              onValueChange={setOpportunityMarketRange}
              disabled={!hasOpportunityAgentAccess}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1D">1 Day</SelectItem>
                <SelectItem value="1W">1 Week</SelectItem>
                <SelectItem value="1M">1 Month</SelectItem>
                <SelectItem value="3M">3 Months</SelectItem>
                <SelectItem value="1Y">1 Year</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Historical price data range for market opportunity analysis
            </p>
          </div>
          <div className="space-y-2">
            <LabelWithHelp
              label="Max Tokens"
              helpContent="Response length limit. Higher = more detailed analysis"
            />
            <div className="flex items-center space-x-4 py-3 min-h-[40px]">
              <Slider
                value={[opportunityMaxTokens]}
                onValueChange={(value) => setOpportunityMaxTokens(value[0])}
                min={500}
                max={8000}
                step={500}
                className="flex-1"
                disabled={!hasOpportunityAgentAccess}
              />
              <span className="w-16 text-center font-medium">{opportunityMaxTokens}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum response tokens for opportunity agent (500-8000)
            </p>
          </div>
        </div>

        {/* Save Button for Rebalance Tab */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={() => handleSaveTab('rebalance')}
            size="lg"
            disabled={!hasRebalanceAccess && !hasOpportunityAgentAccess}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Rebalance Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}