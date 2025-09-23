// Unified authentication system for all users with admin support
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from './supabase';
import type { ApiSettings, Profile } from './supabase';
import { getCachedSession, clearSessionCache, updateCachedSession } from './cachedAuth';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  // Core state
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  apiSettings: ApiSettings | null;

  // Status flags
  isAuthenticated: boolean;
  isLoading: boolean;
  isAdmin: boolean;

  // Error handling
  error: string | null;

  // Core methods
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<{ success: boolean; error?: string }>;

  // Password methods
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;

  // Settings methods
  updateApiSettings: (settings: Partial<ApiSettings>) => Promise<void>;

  // Admin methods
  checkAdminStatus: () => Promise<boolean>;
  forceAssignAdmin: () => Promise<{ success: boolean; error?: string }>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      session: null,
      user: null,
      profile: null,
      apiSettings: null,
      isAuthenticated: false,
      isLoading: false,  // Start with false, will be set to true during init
      isAdmin: false,
      error: null,

      // Initialize authentication
      initialize: async () => {
        // Prevent re-initialization if already loading or already authenticated
        const currentState = get();
        if (currentState.isLoading) {
          console.log('🔐 Auth: Already initializing, skipping...');
          return;
        }
        
        // If already authenticated with valid session, skip initialization
        if (currentState.isAuthenticated && currentState.session) {
          // Check JWT token expiry instead of session.expires_at
          let timeUntilExpiry = 0;
          try {
            if (currentState.session.access_token) {
              const payload = JSON.parse(atob(currentState.session.access_token.split('.')[1]));
              const tokenExp = payload.exp;
              const now = Math.floor(Date.now() / 1000);
              timeUntilExpiry = tokenExp - now;
            } else {
              // Fallback to session.expires_at
              const expiresAt = currentState.session.expires_at || 0;
              const now = Math.floor(Date.now() / 1000);
              timeUntilExpiry = expiresAt - now;
            }
          } catch (e) {
            // Fallback to session.expires_at
            const expiresAt = currentState.session.expires_at || 0;
            const now = Math.floor(Date.now() / 1000);
            timeUntilExpiry = expiresAt - now;
          }
          
          // If session is still valid for more than 60 seconds, skip
          if (timeUntilExpiry > 60) {
            console.log(`🔐 Auth: Already authenticated with valid session (${timeUntilExpiry}s remaining), skipping initialization`);
            return;
          }
        }

        // Check if we're on the invitation setup page
        const isInvitationSetup = window.location.pathname === '/invitation-setup';
        if (isInvitationSetup) {
          console.log('🔐 Auth: On invitation setup page, skipping initialization');
          return;
        }

        console.log('🔐 Auth: Initializing...');
        set({ isLoading: true, error: null });

        try {
          // Check if we already have a session in state (from recent login)
          const currentSession = get().session;
          let session = currentSession;
          let sessionError: any = null;
          
          // Only fetch session if we don't have one in state
          if (!currentSession) {
            session = await getCachedSession();
          }
          
          // During page refresh/initialization, give extra time for token refresh
          const pageLoadTime = (window as any).__pageLoadTime || Date.now();
          const isInitialLoad = !currentSession && (Date.now() - pageLoadTime) < 10000; // 10 second window
          if (!currentSession && !(window as any).__pageLoadTime) {
            (window as any).__pageLoadTime = Date.now();
          }

          // Check if session is valid before proceeding
          if (session) {
            // Check JWT token expiry (more accurate than session.expires_at)
            let isTokenExpired = false;
            if (session.access_token) {
              try {
                // Decode JWT token to check its expiry
                const payload = JSON.parse(atob(session.access_token.split('.')[1]));
                const tokenExp = payload.exp;
                const now = Math.floor(Date.now() / 1000);
                const timeUntilTokenExpiry = tokenExp - now;
                
                // During initial page load, be more lenient with token expiry
                if (isInitialLoad) {
                  // On page refresh, allow expired tokens for up to 30 minutes to prevent auth loss
                  if (timeUntilTokenExpiry < -1800) {
                    console.log(`🔐 Auth: JWT token expired for ${Math.abs(timeUntilTokenExpiry)}s during page load (>30min), clearing`);
                    isTokenExpired = true;
                  } else {
                    console.log(`🔐 Auth: JWT token ${timeUntilTokenExpiry < 0 ? 'expired' : 'valid'} ${Math.abs(timeUntilTokenExpiry)}s during page load, allowing`);
                    isTokenExpired = false;
                  }
                } else {
                  // Normal runtime - use 30-minute grace period to prevent auth loss during navigation
                  if (timeUntilTokenExpiry < -1800) {
                    console.log('🔐 Auth: JWT token expired for >30min, clearing');
                    isTokenExpired = true;
                  } else if (timeUntilTokenExpiry <= 0) {
                    console.log(`🔐 Auth: JWT token recently expired (${timeUntilTokenExpiry}s), allowing SDK to refresh`);
                    isTokenExpired = false; // Let SDK handle refresh
                  } else {
                    console.log(`🔐 Auth: JWT token valid for ${timeUntilTokenExpiry} seconds`);
                  }
                }
              } catch (e) {
                console.error('Failed to decode JWT token:', e);
                // If we can't decode the token, check session expiry as fallback
                const expiresAt = session.expires_at || 0;
                const now = Math.floor(Date.now() / 1000);
                const timeUntilExpiry = expiresAt - now;
                console.log(`🔐 Auth: Session valid for ${timeUntilExpiry} seconds (fallback)`);
                // Use same logic for session expiry as JWT - 30-minute grace period
                isTokenExpired = timeUntilExpiry < -1800;
              }
            } else {
              // No access token, session is invalid
              isTokenExpired = true;
            }
            
            // If token is expired, try to restore from localStorage before clearing
            if (isTokenExpired) {
              console.log('🔐 Auth: Token/Session expired, attempting restoration...');
              
              // Try to get a fresh session from localStorage
              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
              const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
              const storedSession = localStorage.getItem(storageKey);
              
              if (storedSession) {
                try {
                  const sessionData = JSON.parse(storedSession);
                  if (sessionData?.access_token) {
                    console.log('🔐 Auth: Found stored session during expiry, attempting refresh...');
                    
                    // Force token refresh instead of using expired session
                    const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
                    
                    if (!refreshError && refreshedSession.session) {
                      console.log('🔐 Auth: Successfully refreshed expired session');
                      session = refreshedSession.session;
                      updateCachedSession(refreshedSession.session);
                      isTokenExpired = false;
                    } else {
                      console.log('🔐 Auth: Could not refresh expired session:', refreshError?.message);
                      // Don't use the stored session as it's expired - clear it
                      console.log('🔐 Auth: Clearing expired session');
                      session = null;
                      isTokenExpired = true;
                    }
                  }
                } catch (e) {
                  console.log('🔐 Auth: Could not parse stored session');
                }
              }
              
              // Only clear if we absolutely can't restore
              if (isTokenExpired) {
                console.log('🔐 Auth: Could not restore session, clearing...');
                session = null;
                clearSessionCache();
                
                // Set a flag to indicate session expired naturally (not due to rate limit)
                (window as any).__sessionExpiredNaturally = true;
                
                // Don't try to refresh - just clear the state
                set({
                  session: null,
                  user: null,
                  profile: null,
                  apiSettings: null,
                  isAuthenticated: false,
                  isAdmin: false,
                  isLoading: false,
                  error: 'Your session has expired. Please log in again.'
                });
                return;
              }
            }
          }

          if (sessionError) {
            console.error('Session error:', sessionError);
            set({
              session: null,
              user: null,
              profile: null,
              apiSettings: null,
              isAuthenticated: false,
              isAdmin: false,
              isLoading: false,
              error: sessionError.message
            });
            return;
          }

          if (!session) {
            console.log('🔐 No session found');
            set({
              session: null,
              user: null,
              profile: null,
              apiSettings: null,
              isAuthenticated: false,
              isAdmin: false,
              isLoading: false,
              error: null
            });
            return;
          }

          console.log('🔐 Session found for:', session.user.email);

          // Load profile
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          const profile = profileData || {
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name || session.user.email || '',
            created_at: new Date().toISOString()
          };

          // Load API settings via settings-proxy (with masking)
          let apiSettings = null;
          try {
            const { data: proxyData, error: proxyError } = await supabase.functions.invoke('settings-proxy', {
              body: {
                action: 'get_settings'
              }
            });

            if (!proxyError && proxyData.settings) {
              apiSettings = proxyData.settings;
              console.log('🔐 Auth: Loaded settings from proxy:', {
                analysis_optimization: apiSettings.analysis_optimization,
                analysis_history_days: apiSettings.analysis_history_days,
                hasOptimization: 'analysis_optimization' in apiSettings,
                hasHistoryDays: 'analysis_history_days' in apiSettings
              });
            } else {
              console.log('No settings found via proxy, will create defaults');
            }
          } catch (proxyError) {
            console.error('Error loading settings via proxy:', proxyError);
          }

          // Create default settings if none exist (via settings-proxy)
          if (!apiSettings) {
            try {
              const { data: createData, error: createError } = await supabase.functions.invoke('settings-proxy', {
                body: {
                  action: 'update_settings',
                  settings: {
                    ai_provider: 'openai',
                    ai_api_key: '',
                    ai_model: 'gpt-4'
                  }
                }
              });

              if (!createError && createData.success) {
                apiSettings = createData.settings;
              }
            } catch (createError) {
              console.error('Error creating default settings:', createError);
            }
          }

          // Check admin status using RPC function to avoid 500 errors
          let isAdmin = false;
          try {
            // Use RPC function which handles the query properly
            const { data: userRoles, error } = await supabase
              .rpc('get_user_roles', { p_user_id: session.user.id });

            if (error) {
              console.warn('Admin check via RPC failed, trying direct query:', error);
              // Fallback to direct query
              const { data: roles } = await supabase
                .from('roles')
                .select('name')
                .eq('id', session.user.id)
                .single();

              isAdmin = roles?.name === 'admin' || false;
            } else if (userRoles && userRoles.length > 0) {
              isAdmin = userRoles.some((r: any) => r.role_name === 'admin' || r.role_name === 'super_admin');
            }
          } catch (error) {
            console.error('Admin check error:', error);
            isAdmin = false;
          }

          set({
            session,
            user: session.user,
            profile,
            apiSettings,
            isAuthenticated: true,
            isAdmin,
            isLoading: false,
            error: null
          });

          console.log('🔐 Auth initialized:', {
            email: session.user.email,
            isAdmin
          });

        } catch (error) {
          console.error('Auth initialization error:', error);
          set({
            session: null,
            user: null,
            profile: null,
            apiSettings: null,
            isAuthenticated: false,
            isAdmin: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Failed to initialize'
          });
        }
      },

      // Login
      login: async (email: string, password: string) => {
        console.log('🔐 Login attempt for:', email);
        set({ isLoading: true, error: null });
        
        // Clear cached sessions before login to avoid conflicts
        clearSessionCache();

        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (error) {
            set({ isLoading: false, error: error.message });
            return { success: false, error: error.message };
          }

          if (data.session && data.user) {
            console.log('🔐 Login successful, initializing with fresh session');
            
            // Update the cache with the fresh session
            updateCachedSession(data.session);
            
            // Mark that we're in a login flow to prevent re-initialization
            (window as any).__isLoginFlow = true;
            (window as any).__lastAuthTime = Date.now();
            
            // Immediately set the authenticated state with the fresh session
            set({
              session: data.session,
              user: data.user,
              isAuthenticated: true,
              isLoading: true // Keep loading while we fetch profile
            });

            // Now fetch the profile and other data
            try {
              // Load profile
              const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .single();

              const profile = profileData || {
                id: data.user.id,
                email: data.user.email || '',
                name: data.user.user_metadata?.name || data.user.email || '',
                created_at: new Date().toISOString()
              };

              // Load API settings via settings-proxy
              let apiSettings = null;
              try {
                const { data: proxyData, error: proxyError } = await supabase.functions.invoke('settings-proxy', {
                  body: {
                    action: 'get_settings'
                  }
                });

                if (!proxyError && proxyData.settings) {
                  apiSettings = proxyData.settings;
                }
              } catch (proxyError) {
                console.error('Error loading settings via proxy:', proxyError);
              }

              // Check admin status
              let isAdmin = false;
              try {
                const { data: userRoles, error } = await supabase
                  .rpc('get_user_roles', { p_user_id: data.user.id });

                if (!error && userRoles && userRoles.length > 0) {
                  isAdmin = userRoles.some((r: any) => r.role_name === 'admin' || r.role_name === 'super_admin');
                }
              } catch (error) {
                console.error('Admin check error:', error);
              }

              // Update state with all the data
              set({
                session: data.session,
                user: data.user,
                profile,
                apiSettings,
                isAuthenticated: true,
                isAdmin,
                isLoading: false,
                error: null
              });

              console.log('🔐 Login complete:', {
                email: data.user.email,
                isAdmin
              });

              // Clear the login flow flag after a longer delay to allow components to initialize
              setTimeout(() => {
                delete (window as any).__isLoginFlow;
              }, 10000); // Extend to 10 seconds

              return { success: true };
              
            } catch (error) {
              console.error('Error loading user data:', error);
              // Still logged in, just couldn't load extra data
              set({ isLoading: false });
              return { success: true };
            }
          }

          set({ isLoading: false });
          return { success: false, error: 'Login failed' };

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Login failed';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },

      // Logout
      logout: async () => {
        console.log('🔐 Logging out...');
        set({ isLoading: true });

        try {
          // Clear state first
          set({
            session: null,
            user: null,
            profile: null,
            apiSettings: null,
            isAuthenticated: false,
            isAdmin: false,
            error: null
          });

          // Sign out from Supabase
          await supabase.auth.signOut();

          // Clear local storage
          localStorage.removeItem('auth-storage');

        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      // Register
      register: async (email: string, password: string, username: string) => {
        console.log('🔐 Register attempt for:', email);
        set({ isLoading: true, error: null });

        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { name: username, username }
            }
          });

          if (error) {
            set({ isLoading: false, error: error.message });
            return { success: false, error: error.message };
          }

          if (data.user) {
            // Create profile
            await supabase
              .from('profiles')
              .insert({
                id: data.user.id,
                email,
                name: username,
                created_at: new Date().toISOString()
              });

            // If session exists (email confirmation disabled), initialize
            if (data.session) {
              await get().initialize();
            } else {
              set({ isLoading: false });
            }

            return { success: true };
          }

          set({ isLoading: false });
          return { success: false, error: 'Registration failed' };

        } catch (error) {
          const message = error instanceof Error ? error.message : 'Registration failed';
          set({ isLoading: false, error: message });
          return { success: false, error: message };
        }
      },

      // Reset password
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
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to send reset email'
          };
        }
      },

      // Update password
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
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update password'
          };
        }
      },

      // Update API settings via settings-proxy
      updateApiSettings: async (settings: Partial<ApiSettings>) => {
        const state = get();
        if (!state.user) {
          throw new Error('Not authenticated');
        }

        try {
          const { data, error } = await supabase.functions.invoke('settings-proxy', {
            body: {
              action: 'update_settings',
              settings: settings
            }
          });

          if (error) throw error;

          if (data.success && data.settings) {
            set({ apiSettings: data.settings });
          } else {
            throw new Error(data.error || 'Failed to update settings');
          }
        } catch (error) {
          console.error('Update settings error:', error);
          throw error;
        }
      },

      // Check admin status
      checkAdminStatus: async () => {
        const state = get();
        if (!state.user) return false;

        try {
          // Use RPC function to check admin status
          const { data: userRoles, error } = await supabase
            .rpc('get_user_roles', { p_user_id: state.user.id });

          let isAdmin = false;

          if (!error && userRoles && userRoles.length > 0) {
            isAdmin = userRoles.some((r: any) => r.role_name === 'admin' || r.role_name === 'super_admin');
          }

          set({ isAdmin });
          return isAdmin;

        } catch (error) {
          console.error('Admin check error:', error);
          set({ isAdmin: false });
          return false;
        }
      },

      // Force assign admin (for first user)
      forceAssignAdmin: async () => {
        try {
          const { data, error } = await supabase
            .rpc('force_assign_admin_to_first_user');

          if (error) {
            return { success: false, error: error.message };
          }

          if (data?.success) {
            // Reload to get new admin status
            await get().initialize();
            return { success: true };
          }

          return {
            success: false,
            error: data?.error || 'Failed to assign admin role'
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to assign admin'
          };
        }
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Don't persist sensitive data
        isAuthenticated: state.isAuthenticated,
        isAdmin: state.isAdmin
      })
    }
  )
);

// Global singleton to ensure only ONE auth listener across all module instances
const globalAuthState = (() => {
  const key = '__auth_listener_singleton__';
  if (!(window as any)[key]) {
    (window as any)[key] = {
      initialized: false,
      subscription: null as any,
      cleanup: () => {
        const state = (window as any)[key];
        if (state?.subscription) {
          state.subscription.unsubscribe();
          state.subscription = null;
        }
        state.initialized = false;
        
        // Clean up auth check interval
        const authCheckInterval = (window as any).__authCheckInterval;
        if (authCheckInterval) {
          clearInterval(authCheckInterval);
          delete (window as any).__authCheckInterval;
        }
      }
    };
  }
  return (window as any)[key];
})();

export const initializeAuth = () => {
  // Track page load time for more lenient token validation during page refresh
  if (!(window as any).__pageLoadTime) {
    (window as any).__pageLoadTime = Date.now();
  }
  
  // Use global state to prevent multiple listeners
  if (globalAuthState.initialized) {
    console.log('🔐 Auth already initialized globally, skipping...');
    return;
  }
  
  // Clean up any existing subscription first
  globalAuthState.cleanup();
  
  globalAuthState.initialized = true;

  // Try to immediately restore session from localStorage on page load
  const currentState = useAuth.getState();
  if (!currentState.isAuthenticated) {
    console.log('🔐 Page load - attempting immediate session restoration');
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
    const storedSession = localStorage.getItem(storageKey);
    
    if (storedSession) {
      try {
        const sessionData = JSON.parse(storedSession);
        if (sessionData?.access_token) {
          const payload = JSON.parse(atob(sessionData.access_token.split('.')[1]));
          const tokenExp = payload.exp;
          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = tokenExp - now;
          
          // If we have a session that's valid or expired less than 2 hours ago, restore immediately
          if (timeUntilExpiry > -7200) {
            console.log('🔐 Found valid stored session on page load, setting authenticated state immediately');
            useAuth.setState({
              session: sessionData,
              user: sessionData.user,
              isAuthenticated: true,
              isLoading: true, // Keep loading while we fetch profile data
              error: null
            });
          }
        }
      } catch (e) {
        console.log('🔐 Could not parse stored session on page load');
      }
    }
  }

  // Initial load
  useAuth.getState().initialize();
  
  // Set up a periodic check to restore auth if lost (every 5 seconds)
  const authCheckInterval = setInterval(async () => {
    const state = useAuth.getState();
    
    // Check if current JWT token is about to expire and warn user
    if (state.isAuthenticated && state.session?.access_token) {
      let timeUntilExpiry = 0;
      
      try {
        // Check JWT token expiry
        const payload = JSON.parse(atob(state.session.access_token.split('.')[1]));
        const tokenExp = payload.exp;
        const now = Math.floor(Date.now() / 1000);
        timeUntilExpiry = tokenExp - now;
      } catch (e) {
        // Fallback to session expiry
        if (state.session.expires_at) {
          const expiresAt = state.session.expires_at;
          const now = Math.floor(Date.now() / 1000);
          timeUntilExpiry = expiresAt - now;
        }
      }
      
      // Proactively refresh token when it has less than 10 minutes remaining
      // But add a cooldown to prevent multiple refresh attempts
      const lastRefreshAttempt = (window as any).__lastTokenRefreshAttempt || 0;
      const refreshCooldown = 60000; // 1 minute cooldown between refresh attempts
      
      if (timeUntilExpiry > 0 && timeUntilExpiry < 600 && 
          !(window as any).__tokenRefreshTriggered &&
          (Date.now() - lastRefreshAttempt) > refreshCooldown) {
        (window as any).__tokenRefreshTriggered = true;
        (window as any).__lastTokenRefreshAttempt = Date.now();
        console.log('🔐 Token expiring in', Math.floor(timeUntilExpiry / 60), 'minutes - triggering refresh');
        
        // Trigger token refresh
        supabase.auth.refreshSession().then(({ data: { session }, error }) => {
          if (error) {
            console.error('🔐 Error refreshing session:', error);
            
            // Handle invalid refresh token (400 error)
            if (error.status === 400 || error.message?.includes('refresh_token')) {
              console.error('🔐 Refresh token is invalid, user needs to re-authenticate');
              // Mark that we need to sign out soon
              (window as any).__invalidRefreshToken = true;
              
              // Give user time to save work (wait until token expires)
              setTimeout(() => {
                if ((window as any).__invalidRefreshToken) {
                  console.log('🔐 Logging out due to invalid refresh token');
                  (window as any).__sessionExpiredNaturally = true;
                  useAuth.getState().logout();
                }
              }, Math.max(0, timeUntilExpiry * 1000));
            }
          } else if (session) {
            console.log('🔐 Session refreshed proactively');
            delete (window as any).__invalidRefreshToken;
            // The TOKEN_REFRESHED event handler will update the state
          }
        });
      }
      
      // Warn when session has less than 5 minutes remaining
      if (timeUntilExpiry > 0 && timeUntilExpiry < 300 && !(window as any).__sessionExpiryWarned) {
        (window as any).__sessionExpiryWarned = true;
        console.log('🔐 Session expiring in', Math.floor(timeUntilExpiry / 60), 'minutes');
        // Could trigger a toast notification here if needed
      }
      
      // Reset warning and refresh flags when session is refreshed
      if (timeUntilExpiry > 600) {
        delete (window as any).__sessionExpiryWarned;
        delete (window as any).__tokenRefreshTriggered;
      }
    }
    
    // If not authenticated and not loading, check localStorage for valid session
    if (!state.isAuthenticated && !state.isLoading && !(window as any).__supabaseRateLimited) {
      // Skip restoration if session expired naturally
      if ((window as any).__sessionExpiredNaturally) {
        return;
      }
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
      const storedSession = localStorage.getItem(storageKey);
      
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession);
          if (sessionData?.access_token) {
            let timeUntilExpiry = 0;
            
            try {
              // Check JWT token expiry
              const payload = JSON.parse(atob(sessionData.access_token.split('.')[1]));
              const tokenExp = payload.exp;
              const now = Math.floor(Date.now() / 1000);
              timeUntilExpiry = tokenExp - now;
            } catch (e) {
              // Fallback to session expiry
              if (sessionData.expires_at) {
                const expiresAt = sessionData.expires_at;
                const now = Math.floor(Date.now() / 1000);
                timeUntilExpiry = expiresAt - now;
              } else {
                // Can't determine expiry, assume expired
                timeUntilExpiry = -1;
              }
            }
            
            // If session is valid for more than 60 seconds, restore it
            if (timeUntilExpiry > 60) {
              console.log('🔐 Auth state lost but valid session found, restoring...');
              useAuth.getState().initialize();
            } else if (timeUntilExpiry <= 0) {
              // Session in localStorage is expired, clean it up
              console.log('🔐 Expired session found in localStorage, cleaning up...');
              localStorage.removeItem(storageKey);
              (window as any).__sessionExpiredNaturally = true;
            }
          }
        } catch (e) {
          // Invalid stored session
        }
      }
    }
  }, 5000);
  
  // Store the interval for cleanup
  (window as any).__authCheckInterval = authCheckInterval;

  // Listen for auth state changes with proper cleanup
  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    // Only log important events
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      console.log('🔐 Auth state changed:', event);
    }

    const currentState = useAuth.getState();

    // Check if we're on the invitation setup page
    const isInvitationSetup = window.location.pathname === '/invitation-setup';

    if (event === 'SIGNED_IN') {
      // Skip initialization if we're on the invitation setup page
      if (isInvitationSetup) {
        console.log('🔐 On invitation setup page, skipping auto-initialization');
        return;
      }

      // Skip if this is from a login flow
      if ((window as any).__isLoginFlow) {
        console.log('🔐 Login flow in progress, skipping SIGNED_IN initialization');
        return;
      }

      // If we're already authenticated with a valid session, don't re-initialize
      // This prevents the issue where login sets the state, then SIGNED_IN tries to re-initialize
      if (currentState.isAuthenticated && currentState.session) {
        // Check if the session from the event has a different access token
        if (session && session.access_token !== currentState.session.access_token) {
          // Update with the new session if it's different
          const expiresAt = session.expires_at || 0;
          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = expiresAt - now;
          
          if (timeUntilExpiry > 0) {
            console.log('🔐 Updating session from SIGNED_IN event');
            useAuth.setState({
              session,
              user: session.user
            });
            updateCachedSession(session);
          }
        }
        return;
      }

      // Only initialize if we're not already authenticated
      if (!currentState.isAuthenticated && session) {
        // Check if the session from the event is valid before using it
        const expiresAt = session.expires_at || 0;
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = expiresAt - now;
        
        if (timeUntilExpiry <= 0) {
          console.log('🔐 SIGNED_IN event has expired session, will wait for token refresh');
          // Don't clear auth state here - Supabase will attempt to refresh the token
          // The TOKEN_REFRESHED event will handle updating the session
          return;
        }
        
        // Delay slightly to prevent race conditions with login flow
        setTimeout(() => {
          useAuth.getState().initialize();
        }, 100);
      }
    } else if (event === 'TOKEN_REFRESHED') {
      // Update the session and cache it for future use
      if (session && currentState.isAuthenticated) {
        // Only update if the session actually changed
        if (currentState.session?.access_token !== session.access_token) {
          console.log('🔐 Token refreshed, updating session');
          useAuth.setState({
            session,
            user: session.user
          });
          // Update the cached session to ensure persistence
          updateCachedSession(session);
        }
      }
      // DO NOT call initialize() here to avoid refresh loops
    } else if (event === 'USER_UPDATED') {
      // User data was updated (like profile changes)
      // Only re-initialize if we're authenticated and not already loading
      if (session && currentState.isAuthenticated && !currentState.isLoading) {
        console.log('🔐 User updated, refreshing profile data');
        await useAuth.getState().initialize();
      }
    } else if (event === 'SIGNED_OUT') {
      console.log('🔐 SIGNED_OUT event received, checking if we should ignore...');
      
      // ALWAYS try to restore from localStorage first before clearing auth state
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
      const storedSession = localStorage.getItem(storageKey);
      
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession);
          if (sessionData?.access_token) {
            const payload = JSON.parse(atob(sessionData.access_token.split('.')[1]));
            const tokenExp = payload.exp;
            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = tokenExp - now;
            
            // If we have a session that's valid or expired less than 2 hours ago, restore it
            if (timeUntilExpiry > -7200) {
              console.log('🔐 SIGNED_OUT but found valid stored session, restoring instead of clearing');
              setTimeout(() => {
                if (!useAuth.getState().isAuthenticated) {
                  useAuth.getState().initialize();
                }
              }, 500);
              return; // Don't clear auth state
            }
          }
        } catch (e) {
          // Invalid stored session, continue with clearing
        }
      }
      
      // Check if this is a natural session expiry
      const isNaturalExpiry = (window as any).__sessionExpiredNaturally;
      
      // Check if we're in a rate limit situation
      const isRateLimited = (window as any).__supabaseRateLimited;
      
      // Check if we're in a rate limit situation or just logged in
      const authTime = (window as any).__lastAuthTime;
      const isRecentlyAuthenticated = authTime && (Date.now() - authTime) < 30000; // Within 30 seconds of login
      const isInLoginFlow = (window as any).__isLoginFlow;
      
      // If it's a natural expiry, let it proceed to sign out
      if (isNaturalExpiry) {
        console.log('🔐 Session expired naturally, signing out...');
        delete (window as any).__sessionExpiredNaturally;
        // Continue with normal sign out
      } else if (isRateLimited || isRecentlyAuthenticated || isInLoginFlow) {
        // If we're rate limited, recently logged in, or in login flow, ignore this SIGNED_OUT
        // It's likely from a rate-limited token refresh
        console.log('🔐 Ignoring SIGNED_OUT event - rate limited or recently authenticated');
        
        // Save the current session before it gets cleared
        const savedSession = currentState.session;
        const savedUser = currentState.user;
        const savedProfile = currentState.profile;
        const savedApiSettings = currentState.apiSettings;
        const savedIsAdmin = currentState.isAdmin;
        
        // If we had a valid session, restore it immediately
        if (savedSession && savedUser) {
          console.log('🔐 Preserving auth state during rate limit');
          // Use setTimeout to ensure this happens after any state clearing
          setTimeout(() => {
            useAuth.setState({
              session: savedSession,
              user: savedUser,
              profile: savedProfile,
              apiSettings: savedApiSettings,
              isAuthenticated: true,
              isAdmin: savedIsAdmin,
              isLoading: false,
              error: null
            });
            // Also update the cached session
            updateCachedSession(savedSession);
          }, 0);
        }
        return;
      }
      
      // Clean up any running intervals on sign out
      const intervalKeys = [
        '__portfolioPositionsInterval',
        '__portfolioAnalysisInterval', 
        '__watchlistRebalanceInterval',
        '__watchlistAnalysisInterval',
        '__alpacaConnectionInterval'
      ];
      
      intervalKeys.forEach(key => {
        const interval = (window as any)[key];
        if (interval) {
          clearInterval(interval);
          delete (window as any)[key];
          console.log(`🔐 Cleared interval: ${key}`);
        }
      });
      
      // Clear state
      const errorMessage = isNaturalExpiry 
        ? 'Your session has expired. Please log in again.'
        : null;
      
      useAuth.setState({
        session: null,
        user: null,
        profile: null,
        apiSettings: null,
        isAuthenticated: false,
        isAdmin: false,
        isLoading: false,
        error: errorMessage
      });
    }
  });
  
  // Store the subscription globally
  if (data?.subscription) {
    globalAuthState.subscription = data.subscription;
  }
};

// Clean up on module hot reload
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Use global cleanup
    globalAuthState.cleanup();
  });
}

// Also clean up on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    globalAuthState.cleanup();
  });
  
  // Add window focus listener to restore authentication
  window.addEventListener('focus', () => {
    const state = useAuth.getState();
    if (!state.isAuthenticated && !state.isLoading) {
      console.log('🔐 Window focus - checking for stored session');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
      const storedSession = localStorage.getItem(storageKey);
      
      if (storedSession) {
        try {
          const sessionData = JSON.parse(storedSession);
          if (sessionData?.access_token) {
            const payload = JSON.parse(atob(sessionData.access_token.split('.')[1]));
            const tokenExp = payload.exp;
            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = tokenExp - now;
            
            if (timeUntilExpiry > -7200) { // 2 hour grace period
              console.log('🔐 Restoring session on window focus');
              useAuth.getState().initialize();
            }
          }
        } catch (e) {
          // Invalid stored session
        }
      }
    }
  });
}

// Utility functions for backward compatibility
export const getCurrentUser = () => useAuth.getState().user;
export const getSession = () => useAuth.getState().session;
export const isAuthenticated = () => useAuth.getState().isAuthenticated;
export const isAdmin = () => useAuth.getState().isAdmin;

// Helper function to check if the session is valid and not expired
export const isSessionValid = (): boolean => {
  const state = useAuth.getState();
  
  // Check if we have an invalid refresh token flag
  if ((window as any).__invalidRefreshToken) {
    console.log('🔐 isSessionValid: Invalid refresh token detected, returning false');
    return false;
  }
  
  // If authenticated, allow it - the token refresh system will handle expiry
  if (state.isAuthenticated && state.session?.access_token) {
    try {
      const payload = JSON.parse(atob(state.session.access_token.split('.')[1]));
      const tokenExp = payload.exp;
      const now = Math.floor(Date.now() / 1000);
      const timeUntilExpiry = tokenExp - now;
      
      // Only return false if token is expired by more than 2 hours (very expired)
      // This prevents normal token refresh scenarios from blocking the UI
      if (timeUntilExpiry < -7200) {
        console.log('🔐 isSessionValid: Token very expired (>2h), returning false');
        return false;
      }
      
      console.log('🔐 isSessionValid: User is authenticated, returning true');
      return true;
    } catch (e) {
      // If we can't decode the token, still return true if authenticated
      console.log('🔐 isSessionValid: User is authenticated (fallback), returning true');
      return true;
    }
  }
  
  // If we're rate limited, consider session as valid to prevent unnecessary API calls
  if ((window as any).__supabaseRateLimited) {
    console.log('🔐 isSessionValid: Rate limited, returning true');
    return true;
  }
  
  // If auth is still loading, consider session as valid to prevent premature failures
  if (state.isLoading) {
    console.log('🔐 isSessionValid: Loading, returning true');
    return true;
  }
  
  // Check if we have a valid session in localStorage that we can restore
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const storageKey = `sb-${supabaseUrl.split('//')[1].split('.')[0]}-auth-token`;
  const storedSession = localStorage.getItem(storageKey);
  
  if (storedSession) {
    try {
      const sessionData = JSON.parse(storedSession);
      if (sessionData?.access_token) {
        // Check JWT token expiry
        try {
          const payload = JSON.parse(atob(sessionData.access_token.split('.')[1]));
          const tokenExp = payload.exp;
          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = tokenExp - now;
          
          // If token is valid or expired less than 2 hours ago, consider session valid
          // Be very lenient to prevent auth loss during normal usage
          if (timeUntilExpiry > -7200) {
            console.log(`🔐 isSessionValid: Found stored session (expires in ${timeUntilExpiry}s), triggering restore`);
            // Trigger session restoration
            setTimeout(() => {
              if (!useAuth.getState().isAuthenticated) {
                console.log('🔐 Restoring session from localStorage');
                useAuth.getState().initialize();
              }
            }, 100);
            return true;
          }
        } catch (e) {
          // Fallback to session expiry
          if (sessionData.expires_at) {
            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = sessionData.expires_at - now;
            if (timeUntilExpiry > -7200) {
              console.log(`🔐 isSessionValid: Found stored session (fallback, expires in ${timeUntilExpiry}s), triggering restore`);
              setTimeout(() => {
                if (!useAuth.getState().isAuthenticated) {
                  console.log('🔐 Restoring session from localStorage (fallback)');
                  useAuth.getState().initialize();
                }
              }, 100);
              return true;
            }
          }
        }
      }
    } catch (e) {
      // Invalid stored session
    }
  }
  
  console.log('🔐 isSessionValid: No valid session found, returning false');
  return false;
};

// Check if required API keys are configured
export const hasRequiredApiKeys = (settings: ApiSettings | null): boolean => {
  if (!settings) return false;

  const provider = settings.ai_provider;
  const apiKey = settings.ai_api_key;

  if (!provider || !apiKey) return false;

  // Settings fetched via settings-proxy return masked keys (with • characters).
  // Treat masked values as valid so the UI reflects the saved configuration.
  if (apiKey.includes('•') || apiKey.includes('*')) {
    return true;
  }

  // Check if the API key appears valid based on provider
  switch (provider) {
    case 'openai':
      return apiKey.startsWith('sk-') && apiKey.length > 20;
    case 'anthropic':
      return apiKey.startsWith('sk-ant-') && apiKey.length > 20;
    case 'openrouter':
      return apiKey.startsWith('sk-or-') && apiKey.length > 20;
    default:
      return apiKey.length > 10;
  }
};

// API Key validators (for Settings page compatibility)
export const validateOpenAIKey = (key: string): boolean => {
  return key.startsWith('sk-') && key.length > 20;
};

export const validateAnthropicKey = (key: string): boolean => {
  return key.startsWith('sk-ant-') && key.length > 20;
};

export const validateOpenRouterKey = (key: string): boolean => {
  return key.startsWith('sk-or-') && key.length > 20;
};


export const validateDeepSeekKey = (key: string): boolean => {
  return key.startsWith('sk-') && key.length > 20;
};

export const validateGoogleKey = (key: string): boolean => {
  return key.startsWith('AIza') && key.length > 30;
};

// Check if Alpaca credentials are configured
export const hasAlpacaCredentials = (settings: ApiSettings | null): boolean => {
  if (!settings) return false;
  
  const isPaper = settings.alpaca_paper_trading ?? true;
  
  if (isPaper) {
    // For paper trading, check paper API keys
    return !!(settings.alpaca_paper_api_key && settings.alpaca_paper_secret_key);
  } else {
    // For live trading, check live API keys
    return !!(settings.alpaca_live_api_key && settings.alpaca_live_secret_key);
  }
};
