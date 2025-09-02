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
    // Initialize authentication when app starts
    initializeAuth();
  }, []);

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