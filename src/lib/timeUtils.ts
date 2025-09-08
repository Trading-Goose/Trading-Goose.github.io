// Utility functions for handling time and timezone operations with true UTC time

interface WorldTimeAPIResponse {
  utc_datetime: string;
  unixtime: number;
  timezone: string;
  day_of_week: number;
  day_of_year: number;
  week_number: number;
}

// Cache for storing fetched time and calculating offset
let timeOffset: number | null = null;
let lastFetchTime: number | null = null;
const CACHE_DURATION = 60000; // Refresh offset every 60 seconds

/**
 * Fetches true UTC time from WorldTimeAPI
 * Falls back to system time if API is unavailable
 */
export async function getTrueUTCTime(): Promise<Date> {
  try {
    // Check if we have a recent cached offset
    const now = Date.now();
    if (timeOffset !== null && lastFetchTime !== null && (now - lastFetchTime) < CACHE_DURATION) {
      // Use cached offset to calculate true time
      return new Date(now + timeOffset);
    }

    // Fetch fresh time from API
    const response = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC', {
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch time from API');
    }
    
    const data: WorldTimeAPIResponse = await response.json();
    
    // Calculate offset between server time and client time
    const serverTime = new Date(data.utc_datetime);
    const clientTime = new Date();
    timeOffset = serverTime.getTime() - clientTime.getTime();
    lastFetchTime = Date.now();
    
    return serverTime;
  } catch (error) {
    console.warn('Failed to fetch true UTC time, falling back to system time:', error);
    // Fallback to system time in UTC
    return new Date();
  }
}

/**
 * Creates a Date object representing the scheduled time in the target timezone
 * Uses true UTC time as reference
 */
export async function createScheduledDateUTC(
  baseDate: Date,
  hours: number,
  minutes: number,
  timezone: string
): Promise<Date> {
  // Get the date in the schedule's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const dateStr = formatter.format(baseDate);
  const [month, day, year] = dateStr.split('/');
  
  // Find the UTC time that corresponds to the scheduled time in the target timezone
  // We'll check different UTC hours to find which one gives us the desired time in the target timezone
  for (let utcHour = 0; utcHour < 48; utcHour++) {
    // Try UTC hours from today and tomorrow to handle timezone differences
    const testDate = new Date(Date.UTC(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day) + Math.floor(utcHour / 24) - 1, // Adjust day for hours > 24
      utcHour % 24,
      minutes,
      0
    ));
    
    // Check what time this UTC date shows in the target timezone
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      day: 'numeric',
      hour12: false
    });
    
    const parts = tzFormatter.formatToParts(testDate);
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const tzDay = parseInt(parts.find(p => p.type === 'day')?.value || '0');
    
    // If this UTC time gives us the correct scheduled time in the target timezone
    if (tzHour === hours && tzMinute === minutes && tzDay === parseInt(day)) {
      return testDate;
    }
  }
  
  // Fallback: use common US timezone offset
  return new Date(Date.UTC(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    hours + 7, // Approximate offset for US Mountain Time
    minutes,
    0
  ));
}

/**
 * Calculates the next run time for a schedule using true UTC time
 */
export async function calculateNextRunUTC(
  schedule: {
    time_of_day: string;
    timezone: string;
    interval_value: number;
    interval_unit: 'days' | 'weeks' | 'months';
    day_of_week?: number[];
    day_of_month?: number[];
    enabled: boolean;
    last_executed_at?: string;
  }
): Promise<Date | null> {
  if (!schedule.enabled) return null;
  
  // Get true UTC time
  const now = await getTrueUTCTime();
  const [hours, minutes] = schedule.time_of_day.split(':').map(Number);
  
  // If never executed, calculate from current date
  if (!schedule.last_executed_at) {
    let nextDate = new Date(now);
    let nextRun = await createScheduledDateUTC(nextDate, hours, minutes, schedule.timezone);
    
    // If that time has already passed today, add the interval
    if (nextRun <= now) {
      switch (schedule.interval_unit) {
        case 'days':
          nextDate.setDate(nextDate.getDate() + schedule.interval_value);
          break;
        case 'weeks':
          nextDate.setDate(nextDate.getDate() + (schedule.interval_value * 7));
          break;
        case 'months':
          nextDate.setMonth(nextDate.getMonth() + schedule.interval_value);
          break;
      }
      nextRun = await createScheduledDateUTC(nextDate, hours, minutes, schedule.timezone);
    }
    
    return nextRun;
  }
  
  // Calculate from last execution
  const lastRun = new Date(schedule.last_executed_at);
  let nextDate = new Date(lastRun);
  
  // Add the interval
  switch (schedule.interval_unit) {
    case 'days':
      nextDate.setDate(nextDate.getDate() + schedule.interval_value);
      break;
    case 'weeks':
      nextDate.setDate(nextDate.getDate() + (schedule.interval_value * 7));
      break;
    case 'months':
      nextDate.setMonth(nextDate.getMonth() + schedule.interval_value);
      break;
  }
  
  let nextRun = await createScheduledDateUTC(nextDate, hours, minutes, schedule.timezone);
  
  // If the calculated next run is in the past (e.g., schedule was paused),
  // advance it to the next valid future time
  while (nextRun <= now) {
    switch (schedule.interval_unit) {
      case 'days':
        nextDate.setDate(nextDate.getDate() + schedule.interval_value);
        break;
      case 'weeks':
        nextDate.setDate(nextDate.getDate() + (schedule.interval_value * 7));
        break;
      case 'months':
        nextDate.setMonth(nextDate.getMonth() + schedule.interval_value);
        break;
    }
    nextRun = await createScheduledDateUTC(nextDate, hours, minutes, schedule.timezone);
  }
  
  return nextRun;
}