/**
 * Hook for checking running rebalances
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { isRebalanceActive } from '@/lib/statusTypes';

export function useRebalanceCheck() {
  const { user } = useAuth();
  const [hasRunningRebalance, setHasRunningRebalance] = useState(false);

  useEffect(() => {
    const checkRunningRebalance = async () => {
      if (!user) return;

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

    checkRunningRebalance();
    const interval = setInterval(checkRunningRebalance, 10000);
    return () => clearInterval(interval);
  }, [user]);

  return { hasRunningRebalance };
}