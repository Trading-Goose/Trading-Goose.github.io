import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { 
  Settings, 
  Key, 
  Save, 
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  TrendingUp,
  TrendingDown,
  Bot,
  Plus,
  X,
  Info,
  RefreshCw,
  DollarSign
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabaseHelpers, supabase } from "@/lib/supabase";
import Header from "@/components/Header";
import type { ApiSettings } from "@/lib/supabase";

interface AiProvider {
  id: string;
  nickname: string;
  provider: string;
  apiKey: string;
}

// Helper function to validate credentials via edge function
const validateCredential = async (provider: string, apiKey: string): Promise<{ valid: boolean; message: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('settings-proxy', {
      body: {
        action: 'validate',
        provider,
        apiKey
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
  const { user, apiSettings, updateApiSettings, isAuthenticated, isLoading, initialize } = useAuth();
  
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState("providers");
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState("");
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
  const [authChecking, setAuthChecking] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Form state
  
  // AI Provider configurations - Default AI is always first, additional providers follow
  const [aiProviders, setAiProviders] = useState<Array<{id: string, nickname: string, provider: string, apiKey: string}>>([]);
  
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
  
  // News & Social analysis optimization settings
  const [newsSocialOptimization, setNewsSocialOptimization] = useState(apiSettings?.news_social_optimization || 'normal');
  
  // Historical data time ranges (separate from opportunity agent)
  const [analysisHistoryDays, setAnalysisHistoryDays] = useState(apiSettings?.analysis_history_days || '1M');
  
  // Max tokens settings for each workflow step
  const [analysisMaxTokens, setAnalysisMaxTokens] = useState(apiSettings?.analysis_max_tokens || 2000);
  const [researchMaxTokens, setResearchMaxTokens] = useState(apiSettings?.research_max_tokens || 3000);
  const [tradingMaxTokens, setTradingMaxTokens] = useState(apiSettings?.trading_max_tokens || 1500);
  const [riskMaxTokens, setRiskMaxTokens] = useState(apiSettings?.risk_max_tokens || 2000);
  
  // Rebalance configuration state
  const [rebalanceThreshold, setRebalanceThreshold] = useState(apiSettings?.rebalance_threshold || apiSettings?.default_rebalance_threshold || 10);
  const [rebalanceMinPositionSize, setRebalanceMinPositionSize] = useState(apiSettings?.rebalance_min_position_size || apiSettings?.default_min_position_size || 100);
  const [rebalanceMaxPositionSize, setRebalanceMaxPositionSize] = useState(apiSettings?.rebalance_max_position_size || apiSettings?.default_max_position_size || 10000);
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
  const [orderTypePreference, setOrderTypePreference] = useState(apiSettings?.order_type_preference || 'auto');
  const [userRiskLevel, setUserRiskLevel] = useState(apiSettings?.user_risk_level || 'moderate');
  const [defaultPositionSizeDollars, setDefaultPositionSizeDollars] = useState(apiSettings?.default_position_size_dollars || 1000);

  // Track if initial load is complete to prevent re-loading
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [teamSettingsLoaded, setTeamSettingsLoaded] = useState(false);

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
    // Only load settings once when they first become available
    if (apiSettings && !initialLoadComplete) {
      console.log('Loading initial settings from apiSettings...');
      
      // Default settings (ai_provider is handled by provider configuration loading)
      
      // Check if the default model is a custom one (not in the preset list)
      const savedDefaultModel = apiSettings.ai_model || 'gpt-4';
      const availableModels = getModelOptions(apiSettings.ai_provider || 'openai');
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
      
      // Provider settings
      
      // Load provider configurations (will be done in separate useEffect)
      
      // Trading settings
      setAlpacaPaperApiKey(apiSettings.alpaca_paper_api_key || '');
      setAlpacaPaperSecretKey(apiSettings.alpaca_paper_secret_key || '');
      setAlpacaLiveApiKey(apiSettings.alpaca_live_api_key || '');
      setAlpacaLiveSecretKey(apiSettings.alpaca_live_secret_key || '');
      setAlpacaPaperTrading(apiSettings.alpaca_paper_trading ?? true);
      setAutoExecuteTrades(apiSettings.auto_execute_trades ?? false);
      setOrderTypePreference(apiSettings.order_type_preference || 'auto');
      setUserRiskLevel(apiSettings.user_risk_level || 'moderate');
      setDefaultPositionSizeDollars(apiSettings.default_position_size_dollars || 1000);
      
      // Team-specific settings
      setResearchDebateRounds(apiSettings.research_debate_rounds || 2);
      
      // NOTE: Team provider IDs will be set after providers are loaded (see separate useEffect below)
      
      // News & Social analysis optimization settings
      setNewsSocialOptimization(apiSettings.news_social_optimization || 'normal');
      
      // Historical data time ranges (separate from opportunity agent)
      setAnalysisHistoryDays(apiSettings.analysis_history_days || '1M');
      
      // Max tokens settings
      setAnalysisMaxTokens(apiSettings.analysis_max_tokens || 2000);
      setResearchMaxTokens(apiSettings.research_max_tokens || 3000);
      setTradingMaxTokens(apiSettings.trading_max_tokens || 1500);
      setRiskMaxTokens(apiSettings.risk_max_tokens || 2000);
      
      // Rebalance settings
      setRebalanceThreshold(apiSettings.rebalance_threshold || apiSettings.default_rebalance_threshold || 10);
      setRebalanceMinPositionSize(apiSettings.rebalance_min_position_size || apiSettings.default_min_position_size || 100);
      setRebalanceMaxPositionSize(apiSettings.rebalance_max_position_size || apiSettings.default_max_position_size || 10000);
      setTargetStockAllocation(apiSettings.target_stock_allocation || 80);
      setTargetCashAllocation(apiSettings.target_cash_allocation || 20);
      
      // Portfolio Manager settings
      setPortfolioManagerModel(apiSettings.portfolio_manager_model || 'gpt-4');
      setPortfolioManagerMaxTokens(apiSettings.portfolio_manager_max_tokens || 2000);
      
      // Opportunity Agent settings will be loaded after providers are loaded
      setOpportunityMaxTokens(apiSettings.opportunity_max_tokens || 2000);
      setOpportunityMarketRange(apiSettings.opportunity_market_range || '1M');
      
      // Trade execution settings
      setAutoExecuteTrades(apiSettings.auto_execute_trades || false);
      
      // Mark initial load as complete and reset team settings loaded flag
      setInitialLoadComplete(true);
      setTeamSettingsLoaded(false); // Reset so team settings can be loaded
    }
  }, [apiSettings?.id]); // Only re-run if we get a different apiSettings object


  const handleSaveTab = async (tab: string) => {
    console.log(`Save button clicked for tab: ${tab}`);
    
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
            provider: apiSettings?.ai_provider || 'openai',
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
            // Validate provider via edge function
            let isValid = true;
            if (provider.apiKey) {
              const validation = await validateCredential(provider.provider, provider.apiKey);
              isValid = validation.valid;
              
              if (!isValid) {
                newErrors[`provider_${provider.id}`] = validation.message;
              }
            }
            
            if (isValid) {
              // Always save the Default AI provider (ID '1') to api_settings
              if (provider.id === '1') {
                settingsToSave.ai_provider = provider.provider as any;
                // Update API key
                if (provider.apiKey) {
                  settingsToSave.ai_api_key = provider.apiKey;
                }
                settingsToSave.ai_model = defaultAiModel === 'custom' ? defaultCustomModel : (defaultAiModel || getModelOptions(provider.provider)[0]);
              } else {
                // Save additional providers to provider_configurations table
                if (provider.apiKey) {
                  const saved = await supabaseHelpers.saveProviderConfiguration(user.id, {
                    nickname: provider.nickname,
                    provider: provider.provider,
                    api_key: provider.apiKey,
                    is_default: false
                  });
                } else {
                  // For existing providers without new API key, we need to save again with existing data
                  // Note: The saveProviderConfiguration method handles updates internally
                  const saved = await supabaseHelpers.saveProviderConfiguration(user.id, {
                    nickname: provider.nickname,
                    provider: provider.provider,
                    api_key: provider.apiKey || '', // Keep existing masked key
                    is_default: false
                  });
                }
                
                // Fallback: save to provider-specific columns if table doesn't exist
                if (!saved) {
                  settingsToSave[`${provider.provider}_api_key`] = provider.apiKey;
                  console.warn(`Note: Nickname "${provider.nickname}" for ${provider.provider} cannot be saved without the provider_configurations table`);
                }
              }
            }
          }
        }
        
        if (Object.keys(newErrors).length > 0) {
          setErrors(newErrors);
          return;
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
      } else if (tab === 'agents') {
        // Save agent configuration
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
          portfolio_manager_max_tokens: portfolioManagerMaxTokens,
          // Analysis customization
          news_social_optimization: newsSocialOptimization,
          analysis_history_days: analysisHistoryDays, // Separate time range for analysis agents
          // Max tokens for each workflow step
          analysis_max_tokens: analysisMaxTokens,
          research_max_tokens: researchMaxTokens,
          trading_max_tokens: tradingMaxTokens,
          risk_max_tokens: riskMaxTokens
        };
        
        console.log('Settings to save (before API keys):', settingsToSave);
        
        // Also save the specific API keys for each team
        if (analysisProvider.provider && analysisProvider.apiKey) {
          settingsToSave[`${analysisProvider.provider}_api_key`] = analysisProvider.apiKey;
        }
        if (researchProvider.provider && researchProvider.apiKey) {
          settingsToSave[`${researchProvider.provider}_api_key`] = researchProvider.apiKey;
        }
        if (tradingProvider.provider && tradingProvider.apiKey) {
          settingsToSave[`${tradingProvider.provider}_api_key`] = tradingProvider.apiKey;
        }
        if (riskProvider.provider && riskProvider.apiKey) {
          settingsToSave[`${riskProvider.provider}_api_key`] = riskProvider.apiKey;
        }
        if (portfolioManagerProvider.provider && portfolioManagerProvider.apiKey) {
          settingsToSave[`${portfolioManagerProvider.provider}_api_key`] = portfolioManagerProvider.apiKey;
        }
      } else if (tab === 'trading') {
        // Trading settings
        settingsToSave = {
          alpaca_paper_api_key: alpacaPaperApiKey,
          alpaca_paper_secret_key: alpacaPaperSecretKey,
          alpaca_live_api_key: alpacaLiveApiKey,
          alpaca_live_secret_key: alpacaLiveSecretKey,
          alpaca_paper_trading: alpacaPaperTrading,
          auto_execute_trades: autoExecuteTrades,
          order_type_preference: orderTypePreference,
          user_risk_level: userRiskLevel,
          default_position_size_dollars: defaultPositionSizeDollars
        };
      } else if (tab === 'rebalance') {
        // Rebalance settings - use same logic as agent config tab
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
          // Also save to old columns for backward compatibility
          default_rebalance_threshold: rebalanceThreshold,
          default_min_position_size: rebalanceMinPositionSize,
          default_max_position_size: rebalanceMaxPositionSize,
          target_stock_allocation: targetStockAllocation,
          target_cash_allocation: targetCashAllocation,
          opportunity_market_range: opportunityMarketRange,
          // Opportunity agent configuration - exactly like portfolio manager and other agents
          opportunity_agent_ai: opportunityAgentProvider.provider,
          opportunity_agent_model: getModelValue(opportunityAgentProviderId, opportunityAgentModel, opportunityCustomModel),
          opportunity_max_tokens: opportunityMaxTokens,
          opportunity_agent_provider_id: opportunityAgentProviderId === '1' ? null : opportunityAgentProviderId,
        };
        
        // Also save the specific API key for opportunity agent (same as portfolio manager logic)
        if (opportunityAgentProvider.provider && opportunityAgentProvider.apiKey && opportunityAgentProviderId !== '1') {
          settingsToSave[`${opportunityAgentProvider.provider}_api_key`] = opportunityAgentProvider.apiKey;
        }
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

      setSaved(true);
      setErrors({});
      setTimeout(() => setSaved(false), 3000);
      
      console.log('Settings saved successfully');
      
      // Don't force reload - it resets the form and prevents editing
      // The auth context will update naturally when needed
    } catch (error) {
      console.error(`Error saving ${tab} settings:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setErrors({ save: `Failed to save ${tab} settings: ${errorMessage}` });
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getModelOptions = (provider: string) => {
    switch (provider) {
      case 'openai':
        return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini', 'custom'];
      case 'anthropic':
        return ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022', 'custom'];
      case 'google':
        return ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp', 'custom'];
      case 'deepseek':
        return ['deepseek-chat', 'deepseek-coder', 'custom'];
      case 'openrouter':
        return [
          'openai/gpt-4-turbo', 
          'openai/gpt-4o', 
          'openai/gpt-4o-mini',
          'anthropic/claude-3.5-sonnet',
          'anthropic/claude-3-opus',
          'anthropic/claude-3-haiku',
          'google/gemini-1.5-pro',
          'google/gemini-1.5-flash',
          'google/gemini-2.0-flash-exp:free',
          'meta-llama/llama-3.1-70b-instruct',
          'mistralai/mixtral-8x7b-instruct',
          'deepseek/deepseek-chat',
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
    setAiProviders([...aiProviders, { id: newId, nickname: defaultNickname, provider: 'openai', apiKey: '' }]);
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

  // Get the default provider ID (first provider in the list)
  const defaultProviderId = aiProviders.length > 0 ? aiProviders[0].id : '1';

  const loadProviderConfigurations = async () => {
    if (!user?.id || !apiSettings) return;
    
    try {
      const providers: AiProvider[] = [];
      
      // Always add the default provider first from api_settings
      if (apiSettings.ai_provider && apiSettings.ai_api_key) {
        providers.push({
          id: '1',
          nickname: 'Default AI',
          provider: apiSettings.ai_provider,
          apiKey: apiSettings.ai_api_key
        });
      } else {
        // Empty default provider
        providers.push({
          id: '1',
          nickname: 'Default AI',
          provider: 'openai',
          apiKey: ''
        });
      }
      
      // Fetch additional provider configurations from database
      const configurations = await supabaseHelpers.getProviderConfigurations(user.id);
      
      if (configurations.length > 0) {
        // Add configurations from database (excluding default)
        configurations
          .filter(config => !config.is_default)
          .forEach((config) => {
            providers.push({
              id: config.id,
              nickname: config.nickname,
              provider: config.provider,
              apiKey: config.api_key
            });
          });
      } else {
        // Legacy fallback - check for additional providers in old columns
        if (apiSettings.openai_api_key && apiSettings.ai_provider !== 'openai') {
          providers.push({ id: Date.now().toString() + '1', nickname: 'OpenAI', provider: 'openai', apiKey: apiSettings.openai_api_key });
        }
        if (apiSettings.anthropic_api_key && apiSettings.ai_provider !== 'anthropic') {
          providers.push({ id: Date.now().toString() + '2', nickname: 'Anthropic', provider: 'anthropic', apiKey: apiSettings.anthropic_api_key });
        }
        if (apiSettings.google_api_key && apiSettings.ai_provider !== 'google') {
          providers.push({ id: Date.now().toString() + '3', nickname: 'Google AI', provider: 'google', apiKey: apiSettings.google_api_key });
        }
        if (apiSettings.deepseek_api_key && apiSettings.ai_provider !== 'deepseek') {
          providers.push({ id: Date.now().toString() + '4', nickname: 'DeepSeek', provider: 'deepseek', apiKey: apiSettings.deepseek_api_key });
        }
        if (apiSettings.openrouter_api_key && apiSettings.ai_provider !== 'openrouter') {
          providers.push({ id: Date.now().toString() + '5', nickname: 'OpenRouter', provider: 'openrouter', apiKey: apiSettings.openrouter_api_key });
        }
      }
      
      setAiProviders(providers);
    } catch (error) {
      console.error('Error loading provider configurations:', error);
      // Fall back to empty default provider
      setAiProviders([{ id: '1', nickname: 'Default AI', provider: 'openai', apiKey: '' }]);
    }
  };

  // Check authentication on mount - wait for auth state to be restored
  useEffect(() => {
    const initAuth = async () => {
      console.log('Settings page initializing auth check...');
      
      // First, wait a bit for persisted state to be restored from localStorage
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Then initialize auth to refresh session
      await initialize();
      setSessionChecked(true);
      
      // Give the auth state time to update after session check
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Now we can safely check authentication
      // Can't use useAuth.getState() here since useAuth is destructured as a hook above
      // Use the hook values directly instead
      if (!isAuthenticated && !isLoading) {
        console.log('Not authenticated after session check, redirecting to home...');
        navigate('/');
      } else {
        setAuthChecking(false);
      }
    };
    
    initAuth();
  }, []); // Only run once on mount

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

  // Load provider configurations after initial load
  useEffect(() => {
    if (!user?.id || !apiSettings || !initialLoadComplete) return;
    loadProviderConfigurations();
  }, [user?.id, apiSettings?.id, initialLoadComplete]);

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
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-6 py-8">
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
          </TabsContent>

          <TabsContent value="agents" className="space-y-6">
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
                <Alert className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Each agent team will use your default AI provider unless you assign a specific provider below.
                    Configure additional providers in the Providers tab first.
                  </AlertDescription>
                </Alert>

                {/* Analysis Agent */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold">Analysis Agent</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>AI Provider</Label>
                      <Select value={analysisTeamProviderId} onValueChange={setAnalysisTeamProviderId}>
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
                              className="mt-2"
                              placeholder="Enter custom model name"
                              value={analysisCustomModel}
                              onChange={(e) => setAnalysisCustomModel(e.target.value)}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>News & Social Analysis Optimization</Label>
                      <Select 
                        value={newsSocialOptimization} 
                        onValueChange={setNewsSocialOptimization}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select optimization level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="balanced">Balanced</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Normal=Standard news/social analysis, Balanced=More thorough coverage
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Historical Data Range</Label>
                      <Select 
                        value={analysisHistoryDays} 
                        onValueChange={setAnalysisHistoryDays}
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
                      />
                      <span className="w-16 text-center font-medium">{analysisMaxTokens}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Maximum response tokens for analysis agents (500-8000)
                    </p>
                  </div>
                </div>

                {/* Research Agent */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold">Research Agent</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>AI Provider</Label>
                      <Select value={researchTeamProviderId} onValueChange={setResearchTeamProviderId}>
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
                              className="mt-2"
                              placeholder="Enter custom model name"
                              value={researchCustomModel}
                              onChange={(e) => setResearchCustomModel(e.target.value)}
                            />
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
                      />
                      <span className="w-16 text-center font-medium">{researchMaxTokens}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Maximum response tokens for research agents (500-8000)
                    </p>
                  </div>
                </div>

                {/* Trading Decision Agent */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold">Trading Decision Agent</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>AI Provider</Label>
                      <Select value={tradingTeamProviderId} onValueChange={setTradingTeamProviderId}>
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
                              className="mt-2"
                              placeholder="Enter custom model name"
                              value={tradingCustomModel}
                              onChange={(e) => setTradingCustomModel(e.target.value)}
                            />
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
                      />
                      <span className="w-16 text-center font-medium">{tradingMaxTokens}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Maximum response tokens for trading agent (500-8000)
                    </p>
                  </div>
                </div>

                {/* Risk Management Agent */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold">Risk Management Agent</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>AI Provider</Label>
                      <Select value={riskTeamProviderId} onValueChange={setRiskTeamProviderId}>
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
                              className="mt-2"
                              placeholder="Enter custom model name"
                              value={riskCustomModel}
                              onChange={(e) => setRiskCustomModel(e.target.value)}
                            />
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
                      />
                      <span className="w-16 text-center font-medium">{riskMaxTokens}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Maximum response tokens for risk agents (500-8000)
                    </p>
                  </div>
                </div>

                {/* Portfolio Manager Configuration */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold">Portfolio Manager</h3>
                  <p className="text-sm text-muted-foreground">
                    Analyzes portfolio positions and generates optimal allocation strategy with trade orders
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>AI Provider</Label>
                      <Select value={portfolioManagerProviderId} onValueChange={setPortfolioManagerProviderId}>
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
                              className="mt-2"
                              placeholder="Enter custom model name"
                              value={portfolioManagerCustomModel}
                              onChange={(e) => setPortfolioManagerCustomModel(e.target.value)}
                            />
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
                  {saved && activeTab === 'agents' && (
                    <Alert className="mr-4 w-auto bg-green-50 border-green-200">
                      <Check className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        Agent configuration saved successfully!
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button 
                    onClick={() => handleSaveTab('agents')} 
                    size="lg"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Agent Configuration
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rebalance" className="space-y-6">
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
                {/* Rebalance Settings */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold">Rebalance Settings</h3>
                  
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


                {/* Opportunity Agent Configuration */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold">Opportunity Agent</h3>
                  <p className="text-sm text-muted-foreground">
                    Identifies market opportunities when portfolio is within threshold
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>AI Provider</Label>
                      <Select value={opportunityAgentProviderId} onValueChange={setOpportunityAgentProviderId}>
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
                              className="mt-2"
                              placeholder="Enter custom model name"
                              value={opportunityCustomModel}
                              onChange={(e) => setOpportunityCustomModel(e.target.value)}
                            />
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
                  {saved && activeTab === 'rebalance' && (
                    <Alert className="mr-4 w-auto bg-green-50 border-green-200">
                      <Check className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        Rebalance configuration saved successfully!
                      </AlertDescription>
                    </Alert>
                  )}
                  {errors.save && activeTab === 'rebalance' && (
                    <Alert className="mr-4 w-auto bg-red-50 border-red-200">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <AlertDescription className="text-red-800">
                        {errors.save}
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button 
                    onClick={() => handleSaveTab('rebalance')} 
                    size="lg"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Rebalance Configuration
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trading" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Alpaca Trading Configuration
                </CardTitle>
                <CardDescription>
                  Configure your Alpaca trading credentials
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Information and Trading Mode Toggle Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Getting Started Information */}
                  <div className="rounded-lg border bg-muted/50 p-4">
                    <span className="block text-sm font-medium mb-2">
                      Getting Started
                    </span>
                    <ol className="space-y-1 text-xs text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="font-medium">1.</span>
                        <span>Visit <a href="https://alpaca.markets" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">alpaca.markets</a> and create an account</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-medium">2.</span>
                        <span>Navigate to your dashboard and select API Keys</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="font-medium">3.</span>
                        <span>Generate separate keys for Paper and Live trading</span>
                      </li>
                    </ol>
                  </div>

                  {/* Trading Mode Toggle */}
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-start space-x-3">
                      <div className="flex items-center h-5">
                        <input
                          type="checkbox"
                          id="paper-trading"
                          checked={alpacaPaperTrading}
                          onChange={(e) => setAlpacaPaperTrading(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-2 focus:ring-2 focus:ring-offset-background transition-all cursor-pointer"
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="paper-trading" className="text-base font-medium cursor-pointer leading-none">
                          Use Paper Trading
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Recommended for testing strategies with simulated money
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Trade Execution Settings */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Trade Execution Settings
                  </h3>
                  
                  {/* Order Type Preference */}
                  <div className="space-y-2">
                    <Label htmlFor="order-type">Preferred Order Type</Label>
                    <Select value={orderTypePreference} onValueChange={setOrderTypePreference}>
                      <SelectTrigger id="order-type">
                        <SelectValue placeholder="Select order type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4" />
                            <span>Auto (Recommended)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="share_amount">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            <span>By Share Amount</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="dollar_amount">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span>By Specific Value</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {orderTypePreference === 'auto' && 
                        "Automatically chooses between share and dollar orders based on affordability and fractional share support"
                      }
                      {orderTypePreference === 'share_amount' && 
                        "Orders will specify exact number of shares to buy/sell"
                      }
                      {orderTypePreference === 'dollar_amount' && 
                        "Orders will specify dollar amount to invest (supports fractional shares)"
                      }
                    </p>
                  </div>
                  
                  {/* User Risk Level */}
                  <div className="space-y-2">
                    <Label htmlFor="risk-level">Risk Tolerance Level</Label>
                    <Select value={userRiskLevel} onValueChange={setUserRiskLevel}>
                      <SelectTrigger id="risk-level">
                        <SelectValue placeholder="Select risk level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conservative">
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-blue-500" />
                            <span>Conservative</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="moderate">
                          <div className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-yellow-500" />
                            <span>Moderate (Recommended)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="aggressive">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-red-500" />
                            <span>Aggressive</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {userRiskLevel === 'conservative' && 
                        "Lower position sizes, focuses on capital preservation and steady growth"
                      }
                      {userRiskLevel === 'moderate' && 
                        "Balanced approach between risk and reward, suitable for most investors"
                      }
                      {userRiskLevel === 'aggressive' && 
                        "Larger position sizes, maximizes growth potential with higher risk tolerance"
                      }
                    </p>
                  </div>
                  
                  {/* Default Position Size */}
                  <div className="space-y-2">
                    <Label htmlFor="position-size">Default Position Size</Label>
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <Input
                        id="position-size"
                        type="number"
                        min="100"
                        step="100"
                        value={defaultPositionSizeDollars}
                        onChange={(e) => setDefaultPositionSizeDollars(Number(e.target.value))}
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Base amount in dollars for each trade position. Will be adjusted based on confidence and risk level.
                    </p>
                  </div>
                  
                  {/* Auto-Execute Trade Orders */}
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-start space-x-3">
                      <div className="flex items-center h-5">
                        <input
                          type="checkbox"
                          id="auto-execute"
                          checked={autoExecuteTrades}
                          onChange={(e) => setAutoExecuteTrades(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-2 focus:ring-2 focus:ring-offset-background transition-all cursor-pointer"
                        />
                      </div>
                      <div className="flex-1">
                        <Label htmlFor="auto-execute" className="text-base font-medium cursor-pointer leading-none">
                          Auto-Execute Trade Orders
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          When enabled, approved trade recommendations will be automatically executed without manual confirmation
                        </p>
                        {autoExecuteTrades && (
                          <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                            <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              <span>Auto-execution will use {alpacaPaperTrading ? 'paper' : 'live'} trading mode</span>
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Paper Trading Credentials */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    Paper Trading Credentials
                  </h3>
                  <div className="rounded-lg border bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium">
                        Safe Testing Environment
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Test strategies safely with simulated money. No real funds at risk.
                    </p>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          Paper API Key
                          {configuredProviders.alpaca_paper && (
                            <Badge variant="success" className="text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              Configured
                            </Badge>
                          )}
                        </Label>
                        <div className="relative">
                          <Input
                            type={showKeys.alpacaPaperApiKey ? "text" : "password"}
                            placeholder="Enter your paper trading API key"
                            value={alpacaPaperApiKey}
                            onChange={(e) => setAlpacaPaperApiKey(e.target.value)}
                            className="font-mono text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                            onClick={() => toggleShowKey('alpacaPaperApiKey')}
                          >
                            {showKeys.alpacaPaperApiKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Paper Secret Key</Label>
                        <div className="relative">
                          <Input
                            type={showKeys.alpacaPaperSecretKey ? "text" : "password"}
                            placeholder="Enter your paper trading secret key"
                            value={alpacaPaperSecretKey}
                            onChange={(e) => setAlpacaPaperSecretKey(e.target.value)}
                            className="font-mono text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                            onClick={() => toggleShowKey('alpacaPaperSecretKey')}
                          >
                            {showKeys.alpacaPaperSecretKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Trading Credentials */}
                <div className="space-y-4 p-4 border rounded-lg bg-card">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                    Live Trading Credentials
                  </h3>
                  <div className="rounded-lg border bg-red-500/10 dark:bg-red-500/5 border-red-500/20 dark:border-red-500/10 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                      <span className="text-sm font-medium">
                        Real Money Trading
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      <strong>⚠️ Warning:</strong> These credentials will execute real trades with actual money. Use extreme caution and ensure you understand the risks.
                    </p>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          Live API Key
                          {configuredProviders.alpaca_live && (
                            <Badge variant="success" className="text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              Configured
                            </Badge>
                          )}
                        </Label>
                        <div className="relative">
                          <Input
                            type={showKeys.alpacaLiveApiKey ? "text" : "password"}
                            placeholder="Enter your live trading API key"
                            value={alpacaLiveApiKey}
                            onChange={(e) => setAlpacaLiveApiKey(e.target.value)}
                            className="font-mono text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                            onClick={() => toggleShowKey('alpacaLiveApiKey')}
                          >
                            {showKeys.alpacaLiveApiKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Live Secret Key</Label>
                        <div className="relative">
                          <Input
                            type={showKeys.alpacaLiveSecretKey ? "text" : "password"}
                            placeholder="Enter your live trading secret key"
                            value={alpacaLiveSecretKey}
                            onChange={(e) => setAlpacaLiveSecretKey(e.target.value)}
                            className="font-mono text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                            onClick={() => toggleShowKey('alpacaLiveSecretKey')}
                          >
                            {showKeys.alpacaLiveSecretKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button for Trading Tab */}
                <div className="flex justify-end pt-4">
                  {saved && activeTab === 'trading' && (
                    <Alert className="mr-4 w-auto bg-green-50 border-green-200">
                      <Check className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-800">
                        Trading settings saved successfully!
                      </AlertDescription>
                    </Alert>
                  )}
                  <Button 
                    onClick={() => {
                      console.log('Button clicked - calling handleSaveTab for trading');
                      handleSaveTab('trading').catch(err => {
                        console.error('Error in handleSaveTab:', err);
                      });
                    }} 
                    size="lg"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Trading Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Global Error Alert - only show if not already shown in a specific tab */}
        {errors.save && 
         !(['providers', 'rebalance'].includes(activeTab)) && (
          <div className="mt-4 flex justify-end">
            <Alert className="w-auto bg-red-50 border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {errors.save}
              </AlertDescription>
            </Alert>
          </div>
        )}
        
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
    </div>
  );
}