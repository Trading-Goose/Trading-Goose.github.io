import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelpers.ts';
import { maskCredential, isMaskedValue } from '../utils/credentialHelpers.ts';
import { getUserProviderConfigurations } from '../utils/dbHelpers.ts';
import { validateApiKey } from '../../_shared/apiValidator.ts';

export async function handleGetProviderConfigurations(supabase: SupabaseClient, userId: string): Promise<Response> {
  const { configurations, error } = await getUserProviderConfigurations(supabase, userId);

  if (error) {
    console.error('Error fetching provider configurations:', error);
    return createSuccessResponse({ configurations: [] });
  }

  // Mask API keys in configurations
  const maskedConfigurations = configurations.map(config => ({
    ...config,
    api_key: maskCredential(config.api_key)
  }));

  return createSuccessResponse({ configurations: maskedConfigurations });
}

export async function handleSaveProviderConfiguration(supabase: SupabaseClient, userId: string, body: any): Promise<Response> {
  const { provider } = body;

  if (!provider) {
    return createErrorResponse('Provider configuration required');
  }

  // Get current configuration if updating
  let currentConfig = null;
  if (provider.id) {
    const { data } = await supabase
      .from('provider_configurations')
      .select('*')
      .eq('id', provider.id)
      .eq('user_id', userId)
      .single();
    currentConfig = data;
  }

  // Check if API key is masked and matches current
  let finalApiKey = provider.api_key;
  let isNewApiKey = false;
  
  // First check if the provided value looks like a masked value
  if (isMaskedValue(provider.api_key)) {
    // If it's masked, it MUST match the current masked value exactly
    if (currentConfig && currentConfig.api_key) {
      const currentMasked = maskCredential(currentConfig.api_key);
      if (provider.api_key === currentMasked) {
        // Masked value matches - keep the original unmasked value
        finalApiKey = currentConfig.api_key;
      } else {
        // Masked value doesn't match - this is suspicious!
        return createErrorResponse('Invalid masked API key provided. Please enter a new API key or leave unchanged.');
      }
    } else {
      // No current config but user sent masked value - reject this
      return createErrorResponse('Cannot use masked API key for new configuration. Please provide actual API key.');
    }
  } else if (provider.api_key) {
    // Not masked - treat as new API key
    isNewApiKey = true;
  } else if (!provider.api_key && currentConfig) {
    // No API key provided but config exists - keep current
    finalApiKey = currentConfig.api_key;
  } else {
    // No API key and no current config
    return createErrorResponse('API key is required');
  }

  // Validate new API keys before saving
  if (isNewApiKey && finalApiKey) {
    try {
      const validation = await validateApiKey(provider.provider, finalApiKey);
      if (!validation.valid) {
        return createErrorResponse(`API key validation failed: ${validation.message}`);
      }
    } catch (error: any) {
      console.error('API validation error:', error);
      return createErrorResponse(`API key validation failed: ${error.message}`);
    }
  }

  // Upsert the configuration
  const configData = {
    user_id: userId,
    nickname: provider.nickname,
    provider: provider.provider,
    api_key: finalApiKey,
    is_default: provider.is_default || false,
    updated_at: new Date().toISOString()
  };

  let result;
  if (provider.id && currentConfig) {
    // Update existing
    const { data, error } = await supabase
      .from('provider_configurations')
      .update(configData)
      .eq('id', provider.id)
      .eq('user_id', userId)
      .select()
      .single();
    result = { data, error };
  } else {
    // Insert new
    const { data, error } = await supabase
      .from('provider_configurations')
      .insert(configData)
      .select()
      .single();
    result = { data, error };
  }

  if (result.error) {
    console.error('Error saving provider configuration:', result.error);
    return createErrorResponse(result.error.message);
  }

  // Return with masked API key
  const savedConfig = {
    ...result.data,
    api_key: maskCredential(result.data.api_key)
  };

  return createSuccessResponse({ success: true, configuration: savedConfig });
}