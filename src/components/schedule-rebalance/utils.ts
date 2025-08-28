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

  let nextRun = new Date();
  nextRun.setHours(hours, minutes, 0, 0);

  // Calculate based on interval unit
  if (config.intervalUnit === 'days') {
    // Add days until we find the next run time
    while (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + config.intervalValue);
    }
  } else if (config.intervalUnit === 'weeks') {
    // Find next matching day of week
    while (nextRun <= now || !config.daysOfWeek.includes(nextRun.getDay())) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    // If still in the past, add weeks
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + (config.intervalValue * 7));
    }
  } else if (config.intervalUnit === 'months') {
    // Find next matching day of month
    while (nextRun <= now || !config.daysOfMonth.includes(nextRun.getDate())) {
      nextRun.setDate(nextRun.getDate() + 1);
      // Handle month boundary
      if (nextRun.getDate() === 1 && !config.daysOfMonth.includes(1)) {
        // We've rolled over to next month, check if we need to skip ahead
        const maxDay = Math.max(...config.daysOfMonth);
        if (maxDay > new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, 0).getDate()) {
          // Skip this month if our target day doesn't exist
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
      }
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