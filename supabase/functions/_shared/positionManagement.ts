/**
 * Shared utilities for position management and order validation
 */

/**
 * Determines if a SELL order should close the entire position
 * Checks if the sell dollar amount is within a threshold of the current position value
 * 
 * @param sellDollarAmount - The dollar amount of the SELL order
 * @param currentPositionValue - The current market value of the position
 * @param threshold - The percentage threshold for considering it a full position closure (default 5%)
 * @returns true if the order should close the entire position
 */
export function shouldCloseFullPosition(
  sellDollarAmount: number,
  currentPositionValue: number,
  threshold: number = 0.05
): boolean {
  // If there's no position, can't close it
  if (currentPositionValue <= 0) return false;
  
  // If sell amount is 0 or negative, not a valid sell
  if (sellDollarAmount <= 0) return false;
  
  // Calculate the percentage difference between sell amount and position value
  const percentageDifference = Math.abs(sellDollarAmount - currentPositionValue) / currentPositionValue;
  
  // If the difference is within threshold, consider it a full position closure
  const shouldClose = percentageDifference <= threshold;
  
  if (shouldClose) {
    console.log(`📊 Full position closure detected: Sell $${sellDollarAmount.toFixed(2)} vs Position $${currentPositionValue.toFixed(2)} (${(percentageDifference * 100).toFixed(2)}% difference)`);
  }
  
  return shouldClose;
}

/**
 * Validates if there are sufficient shares to execute a SELL order
 * 
 * @param sellDollarAmount - The dollar amount of the SELL order
 * @param currentPositionValue - The current market value of the position
 * @param currentShares - The current number of shares held
 * @returns Object with validation result and adjusted order details
 */
export function validateSellOrder(
  sellDollarAmount: number,
  currentPositionValue: number,
  currentShares: number,
  ticker: string
): {
  isValid: boolean;
  shouldClosePosition: boolean;
  adjustedOrderType: 'dollar' | 'shares';
  adjustedAmount: number;
  message: string;
  useCloseEndpoint?: boolean;  // New flag for close position endpoint
} {
  // Check if we have any position to sell
  if (!currentShares || currentShares <= 0 || currentPositionValue <= 0) {
    return {
      isValid: false,
      shouldClosePosition: false,
      adjustedOrderType: 'dollar',
      adjustedAmount: 0,
      message: `Cannot execute SELL order for ${ticker}: No position exists`
    };
  }
  
  // Check if sell amount exceeds position value
  if (sellDollarAmount > currentPositionValue) {
    // When sell amount exceeds position value, treat it as intention to close full position
    const exceedsBy = ((sellDollarAmount - currentPositionValue) / currentPositionValue) * 100;
    
    console.log(`⚠️ SELL order of $${sellDollarAmount.toFixed(2)} exceeds position value of $${currentPositionValue.toFixed(2)} by ${exceedsBy.toFixed(2)}%`);
    console.log(`✅ Converting to full position closure: ${currentShares} shares (treating as intention to close position)`);
    
    return {
      isValid: true,
      shouldClosePosition: true,
      adjustedOrderType: 'shares',
      adjustedAmount: currentShares,
      message: `Adjusted SELL order to close full position (${currentShares} shares) as requested amount ($${sellDollarAmount.toFixed(2)}) exceeded available value ($${currentPositionValue.toFixed(2)})`,
      useCloseEndpoint: true  // Use close position endpoint for clean closure
    };
  }
  
  // Check if this should be a full position closure
  if (shouldCloseFullPosition(sellDollarAmount, currentPositionValue)) {
    console.log(`✅ Converting SELL order to full position closure for ${ticker}`);
    console.log(`📊 Details: Sell amount=$${sellDollarAmount}, Position value=$${currentPositionValue}, Shares=${currentShares}`);
    return {
      isValid: true,
      shouldClosePosition: true,
      adjustedOrderType: 'shares',
      adjustedAmount: currentShares,
      message: `Closing full position (${currentShares} shares) as requested amount is within 5% of position value`,
      useCloseEndpoint: true  // Use close position endpoint for clean closure
    };
  }
  
  // Normal partial sell - proceed with dollar amount
  return {
    isValid: true,
    shouldClosePosition: false,
    adjustedOrderType: 'dollar',
    adjustedAmount: sellDollarAmount,
    message: `Executing partial SELL of $${sellDollarAmount.toFixed(2)} from position worth $${currentPositionValue.toFixed(2)}`
  };
}

/**
 * Adjusts a trade order based on position validation results
 * 
 * @param tradeOrder - The original trade order
 * @param validation - The validation result from validateSellOrder
 * @returns The adjusted trade order
 */
export function adjustTradeOrderForValidation(
  tradeOrder: any,
  validation: ReturnType<typeof validateSellOrder>
): any {
  if (!validation.isValid) {
    // Invalid order - set to HOLD
    return {
      ...tradeOrder,
      action: 'HOLD',
      shares: 0,
      dollarAmount: 0,
      reasoning: validation.message
    };
  }
  
  if (validation.shouldClosePosition) {
    // Adjust to close full position with shares
    const updatedOrder = {
      ...tradeOrder,
      shares: validation.adjustedAmount,
      dollarAmount: 0, // Clear dollar amount when using shares
      reasoning: `${tradeOrder.reasoning}. ${validation.message}`
    };
    
    // Pass through the close endpoint flag if present
    if (validation.useCloseEndpoint) {
      updatedOrder.metadata = {
        ...tradeOrder.metadata,
        useCloseEndpoint: true,
        shouldClosePosition: true
      };
      console.log(`🎯 Metadata set for full position closure: useCloseEndpoint=true for ${tradeOrder.ticker}`);
    }
    
    return updatedOrder;
  }
  
  // Keep original dollar-based order
  return {
    ...tradeOrder,
    dollarAmount: validation.adjustedAmount,
    shares: 0, // Clear shares when using dollar amount
    reasoning: `${tradeOrder.reasoning}. ${validation.message}`
  };
}