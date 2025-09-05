/**
 * Hook for checking running rebalances
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth, isSessionValid } from '@/lib/auth';
import { isRebalanceActive } from '@/lib/statusTypes';

export function useRebalanceCheck() {
  const { user, isAuthenticated } = useAuth();
  const [hasRunningRebalance, setHasRunningRebalance] = useState(false);

  useEffect(() => {
    const checkRunningRebalance = async () => {
      if (!user || !isAuthenticated || !isSessionValid()) {
        console.log('useRebalanceCheck: Skipping rebalance check - session invalid or not authenticated');
        return;
      }

      try {
        const { data: rebalanceData } = await supabase
          .from('rebalance_requests')
          .select('id, status')
          .eq('user_id', user.id);

        if (rebalanceData) {
          const hasRunning = rebalanceData.some(item =>
            isRebalanceActive(item.status)
          );
          setHasRunningRebalance(hasRunning);
        }
      } catch (error) {
        console.error('Error checking running rebalance:', error);
      }
    };

    // Only set up interval if authenticated
    if (isAuthenticated && user) {
      checkRunningRebalance();
      const interval = setInterval(checkRunningRebalance, 10000);
      return () => clearInterval(interval);
    }
  }, [user, isAuthenticated]);

  return { hasRunningRebalance };
}