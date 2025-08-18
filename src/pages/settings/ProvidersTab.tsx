import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
} from "lucide-react";
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
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs mb-1">Provider</Label>
                    <Select
                      value={provider.provider}
                      onValueChange={(value) => updateAiProvider(provider.id, 'provider', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="google">Google AI</SelectItem>
                        <SelectItem value="deepseek">DeepSeek</SelectItem>
                        <SelectItem value="openrouter">OpenRouter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="flex-1">
                    <Label className="text-xs mb-1">API Key</Label>
                    <div className="relative">
                      <Input
                        type={showKeys[`provider_${provider.id}`] ? "text" : "password"}
                        placeholder="Enter your default AI provider API key"
                        value={provider.apiKey}
                        onChange={(e) => updateAiProvider(provider.id, 'apiKey', e.target.value)}
                        className={errors[`provider_${provider.id}`] ? "border-red-500 font-mono text-sm" : "font-mono text-sm"}
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
                  </div>
                </div>
                {provider.provider && (
                  <div className="flex-1">
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
                        className="mt-2"
                        placeholder="Enter custom model name"
                        value={defaultCustomModel}
                        onChange={(e) => setDefaultCustomModel(e.target.value)}
                      />
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

        {/* Additional AI Providers */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <h3 className="text-lg font-semibold">Additional AI Providers</h3>
          <p className="text-sm text-muted-foreground">
            Configure additional AI providers for team-specific assignments.
          </p>
          
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
                      />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs mb-1">Provider</Label>
                      <Select
                        value={provider.provider}
                        onValueChange={(value) => updateAiProvider(provider.id, 'provider', value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="openai">OpenAI</SelectItem>
                          <SelectItem value="anthropic">Anthropic</SelectItem>
                          <SelectItem value="google">Google AI</SelectItem>
                          <SelectItem value="deepseek">DeepSeek</SelectItem>
                          <SelectItem value="openrouter">OpenRouter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="flex-1">
                      <Label className="text-xs mb-1">API Key</Label>
                      <div className="relative">
                        <Input
                          type={showKeys[`provider_${provider.id}`] ? "text" : "password"}
                          placeholder="Enter API key"
                          value={provider.apiKey}
                          onChange={(e) => updateAiProvider(provider.id, 'apiKey', e.target.value)}
                          className={errors[`provider_${provider.id}`] ? "border-red-500 font-mono text-sm" : "font-mono text-sm"}
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
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeAiProvider(provider.id)}
                      className="mt-5"
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
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Additional Provider
            </Button>
          </div>
        </div>

        {/* Save Button for Providers Tab */}
        <div className="flex justify-end pt-4">
          {saved && activeTab === 'providers' && (
            <Alert className="mr-4 w-auto bg-green-50 border-green-200">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Provider settings saved successfully!
              </AlertDescription>
            </Alert>
          )}
          {errors.save && activeTab === 'providers' && !errors.save.includes('Cannot delete provider') && !errors.save.includes('Cannot remove') && (
            <Alert className="mr-4 w-auto bg-red-50 border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {errors.save}
                {errors.save.includes('column') && (
                  <div className="mt-2 text-sm">
                    <p className="font-semibold">Database migration may be needed:</p>
                    <p>Run: <code className="bg-red-100 px-1 rounded">npx supabase db push</code></p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Button 
            onClick={() => handleSaveTab('providers')} 
            size="lg"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Provider Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}