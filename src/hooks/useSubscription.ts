import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

interface SubscriptionInfo {
  hasSubscription: boolean;
  subscriptionStatus: string | null;
  variantName: string | null;
  currentPeriodEnd: string | null;
  customerPortalUrl: string | null;
  isSubscriptionActive: boolean;
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
    isSubscriptionActive: false,
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
          setSubscriptionInfo({
            hasSubscription: subData.has_subscription,
            subscriptionStatus: subData.subscription_status,
            variantName: subData.variant_name,
            currentPeriodEnd: subData.current_period_end,
            customerPortalUrl: subData.customer_portal_url,
            isSubscriptionActive: subData.is_subscription_active,
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
            isSubscriptionActive: false,
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

    // Subscribe to subscription changes
    const subscription = supabase
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
          // Reload subscription when it changes
          loadSubscription();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
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
        return 'bg-green-100 text-green-800';
      case 'on_trial':
        return 'bg-blue-100 text-blue-800';
      case 'past_due':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'paused':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
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