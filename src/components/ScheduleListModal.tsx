import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  Clock,
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Settings,
  Eye,
  Info,
  Lock,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useRBAC } from "@/hooks/useRBAC";
import ScheduleRebalanceModal from "./schedule-rebalance/ScheduleRebalanceModal";

interface ScheduleListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Schedule {
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
  include_all_positions: boolean;
  last_executed_at?: string;
  next_scheduled_at?: string; // Deprecated - calculated dynamically from last_executed_at + interval
  execution_count: number;
  last_execution_status?: string;
  created_at: string;
}

export default function ScheduleListModal({ isOpen, onClose }: ScheduleListModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { getScheduleResolution, getMaxScheduledRebalances } = useRBAC();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState<Schedule | null>(null);

  // Get allowed schedule resolutions and max schedules for the user
  const allowedResolutions = getScheduleResolution();
  const maxSchedules = getMaxScheduledRebalances();
  const isAtScheduleLimit = schedules.length >= maxSchedules && maxSchedules > 0;

  useEffect(() => {
    if (isOpen && user) {
      loadSchedules();
    }
  }, [isOpen, user]);

  const handleAddSchedule = () => {
    if (isAtScheduleLimit) {
      toast({
        title: "Schedule Limit Reached",
        description: `You have reached the maximum of ${maxSchedules} scheduled rebalances allowed by your subscription plan.`,
        variant: "destructive",
      });
      return;
    }
    setEditingSchedule(null); // Clear any previous editing schedule
    setShowAddModal(true);
  };

  const loadSchedules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rebalance_schedules')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSchedules(data || []);
    } catch (err) {
      console.error('Error loading schedules:', err);
      toast({
        title: "Failed to load schedules",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (schedule: Schedule) => {
    // Check access before deleting
    if (!isScheduleAccessible(schedule)) {
      toast({
        title: "Access Restricted",
        description: "Your subscription plan doesn't allow deleting this schedule frequency",
        variant: "destructive",
      });
      setDeletingSchedule(null);
      return;
    }

    try {
      const { error } = await supabase
        .from('rebalance_schedules')
        .delete()
        .eq('id', schedule.id);

      if (error) throw error;

      toast({
        title: "Schedule deleted",
        description: "The rebalance schedule has been removed",
      });

      // Reload schedules
      loadSchedules();
    } catch (err) {
      console.error('Error deleting schedule:', err);
      toast({
        title: "Failed to delete schedule",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setDeletingSchedule(null);
    }
  };

  // Check if schedule is within user's access level
  const isScheduleAccessible = (schedule: Schedule): boolean => {
    // If no resolutions are defined, allow all (backward compatibility)
    if (!allowedResolutions || allowedResolutions.length === 0) {
      return true;
    }

    // Check if the schedule's frequency matches allowed resolutions
    // The database uses "Day", "Week", "Month" (capitalized)

    // Daily schedules (interval_value = 1, interval_unit = 'days')
    if (schedule.interval_unit === 'days' && schedule.interval_value === 1) {
      return allowedResolutions.includes('Day');
    }

    // Weekly schedules (any interval in weeks)
    if (schedule.interval_unit === 'weeks') {
      return allowedResolutions.includes('Week');
    }

    // Monthly schedules (any interval in months)
    if (schedule.interval_unit === 'months') {
      return allowedResolutions.includes('Month');
    }

    // For custom day intervals (e.g., every 2 days, 3 days, etc.)
    if (schedule.interval_unit === 'days' && schedule.interval_value > 1) {
      // If they have Day access, they can use custom day intervals
      return allowedResolutions.includes('Day');
    }

    // Default to not accessible for unknown types
    return false;
  };

  const handleToggleEnabled = async (schedule: Schedule) => {
    // Check access before toggling
    if (!isScheduleAccessible(schedule)) {
      toast({
        title: "Access Restricted",
        description: "Your subscription plan doesn't allow modifying this schedule frequency",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('rebalance_schedules')
        .update({ enabled: !schedule.enabled })
        .eq('id', schedule.id);

      if (error) throw error;

      toast({
        title: schedule.enabled ? "Schedule disabled" : "Schedule enabled",
        description: schedule.enabled
          ? "The schedule has been paused"
          : "The schedule has been activated",
      });

      // Reload schedules
      loadSchedules();
    } catch (err) {
      console.error('Error toggling schedule:', err);
      toast({
        title: "Failed to update schedule",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const formatFrequency = (schedule: Schedule) => {
    const value = schedule.interval_value;
    const unit = schedule.interval_unit;

    if (value === 1) {
      switch (unit) {
        case 'days': return 'Day';
        case 'weeks': return 'Week';
        case 'months': return 'Month';
      }
    } else if (value === 2 && unit === 'weeks') {
      return 'Bi-weekly';
    }

    return `Every ${value} ${unit}`;
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const min = minutes ? minutes.slice(0, 2) : '00';
    if (hour === 0) return `12:${min} AM`;
    if (hour < 12) return `${hour}:${min} AM`;
    if (hour === 12) return `12:${min} PM`;
    return `${hour - 12}:${min} PM`;
  };

  const formatDaysList = (days?: number[]) => {
    if (!days || days.length === 0) return '';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days.map(d => dayNames[d]).join(', ');
  };

  const calculateNextRun = (schedule: Schedule): Date | null => {
    const now = new Date();
    const [hours, minutes] = schedule.time_of_day.split(':').map(Number);

    // Helper function to convert schedule time to UTC-aware date
    const createScheduledDate = (localDate: Date): Date => {
      // Format date for the target timezone
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const hourStr = String(hours).padStart(2, '0');
      const minuteStr = String(minutes).padStart(2, '0');
      
      // Create an ISO string for the target timezone time
      const dateTimeStr = `${year}-${month}-${day}T${hourStr}:${minuteStr}:00`;
      
      // Use Intl.DateTimeFormat to handle timezone conversion properly
      // This simulates the SQL AT TIME ZONE behavior
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: schedule.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      // Parse the target date/time in the schedule's timezone
      const testDate = new Date(dateTimeStr);
      const parts = formatter.formatToParts(testDate);
      const dateParts: any = {};
      parts.forEach(part => dateParts[part.type] = part.value);
      
      // Get timezone offset for this specific date/time
      const tzFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: schedule.timezone,
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

    // Helper function to find next occurrence for weekly schedules with specific days
    const findNextWeeklyOccurrence = (startDate: Date, daysOfWeek: number[]): Date => {
      let checkDate = new Date(startDate);
      
      // Check up to 7 days ahead
      for (let i = 0; i < 7; i++) {
        // Get day of week in the schedule's timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: schedule.timezone,
          weekday: 'long'
        });
        const dayName = formatter.format(checkDate);
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
        
        if (daysOfWeek.includes(currentDay)) {
          const scheduledTime = createScheduledDate(checkDate);
          if (scheduledTime > now) {
            return scheduledTime;
          }
        }
        
        checkDate.setDate(checkDate.getDate() + 1);
      }
      
      // Fallback
      return createScheduledDate(checkDate);
    };

    // If never executed, calculate from current date
    if (!schedule.last_executed_at) {
      // For weekly schedules with specific days
      if (schedule.interval_unit === 'weeks' && schedule.day_of_week && schedule.day_of_week.length > 0) {
        return findNextWeeklyOccurrence(now, schedule.day_of_week);
      }

      // Create a date at the scheduled time in the target timezone
      let nextRun = createScheduledDate(now);

      // If that time has already passed today, add the interval
      if (nextRun <= now) {
        const nextDate = new Date(now);
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
        nextRun = createScheduledDate(nextDate);
      }

      return nextRun;
    }

    // Calculate from last execution
    const lastRun = new Date(schedule.last_executed_at);
    let nextDate = new Date(lastRun);

    // For weekly schedules with specific days
    if (schedule.interval_unit === 'weeks' && schedule.day_of_week && schedule.day_of_week.length > 0) {
      // Start from the day after last execution
      nextDate.setDate(nextDate.getDate() + 1);
      return findNextWeeklyOccurrence(nextDate, schedule.day_of_week);
    }

    // Add the interval for regular schedules
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

    let nextRun = createScheduledDate(nextDate);

    // IMPORTANT: If the calculated next run is in the past (e.g., schedule was paused),
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
      nextRun = createScheduledDate(nextDate);
    }

    return nextRun;
  };

  const formatNextRun = (schedule: Schedule) => {
    if (!schedule.enabled) return 'Paused';

    const nextRun = calculateNextRun(schedule);
    if (!nextRun) return 'Not scheduled';

    const now = new Date();
    const diffMs = nextRun.getTime() - now.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffMs < 0) return 'Overdue';
    if (diffHours < 1) return 'Within an hour';
    if (diffHours < 24) return `In ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    if (diffDays < 7) return `In ${diffDays} day${diffDays > 1 ? 's' : ''}`;

    return nextRun.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl h-[85vh] p-0 flex flex-col gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Scheduled Rebalances
            </DialogTitle>
            <DialogDescription>
              Manage your automated portfolio rebalancing schedules
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : schedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No schedules yet</p>
                <p className="text-sm text-muted-foreground text-center mb-6">
                  Create your first automated rebalancing schedule to maintain your portfolio allocation
                </p>
                <Button
                  onClick={handleAddSchedule}
                  disabled={isAtScheduleLimit}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {isAtScheduleLimit ? `Limit Reached (${maxSchedules} max)` : 'Add Schedule'}
                </Button>
              </div>
            ) : (
              <div className="p-6 space-y-4">
                {schedules.map((schedule, index) => {
                  const isAccessible = isScheduleAccessible(schedule);
                  return (
                      <Card key={schedule.id} className="p-4">
                        {!isAccessible && (
                          <Alert className="mb-3">
                            <Lock className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              This schedule requires a higher subscription plan to modify.
                              {schedule.interval_unit === 'days' && schedule.interval_value === 1 && " Daily scheduling requires an upgraded plan."}
                              {schedule.interval_unit === 'weeks' && " Weekly scheduling requires an upgraded plan."}
                              {schedule.interval_unit === 'months' && " Monthly scheduling requires an upgraded plan."}
                              {allowedResolutions.length > 0 && (
                                <> Your current plan allows: {allowedResolutions.map(res =>
                                  res === 'Day' ? 'days' :
                                    res === 'Week' ? 'weeks' :
                                      res === 'Month' ? 'months' : res
                                ).join(', ')} scheduling.</>
                              )}
                            </AlertDescription>
                          </Alert>
                        )}
                        <div className={`space-y-3 ${!isAccessible ? 'opacity-60' : ''} `}>
                          {/* Header */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              <div className="mt-1">
                                {schedule.enabled ? (
                                  <Badge variant="default" className="text-xs">
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    Paused
                                  </Badge>
                                )}
                              </div>
                              <div>
                                <h4 className="font-semibold text-sm">
                                  Schedule #{index + 1}
                                </h4>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Created {new Date(schedule.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingSchedule(schedule);
                                  setShowAddModal(true);
                                }}
                                disabled={!isAccessible}
                              >
                                <Settings className="w-4 h-4 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleEnabled(schedule)}
                                disabled={!isAccessible}
                              >
                                {schedule.enabled ? (
                                  <>
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Pause
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Enable
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingSchedule(schedule)}
                                disabled={!isAccessible}
                                className="hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                              >
                                <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                              </Button>
                            </div>
                          </div>

                          <Separator />

                          {/* Schedule Details */}
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground mb-1">Frequency</p>
                              <p className="font-medium">{formatFrequency(schedule)}</p>
                              {schedule.interval_unit === 'weeks' && schedule.day_of_week && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  On {formatDaysList(schedule.day_of_week)}
                                </p>
                              )}
                              {schedule.interval_unit === 'months' && schedule.day_of_month && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Day {schedule.day_of_month.join(', ')} of month
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-1">Time</p>
                              <p className="font-medium">{formatTime(schedule.time_of_day)}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {schedule.timezone}
                              </p>
                            </div>
                          </div>

                          {/* Stock Selection */}
                          <div className="text-sm">
                            <p className="text-muted-foreground mb-1">Stock Selection</p>
                            <div className="flex items-center gap-2">
                              {schedule.include_all_positions ? (
                                <Badge variant="outline" className="text-xs">
                                  All Positions
                                </Badge>
                              ) : schedule.selected_tickers.length > 0 ? (
                                <Badge variant="outline" className="text-xs">
                                  {schedule.selected_tickers.length} Selected Stocks
                                </Badge>
                              ) : null}
                              {schedule.include_watchlist && (
                                <Badge variant="outline" className="text-xs">
                                  <Eye className="w-3 h-3 mr-1" />
                                  Includes Watchlist
                                </Badge>
                              )}
                            </div>
                          </div>

                          <Separator />

                          {/* Execution Status */}
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <div className="flex items-center gap-1 text-muted-foreground mb-1">
                                <span>Next Run</span>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="w-3 h-3 cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p className="text-xs">
                                        Calculated based on: {schedule.last_executed_at ? 'last execution' : 'schedule start'} + {schedule.interval_value} {schedule.interval_unit}
                                      </p>
                                      <p className="text-xs mt-1 text-muted-foreground">
                                        If a schedule was paused, the next run will automatically advance to the next future occurrence.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <p className="font-medium text-xs">
                                {formatNextRun(schedule)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-1">Last Run</p>
                              <div className="flex items-center gap-1">
                                {getStatusIcon(schedule.last_execution_status)}
                                <p className="font-medium text-xs">
                                  {schedule.last_executed_at
                                    ? new Date(schedule.last_executed_at).toLocaleDateString()
                                    : 'Never'}
                                </p>
                              </div>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-1">Total Runs</p>
                              <p className="font-medium text-xs">{schedule.execution_count || 0}</p>
                            </div>
                          </div>
                        </div>
                      </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-4 bg-background flex-shrink-0">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {schedules.length} of {maxSchedules > 0 ? maxSchedules : '∞'} {schedules.length === 1 ? 'schedule' : 'schedules'} configured
                </p>
                {isAtScheduleLimit && (
                  <Badge variant="secondary" className="text-xs">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Limit Reached
                  </Badge>
                )}
              </div>
              <Button
                onClick={handleAddSchedule}
                disabled={isAtScheduleLimit}
              >
                <Plus className="w-4 h-4 mr-2" />
                {isAtScheduleLimit ? 'Schedule Limit Reached' : 'Add Schedule'}
              </Button>
            </div>
          </div>
        </DialogContent >
      </Dialog >

      {/* Add/Edit Schedule Modal */}
      <ScheduleRebalanceModal
        isOpen={showAddModal}
        scheduleToEdit={editingSchedule}
        onClose={() => {
          setShowAddModal(false);
          setEditingSchedule(null);
          loadSchedules(); // Reload schedules after adding/editing
        }}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingSchedule} onOpenChange={() => setDeletingSchedule(null)}>
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
              onClick={() => deletingSchedule && handleDelete(deletingSchedule)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}