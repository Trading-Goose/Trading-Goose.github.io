import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings,
  Key,
  AlertCircle,
  TrendingUp,
  Bot,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabaseHelpers, supabase } from "@/lib/supabase";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { ApiSettings } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useRBAC } from "@/hooks/useRBAC";

// Import tab components
import ProvidersTab from "./settings/ProvidersTab";
import AgentsTab from "./settings/AgentsTab";
import RebalanceTab from "./settings/RebalanceTab";
import TradingTab from "./settings/TradingTab";
import type { AiProvider } from "./settings/types";

// Helper function to validate credentials via edge function
const validateCredential = async (provider: string, apiKey: string, model?: string, secretKey?: string): Promise<{ valid: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('settings-proxy', {
      body: {
        action: 'validate',
        provider,
        apiKey,
        model,
        secretKey
      }
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error validating credential:', error);
    return { valid: false, message: 'Failed to validate credential' };
  }
};

// Helper function to check which providers are configured
const checkConfiguredProviders = async (): Promise<{ configured: Record<string, boolean>, additionalProviders?: any[] }> => {
  try {
    const { data, error } = await supabase.functions.invoke('settings-proxy', {
      body: {
        action: 'check_configured'
      }
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error checking configured providers:', error);
    return { configured: {} };
  }
};

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, apiSettings, updateApiSettings, isAuthenticated, isLoading, initialize } = useAuth();
  const { toast } = useToast();
  const {
    hasRebalanceAccess,
    hasOpportunityAgentAccess,
    hasAdditionalProviderAccess,
    canUseLiveTrading,
    canUseAutoTrading,
    canUseNearLimitAnalysis
  } = useRBAC();

  const [saved, setSaved] = useState(false);
  const [savingTab, setSavingTab] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || "providers");
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState("");
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
  const [authChecking, setAuthChecking] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Form state

  // AI Provider configurations - Default AI is always first, additional providers follow
  const [aiProviders, setAiProviders] = useState<Array<{ id: string, nickname: string, provider: string, apiKey: string }>>([]);

  // Default AI settings
  const [defaultAiModel, setDefaultAiModel] = useState(apiSettings?.ai_model || 'gpt-4');
  const [defaultCustomModel, setDefaultCustomModel] = useState('');

  // Team-specific settings - now storing provider IDs instead of provider names
  const [researchDebateRounds, setResearchDebateRounds] = useState(apiSettings?.research_debate_rounds || 2);
  const [analysisTeamProviderId, setAnalysisTeamProviderId] = useState('1'); // Default to first provider
  const [analysisTeamModel, setAnalysisTeamModel] = useState(apiSettings?.analysis_team_model || 'gpt-4');
  const [analysisCustomModel, setAnalysisCustomModel] = useState('');
  const [researchTeamProviderId, setResearchTeamProviderId] = useState('1'); // Default to first provider
  const [researchTeamModel, setResearchTeamModel] = useState(apiSettings?.research_team_model || 'gpt-4');
  const [researchCustomModel, setResearchCustomModel] = useState('');
  const [tradingTeamProviderId, setTradingTeamProviderId] = useState('1'); // Default to first provider
  const [tradingTeamModel, setTradingTeamModel] = useState(apiSettings?.trading_team_model || 'gpt-4');
  const [tradingCustomModel, setTradingCustomModel] = useState('');
  const [riskTeamProviderId, setRiskTeamProviderId] = useState('1'); // Default to first provider
  const [riskTeamModel, setRiskTeamModel] = useState(apiSettings?.risk_team_model || 'gpt-4');
  const [riskCustomModel, setRiskCustomModel] = useState('');

  // Analysis optimization settings (for all analysis agents)
  const [analysisOptimization, setAnalysisOptimization] = useState((apiSettings as any)?.analysis_optimization || 'speed');
  const [analysisSearchSources, setAnalysisSearchSources] = useState((apiSettings as any)?.analysis_search_sources || 5);

  // Historical data time ranges (separate from opportunity agent)
  const [analysisHistoryDays, setAnalysisHistoryDays] = useState((apiSettings as any)?.analysis_history_days || '1M');

  // Max tokens settings for each workflow step
  const [analysisMaxTokens, setAnalysisMaxTokens] = useState(apiSettings?.analysis_max_tokens || 2000);
  const [researchMaxTokens, setResearchMaxTokens] = useState(apiSettings?.research_max_tokens || 3000);
  const [tradingMaxTokens, setTradingMaxTokens] = useState(apiSettings?.trading_max_tokens || 1500);
  const [riskMaxTokens, setRiskMaxTokens] = useState(apiSettings?.risk_max_tokens || 2000);

  // Rebalance configuration state
  const [rebalanceThreshold, setRebalanceThreshold] = useState(apiSettings?.rebalance_threshold || apiSettings?.default_rebalance_threshold || 10);
  const [rebalanceMinPositionSize, setRebalanceMinPositionSize] = useState(apiSettings?.rebalance_min_position_size || 2); // Default 2%
  const [rebalanceMaxPositionSize, setRebalanceMaxPositionSize] = useState(apiSettings?.rebalance_max_position_size || 25); // Default 25%
  const [nearPositionThreshold, setNearPositionThreshold] = useState(apiSettings?.near_position_threshold || 20); // Default 20%
  const [targetStockAllocation, setTargetStockAllocation] = useState(apiSettings?.target_stock_allocation || 80);
  const [targetCashAllocation, setTargetCashAllocation] = useState(apiSettings?.target_cash_allocation || 20);

  // Portfolio Manager settings
  const [portfolioManagerProviderId, setPortfolioManagerProviderId] = useState('1');
  const [portfolioManagerModel, setPortfolioManagerModel] = useState(apiSettings?.portfolio_manager_model || 'gpt-4');
  const [portfolioManagerCustomModel, setPortfolioManagerCustomModel] = useState('');
  const [portfolioManagerMaxTokens, setPortfolioManagerMaxTokens] = useState(apiSettings?.portfolio_manager_max_tokens || 2000);

  // Opportunity Agent settings
  const [opportunityAgentProviderId, setOpportunityAgentProviderId] = useState('1');
  const [opportunityAgentModel, setOpportunityAgentModel] = useState(apiSettings?.opportunity_agent_model || 'gpt-4');
  const [opportunityCustomModel, setOpportunityCustomModel] = useState('');
  const [opportunityMaxTokens, setOpportunityMaxTokens] = useState(apiSettings?.opportunity_max_tokens || 2000);
  const [opportunityMarketRange, setOpportunityMarketRange] = useState(apiSettings?.opportunity_market_range || '1M');

  // Trading settings
  const [alpacaPaperApiKey, setAlpacaPaperApiKey] = useState(apiSettings?.alpaca_paper_api_key || '');
  const [alpacaPaperSecretKey, setAlpacaPaperSecretKey] = useState(apiSettings?.alpaca_paper_secret_key || '');
  const [alpacaLiveApiKey, setAlpacaLiveApiKey] = useState(apiSettings?.alpaca_live_api_key || '');
  const [alpacaLiveSecretKey, setAlpacaLiveSecretKey] = useState(apiSettings?.alpaca_live_secret_key || '');
  const [alpacaPaperTrading, setAlpacaPaperTrading] = useState(apiSettings?.alpaca_paper_trading ?? true);
  const [autoExecuteTrades, setAutoExecuteTrades] = useState(apiSettings?.auto_execute_trades ?? false);
  const [autoNearLimitAnalysis, setAutoNearLimitAnalysis] = useState(apiSettings?.auto_near_limit_analysis ?? false);
  const [userRiskLevel, setUserRiskLevel] = useState(apiSettings?.user_risk_level || 'moderate');
  const [defaultPositionSizeDollars, setDefaultPositionSizeDollars] = useState(apiSettings?.default_position_size_dollars || 1000);
  const [profitTarget, setProfitTarget] = useState(apiSettings?.profit_target || 25);
  const [stopLoss, setStopLoss] = useState(apiSettings?.stop_loss || 10);
  const [nearLimitThreshold, setNearLimitThreshold] = useState(apiSettings?.near_limit_threshold || 20);

  // Track if initial load is complete to prevent re-loading
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [teamSettingsLoaded, setTeamSettingsLoaded] = useState(false);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Debug: Check authentication state - only run when auth state changes
  useEffect(() => {
    console.log('Settings page - Auth state:', {
      isAuthenticated,
      user: user?.id,
      hasApiSettings: !!apiSettings,
      isLoading
    });

    // If authenticated but no user data and not loading, initialize again
    if (isAuthenticated && !user && !isLoading) {
      console.log('Authenticated but no user data, initializing...');
      initialize();
    }
  }, [isAuthenticated, user?.id, isLoading]); // Only depend on auth state, not the full objects

  // Check configured providers when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      checkConfiguredProviders().then(result => {
        setConfiguredProviders(result.configured);
      });
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    // Load settings when apiSettings changes - but only on initial load
    if (apiSettings && !initialLoadComplete) {
      console.log('Loading settings from apiSettings...', { hasApiSettings: !!apiSettings, isAuthenticated });
      console.log('Full apiSettings object:', JSON.stringify(apiSettings, null, 2));

      // Check specific fields
      console.log('analysis_optimization value:', (apiSettings as any).analysis_optimization);
      console.log('analysis_history_days value:', (apiSettings as any).analysis_history_days);

      // Analysis optimization settings
      const analysisOpt = (apiSettings as any).analysis_optimization;
      console.log('Settings useEffect - analysis_optimization:', {
        fromApiSettings: analysisOpt,
        currentState: analysisOptimization,
        willSetTo: analysisOpt || 'speed'
      });
      if (analysisOpt !== undefined) {
        setAnalysisOptimization(analysisOpt || 'speed');
      }

      const searchSources = (apiSettings as any)?.analysis_search_sources;
      if (searchSources !== undefined) {
        setAnalysisSearchSources(searchSources || 5);
      }

      // Historical data time ranges
      const historyDays = (apiSettings as any).analysis_history_days;
      console.log('Settings useEffect - analysis_history_days:', {
        fromApiSettings: historyDays,
        currentState: analysisHistoryDays,
        willSetTo: historyDays || '1M'
      });
      if (historyDays !== undefined) {
        setAnalysisHistoryDays(historyDays || '1M');
      }

      // Load all other settings once to avoid overwriting user changes
      // Default settings (ai_provider is handled by provider configuration loading)

      // Check if the default model is a custom one (not in the preset list)
      const savedDefaultModel = apiSettings.ai_model || 'gpt-4';
      const availableModels = getModelOptions(apiSettings.ai_provider || 'openrouter');
      console.log('Loading default model:', {
        savedModel: savedDefaultModel,
        provider: apiSettings.ai_provider,
        availableModels: availableModels,
        isCustom: !availableModels.includes(savedDefaultModel)
      });

      if (savedDefaultModel && !availableModels.includes(savedDefaultModel)) {
        setDefaultAiModel('custom');
        setDefaultCustomModel(savedDefaultModel);
        console.log('Set as custom model:', savedDefaultModel);
      } else {
        setDefaultAiModel(savedDefaultModel);
        setDefaultCustomModel(''); // Clear custom model if using preset
      }

      // Non-credential settings from apiSettings
      setAlpacaPaperTrading(apiSettings.alpaca_paper_trading ?? true);
      setAutoExecuteTrades(apiSettings.auto_execute_trades ?? false);
      setAutoNearLimitAnalysis(apiSettings.auto_near_limit_analysis ?? false);
      setUserRiskLevel(apiSettings.user_risk_level || 'moderate');
      setDefaultPositionSizeDollars(apiSettings.default_position_size_dollars || 1000);

      // Position management preferences
      setProfitTarget(apiSettings.profit_target || 25);
      setStopLoss(apiSettings.stop_loss || 10);
      setNearLimitThreshold(apiSettings.near_limit_threshold || 20);
      setNearPositionThreshold(apiSettings.near_position_threshold || 20);

      // Team-specific settings
      setResearchDebateRounds(apiSettings.research_debate_rounds || 2);

      // NOTE: Team provider IDs will be set after providers are loaded (see separate useEffect below)

      // Max tokens settings
      setAnalysisMaxTokens(apiSettings.analysis_max_tokens || 2000);
      setResearchMaxTokens(apiSettings.research_max_tokens || 3000);
      setTradingMaxTokens(apiSettings.trading_max_tokens || 1500);
      setRiskMaxTokens(apiSettings.risk_max_tokens || 2000);

      // Rebalance settings
      setRebalanceThreshold(apiSettings.rebalance_threshold || apiSettings.default_rebalance_threshold || 10);
      setRebalanceMinPositionSize(apiSettings.rebalance_min_position_size || 2); // 2% default
      setRebalanceMaxPositionSize(apiSettings.rebalance_max_position_size || 25); // 25% default
      setTargetStockAllocation(apiSettings.target_stock_allocation || 80);
      setTargetCashAllocation(apiSettings.target_cash_allocation || 20);

      // Portfolio Manager settings
      setPortfolioManagerModel(apiSettings.portfolio_manager_model || 'gpt-4');
      setPortfolioManagerMaxTokens(apiSettings.portfolio_manager_max_tokens || 2000);

      // Opportunity Agent settings will be loaded after providers are loaded
      setOpportunityMaxTokens(apiSettings.opportunity_max_tokens || 2000);
      setOpportunityMarketRange(apiSettings.opportunity_market_range || '1M');

      // Mark initial load as complete and reset team settings loaded flag
      setInitialLoadComplete(true);
      setTeamSettingsLoaded(false); // Reset so team settings can be loaded
    }
  }, [apiSettings, initialLoadComplete]); // Only runs when apiSettings first becomes available


  const handleSaveTab = async (tab: string) => {
    console.log(`Save button clicked for tab: ${tab}`);
    setSavingTab(tab);

    try {
      // Skip session check since we already have the user from useAuth
      if (!user || !user.id) {
        console.error('No user in auth state');
        setErrors({ save: 'You must be logged in to save settings.' });
        return;
      }

      console.log('Using user from auth state:', user.id);

      let settingsToSave: Partial<ApiSettings> = {};

      // Helper function to get provider info
      const getProviderInfo = (providerId: string) => {
        // Check if it's the Default AI provider
        if (providerId === '1' || providerId === defaultProviderId) {
          // Return the default provider info from api_settings
          return {
            provider: apiSettings?.ai_provider || 'openrouter',
            apiKey: apiSettings?.ai_api_key || ''
          };
        }

        // Otherwise look for it in the additional providers
        const provider = aiProviders.find(p => p.id === providerId);
        if (!provider) {
          return { provider: null, apiKey: null };
        }
        return { provider: provider.provider, apiKey: provider.apiKey };
      };

      if (tab === 'providers') {
        // Save provider settings
        const newErrors: Record<string, string> = {};

        // Validate that all providers have required fields
        for (const provider of aiProviders) {
          if (!provider.provider) {
            newErrors[`provider_${provider.id}`] = 'Provider selection is required';
          }
          if (!provider.apiKey) {
            newErrors[`provider_${provider.id}`] = 'API key is required';
          }
        }

        // Validate default provider's custom model if selected
        if (defaultAiModel === 'custom' && !defaultCustomModel) {
          newErrors.default_custom_model = 'Custom model name is required for default provider';
        }

        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          return;
        }

        // Build settings object
        settingsToSave = {};

        // Save each provider
        for (let index = 0; index < aiProviders.length; index++) {
          const provider = aiProviders[index];
          if (provider.provider && provider.apiKey && provider.nickname) {
            // Let the backend handle validation and masking logic
            // Always save the Default AI provider (ID '1') to api_settings via settings-proxy
            if (provider.id === '1') {
              settingsToSave.ai_provider = provider.provider as any;
              // Update API key via settings-proxy
              if (provider.apiKey) {
                settingsToSave.ai_api_key = provider.apiKey;
              }
              // Don't save nickname for default AI provider (no column in database)
              settingsToSave.ai_model = defaultAiModel === 'custom' ? defaultCustomModel : (defaultAiModel || getModelOptions(provider.provider)[0]);
            } else {
              // Save additional providers via settings-proxy for masking support
              try {
                const { data: saveData, error: saveError } = await supabase.functions.invoke('settings-proxy', {
                  body: {
                    action: 'save_provider_configuration',
                    provider: {
                      id: provider.id !== '1' ? provider.id : undefined, // Don't pass ID for new providers
                      nickname: provider.nickname,
                      provider: provider.provider,
                      api_key: provider.apiKey,
                      is_default: false
                    }
                  }
                });

                if (saveError || !saveData.success) {
                  console.error('Error saving provider via proxy:', saveError);
                  // Fallback to direct save
                  const saved = await supabaseHelpers.saveProviderConfiguration(user.id, {
                    nickname: provider.nickname,
                    provider: provider.provider,
                    api_key: provider.apiKey,
                    is_default: false
                  });

                  if (!saved) {
                    settingsToSave[`${provider.provider}_api_key`] = provider.apiKey;
                    console.warn(`Note: Nickname "${provider.nickname}" for ${provider.provider} cannot be saved without the provider_configurations table`);
                  }
                } else {
                  // Update local provider state with masked API key
                  setAiProviders(prev => prev.map(p =>
                    p.id === provider.id ? { ...p, apiKey: saveData.configuration.api_key } : p
                  ));
                }
              } catch (saveError) {
                console.error('Error saving provider configuration via proxy:', saveError);
                // Fallback to direct save
                const saved = await supabaseHelpers.saveProviderConfiguration(user.id, {
                  nickname: provider.nickname,
                  provider: provider.provider,
                  api_key: provider.apiKey,
                  is_default: false
                });

                if (!saved) {
                  settingsToSave[`${provider.provider}_api_key`] = provider.apiKey;
                  console.warn(`Note: Nickname "${provider.nickname}" for ${provider.provider} cannot be saved without the provider_configurations table`);
                }
              }
            }
          }
        }

        // Check if we need to show migration warning
        let needsMigration = false;
        for (const provider of aiProviders) {
          if (provider.id !== '1' && provider.apiKey) {
            // Check if this provider was saved successfully
            const saved = await supabaseHelpers.getProviderConfigurations(user.id);
            if (saved.length === 0) {
              needsMigration = true;
              break;
            }
          }
        }

        if (needsMigration) {
          console.warn('Database migration required for full provider functionality');
          setErrors({
            ...errors,
            migration: 'Note: Additional providers saved with limited functionality. To enable custom nicknames and multiple providers of the same type, run: npx supabase db push --project-ref lnvjsqyvhczgxvygbqer'
          });
        }

        // Use settings-proxy to save provider credentials with masking
        try {
          const { data, error } = await supabase.functions.invoke('settings-proxy', {
            body: {
              action: 'update_settings',
              settings: settingsToSave
            }
          });

          if (error) throw error;

          if (data.success) {
            // Update the local state with the masked values returned from the proxy
            if (data.settings) {
              // Update the first provider (Default AI) with masked credentials
              if (aiProviders.length > 0 && aiProviders[0].id === '1') {
                setAiProviders(prev => prev.map(p =>
                  p.id === '1' ? { ...p, apiKey: data.settings.ai_api_key || '' } : p
                ));
              }
            }

            toast({
              title: "Success",
              description: "Provider settings saved successfully!",
              variant: "default",
            });
            setErrors({});
            console.log('Provider settings saved successfully via proxy');
            return; // Exit early since we handled the save
          } else {
            throw new Error(data.error || 'Failed to save settings');
          }
        } catch (proxyError: any) {
          console.error('Error saving provider via settings-proxy:', proxyError);

          // Extract error message from FunctionsHttpError
          let errorMessage = 'Failed to save provider settings';
          if (proxyError?.name === 'FunctionsHttpError' && proxyError?.context) {
            try {
              const responseData = await proxyError.context.json();
              errorMessage = responseData?.error || responseData?.message || errorMessage;
            } catch {
              errorMessage = proxyError.message || errorMessage;
            }
          } else if (proxyError?.message) {
            errorMessage = proxyError.message;
          }

          // Show error to user
          toast({
            title: "Provider Settings Error",
            description: errorMessage,
            variant: "destructive",
          });

          // Don't fall back to direct save - show the error instead
          throw new Error(errorMessage);
        }

      } else if (tab === 'agents') {
        // Save agent configuration
        // Validate custom model names are provided when 'custom' is selected
        const newErrors: Record<string, string> = {};

        if (analysisTeamModel === 'custom' && !analysisCustomModel) {
          newErrors.analysis_custom_model = 'Custom model name is required';
        }
        if (researchTeamModel === 'custom' && !researchCustomModel) {
          newErrors.research_custom_model = 'Custom model name is required';
        }
        if (tradingTeamModel === 'custom' && !tradingCustomModel) {
          newErrors.trading_custom_model = 'Custom model name is required';
        }
        if (riskTeamModel === 'custom' && !riskCustomModel) {
          newErrors.risk_custom_model = 'Custom model name is required';
        }
        if (portfolioManagerModel === 'custom' && !portfolioManagerCustomModel) {
          newErrors.portfolio_custom_model = 'Custom model name is required';
        }

        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          return;
        }

        // For now, we'll map provider IDs back to provider names for backward compatibility
        // In a future update, we'll modify the Edge Functions to use provider configurations

        const analysisProvider = getProviderInfo(analysisTeamProviderId);
        const researchProvider = getProviderInfo(researchTeamProviderId);
        const tradingProvider = getProviderInfo(tradingTeamProviderId);
        const riskProvider = getProviderInfo(riskTeamProviderId);
        const portfolioManagerProvider = getProviderInfo(portfolioManagerProviderId);


        // Debug logging
        console.log('All AI Providers:', aiProviders);
        console.log('All AI Providers (detailed):', JSON.stringify(aiProviders, null, 2));
        console.log('Provider IDs:', {
          analysisTeamProviderId,
          researchTeamProviderId,
          tradingTeamProviderId,
          riskTeamProviderId,
          portfolioManagerProviderId
        });
        console.log('Provider Info:', {
          analysisProvider,
          researchProvider,
          tradingProvider,
          riskProvider,
          portfolioManagerProvider
        });

        // Helper to get model value
        const getModelValue = (teamProviderId: string, teamModel: string, customModel: string) => {
          if (teamProviderId === defaultProviderId) {
            // Using default provider, use its model
            const model = defaultAiModel === 'custom' ? defaultCustomModel : defaultAiModel;
            return model || null;
          }
          // Using specific provider
          if (teamModel === 'custom') return customModel || null;
          return teamModel || null;
        };

        settingsToSave = {
          research_debate_rounds: researchDebateRounds,
          analysis_team_ai: analysisProvider.provider,
          analysis_team_model: getModelValue(analysisTeamProviderId, analysisTeamModel, analysisCustomModel),
          // Save provider IDs - use null for the default provider (ID "1")
          analysis_team_provider_id: analysisTeamProviderId === '1' ? null : analysisTeamProviderId,
          research_team_ai: researchProvider.provider,
          research_team_model: getModelValue(researchTeamProviderId, researchTeamModel, researchCustomModel),
          research_team_provider_id: researchTeamProviderId === '1' ? null : researchTeamProviderId,
          trading_team_ai: tradingProvider.provider,
          trading_team_model: getModelValue(tradingTeamProviderId, tradingTeamModel, tradingCustomModel),
          trading_team_provider_id: tradingTeamProviderId === '1' ? null : tradingTeamProviderId,
          risk_team_ai: riskProvider.provider,
          risk_team_model: getModelValue(riskTeamProviderId, riskTeamModel, riskCustomModel),
          risk_team_provider_id: riskTeamProviderId === '1' ? null : riskTeamProviderId,
          // Portfolio Manager settings
          portfolio_manager_ai: portfolioManagerProvider.provider,
          portfolio_manager_model: getModelValue(portfolioManagerProviderId, portfolioManagerModel, portfolioManagerCustomModel),
          portfolio_manager_provider_id: portfolioManagerProviderId === '1' ? null : portfolioManagerProviderId,
          portfolio_manager_max_tokens: portfolioManagerMaxTokens,
          // Analysis customization
          analysis_optimization: analysisOptimization,
          analysis_search_sources: analysisSearchSources,
          analysis_history_days: analysisHistoryDays, // Separate time range for analysis agents
          // Max tokens for each workflow step
          analysis_max_tokens: analysisMaxTokens,
          research_max_tokens: researchMaxTokens,
          trading_max_tokens: tradingMaxTokens,
          risk_max_tokens: riskMaxTokens
        };

        console.log('Settings to save (before API keys):', settingsToSave);

        // DO NOT include API keys when saving agent configurations
        // API keys should only be saved from the Providers tab
        // This prevents the "Rejecting suspicious masked credential" error
        // The agent teams will use the API keys from provider_configurations table
      } else if (tab === 'trading') {
        // Check if credentials have actually changed by comparing with backend masked values
        const { data: changeCheckData, error: changeCheckError } = await supabase.functions.invoke('settings-proxy', {
          body: {
            action: 'check_credentials_changed',
            alpacaPaperApiKey,
            alpacaPaperSecretKey,
            alpacaLiveApiKey,
            alpacaLiveSecretKey
          }
        });

        if (changeCheckError) {
          toast({
            title: 'Validation Error',
            description: 'Could not check if credentials changed',
            variant: 'destructive'
          });
          return;
        }

        const { shouldValidatePaper, shouldValidateLive } = changeCheckData;
        let validationFailed = false;

        // Validate Paper Trading credentials if they have changed
        if (shouldValidatePaper) {
          const paperValidation = await validateCredential('alpaca_paper', alpacaPaperApiKey, undefined, alpacaPaperSecretKey);
          if (!paperValidation.valid) {
            toast({
              title: 'Paper Trading Validation Failed',
              description: paperValidation.message,
              variant: 'destructive'
            });
            validationFailed = true;
          } else {
            toast({
              title: 'Paper Trading Validated',
              description: 'Alpaca paper trading credentials are valid and working',
            });
          }
        } else if (alpacaPaperApiKey && alpacaPaperSecretKey) {
          console.log('Paper trading credentials unchanged, skipping validation');
        }

        // Validate Live Trading credentials if they have changed
        if (shouldValidateLive) {
          const liveValidation = await validateCredential('alpaca_live', alpacaLiveApiKey, undefined, alpacaLiveSecretKey);
          if (!liveValidation.valid) {
            toast({
              title: 'Live Trading Validation Failed',
              description: liveValidation.message,
              variant: 'destructive'
            });
            validationFailed = true;
          } else {
            toast({
              title: 'Live Trading Validated',
              description: 'Alpaca live trading credentials are valid and working',
            });
          }
        } else if (alpacaLiveApiKey && alpacaLiveSecretKey) {
          console.log('Live trading credentials unchanged, skipping validation');
        }


        // If validation failed, stop here
        if (validationFailed) {
          return;
        }

        // Trading settings - use settings-proxy for credential masking
        settingsToSave = {
          alpaca_paper_api_key: alpacaPaperApiKey,
          alpaca_paper_secret_key: alpacaPaperSecretKey,
          alpaca_live_api_key: alpacaLiveApiKey,
          alpaca_live_secret_key: alpacaLiveSecretKey,
          alpaca_paper_trading: alpacaPaperTrading,
          auto_execute_trades: autoExecuteTrades,
          auto_near_limit_analysis: autoNearLimitAnalysis,
          user_risk_level: userRiskLevel,
          default_position_size_dollars: defaultPositionSizeDollars,
          profit_target: profitTarget,
          stop_loss: stopLoss,
          near_limit_threshold: nearLimitThreshold
        };

        // Use settings-proxy to save with credential masking
        try {
          const { data, error } = await supabase.functions.invoke('settings-proxy', {
            body: {
              action: 'update_settings',
              settings: settingsToSave
            }
          });

          if (error) throw error;

          if (data.success) {
            // Update the local state with the masked values returned from the proxy
            if (data.settings) {
              setAlpacaPaperApiKey(data.settings.alpaca_paper_api_key || '');
              setAlpacaPaperSecretKey(data.settings.alpaca_paper_secret_key || '');
              setAlpacaLiveApiKey(data.settings.alpaca_live_api_key || '');
              setAlpacaLiveSecretKey(data.settings.alpaca_live_secret_key || '');
            }

            toast({
              title: "Success",
              description: "Trading settings saved successfully!",
              variant: "default",
            });
            setErrors({});
            console.log('Trading settings saved successfully via proxy');
            return; // Exit early since we handled the save
          } else {
            throw new Error(data.error || 'Failed to save settings');
          }
        } catch (proxyError: any) {
          console.error('Error saving via settings-proxy:', proxyError);

          // Extract error message from FunctionsHttpError
          let errorMessage = 'Failed to save trading settings';
          if (proxyError?.name === 'FunctionsHttpError' && proxyError?.context) {
            try {
              const responseData = await proxyError.context.json();
              errorMessage = responseData?.error || responseData?.message || errorMessage;
            } catch {
              errorMessage = proxyError.message || errorMessage;
            }
          } else if (proxyError?.message) {
            errorMessage = proxyError.message;
          }

          // Show error to user
          toast({
            title: "Trading Settings Error",
            description: errorMessage,
            variant: "destructive",
          });

          // Don't fall back to direct save - show the error instead
          throw new Error(errorMessage);
        }
      } else if (tab === 'rebalance') {
        // Rebalance settings - use same logic as agent config tab
        // Validate custom model name if 'custom' is selected
        const newErrors: Record<string, string> = {};

        if (opportunityAgentModel === 'custom' && !opportunityCustomModel) {
          newErrors.opportunity_custom_model = 'Custom model name is required';
        }

        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          return;
        }

        const opportunityAgentProvider = getProviderInfo(opportunityAgentProviderId);


        // Helper to get model value - same as agent config tab
        const getModelValue = (teamProviderId: string, teamModel: string, customModel: string) => {
          if (teamProviderId === defaultProviderId || teamProviderId === '1') {
            // Using default provider, use its model
            const model = defaultAiModel === 'custom' ? defaultCustomModel : defaultAiModel;
            return model || null;
          }
          // Using specific provider
          if (teamModel === 'custom') return customModel || null;
          return teamModel || null;
        };

        // Debug logging
        console.log('Opportunity Agent Saving:', {
          providerId: opportunityAgentProviderId,
          provider: opportunityAgentProvider,
          model: getModelValue(opportunityAgentProviderId, opportunityAgentModel, opportunityCustomModel),
          maxTokens: opportunityMaxTokens
        });

        settingsToSave = {
          rebalance_threshold: rebalanceThreshold,
          rebalance_min_position_size: rebalanceMinPositionSize,
          rebalance_max_position_size: rebalanceMaxPositionSize,
          near_position_threshold: nearPositionThreshold,
          target_stock_allocation: targetStockAllocation,
          target_cash_allocation: targetCashAllocation,
          opportunity_market_range: opportunityMarketRange,
          // Opportunity agent configuration - exactly like portfolio manager and other agents
          opportunity_agent_ai: opportunityAgentProvider.provider,
          opportunity_agent_model: getModelValue(opportunityAgentProviderId, opportunityAgentModel, opportunityCustomModel),
          opportunity_max_tokens: opportunityMaxTokens,
          opportunity_agent_provider_id: opportunityAgentProviderId === '1' ? null : opportunityAgentProviderId,
        };

        // DO NOT include API keys when saving rebalance configurations
        // API keys should only be saved from the Providers tab
        // This prevents the "Rejecting suspicious masked credential" error
      }

      console.log(`Settings to save for ${tab}:`, settingsToSave);

      // Validate settings before saving
      if (tab === 'agents') {
        // Check if any null providers are being saved
        const nullProviders = [];
        if (!settingsToSave.analysis_team_ai) nullProviders.push('Analysis Team');
        if (!settingsToSave.research_team_ai) nullProviders.push('Research Team');
        if (!settingsToSave.trading_team_ai) nullProviders.push('Trading Team');
        if (!settingsToSave.risk_team_ai) nullProviders.push('Risk Team');

        if (nullProviders.length > 0) {
          console.error('Null providers detected:', nullProviders);
          setErrors({
            save: `Please configure providers first. Missing providers for: ${nullProviders.join(', ')}`
          });
          return;
        }
      }

      // Use updateApiSettings from auth store which handles all the complexity
      await updateApiSettings(settingsToSave);

      // Show success toast based on tab
      let successMessage = 'Settings saved successfully!';
      switch (tab) {
        case 'agents':
          successMessage = 'Agent configuration saved successfully!';
          break;
        case 'rebalance':
          successMessage = 'Rebalance configuration saved successfully!';
          break;
        default:
          successMessage = 'Settings saved successfully!';
      }

      toast({
        title: "Success",
        description: successMessage,
        variant: "default",
      });
      setErrors({});

      console.log('Settings saved successfully');

      // Don't force reload - it resets the form and prevents editing
      // The auth context will update naturally when needed
    } catch (error) {
      console.error(`Error saving ${tab} settings:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      toast({
        title: "Error",
        description: `Failed to save ${tab} settings: ${errorMessage}`,
        variant: "destructive",
      });

      setErrors({ save: `Failed to save ${tab} settings: ${errorMessage}` });
    } finally {
      setSavingTab(null);
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getModelOptions = (provider: string) => {
    switch (provider) {
      case 'openai':
        return ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'custom'];
      case 'anthropic':
        return ['claude-opus-4-1-20250805', 'claude-opus-4-20250514', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-haiku-20241022', 'custom'];
      case 'google':
        return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'custom'];
      case 'deepseek':
        return ['deepseek-chat', 'custom'];
      case 'openrouter':
        return [
          'x-ai/grok-code-fast-1',
          'x-ai/grok-4',
          'openai/gpt-5-chat',
          'openai/gpt-5',
          'openai/gpt-5-mini',
          'google/gemini-2.5-flash-lite',
          'google/gemini-2.5-flash',
          'google/gemini-2.5-pro',
          'anthropic/claude-opus-4.1',
          'anthropic/claude-opus-4',
          'anthropic/claude-sonnet-4',
          'anthropic/claude-3.7-sonnet',
          'deepseek/deepseek-chat-v3.1',
          'deepseek/deepseek-v3.1-base',
          'qwen/qwen3-max',
          'custom'
        ];
      default:
        return ['custom'];
    }
  };

  const getConfiguredProviders = () => {
    // Return all configured providers (Default AI is always first)
    return aiProviders
      .filter(p => p.apiKey && p.apiKey.trim() !== '' && p.nickname && p.nickname.trim() !== '')
      .map(p => ({ id: p.id, nickname: p.nickname, provider: p.provider }));
  };

  const addAiProvider = () => {
    const newId = Date.now().toString();
    // Count total providers (excluding the default one at index 0) and add 1
    const providerNumber = aiProviders.length;
    const defaultNickname = `Provider ${providerNumber}`;
    setAiProviders([...aiProviders, { id: newId, nickname: defaultNickname, provider: 'openrouter', apiKey: '' }]);
  };

  const updateAiProvider = (id: string, field: 'nickname' | 'provider' | 'apiKey', value: string) => {
    setAiProviders(aiProviders.map(p =>
      p.id === id ? { ...p, [field]: value } : p
    ));
  };

  const removeAiProvider = async (id: string) => {
    // Don't allow removing the default provider
    if (id === '1') {
      setErrorDialogMessage('Cannot remove the Default AI provider');
      setErrorDialogOpen(true);
      return;
    }

    const provider = aiProviders.find(p => p.id === id);
    if (!provider || !user?.id) return;

    // Check if this provider is assigned to any teams
    const teamsUsingProvider: string[] = [];
    if (analysisTeamProviderId === id) teamsUsingProvider.push('Analysis Team');
    if (researchTeamProviderId === id) teamsUsingProvider.push('Research Team');
    if (tradingTeamProviderId === id) teamsUsingProvider.push('Trading Team');
    if (riskTeamProviderId === id) teamsUsingProvider.push('Risk Team');
    if (portfolioManagerProviderId === id) teamsUsingProvider.push('Portfolio Manager');
    if (opportunityAgentProviderId === id) teamsUsingProvider.push('Opportunity Agent');

    if (teamsUsingProvider.length > 0) {
      setErrorDialogMessage(
        `Cannot delete provider "${provider.nickname}" because it's assigned to: ${teamsUsingProvider.join(', ')}. Please unassign it first.`
      );
      setErrorDialogOpen(true);
      return;
    }

    try {
      // Delete from database if it exists there
      if (id !== '1') {
        const deleted = await supabaseHelpers.deleteProviderConfiguration(user.id, provider.nickname);
        if (!deleted) {
          console.warn('Provider configuration not found in database, removing from local state only');
        }
      }

      // Remove from local state
      setAiProviders(aiProviders.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error removing provider:', error);
      setErrorDialogMessage('Failed to remove provider. It may be in use by agent teams.');
      setErrorDialogOpen(true);
    }
  };

  // Clear all provider settings
  const handleClearProviders = async () => {
    if (!user?.id) return;

    try {
      setSavingTab('providers');

      // Clear all provider settings - only set fields that exist in api_settings table
      const clearedSettings = {
        ai_provider: 'openrouter', // Keep a default provider to satisfy required field
        ai_api_key: '',  // Use empty string instead of null
        ai_model: 'gpt-4',
      };

      const { data, error } = await supabase.functions.invoke('settings-proxy', {
        body: {
          action: 'update_settings',
          settings: clearedSettings
        }
      });

      if (error) throw error;

      // Also clear additional provider configurations
      if (aiProviders.length > 1) {
        // Delete all non-default providers from database
        for (const provider of aiProviders.slice(1)) {
          if (provider.id !== '1') {
            await supabaseHelpers.deleteProviderConfiguration(user.id, provider.nickname);
          }
        }
      }

      // Clear local state
      setAiProviders([{ id: '1', nickname: 'Default AI', provider: 'openrouter', apiKey: '' }]);
      setDefaultAiModel('gpt-4');
      setDefaultCustomModel('');

      // Reload settings from backend to refresh auth context
      await checkConfiguredProviders();
      await loadProviderConfigurations();

      toast({
        title: "Provider settings cleared",
        description: "All provider API keys have been removed.",
      });

    } catch (error) {
      console.error('Error clearing provider settings:', error);
      toast({
        title: "Error clearing settings",
        description: "Failed to clear provider settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingTab(null);
    }
  };

  // Clear all trading settings
  const handleClearTrading = async () => {
    if (!user?.id) return;

    try {
      setSavingTab('trading');

      // Clear all trading settings - use empty strings for API keys
      const clearedSettings = {
        alpaca_paper_api_key: '',
        alpaca_paper_secret_key: '',
        alpaca_live_api_key: '',
        alpaca_live_secret_key: '',
        alpaca_paper_trading: true,
        auto_execute_trades: false,
        auto_near_limit_analysis: false,
        user_risk_level: 'moderate',
        default_position_size_dollars: 1000,
        profit_target: 25,
        stop_loss: 10,
        near_limit_threshold: 20,
      };

      const { data, error } = await supabase.functions.invoke('settings-proxy', {
        body: {
          action: 'update_settings',
          settings: clearedSettings
        }
      });

      if (error) throw error;

      // Clear local state
      setAlpacaPaperApiKey('');
      setAlpacaPaperSecretKey('');
      setAlpacaLiveApiKey('');
      setAlpacaLiveSecretKey('');
      setAlpacaPaperTrading(true);
      setAutoExecuteTrades(false);
      setAutoNearLimitAnalysis(false);
      setUserRiskLevel('moderate');
      setDefaultPositionSizeDollars(1000);
      setProfitTarget(25);
      setStopLoss(10);
      setNearLimitThreshold(20);

      // Reload settings from backend to refresh auth context
      await checkConfiguredProviders();
      await loadMaskedTradingCredentials();

      toast({
        title: "Trading settings cleared",
        description: "All Alpaca credentials have been removed and settings reset to defaults.",
      });

    } catch (error) {
      console.error('Error clearing trading settings:', error);
      toast({
        title: "Error clearing settings",
        description: "Failed to clear trading settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingTab(null);
    }
  };

  // Get the default provider ID (first provider in the list)
  const defaultProviderId = aiProviders.length > 0 ? aiProviders[0].id : '1';

  const loadProviderConfigurations = async () => {
    if (!user?.id) return;

    try {
      const providers: AiProvider[] = [];

      // Get masked settings from settings-proxy
      let maskedSettings = null;
      try {
        const { data, error } = await supabase.functions.invoke('settings-proxy', {
          body: {
            action: 'get_settings'
          }
        });

        if (!error && data.settings) {
          maskedSettings = data.settings;
        }
      } catch (proxyError) {
        console.error('Error loading masked settings:', proxyError);
      }

      // Always add the default provider first - use masked settings as source of truth
      if (maskedSettings?.ai_provider || apiSettings?.ai_provider) {
        providers.push({
          id: '1',
          nickname: 'Default AI', // Fixed nickname for default provider
          provider: maskedSettings?.ai_provider || apiSettings?.ai_provider || 'openrouter',
          apiKey: maskedSettings?.ai_api_key || ''
        });
      } else {
        // Empty default provider
        providers.push({
          id: '1',
          nickname: 'Default AI', // Fixed nickname for default provider
          provider: 'openrouter',
          apiKey: ''
        });
      }

      // Load default model information from masked settings
      if (maskedSettings?.ai_model) {
        const savedDefaultModel = maskedSettings.ai_model;
        const providerType = maskedSettings.ai_provider || 'openrouter';
        const availableModels = getModelOptions(providerType);

        console.log('Loading default model from masked settings:', {
          savedModel: savedDefaultModel,
          provider: providerType,
          availableModels: availableModels,
          isCustom: !availableModels.includes(savedDefaultModel)
        });

        if (savedDefaultModel && !availableModels.includes(savedDefaultModel)) {
          setDefaultAiModel('custom');
          setDefaultCustomModel(savedDefaultModel);
        } else {
          setDefaultAiModel(savedDefaultModel);
          setDefaultCustomModel(''); // Clear custom model if using preset
        }
      }

      // Fetch additional provider configurations from settings-proxy (with masking)
      let configurations = [];
      try {
        const { data: configData, error: configError } = await supabase.functions.invoke('settings-proxy', {
          body: {
            action: 'get_provider_configurations'
          }
        });

        if (!configError && configData.configurations) {
          configurations = configData.configurations;
        }
      } catch (configError) {
        console.error('Error loading provider configurations via proxy:', configError);
        // Fallback to direct database access
        configurations = await supabaseHelpers.getProviderConfigurations(user.id);
      }

      if (configurations.length > 0) {
        // Add configurations (excluding default) with masked API keys
        configurations
          .filter(config => !config.is_default)
          .forEach((config) => {
            providers.push({
              id: config.id,
              nickname: config.nickname,
              provider: config.provider,
              apiKey: config.api_key // Already masked by settings-proxy
            });
          });
      }

      setAiProviders(providers);
    } catch (error) {
      console.error('Error loading provider configurations:', error);
      // Fall back to empty default provider
      setAiProviders([{ id: '1', nickname: 'Default AI', provider: 'openai', apiKey: '' }]);
    }
  };

  const loadMaskedTradingCredentials = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase.functions.invoke('settings-proxy', {
        body: {
          action: 'get_settings'
        }
      });

      if (!error && data.settings) {
        // Update trading credentials with masked values
        setAlpacaPaperApiKey(data.settings.alpaca_paper_api_key || '');
        setAlpacaPaperSecretKey(data.settings.alpaca_paper_secret_key || '');
        setAlpacaLiveApiKey(data.settings.alpaca_live_api_key || '');
        setAlpacaLiveSecretKey(data.settings.alpaca_live_secret_key || '');
      }
    } catch (error) {
      console.error('Error loading masked trading credentials:', error);
    }
  };

  // Check authentication on mount - simplified since auth restoration is now automatic
  useEffect(() => {
    const checkAuth = () => {
      console.log('Settings page - checking auth state...');

      // Since auth restoration is now automatic, we just need to wait briefly for it to complete
      if (isAuthenticated) {
        console.log('Settings page - user is authenticated');
        setAuthChecking(false);
        setSessionChecked(true);
      } else if (!isLoading) {
        console.log('Settings page - not authenticated and not loading, redirecting...');
        navigate('/');
      } else {
        console.log('Settings page - still loading auth, waiting...');
        // Try again in a moment
        setTimeout(checkAuth, 500);
      }
    };

    // Small delay to allow auth restoration to complete
    setTimeout(checkAuth, 100);
  }, [isAuthenticated, isLoading, navigate]); // React to auth state changes

  // Monitor auth state changes after initial check
  useEffect(() => {
    // Don't redirect during initial auth checking or if session hasn't been checked yet
    if (!authChecking && sessionChecked && !isLoading && !isAuthenticated) {
      console.log('Lost authentication, redirecting to home...');
      navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate, authChecking, sessionChecked]);

  // Load team provider IDs after providers are loaded
  useEffect(() => {
    if (!apiSettings || aiProviders.length === 0) return;

    // Don't reload if we've already loaded the team settings and user is just saving
    if (teamSettingsLoaded) {
      console.log('Team settings already loaded, skipping reload');
      return;
    }

    console.log('Loading team provider IDs with providers:', aiProviders);
    console.log('Provider details (formatted):', JSON.stringify(aiProviders.map(p => ({
      id: p.id,
      nickname: p.nickname,
      provider: p.provider,
      hasApiKey: !!p.apiKey
    })), null, 2));
    console.log('Looking for teams:', {
      analysis: apiSettings.analysis_team_ai,
      research: apiSettings.research_team_ai,
      trading: apiSettings.trading_team_ai,
      risk: apiSettings.risk_team_ai,
      portfolio: apiSettings.portfolio_manager_ai
    });

    // Map team providers to provider IDs
    // This is tricky because we only save the provider type (e.g., "openrouter") not which specific configuration
    const findProviderIdByName = (providerName: string | null, savedApiKey?: string | null) => {
      if (!providerName) return '1'; // Default to first provider

      // If we have a saved API key, try to find the provider with that exact key
      if (savedApiKey) {
        const providerWithKey = aiProviders.find(p =>
          p.provider === providerName && p.apiKey === savedApiKey
        );
        if (providerWithKey) {
          console.log(`Found provider by API key match for ${providerName}:`, providerWithKey);
          return providerWithKey.id;
        }
      }

      // Check if it matches the default AI provider (ID '1')
      const defaultProvider = aiProviders.find(p => p.id === '1');
      if (defaultProvider && defaultProvider.provider === providerName) {
        // If the saved provider is the same type as default, prefer default
        // unless we have evidence it's a different one (different API key)
        if (!savedApiKey || savedApiKey === defaultProvider.apiKey) {
          return '1';
        }
        // Different API key, look for another provider of the same type
        const otherProvider = aiProviders.find(p => p.id !== '1' && p.provider === providerName);
        if (otherProvider) {
          console.log(`Found alternative ${providerName} provider:`, otherProvider);
          return otherProvider.id;
        }
      }

      // Not the default provider, find any matching provider
      const provider = aiProviders.find(p => p.provider === providerName);
      console.log(`Finding provider ID for ${providerName}:`, provider);

      // If we found a matching provider, use it. Otherwise default to '1'
      return provider ? provider.id : '1';
    };

    // Set Analysis Team (use provider ID if available and valid, otherwise fallback to name matching)
    let analysisProviderId = apiSettings.analysis_team_provider_id;
    if (!analysisProviderId) {
      // If null, check if it should be the default provider
      if (apiSettings.analysis_team_ai === apiSettings.ai_provider) {
        analysisProviderId = '1';
      } else {
        analysisProviderId = findProviderIdByName(apiSettings.analysis_team_ai, apiSettings.analysis_team_model);
      }
    } else if (!aiProviders.find(p => p.id === analysisProviderId)) {
      console.log(`Saved analysis provider ID ${analysisProviderId} not found in current providers, falling back to name matching`);
      analysisProviderId = findProviderIdByName(apiSettings.analysis_team_ai, apiSettings.analysis_team_model);
    }
    setAnalysisTeamProviderId(analysisProviderId);
    const analysisModel = apiSettings.analysis_team_model || 'gpt-4';
    if (analysisModel && !getModelOptions(apiSettings.analysis_team_ai || 'openai').includes(analysisModel)) {
      setAnalysisTeamModel('custom');
      setAnalysisCustomModel(analysisModel);
    } else {
      setAnalysisTeamModel(analysisModel);
    }

    // Set Research Team (use provider ID if available and valid, otherwise fallback to name matching)
    let researchProviderId = apiSettings.research_team_provider_id;
    if (!researchProviderId) {
      if (apiSettings.research_team_ai === apiSettings.ai_provider) {
        researchProviderId = '1';
      } else {
        researchProviderId = findProviderIdByName(apiSettings.research_team_ai);
      }
    } else if (!aiProviders.find(p => p.id === researchProviderId)) {
      console.log(`Saved research provider ID ${researchProviderId} not found in current providers, falling back to name matching`);
      researchProviderId = findProviderIdByName(apiSettings.research_team_ai);
    }
    setResearchTeamProviderId(researchProviderId);
    const researchModel = apiSettings.research_team_model || 'gpt-4';
    if (researchModel && !getModelOptions(apiSettings.research_team_ai || 'openai').includes(researchModel)) {
      setResearchTeamModel('custom');
      setResearchCustomModel(researchModel);
    } else {
      setResearchTeamModel(researchModel);
    }

    // Set Trading Team (use provider ID if available and valid, otherwise fallback to name matching)
    let tradingProviderId = apiSettings.trading_team_provider_id;
    if (!tradingProviderId) {
      if (apiSettings.trading_team_ai === apiSettings.ai_provider) {
        tradingProviderId = '1';
      } else {
        tradingProviderId = findProviderIdByName(apiSettings.trading_team_ai);
      }
    } else if (!aiProviders.find(p => p.id === tradingProviderId)) {
      console.log(`Saved trading provider ID ${tradingProviderId} not found in current providers, falling back to name matching`);
      tradingProviderId = findProviderIdByName(apiSettings.trading_team_ai);
    }
    setTradingTeamProviderId(tradingProviderId);
    const tradingModel = apiSettings.trading_team_model || 'gpt-4';
    if (tradingModel && !getModelOptions(apiSettings.trading_team_ai || 'openai').includes(tradingModel)) {
      setTradingTeamModel('custom');
      setTradingCustomModel(tradingModel);
    } else {
      setTradingTeamModel(tradingModel);
    }

    // Set Risk Team (use provider ID if available and valid, otherwise fallback to name matching)
    let riskProviderId = apiSettings.risk_team_provider_id;
    if (!riskProviderId) {
      if (apiSettings.risk_team_ai === apiSettings.ai_provider) {
        riskProviderId = '1';
      } else {
        riskProviderId = findProviderIdByName(apiSettings.risk_team_ai);
      }
    } else if (!aiProviders.find(p => p.id === riskProviderId)) {
      console.log(`Saved risk provider ID ${riskProviderId} not found in current providers, falling back to name matching`);
      riskProviderId = findProviderIdByName(apiSettings.risk_team_ai);
    }
    setRiskTeamProviderId(riskProviderId);
    const riskModel = apiSettings.risk_team_model || 'gpt-4';
    if (riskModel && !getModelOptions(apiSettings.risk_team_ai || 'openai').includes(riskModel)) {
      setRiskTeamModel('custom');
      setRiskCustomModel(riskModel);
    } else {
      setRiskTeamModel(riskModel);
    }

    // Set Portfolio Manager
    let portfolioManagerProviderIdValue = '1';
    if (apiSettings.portfolio_manager_ai) {
      portfolioManagerProviderIdValue = findProviderIdByName(apiSettings.portfolio_manager_ai);
      setPortfolioManagerProviderId(portfolioManagerProviderIdValue);
      const pmModel = apiSettings.portfolio_manager_model || 'gpt-4';
      if (pmModel && !getModelOptions(apiSettings.portfolio_manager_ai || 'openai').includes(pmModel)) {
        setPortfolioManagerModel('custom');
        setPortfolioManagerCustomModel(pmModel);
      } else {
        setPortfolioManagerModel(pmModel);
      }
    }

    // Set Opportunity Agent (use provider ID if available, otherwise fallback to name matching)
    let opportunityProviderId = apiSettings.opportunity_agent_provider_id;
    if (!opportunityProviderId) {
      // If null, check if it should be the default provider
      if (apiSettings.opportunity_agent_ai === apiSettings.ai_provider) {
        opportunityProviderId = '1';
      } else {
        // Try to find provider by matching API key if available
        const savedApiKey = apiSettings[`${apiSettings.opportunity_agent_ai}_api_key`];
        opportunityProviderId = findProviderIdByName(apiSettings.opportunity_agent_ai, savedApiKey);
      }
    } else if (!aiProviders.find(p => p.id === opportunityProviderId)) {
      console.log(`Saved opportunity provider ID ${opportunityProviderId} not found in current providers, falling back to name matching`);
      const savedApiKey = apiSettings[`${apiSettings.opportunity_agent_ai}_api_key`];
      opportunityProviderId = findProviderIdByName(apiSettings.opportunity_agent_ai, savedApiKey);
    }
    setOpportunityAgentProviderId(opportunityProviderId);
    const opportunityModel = apiSettings.opportunity_agent_model || 'gpt-4';
    if (opportunityModel && !getModelOptions(apiSettings.opportunity_agent_ai || 'openai').includes(opportunityModel)) {
      setOpportunityAgentModel('custom');
      setOpportunityCustomModel(opportunityModel);
    } else {
      setOpportunityAgentModel(opportunityModel);
    }

    console.log('Team provider IDs set:', {
      analysis: analysisProviderId,
      research: researchProviderId,
      trading: tradingProviderId,
      risk: riskProviderId,
      portfolioManager: portfolioManagerProviderIdValue,
      opportunity: opportunityProviderId
    });

    // Mark that we've loaded the team settings
    setTeamSettingsLoaded(true);
  }, [apiSettings, aiProviders, teamSettingsLoaded]); // Run when either apiSettings or aiProviders changes

  // Load provider configurations after authentication
  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;
    loadProviderConfigurations();
  }, [user?.id, isAuthenticated]);

  // Load masked trading credentials after authentication
  useEffect(() => {
    if (!user?.id || !isAuthenticated) return;
    loadMaskedTradingCredentials();
  }, [user?.id, isAuthenticated]);

  // Helper to get the actual default model value
  const getDefaultModelValue = () => {
    if (defaultAiModel === 'custom') {
      return defaultCustomModel || 'gpt-4';
    }
    return defaultAiModel || 'gpt-4';
  };

  // Auto-set model to default AI's model when Default AI is selected
  useEffect(() => {
    if (analysisTeamProviderId === defaultProviderId) {
      const model = getDefaultModelValue();
      setAnalysisTeamModel(model);
    }
  }, [analysisTeamProviderId, defaultProviderId, defaultAiModel, defaultCustomModel]);

  useEffect(() => {
    if (researchTeamProviderId === defaultProviderId) {
      const model = getDefaultModelValue();
      setResearchTeamModel(model);
    }
  }, [researchTeamProviderId, defaultProviderId, defaultAiModel, defaultCustomModel]);

  useEffect(() => {
    if (tradingTeamProviderId === defaultProviderId) {
      const model = getDefaultModelValue();
      setTradingTeamModel(model);
    }
  }, [tradingTeamProviderId, defaultProviderId, defaultAiModel, defaultCustomModel]);

  useEffect(() => {
    if (riskTeamProviderId === defaultProviderId) {
      const model = getDefaultModelValue();
      setRiskTeamModel(model);
    }
  }, [riskTeamProviderId, defaultProviderId, defaultAiModel, defaultCustomModel]);

  useEffect(() => {
    if (portfolioManagerProviderId === defaultProviderId) {
      const model = getDefaultModelValue();
      setPortfolioManagerModel(model);
    }
  }, [portfolioManagerProviderId, defaultProviderId, defaultAiModel, defaultCustomModel]);

  useEffect(() => {
    if (opportunityAgentProviderId === defaultProviderId) {
      const model = getDefaultModelValue();
      setOpportunityAgentModel(model);
    }
  }, [opportunityAgentProviderId, defaultProviderId, defaultAiModel, defaultCustomModel]);

  // Show loading state while checking authentication
  if (authChecking || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated after checks, don't render the page
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Configure your API keys and trading preferences
          </p>

          {/* Debug section */}
          {!user && (
            <Alert className="mt-4 border-orange-500">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <span>User data not loaded. You may need to refresh.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => initialize()}
                  >
                    Reload User Data
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[700px] lg:mx-auto">
            <TabsTrigger value="providers" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Providers
            </TabsTrigger>
            <TabsTrigger value="agents" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Agent Config
            </TabsTrigger>
            <TabsTrigger value="rebalance" className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Rebalance
            </TabsTrigger>
            <TabsTrigger value="trading" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Trading
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="space-y-6">
            <ProvidersTab
              aiProviders={aiProviders}
              defaultAiModel={defaultAiModel}
              defaultCustomModel={defaultCustomModel}
              showKeys={showKeys}
              errors={errors}
              saved={saved}
              activeTab={activeTab}
              isSaving={savingTab === 'providers'}
              updateAiProvider={updateAiProvider}
              setDefaultAiModel={setDefaultAiModel}
              setDefaultCustomModel={setDefaultCustomModel}
              toggleShowKey={toggleShowKey}
              addAiProvider={addAiProvider}
              removeAiProvider={removeAiProvider}
              handleSaveTab={handleSaveTab}
              handleClearProviders={handleClearProviders}
              getModelOptions={getModelOptions}
              hasAdditionalProviderAccess={hasAdditionalProviderAccess()}
            />
          </TabsContent>

          <TabsContent value="agents" className="space-y-6">
            {console.log('Settings passing to AgentsTab:', {
              analysisOptimization,
              analysisHistoryDays,
              apiSettingsHasData: !!apiSettings,
              apiSettingsValues: {
                optimization: (apiSettings as any)?.analysis_optimization,
                historyDays: (apiSettings as any)?.analysis_history_days
              }
            })}
            <AgentsTab
              aiProviders={aiProviders}
              researchDebateRounds={researchDebateRounds}
              analysisTeamProviderId={analysisTeamProviderId}
              analysisTeamModel={analysisTeamModel}
              analysisCustomModel={analysisCustomModel}
              researchTeamProviderId={researchTeamProviderId}
              researchTeamModel={researchTeamModel}
              researchCustomModel={researchCustomModel}
              tradingTeamProviderId={tradingTeamProviderId}
              tradingTeamModel={tradingTeamModel}
              tradingCustomModel={tradingCustomModel}
              riskTeamProviderId={riskTeamProviderId}
              riskTeamModel={riskTeamModel}
              riskCustomModel={riskCustomModel}
              portfolioManagerProviderId={portfolioManagerProviderId}
              portfolioManagerModel={portfolioManagerModel}
              portfolioManagerCustomModel={portfolioManagerCustomModel}
              analysisOptimization={analysisOptimization}
              analysisSearchSources={analysisSearchSources}
              analysisHistoryDays={analysisHistoryDays}
              analysisMaxTokens={analysisMaxTokens}
              researchMaxTokens={researchMaxTokens}
              tradingMaxTokens={tradingMaxTokens}
              riskMaxTokens={riskMaxTokens}
              portfolioManagerMaxTokens={portfolioManagerMaxTokens}
              defaultAiModel={defaultAiModel}
              defaultCustomModel={defaultCustomModel}
              saved={saved}
              activeTab={activeTab}
              isSaving={savingTab === 'agents'}
              setResearchDebateRounds={setResearchDebateRounds}
              setAnalysisTeamProviderId={setAnalysisTeamProviderId}
              setAnalysisTeamModel={setAnalysisTeamModel}
              setAnalysisCustomModel={setAnalysisCustomModel}
              setResearchTeamProviderId={setResearchTeamProviderId}
              setResearchTeamModel={setResearchTeamModel}
              setResearchCustomModel={setResearchCustomModel}
              setTradingTeamProviderId={setTradingTeamProviderId}
              setTradingTeamModel={setTradingTeamModel}
              setTradingCustomModel={setTradingCustomModel}
              setRiskTeamProviderId={setRiskTeamProviderId}
              setRiskTeamModel={setRiskTeamModel}
              setRiskCustomModel={setRiskCustomModel}
              setPortfolioManagerProviderId={setPortfolioManagerProviderId}
              setPortfolioManagerModel={setPortfolioManagerModel}
              setPortfolioManagerCustomModel={setPortfolioManagerCustomModel}
              setAnalysisOptimization={setAnalysisOptimization}
              setAnalysisSearchSources={setAnalysisSearchSources}
              setAnalysisHistoryDays={setAnalysisHistoryDays}
              setAnalysisMaxTokens={setAnalysisMaxTokens}
              setResearchMaxTokens={setResearchMaxTokens}
              setTradingMaxTokens={setTradingMaxTokens}
              setRiskMaxTokens={setRiskMaxTokens}
              setPortfolioManagerMaxTokens={setPortfolioManagerMaxTokens}
              handleSaveTab={handleSaveTab}
              getModelOptions={getModelOptions}
              getConfiguredProviders={getConfiguredProviders}
              getDefaultModelValue={getDefaultModelValue}
              hasAgentConfigAccess={hasAdditionalProviderAccess()}
            />
          </TabsContent>

          <TabsContent value="rebalance" className="space-y-6">
            <RebalanceTab
              aiProviders={aiProviders}
              rebalanceThreshold={rebalanceThreshold}
              rebalanceMinPositionSize={rebalanceMinPositionSize}
              rebalanceMaxPositionSize={rebalanceMaxPositionSize}
              nearPositionThreshold={nearPositionThreshold}
              targetStockAllocation={targetStockAllocation}
              targetCashAllocation={targetCashAllocation}
              opportunityAgentProviderId={opportunityAgentProviderId}
              opportunityAgentModel={opportunityAgentModel}
              opportunityCustomModel={opportunityCustomModel}
              opportunityMaxTokens={opportunityMaxTokens}
              opportunityMarketRange={opportunityMarketRange}
              defaultAiModel={defaultAiModel}
              defaultCustomModel={defaultCustomModel}
              saved={saved}
              activeTab={activeTab}
              errors={errors}
              isSaving={savingTab === 'rebalance'}
              setRebalanceThreshold={setRebalanceThreshold}
              setRebalanceMinPositionSize={setRebalanceMinPositionSize}
              setRebalanceMaxPositionSize={setRebalanceMaxPositionSize}
              setNearPositionThreshold={setNearPositionThreshold}
              setTargetStockAllocation={setTargetStockAllocation}
              setTargetCashAllocation={setTargetCashAllocation}
              setOpportunityAgentProviderId={setOpportunityAgentProviderId}
              setOpportunityAgentModel={setOpportunityAgentModel}
              setOpportunityCustomModel={setOpportunityCustomModel}
              setOpportunityMaxTokens={setOpportunityMaxTokens}
              setOpportunityMarketRange={setOpportunityMarketRange}
              handleSaveTab={handleSaveTab}
              getModelOptions={getModelOptions}
              getConfiguredProviders={getConfiguredProviders}
              getDefaultModelValue={getDefaultModelValue}
              hasOpportunityAgentAccess={hasOpportunityAgentAccess()}
              hasRebalanceAccess={hasRebalanceAccess()}
            />
          </TabsContent>

          <TabsContent value="trading" className="space-y-6">
            <TradingTab
              alpacaPaperApiKey={alpacaPaperApiKey}
              alpacaPaperSecretKey={alpacaPaperSecretKey}
              alpacaLiveApiKey={alpacaLiveApiKey}
              alpacaLiveSecretKey={alpacaLiveSecretKey}
              alpacaPaperTrading={alpacaPaperTrading}
              autoExecuteTrades={autoExecuteTrades}
              autoNearLimitAnalysis={autoNearLimitAnalysis}
              userRiskLevel={userRiskLevel}
              defaultPositionSizeDollars={defaultPositionSizeDollars}
              profitTarget={profitTarget}
              stopLoss={stopLoss}
              nearLimitThreshold={nearLimitThreshold}
              configuredProviders={configuredProviders}
              showKeys={showKeys}
              saved={saved}
              activeTab={activeTab}
              isSaving={savingTab === 'trading'}
              setAlpacaPaperApiKey={setAlpacaPaperApiKey}
              setAlpacaPaperSecretKey={setAlpacaPaperSecretKey}
              setAlpacaLiveApiKey={setAlpacaLiveApiKey}
              setAlpacaLiveSecretKey={setAlpacaLiveSecretKey}
              setAlpacaPaperTrading={setAlpacaPaperTrading}
              setAutoExecuteTrades={setAutoExecuteTrades}
              setAutoNearLimitAnalysis={setAutoNearLimitAnalysis}
              setUserRiskLevel={setUserRiskLevel}
              setDefaultPositionSizeDollars={setDefaultPositionSizeDollars}
              setProfitTarget={setProfitTarget}
              setStopLoss={setStopLoss}
              setNearLimitThreshold={setNearLimitThreshold}
              toggleShowKey={toggleShowKey}
              handleSaveTab={handleSaveTab}
              handleClearTrading={handleClearTrading}
              canUseLiveTrading={canUseLiveTrading()}
              canUseAutoTrading={canUseAutoTrading()}
              canUseNearLimitAnalysis={canUseNearLimitAnalysis()}
            />
          </TabsContent>
        </Tabs>


      </main>

      {/* Error Dialog Modal */}
      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Action Required</AlertDialogTitle>
            <AlertDialogDescription>
              {errorDialogMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setErrorDialogOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
}
