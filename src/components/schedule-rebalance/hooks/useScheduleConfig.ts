// Hook for managing schedule configuration state
// Extracted from ScheduleRebalanceModal.tsx

import { useState } from "react";
import { useRBAC } from "@/hooks/useRBAC";
import type { ScheduleConfig, RebalanceConfig } from "../types";

export function useScheduleConfig() {
  const { hasOpportunityAgentAccess } = useRBAC();
  const hasOppAccess = hasOpportunityAgentAccess();
  
  // Schedule configuration
  const [config, setConfig] = useState<ScheduleConfig>({
    enabled: true,
    intervalValue: 1,
    intervalUnit: 'weeks',
    daysOfWeek: [1], // Default to Monday
    daysOfMonth: [1], // Default to 1st of month
    timeOfDay: '09:00 AM', // Default to 9:00 AM
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // Rebalance configuration - auto-skip opportunity agent if no access
  // Note: min/max position and target allocations are not configurable in scheduled UI
  // These will use user's api_settings values at runtime
  const [rebalanceConfig, setRebalanceConfig] = useState<RebalanceConfig>({
    maxPosition: 25,   // Default placeholder (percentage), not used
    minPosition: 5,    // Default placeholder (percentage), not used
    rebalanceThreshold: 10,
    targetStockAllocation: 80,  // Default placeholder, not used
    targetCashAllocation: 20,   // Default placeholder, not used
    skipThresholdCheck: false,
    skipOpportunityAgent: !hasOppAccess // Auto-skip if no access
  });

  return {
    config,
    setConfig,
    rebalanceConfig,
    setRebalanceConfig,
  };
}