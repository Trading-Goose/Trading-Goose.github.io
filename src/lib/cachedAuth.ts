import { supabase, registerRateLimitHit, clearRateLimitState, isRateLimited } from './supabase';
import type { Session, User } from '@supabase/supabase-js';

// Simple promise-based cache to prevent concurrent requests
let sessionPromise: Promise<Session | null> | null = null;
let userPromise: Promise<User | null> | null = null;
let cachedSession: Session | null = null;
let sessionCacheTime = 0;
const SESSION_CACHE_DURATION = 60000; // 60 seconds - increase cache duration to reduce API calls
let lastRefreshAttempt = 0;
const REFRESH_COOLDOWN = 10000; // 10 seconds minimum between refresh attempts
let rateLimitCooldownActive = false;
let authListenerRegistered = false;

const syncSessionCache = (session: Session | null) => {
  cachedSession = session;
  sessionCacheTime = session ? Date.now() : 0;
  sessionPromise = null;
  userPromise = null;
};

/**
 * Clear the session cache - useful after login/logout
 */
export const clearSessionCache = () => {
  syncSessionCache(null);
  lastRefreshAttempt = 0;
  rateLimitCooldownActive = false;
};

/**
 * Update the cached session with a fresh one
 */
export const updateCachedSession = (session: Session | null) => {
  syncSessionCache(session);
};

/**
 * Get cached session - prevents multiple concurrent auth requests
 * Uses promise caching to ensure only one request is in-flight at a time
 */
export const getCachedSession = async (): Promise<Session | null> => {
  const now = Date.now();
  
  if (rateLimitCooldownActive || isRateLimited()) {
    console.log('🔐 Rate limit cooldown active, using cached session');
    return cachedSession;
  }
  
  // Return cached session if it's still fresh and valid
  if (cachedSession && (now - sessionCacheTime) < SESSION_CACHE_DURATION) {
    // Check if JWT token is actually valid (not expired)
    let isTokenValid = false;
    
    if (cachedSession.access_token) {
      try {
        // Decode JWT to check actual token expiry
        const payload = JSON.parse(atob(cachedSession.access_token.split('.')[1]));
        const tokenExp = payload.exp;
        const currentTime = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = tokenExp - currentTime;
        
        // If token is expired
        if (timeUntilExpiry <= 0) {
          // If expired for more than 10 minutes, clear
          if (timeUntilExpiry < -600) {
            clearSessionCache();
            return null;
          } else {
            // Recently expired, return cached and let SDK refresh
            console.log(`🔐 CachedAuth: Token expired ${Math.abs(timeUntilExpiry)}s ago, allowing refresh`);
            return cachedSession;
          }
        } else {
          // Token is still valid
          isTokenValid = true;
        }
      } catch (e) {
        // Can't decode token, fall back to session.expires_at
        const expiresAt = cachedSession.expires_at || 0;
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (expiresAt <= currentTime) {
          if (currentTime - expiresAt > 600) {
            clearSessionCache();
            return null;
          } else {
            console.log(`🔐 CachedAuth: Session expired ${currentTime - expiresAt}s ago, allowing refresh`);
            return cachedSession;
          }
        } else {
          isTokenValid = true;
        }
      }
    }
    
    if (isTokenValid) {
      return cachedSession;
    }
  }
  
  // If we already have a promise in flight, return it
  if (sessionPromise) {
    return sessionPromise;
  }

  // Create new promise and cache it
  sessionPromise = (async () => {
    try {
      // Add cooldown check to prevent rapid refresh attempts
      const timeSinceLastRefresh = Date.now() - lastRefreshAttempt;
      if (timeSinceLastRefresh < REFRESH_COOLDOWN) {
        // Return cached session if we're in cooldown period
        return cachedSession;
      }
      
      lastRefreshAttempt = Date.now();
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        // Check if it's a rate limit error
        if (error.message?.includes('429') || error.message?.includes('rate')) {
          console.error('🔐 Rate limit detected in getCachedSession, enabling cooldown');
          const backoffMs = registerRateLimitHit();
          rateLimitCooldownActive = true;
          setTimeout(() => {
            rateLimitCooldownActive = false;
            clearRateLimitState();
            console.log('🔐 Rate limit cooldown cleared');
          }, backoffMs);
        } else {
          console.error('Error getting session:', error);
        }
        return cachedSession; // Return cached session on error
      }
      
      clearRateLimitState();
      rateLimitCooldownActive = false;

      syncSessionCache(session);

      return session;
    } catch (error) {
      console.error('Error in getCachedSession:', error);
      return cachedSession; // Return cached session on error
    } finally {
      // Clear the promise immediately, but keep the cached session
      sessionPromise = null;
    }
  })();

  return sessionPromise;
};

/**
 * Get cached user - prevents multiple concurrent auth requests
 * Uses promise caching to ensure only one request is in-flight at a time
 */
export const getCachedUser = async (): Promise<User | null> => {
  // If we already have a promise in flight, return it
  if (userPromise) {
    return userPromise;
  }

  // Create new promise and cache it
  userPromise = (async () => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      
      if (error) {
        console.error('Error getting user:', error);
        return null;
      }
      
      return user;
    } catch (error) {
      console.error('Error in getCachedUser:', error);
      return null;
    } finally {
      // Clear the promise after a short delay to allow fresh fetches
      setTimeout(() => {
        userPromise = null;
      }, 100);
    }
  })();

  return userPromise;
};

if (!authListenerRegistered) {
  supabase.auth.onAuthStateChange((_event, session) => {
    syncSessionCache(session);

    if (session) {
      clearRateLimitState();
      rateLimitCooldownActive = false;
    }
  });

  authListenerRegistered = true;
}

// Note: Auth state changes are handled by the main auth.ts module
// We only export helper functions here to avoid duplicate listeners
