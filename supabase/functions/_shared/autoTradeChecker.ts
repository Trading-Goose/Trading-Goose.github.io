import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { TRADE_ORDER_STATUS } from './statusTypes.ts';

/**
 * Check if user has auto-trade enabled and execute pending orders
 * This is a self-contained function that handles everything internally
 */
export async function checkAndExecuteAutoTrades(
  supabase: SupabaseClient,
  userId: string,
  sourceType: 'individual_analysis' | 'rebalance',
  sourceId: string
): Promise<{
  success: boolean;
  autoTradeEnabled: boolean;
  ordersExecuted: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let ordersExecuted = 0;

  try {
    // Check user's auto-trade settings
    const { data: settings, error: settingsError } = await supabase
      .from('api_settings')
      .select('auto_execute_trades')
      .eq('user_id', userId)
      .single();

    if (settingsError) {
      console.error('Failed to fetch auto-trade settings:', settingsError);
      return {
        success: false,
        autoTradeEnabled: false,
        ordersExecuted: 0,
        errors: ['Failed to fetch auto-trade settings']
      };
    }

    const autoTradeEnabled = settings?.auto_execute_trades === true;
    
    if (!autoTradeEnabled) {
      console.log(`📊 Auto-trade is disabled for user ${userId}`);
      return {
        success: true,
        autoTradeEnabled: false,
        ordersExecuted: 0,
        errors: []
      };
    }

    console.log(`🤖 Auto-trade is enabled for user ${userId} - executing pending orders`);

    // Fetch all pending orders for this source
    let query = supabase
      .from('trading_actions')
      .select('id, ticker, action, dollar_amount, shares')
      .eq('user_id', userId)
      .eq('status', TRADE_ORDER_STATUS.PENDING);

    // Filter by source type
    if (sourceType === 'individual_analysis') {
      query = query.eq('analysis_id', sourceId);
    } else if (sourceType === 'rebalance') {
      query = query.eq('rebalance_request_id', sourceId);
    }

    const { data: pendingOrders, error: fetchError } = await query;

    if (fetchError) {
      console.error('Failed to fetch pending orders:', fetchError);
      return {
        success: false,
        autoTradeEnabled,
        ordersExecuted: 0,
        errors: ['Failed to fetch pending orders']
      };
    }

    if (!pendingOrders || pendingOrders.length === 0) {
      console.log('No pending orders to execute');
      return {
        success: true,
        autoTradeEnabled,
        ordersExecuted: 0,
        errors: []
      };
    }

    console.log(`📋 Found ${pendingOrders.length} pending orders to auto-execute`);

    // Execute each order by calling the execute-trade function
    const executePromises = pendingOrders.map(async (order) => {
      try {
        console.log(`🚀 Auto-executing order for ${order.ticker} (${order.action})`);
        
        // Call the execute-trade edge function with approval action
        // Include userId for server-to-server authentication
        // Note: supabase.functions.invoke automatically includes auth headers when using service role
        const response = await supabase.functions.invoke('execute-trade', {
          body: {
            tradeActionId: order.id,
            action: 'approve',
            userId: userId, // Pass userId for server-to-server calls
            isServerCall: true // Flag to indicate this is from another edge function
          }
        });

        if (response.error) {
          const errorMsg = `Failed to execute ${order.ticker}: ${response.error.message || response.error}`;
          console.error(errorMsg);
          errors.push(errorMsg);
          return false;
        }

        if (response.data?.success) {
          console.log(`✅ Successfully auto-executed order for ${order.ticker}`);
          return true;
        } else {
          const errorMsg = `Failed to execute ${order.ticker}: ${response.data?.error || 'Unknown error'}`;
          console.error(errorMsg);
          errors.push(errorMsg);
          return false;
        }
      } catch (error: any) {
        const errorMsg = `Error executing ${order.ticker}: ${error.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
        return false;
      }
    });

    // Wait for all executions to complete
    const results = await Promise.allSettled(executePromises);
    
    // Count successful executions
    ordersExecuted = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

    console.log(`📊 Auto-trade execution complete: ${ordersExecuted}/${pendingOrders.length} orders executed`);

    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} orders failed:`);
      errors.forEach(e => console.log(`  - ${e}`));
    }

    return {
      success: ordersExecuted > 0 || errors.length === 0,
      autoTradeEnabled,
      ordersExecuted,
      errors
    };

  } catch (error: any) {
    console.error('Unexpected error in auto-trade execution:', error);
    return {
      success: false,
      autoTradeEnabled: false,
      ordersExecuted: 0,
      errors: [`Unexpected error: ${error.message}`]
    };
  }
}

/**
 * Helper function: Execute all pending orders for a rebalance request
 * This is a convenience wrapper for rebalance-specific auto-trading
 */
export async function executeAllRebalanceOrders(
  supabase: SupabaseClient,
  rebalanceRequestId: string,
  userId: string
): Promise<{
  success: boolean;
  ordersExecuted: number;
  ordersFailed: number;
  errors: string[];
}> {
  console.log(`🔄 Executing all orders for rebalance ${rebalanceRequestId}`);
  
  const result = await checkAndExecuteAutoTrades(
    supabase,
    userId,
    'rebalance',
    rebalanceRequestId
  );

  return {
    success: result.success,
    ordersExecuted: result.ordersExecuted,
    ordersFailed: result.errors.length,
    errors: result.errors
  };
}

/**
 * Helper function: Execute order for individual analysis
 * This is a convenience wrapper for individual analysis auto-trading
 */
export async function executeAnalysisOrder(
  supabase: SupabaseClient,
  analysisId: string,
  userId: string
): Promise<{
  success: boolean;
  orderExecuted: boolean;
  error?: string;
}> {
  console.log(`📈 Executing order for analysis ${analysisId}`);
  
  const result = await checkAndExecuteAutoTrades(
    supabase,
    userId,
    'individual_analysis',
    analysisId
  );

  return {
    success: result.success,
    orderExecuted: result.ordersExecuted > 0,
    error: result.errors[0]
  };
}