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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clock, Calendar, Settings, List, Loader2, AlertCircle } from "lucide-react";
import { useAuth, hasRequiredApiKeys, hasAlpacaCredentials } from "@/lib/auth";
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
  const { user, apiSettings } = useAuth();
  const [activeTab, setActiveTab] = useState("schedule");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Check for required credentials
  const hasApiKeys = hasRequiredApiKeys(apiSettings);
  const hasAlpaca = hasAlpacaCredentials(apiSettings);
  const canCreateSchedule = hasApiKeys && hasAlpaca;

  // Use configuration hooks
  const {
    config,
    setConfig,
    rebalanceConfig,
    setRebalanceConfig,
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
    if (success) {
      setShowDeleteConfirm(false);
    }
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
            
            {/* Stock Selection Limit Display */}
            {maxStocks > 0 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Stock selection limit: {selectedPositions.size} / {maxStocks} stocks selected
                </span>
                {selectedPositions.size >= maxStocks && (
                  <Badge variant="destructive" className="text-xs">Limit Reached</Badge>
                )}
              </div>
            )}
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
            selectedPositionsCount={selectedPositions.size}
            includeWatchlist={includeWatchlist}
            watchlistSelectedCount={watchlistSelectedCount}
          />
        </Tabs>

        {/* Warning message for missing credentials */}
        {!canCreateSchedule && (
          <div className="px-6 py-4 border-t">
            <Alert className="bg-yellow-500/10 border-yellow-500/20">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-600 dark:text-yellow-400">
                {!hasApiKeys && !hasAlpaca ? (
                  <>
                    <strong>Configuration Required:</strong> Please configure both your AI provider API keys and Alpaca credentials in the Settings page before creating a rebalance schedule.
                  </>
                ) : !hasApiKeys ? (
                  <>
                    <strong>AI Provider Required:</strong> Please configure your AI provider API keys in the Settings page before creating a rebalance schedule.
                  </>
                ) : (
                  <>
                    <strong>Alpaca Credentials Required:</strong> Please configure your Alpaca API credentials in the Settings page before creating a rebalance schedule.
                  </>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Fixed Footer */}
        <div className="border-t px-6 py-4 bg-background shrink-0">
          <div className="flex justify-between">
            <div>
              {existingSchedule && (
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
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
                disabled={saving || loading || (selectedPositions.size === 0 && !includeAllPositions) || !canCreateSchedule}
                title={!canCreateSchedule ? "Please configure API keys and Alpaca credentials first" : undefined}
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
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The schedule will be permanently removed and will no longer execute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}