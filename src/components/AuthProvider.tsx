import { useEffect } from 'react';
import { initializeAuth } from '@/lib/auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize authentication when app starts
    initializeAuth();
  }, []);

  return <>{children}</>;
}