// Main ScheduleRebalanceModal component - refactored and modularized
// Maintaining exact same functionality as original

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Calendar, Settings, List, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
// Import hooks
import { useScheduleData } from "./hooks/useScheduleData";
import { useScheduleConfig } from "./hooks/useScheduleConfig";
import { useScheduleActions } from "./hooks/useScheduleActions";
// Import tabs
import { ScheduleTab } from "./tabs/ScheduleTab";
import { StockSelectionTab } from "./tabs/StockSelectionTab";
import { SettingsTab } from "./tabs/SettingsTab";
// Import types
import type { ScheduleRebalanceModalProps } from "./types";

export default function ScheduleRebalanceModal({ isOpen, onClose, scheduleToEdit }: ScheduleRebalanceModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("schedule");

  // Use configuration hooks
  const {
    config,
    setConfig,
    rebalanceConfig,
    setRebalanceConfig,
    handleStockAllocationChange,
  } = useScheduleConfig();

  // Use data management hook
  const {
    loading,
    saving,
    setSaving,
    error,
    existingSchedule,
    positions,
    selectedPositions,
    includeWatchlist,
    setIncludeWatchlist,
    watchlistStocks,
    includeAllPositions,
    loadingWatchlist,
    cashAllocation,
    maxStocks,
    loadData,
    togglePosition,
  } = useScheduleData(isOpen, scheduleToEdit?.id || null);

  // Use actions hook
  const { handleSave: saveSchedule, handleDelete: deleteSchedule } = useScheduleActions({
    config,
    rebalanceConfig,
    selectedPositions,
    includeAllPositions,
    includeWatchlist,
    existingSchedule,
    onClose,
  });

  // Load data when modal opens or schedule changes
  useEffect(() => {
    if (isOpen && user) {
      loadData(setConfig, setRebalanceConfig, scheduleToEdit);
    } else if (!isOpen) {
      setActiveTab("schedule");
    }
  }, [isOpen, user, scheduleToEdit?.id]);

  const handleSave = async () => {
    setSaving(true);
    const success = await saveSchedule();
    setSaving(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    const success = await deleteSchedule();
    setSaving(false);
  };

  // Calculate watchlist selected count
  const watchlistSelectedCount = watchlistStocks.filter(t => selectedPositions.has(t)).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="!max-w-5xl !max-h-[90vh] !p-0 !flex !flex-col !gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Schedule Portfolio Rebalancing
          </DialogTitle>
          <DialogDescription>
            Configure automatic portfolio rebalancing on a schedule. The schedule will be active immediately after creation.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4 shrink-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="schedule" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Schedule
              </TabsTrigger>
              <TabsTrigger value="stocks" className="flex items-center gap-2">
                <List className="w-4 h-4" />
                Stocks
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Schedule Settings Tab */}
          <ScheduleTab
            loading={loading}
            config={config}
            setConfig={setConfig}
          />

          {/* Stock Selection Tab */}
          <StockSelectionTab
            loading={loading}
            error={error}
            positions={positions}
            selectedPositions={selectedPositions}
            includeWatchlist={includeWatchlist}
            setIncludeWatchlist={setIncludeWatchlist}
            watchlistStocks={watchlistStocks}
            loadingWatchlist={loadingWatchlist}
            cashAllocation={cashAllocation}
            maxStocks={maxStocks}
            togglePosition={togglePosition}
          />

          {/* Rebalance Settings Tab */}
          <SettingsTab
            rebalanceConfig={rebalanceConfig}
            setRebalanceConfig={setRebalanceConfig}
            handleStockAllocationChange={handleStockAllocationChange}
            selectedPositionsCount={selectedPositions.size}
            includeWatchlist={includeWatchlist}
            watchlistSelectedCount={watchlistSelectedCount}
          />
        </Tabs>

        {/* Fixed Footer */}
        <div className="border-t px-6 py-4 bg-background shrink-0">
          <div className="flex justify-between">
            <div>
              {existingSchedule && (
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={saving}
                  className="border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-700 dark:hover:text-red-300"
                >
                  Delete Schedule
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || loading || (selectedPositions.size === 0 && !includeAllPositions)}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 mr-2" />
                    {existingSchedule ? 'Update Schedule' : 'Create Schedule'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}