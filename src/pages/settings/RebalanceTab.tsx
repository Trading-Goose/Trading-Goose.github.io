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
  Info,
  Lock,
} from "lucide-react";
import type { RebalanceTabProps } from "./types";

export default function RebalanceTab({
  aiProviders,
  rebalanceThreshold,
  rebalanceMinPositionSize,
  rebalanceMaxPositionSize,
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

        {/* Rebalance Settings */}
        <div className={`space-y-4 p-4 border rounded-lg bg-card ${!hasRebalanceAccess ? 'opacity-50' : ''}`}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Rebalance Settings
            {!hasRebalanceAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>

          {/* Rebalance Threshold */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Rebalance Threshold (%)
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="flex items-center space-x-4 py-3 min-h-[40px]">
              <Slider
                value={[rebalanceThreshold]}
                onValueChange={(value) => setRebalanceThreshold(value[0])}
                min={1}
                max={20}
                step={1}
                className="flex-1"
                disabled={!hasRebalanceAccess}
              />
              <span className="w-12 text-center font-medium">{rebalanceThreshold}%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Trigger rebalance when portfolio drift exceeds this percentage
            </p>
          </div>

          {/* Position Size Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min Position Size ($)</Label>
              <Input
                type="number"
                value={rebalanceMinPositionSize}
                onChange={(e) => setRebalanceMinPositionSize(Number(e.target.value))}
                min={0}
                step={100}
                disabled={!hasRebalanceAccess}
              />
              <p className="text-xs text-muted-foreground">
                Minimum dollar amount per position
              </p>
            </div>
            <div className="space-y-2">
              <Label>Max Position Size ($)</Label>
              <Input
                type="number"
                value={rebalanceMaxPositionSize}
                onChange={(e) => setRebalanceMaxPositionSize(Number(e.target.value))}
                min={0}
                step={1000}
                disabled={!hasRebalanceAccess}
              />
              <p className="text-xs text-muted-foreground">
                Maximum dollar amount per position
              </p>
            </div>
          </div>

          {/* Portfolio Allocation */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Portfolio Allocation</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Stock Allocation: {targetStockAllocation}%</Label>
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
                  <Label className="text-sm">Cash Allocation: {targetCashAllocation}%</Label>
                  <div className="h-10 flex items-center">
                    <Progress value={targetCashAllocation} className="h-2 w-full" />
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Target allocation between stocks and cash in your portfolio. These values must total 100%.
              </p>
            </div>
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
                {!hasOpportunityAgentAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
              </h3>
              <p className="text-sm text-muted-foreground">
                Identifies market opportunities when portfolio is within threshold
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>AI Provider</Label>
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
              <Label>Model</Label>
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
            <Label>Market Data Time Range</Label>
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
            <Label className="flex items-center gap-2">
              Max Tokens
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
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