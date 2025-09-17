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
import {
  Key,
  Save,
  Loader2,
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Plus,
  X,
  Lock,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HelpButton, LabelWithHelp, HelpContent } from "@/components/ui/help-button";
import type { ProvidersTabProps } from "./types";

export default function ProvidersTab({
  aiProviders,
  defaultAiModel,
  defaultCustomModel,
  showKeys,
  errors,
  saved,
  activeTab,
  isSaving,
  updateAiProvider,
  setDefaultAiModel,
  setDefaultCustomModel,
  toggleShowKey,
  addAiProvider,
  removeAiProvider,
  handleSaveTab,
  handleClearProviders,
  getModelOptions,
  hasAdditionalProviderAccess = true,
}: ProvidersTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          API Provider Configuration
        </CardTitle>
        <CardDescription>
          Configure your data and AI provider API keys
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Default AI Provider Configuration */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Default AI Provider</h3>
            <HelpButton 
              content={
                <HelpContent
                  title="Default AI Provider"
                  description="This provider serves as the fallback when other providers fail or when no specific provider is assigned to an agent. It ensures your analysis always has an available AI provider."
                />
              }
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Configure your fallback AI provider. This will be used when other providers fail or for agents using "Default AI".
          </p>

          {aiProviders.length > 0 && aiProviders[0] && (() => {
            const provider = aiProviders[0];
            return (
              <div className="space-y-3">
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <LabelWithHelp
                      label="Nickname"
                      helpContent="A friendly name to identify this provider configuration. For example: 'Production API' or 'Fast Model'"
                      className="text-xs mb-1"
                    />
                    <Input
                      placeholder="e.g., Production API"
                      value={provider.nickname}
                      onChange={(e) => updateAiProvider(provider.id, 'nickname', e.target.value)}
                      disabled={true}
                      className="disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="flex-1">
                    <LabelWithHelp
                      label="Provider"
                      required={true}
                      helpContent="Choose your AI provider. Each has different models, pricing, and capabilities."
                      className="text-xs mb-1"
                    />
                    <Select
                      value={provider.provider}
                      onValueChange={(value) => updateAiProvider(provider.id, 'provider', value)}
                      required
                    >
                      <SelectTrigger className={!provider.provider ? "border-red-500" : ""}>
                        <SelectValue placeholder="Select provider *" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="google">Google AI</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="openrouter">OpenRouter</SelectItem>
                      </SelectContent>
                    </Select>
                    {!provider.provider && (
                      <p className="text-sm text-red-500 mt-1">Provider selection is required</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <LabelWithHelp
                      label="API Key"
                      required={true}
                      helpContent={
                        <HelpContent
                          title="API Key Configuration"
                          description="Your secret API key from the selected provider. This key authenticates your requests to the AI service."
                          tips={[
                            "Keep your API key secure - never share it publicly",
                            "Use environment variables in production",
                            "Set usage limits in your provider's dashboard",
                            "Monitor your API usage to control costs"
                          ]}
                          example="sk-proj-abc123xyz..."
                          warning="Your API key is encrypted before storage, but treat it as sensitive data."
                        />
                      }
                      className="text-xs mb-1"
                    />
                    <div className="relative">
                      <Input
                        type={showKeys[`provider_${provider.id}`] ? "text" : "password"}
                        placeholder="Enter your default AI provider API key *"
                        value={provider.apiKey}
                        onChange={(e) => updateAiProvider(provider.id, 'apiKey', e.target.value)}
                        className={errors[`provider_${provider.id}`] || !provider.apiKey ? "border-red-500 font-mono text-sm" : "font-mono text-sm"}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                        onClick={() => toggleShowKey(`provider_${provider.id}`)}
                      >
                        {showKeys[`provider_${provider.id}`] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {errors[`provider_${provider.id}`] && (
                      <p className="text-sm text-red-500 mt-1">{errors[`provider_${provider.id}`]}</p>
                    )}
                    {!errors[`provider_${provider.id}`] && !provider.apiKey && (
                      <p className="text-sm text-red-500 mt-1">API key is required</p>
                    )}
                  </div>
                </div>
                {provider.provider && (
                  <div className="space-y-2">
                    <LabelWithHelp
                      label="Default Model"
                      helpContent={
                        <HelpContent
                          title="Fallback Model Selection"
                          description="The AI model used when other providers fail or for agents set to 'Default AI'. This model handles all fallback operations."
                          tips={[
                            "Choose a reliable model with good uptime for fallback operations",
                            "Balance cost vs quality - this may be used frequently if other providers fail",
                            "GPT-4 or Claude 3 recommended for critical fallback analysis",
                            "This model is used by all agents when their assigned provider is unavailable"
                          ]}
                        />
                      }
                      className="text-xs mb-1"
                    />
                    <Select value={defaultAiModel} onValueChange={setDefaultAiModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select default model" />
                      </SelectTrigger>
                      <SelectContent>
                        {getModelOptions(provider.provider).map(model => (
                          <SelectItem key={model} value={model}>
                            {model === 'custom' ? 'Custom (enter manually)' : model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {defaultAiModel === 'custom' && (
                      <>
                        <LabelWithHelp
                          label="Custom Model Name"
                          required={true}
                          helpContent={
                            <HelpContent
                              title="Custom Model Configuration"
                              description="Enter the exact model name from your provider's documentation. This allows you to use newer models not yet in our list."
                              example="gpt-4-turbo-2024-04-09"
                              tips={[
                                "Check your provider's API documentation for valid model names",
                                "Ensure the model is available in your API tier",
                                "Model names are case-sensitive"
                              ]}
                            />
                          }
                          className="text-xs mb-1 mt-2"
                        />
                        <Input
                          className={`${!defaultCustomModel ? 'border-red-500' : ''}`}
                          placeholder="Enter custom model name *"
                          value={defaultCustomModel}
                          onChange={(e) => setDefaultCustomModel(e.target.value)}
                          required
                        />
                      </>
                    )}
                    {defaultAiModel === 'custom' && !defaultCustomModel && (
                      <p className="text-sm text-red-500 mt-1">Custom model name is required</p>
                    )}
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground ml-1">
                    This provider will be used by default for all teams unless overridden
                  </p>
                  {provider.provider && provider.apiKey && (
                    <p className="text-xs text-muted-foreground ml-1">
                      When agents use "Default AI", they will use this provider with the {defaultAiModel === 'custom' ? defaultCustomModel : (defaultAiModel || getModelOptions(provider.provider)[0])} model
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        {!hasAdditionalProviderAccess ? (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Additional AI providers requires a higher subscription plan. Upgrade to configure multiple AI providers for different agent teams.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Additional AI Providers */}
        <div className={`space-y-4 p-4 border rounded-lg bg-card ${!hasAdditionalProviderAccess ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              Additional AI Providers
              {!hasAdditionalProviderAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
            </h3>
            <HelpButton
              content={
                <HelpContent
                  title="Additional Providers"
                  description="Configure multiple API keys from the same or different providers for rate limit distribution and failover."
                  tips={[
                    "Use multiple keys to avoid rate limits",
                    "Set up different models for different agent teams",
                    "Configure backup providers for high availability",
                    "Mix providers to leverage their unique strengths"
                  ]}
                />
              }
            />
          </div>
          {!hasAdditionalProviderAccess ? null : (
            <p className="text-sm text-muted-foreground">
              Configure additional AI providers for team-specific assignments.
            </p>
          )}

          <div className="space-y-4">
            {aiProviders.slice(1).map((provider, index) => (
              <div key={provider.id} className="space-y-3 p-4 border rounded-lg">
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <LabelWithHelp
                      label="Nickname"
                      helpContent="A friendly name to identify this provider configuration. For example: 'Fast Model' or 'Backup API'"
                      className="text-xs mb-1"
                    />
                    <Input
                      placeholder="e.g., Fast Model"
                      value={provider.nickname}
                      onChange={(e) => updateAiProvider(provider.id, 'nickname', e.target.value)}
                      disabled={!hasAdditionalProviderAccess}
                    />
                  </div>
                  <div className="flex-1">
                    <LabelWithHelp
                      label="Provider"
                      required={true}
                      helpContent="Choose your AI provider. Each has different models, pricing, and capabilities."
                      className="text-xs mb-1"
                    />
                    <Select
                      value={provider.provider}
                      onValueChange={(value) => updateAiProvider(provider.id, 'provider', value)}
                      disabled={!hasAdditionalProviderAccess}
                      required
                    >
                      <SelectTrigger className={!provider.provider ? "border-red-500" : ""}>
                        <SelectValue placeholder="Select provider *" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="google">Google AI</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="openrouter">OpenRouter</SelectItem>
                      </SelectContent>
                    </Select>
                    {!provider.provider && (
                      <p className="text-sm text-red-500 mt-1">Provider selection is required</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <LabelWithHelp
                      label="API Key"
                      required={true}
                      helpContent={
                        <HelpContent
                          title="API Key Configuration"
                          description="Your secret API key from the selected provider. This key authenticates your requests to the AI service."
                          tips={[
                            "Keep your API key secure - never share it publicly",
                            "Use environment variables in production",
                            "Set usage limits in your provider's dashboard",
                            "Monitor your API usage to control costs"
                          ]}
                          example="sk-proj-abc123xyz..."
                          warning="Your API key is encrypted before storage, but treat it as sensitive data."
                        />
                      }
                      className="text-xs mb-1"
                    />
                    <div className="relative">
                      <Input
                        type={showKeys[`provider_${provider.id}`] ? "text" : "password"}
                        placeholder="Enter API key *"
                        value={provider.apiKey}
                        onChange={(e) => updateAiProvider(provider.id, 'apiKey', e.target.value)}
                        className={errors[`provider_${provider.id}`] || !provider.apiKey ? "border-red-500 font-mono text-sm" : "font-mono text-sm"}
                        disabled={!hasAdditionalProviderAccess}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                        onClick={() => toggleShowKey(`provider_${provider.id}`)}
                        disabled={!hasAdditionalProviderAccess}
                      >
                        {showKeys[`provider_${provider.id}`] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {errors[`provider_${provider.id}`] && (
                      <p className="text-sm text-red-500 mt-1">{errors[`provider_${provider.id}`]}</p>
                    )}
                    {!errors[`provider_${provider.id}`] && !provider.apiKey && (
                      <p className="text-sm text-red-500 mt-1">API key is required</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAiProvider(provider.id)}
                    className="mt-5"
                    disabled={!hasAdditionalProviderAccess}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={addAiProvider}
              className="w-full"
              disabled={!hasAdditionalProviderAccess}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Additional Provider
            </Button>
          </div>
        </div>

        {/* Save and Clear Buttons for Providers Tab */}
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-between pt-4">
          {handleClearProviders && (
            <Button
              onClick={handleClearProviders}
              disabled={isSaving}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border backdrop-blur-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] h-11 rounded-md px-8 bg-red-500/5 border-red-500/30 text-red-600 dark:bg-red-500/5 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/50 order-2 sm:order-1"
            >
              <Trash2 className="h-4 w-4" />
              Clear All Provider Settings
            </Button>
          )}
          <div className={`${!handleClearProviders ? "w-full" : "w-full sm:w-auto"} order-1 sm:order-2`}>
            <Button
              onClick={() => handleSaveTab('providers')}
              size="lg"
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving Provider Settings ...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Provider Settings
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card >
  );
}
