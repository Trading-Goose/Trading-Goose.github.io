import { useEffect } from 'react';
import { initializeAuth, useAuth } from '@/lib/auth';

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
    if (isAuthenticated && user?.id && window.trackAuthenticatedUser) {
      // Track authenticated user with their unique ID
      window.trackAuthenticatedUser(user.id, user.role || 'standard');
    } else if (!isAuthenticated && window.trackAnonymousPageview) {
      // Track anonymous pageview
      window.trackAnonymousPageview();
    }
  }, [isAuthenticated, user]);

  return <>{children}</>;
}