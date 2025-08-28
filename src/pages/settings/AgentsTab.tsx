import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Bot,
  Save,
  AlertCircle,
  Check,
  Info,
  Lock,
} from "lucide-react";
import type { AgentsTabProps } from "./types";

export default function AgentsTab({
  aiProviders,
  researchDebateRounds,
  analysisTeamProviderId,
  analysisTeamModel,
  analysisCustomModel,
  researchTeamProviderId,
  researchTeamModel,
  researchCustomModel,
  tradingTeamProviderId,
  tradingTeamModel,
  tradingCustomModel,
  riskTeamProviderId,
  riskTeamModel,
  riskCustomModel,
  portfolioManagerProviderId,
  portfolioManagerModel,
  portfolioManagerCustomModel,
  analysisOptimization,
  analysisHistoryDays,
  analysisMaxTokens,
  researchMaxTokens,
  tradingMaxTokens,
  riskMaxTokens,
  portfolioManagerMaxTokens,
  defaultAiModel,
  defaultCustomModel,
  saved,
  activeTab,
  setResearchDebateRounds,
  setAnalysisTeamProviderId,
  setAnalysisTeamModel,
  setAnalysisCustomModel,
  setResearchTeamProviderId,
  setResearchTeamModel,
  setResearchCustomModel,
  setTradingTeamProviderId,
  setTradingTeamModel,
  setTradingCustomModel,
  setRiskTeamProviderId,
  setRiskTeamModel,
  setRiskCustomModel,
  setPortfolioManagerProviderId,
  setPortfolioManagerModel,
  setPortfolioManagerCustomModel,
  setAnalysisOptimization,
  setAnalysisHistoryDays,
  setAnalysisMaxTokens,
  setResearchMaxTokens,
  setTradingMaxTokens,
  setRiskMaxTokens,
  setPortfolioManagerMaxTokens,
  handleSaveTab,
  getModelOptions,
  getConfiguredProviders,
  getDefaultModelValue,
  hasAgentConfigAccess = true,
}: AgentsTabProps) {
  const defaultProviderId = aiProviders.length > 0 ? aiProviders[0].id : '1';

  // Debug logging
  console.log('AgentsTab received props:', {
    analysisOptimization,
    analysisHistoryDays
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Agent Configuration
        </CardTitle>
        <CardDescription>
          Configure AI models for each agent team
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Agent Team Configuration Info */}
        {!hasAgentConfigAccess ? (
          <Alert className="mb-6">
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Agent configuration requires a higher subscription plan. Upgrade to customize AI models for each agent team.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Each agent team will use your default AI provider unless you assign a specific provider below.
              Configure additional providers in the Providers tab first.
            </AlertDescription>
          </Alert>
        )}

        {/* Analysis Agent */}
        <div className={`space-y-4 p-4 border rounded-lg bg-card ${!hasAgentConfigAccess ? 'opacity-50' : ''}`}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Analysis Agent
            {!hasAgentConfigAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>AI Provider</Label>
              <Select value={analysisTeamProviderId} onValueChange={setAnalysisTeamProviderId} disabled={!hasAgentConfigAccess}>
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
              {analysisTeamProviderId === defaultProviderId ? (
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
                    value={analysisTeamModel}
                    onValueChange={setAnalysisTeamModel}
                    disabled={!hasAgentConfigAccess}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelOptions(aiProviders.find(p => p.id === analysisTeamProviderId)?.provider || 'openai').map(model => (
                        <SelectItem key={model} value={model}>
                          {model === 'custom' ? 'Custom (enter manually)' : model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {analysisTeamModel === 'custom' && (
                    <Input
                      className={`mt-2 ${!analysisCustomModel ? 'border-red-500' : ''}`}
                      placeholder="Enter custom model name *"
                      value={analysisCustomModel}
                      onChange={(e) => setAnalysisCustomModel(e.target.value)}
                      disabled={!hasAgentConfigAccess}
                      required
                    />
                  )}
                  {analysisTeamModel === 'custom' && !analysisCustomModel && (
                    <p className="text-sm text-red-500 mt-1">Custom model name is required</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Analysis Optimization</Label>
              <Select
                value={analysisOptimization}
                onValueChange={setAnalysisOptimization}
                disabled={!hasAgentConfigAccess}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select optimization level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="speed">Speed</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Normal: Standard analysis Balanced: More thorough coverage for all analysis agents
              </p>
            </div>
            <div className="space-y-2">
              <Label>Historical Data Range</Label>
              <Select
                value={analysisHistoryDays}
                onValueChange={setAnalysisHistoryDays}
                disabled={!hasAgentConfigAccess}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1M">1 Month</SelectItem>
                  <SelectItem value="3M">3 Months</SelectItem>
                  <SelectItem value="6M">6 Months</SelectItem>
                  <SelectItem value="1Y">1 Year</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How far back to analyze data
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Max Tokens
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="flex items-center space-x-4 py-3 min-h-[40px]">
              <Slider
                value={[analysisMaxTokens]}
                onValueChange={(value) => setAnalysisMaxTokens(value[0])}
                min={500}
                max={8000}
                step={500}
                className="flex-1"
                disabled={!hasAgentConfigAccess}
              />
              <span className="w-16 text-center font-medium">{analysisMaxTokens}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum response tokens for analysis agents (500-8000)
            </p>
          </div>
        </div>

        {/* Research Agent */}
        <div className={`space-y-4 p-4 border rounded-lg bg-card ${!hasAgentConfigAccess ? 'opacity-50' : ''}`}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Research Agent
            {!hasAgentConfigAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>AI Provider</Label>
              <Select value={researchTeamProviderId} onValueChange={setResearchTeamProviderId} disabled={!hasAgentConfigAccess}>
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
              {researchTeamProviderId === defaultProviderId ? (
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
                    value={researchTeamModel}
                    onValueChange={setResearchTeamModel}
                    disabled={!hasAgentConfigAccess}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelOptions(aiProviders.find(p => p.id === researchTeamProviderId)?.provider || 'openai').map(model => (
                        <SelectItem key={model} value={model}>
                          {model === 'custom' ? 'Custom (enter manually)' : model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {researchTeamModel === 'custom' && (
                    <Input
                      className={`mt-2 ${!researchCustomModel ? 'border-red-500' : ''}`}
                      placeholder="Enter custom model name *"
                      value={researchCustomModel}
                      onChange={(e) => setResearchCustomModel(e.target.value)}
                      disabled={!hasAgentConfigAccess}
                      required
                    />
                  )}
                  {researchTeamModel === 'custom' && !researchCustomModel && (
                    <p className="text-sm text-red-500 mt-1">Custom model name is required</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Number of Debate Rounds</Label>
            <div className="flex items-center space-x-4 py-3 min-h-[40px]">
              <Slider
                value={[researchDebateRounds]}
                onValueChange={(value) => setResearchDebateRounds(value[0])}
                min={1}
                max={5}
                step={1}
                className="flex-1"
                disabled={!hasAgentConfigAccess}
              />
              <span className="w-12 text-center font-medium">{researchDebateRounds}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              How many rounds of bull vs bear debate
            </p>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Max Tokens
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="flex items-center space-x-4 py-3 min-h-[40px]">
              <Slider
                value={[researchMaxTokens]}
                onValueChange={(value) => setResearchMaxTokens(value[0])}
                min={500}
                max={8000}
                step={500}
                className="flex-1"
                disabled={!hasAgentConfigAccess}
              />
              <span className="w-16 text-center font-medium">{researchMaxTokens}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum response tokens for research agents (500-8000)
            </p>
          </div>
        </div>

        {/* Trading Decision Agent */}
        <div className={`space-y-4 p-4 border rounded-lg bg-card ${!hasAgentConfigAccess ? 'opacity-50' : ''}`}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Trading Decision Agent
            {!hasAgentConfigAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>AI Provider</Label>
              <Select value={tradingTeamProviderId} onValueChange={setTradingTeamProviderId} disabled={!hasAgentConfigAccess}>
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
              {tradingTeamProviderId === defaultProviderId ? (
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
                    value={tradingTeamModel}
                    onValueChange={setTradingTeamModel}
                    disabled={!hasAgentConfigAccess}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelOptions(aiProviders.find(p => p.id === tradingTeamProviderId)?.provider || 'openai').map(model => (
                        <SelectItem key={model} value={model}>
                          {model === 'custom' ? 'Custom (enter manually)' : model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {tradingTeamModel === 'custom' && (
                    <Input
                      className={`mt-2 ${!tradingCustomModel ? 'border-red-500' : ''}`}
                      placeholder="Enter custom model name *"
                      value={tradingCustomModel}
                      onChange={(e) => setTradingCustomModel(e.target.value)}
                      disabled={!hasAgentConfigAccess}
                      required
                    />
                  )}
                  {tradingTeamModel === 'custom' && !tradingCustomModel && (
                    <p className="text-sm text-red-500 mt-1">Custom model name is required</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Max Tokens
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="flex items-center space-x-4 py-3 min-h-[40px]">
              <Slider
                value={[tradingMaxTokens]}
                onValueChange={(value) => setTradingMaxTokens(value[0])}
                min={500}
                max={8000}
                step={500}
                className="flex-1"
                disabled={!hasAgentConfigAccess}
              />
              <span className="w-16 text-center font-medium">{tradingMaxTokens}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum response tokens for trading agent (500-8000)
            </p>
          </div>
        </div>

        {/* Risk Management Agent */}
        <div className={`space-y-4 p-4 border rounded-lg bg-card ${!hasAgentConfigAccess ? 'opacity-50' : ''}`}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Risk Management Agent
            {!hasAgentConfigAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>AI Provider</Label>
              <Select value={riskTeamProviderId} onValueChange={setRiskTeamProviderId} disabled={!hasAgentConfigAccess}>
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
              {riskTeamProviderId === defaultProviderId ? (
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
                    value={riskTeamModel}
                    onValueChange={setRiskTeamModel}
                    disabled={!hasAgentConfigAccess}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelOptions(aiProviders.find(p => p.id === riskTeamProviderId)?.provider || 'openai').map(model => (
                        <SelectItem key={model} value={model}>
                          {model === 'custom' ? 'Custom (enter manually)' : model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {riskTeamModel === 'custom' && (
                    <Input
                      className={`mt-2 ${!riskCustomModel ? 'border-red-500' : ''}`}
                      placeholder="Enter custom model name *"
                      value={riskCustomModel}
                      onChange={(e) => setRiskCustomModel(e.target.value)}
                      disabled={!hasAgentConfigAccess}
                      required
                    />
                  )}
                  {riskTeamModel === 'custom' && !riskCustomModel && (
                    <p className="text-sm text-red-500 mt-1">Custom model name is required</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Max Tokens
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="flex items-center space-x-4 py-3 min-h-[40px]">
              <Slider
                value={[riskMaxTokens]}
                onValueChange={(value) => setRiskMaxTokens(value[0])}
                min={500}
                max={8000}
                step={500}
                className="flex-1"
                disabled={!hasAgentConfigAccess}
              />
              <span className="w-16 text-center font-medium">{riskMaxTokens}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum response tokens for risk agents (500-8000)
            </p>
          </div>
        </div>

        {/* Portfolio Manager Configuration */}
        <div className={`space-y-4 p-4 border rounded-lg bg-card ${!hasAgentConfigAccess ? 'opacity-50' : ''}`}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Portfolio Manager
            {!hasAgentConfigAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>
          <p className="text-sm text-muted-foreground">
            Analyzes portfolio positions and generates optimal allocation strategy with trade orders
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>AI Provider</Label>
              <Select value={portfolioManagerProviderId} onValueChange={setPortfolioManagerProviderId} disabled={!hasAgentConfigAccess}>
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
              {portfolioManagerProviderId === defaultProviderId ? (
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
                    value={portfolioManagerModel}
                    onValueChange={setPortfolioManagerModel}
                    disabled={!hasAgentConfigAccess}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {getModelOptions(aiProviders.find(p => p.id === portfolioManagerProviderId)?.provider || 'openai').map(model => (
                        <SelectItem key={model} value={model}>
                          {model === 'custom' ? 'Custom (enter manually)' : model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {portfolioManagerModel === 'custom' && (
                    <Input
                      className={`mt-2 ${!portfolioManagerCustomModel ? 'border-red-500' : ''}`}
                      placeholder="Enter custom model name *"
                      value={portfolioManagerCustomModel}
                      onChange={(e) => setPortfolioManagerCustomModel(e.target.value)}
                      disabled={!hasAgentConfigAccess}
                      required
                    />
                  )}
                  {portfolioManagerModel === 'custom' && !portfolioManagerCustomModel && (
                    <p className="text-sm text-red-500 mt-1">Custom model name is required</p>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              Max Tokens
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <div className="flex items-center space-x-4 py-3 min-h-[40px]">
              <Slider
                value={[portfolioManagerMaxTokens]}
                onValueChange={(value) => setPortfolioManagerMaxTokens(value[0])}
                min={500}
                max={8000}
                step={500}
                className="flex-1"
                disabled={!hasAgentConfigAccess}
              />
              <span className="w-16 text-center font-medium">{portfolioManagerMaxTokens}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum response tokens for portfolio manager (500-8000)
            </p>
          </div>
        </div>


        {/* Save Button for Agents Tab */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={() => handleSaveTab('agents')}
            size="lg"
            disabled={!hasAgentConfigAccess}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Agent Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}