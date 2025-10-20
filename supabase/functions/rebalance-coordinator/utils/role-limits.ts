/**
 * Fetch user's role-based limits from the database
 * Uses the get_user_role_limits RPC function to get the highest priority role's limits
 */ export async function getUserRoleLimits(supabase, userId) {
  console.log(`📋 Fetching role limits for user: ${userId}`);
  try {
    // Call the RPC function to get user's role limits
    const { data, error } = await supabase.rpc('get_user_role_limits', {
      p_user_id: userId
    });
    if (error) {
      console.error('❌ Error fetching user role limits:', error);
      // Return default limits on error
      return getDefaultLimits();
    }
    // The RPC function returns a single row with all limits
    if (data && data.length > 0) {
      const limits = data[0];
      console.log(`✅ Found role limits for user:`, {
        max_parallel_analysis: limits.max_parallel_analysis,
        max_rebalance_stocks: limits.max_rebalance_stocks,
        rebalance_access: limits.rebalance_access
      });
      // Log the raw value to debug
      console.log(`📊 Raw max_rebalance_stocks value: ${limits.max_rebalance_stocks} (type: ${typeof limits.max_rebalance_stocks})`);
      // Use the value directly if it's a valid number, including 0
      // Only use fallback if it's null or undefined
      return {
        max_watchlist_stocks: limits.max_watchlist_stocks ?? 10,
        max_rebalance_stocks: limits.max_rebalance_stocks ?? 5,
        max_scheduled_rebalances: limits.max_scheduled_rebalances ?? 1,
        max_parallel_analysis: limits.max_parallel_analysis ?? 1,
        schedule_resolution: limits.schedule_resolution || 'Month',
        rebalance_access: limits.rebalance_access ?? false,
        opportunity_agent_access: limits.opportunity_agent_access ?? false,
        additional_provider_access: limits.additional_provider_access ?? false,
        enable_live_trading: limits.enable_live_trading ?? false,
        enable_auto_trading: limits.enable_auto_trading ?? false
      };
    }
    console.log('⚠️ No role limits found for user, using defaults');
    return getDefaultLimits();
  } catch (error) {
    console.error('❌ Exception fetching user role limits:', error);
    return getDefaultLimits();
  }
}
/**
 * Get default role limits for users without specific role assignments
 */ function getDefaultLimits() {
  return {
    max_watchlist_stocks: 10,
    max_rebalance_stocks: 5,
    max_scheduled_rebalances: 1,
    max_parallel_analysis: 1,
    schedule_resolution: 'Month',
    rebalance_access: false,
    opportunity_agent_access: false,
    additional_provider_access: false,
    enable_live_trading: false,
    enable_auto_trading: false
  };
}
