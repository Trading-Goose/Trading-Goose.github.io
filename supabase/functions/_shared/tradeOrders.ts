/**
 * Shared trade order submission utilities
 */
import { TRADE_ORDER_STATUS } from './statusTypes.ts';

export interface TradeOrderData {
  ticker: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  shares?: number;
  dollarAmount?: number;  // Dollar amount for the order
  confidence: number;
  reasoning: string;
  analysisId?: string;
  rebalanceRequestId?: string;
  
  // Metadata for additional order information
  metadata?: {
    useCloseEndpoint?: boolean;
    shouldClosePosition?: boolean;
    [key: string]: any;  // Allow additional metadata fields
  };
  
  // Before/After position details
  beforeShares?: number;
  beforeValue?: number;
  beforeAllocation?: number;  // Percentage of portfolio
  
  afterShares?: number;
  afterValue?: number;
  afterAllocation?: number;   // Target percentage of portfolio
  
  // Additional tracking
  shareChange?: number;        // Net change in shares
  valueChange?: number;        // Net change in value
  allocationChange?: number;   // Net change in allocation percentage
  
  // Rebalance-specific fields (legacy compatibility)
  targetAllocation?: number;
  targetValue?: number;
}

export interface TradeOrderContext {
  userId: string;
  sourceType: 'individual_analysis' | 'rebalance' | 'manual';
  rebalanceRequestId?: string;
  agent?: string;
}

/**
 * Submit trade orders to the database
 * Handles both single orders (from agent-coordinator) and multiple orders (from portfolio-manager)
 */
export async function submitTradeOrders(
  supabase: any,
  orders: TradeOrderData | TradeOrderData[],
  context: TradeOrderContext
): Promise<{ success: boolean; ordersCreated: number; error?: string }> {
  console.log(`📝 Submitting trade order(s) - Type: ${context.sourceType}`);
  
  // Normalize to array for consistent handling
  const orderArray = Array.isArray(orders) ? orders : [orders];
  
  // Debug log the incoming orders
  console.log('📊 Incoming orders:', orderArray.map(o => ({
    ticker: o.ticker,
    action: o.action,
    shares: o.shares,
    dollarAmount: o.dollarAmount,
    confidence: o.confidence
  })));
  
  // Filter out HOLD decisions and low confidence orders
  const validOrders = orderArray.filter(order => {
    if (order.action === 'HOLD') {
      console.log(`ℹ️ Skipping HOLD order for ${order.ticker}`);
      return false;
    }
    if (order.confidence < 60) {
      console.log(`⚠️ Skipping low confidence order for ${order.ticker} (${order.confidence}%)`);
      return false;
    }
    // Validate that we have either shares or dollar amount
    const hasShares = order.shares !== undefined && order.shares !== null && order.shares > 0;
    const hasDollarAmount = order.dollarAmount !== undefined && order.dollarAmount !== null && order.dollarAmount > 0;
    
    if (!hasShares && !hasDollarAmount) {
      console.error(`❌ Invalid order for ${order.ticker}: Neither shares nor dollar amount specified`);
      console.error(`  - shares: ${order.shares}, dollarAmount: ${order.dollarAmount}`);
      return false;
    }
    
    if (hasShares && hasDollarAmount) {
      console.warn(`⚠️ Order for ${order.ticker} has both shares and dollar amount - will use preference`);
    }
    
    return true;
  });
  
  if (validOrders.length === 0) {
    console.log('ℹ️ No valid trade orders to submit (all HOLD or low confidence)');
    return { success: true, ordersCreated: 0 };
  }
  
  // Check for existing pending orders for the same analysis to prevent duplicates
  if (context.sourceType === 'individual_analysis' && validOrders.length > 0) {
    const analysisId = validOrders[0].analysisId;
    if (analysisId) {
      console.log(`🔍 Checking for existing orders for analysis ${analysisId}`);
      const { data: existingOrders, error: checkError } = await supabase
        .from('trading_actions')
        .select('id, ticker, action, shares, dollar_amount, status')
        .eq('analysis_id', analysisId)
        .in('status', [TRADE_ORDER_STATUS.PENDING, TRADE_ORDER_STATUS.APPROVED]);
      
      if (checkError) {
        console.error('⚠️ Error checking for existing orders:', checkError);
      } else if (existingOrders && existingOrders.length > 0) {
        console.log(`⚠️ Found ${existingOrders.length} existing order(s) for analysis ${analysisId}:`);
        existingOrders.forEach(order => {
          console.log(`  - ${order.ticker}: ${order.action} ${order.shares || order.dollar_amount} (status: ${order.status})`);
        });
        console.log('🛑 Skipping duplicate order creation');
        return { 
          success: true, 
          ordersCreated: 0,
          error: `Existing orders already found for analysis ${analysisId}` 
        };
      } else {
        console.log('✅ No existing orders found, proceeding with creation');
      }
    }
  }
  
  // Prepare trade orders for database insertion
  const tradeOrders = validOrders.map(order => {
    // Determine which type of order this is
    const hasValidShares = order.shares !== undefined && order.shares !== null && order.shares > 0;
    const hasValidDollarAmount = order.dollarAmount !== undefined && order.dollarAmount !== null && order.dollarAmount > 0;
    
    // Ensure we use only one method
    let finalShares = 0;
    let finalDollarAmount = 0;
    
    if (hasValidDollarAmount && !hasValidShares) {
      // Dollar-based order
      finalDollarAmount = order.dollarAmount;
      finalShares = 0;
    } else if (hasValidShares && !hasValidDollarAmount) {
      // Share-based order
      finalShares = order.shares;
      finalDollarAmount = 0;
    } else if (hasValidShares && hasValidDollarAmount) {
      // Both provided - prefer dollar amount for fractional share support
      console.warn(`🔄 Both shares and dollar amount provided for ${order.ticker}, using dollar amount`);
      finalDollarAmount = order.dollarAmount;
      finalShares = 0;
    } else {
      // Fallback to shareChange if available
      finalShares = Math.abs(order.shareChange || 0);
      finalDollarAmount = 0;
    }
    
    return {
      user_id: context.userId,
      ticker: order.ticker,
      action: order.action,
      shares: finalShares,
      dollar_amount: finalDollarAmount,
      price: 0, // Will be filled with market price at execution
      status: TRADE_ORDER_STATUS.PENDING,
      agent: context.agent || (context.sourceType === 'rebalance' ? 'portfolio-manager' : 'agent-coordinator'),
      reasoning: order.reasoning,
      source_type: context.sourceType,
      rebalance_request_id: order.rebalanceRequestId || context.rebalanceRequestId || null,
      position_percentage: order.afterAllocation || order.targetAllocation || null,
      target_value: order.afterValue || order.targetValue || order.dollarAmount || null,
      analysis_id: order.analysisId || null,
    // Store before/after details in metadata (JSONB field)
    // IMPORTANT: Preserve existing metadata (like useCloseEndpoint, shouldClosePosition)
    metadata: {
      ...order.metadata, // Preserve any existing metadata from the order
      beforePosition: {
        shares: order.beforeShares || 0,
        value: order.beforeValue || 0,
        allocation: order.beforeAllocation || 0
      },
      afterPosition: {
        shares: order.afterShares || 0,
        value: order.afterValue || 0,
        allocation: order.afterAllocation || 0
      },
      changes: {
        shares: order.shareChange || 0,
        value: order.valueChange || 0,
        allocation: order.allocationChange || 0
      }
    },
    created_at: new Date().toISOString()
    };
  });
  
  // Debug log the prepared orders
  console.log('📦 Prepared orders for DB:', tradeOrders.map(o => ({
    ticker: o.ticker,
    action: o.action,
    shares: o.shares,
    dollar_amount: o.dollar_amount,
    status: o.status,
    user_id: o.user_id
  })));
  
  try {
    // Insert trade orders
    const { error } = await supabase
      .from('trading_actions')
      .insert(tradeOrders);
    
    if (error) {
      console.error('❌ Failed to create trade orders:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      return { 
        success: false, 
        ordersCreated: 0, 
        error: error.message 
      };
    }
    
    console.log(`✅ Successfully created ${tradeOrders.length} trade order(s)`);
    
    // Verify what was actually created by querying back
    if (context.sourceType === 'individual_analysis' && validOrders[0]?.analysisId) {
      const { data: createdOrders, error: verifyError } = await supabase
        .from('trading_actions')
        .select('id, ticker, status, user_id, created_at')
        .eq('analysis_id', validOrders[0].analysisId)
        .order('created_at', { ascending: false });
      
      if (!verifyError && createdOrders) {
        console.log('📋 Verification - Orders actually created in DB:', createdOrders);
      }
    }
    
    // Log details for each order
    tradeOrders.forEach(order => {
      const originalOrder = validOrders.find(o => o.ticker === order.ticker);
      if (order.dollar_amount > 0) {
        console.log(`  - ${order.ticker}: ${order.action} $${order.dollar_amount.toFixed(2)} (confidence: ${originalOrder?.confidence}%)`);
      } else if (order.shares > 0) {
        console.log(`  - ${order.ticker}: ${order.action} ${order.shares} shares (confidence: ${originalOrder?.confidence}%)`);
      } else {
        console.log(`  - ${order.ticker}: ${order.action} (confidence: ${originalOrder?.confidence}%)`);
      }
    });
    
    return { 
      success: true, 
      ordersCreated: tradeOrders.length 
    };
    
  } catch (error) {
    console.error('❌ Error submitting trade orders:', error);
    return { 
      success: false, 
      ordersCreated: 0, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Helper function to create trade order from risk manager decision
 * Used by agent-coordinator for individual stock analysis
 */
export function createTradeOrderFromDecision(
  ticker: string,
  decision: string,
  confidence: number,
  reasoning: string,
  analysisId: string
): TradeOrderData | null {
  // Only create order if decision is actionable and confidence is sufficient
  if (decision === 'HOLD' || confidence < 60) {
    console.log(`ℹ️ ${ticker}: ${decision} decision with ${confidence}% confidence - no trade order created`);
    return null;
  }
  
  return {
    ticker,
    action: decision as 'BUY' | 'SELL',
    confidence,
    reasoning,
    analysisId,
    shares: 0  // Will be set by coordinator if position sizing is available
  };
}

/**
 * Helper function to create trade orders from rebalance plan
 * Used by portfolio-manager for rebalancing
 */
export function createTradeOrdersFromRebalancePlan(
  rebalancePlan: any
): TradeOrderData[] {
  if (!rebalancePlan?.actions) {
    return [];
  }
  
  return rebalancePlan.actions.map((action: any) => ({
    ticker: action.ticker,
    action: action.action,
    confidence: action.confidence || 70, // Default confidence for rebalance
    reasoning: action.reasoning,
    shareChange: action.shareChange,
    targetAllocation: action.targetAllocation,
    targetValue: action.targetValue
  }));
}