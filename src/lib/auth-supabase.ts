// Supabase-based authentication
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase, supabaseHelpers, type Profile, type ApiSettings } from './supabase';

interface AuthState {
  user: Profile | null;
  apiSettings: ApiSettings | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  updateApiSettings: (settings: Partial<ApiSettings>) => Promise<void>;
  loadUserData: () => Promise<void>;
  checkSession: () => Promise<void>;
  forceReload: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      apiSettings: null,
      isAuthenticated: false,
      isLoading: false,  // Start with false, will be set to true during init

      checkSession: async () => {
        // This is now mainly for manual session checks
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (session && !error) {
            await get().loadUserData();
          } else {
            set({ 
              isAuthenticated: false, 
              user: null, 
              apiSettings: null,
              isLoading: false 
            });
          }
        } catch (error) {
          console.error('Session check error:', error);
          set({ 
            isAuthenticated: false, 
            user: null, 
            apiSettings: null,
            isLoading: false 
          });
        }
      },

      login: async (email: string, password: string) => {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (error) {
            return { success: false, error: error.message };
          }

          if (data.user) {
            await get().loadUserData();
            return { success: true };
          }

          return { success: false, error: 'Login failed' };
        } catch (error) {
          console.error('Login error:', error);
          return { success: false, error: 'An unexpected error occurred' };
        }
      },

      logout: async () => {
        try {
          console.log('Logout initiated...');
          
          // Sign out from Supabase
          const { error } = await supabase.auth.signOut();
          if (error) console.error('Supabase signOut error:', error);
          
          // Clear the store state
          set({
            user: null,
            apiSettings: null,
            isAuthenticated: false,
            isLoading: false
          });
          
          // Clear persisted state
          const authStorageKey = 'auth-storage';
          localStorage.removeItem(authStorageKey);
          
          // Clear all Supabase-related storage
          const keysToRemove = Object.keys(localStorage).filter(key => 
            key.includes('supabase') || key.includes('auth')
          );
          
          keysToRemove.forEach(key => {
            console.log(`Removing ${key} from localStorage`);
            localStorage.removeItem(key);
          });
          
          // Clear session storage too
          sessionStorage.clear();
          
          console.log('Logout complete');
          
          // Force reload to clear any remaining state
          // Use the base URL from environment or default to current origin
          const basePath = import.meta.env.BASE_URL || '/';
          window.location.href = basePath;
        } catch (error) {
          console.error('Logout error:', error);
          // Even if there's an error, clear local state
          set({
            user: null,
            apiSettings: null,
            isAuthenticated: false,
            isLoading: false
          });
          localStorage.clear();
          window.location.href = '/';
        }
      },

      register: async (email: string, password: string, name: string) => {
        try {
          // Sign up the user
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { name }
            }
          });

          if (authError) {
            return { success: false, error: authError.message };
          }

          if (authData.user) {
            // Create profile record
            const { error: profileError } = await supabase
              .from('profiles')
              .insert({
                id: authData.user.id,
                email,
                name
              });

            if (profileError) {
              console.error('Profile creation error:', profileError);
            }

            // Create default API settings
            const { error: settingsError } = await supabase
              .from('api_settings')
              .insert({
                user_id: authData.user.id,
                ai_provider: 'openai',
                ai_api_key: '',
                alpha_vantage_api_key: ''
              });

            if (settingsError) {
              console.error('Settings creation error:', settingsError);
            }

            await get().loadUserData();
            return { success: true };
          }

          return { success: false, error: 'Registration failed' };
        } catch (error) {
          console.error('Registration error:', error);
          return { success: false, error: 'An unexpected error occurred' };
        }
      },

      updateApiSettings: async (settings: Partial<ApiSettings>) => {
        console.log('updateApiSettings called with:', settings);
        try {
          // Get session instead of user to avoid hanging
          const { data: { session }, error: sessionError } = await supabaseHelpers.getCurrentSession();
          
          if (sessionError || !session?.user) {
            console.error('Auth error:', sessionError);
            throw new Error('Not authenticated');
          }
          
          const userId = session.user.id;
          const currentSettings = get().apiSettings;
          
          console.log('Updating settings for user:', userId);
          console.log('Current settings:', currentSettings);
          
          let updatedSettings: ApiSettings | null;
          
          if (currentSettings) {
            // Update existing settings
            updatedSettings = await supabaseHelpers.updateApiSettings(userId, settings);
          } else {
            // Get or create settings first
            const existingSettings = await supabaseHelpers.getOrCreateApiSettings(userId);
            if (!existingSettings) throw new Error('Failed to create settings');
            
            // Then update them
            updatedSettings = await supabaseHelpers.updateApiSettings(userId, settings);
          }

          if (updatedSettings) {
            set({ apiSettings: updatedSettings });
            console.log('Settings updated successfully:', updatedSettings);
          } else {
            throw new Error('Failed to update settings');
          }
        } catch (error) {
          console.error('Update settings error:', error);
          throw error;
        }
      },

      loadUserData: async () => {
        console.log('loadUserData called');
        
        // Prevent duplicate calls
        const currentState = get();
        if (currentState.user && currentState.apiSettings) {
          console.log('User data already loaded, skipping...');
          set({ isLoading: false });
          return;
        }
        
        // Set loading state
        set({ isLoading: true });
        console.log('Loading state set to true');
        
        try {
          // Get the current session with timeout
          console.log('Getting session...');
          
          const sessionPromise = supabase.auth.getSession();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Session timeout')), 2000)
          );
          
          let session, sessionError;
          try {
            const result = await Promise.race([sessionPromise, timeoutPromise]) as any;
            session = result?.data?.session;
            sessionError = result?.error;
          } catch (timeoutErr) {
            console.error('Session fetch timeout');
            sessionError = timeoutErr;
          }
          
          console.log('Session result:', { hasSession: !!session, error: sessionError });
          
          if (sessionError || !session?.user) {
            console.error('No valid session:', sessionError);
            set({ 
              isAuthenticated: false, 
              user: null, 
              apiSettings: null, 
              isLoading: false 
            });
            return;
          }
          
          const user = session.user;
          console.log('Got user:', user.id);

          // Load profile and settings with timeout protection
          console.log('Loading profile and settings...');
          
          const loadDataWithTimeout = Promise.race([
            Promise.all([
              supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single(),
              supabaseHelpers.getOrCreateApiSettings(user.id)
            ]),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Loading timeout')), 5000)
            )
          ]);
          
          let profileResult, apiSettings;
          try {
            [profileResult, apiSettings] = await loadDataWithTimeout as any;
          } catch (timeoutError) {
            console.error('Timeout or error loading data:', timeoutError);
            // Try a simpler approach - just get what we can
            profileResult = { data: null, error: 'timeout' };
            apiSettings = null;
          }
          
          console.log('Profile result:', profileResult);
          console.log('API settings result:', apiSettings);
          
          // Handle profile - create a default if it doesn't exist
          const userData = profileResult.data || { 
            id: user.id, 
            email: user.email || '', 
            name: user.user_metadata?.name || user.email || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          // Update state with loaded data
          console.log('Updating state with user data...');
          set({
            user: userData,
            apiSettings: apiSettings,
            isAuthenticated: true,
            isLoading: false
          });
          
          console.log('User data loaded successfully', { 
            hasUser: !!userData, 
            hasApiSettings: !!apiSettings 
          });
        } catch (error) {
          console.error('Load user data error:', error);
          set({ 
            isLoading: false, 
            isAuthenticated: false,
            user: null,
            apiSettings: null
          });
        }
      },

      forceReload: async () => {
        console.log('Force reload triggered');
        // Just reload the data without clearing state first
        await get().loadUserData();
      },

      resetPassword: async (email: string) => {
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
          });

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true };
        } catch (error) {
          console.error('Reset password error:', error);
          return { success: false, error: 'Failed to send reset email' };
        }
      },

      updatePassword: async (newPassword: string) => {
        try {
          const { error } = await supabase.auth.updateUser({ 
            password: newPassword 
          });

          if (error) {
            return { success: false, error: error.message };
          }

          return { success: true };
        } catch (error) {
          console.error('Update password error:', error);
          return { success: false, error: 'Failed to update password' };
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        // Only persist the auth state, not the actual data
        isAuthenticated: state.isAuthenticated 
      })
    }
  )
);

// Initialize auth state on app load
if (typeof window !== 'undefined') {
  // Run initialization immediately
  (async () => {
    const state = useAuth.getState();
    
    // Check if already initialized
    if (state.user || state.isLoading) {
      console.log('Already initialized or loading');
      return;
    }
    
    console.log('Initializing auth...');
    
    try {
      // Get the current session from Supabase with timeout
      const sessionPromise = supabase.auth.getSession();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Init timeout')), 3000)
      );
      
      let session, error;
      try {
        const result = await Promise.race([sessionPromise, timeoutPromise]) as any;
        session = result?.data?.session;
        error = result?.error;
      } catch (timeoutErr) {
        console.error('Session init timeout, assuming no session');
        error = timeoutErr;
      }
      
      if (session && !error) {
        // We have a valid session, load user data
        console.log('Valid session found on init, loading user data');
        await state.loadUserData();
      } else {
        // No session, ensure we're in logged out state
        console.log('No session found on init');
        useAuth.setState({ 
          isAuthenticated: false, 
          user: null, 
          apiSettings: null,
          isLoading: false 
        });
      }
    } catch (err) {
      console.error('Error during auth initialization:', err);
      useAuth.setState({ 
        isAuthenticated: false, 
        user: null, 
        apiSettings: null,
        isLoading: false 
      });
    }
  })();
  
  // Listen for auth state changes
  let lastProcessedEvent: string | null = null;
  
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth state changed:', event);
    
    // Prevent duplicate processing
    if (event === 'SIGNED_IN' && lastProcessedEvent === 'SIGNED_IN') {
      console.log('Skipping duplicate SIGNED_IN event');
      return;
    }
    lastProcessedEvent = event;
    
    const state = useAuth.getState();
    
    switch (event) {
      case 'INITIAL_SESSION':
        // Let the initialization above handle this
        break;
        
      case 'SIGNED_IN':
        // Only load if we don't have user data
        if (!state.user || !state.apiSettings) {
          await state.loadUserData();
        }
        break;
        
      case 'SIGNED_OUT':
        // Clear everything immediately
        useAuth.setState({ 
          user: null, 
          apiSettings: null, 
          isAuthenticated: false,
          isLoading: false 
        });
        break;
        
      case 'TOKEN_REFRESHED':
        // Token refreshed, no action needed unless we don't have user data
        if (!state.user && session) {
          await state.loadUserData();
        }
        break;
        
      case 'USER_UPDATED':
        // User data changed, reload
        if (session) {
          await state.loadUserData();
        }
        break;
        
      case 'PASSWORD_RECOVERY':
        // Password recovery link clicked - don't load user data yet
        console.log('Password recovery mode, session:', session);
        // The ResetPassword component will handle this
        break;
    }
  });
}

// Helper to check if API keys are configured
export const hasRequiredApiKeys = (settings: ApiSettings | null): boolean => {
  if (!settings) return false;
  
  // Check if we have Alpha Vantage key
  if (!settings.alpha_vantage_api_key) return false;
  
  // Check if we have the appropriate AI provider key based on the selected provider
  let hasAIKey = false;
  switch (settings.ai_provider) {
    case 'openai':
      hasAIKey = !!settings.openai_api_key;
      break;
    case 'anthropic':
      hasAIKey = !!settings.anthropic_api_key;
      break;
    case 'google':
      hasAIKey = !!settings.google_api_key;
      break;
    case 'deepseek':
      hasAIKey = !!settings.deepseek_api_key;
      break;
    case 'openrouter':
      hasAIKey = !!settings.openrouter_api_key;
      break;
    default:
      // Fallback to ai_api_key field if it exists
      hasAIKey = !!settings.ai_api_key;
  }
  
  return hasAIKey;
};

// API key validation helpers
export const validateOpenAIKey = (key: string): boolean => {
  return key.startsWith('sk-') && key.length > 20;
};

export const validateAnthropicKey = (key: string): boolean => {
  return key.startsWith('sk-ant-') && key.length > 20;
};

export const validateOpenRouterKey = (key: string): boolean => {
  // OpenRouter keys can have different formats, so just check length
  return key.length > 20;
};

export const validateAlphaVantageKey = (key: string): boolean => {
  return key.length > 10;
};

export const validateDeepSeekKey = (key: string): boolean => {
  // DeepSeek keys typically start with 'sk-' followed by alphanumeric characters
  return key.startsWith('sk-') && key.length > 20;
};

export const validateGoogleKey = (key: string): boolean => {
  // Google API keys are typically 39 characters starting with 'AIza'
  return key.startsWith('AIza') && key.length === 39;
};