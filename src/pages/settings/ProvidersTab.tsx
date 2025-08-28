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
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Plus,
  X,
  Lock,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ProvidersTabProps } from "./types";

export default function ProvidersTab({
  aiProviders,
  defaultAiModel,
  defaultCustomModel,
  showKeys,
  errors,
  saved,
  activeTab,
  updateAiProvider,
  setDefaultAiModel,
  setDefaultCustomModel,
  toggleShowKey,
  addAiProvider,
  removeAiProvider,
  handleSaveTab,
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
          <h3 className="text-lg font-semibold">Default AI Provider</h3>
          <p className="text-sm text-muted-foreground">
            Configure your primary AI provider. This will be used by default for all analysis.
          </p>

          {aiProviders.length > 0 && aiProviders[0] && (() => {
            const provider = aiProviders[0];
            return (
              <div className="space-y-3">
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <Label className="text-xs mb-1">Nickname</Label>
                    <Input
                      placeholder="e.g., Production API"
                      value={provider.nickname}
                      onChange={(e) => updateAiProvider(provider.id, 'nickname', e.target.value)}
                      disabled={true}
                      className="disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs mb-1">
                      Provider <span className="text-red-500">*</span>
                    </Label>
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
                    <Label className="text-xs mb-1">
                      API Key <span className="text-red-500">*</span>
                    </Label>
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
                    <Label className="text-xs mb-1">Default Model</Label>
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
                      <Input
                        className={`mt-2 ${!defaultCustomModel ? 'border-red-500' : ''}`}
                        placeholder="Enter custom model name *"
                        value={defaultCustomModel}
                        onChange={(e) => setDefaultCustomModel(e.target.value)}
                        required
                      />
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
          <h3 className="text-lg font-semibold flex items-center gap-2">
            Additional AI Providers
            {!hasAdditionalProviderAccess && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>
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
                    <Label className="text-xs mb-1">Nickname</Label>
                    <Input
                      placeholder="e.g., Fast Model"
                      value={provider.nickname}
                      onChange={(e) => updateAiProvider(provider.id, 'nickname', e.target.value)}
                      disabled={!hasAdditionalProviderAccess}
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs mb-1">
                      Provider <span className="text-red-500">*</span>
                    </Label>
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
                    <Label className="text-xs mb-1">
                      API Key <span className="text-red-500">*</span>
                    </Label>
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

        {/* Save Button for Providers Tab */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={() => handleSaveTab('providers')}
            size="lg"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Provider Settings
          </Button>
        </div>
      </CardContent>
    </Card >
  );
}