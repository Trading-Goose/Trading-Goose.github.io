import { ApiSettings } from '../types/index.ts';
import { createErrorResponse } from './response-helpers.ts';

/**
 * Fetch API settings for a user
 */
export async function fetchApiSettings(
  supabase: any,
  userId: string
): Promise<{ settings: ApiSettings | null; error: Response | null }> {

  // Removed verbose logging

  // Fetch main settings from api_settings table
  const { data: rawSettings, error: settingsError } = await supabase
    .from('api_settings')
    .select(`
      ai_provider,
      ai_api_key,
      ai_model,
      alpaca_paper_api_key,
      alpaca_paper_secret_key,
      alpaca_live_api_key,
      alpaca_live_secret_key,
      alpaca_paper_trading,
      user_risk_level,
      default_position_size_dollars,
      rebalance_max_position_size,
      rebalance_min_position_size,
      analysis_history_days,
      analysis_optimization,
      analysis_search_sources,
      research_debate_rounds,
      analysis_max_tokens,
      research_max_tokens,
      trading_max_tokens,
      risk_max_tokens,
      portfolio_manager_ai,
      portfolio_manager_model,
      portfolio_manager_max_tokens,
      portfolio_manager_provider_id,
      opportunity_agent_ai,
      opportunity_agent_model,
      opportunity_agent_provider_id,
      opportunity_max_tokens,
      analysis_team_ai,
      analysis_team_model,
      analysis_team_provider_id,
      research_team_ai,
      research_team_model,
      research_team_provider_id,
      trading_team_ai,
      trading_team_model,
      trading_team_provider_id,
      risk_team_ai,
      risk_team_model,
      risk_team_provider_id,
      profit_target,
      stop_loss
    `)
    .eq('user_id', userId)
    .single();

  if (settingsError) {
    console.error('❌ Failed to fetch user settings:', settingsError);
    return {
      settings: null,
      error: createErrorResponse(
        'Failed to fetch user settings',
        500,
        settingsError.message
      )
    };
  }

  if (!rawSettings) {
    console.error('❌ No settings found for user');
    return {
      settings: null,
      error: createErrorResponse(
        'No settings found for user',
        404
      )
    };
  }

  // Build provider map starting with the default provider from api_settings
  interface ProviderConfig {
    provider: string;
    api_key: string;
    nickname?: string;
    is_default?: boolean;
    id?: string;
  }
  const providerMap: Record<string, ProviderConfig> = {};

  console.log(`🔍 DEBUG: Building provider map for user ${userId}`);
  console.log(`   rawSettings.ai_provider: ${rawSettings.ai_provider}`);
  console.log(`   rawSettings.ai_api_key exists: ${!!rawSettings.ai_api_key}`);
  console.log(`   rawSettings.ai_api_key type: ${typeof rawSettings.ai_api_key}`);
  console.log(`   rawSettings.ai_api_key length: ${rawSettings.ai_api_key ? rawSettings.ai_api_key.length : 0}`);

  // ALWAYS include the default provider from api_settings if it exists
  if (rawSettings.ai_provider) {
    // For the default provider, use ai_api_key (not the provider-specific field)
    // This allows users to have multiple API keys for the same provider type
    const defaultApiKey = rawSettings.ai_api_key;

    console.log(`🔍 DEBUG: Default API key check`);
    console.log(`   defaultApiKey value: ${defaultApiKey ? '[REDACTED]' : 'null/undefined'}`);
    console.log(`   defaultApiKey type: ${typeof defaultApiKey}`);
    console.log(`   defaultApiKey truthiness: ${!!defaultApiKey}`);

    if (defaultApiKey) {
      console.log(`✅ Found default provider: ${rawSettings.ai_provider}`);
      const defaultProviderConfig = {
        provider: rawSettings.ai_provider,
        api_key: defaultApiKey,
        nickname: 'Default AI', // Frontend doesn't save nickname for default provider
        is_default: true,
        id: 'default' // Special ID for the default provider
      };

      // Index by provider name for backward compatibility
      providerMap[rawSettings.ai_provider] = defaultProviderConfig;
      // Also index by 'default' key so we can find it when needed
      providerMap['default'] = defaultProviderConfig;
      console.log(`✅ Added default provider to map with keys: ${Object.keys(providerMap).join(', ')}`);
    } else {
      console.warn(`⚠️ Default provider ${rawSettings.ai_provider} configured but no API key found in ai_api_key field`);
      console.warn(`   API key value: ${rawSettings.ai_api_key}`);
      console.warn(`   API key type: ${typeof rawSettings.ai_api_key}`);
    }
  } else {
    console.log(`🔍 DEBUG: No ai_provider set in rawSettings`);
  }

  // Fetch additional provider configurations from provider_configurations table
  const { data: providerConfigs, error: configError } = await supabase
    .from('provider_configurations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  console.log(`🔍 DEBUG: Fetching provider_configurations`);
  console.log(`   configError: ${configError ? configError.message : 'none'}`);
  console.log(`   providerConfigs count: ${providerConfigs ? providerConfigs.length : 0}`);

  if (configError) {
    console.error('⚠️ Failed to fetch additional provider configurations:', configError);
    // Don't fail completely - we might still have the default provider
  } else if (providerConfigs && providerConfigs.length > 0) {
    // Add additional providers to the map
    console.log(`✅ Found ${providerConfigs.length} additional provider(s)`);
    providerConfigs.forEach((config, index) => {
      console.log(`   Config ${index}: ${config.provider} (${config.nickname}) - ID: ${config.id}`);
      console.log(`      Has API key: ${!!config.api_key}`);
      
      const providerNameKeyExists = !!providerMap[config.provider];

      if (config.provider === rawSettings.ai_provider && providerNameKeyExists) {
        console.log(`⚠️ Keeping existing default provider entry for name key: ${config.provider}`);
      } else if (!providerNameKeyExists) {
        // Index by provider name for backward compatibility when slot is free
        providerMap[config.provider] = config;
        console.log(`   Added provider name key for ${config.provider}`);
      }

      // ALWAYS index by provider ID so team-specific selections resolve correctly
      if (config.id) {
        providerMap[config.id] = config;
        console.log(`   Added to map with ID: ${config.id}`);
      }
    });
    console.log(`✅ Provider map now has keys: ${Object.keys(providerMap).join(', ')}`);
  } else {
    console.log(`🔍 DEBUG: No provider configurations found or empty result`);
  }

  // Determine which provider config to use for the default AI operations
  let selectedProviderConfig: ProviderConfig | null = null;

  // First priority: use the default provider from api_settings
  if (rawSettings.ai_provider && providerMap[rawSettings.ai_provider]) {
    selectedProviderConfig = providerMap[rawSettings.ai_provider];
  }
  // Second priority: use the first available provider
  else if (Object.keys(providerMap).length > 0) {
    const firstProvider = Object.values(providerMap)[0];
    selectedProviderConfig = firstProvider;
    console.warn(`⚠️ No default provider set, using first available: ${firstProvider.provider}`);
  }

  if (!selectedProviderConfig) {
    console.error('❌ No provider configuration found');
    console.error(`   Default provider: ${rawSettings.ai_provider || 'none'}`);
    console.error(`   Total providers: ${Object.keys(providerMap).length}`);
    console.error(`   Provider map keys: ${Object.keys(providerMap).join(', ')}`);
    console.error(`   Looking for provider: ${rawSettings.ai_provider}`);
    console.error(`   Provider exists in map: ${rawSettings.ai_provider in providerMap}`);
    console.error(`   Full provider map: ${JSON.stringify(Object.keys(providerMap))}`);

    // Provide more helpful error message based on what's missing
    let errorMessage = 'No provider configuration found.';
    if (!rawSettings.ai_provider) {
      errorMessage = 'No AI provider selected. Please configure an AI provider in Settings.';
    } else if (!rawSettings.ai_api_key) {
      errorMessage = `Provider "${rawSettings.ai_provider}" is selected but no API key is configured. Please add your API key in Settings.`;
    } else {
      errorMessage = 'No valid provider configuration found. Please check your AI provider settings.';
    }

    return {
      settings: null,
      error: createErrorResponse(errorMessage)
    };
  }

  // Extract the API key from the selected provider config
  const ai_api_key = selectedProviderConfig.api_key;
  const actualProvider = selectedProviderConfig.provider;

  // Create the properly formatted settings object
  const settings: any = {
    ...rawSettings,
    ai_provider: actualProvider, // Use the actual provider from config
    ai_api_key
    // Do NOT include provider-specific API key fields
    // The provider map is stored separately for agent-specific lookups
  };
  
  // Ensure Alpaca API keys are properly set based on paper/live trading mode
  if (rawSettings.alpaca_paper_trading) {
    settings.alpaca_api_key = rawSettings.alpaca_paper_api_key;
    settings.alpaca_secret_key = rawSettings.alpaca_paper_secret_key;
  } else {
    settings.alpaca_api_key = rawSettings.alpaca_live_api_key;
    settings.alpaca_secret_key = rawSettings.alpaca_live_secret_key;
  }

  // Validate required settings
  if (!settings.ai_provider || !ai_api_key || !settings.ai_model) {
    console.error('❌ Missing required AI settings');
    console.error(`   Provider: ${settings.ai_provider}`);
    console.error(`   API Key present: ${!!ai_api_key}`);
    console.error(`   Model: ${settings.ai_model}`);
    console.error(`   Provider config: ${JSON.stringify(selectedProviderConfig, null, 2)}`);
    return {
      settings: null,
      error: createErrorResponse(
        `Missing required AI provider settings. Provider: ${settings.ai_provider}, API Key: ${!!ai_api_key}, Model: ${settings.ai_model}`
      )
    };
  }

  console.log(`✅ Successfully fetched settings for user: ${userId}`);
  console.log(`   AI Provider: ${settings.ai_provider} (from ${selectedProviderConfig.nickname})`);
  console.log(`   AI Model: ${settings.ai_model}`);
  console.log(`   API Key present: ${!!ai_api_key}`);
  console.log(`   Alpaca API Key present: ${!!settings.alpaca_api_key}`);
  console.log(`   Alpaca Secret Key present: ${!!settings.alpaca_secret_key}`);
  console.log(`   Paper Trading Mode: ${settings.alpaca_paper_trading}`);
  console.log(`   Total providers available: ${Object.keys(providerMap).length}`);
  console.log(`🔍 DEBUG: Available providers: ${Object.keys(providerMap).join(', ')}`);
  console.log(`🔍 DEBUG: Team settings - analysis_team_ai: ${settings.analysis_team_ai}, research_team_ai: ${settings.research_team_ai}`);

  // Store the provider map in settings for agent-specific lookups
  settings._providerMap = providerMap;

  return { settings, error: null };
}

/**
 * Get agent-specific API settings based on agent type and user's team configurations
 */
export function getAgentSpecificSettings(
  baseSettings: any,
  agentName: string
): any {

  // Create a copy of base settings to avoid mutations
  const agentSettings = { ...baseSettings };

  // Map agent names to their team settings
  const agentTeamMap: Record<string, { aiField: string; modelField: string; providerIdField: string }> = {
    // Analysis team agents
    'agent-macro-analyst': { aiField: 'analysis_team_ai', modelField: 'analysis_team_model', providerIdField: 'analysis_team_provider_id' },
    'agent-market-analyst': { aiField: 'analysis_team_ai', modelField: 'analysis_team_model', providerIdField: 'analysis_team_provider_id' },
    'agent-fundamentals-analyst': { aiField: 'analysis_team_ai', modelField: 'analysis_team_model', providerIdField: 'analysis_team_provider_id' },
    'agent-news-analyst': { aiField: 'analysis_team_ai', modelField: 'analysis_team_model', providerIdField: 'analysis_team_provider_id' },
    'agent-social-media-analyst': { aiField: 'analysis_team_ai', modelField: 'analysis_team_model', providerIdField: 'analysis_team_provider_id' },

    // Research team agents
    'agent-bull-researcher': { aiField: 'research_team_ai', modelField: 'research_team_model', providerIdField: 'research_team_provider_id' },
    'agent-bear-researcher': { aiField: 'research_team_ai', modelField: 'research_team_model', providerIdField: 'research_team_provider_id' },
    'agent-research-manager': { aiField: 'research_team_ai', modelField: 'research_team_model', providerIdField: 'research_team_provider_id' },

    // Trading team agents
    'agent-trader': { aiField: 'trading_team_ai', modelField: 'trading_team_model', providerIdField: 'trading_team_provider_id' },

    // Risk team agents
    'agent-risky-analyst': { aiField: 'risk_team_ai', modelField: 'risk_team_model', providerIdField: 'risk_team_provider_id' },
    'agent-safe-analyst': { aiField: 'risk_team_ai', modelField: 'risk_team_model', providerIdField: 'risk_team_provider_id' },
    'agent-neutral-analyst': { aiField: 'risk_team_ai', modelField: 'risk_team_model', providerIdField: 'risk_team_provider_id' },
    'agent-risk-manager': { aiField: 'risk_team_ai', modelField: 'risk_team_model', providerIdField: 'risk_team_provider_id' },

    // Analysis Portfolio Manager (uses its own settings)
    'analysis-portfolio-manager': { aiField: 'portfolio_manager_ai', modelField: 'portfolio_manager_model', providerIdField: 'portfolio_manager_provider_id' },
    'rebalance-portfolio-manager': { aiField: 'portfolio_manager_ai', modelField: 'portfolio_manager_model', providerIdField: 'portfolio_manager_provider_id' },
    'opportunity-agent': { aiField: 'opportunity_agent_ai', modelField: 'opportunity_agent_model', providerIdField: 'opportunity_agent_provider_id' }
  };

  const teamConfig = agentTeamMap[agentName];

  if (teamConfig) {
    const teamProviderId = baseSettings[teamConfig.providerIdField];
    const teamAiProvider = baseSettings[teamConfig.aiField];
    const teamModel = baseSettings[teamConfig.modelField];

    console.log(`🎯 Agent ${agentName} team config:`);
    console.log(`   Team Provider ID: ${teamProviderId || 'none'}`);
    console.log(`   Team AI Provider: ${teamAiProvider || 'using default'}`);
    console.log(`   Team Model: ${teamModel || 'using default'}`);

    // Get the provider map
    const providerMap = baseSettings._providerMap || {};

    // Try to find the provider config by ID first, then by name
    interface ProviderConfigInternal {
      provider: string;
      api_key: string;
      nickname?: string;
      is_default?: boolean;
      id?: string;
    }
    let teamProviderConfig: ProviderConfigInternal | null = null;

    if (teamProviderId) {
      // Prefer provider ID lookup (most accurate)
      teamProviderConfig = providerMap[teamProviderId];
      console.log(`   🔍 Looking for provider by ID: ${teamProviderId}`);
    } else if (teamProviderId === null || teamProviderId === undefined || teamProviderId === '') {
      const defaultProvider = Object.values(providerMap).find((p: any) => p.is_default === true) as ProviderConfigInternal | undefined;

      // Only use the default provider automatically if the team explicitly wants it
      if (defaultProvider && (!teamAiProvider || teamAiProvider === defaultProvider.provider)) {
        teamProviderConfig = defaultProvider;
        console.log(`   🔍 Using default provider (team configured for default)`);
      } else {
        console.log(`   🔍 Provider ID not set but team provider differs from default - will resolve by name`);
      }
    }

    if (!teamProviderConfig && teamAiProvider) {
      const normalizedKey = String(teamAiProvider).toLowerCase();
      // Fallback hierarchy:
      //   1. Direct map lookup (covers UUID keys or legacy name keys)
      //   2. Match against provider IDs/nicknames stored in map entries
      //   3. Finally fall back to provider type/company name
      teamProviderConfig = providerMap[teamAiProvider] || providerMap[normalizedKey];

      if (!teamProviderConfig) {
        teamProviderConfig = Object.values(providerMap).find((p: any) => {
          if (!p) return false;
          if (p.id && String(p.id).toLowerCase() === normalizedKey) return true;
          if (p.nickname && String(p.nickname).toLowerCase() === normalizedKey) return true;
          return false;
        }) as ProviderConfigInternal | undefined || null;
      }

      if (!teamProviderConfig) {
        teamProviderConfig = Object.values(providerMap).find((p: any) => p && String(p.provider).toLowerCase() === normalizedKey) as ProviderConfigInternal | undefined || null;
      }

      console.log(`   🔍 Resolved provider via fallback key: ${teamAiProvider}`);
    }

    if (teamProviderConfig) {
      // Use the actual provider name and API key from the config
      agentSettings.ai_provider = teamProviderConfig.provider;
      agentSettings.ai_api_key = teamProviderConfig.api_key;
      console.log(`   ✅ Using provider: ${teamProviderConfig.provider} (${teamProviderConfig.nickname || 'provider config'})`);
      console.log(`   ✅ API key configured: ${!!teamProviderConfig.api_key}`);
    } else if (teamProviderId === null || teamProviderId === undefined || teamProviderId === '') {
      // User explicitly chose "Default AI" or hasn't configured team-specific provider
      console.log(`   ℹ️ Using default provider (no team-specific provider configured)`);
    } else {
      // This is an actual problem - provider ID was specified but not found
      console.warn(`   ⚠️ Provider config not found for ID: ${teamProviderId}`);
      console.warn(`   📋 Available providers in map: ${Object.keys(providerMap).join(', ')}`);
    }

    if (teamModel) {
      agentSettings.ai_model = teamModel;
      console.log(`   ✅ Using team-specific model: ${teamModel}`);
    }
  } else {
    console.log(`🎯 Agent ${agentName} using default AI settings`);
  }

  console.log(`🔧 Final settings for ${agentName}:`);
  console.log(`   Provider: ${agentSettings.ai_provider}`);
  console.log(`   Model: ${agentSettings.ai_model}`);
  console.log(`   API Key present: ${!!agentSettings.ai_api_key}`);

  return agentSettings;
}
