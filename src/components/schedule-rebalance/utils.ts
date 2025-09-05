// Utility functions for schedule rebalance functionality
// Extracted from ScheduleRebalanceModal.tsx

import type { ScheduleConfig } from "./types";
import { TIMEZONE_GROUPS } from "./constants";

// Get timezone offset string (e.g., "+05:30", "-08:00")
export const getTimezoneOffset = (tz: string): string => {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset'
    });
    const parts = formatter.formatToParts(now);
    const offset = parts.find(part => part.type === 'timeZoneName')?.value || '';
    return offset.replace('GMT', '').replace('UTC', '') || '+00:00';
  } catch {
    return '';
  }
};

// Calculate next run time based on configuration
export const getNextRunTime = (config: ScheduleConfig): string => {
  // This is a simplified preview - actual calculation happens in the database
  const now = new Date();
  const [time, period] = config.timeOfDay.split(' ');
  const [hourStr, minuteStr] = time.split(':');
  let hours = parseInt(hourStr);
  const minutes = parseInt(minuteStr);

  // Convert 12-hour to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  // Helper function to create a date at the scheduled time in the target timezone
  const createScheduledDate = (localDate: Date): Date => {
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const hourStr = String(hours).padStart(2, '0');
    const minuteStr = String(minutes).padStart(2, '0');
    
    // Create an ISO string for the target timezone time
    const dateTimeStr = `${year}-${month}-${day}T${hourStr}:${minuteStr}:00`;
    
    // Get timezone offset for this specific date/time
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: config.timezone,
      timeZoneName: 'longOffset'
    });
    const tzParts = tzFormatter.formatToParts(new Date(dateTimeStr));
    const offsetStr = tzParts.find(p => p.type === 'timeZoneName')?.value || 'GMT+00:00';
    const match = offsetStr.match(/GMT([+-]\d{2}):(\d{2})/);
    let offsetMinutes = 0;
    if (match) {
      const offsetHours = parseInt(match[1]);
      const offsetMins = parseInt(match[2]);
      offsetMinutes = offsetHours * 60 + (offsetHours < 0 ? -offsetMins : offsetMins);
    }
    
    // Create the date in the local timezone and adjust for the schedule's timezone offset
    const localTime = new Date(dateTimeStr);
    const utcTime = localTime.getTime() - (offsetMinutes * 60 * 1000);
    return new Date(utcTime);
  };

  let nextDate = new Date(now);
  let nextRun = createScheduledDate(nextDate);

  // Calculate based on interval unit
  if (config.intervalUnit === 'days') {
    // Add days until we find the next run time
    while (nextRun <= now) {
      nextDate.setDate(nextDate.getDate() + config.intervalValue);
      nextRun = createScheduledDate(nextDate);
    }
  } else if (config.intervalUnit === 'weeks') {
    // Find next matching day of week in the schedule's timezone
    let found = false;
    for (let i = 0; i < 14; i++) { // Check up to 2 weeks ahead
      // Get day of week in the schedule's timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: config.timezone,
        weekday: 'long'
      });
      const dayName = formatter.format(nextDate);
      const dayMap: { [key: string]: number } = {
        'Sunday': 0,
        'Monday': 1,
        'Tuesday': 2,
        'Wednesday': 3,
        'Thursday': 4,
        'Friday': 5,
        'Saturday': 6
      };
      const currentDay = dayMap[dayName];
      
      if (config.daysOfWeek.includes(currentDay)) {
        nextRun = createScheduledDate(nextDate);
        if (nextRun > now) {
          found = true;
          break;
        }
      }
      nextDate.setDate(nextDate.getDate() + 1);
    }
    
    if (!found) {
      // Fallback to next occurrence
      nextRun = createScheduledDate(nextDate);
    }
  } else if (config.intervalUnit === 'months') {
    // Find next matching day of month
    while (nextRun <= now || !config.daysOfMonth.includes(nextDate.getDate())) {
      nextDate.setDate(nextDate.getDate() + 1);
      // Handle month boundary
      if (nextDate.getDate() === 1 && !config.daysOfMonth.includes(1)) {
        // We've rolled over to next month, check if we need to skip ahead
        const maxDay = Math.max(...config.daysOfMonth);
        if (maxDay > new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()) {
          // Skip this month if our target day doesn't exist
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
      }
      nextRun = createScheduledDate(nextDate);
    }
  }

  return nextRun.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: config.timezone
  });
};

// Find timezone label by value
export const getTimezoneLabel = (timezone: string): string => {
  for (const [region, zones] of Object.entries(TIMEZONE_GROUPS)) {
    const zone = zones.find(z => z.value === timezone);
    if (zone) {
      const offset = getTimezoneOffset(timezone);
      return `${zone.label} (UTC${offset})`;
    }
  }
  return timezone;
};