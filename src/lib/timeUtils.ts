// Utility functions for handling time and timezone operations with true UTC time

interface WorldTimeAPIResponse {
  utc_datetime: string;
  unixtime: number;
  timezone: string;
  day_of_week: number;
  day_of_year: number;
  week_number: number;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MS_IN_DAY = 24 * 60 * 60 * 1000;

interface TimezoneDateInfo {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

const getIntlFormatter = (timezone: string) => new Intl.DateTimeFormat('en-US', {
  timeZone: timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
});

function getTimezoneDateInfo(date: Date, timezone: string): TimezoneDateInfo {
  const parts = getIntlFormatter(timezone).formatToParts(date);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;

  const year = parseInt(getPart('year') ?? '1970', 10);
  const month = parseInt(getPart('month') ?? '01', 10);
  const day = parseInt(getPart('day') ?? '01', 10);
  const weekdayName = getPart('weekday') ?? 'Sun';
  const weekday = WEEKDAY_NAMES.indexOf(weekdayName);

  return {
    year,
    month,
    day,
    weekday: weekday === -1 ? 0 : weekday,
  };
}

function addDaysUTC(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getWeekStartDayNumber(info: TimezoneDateInfo): number {
  const dayNumber = Math.floor(Date.UTC(info.year, info.month - 1, info.day) / MS_IN_DAY);
  return dayNumber - info.weekday;
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

async function findNextWeeklyRun(
  now: Date,
  schedule: {
    day_of_week: number[];
    timezone: string;
    interval_value: number;
    created_at: string;
    last_executed_at?: string;
  },
  hours: number,
  minutes: number
): Promise<Date | null> {
  if (!schedule.day_of_week.length) return null;

  const sortedDays = [...new Set(schedule.day_of_week)].sort((a, b) => a - b);
  const currentInfo = getTimezoneDateInfo(now, schedule.timezone);

  const anchorSource = schedule.last_executed_at
    ? new Date(schedule.last_executed_at)
    : new Date(schedule.created_at);
  const anchorInfo = getTimezoneDateInfo(anchorSource, schedule.timezone);
  const anchorWeekStart = getWeekStartDayNumber(anchorInfo);

  const applicableInterval = Math.max(1, schedule.interval_value);
  const maxWeeksToCheck = Math.max(applicableInterval * 4, 8);

  for (let weekOffset = 0; weekOffset < maxWeeksToCheck; weekOffset++) {
    for (const targetDay of sortedDays) {
      const dayDelta = ((targetDay - currentInfo.weekday + 7) % 7) + weekOffset * 7;
      const candidateBase = addDaysUTC(now, dayDelta);
      const candidate = await createScheduledDateUTC(candidateBase, hours, minutes, schedule.timezone);

      if (candidate <= now) {
        continue;
      }

      if (applicableInterval > 1) {
        const candidateInfo = getTimezoneDateInfo(candidate, schedule.timezone);
        const candidateWeekStart = getWeekStartDayNumber(candidateInfo);
        const weeksDiff = Math.floor((candidateWeekStart - anchorWeekStart) / 7);

        if (weeksDiff < 0 || weeksDiff % applicableInterval !== 0) {
          continue;
        }
      }

      return candidate;
    }
  }

  return null;
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
    created_at: string;
  }
): Promise<Date | null> {
  if (!schedule.enabled) return null;
  
  // Get true UTC time
  const now = await getTrueUTCTime();
  const [hours, minutes] = schedule.time_of_day.split(':').map(Number);

  if (schedule.interval_unit === 'weeks' && schedule.day_of_week && schedule.day_of_week.length > 0) {
    const nextWeeklyRun = await findNextWeeklyRun(now, {
      day_of_week: schedule.day_of_week,
      timezone: schedule.timezone,
      interval_value: schedule.interval_value,
      created_at: schedule.created_at,
      last_executed_at: schedule.last_executed_at,
    }, hours, minutes);

    if (nextWeeklyRun) {
      return nextWeeklyRun;
    }
  }
  
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
