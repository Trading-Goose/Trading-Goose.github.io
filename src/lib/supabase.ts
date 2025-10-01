import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

if (!supabaseUrl || !supabasePublishableKey) {
  console.error('Supabase configuration missing!', {
    url: supabaseUrl ? 'Set' : 'Missing',
    key: supabasePublishableKey ? 'Set' : 'Missing'
  });
}

let rateLimitedUntil = 0;
let rateLimitBackoff = 30000;
let consecutiveRateLimits = 0;

export const isRateLimited = () => rateLimitedUntil > Date.now();

export const registerRateLimitHit = (backoffOverride?: number) => {
  if (backoffOverride) {
    rateLimitBackoff = backoffOverride;
  } else {
    consecutiveRateLimits = Math.min(consecutiveRateLimits + 1, 5);
    const multiplier = Math.pow(2, Math.max(consecutiveRateLimits - 1, 0));
    rateLimitBackoff = Math.min(300000, 30000 * multiplier);
  }

  rateLimitedUntil = Date.now() + rateLimitBackoff;

  if (typeof window !== 'undefined') {
    (window as any).__supabaseRateLimited = true;
  }

  return rateLimitBackoff;
};

export const clearRateLimitState = () => {
  rateLimitedUntil = 0;
  rateLimitBackoff = 30000;
  consecutiveRateLimits = 0;

  if (typeof window !== 'undefined') {
    delete (window as any).__supabaseRateLimited;
  }
};

export const getRateLimitResetTime = () => rateLimitedUntil;

if (typeof window !== 'undefined' && typeof (window as any).__supabaseRefreshingToken === 'undefined') {
  (window as any).__supabaseRefreshingToken = false;
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    autoRefreshTickDuration: 60,
    flowType: 'pkce',
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
    if (isRateLimited()) {
      console.log('🔐 Still rate limited, waiting...');
      return false;
    }

    clearRateLimitState();

    // Try to refresh the session
    const { data, error } = await supabase.auth.refreshSession();

    if (!error && data.session) {
      console.log('🔐 Session recovered successfully');
      clearRateLimitState();
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
