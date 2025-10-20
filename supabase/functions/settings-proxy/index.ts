import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAndExtractUser } from '../_shared/auth.ts';

// Import handlers
import { handleValidation } from './handlers/validationHandler.ts';
import { handleCheckConfigured, handleGetSettings, handleUpdateSettings } from './handlers/settingsHandlers.ts';
import { handleGetProviderConfigurations, handleSaveProviderConfiguration } from './handlers/providerHandlers.ts';
import { handleCheckCredentialsChanged } from './handlers/credentialHandlers.ts';

// Import utilities
import { createErrorResponse } from './utils/responseHelpers.ts';

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify JWT and extract user ID
    const authHeader = req.headers.get('Authorization');
    const { userId, error: authError } = await verifyAndExtractUser(authHeader);

    if (authError || !userId) {
      console.error('Authentication failed:', authError);
      return createErrorResponse(authError || 'Authentication failed', 401);
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();
    const { action } = body;

    // Handle different actions
    switch (action) {
      case 'validate':
        return await handleValidation(body);

      case 'check_configured':
        return await handleCheckConfigured(supabase, userId);

      case 'get_settings':
        return await handleGetSettings(supabase, userId);

      case 'get_provider_configurations':
        return await handleGetProviderConfigurations(supabase, userId);

      case 'save_provider_configuration':
        return await handleSaveProviderConfiguration(supabase, userId, body);

      case 'update_settings':
        return await handleUpdateSettings(supabase, userId, body);

      case 'check_credentials_changed':
        return await handleCheckCredentialsChanged(supabase, userId, body);
      
      default:
        return createErrorResponse('Invalid action');
    }

  } catch (error) {
    console.error('Error in settings-proxy:', error);
    return createErrorResponse(error.message, 500);
  }
});