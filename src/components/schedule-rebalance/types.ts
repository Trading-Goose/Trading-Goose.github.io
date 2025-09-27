// Types and interfaces for schedule rebalance functionality
// Maintaining exact same structure as original ScheduleRebalanceModal.tsx

// Re-export types from RebalanceModal that we'll reuse
export type { RebalanceConfig, RebalancePosition } from "@/components/rebalance/types";

export interface ScheduleRebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  scheduleToEdit?: {
    id: string;
    enabled: boolean;
    interval_value: number;
    interval_unit: 'days' | 'weeks' | 'months';
    day_of_week?: number[];
    day_of_month?: number[];
    time_of_day: string;
    timezone: string;
    selected_tickers: string[];
    include_watchlist: boolean;
    rebalance_threshold?: number;
    skip_threshold_check?: boolean;
    skip_opportunity_agent?: boolean;
  } | null;
}

export interface ScheduleConfig {
  enabled: boolean;
  intervalValue: number;
  intervalUnit: 'days' | 'weeks' | 'months';
  daysOfWeek: number[]; // For weekly intervals
  daysOfMonth: number[]; // For monthly intervals
  timeOfDay: string;
  timezone: string;
}

// Alias for compatibility - same as RebalancePosition
export interface Position {
  ticker: string;
  currentShares: number;
  currentValue: number;
  currentAllocation: number;
  avgPrice?: number;
  assetClass?: string;
  assetSymbol?: string;
}

export interface ExistingSchedule {
  id: string;
  user_id: string;
  enabled: boolean;
  frequency: string;
  interval_value?: number;
  interval_unit?: string;
  day_of_week?: number[];
  day_of_month?: number[];
  time_of_day?: string;
  timezone?: string;
  selected_tickers?: string[];
  include_watchlist?: boolean;
  rebalance_threshold?: number;
  skip_threshold_check?: boolean;
  skip_opportunity_agent?: boolean;
}

export interface Weekday {
  value: number;
  label: string;
}

export interface TimezoneOption {
  value: string;
  label: string;
}
