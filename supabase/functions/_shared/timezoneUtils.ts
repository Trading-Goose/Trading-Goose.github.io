/**
 * Timezone utilities for US stock market operations
 * All market-related timestamps should use New York timezone (America/New_York)
 */

/**
 * Get current date in New York timezone (YYYY-MM-DD format)
 * Handles EST/EDT automatically
 */
export function getNYCurrentDate(): string {
  const now = new Date();
  const nyDate = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return nyDate.toISOString().split('T')[0];
}

/**
 * Get current timestamp in New York timezone
 */
export function getNYCurrentTimestamp(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

/**
 * Check if current NY time is during market hours
 * Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
 */
export function isMarketHours(): boolean {
  const nyNow = getNYCurrentTimestamp();
  const dayOfWeek = nyNow.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  const hours = nyNow.getHours();
  const minutes = nyNow.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Market hours: 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30;  // 9:30 AM
  const marketClose = 16 * 60;     // 4:00 PM
  
  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
}

/**
 * Check if current NY time is pre-market hours
 * Pre-market: 4:00 AM - 9:30 AM ET, Monday-Friday
 */
export function isPreMarketHours(): boolean {
  const nyNow = getNYCurrentTimestamp();
  const dayOfWeek = nyNow.getDay();
  
  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  const hours = nyNow.getHours();
  const minutes = nyNow.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Pre-market hours: 4:00 AM - 9:30 AM ET
  const preMarketOpen = 4 * 60;      // 4:00 AM
  const marketOpen = 9 * 60 + 30;    // 9:30 AM
  
  return timeInMinutes >= preMarketOpen && timeInMinutes < marketOpen;
}

/**
 * Check if current NY time is after-hours
 * After-hours: 4:00 PM - 8:00 PM ET, Monday-Friday
 */
export function isAfterHours(): boolean {
  const nyNow = getNYCurrentTimestamp();
  const dayOfWeek = nyNow.getDay();
  
  // Weekend check
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  const hours = nyNow.getHours();
  const minutes = nyNow.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // After-hours: 4:00 PM - 8:00 PM ET
  const marketClose = 16 * 60;      // 4:00 PM
  const afterHoursClose = 20 * 60;  // 8:00 PM
  
  return timeInMinutes >= marketClose && timeInMinutes < afterHoursClose;
}

/**
 * Get market session description
 */
export function getMarketSession(): 'pre-market' | 'market-hours' | 'after-hours' | 'closed' {
  if (isPreMarketHours()) return 'pre-market';
  if (isMarketHours()) return 'market-hours';
  if (isAfterHours()) return 'after-hours';
  return 'closed';
}

/**
 * Check if cache should be invalidated based on market hours
 * Cache is considered stale if:
 * - It's from a previous NY date
 * - It's from today but during market hours and cache is older than 1 hour
 */
export function shouldInvalidateCache(cachedDate: string, cachedTimestamp?: string): boolean {
  const currentNYDate = getNYCurrentDate();
  
  // If cache is from a different date, invalidate
  if (cachedDate !== currentNYDate) {
    return true;
  }
  
  // If we're in market hours and have timestamp info, check if cache is too old
  if (isMarketHours() && cachedTimestamp) {
    const cacheTime = new Date(cachedTimestamp);
    const currentTime = getNYCurrentTimestamp();
    const hoursSinceCache = (currentTime.getTime() - cacheTime.getTime()) / (1000 * 60 * 60);
    
    // Invalidate if cache is older than 1 hour during market hours
    return hoursSinceCache > 1;
  }
  
  // Cache is valid
  return false;
}

/**
 * Format timestamp for logging with NY timezone
 */
export function formatNYTimestamp(date?: Date): string {
  const timestamp = date || getNYCurrentTimestamp();
  return timestamp.toLocaleString("en-US", { 
    timeZone: "America/New_York",
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}