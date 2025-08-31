// Hook for schedule save and delete actions
// Extracted from ScheduleRebalanceModal.tsx to reduce file size

import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import type { ScheduleConfig, RebalanceConfig, ExistingSchedule } from "../types";

interface UseScheduleActionsProps {
  config: ScheduleConfig;
  rebalanceConfig: RebalanceConfig;
  selectedPositions: Set<string>;
  includeAllPositions: boolean;
  includeWatchlist: boolean;
  existingSchedule: ExistingSchedule | null;
  onClose: () => void;
}

export function useScheduleActions({
  config,
  rebalanceConfig,
  selectedPositions,
  includeAllPositions,
  includeWatchlist,
  existingSchedule,
  onClose,
}: UseScheduleActionsProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!user) return false;

    // Validate inputs
    if (selectedPositions.size === 0) {
      toast({
        title: "No stocks selected",
        description: "Please select at least one stock for scheduled rebalancing",
        variant: "destructive",
      });
      return false;
    }

    try {
      // Convert time to 24-hour format for database
      const [time, period] = config.timeOfDay.split(' ');
      const [hourStr, minuteStr] = time.split(':');
      let hour24 = parseInt(hourStr);

      if (period === 'PM' && hour24 !== 12) {
        hour24 += 12;
      } else if (period === 'AM' && hour24 === 12) {
        hour24 = 0;
      }

      const scheduleData = {
        user_id: user.id,
        enabled: config.enabled,
        frequency: 'custom', // Always use custom
        interval_value: config.intervalValue,
        interval_unit: config.intervalUnit,
        day_of_week: config.intervalUnit === 'weeks' ? config.daysOfWeek : null,
        day_of_month: config.intervalUnit === 'months' ? config.daysOfMonth : null,
        time_of_day: `${hour24.toString().padStart(2, '0')}:${minuteStr}:00`,
        timezone: config.timezone,
        selected_tickers: Array.from(selectedPositions),
        include_watchlist: includeWatchlist,
        include_all_positions: false, // Deprecated - always use selected tickers
        // Rebalance configuration
        use_default_settings: rebalanceConfig.useDefaultSettings,
        max_position_size: rebalanceConfig.useDefaultSettings ? null : rebalanceConfig.maxPosition,
        min_position_size: rebalanceConfig.useDefaultSettings ? null : rebalanceConfig.minPosition,
        rebalance_threshold: rebalanceConfig.useDefaultSettings ? null : rebalanceConfig.rebalanceThreshold,
        target_stock_allocation: rebalanceConfig.useDefaultSettings ? null : rebalanceConfig.targetStockAllocation,
        target_cash_allocation: rebalanceConfig.useDefaultSettings ? null : rebalanceConfig.targetCashAllocation,
        skip_threshold_check: rebalanceConfig.skipThresholdCheck,
        skip_opportunity_agent: rebalanceConfig.skipOpportunityAgent,
      };

      if (existingSchedule) {
        // Update existing schedule
        const { error } = await supabase
          .from('rebalance_schedules')
          .update(scheduleData)
          .eq('id', existingSchedule.id);

        if (error) throw error;

        toast({
          title: "Schedule updated",
          description: "Your rebalance schedule has been updated successfully",
        });
      } else {
        // Create new schedule
        const { error } = await supabase
          .from('rebalance_schedules')
          .insert(scheduleData);

        if (error) throw error;

        toast({
          title: "Schedule created",
          description: "Your rebalance schedule has been created successfully",
        });
      }

      onClose();
      return true;
    } catch (err) {
      console.error('Error saving schedule:', err);
      toast({
        title: "Failed to save schedule",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleDelete = async () => {
    if (!existingSchedule || !user) return false;

    try {
      const { error } = await supabase
        .from('rebalance_schedules')
        .delete()
        .eq('id', existingSchedule.id);

      if (error) throw error;

      toast({
        title: "Schedule deleted",
        description: "Your rebalance schedule has been deleted",
      });

      onClose();
      return true;
    } catch (err) {
      console.error('Error deleting schedule:', err);
      toast({
        title: "Failed to delete schedule",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    handleSave,
    handleDelete,
  };
}