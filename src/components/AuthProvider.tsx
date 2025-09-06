import { useEffect } from 'react';
import { initializeAuth, useAuth } from '@/lib/auth';
import { identifyUser } from '@/hooks/usePostHog';
import posthog from '@/lib/posthog';

declare global {
  interface Window {
    trackAuthenticatedUser: (userId: string, userType?: string) => void;
    trackAnonymousPageview: () => void;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    // Initialize authentication when app starts - this is idempotent
    initializeAuth();
    
    // Clean up on unmount (important for preventing memory leaks)
    return () => {
      // The cleanup is handled by the global state in auth.ts
    };
  }, []); // Empty dependency array ensures this only runs once

  useEffect(() => {
    // Track user based on authentication status
    if (isAuthenticated && user?.id) {
      // Identify user in PostHog
      identifyUser(user.id, {
        email: user.email,
        role: user.role || 'standard',
        created_at: user.created_at,
      });
      
      // Also track in Google Analytics if available
      if (window.trackAuthenticatedUser) {
        window.trackAuthenticatedUser(user.id, user.role || 'standard');
      }
    } else if (!isAuthenticated) {
      // Reset PostHog user when logged out
      posthog.reset();
      
      // Track anonymous pageview in Google Analytics if available
      if (window.trackAnonymousPageview) {
        window.trackAnonymousPageview();
      }
    }
  }, [isAuthenticated, user]);

  return <>{children}</>;
}