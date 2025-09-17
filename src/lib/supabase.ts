import { createClient } from '@supabase/supabase-js';

// These should be in your .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
// Use the new publishable key format instead of the deprecated anon key
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Debug: Log the configuration (remove in production)
if (!supabaseUrl || !supabasePublishableKey) {
  console.error('Supabase configuration missing!', {
    url: supabaseUrl ? 'Set' : 'Missing',
    key: supabasePublishableKey ? 'Set' : 'Missing'
  });
}

// Track rate limit status with exponential backoff
let rateLimitedUntil: number = 0;
let rateLimitBackoff: number = 30000; // Start with 30 seconds
let consecutiveRateLimits: number = 0;

// Cache for session to avoid excessive getSession calls
let cachedSessionToken: string | null = null;
let cachedSessionExpiry: number = 0;

// Export function to check rate limit status
export const isRateLimited = () => rateLimitedUntil > Date.now();

// Track when a token refresh is currently running so callers can temporarily pause polling
if (typeof window !== 'undefined' && typeof (window as any).__supabaseRefreshingToken === 'undefined') {
  (window as any).__supabaseRefreshingToken = false;
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Reduce refresh frequency - only refresh when token has 1 minute left (instead of default 60 seconds)
    // This helps prevent conflicts with our manual refresh logic
    autoRefreshTickDuration: 60,
    // Use the default storage key that matches the project
    // This should be 'sb-lnvjsqyvhczgxvygbqer-auth-token'
    // Let Supabase handle the key automatically
    // Add flow type for better compatibility
    flowType: 'pkce',
    // Storage key for auth token
    storage: {
      getItem: (key) => {
        if (typeof window !== 'undefined') {
          return window.localStorage.getItem(key);
        }
        return null;
      },
      setItem: (key, value) => {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, value);
        }
      },
      removeItem: (key) => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(key);
        }
      },
    },
  },
  // Add global fetch options with timeout and better error handling
  global: {
    fetch: async (input: RequestInfo | URL, init: RequestInit = {}) => {
      let requestInit: RequestInit = { ...init };
      let requestUrl: string | null = null;
      let headers = new Headers(init.headers || {});

      if (typeof input === 'string') {
        requestUrl = input;
      } else if (input instanceof URL) {
        requestUrl = input.toString();
      } else if (input instanceof Request) {
        const clonedRequest = input.clone();
        requestUrl = clonedRequest.url;

        headers = new Headers(clonedRequest.headers);

        if (requestInit.method === undefined) requestInit.method = clonedRequest.method;
        if (requestInit.body === undefined) requestInit.body = clonedRequest.body;
        if (requestInit.credentials === undefined) requestInit.credentials = clonedRequest.credentials;
        if (requestInit.cache === undefined) requestInit.cache = clonedRequest.cache;
        if (requestInit.mode === undefined) requestInit.mode = clonedRequest.mode;
        if (requestInit.redirect === undefined) requestInit.redirect = clonedRequest.redirect;
        if (requestInit.referrer === undefined) requestInit.referrer = clonedRequest.referrer;
        if (requestInit.referrerPolicy === undefined) requestInit.referrerPolicy = clonedRequest.referrerPolicy;
        if (requestInit.integrity === undefined) requestInit.integrity = clonedRequest.integrity;
        if (requestInit.keepalive === undefined) requestInit.keepalive = clonedRequest.keepalive;
        if (requestInit.signal === undefined) requestInit.signal = clonedRequest.signal;
      }

      // Merge headers from init
      new Headers(init.headers || {}).forEach((value, key) => {
        headers.set(key, value);
      });

      const isRestRequest = typeof requestUrl === 'string' && requestUrl.includes('/rest/v1/');
      const isEdgeFunction = typeof requestUrl === 'string' && (requestUrl.includes('/functions/v1/') || requestUrl.includes('.functions.supabase.co/'));

      // For all Supabase API calls, ensure we're using the latest session
      if (isRestRequest || isEdgeFunction) {
        try {
          let accessToken: string | null = null;

          // First check our in-memory cache (valid for 5 seconds to batch rapid API calls)
          const now = Date.now();
          if (cachedSessionToken && cachedSessionExpiry > now) {
            accessToken = cachedSessionToken;
          } else {
            // Cache expired, check localStorage next
            const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
            const storedSession = localStorage.getItem(storageKey);

            if (storedSession) {
              try {
                const sessionData = JSON.parse(storedSession);
                if (sessionData?.access_token) {
                  // Check if token is not too expired (allow up to 2 hours expired for recovery)
                  const payload = JSON.parse(atob(sessionData.access_token.split('.')[1]));
                  const tokenExp = payload.exp;
                  const nowSeconds = Math.floor(now / 1000);
                  const timeUntilExpiry = tokenExp - nowSeconds;

                  if (timeUntilExpiry > -7200) { // Within 2 hours of expiry
                    accessToken = sessionData.access_token;
                    // Cache it for 5 seconds to avoid repeated parsing
                    cachedSessionToken = accessToken;
                    cachedSessionExpiry = now + 5000;
                  }
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }

            // Only call getSession if we absolutely need to (no cached or stored token)
            // AND we're not rate limited
            if (!accessToken && !isRateLimited()) {
              const currentSession = await supabase.auth.getSession();
              if (currentSession.data.session?.access_token) {
                accessToken = currentSession.data.session.access_token;
                // Cache it for 5 seconds
                cachedSessionToken = accessToken;
                cachedSessionExpiry = now + 5000;
              }
            }
          }

          // Set the Authorization header if we have a token
          if (accessToken) {
            headers.set('Authorization', `Bearer ${accessToken}`);
            headers.set('apikey', supabasePublishableKey); // Also ensure API key is set
            if (isEdgeFunction) {
              try {
                const authPrefix = accessToken.length > 10 ? `${accessToken.substring(0, 10)}...` : accessToken;
                console.log('[Supabase fetch] Edge function auth headers applied', {
                  url: requestUrl,
                  hasAuth: !!accessToken,
                  authPrefix,
                  hasApiKey: headers.get('apikey')?.length ? true : false
                });
              } catch (logError) {
                // Ignore logging errors
              }
            }
          }
        } catch (e) {
          // If getting session fails, proceed with original options
          console.warn('Failed to add auth headers:', e);
        }
      }
      // Check if this is a token refresh request
      const isTokenRefresh = typeof requestUrl === 'string' && requestUrl.includes('/auth/v1/token?grant_type=refresh_token');

      // Apply merged headers back to request init
      requestInit = { ...requestInit, headers };

      // If we're rate limited and this is a token refresh, skip it
      if (isTokenRefresh && rateLimitedUntil > Date.now()) {
        console.log('🔐 Skipping token refresh due to rate limit, waiting', Math.ceil((rateLimitedUntil - Date.now()) / 1000), 'seconds');
        // Return the current session to avoid triggering sign out
        // Get the current session from localStorage
        const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
        const storedSession = localStorage.getItem(storageKey);
        if (storedSession) {
          try {
            const sessionData = JSON.parse(storedSession);
            // Return a successful response with the existing session
            return new Response(JSON.stringify({
              access_token: sessionData.access_token,
              token_type: 'bearer',
              expires_in: 3600,
              refresh_token: sessionData.refresh_token,
              user: sessionData.user
            }), {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'content-type': 'application/json' })
            });
          } catch (e) {
            console.error('Failed to parse stored session:', e);
          }
        }
        // If no stored session, return a network error to avoid sign out
        throw new Error('Rate limited - using cached session');
      }

      const finalUrl: RequestInfo | URL = requestUrl ?? input;

      // For Edge Functions, use a longer timeout and respect existing signals
      if (isEdgeFunction) {
        // If there's already a signal in options, check if it's already aborted
        if (requestInit.signal) {
          if (requestInit.signal.aborted) {
            console.log('Skipping fetch - signal already aborted');
            throw new DOMException('The user aborted a request.', 'AbortError');
          }
          try {
            const response = await fetch(finalUrl, {
              ...requestInit,
              credentials: 'same-origin',
              cache: 'no-cache'
            });
            return response;
          } catch (error) {
            // Only log non-abort errors
            if (error instanceof Error && error.name !== 'AbortError') {
              console.error('Supabase Edge Function fetch error:', error);
            }
            throw error;
          }
        }

        // For Edge Functions without existing signal, use 60 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for Edge Functions

        try {
          const response = await fetch(finalUrl, {
            ...requestInit,
            signal: controller.signal,
            credentials: 'same-origin',
            cache: 'no-cache'
          });
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          clearTimeout(timeoutId);
          // Only log non-abort errors to reduce console noise
          if (error instanceof Error && error.name !== 'AbortError') {
            console.error('Supabase Edge Function fetch error:', error);
          }
          throw error;
        }
      }

      // For regular Supabase requests, use standard timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      // Merge signals if one already exists
      let signal = controller.signal;
      if (requestInit.signal) {
        // Check if the existing signal is already aborted
        if (requestInit.signal.aborted) {
          clearTimeout(timeoutId);
          // Don't log for routine aborts (component unmounts, etc)
          if (!(window as any).__suppressAbortLogs) {
            console.log('Skipping fetch - existing signal already aborted');
          }
          throw new DOMException('The user aborted a request.', 'AbortError');
        }
        // Create a combined signal that aborts if either signal aborts
        const combinedController = new AbortController();
        const abortHandler = () => {
          if (!combinedController.signal.aborted) {
            combinedController.abort();
          }
        };
        requestInit.signal.addEventListener('abort', abortHandler, { once: true });
        controller.signal.addEventListener('abort', abortHandler, { once: true });
        signal = combinedController.signal;
      }

      try {
        const response = await fetch(finalUrl, {
          ...requestInit,
          signal,
          credentials: 'same-origin',
          cache: 'no-cache'
        });
        clearTimeout(timeoutId);

        // Handle 401 Unauthorized errors by triggering token refresh
        if (response.status === 401 && !isTokenRefresh) {
          console.log('🔐 API call returned 401, triggering token refresh...');

          // Try to refresh the token using refreshSession which forces an actual refresh
          try {
            if (typeof window !== 'undefined') {
              (window as any).__supabaseRefreshingToken = true;
            }

            const refreshResponse = await supabase.auth.refreshSession();
            if (refreshResponse.data.session && !refreshResponse.error) {
              console.log('🔐 Token refreshed after 401, retrying original request...');

              // Update the authorization header with the new token
              const updatedHeaders = new Headers(requestInit.headers || {});
              updatedHeaders.set('Authorization', `Bearer ${refreshResponse.data.session.access_token}`);

              // Retry the original request with the new token
              const retryResponse = await fetch(finalUrl, {
                ...requestInit,
                headers: updatedHeaders,
                signal,
                credentials: 'same-origin',
                cache: 'no-cache'
              });

              return retryResponse;
            } else {
              console.error('🔐 Token refresh failed:', refreshResponse.error);
            }
          } catch (refreshError) {
            console.error('🔐 Failed to refresh token after 401:', refreshError);
          } finally {
            if (typeof window !== 'undefined') {
              (window as any).__supabaseRefreshingToken = false;
            }
          }
        }

        // Immediately check for 429 rate limit on token refresh BEFORE returning
        if (response.status === 429 && isTokenRefresh) {
          // Increment consecutive rate limits and apply exponential backoff
          consecutiveRateLimits++;
          rateLimitBackoff = Math.min(300000, 30000 * Math.pow(2, consecutiveRateLimits - 1)); // Max 5 minutes
          
          // Set the flag IMMEDIATELY
          (window as any).__supabaseRateLimited = true;
          // Set rate limit with exponential backoff
          rateLimitedUntil = Date.now() + rateLimitBackoff;
          console.error(`🔐 Token refresh rate limited! Backing off for ${rateLimitBackoff / 1000} seconds (attempt ${consecutiveRateLimits})`);

          // Set a global flag so components know we're rate limited
          (window as any).__supabaseRateLimited = true;

          // Clear the rate limit after the timeout
          setTimeout(async () => {
            rateLimitedUntil = 0;
            (window as any).__supabaseRateLimited = false;
            consecutiveRateLimits = Math.max(0, consecutiveRateLimits - 1); // Gradually reduce backoff
            console.log('🔐 Rate limit cleared, token refresh can resume');

            // Try to restore the session if auth state was lost
            try {
              const authState = (await import('./auth')).useAuth.getState();
              if (!authState.isAuthenticated) {
                // Check if we have a valid session in localStorage
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
                const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
                const storedSession = localStorage.getItem(storageKey);

                if (storedSession) {
                  try {
                    const sessionData = JSON.parse(storedSession);
                    if (sessionData?.access_token) {
                      // Check if the stored session is still valid
                      let timeUntilExpiry = 0;
                      try {
                        const payload = JSON.parse(atob(sessionData.access_token.split('.')[1]));
                        const tokenExp = payload.exp;
                        const now = Math.floor(Date.now() / 1000);
                        timeUntilExpiry = tokenExp - now;
                      } catch (e) {
                        // Fallback to session expiry
                        if (sessionData.expires_at) {
                          const now = Math.floor(Date.now() / 1000);
                          timeUntilExpiry = sessionData.expires_at - now;
                        }
                      }

                      // If session is still valid for more than 5 minutes, restore it
                      if (timeUntilExpiry > 300) {
                        console.log('🔐 Restoring auth state after rate limit');
                        await authState.initialize();
                      } else {
                        console.log('🔐 Stored session expired, cannot restore');
                      }
                    }
                  } catch (e) {
                    console.error('Failed to parse stored session:', e);
                  }
                }
              } else {
                console.log('🔐 Auth state already restored');
              }
            } catch (error) {
              console.error('Error restoring auth state after rate limit:', error);
            }
          }, 30000);

          // Return a fake successful response with the current session to prevent sign out
          const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
          const storedSession = localStorage.getItem(storageKey);
          if (storedSession) {
            try {
              const sessionData = JSON.parse(storedSession);
              // Return a successful response with the existing session
              return new Response(JSON.stringify({
                access_token: sessionData.access_token,
                token_type: 'bearer',
                expires_in: 3600,
                refresh_token: sessionData.refresh_token,
                user: sessionData.user
              }), {
                status: 200,
                statusText: 'OK',
                headers: new Headers({ 'content-type': 'application/json' })
              });
            } catch (e) {
              console.error('Failed to parse stored session for 429 response:', e);
            }
          }
        }

        // Reset rate limit counter on successful token refresh
        if (response.ok && isTokenRefresh) {
          consecutiveRateLimits = 0;
          rateLimitBackoff = 30000; // Reset to initial backoff
          // Clear the cache so next request gets fresh token
          cachedSessionToken = null;
          cachedSessionExpiry = 0;
        }
        
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        // Only log non-abort errors to reduce console noise
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Supabase fetch error:', error);
        }
        throw error;
      }
    }
  }
});

// Database types
export interface Profile {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ApiSettings {
  id: string;
  user_id: string;
  ai_provider: 'openai' | 'anthropic' | 'google' | 'openrouter' | 'deepseek';
  ai_api_key: string;
  ai_model?: string;
  polygon_api_key?: string;
  alpaca_paper_api_key?: string;
  alpaca_paper_secret_key?: string;
  alpaca_live_api_key?: string;
  alpaca_live_secret_key?: string;
  alpaca_paper_trading?: boolean;
  // Individual AI provider keys
  openai_api_key?: string;
  anthropic_api_key?: string;
  google_api_key?: string;
  deepseek_api_key?: string;
  openrouter_api_key?: string;
  // Team-specific AI settings
  research_debate_rounds?: number;
  analysis_team_ai?: string;
  analysis_team_model?: string;
  analysis_team_provider_id?: string;
  research_team_ai?: string;
  research_team_model?: string;
  research_team_provider_id?: string;
  trading_team_ai?: string;
  trading_team_model?: string;
  trading_team_provider_id?: string;
  risk_team_ai?: string;
  risk_team_model?: string;
  risk_team_provider_id?: string;
  // Portfolio Manager settings
  portfolio_manager_ai?: string;
  portfolio_manager_model?: string;
  portfolio_manager_provider_id?: string;
  portfolio_manager_max_tokens?: number;
  // Analysis customization (Analysis team only)
  analysis_optimization?: string;
  analysis_depth?: number;
  analysis_history_days?: number | string;  // Can be number or string like "1M", "3M", etc.
  analysis_search_sources?: number;
  // Position management preferences
  profit_target?: number;
  stop_loss?: number;
  // Max tokens settings
  analysis_max_tokens?: number;
  research_max_tokens?: number;
  trading_max_tokens?: number;
  risk_max_tokens?: number;
  // Rebalance settings
  rebalance_threshold?: number;
  rebalance_min_position_size?: number;
  rebalance_max_position_size?: number;
  target_stock_allocation?: number;
  target_cash_allocation?: number;
  rebalance_enabled?: boolean;
  rebalance_schedule?: string;
  opportunity_agent_ai?: string;
  opportunity_agent_model?: string;
  opportunity_agent_provider_id?: string;
  opportunity_max_tokens?: number;
  opportunity_market_range?: string;
  // Trade execution settings
  auto_execute_trades?: boolean;
  auto_near_limit_analysis?: boolean;
  near_limit_threshold?: number;
  default_position_size_dollars?: number;
  user_risk_level?: 'conservative' | 'moderate' | 'aggressive';
  created_at: string;
  updated_at: string;
}

export interface AnalysisHistory {
  id: string;
  user_id: string;
  ticker: string;
  analysis_date: string;
  decision: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  agent_insights: any;
  created_at: string;
}

export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  total_value: number;
  cash_available: number;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  portfolio_id: string;
  ticker: string;
  shares: number;
  avg_cost: number;
  current_price?: number;
  created_at: string;
  updated_at: string;
}

export interface Watchlist {
  id: string;
  user_id: string;
  ticker: string;
  added_at: string;
  last_analysis?: string;
  last_decision?: 'BUY' | 'SELL' | 'HOLD';
}

// Supabase Edge Functions for secure operations
export const supabaseFunctions = {
  // Call analysis coordinator for individual stock analysis
  analyzeStock: async (ticker: string, date: string) => {
    const { data, error } = await supabase.functions.invoke('analysis-coordinator', {
      body: { ticker, date }
    });

    if (error) throw error;
    return data;
  },

  // Batch analyze multiple stocks
  analyzePortfolio: async (tickers: string[], date: string) => {
    const { data, error } = await supabase.functions.invoke('analyze-portfolio', {
      body: { tickers, date }
    });

    if (error) throw error;
    return data;
  }
};

// Helper function to manually recover session after rate limit
export const recoverSession = async () => {
  try {
    // Check if we're still rate limited
    if (rateLimitedUntil > Date.now()) {
      console.log('🔐 Still rate limited, waiting...');
      return false;
    }
    
    // Clear rate limit flag
    rateLimitedUntil = 0;
    delete (window as any).__supabaseRateLimited;
    
    // Try to refresh the session
    const { data, error } = await supabase.auth.refreshSession();
    
    if (!error && data.session) {
      console.log('🔐 Session recovered successfully');
      consecutiveRateLimits = 0; // Reset counter on success
      rateLimitBackoff = 30000; // Reset backoff
      return true;
    } else {
      console.error('🔐 Failed to recover session:', error);
      return false;
    }
  } catch (error) {
    console.error('🔐 Error recovering session:', error);
    return false;
  }
};

// Helper functions for common operations
export const supabaseHelpers = {
  // Get or create API settings for a user (with actual API keys for settings page)
  async getOrCreateApiSettings(userId: string): Promise<ApiSettings | null> {
    console.log('getOrCreateApiSettings called for user:', userId);

    try {
      // Directly fetch settings from database (for settings page only)
      // This will show actual API keys instead of masked values
      console.log('Fetching actual settings for user:', userId);
      const { data: settings, error: fetchError } = await supabase
        .from('api_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      console.log('Direct fetch response:', { settings, fetchError });

      if (!fetchError && settings) {
        console.log('Found existing settings:', settings);
        return settings;
      }

      // If no settings exist (PGRST116 error), create default ones
      if (fetchError?.code === 'PGRST116') {
        console.log('No settings found, creating defaults...');
        const defaultSettings = {
          user_id: userId,
          ai_provider: 'openai' as const,
          ai_api_key: '',
          ai_model: 'gpt-4',
          alpaca_paper_api_key: '',
          alpaca_paper_secret_key: '',
          alpaca_live_api_key: '',
          alpaca_live_secret_key: '',
          alpaca_paper_trading: true,
          auto_execute_trades: false
        };

        const { data: created, error: createError } = await supabase
          .from('api_settings')
          .insert(defaultSettings)
          .select()
          .single();

        if (createError) {
          console.error('Error creating default settings:', createError);
          return null;
        }

        return created;
      }

      // Log the specific error
      console.error('Error fetching settings:', {
        code: fetchError?.code,
        message: fetchError?.message,
        details: fetchError?.details,
        hint: fetchError?.hint,
        userId
      });

      // If it's a different error, still try to create settings
      console.log('Attempting to create settings despite error...');
      const defaultSettings = {
        user_id: userId,
        ai_provider: 'openai' as const,
        ai_api_key: '',
        ai_model: 'gpt-4',
        alpaca_paper_api_key: '',
        alpaca_paper_secret_key: '',
        alpaca_live_api_key: '',
        alpaca_live_secret_key: '',
        alpaca_paper_trading: true,
        auto_execute_trades: false
      };

      const { data: created, error: createError } = await supabase
        .from('api_settings')
        .insert(defaultSettings)
        .select()
        .single();

      if (createError) {
        console.error('Error creating settings after fetch error:', createError);
        return null;
      }

      return created;
    } catch (error) {
      console.error('Error in getOrCreateApiSettings:', error);
      return null;
    }
  },

  // Update API settings (direct database update)
  async updateApiSettings(userId: string, updates: Partial<ApiSettings>): Promise<ApiSettings | null> {
    try {
      // Clean the updates - no need to filter masked values anymore
      const cleanedUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
        // Only include non-empty values
        if (value !== undefined && value !== null) {
          acc[key] = value;
        }
        return acc;
      }, {} as Partial<ApiSettings>);

      console.log('Updating settings with:', cleanedUpdates);

      // Direct database update
      const { data, error } = await supabase
        .from('api_settings')
        .update({
          ...cleanedUpdates,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating settings:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        console.error('Update payload was:', updates);
        return null;
      }

      console.log('Settings updated successfully:', data);
      return data;
    } catch (error) {
      console.error('Error in updateApiSettings:', error);
      return null;
    }
  },

  // Get current session without hanging
  async getCurrentSession() {
    try {
      // Set a timeout for the session check
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Session check timeout')), 5000)
      );

      const result = await Promise.race([sessionPromise, timeoutPromise]) as any;
      return result;
    } catch (error) {
      console.error('Session check failed:', error);
      return { data: { session: null }, error };
    }
  },

  // Provider configuration methods
  async getProviderConfigurations(userId: string) {
    try {
      const { data, error } = await supabase
        .from('provider_configurations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching provider configurations:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getProviderConfigurations:', error);
      return [];
    }
  },

  async saveProviderConfiguration(userId: string, provider: {
    nickname: string;
    provider: string;
    api_key: string;
    is_default?: boolean;
  }) {
    try {
      const { data, error } = await supabase
        .from('provider_configurations')
        .upsert({
          user_id: userId,
          ...provider,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,nickname'
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving provider configuration:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in saveProviderConfiguration:', error);
      return null;
    }
  },

  async deleteProviderConfiguration(userId: string, nickname: string) {
    try {
      const { error } = await supabase
        .from('provider_configurations')
        .delete()
        .eq('user_id', userId)
        .eq('nickname', nickname);

      if (error) {
        console.error('Error deleting provider configuration:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in deleteProviderConfiguration:', error);
      return false;
    }
  },

  // Admin invitation functions using Supabase Auth
  async inviteUserByEmail(email: string, userData?: object): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
        data: userData || {},
        redirectTo: `${window.location.origin}/invitation-setup`
      });

      if (error) {
        console.error('Error sending invitation:', error);
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true
      };
    } catch (error) {
      console.error('Error in inviteUserByEmail:', error);
      return {
        success: false,
        error: 'Failed to send invitation'
      };
    }
  },

  async getInvitedUsers(): Promise<any[]> {
    try {
      // Note: This requires service_role key to access admin functions
      const { data, error } = await supabase.auth.admin.listUsers();

      if (error) {
        console.error('Error fetching users:', error);
        return [];
      }

      // Filter for invited users (those without confirmed emails or with invite metadata)
      return data.users.filter(user =>
        user.invited_at && !user.email_confirmed_at
      );
    } catch (error) {
      console.error('Error in getInvitedUsers:', error);
      return [];
    }
  }
};
