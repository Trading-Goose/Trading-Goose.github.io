import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
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
    ChevronLeft,
    Database,
    Bot,
    Plus,
    X,
    Info,
    RefreshCw
} from "lucide-react";
import { useAuth, validateOpenAIKey, validateAnthropicKey, validateOpenRouterKey, validateAlphaVantageKey, validateDeepSeekKey, validateGoogleKey } from "@/lib/auth-supabase";
import { supabaseHelpers } from "@/lib/supabase";
import Header from "@/components/Header";
import type { ApiSettings } from "@/lib/supabase";

interface AiProvider {
    id: string;
    nickname: string;
    provider: string;
    apiKey: string;
}

export default function SettingsPage() {
    const navigate = useNavigate();
    const { user, apiSettings, updateApiSettings, isAuthenticated, forceReload } = useAuth();

    const [saved, setSaved] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [activeTab, setActiveTab] = useState("providers");

    // Form state
    const [alphaVantageApiKey, setAlphaVantageApiKey] = useState(apiSettings?.alpha_vantage_api_key || '');

    // AI Provider configurations - start with just the default
    const [aiProviders, setAiProviders] = useState<Array<{ id: string, nickname: string, provider: string, apiKey: string }>>(() => {
        // Initialize with saved providers or just the default
        const providers = [];

        // Add the default provider first
        if (apiSettings?.ai_provider && apiSettings?.ai_api_key) {
            providers.push({
                id: '1',
                nickname: 'Default AI',
                provider: apiSettings.ai_provider,
                apiKey: apiSettings.ai_api_key
            });
        } else {
            providers.push({
                id: '1',
                nickname: 'Default AI',
                provider: 'openai',
                apiKey: ''
            });
        }

        // Add any additional configured providers
        if (apiSettings?.openai_api_key && apiSettings.ai_provider !== 'openai') {
            providers.push({ id: Date.now().toString() + '1', nickname: 'OpenAI', provider: 'openai', apiKey: apiSettings.openai_api_key });
        }
        if (apiSettings?.anthropic_api_key && apiSettings.ai_provider !== 'anthropic') {
            providers.push({ id: Date.now().toString() + '2', nickname: 'Anthropic', provider: 'anthropic', apiKey: apiSettings.anthropic_api_key });
        }
        if (apiSettings?.google_api_key && apiSettings.ai_provider !== 'google') {
            providers.push({ id: Date.now().toString() + '3', nickname: 'Google AI', provider: 'google', apiKey: apiSettings.google_api_key });
        }
        if (apiSettings?.deepseek_api_key && apiSettings.ai_provider !== 'deepseek') {
            providers.push({ id: Date.now().toString() + '4', nickname: 'DeepSeek', provider: 'deepseek', apiKey: apiSettings.deepseek_api_key });
        }
        if (apiSettings?.openrouter_api_key && apiSettings.ai_provider !== 'openrouter') {
            providers.push({ id: Date.now().toString() + '5', nickname: 'OpenRouter', provider: 'openrouter', apiKey: apiSettings.openrouter_api_key });
        }

        return providers.length > 0 ? providers : [{ id: '1', nickname: 'Default AI', provider: 'openai', apiKey: '' }];
    });

    // Default AI settings
    const [defaultAiProvider, setDefaultAiProvider] = useState<string>(apiSettings?.ai_provider || 'openai');
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

    // Analysis depth settings (only analysis_depth is in the database)
    const [analysisDepth, setAnalysisDepth] = useState(apiSettings?.analysis_depth || 3);

    // Historical data time ranges (separate from opportunity agent)
    const [analysisHistoryDays, setAnalysisHistoryDays] = useState(apiSettings?.analysis_history_days || '1M');

    // Max tokens settings for each workflow step
    const [analysisMaxTokens, setAnalysisMaxTokens] = useState(apiSettings?.analysis_max_tokens || 2000);
    const [researchMaxTokens, setResearchMaxTokens] = useState(apiSettings?.research_max_tokens || 3000);
    const [tradingMaxTokens, setTradingMaxTokens] = useState(apiSettings?.trading_max_tokens || 1500);
    const [riskMaxTokens, setRiskMaxTokens] = useState(apiSettings?.risk_max_tokens || 2000);

    // Rebalance configuration state
    const [rebalanceThreshold, setRebalanceThreshold] = useState(apiSettings?.rebalance_threshold || 10);
    const [rebalanceMinPositionSize, setRebalanceMinPositionSize] = useState(apiSettings?.rebalance_min_position_size || 100);
    const [rebalanceMaxPositionSize, setRebalanceMaxPositionSize] = useState(apiSettings?.rebalance_max_position_size || 10000);

    // Rebalance Agent settings
    const [rebalanceAgentProviderId, setRebalanceAgentProviderId] = useState('1');
    const [rebalanceAgentModel, setRebalanceAgentModel] = useState(apiSettings?.rebalance_agent_model || 'gpt-4');
    const [rebalanceCustomModel, setRebalanceCustomModel] = useState('');
    const [rebalanceMaxTokens, setRebalanceMaxTokens] = useState(apiSettings?.rebalance_max_tokens || 2000);

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

    // Track if initial load is complete to prevent re-loading
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);

    // Debug: Check authentication state - only run when auth state changes
    useEffect(() => {
        console.log('Settings page - Auth state:', {
            isAuthenticated,
            user: user?.id,
            hasApiSettings: !!apiSettings
        });

        // If authenticated but no user data, force reload
        if (isAuthenticated && !user) {
            console.log('Authenticated but no user data, forcing reload...');
            forceReload();
        }
    }, [isAuthenticated, user?.id]); // Only depend on auth state, not the full objects

    useEffect(() => {
        // Only load settings once when they first become available
        if (apiSettings && !initialLoadComplete) {
            console.log('Loading initial settings from apiSettings...');

            // Default settings
            setDefaultAiProvider(apiSettings.ai_provider || 'openai');
            setDefaultAiModel(apiSettings.ai_model || 'gpt-4');

            // Provider settings
            setAlphaVantageApiKey(apiSettings.alpha_vantage_api_key || '');

            // Load provider configurations from database or fall back to legacy method
            loadProviderConfigurations();

            // Trading settings
            setAlpacaPaperApiKey(apiSettings.alpaca_paper_api_key || '');
            setAlpacaPaperSecretKey(apiSettings.alpaca_paper_secret_key || '');
            setAlpacaLiveApiKey(apiSettings.alpaca_live_api_key || '');
            setAlpacaLiveSecretKey(apiSettings.alpaca_live_secret_key || '');
            setAlpacaPaperTrading(apiSettings.alpaca_paper_trading ?? true);

            // Team-specific settings
            setResearchDebateRounds(apiSettings.research_debate_rounds || 2);

            // Map team providers to provider IDs
            const findProviderIdByName = (providerName: string | null) => {
                if (!providerName) return '1'; // Default to first provider
                // If the provider name matches the default AI provider, return '1'
                if (providerName === apiSettings.ai_provider && aiProviders.some(p => p.id === '1')) {
                    return '1';
                }
                const provider = aiProviders.find(p => p.provider === providerName);
                return provider ? provider.id : '1';
            };

            setAnalysisTeamProviderId(findProviderIdByName(apiSettings.analysis_team_ai));
            const analysisModel = apiSettings.analysis_team_model || 'gpt-4';
            if (analysisModel && !getModelOptions(apiSettings.analysis_team_ai || 'openai').includes(analysisModel)) {
                setAnalysisTeamModel('custom');
                setAnalysisCustomModel(analysisModel);
            } else {
                setAnalysisTeamModel(analysisModel);
            }

            setResearchTeamProviderId(findProviderIdByName(apiSettings.research_team_ai));
            const researchModel = apiSettings.research_team_model || 'gpt-4';
            if (researchModel && !getModelOptions(apiSettings.research_team_ai || 'openai').includes(researchModel)) {
                setResearchTeamModel('custom');
                setResearchCustomModel(researchModel);
            } else {
                setResearchTeamModel(researchModel);
            }

            setTradingTeamProviderId(findProviderIdByName(apiSettings.trading_team_ai));
            const tradingModel = apiSettings.trading_team_model || 'gpt-4';
            if (tradingModel && !getModelOptions(apiSettings.trading_team_ai || 'openai').includes(tradingModel)) {
                setTradingTeamModel('custom');
                setTradingCustomModel(tradingModel);
            } else {
                setTradingTeamModel(tradingModel);
            }

            setRiskTeamProviderId(findProviderIdByName(apiSettings.risk_team_ai));
            const riskModel = apiSettings.risk_team_model || 'gpt-4';
            if (riskModel && !getModelOptions(apiSettings.risk_team_ai || 'openai').includes(riskModel)) {
                setRiskTeamModel('custom');
                setRiskCustomModel(riskModel);
            } else {
                setRiskTeamModel(riskModel);
            }

            // Analysis depth settings
            setAnalysisDepth(apiSettings.analysis_depth || 3);

            // Historical data time ranges (separate from opportunity agent)
            setAnalysisHistoryDays(apiSettings.analysis_history_days || '1M');

            // Max tokens settings
            setAnalysisMaxTokens(apiSettings.analysis_max_tokens || 2000);
            setResearchMaxTokens(apiSettings.research_max_tokens || 3000);
            setTradingMaxTokens(apiSettings.trading_max_tokens || 1500);
            setRiskMaxTokens(apiSettings.risk_max_tokens || 2000);

            // Rebalance settings
            setRebalanceThreshold(apiSettings.rebalance_threshold || 10);
            setRebalanceMinPositionSize(apiSettings.rebalance_min_position_size || 100);
            setRebalanceMaxPositionSize(apiSettings.rebalance_max_position_size || 10000);

            // Rebalance Agent settings
            setRebalanceAgentProviderId(findProviderIdByName(apiSettings.rebalance_agent_ai));
            const rebalanceModel = apiSettings.rebalance_agent_model || 'gpt-4';
            if (rebalanceModel && !getModelOptions(apiSettings.rebalance_agent_ai || 'openai').includes(rebalanceModel)) {
                setRebalanceAgentModel('custom');
                setRebalanceCustomModel(rebalanceModel);
            } else {
                setRebalanceAgentModel(rebalanceModel);
            }
            setRebalanceMaxTokens(apiSettings.rebalance_max_tokens || 2000);

            // Opportunity Agent settings
            setOpportunityAgentProviderId(findProviderIdByName(apiSettings.opportunity_agent_ai));
            const opportunityModel = apiSettings.opportunity_agent_model || 'gpt-4';
            if (opportunityModel && !getModelOptions(apiSettings.opportunity_agent_ai || 'openai').includes(opportunityModel)) {
                setOpportunityAgentModel('custom');
                setOpportunityCustomModel(opportunityModel);
            } else {
                setOpportunityAgentModel(opportunityModel);
            }
            setOpportunityMaxTokens(apiSettings.opportunity_max_tokens || 2000);
            setOpportunityMarketRange(apiSettings.opportunity_market_range || '1M');

            // Mark initial load as complete
            setInitialLoadComplete(true);
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

            if (tab === 'providers') {
                // Save provider settings
                const newErrors: Record<string, string> = {};

                // Validate Alpha Vantage key
                if (alphaVantageApiKey && !validateAlphaVantageKey(alphaVantageApiKey)) {
                    newErrors.alphaVantageApiKey = 'Invalid Alpha Vantage API key format';
                }

                if (Object.keys(newErrors).length > 0) {
                    setErrors(newErrors);
                    return;
                }

                // Build settings object with finnhub key
                settingsToSave = {
                    alpha_vantage_api_key: alphaVantageApiKey
                };

                // Save each provider to provider_configurations table
                for (let index = 0; index < aiProviders.length; index++) {
                    const provider = aiProviders[index];
                    if (provider.provider && provider.apiKey && provider.nickname) {
                        // Validate provider
                        let isValid = true;
                        switch (provider.provider) {
                            case 'openai':
                                if (!validateOpenAIKey(provider.apiKey)) {
                                    newErrors[`provider_${provider.id}`] = 'Invalid OpenAI API key format';
                                    isValid = false;
                                }
                                break;
                            case 'anthropic':
                                if (!validateAnthropicKey(provider.apiKey)) {
                                    newErrors[`provider_${provider.id}`] = 'Invalid Anthropic API key format';
                                    isValid = false;
                                }
                                break;
                            case 'google':
                                if (!validateGoogleKey(provider.apiKey)) {
                                    newErrors[`provider_${provider.id}`] = 'Invalid Google API key format';
                                    isValid = false;
                                }
                                break;
                            case 'deepseek':
                                if (!validateDeepSeekKey(provider.apiKey)) {
                                    newErrors[`provider_${provider.id}`] = 'Invalid DeepSeek API key format';
                                    isValid = false;
                                }
                                break;
                            case 'openrouter':
                                if (!validateOpenRouterKey(provider.apiKey)) {
                                    newErrors[`provider_${provider.id}`] = 'Invalid OpenRouter API key';
                                    isValid = false;
                                }
                                break;
                        }

                        if (isValid) {
                            // Try to save provider to provider_configurations table
                            const saved = await supabaseHelpers.saveProviderConfiguration(user.id, {
                                nickname: provider.nickname,
                                provider: provider.provider,
                                api_key: provider.apiKey,
                                is_default: provider.id === '1'
                            });

                            // If provider_configurations table doesn't exist, fall back to old method
                            if (!saved) {
                                console.log('Provider configurations table not available, using fallback method');
                                // For default provider (first one), save to api_settings
                                if (index === 0) {
                                    settingsToSave.ai_provider = provider.provider as any;
                                    settingsToSave.ai_api_key = provider.apiKey;
                                    settingsToSave.ai_model = defaultAiModel === 'custom' ? defaultCustomModel : (defaultAiModel || getModelOptions(provider.provider)[0]);
                                } else {
                                    // For additional providers, save to provider-specific columns
                                    // Note: Nicknames cannot be saved in the old schema
                                    settingsToSave[`${provider.provider}_api_key`] = provider.apiKey;
                                    console.warn(`Note: Nickname "${provider.nickname}" for ${provider.provider} cannot be saved without the provider_configurations table`);
                                }
                            } else {
                                // If this is the default provider (first one), also update api_settings for backward compatibility
                                if (provider.id === defaultProviderId) {
                                    settingsToSave.ai_provider = provider.provider as any;
                                    settingsToSave.ai_api_key = provider.apiKey;
                                    settingsToSave.ai_model = defaultAiModel === 'custom' ? defaultCustomModel : (defaultAiModel || getModelOptions(provider.provider)[0]);
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
                const getProviderInfo = (providerId: string) => {
                    const provider = aiProviders.find(p => p.id === providerId);
                    if (!provider) {
                        return { provider: null, apiKey: null };
                    }
                    // For Default AI (first provider), use the actual provider from api_settings
                    const defaultId = aiProviders.length > 0 ? aiProviders[0].id : '1';
                    if (providerId === defaultId && apiSettings) {
                        return {
                            provider: apiSettings.ai_provider || provider.provider,
                            apiKey: apiSettings.ai_api_key || provider.apiKey
                        };
                    }
                    return { provider: provider.provider, apiKey: provider.apiKey };
                };

                const analysisProvider = getProviderInfo(analysisTeamProviderId);
                const researchProvider = getProviderInfo(researchTeamProviderId);
                const tradingProvider = getProviderInfo(tradingTeamProviderId);
                const riskProvider = getProviderInfo(riskTeamProviderId);

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
                    research_team_ai: researchProvider.provider,
                    research_team_model: getModelValue(researchTeamProviderId, researchTeamModel, researchCustomModel),
                    trading_team_ai: tradingProvider.provider,
                    trading_team_model: getModelValue(tradingTeamProviderId, tradingTeamModel, tradingCustomModel),
                    risk_team_ai: riskProvider.provider,
                    risk_team_model: getModelValue(riskTeamProviderId, riskTeamModel, riskCustomModel),
                    // Analysis customization
                    analysis_depth: analysisDepth,
                    analysis_history_days: analysisHistoryDays, // Separate time range for analysis agents
                    // Max tokens for each workflow step
                    analysis_max_tokens: analysisMaxTokens,
                    research_max_tokens: researchMaxTokens,
                    trading_max_tokens: tradingMaxTokens,
                    risk_max_tokens: riskMaxTokens
                };

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
            } else if (tab === 'trading') {
                // Trading settings
                settingsToSave = {
                    alpaca_paper_api_key: alpacaPaperApiKey,
                    alpaca_paper_secret_key: alpacaPaperSecretKey,
                    alpaca_live_api_key: alpacaLiveApiKey,
                    alpaca_live_secret_key: alpacaLiveSecretKey,
                    alpaca_paper_trading: alpacaPaperTrading
                };
            } else if (tab === 'rebalance') {
                // Rebalance settings
                const rebalanceAgentProvider = getProviderInfo(rebalanceAgentProviderId);
                const opportunityAgentProvider = getProviderInfo(opportunityAgentProviderId);

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
                    rebalance_threshold: rebalanceThreshold,
                    rebalance_min_position_size: rebalanceMinPositionSize,
                    rebalance_max_position_size: rebalanceMaxPositionSize,
                    rebalance_agent_ai: rebalanceAgentProvider.provider,
                    rebalance_agent_model: getModelValue(rebalanceAgentProviderId, rebalanceAgentModel, rebalanceCustomModel),
                    rebalance_max_tokens: rebalanceMaxTokens,
                    opportunity_agent_ai: opportunityAgentProvider.provider,
                    opportunity_agent_model: getModelValue(opportunityAgentProviderId, opportunityAgentModel, opportunityCustomModel),
                    opportunity_max_tokens: opportunityMaxTokens,
                    opportunity_market_range: opportunityMarketRange
                };

                // Also save the specific API keys for each agent
                if (rebalanceAgentProvider.provider && rebalanceAgentProvider.apiKey) {
                    settingsToSave[`${rebalanceAgentProvider.provider}_api_key`] = rebalanceAgentProvider.apiKey;
                }
                if (opportunityAgentProvider.provider && opportunityAgentProvider.apiKey) {
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
                return ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3.5-sonnet', 'custom'];
            case 'google':
                return ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro', 'custom'];
            case 'deepseek':
                return ['deepseek-chat', 'deepseek-coder', 'custom'];
            case 'openrouter':
                return ['openai/gpt-4-turbo', 'anthropic/claude-3-opus', 'google/gemini-pro', 'meta-llama/llama-3-70b', 'mistralai/mixtral-8x7b', 'custom'];
            default:
                return ['custom'];
        }
    };

    const getConfiguredProviders = () => {
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
        const provider = aiProviders.find(p => p.id === id);
        if (provider && user?.id) {
            // Delete from database if it exists there
            if (id.startsWith('db-') || id !== '1') {
                await supabaseHelpers.deleteProviderConfiguration(user.id, provider.nickname);
            }
        }
        setAiProviders(aiProviders.filter(p => p.id !== id));
    };

    // Get the default provider ID (first provider in the list)
    const defaultProviderId = aiProviders.length > 0 ? aiProviders[0].id : '1';

    const loadProviderConfigurations = async () => {
        if (!user?.id || !apiSettings) return;

        try {
            // Fetch provider configurations from database
            const configurations = await supabaseHelpers.getProviderConfigurations(user.id);

            // If configurations is empty, fall back to legacy method
            if (configurations.length === 0) {
                console.log('Using legacy provider loading method');
                const providers: AiProvider[] = [];

                // Add the default provider first
                if (apiSettings.ai_provider && apiSettings.ai_api_key) {
                    providers.push({
                        id: '1',
                        nickname: 'Default AI',
                        provider: apiSettings.ai_provider,
                        apiKey: apiSettings.ai_api_key
                    });

                    // Check if default model is custom
                    const defaultModel = apiSettings.ai_model || 'gpt-4';
                    if (defaultModel && !getModelOptions(apiSettings.ai_provider).includes(defaultModel)) {
                        setDefaultAiModel('custom');
                        setDefaultCustomModel(defaultModel);
                    } else {
                        setDefaultAiModel(defaultModel);
                    }
                }

                // Add any additional configured providers from legacy columns
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

                if (providers.length === 0) {
                    providers.push({
                        id: '1',
                        nickname: 'Default AI',
                        provider: apiSettings?.ai_provider || 'openai',
                        apiKey: apiSettings?.ai_api_key || ''
                    });
                }

                setAiProviders(providers);
                return;
            }

            // Use configurations from database
            const providers: AiProvider[] = [];

            // Add configurations from database
            configurations.forEach((config, index) => {
                providers.push({
                    id: config.is_default ? '1' : config.id || `db-${index}`,
                    nickname: config.nickname,
                    provider: config.provider,
                    apiKey: config.api_key
                });
            });

            // If no providers, add default empty one
            if (providers.length === 0) {
                providers.push({ id: '1', nickname: 'Default AI', provider: 'openai', apiKey: '' });
            }

            setAiProviders(providers);
        } catch (error) {
            console.error('Error loading provider configurations:', error);
            // Fall back to empty provider
            setAiProviders([{ id: '1', nickname: 'Default AI', provider: 'openai', apiKey: '' }]);
        }
    };

    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/');
        }
    }, [isAuthenticated, navigate]);

    // Load provider configurations only after initial load
    useEffect(() => {
        const loadConfigs = async () => {
            if (!user?.id || !apiSettings || !initialLoadComplete) return;

            try {
                // Fetch provider configurations from database
                const configurations = await supabaseHelpers.getProviderConfigurations(user.id);

                const providers: AiProvider[] = [];

                // Add default provider from api_settings if exists
                if (apiSettings.ai_provider && apiSettings.ai_api_key) {
                    const defaultExists = configurations.find(c => c.is_default || c.nickname === 'Default AI');
                    if (!defaultExists) {
                        // Use legacy default from api_settings
                        providers.push({
                            id: '1',
                            nickname: 'Default AI',
                            provider: apiSettings.ai_provider,
                            apiKey: apiSettings.ai_api_key
                        });
                    }

                    // Check if default model is custom
                    const defaultModel = apiSettings.ai_model || 'gpt-4';
                    if (defaultModel && !getModelOptions(apiSettings.ai_provider).includes(defaultModel)) {
                        setDefaultAiModel('custom');
                        setDefaultCustomModel(defaultModel);
                    } else {
                        setDefaultAiModel(defaultModel);
                    }
                }

                // Add configurations from database
                configurations.forEach((config, index) => {
                    providers.push({
                        id: config.is_default ? '1' : config.id || `db-${index}`,
                        nickname: config.nickname,
                        provider: config.provider,
                        apiKey: config.api_key
                    });
                });

                // If no providers, add default empty one
                if (providers.length === 0) {
                    providers.push({
                        id: '1',
                        nickname: 'Default AI',
                        provider: apiSettings?.ai_provider || 'openai',
                        apiKey: apiSettings?.ai_api_key || ''
                    });
                }

                setAiProviders(providers);
            } catch (error) {
                console.error('Error loading provider configurations:', error);
            }
        };

        loadConfigs();
    }, [user?.id, initialLoadComplete]); // Only depend on user ID and initial load status

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
        if (rebalanceAgentProviderId === defaultProviderId) {
            const model = getDefaultModelValue();
            setRebalanceAgentModel(model);
        }
    }, [rebalanceAgentProviderId, defaultProviderId, defaultAiModel, defaultCustomModel]);

    useEffect(() => {
        if (opportunityAgentProviderId === defaultProviderId) {
            const model = getDefaultModelValue();
            setOpportunityAgentModel(model);
        }
    }, [opportunityAgentProviderId, defaultProviderId, defaultAiModel, defaultCustomModel]);

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
                                        onClick={() => forceReload()}
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
                                {/* Alpha Vantage API Configuration */}
                                <div className="space-y-4 p-4 border rounded-lg bg-card">
                                    <h3 className="text-lg font-semibold">Market Data Provider</h3>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label>Alpha Vantage API Key</Label>
                                            <a
                                                href="https://www.alphavantage.co/support/#api-key"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-primary hover:underline"
                                            >
                                                Get free API key
                                            </a>
                                        </div>
                                        <div className="relative">
                                            <Input
                                                type={showKeys.alphaVantageApiKey ? "text" : "password"}
                                                placeholder="Enter your Alpha Vantage API key"
                                                value={alphaVantageApiKey}
                                                onChange={(e) => setAlphaVantageApiKey(e.target.value)}
                                                className={errors.alphaVantageApiKey ? "border-red-500" : "font-mono text-sm"}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                                                onClick={() => toggleShowKey('alphaVantageApiKey')}
                                            >
                                                {showKeys.alphaVantageApiKey ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                        {errors.alphaVantageApiKey && (
                                            <p className="text-sm text-red-500">{errors.alphaVantageApiKey}</p>
                                        )}
                                    </div>
                                </div>

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
                                {aiProviders.length > 1 && (
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
                                )}

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
                                    {errors.save && activeTab === 'providers' && (
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
                                            <Label>Analysis Depth</Label>
                                            <div className="flex items-center space-x-4 py-3 min-h-[40px]">
                                                <Slider
                                                    value={[analysisDepth]}
                                                    onValueChange={(value) => setAnalysisDepth(value[0])}
                                                    min={1}
                                                    max={5}
                                                    step={1}
                                                    className="flex-1"
                                                />
                                                <span className="w-12 text-center font-medium">{analysisDepth}</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                1=Basic, 3=Standard, 5=Comprehensive
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
                                                    <SelectItem value="1D">1 Day</SelectItem>
                                                    <SelectItem value="1W">1 Week</SelectItem>
                                                    <SelectItem value="1M">1 Month</SelectItem>
                                                    <SelectItem value="3M">3 Months</SelectItem>
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
                                </div>

                                {/* Rebalance Agent Configuration */}
                                <div className="space-y-4 p-4 border rounded-lg bg-card">
                                    <h3 className="text-lg font-semibold">Rebalance Agent</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Analyzes portfolio and generates optimal rebalancing strategy
                                    </p>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>AI Provider</Label>
                                            <Select value={rebalanceAgentProviderId} onValueChange={setRebalanceAgentProviderId}>
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
                                            {rebalanceAgentProviderId === defaultProviderId ? (
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
                                                        value={rebalanceAgentModel}
                                                        onValueChange={setRebalanceAgentModel}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select model" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {getModelOptions(aiProviders.find(p => p.id === rebalanceAgentProviderId)?.provider || 'openai').map(model => (
                                                                <SelectItem key={model} value={model}>
                                                                    {model === 'custom' ? 'Custom (enter manually)' : model}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {rebalanceAgentModel === 'custom' && (
                                                        <Input
                                                            className="mt-2"
                                                            placeholder="Enter custom model name"
                                                            value={rebalanceCustomModel}
                                                            onChange={(e) => setRebalanceCustomModel(e.target.value)}
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
                                                value={[rebalanceMaxTokens]}
                                                onValueChange={(value) => setRebalanceMaxTokens(value[0])}
                                                min={500}
                                                max={8000}
                                                step={500}
                                                className="flex-1"
                                            />
                                            <span className="w-16 text-center font-medium">{rebalanceMaxTokens}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Maximum response tokens for rebalance agent (500-8000)
                                        </p>
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
                                                <Label>Paper API Key</Label>
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
                                                <Label>Live API Key</Label>
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

                {/* Global Error Alert */}
                {errors.save && (
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
        </div>
    );
}