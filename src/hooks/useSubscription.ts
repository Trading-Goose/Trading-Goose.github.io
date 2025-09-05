import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth, isSessionValid } from '@/lib/auth';

interface SubscriptionInfo {
  hasSubscription: boolean;
  subscriptionStatus: string | null;
  variantName: string | null;
  currentPeriodEnd: string | null;
  customerPortalUrl: string | null;
  pendingVariantName: string | null;
  pendingChangeType: string | null;
  pendingChangeEffectiveAt: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo>({
    hasSubscription: false,
    subscriptionStatus: null,
    variantName: null,
    currentPeriodEnd: null,
    customerPortalUrl: null,
    pendingVariantName: null,
    pendingChangeType: null,
    pendingChangeEffectiveAt: null,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    async function loadSubscription() {
      if (!user) {
        setSubscriptionInfo(prev => ({
          ...prev,
          isLoading: false,
          hasSubscription: false
        }));
        return;
      }

      // Check session validity before making RPC call
      if (!isSessionValid()) {
        console.log('[useSubscription] Skipping subscription load - session invalid');
        setSubscriptionInfo(prev => ({
          ...prev,
          isLoading: false,
          hasSubscription: false
        }));
        return;
      }

      try {
        // Call the helper function to get subscription info
        const { data, error } = await supabase
          .rpc('get_user_subscription_info', { p_user_id: user.id });

        if (error) {
          console.error('Error loading subscription:', error);
          setSubscriptionInfo(prev => ({
            ...prev,
            isLoading: false,
            error: error.message
          }));
          return;
        }

        if (data && data.length > 0) {
          const subData = data[0];
          console.log('[useSubscription] Subscription data from RPC:', subData);
          setSubscriptionInfo({
            hasSubscription: subData.has_subscription,
            subscriptionStatus: subData.subscription_status,
            variantName: subData.variant_name,
            currentPeriodEnd: subData.current_period_end,
            customerPortalUrl: subData.customer_portal_url,
            pendingVariantName: subData.pending_variant_name,
            pendingChangeType: subData.pending_change_type,
            pendingChangeEffectiveAt: subData.pending_change_effective_at,
            isLoading: false,
            error: null
          });
        } else {
          setSubscriptionInfo({
            hasSubscription: false,
            subscriptionStatus: null,
            variantName: null,
            currentPeriodEnd: null,
            customerPortalUrl: null,
            pendingVariantName: null,
            pendingChangeType: null,
            pendingChangeEffectiveAt: null,
            isLoading: false,
            error: null
          });
        }
      } catch (error) {
        console.error('Error loading subscription:', error);
        setSubscriptionInfo(prev => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load subscription'
        }));
      }
    }

    loadSubscription();

    // Subscribe to subscription changes only if session is valid
    let subscription = null;
    if (user && isSessionValid()) {
      subscription = supabase
        .channel('subscription_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_subscriptions',
            filter: `user_id=eq.${user?.id}`
          },
          () => {
            // Only reload if session is still valid
            if (isSessionValid()) {
              loadSubscription();
            }
          }
        )
        .subscribe();
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [user]);

  const openCustomerPortal = () => {
    if (subscriptionInfo.customerPortalUrl) {
      window.open(subscriptionInfo.customerPortalUrl, '_blank');
    }
  };

  const formatPeriodEnd = (dateString: string | null): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isActiveSubscription = (): boolean => {
    return subscriptionInfo.subscriptionStatus === 'active' || 
           subscriptionInfo.subscriptionStatus === 'on_trial';
  };

  const getSubscriptionBadgeColor = (): string => {
    switch (subscriptionInfo.subscriptionStatus) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'on_trial':
      case 'trialing':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'past_due':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'cancelled':
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'paused':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return {
    ...subscriptionInfo,
    openCustomerPortal,
    formatPeriodEnd,
    isActiveSubscription,
    getSubscriptionBadgeColor
  };
}