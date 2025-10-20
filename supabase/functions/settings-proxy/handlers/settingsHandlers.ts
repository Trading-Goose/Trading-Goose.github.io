import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelpers.ts';
import { maskAllCredentials, processSettingsUpdate, isMaskedValue } from '../utils/credentialHelpers.ts';
import { getUserSettings, upsertUserSettings } from '../utils/dbHelpers.ts';
import { validateApiKey } from '../../_shared/apiValidator.ts';

export async function handleCheckConfigured(supabase: SupabaseClient, userId: string): Promise<Response> {
  const { settings, error } = await getUserSettings(supabase, userId);

  if (error || !settings) {
    return createSuccessResponse({ configured: {} });
  }

  // Return which providers are configured (without exposing keys)
  const configured: Record<string, boolean> = {
    openai: !!settings.openai_api_key,
    anthropic: !!settings.anthropic_api_key,
    google: !!settings.google_api_key,
    deepseek: !!settings.deepseek_api_key,
    openrouter: !!settings.openrouter_api_key,
    alpaca_paper: !!settings.alpaca_paper_api_key && !!settings.alpaca_paper_secret_key,
    alpaca_live: !!settings.alpaca_live_api_key && !!settings.alpaca_live_secret_key,
  };

  return createSuccessResponse({ configured });
}

export async function handleGetSettings(supabase: SupabaseClient, userId: string): Promise<Response> {
  const { settings, error } = await getUserSettings(supabase, userId);

  if (error || !settings) {
    return createSuccessResponse({ settings: null });
  }

  // Create a sanitized version with masked API keys
  const sanitizedSettings = maskAllCredentials(settings);
  return createSuccessResponse({ settings: sanitizedSettings });
}

export async function handleUpdateSettings(supabase: SupabaseClient, userId: string, body: any): Promise<Response> {
  const { settings: newSettings } = body;

  // Validate input
  if (!newSettings || typeof newSettings !== 'object') {
    return createErrorResponse('Invalid settings object');
  }

  // Get current settings to compare masked values
  const { settings: currentSettings, error: fetchError } = await getUserSettings(supabase, userId);

  if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "not found" which is ok
    console.error('Error fetching current settings:', fetchError);
    return createErrorResponse(fetchError.message);
  }

  // Process settings to only update changed values (support partial saves)
  const cleanedSettings = processSettingsUpdate(newSettings, currentSettings);
  
  // Check if processSettingsUpdate returned an error
  if ('error' in cleanedSettings) {
    return createErrorResponse(cleanedSettings.error);
  }

  // Handle required fields for new settings
  if (currentSettings) {
    const requiredFields = ['ai_provider'];
    for (const field of requiredFields) {
      // If field is not being updated and current value exists, preserve it
      if (!(field in cleanedSettings) && currentSettings[field]) {
        cleanedSettings[field] = currentSettings[field];
      }
    }
  } else {
    // If no current settings exist and required fields are missing, provide defaults
    const requiredFields = ['ai_provider'];
    for (const field of requiredFields) {
      if (!(field in cleanedSettings)) {
        switch (field) {
          case 'ai_provider':
            cleanedSettings[field] = 'openrouter'; // Default fallback provider
            break;
        }
      }
    }
  }

  // Only proceed with update if there are actual changes
  if (Object.keys(cleanedSettings).length === 0) {
    // No real changes, just return current settings masked
    const maskedCurrentSettings = maskAllCredentials(currentSettings);
    return createSuccessResponse({ success: true, settings: maskedCurrentSettings });
  }

  // Validate new API keys before saving (but allow empty strings for clearing)
  for (const [key, value] of Object.entries(cleanedSettings)) {
    // Check if this is an API key field and it's a new value (not masked or empty)
    if (key.includes('api_key') && value && value !== '' && !isMaskedValue(value)) {
      // Determine the provider type from the field name
      let provider = '';
      if (key === 'ai_api_key' && cleanedSettings.ai_provider) {
        provider = cleanedSettings.ai_provider;
      } else if (key === 'ai_api_key' && currentSettings?.ai_provider) {
        provider = currentSettings.ai_provider;
      } else if (key === 'openai_api_key') {
        provider = 'openai';
      } else if (key === 'anthropic_api_key') {
        provider = 'anthropic';
      } else if (key === 'google_api_key') {
        provider = 'google';
      } else if (key === 'deepseek_api_key') {
        provider = 'deepseek';
      } else if (key === 'openrouter_api_key') {
        provider = 'openrouter';
      }

      // Validate the API key if we identified the provider
      if (provider && !provider.includes('alpaca')) {
        try {
          const validation = await validateApiKey(provider, value);
          if (!validation.valid) {
            return createErrorResponse(`${provider} API key validation failed: ${validation.message}`);
          }
        } catch (error: any) {
          console.error(`API validation error for ${provider}:`, error);
          return createErrorResponse(`${provider} API key validation failed: ${error.message}`);
        }
      }
    }
    
    // Special handling for Alpaca credentials (need both API key and secret)
    if (key === 'alpaca_paper_api_key' && value && value !== '' && !isMaskedValue(value)) {
      const secretKey = cleanedSettings.alpaca_paper_secret_key || currentSettings?.alpaca_paper_secret_key;
      if (secretKey && secretKey !== '' && !isMaskedValue(secretKey)) {
        try {
          const validation = await validateApiKey('alpaca_paper', value, undefined, secretKey);
          if (!validation.valid) {
            return createErrorResponse(`Alpaca Paper API validation failed: ${validation.message}`);
          }
        } catch (error: any) {
          console.error('Alpaca Paper API validation error:', error);
          return createErrorResponse(`Alpaca Paper API validation failed: ${error.message}`);
        }
      }
    }
    
    if (key === 'alpaca_live_api_key' && value && value !== '' && !isMaskedValue(value)) {
      const secretKey = cleanedSettings.alpaca_live_secret_key || currentSettings?.alpaca_live_secret_key;
      if (secretKey && secretKey !== '' && !isMaskedValue(secretKey)) {
        try {
          const validation = await validateApiKey('alpaca_live', value, undefined, secretKey);
          if (!validation.valid) {
            return createErrorResponse(`Alpaca Live API validation failed: ${validation.message}`);
          }
        } catch (error: any) {
          console.error('Alpaca Live API validation error:', error);
          return createErrorResponse(`Alpaca Live API validation failed: ${error.message}`);
        }
      }
    }
  }

  // Update the settings
  const { data, error } = await upsertUserSettings(supabase, userId, cleanedSettings);

  if (error) {
    console.error('Error updating settings:', error);
    return createErrorResponse(error.message);
  }

  // Return sanitized response with masked credentials
  const sanitizedResponse = maskAllCredentials(data);
  return createSuccessResponse({ success: true, settings: sanitizedResponse });
}