import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAndExtractUser } from '../_shared/auth.ts';

interface AlpacaConfig {
  apiKey: string;
  secretKey: string;
  paper: boolean;
}

interface AlpacaRequest {
  method: string;
  endpoint: string;
  params?: Record<string, any>;
  body?: any;
}

serve(async (req) => {
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
      return new Response(
        JSON.stringify({ error: authError || 'Authentication failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Use service role to access database
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user's API settings
    const { data: apiSettings, error: settingsError } = await supabaseAdmin
      .from('api_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError || !apiSettings) {
      console.error('Settings error for user', userId, ':', settingsError);
      return new Response(
        JSON.stringify({ error: 'API settings not found. Please configure in Settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Parse request body
    const { method, endpoint, params, body }: AlpacaRequest = await req.json();

    // Determine which credentials to use
    const isPaper = apiSettings.alpaca_paper_trading ?? true;
    const config: AlpacaConfig = isPaper ? {
      apiKey: apiSettings.alpaca_paper_api_key,
      secretKey: apiSettings.alpaca_paper_secret_key,
      paper: true
    } : {
      apiKey: apiSettings.alpaca_live_api_key,
      secretKey: apiSettings.alpaca_live_secret_key,
      paper: false
    };

    if (!config.apiKey || !config.secretKey) {
      console.log('Missing Alpaca credentials for user', userId);
      return new Response(
        JSON.stringify({ error: 'Alpaca credentials not configured. Please add them in Settings.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Determine base URL based on endpoint type
    const dataEndpointPrefixes = ['/v2/stocks', '/v1beta3/crypto'];
    const isMarketDataEndpoint = dataEndpointPrefixes.some(prefix => endpoint.startsWith(prefix));

    const baseUrl = isMarketDataEndpoint
      ? 'https://data.alpaca.markets'
      : (config.paper
        ? 'https://paper-api.alpaca.markets'
        : 'https://api.alpaca.markets');

    // Build URL with params
    let url = `${baseUrl}${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    console.log(`Proxying request for user ${userId}: ${method} ${url}`);

    // Make request to Alpaca
    const alpacaResponse = await fetch(url, {
      method: method || 'GET',
      headers: {
        'APCA-API-KEY-ID': config.apiKey,
        'APCA-API-SECRET-KEY': config.secretKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseData = await alpacaResponse.text();
    let jsonData;

    try {
      jsonData = JSON.parse(responseData);
    } catch {
      // If not JSON, return as-is
      jsonData = responseData;
    }

    if (!alpacaResponse.ok) {
      console.error('Alpaca API error:', alpacaResponse.status, jsonData);
      return new Response(
        JSON.stringify({ error: jsonData }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: alpacaResponse.status
        }
      );
    }

    return new Response(
      JSON.stringify(jsonData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Alpaca proxy error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
