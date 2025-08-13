import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-supabase';

interface AdminStatus {
  isAdmin: boolean;
  role: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useAdminVerification(): AdminStatus {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [adminStatus, setAdminStatus] = useState<AdminStatus>({
    isAdmin: false,
    role: null,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    console.log('useAdminVerification effect triggered', {
      hasUser: !!user,
      userEmail: user?.email,
      isAuthenticated,
      authLoading
    });
    
    async function verifyAdmin() {
      // Wait for auth to finish loading
      if (authLoading) {
        console.log('useAdminVerification: Waiting for auth to load...');
        return;
      }

      if (!isAuthenticated || !user || !user.email) {
        console.log('useAdminVerification: Not authenticated or no user', { isAuthenticated, hasUser: !!user, userEmail: user?.email });
        setAdminStatus({
          isAdmin: false,
          role: null,
          isLoading: false,
          error: null
        });
        return;
      }

      console.log('useAdminVerification: Verifying admin for', user.email);

      try {
        setAdminStatus(prev => ({ ...prev, isLoading: true, error: null }));

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('No access token available');
        }

        console.log('Calling verify-admin with URL:', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-admin`);
        console.log('Using access token:', session.access_token ? 'Present' : 'Missing');
        
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-admin`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log('Response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Admin verification failed:', errorData);
          throw new Error(errorData.error || 'Failed to verify admin status');
        }

        const data = await response.json();
        console.log('Admin verification response:', data);
        console.log('Setting admin status - isAdmin:', data.isAdmin, 'role:', data.role);
        
        setAdminStatus({
          isAdmin: Boolean(data.isAdmin),
          role: data.role,
          isLoading: false,
          error: null
        });

      } catch (error) {
        console.error('Admin verification error:', error);
        setAdminStatus({
          isAdmin: false,
          role: null,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to verify admin status'
        });
      }
    }

    verifyAdmin();
  }, [user, isAuthenticated, authLoading]);

  return adminStatus;
}