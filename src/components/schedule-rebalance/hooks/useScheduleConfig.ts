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
  const [rebalanceConfig, setRebalanceConfig] = useState<RebalanceConfig>({
    useDefaultSettings: true,
    maxPosition: 10000,
    minPosition: 100,
    rebalanceThreshold: 10,
    targetStockAllocation: 80,
    targetCashAllocation: 20,
    skipThresholdCheck: false,
    skipOpportunityAgent: !hasOppAccess // Auto-skip if no access
  });

  // Validate that stock + cash allocation equals 100%
  const handleStockAllocationChange = (value: number[]) => {
    setRebalanceConfig(prev => ({
      ...prev,
      targetStockAllocation: value[0],
      targetCashAllocation: 100 - value[0]
    }));
  };

  return {
    config,
    setConfig,
    rebalanceConfig,
    setRebalanceConfig,
    handleStockAllocationChange,
  };
}