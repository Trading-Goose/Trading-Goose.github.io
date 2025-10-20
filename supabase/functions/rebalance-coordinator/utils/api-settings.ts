import { createErrorResponse } from './response-helpers.ts';
/**
 * Fetch API settings for rebalance coordinator
 * Focuses on portfolio/rebalance-specific settings only
 * Uses provider_configurations table for API keys and api_settings for other settings
 */ export async function fetchApiSettings(supabase, userId) {
  console.log(`🔑 Fetching API settings for user: ${userId}`);
  // Fetch rebalance-specific settings from api_settings table
  const { data: rawSettings, error: settingsError } = await supabase.from('api_settings').select(`
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
      stop_loss,
      profit_target,
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
      portfolio_manager_ai,
      portfolio_manager_model,
      portfolio_manager_max_tokens,
      opportunity_agent_ai,
      opportunity_agent_model,
      opportunity_max_tokens
    `).eq('user_id', userId).single();
  if (settingsError) {
    console.error('❌ Failed to fetch user settings:', settingsError);
    // Use the specific database error message instead of generic message
    const errorMessage = settingsError.message || 'Failed to fetch user settings';
    return {
      settings: null,
      error: createErrorResponse(errorMessage, 500, settingsError)
    };
  }
  if (!rawSettings) {
    console.error('❌ No settings found for user');
    return {
      settings: null,
      error: createErrorResponse('No settings found for user', 404)
    };
  }
  // Build provider map starting with the default provider from api_settings
  const providerMap = {};
  // ALWAYS include the default provider from api_settings if it exists
  if (rawSettings.ai_provider) {
    // For the default provider, use ai_api_key (not the provider-specific field)
    // This allows users to have multiple API keys for the same provider type
    const defaultApiKey = rawSettings.ai_api_key;
    if (defaultApiKey) {
      console.log(`✅ Found default provider: ${rawSettings.ai_provider}`);
      const defaultProviderConfig = {
        provider: rawSettings.ai_provider,
        api_key: defaultApiKey,
        nickname: 'Default AI',
        is_default: true,
        id: 'default'
      };
      providerMap[rawSettings.ai_provider] = defaultProviderConfig;
      providerMap['default'] = defaultProviderConfig;
    } else {
      console.warn(`⚠️ Default provider ${rawSettings.ai_provider} configured but no API key found in ai_api_key field`);
    }
  }
  // Fetch additional provider configurations from provider_configurations table
  const { data: providerConfigs, error: configError } = await supabase.from('provider_configurations').select('*').eq('user_id', userId).order('created_at', {
    ascending: true
  });
  if (configError) {
    console.error('⚠️ Failed to fetch additional provider configurations:', configError);
    // Don't fail completely - we might still have the default provider
  } else if (providerConfigs && providerConfigs.length > 0) {
    // Add additional providers to the map
    console.log(`✅ Found ${providerConfigs.length} additional provider(s)`);
    providerConfigs.forEach((config) => {
      // Don't override the default provider if it's already in the map
      if (config.provider === rawSettings.ai_provider && providerMap[config.provider]) {
        console.log(`⚠️ Skipping duplicate provider config for default provider: ${config.provider}`);
      } else {
        // Index by provider name for backward compatibility
        providerMap[config.provider] = config;
        // ALSO index by provider ID for agent team lookups
        if (config.id) {
          providerMap[config.id] = config;
        }
      }
    });
  }
  // Determine which provider config to use for the default AI operations
  let selectedProviderConfig = null;
  // First priority: use the default provider from api_settings
  if (rawSettings.ai_provider && providerMap[rawSettings.ai_provider]) {
    selectedProviderConfig = providerMap[rawSettings.ai_provider];
  } else if (Object.keys(providerMap).length > 0) {
    const firstProvider = Object.values(providerMap)[0];
    selectedProviderConfig = firstProvider;
    console.warn(`⚠️ No default provider set, using first available: ${firstProvider.provider}`);
  }
  if (!selectedProviderConfig) {
    console.error('❌ No provider configuration found');
    console.error(`   Default provider: ${rawSettings.ai_provider || 'none'}`);
    console.error(`   Total providers: ${Object.keys(providerMap).length}`);
    return {
      settings: null,
      error: createErrorResponse(`No provider configuration found. Please configure at least one AI provider in Settings.`, 400)
    };
  }
  // Extract the API key from the selected provider config
  const ai_api_key = selectedProviderConfig.api_key;
  const actualProvider = selectedProviderConfig.provider;
  // Create the properly formatted settings object
  const settings = {
    ...rawSettings,
    ai_provider: actualProvider,
    ai_api_key
  };
  settings._providerMap = providerMap;
  console.log(`🔍 DEBUG: Team settings - analysis_team_ai: ${settings.analysis_team_ai}, research_team_ai: ${settings.research_team_ai}`);
  // Validate required settings
  if (!settings.ai_provider || !ai_api_key || !settings.ai_model) {
    console.error('❌ Missing required AI settings');
    console.error(`   Provider: ${settings.ai_provider}`);
    console.error(`   API Key present: ${!!ai_api_key}`);
    console.error(`   Model: ${settings.ai_model}`);
    console.error(`   Provider config: ${JSON.stringify(selectedProviderConfig, null, 2)}`);
    return {
      settings: null,
      error: createErrorResponse(`Missing required AI provider settings. Provider: ${settings.ai_provider}, API Key: ${!!ai_api_key}, Model: ${settings.ai_model}`, 400)
    };
  }
  console.log(`✅ Successfully fetched rebalance settings for user: ${userId}`);
  console.log(`   AI Provider: ${settings.ai_provider} (from ${selectedProviderConfig.nickname})`);
  console.log(`   AI Model: ${settings.ai_model}`);
  console.log(`   API Key present: ${!!ai_api_key}`);
  console.log(`   Portfolio Manager AI: ${settings.portfolio_manager_ai || 'using default'}`);
  console.log(`   Portfolio Manager Model: ${settings.portfolio_manager_model || 'using default'}`);
  console.log(`   Opportunity Agent AI: ${settings.opportunity_agent_ai || 'using default'}`);
  console.log(`   Opportunity Agent Model: ${settings.opportunity_agent_model || 'using default'}`);
  console.log(`   Total providers available: ${Object.keys(providerMap).length}`);
  console.log(`🔍 DEBUG: Available providers: ${Object.keys(providerMap).join(', ')}`);
  // Store the provider map in settings for agent-specific lookups
  settings._providerMap = providerMap;
  return {
    settings,
    error: null
  };
}
/**
 * Get opportunity agent specific API settings based on user's opportunity agent configurations
 */ export function getOpportunityAgentSettings(baseSettings) {
  // Create a copy of base settings to avoid mutations
  const opportunitySettings = {
    ...baseSettings
  };
  const opportunityProviderId = baseSettings.opportunity_agent_provider_id;
  const opportunityAgentAi = baseSettings.opportunity_agent_ai;
  const opportunityAgentModel = baseSettings.opportunity_agent_model;
  console.log(`🔍 Opportunity Agent config:`);
  console.log(`   Opportunity Provider ID: ${opportunityProviderId || 'none'}`);
  console.log(`   Opportunity Agent AI: ${opportunityAgentAi || 'using default'}`);
  console.log(`   Opportunity Agent Model: ${opportunityAgentModel || 'using default'}`);
  // Get the provider map
  const providerMap = baseSettings._providerMap || {};
  // Try to find the provider config by ID first, then by name
  let opportunityProviderConfig = null;
  if (opportunityProviderId) {
    // Prefer provider ID lookup (most accurate)
    opportunityProviderConfig = providerMap[opportunityProviderId];
    console.log(`   🔍 Looking for provider by ID: ${opportunityProviderId}`);
  }
  if (!opportunityProviderConfig && opportunityAgentAi) {
    // Fallback to provider name lookup (backward compatibility)
    opportunityProviderConfig = providerMap[opportunityAgentAi];
    console.log(`   🔍 Looking for provider by name: ${opportunityAgentAi}`);
  }
  if (opportunityProviderConfig) {
    // Use the actual provider name and API key from the config
    opportunitySettings.ai_provider = opportunityProviderConfig.provider;
    opportunitySettings.ai_api_key = opportunityProviderConfig.api_key;
    console.log(`   ✅ Using provider: ${opportunityProviderConfig.provider} (${opportunityProviderConfig.nickname || 'provider config'})`);
    console.log(`   ✅ API key configured: ${!!opportunityProviderConfig.api_key}`);
  } else if (opportunityProviderId === null || opportunityProviderId === undefined || opportunityProviderId === '') {
    // User explicitly chose "Default AI" or hasn't configured opportunity-specific provider
    console.log(`   ℹ️ Using default provider (no opportunity-specific provider configured)`);
  } else {
    // This is an actual problem - provider ID was specified but not found
    console.warn(`   ⚠️ Provider config not found for ID: ${opportunityProviderId}`);
    console.warn(`   📋 Available providers in map: ${Object.keys(providerMap).join(', ')}`);
  }
  if (opportunityAgentModel) {
    opportunitySettings.ai_model = opportunityAgentModel;
    console.log(`   ✅ Using opportunity-specific model: ${opportunityAgentModel}`);
  }
  console.log(`🔧 Final opportunity settings:`);
  console.log(`   Provider: ${opportunitySettings.ai_provider}`);
  console.log(`   Model: ${opportunitySettings.ai_model}`);
  console.log(`   API Key present: ${!!opportunitySettings.ai_api_key}`);
  return opportunitySettings;
} // Removed getPortfolioManagerSettings - now using unified getAgentSpecificSettings from analysis-coordinator
