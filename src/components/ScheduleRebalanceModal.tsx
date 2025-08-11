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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Clock,
  Calendar,
  Settings,
  List,
  Loader2,
  AlertCircle,
  Eye,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-supabase";
import { alpacaAPI } from "@/lib/alpaca";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface ScheduleRebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface RebalanceConfig {
  useDefaultSettings: boolean;
  maxPosition: number;
  minPosition: number;
  rebalanceThreshold: number;
  targetStockAllocation: number;
  targetCashAllocation: number;
  skipThresholdCheck: boolean;
  skipOpportunityAgent: boolean;
}

interface ScheduleConfig {
  enabled: boolean;
  intervalValue: number;
  intervalUnit: 'days' | 'weeks' | 'months';
  daysOfWeek: number[]; // For weekly intervals
  daysOfMonth: number[]; // For monthly intervals
  timeOfDay: string;
  timezone: string;
}

interface Position {
  ticker: string;
  currentShares: number;
  currentValue: number;
  currentAllocation: number;
  avgPrice?: number;
}

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

// Generate a random color for each stock
function generateRandomColor(seed: string): string {
  // Use the ticker as a seed for consistent colors
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate vibrant colors by ensuring high saturation and medium lightness
  const hue = Math.abs(hash) % 360;
  const saturation = 65 + (Math.abs(hash >> 8) % 20); // 65-85%
  const lightness = 45 + (Math.abs(hash >> 16) % 15); // 45-60%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Get timezone offset string (e.g., "+05:30", "-08:00")
const getTimezoneOffset = (tz: string): string => {
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

// Comprehensive timezone list grouped by region
const TIMEZONE_GROUPS = {
  'North America': [
    { value: 'America/New_York', label: 'New York (Eastern)' },
    { value: 'America/Chicago', label: 'Chicago (Central)' },
    { value: 'America/Denver', label: 'Denver (Mountain)' },
    { value: 'America/Phoenix', label: 'Phoenix (Arizona)' },
    { value: 'America/Los_Angeles', label: 'Los Angeles (Pacific)' },
    { value: 'America/Anchorage', label: 'Anchorage (Alaska)' },
    { value: 'Pacific/Honolulu', label: 'Honolulu (Hawaii)' },
    { value: 'America/Toronto', label: 'Toronto' },
    { value: 'America/Vancouver', label: 'Vancouver' },
    { value: 'America/Mexico_City', label: 'Mexico City' },
  ],
  'South America': [
    { value: 'America/Sao_Paulo', label: 'São Paulo' },
    { value: 'America/Buenos_Aires', label: 'Buenos Aires' },
    { value: 'America/Lima', label: 'Lima' },
    { value: 'America/Bogota', label: 'Bogotá' },
    { value: 'America/Santiago', label: 'Santiago' },
    { value: 'America/Caracas', label: 'Caracas' },
  ],
  'Europe': [
    { value: 'Europe/London', label: 'London' },
    { value: 'Europe/Paris', label: 'Paris' },
    { value: 'Europe/Berlin', label: 'Berlin' },
    { value: 'Europe/Madrid', label: 'Madrid' },
    { value: 'Europe/Rome', label: 'Rome' },
    { value: 'Europe/Amsterdam', label: 'Amsterdam' },
    { value: 'Europe/Brussels', label: 'Brussels' },
    { value: 'Europe/Vienna', label: 'Vienna' },
    { value: 'Europe/Stockholm', label: 'Stockholm' },
    { value: 'Europe/Oslo', label: 'Oslo' },
    { value: 'Europe/Copenhagen', label: 'Copenhagen' },
    { value: 'Europe/Helsinki', label: 'Helsinki' },
    { value: 'Europe/Athens', label: 'Athens' },
    { value: 'Europe/Istanbul', label: 'Istanbul' },
    { value: 'Europe/Moscow', label: 'Moscow' },
    { value: 'Europe/Warsaw', label: 'Warsaw' },
    { value: 'Europe/Prague', label: 'Prague' },
    { value: 'Europe/Budapest', label: 'Budapest' },
    { value: 'Europe/Zurich', label: 'Zurich' },
    { value: 'Europe/Dublin', label: 'Dublin' },
    { value: 'Europe/Lisbon', label: 'Lisbon' },
  ],
  'Asia': [
    { value: 'Asia/Tokyo', label: 'Tokyo' },
    { value: 'Asia/Shanghai', label: 'Beijing' },
    { value: 'Asia/Shanghai', label: 'Shanghai' },
    { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
    { value: 'Asia/Singapore', label: 'Singapore' },
    { value: 'Asia/Seoul', label: 'Seoul' },
    { value: 'Asia/Taipei', label: 'Taipei' },
    { value: 'Asia/Bangkok', label: 'Bangkok' },
    { value: 'Asia/Jakarta', label: 'Jakarta' },
    { value: 'Asia/Manila', label: 'Manila' },
    { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur' },
    { value: 'Asia/Mumbai', label: 'Mumbai' },
    { value: 'Asia/Kolkata', label: 'Kolkata' },
    { value: 'Asia/Delhi', label: 'New Delhi' },
    { value: 'Asia/Bangalore', label: 'Bangalore' },
    { value: 'Asia/Dubai', label: 'Dubai' },
    { value: 'Asia/Tel_Aviv', label: 'Tel Aviv' },
    { value: 'Asia/Jerusalem', label: 'Jerusalem' },
    { value: 'Asia/Riyadh', label: 'Riyadh' },
    { value: 'Asia/Kuwait', label: 'Kuwait' },
    { value: 'Asia/Qatar', label: 'Doha' },
    { value: 'Asia/Karachi', label: 'Karachi' },
    { value: 'Asia/Dhaka', label: 'Dhaka' },
    { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City' },
  ],
  'Africa': [
    { value: 'Africa/Cairo', label: 'Cairo' },
    { value: 'Africa/Lagos', label: 'Lagos' },
    { value: 'Africa/Johannesburg', label: 'Johannesburg' },
    { value: 'Africa/Nairobi', label: 'Nairobi' },
    { value: 'Africa/Casablanca', label: 'Casablanca' },
    { value: 'Africa/Algiers', label: 'Algiers' },
    { value: 'Africa/Tunis', label: 'Tunis' },
  ],
  'Oceania': [
    { value: 'Australia/Sydney', label: 'Sydney' },
    { value: 'Australia/Melbourne', label: 'Melbourne' },
    { value: 'Australia/Brisbane', label: 'Brisbane' },
    { value: 'Australia/Perth', label: 'Perth' },
    { value: 'Australia/Adelaide', label: 'Adelaide' },
    { value: 'Pacific/Auckland', label: 'Auckland' },
    { value: 'Pacific/Fiji', label: 'Fiji' },
  ],
};

export default function ScheduleRebalanceModal({ isOpen, onClose }: ScheduleRebalanceModalProps) {
  const { user, apiSettings } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("schedule");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingSchedule, setExistingSchedule] = useState<any>(null);
  const [timezoneSearch, setTimezoneSearch] = useState("");

  // Schedule configuration
  const [config, setConfig] = useState<ScheduleConfig>({
    enabled: true,
    intervalValue: 1,
    intervalUnit: 'weeks',
    daysOfWeek: [1], // Default to Monday
    daysOfMonth: [1], // Default to 1st of month
    timeOfDay: '09:00', // Default to 9 AM (hour only)
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // Rebalance configuration
  const [rebalanceConfig, setRebalanceConfig] = useState<RebalanceConfig>({
    useDefaultSettings: true,
    maxPosition: 10000,
    minPosition: 100,
    rebalanceThreshold: 10,
    targetStockAllocation: 80,
    targetCashAllocation: 20,
    skipThresholdCheck: false,
    skipOpportunityAgent: false
  });

  // Stock selection
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [includeWatchlist, setIncludeWatchlist] = useState(false);
  const [watchlistStocks, setWatchlistStocks] = useState<string[]>([]);
  const [includeAllPositions, setIncludeAllPositions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [cashAllocation, setCashAllocation] = useState(0);
  const [portfolioTotalValue, setPortfolioTotalValue] = useState(0);
  const [portfolioCashBalance, setPortfolioCashBalance] = useState(0);

  // Load existing schedule and positions when modal opens
  useEffect(() => {
    if (isOpen && user) {
      loadData();
    } else if (!isOpen) {
      // Reset state when modal closes
      setActiveTab("schedule");
      setError(null);
      setSelectedPositions(new Set());
      setIncludeWatchlist(false);
      setWatchlistStocks([]);
    }
  }, [isOpen, user]);

  // Load watchlist stocks when includeWatchlist changes
  useEffect(() => {
    if (includeWatchlist && user) {
      loadWatchlistStocks();
    } else if (!includeWatchlist) {
      // Remove watchlist stocks from selection when disabled
      const newSelection = new Set(selectedPositions);
      watchlistStocks.forEach(ticker => {
        newSelection.delete(ticker);
      });
      setSelectedPositions(newSelection);
      setWatchlistStocks([]);
    }
  }, [includeWatchlist, user, positions]);

  const loadWatchlistStocks = async () => {
    if (!user) return;
    
    setLoadingWatchlist(true);
    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select('ticker')
        .eq('user_id', user.id)
        .order('ticker');
      
      if (error) {
        console.error('Error loading watchlist:', error);
        return;
      }
      
      if (data) {
        // Filter out stocks that are already in positions
        const positionTickers = new Set(positions.map(p => p.ticker));
        const watchlistOnlyStocks = data
          .map(item => item.ticker)
          .filter(ticker => !positionTickers.has(ticker));
        
        setWatchlistStocks(watchlistOnlyStocks);
        
        // Auto-select all watchlist stocks when loaded
        if (watchlistOnlyStocks.length > 0) {
          setSelectedPositions(prev => {
            const newSelection = new Set(prev);
            watchlistOnlyStocks.forEach(ticker => {
              newSelection.add(ticker);
            });
            return newSelection;
          });
        }
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  const handleIncludeWatchlistChange = (checked: boolean) => {
    setIncludeWatchlist(checked);
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load existing schedule if any
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('rebalance_schedules')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (scheduleData && !scheduleError) {
        setExistingSchedule(scheduleData);

        // Update config from existing schedule
        // All schedules are now stored as 'custom' in the database
        setConfig({
          enabled: scheduleData.enabled,
          intervalValue: scheduleData.interval_value || 1,
          intervalUnit: scheduleData.interval_unit || 'weeks',
          daysOfWeek: scheduleData.day_of_week || [1],
          daysOfMonth: scheduleData.day_of_month || [1],
          timeOfDay: scheduleData.time_of_day?.slice(0, 2) + ':00' || '09:00',
          timezone: scheduleData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        });

        // Update rebalance config from existing schedule
        setRebalanceConfig({
          useDefaultSettings: scheduleData.use_default_settings ?? true,
          maxPosition: scheduleData.max_position_size || apiSettings?.rebalance_max_position_size || 10000,
          minPosition: scheduleData.min_position_size || apiSettings?.rebalance_min_position_size || 100,
          rebalanceThreshold: scheduleData.rebalance_threshold || apiSettings?.rebalance_threshold || 10,
          targetStockAllocation: scheduleData.target_stock_allocation || 80,
          targetCashAllocation: scheduleData.target_cash_allocation || 20,
          skipThresholdCheck: scheduleData.skip_threshold_check || false,
          skipOpportunityAgent: scheduleData.skip_opportunity_agent || false
        });

        // Set selected tickers
        if (scheduleData.selected_tickers) {
          setSelectedPositions(new Set(scheduleData.selected_tickers));
        }
        setIncludeWatchlist(scheduleData.include_watchlist || false);
        setIncludeAllPositions(scheduleData.include_all_positions || false);
      } else {
        // Load default rebalance config from apiSettings for new schedules
        if (apiSettings) {
          setRebalanceConfig(prev => ({
            ...prev,
            maxPosition: apiSettings.rebalance_max_position_size || 10000,
            minPosition: apiSettings.rebalance_min_position_size || 100,
            rebalanceThreshold: apiSettings.rebalance_threshold || 10,
          }));
        }
      }

      // Load portfolio positions
      const [accountData, alpacaPositions] = await Promise.all([
        alpacaAPI.getAccount(),
        alpacaAPI.getPositions()
      ]);
      
      if (accountData) {
        const totalEquity = parseFloat(accountData.equity || '0');
        const cashBalance = parseFloat(accountData.cash || '0');
        setPortfolioTotalValue(totalEquity);
        setPortfolioCashBalance(cashBalance);
        setCashAllocation((cashBalance / totalEquity) * 100);
      }
      
      if (alpacaPositions && Array.isArray(alpacaPositions)) {
        const totalEquity = parseFloat(accountData?.equity || '0');

        const processedPositions: Position[] = alpacaPositions.map((pos: any) => ({
          ticker: pos.symbol,
          currentShares: parseFloat(pos.qty || '0'),
          currentValue: parseFloat(pos.market_value || '0'),
          currentAllocation: totalEquity > 0 ? (parseFloat(pos.market_value || '0') / totalEquity) * 100 : 0,
          avgPrice: parseFloat(pos.avg_entry_price || '0')
        }));

        // Sort positions by allocation (descending)
        processedPositions.sort((a, b) => b.currentAllocation - a.currentAllocation);

        setPositions(processedPositions);

        // If include all positions is true, select all
        if (includeAllPositions) {
          setSelectedPositions(new Set(processedPositions.map(p => p.ticker)));
        } else if (!scheduleData || !scheduleData.selected_tickers) {
          // Select all by default for new schedules
          setSelectedPositions(new Set(processedPositions.map(p => p.ticker)));
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    // Validate inputs
    if (selectedPositions.size === 0 && !includeAllPositions) {
      toast({
        title: "No stocks selected",
        description: "Please select at least one stock or enable 'Include All Positions'",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // All schedules use 'custom' frequency with interval specification
      const scheduleData = {
        user_id: user.id,
        enabled: config.enabled,
        frequency: 'custom', // Always use custom
        interval_value: config.intervalValue,
        interval_unit: config.intervalUnit,
        day_of_week: config.intervalUnit === 'weeks' ? config.daysOfWeek : null,
        day_of_month: config.intervalUnit === 'months' ? config.daysOfMonth : null,
        time_of_day: config.timeOfDay.slice(0, 2) + ':00:00', // Ensure hour only with :00:00
        timezone: config.timezone,
        selected_tickers: includeAllPositions ? [] : Array.from(selectedPositions),
        include_watchlist: includeWatchlist,
        include_all_positions: includeAllPositions,
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
    } catch (err) {
      console.error('Error saving schedule:', err);
      toast({
        title: "Failed to save schedule",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!existingSchedule || !user) return;

    setSaving(true);

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
    } catch (err) {
      console.error('Error deleting schedule:', err);
      toast({
        title: "Failed to delete schedule",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const togglePosition = (ticker: string) => {
    const newSet = new Set(selectedPositions);
    if (newSet.has(ticker)) {
      newSet.delete(ticker);
    } else {
      newSet.add(ticker);
    }
    setSelectedPositions(newSet);
  };

  // Validate that stock + cash allocation equals 100%
  const handleStockAllocationChange = (value: number[]) => {
    setRebalanceConfig(prev => ({
      ...prev,
      targetStockAllocation: value[0],
      targetCashAllocation: 100 - value[0]
    }));
  };

  const getNextRunTime = () => {
    // This is a simplified preview - actual calculation happens in the database
    const now = new Date();
    const hours = parseInt(config.timeOfDay.slice(0, 2));
    const minutes = 0; // Always 0 since we only allow hour selection

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

  // Generate colors for all positions
  const positionColors = positions.reduce((acc, position) => {
    acc[position.ticker] = generateRandomColor(position.ticker);
    return acc;
  }, {} as Record<string, string>);

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
          <TabsContent value="schedule" className="flex-1 overflow-y-auto px-6 pb-4 mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : (
              <div className="space-y-6">

                {/* Frequency Configuration */}
                <Card className="p-6">
                  <div className="space-y-4">
                    {/* Interval Configuration */}
                    <div className="space-y-2">
                      <Label>Rebalance Frequency</Label>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="interval-value" className="text-sm font-normal">
                            Every
                          </Label>
                          <Input
                            id="interval-value"
                            type="number"
                            min="1"
                            value={config.intervalValue}
                            onChange={(e) => setConfig(prev => ({
                              ...prev,
                              intervalValue: parseInt(e.target.value) || 1
                            }))}
                            className="w-20"
                          />
                        </div>
                        <Select
                          value={config.intervalUnit}
                          onValueChange={(value: any) => setConfig(prev => ({
                            ...prev,
                            intervalUnit: value
                          }))}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="days">Day(s)</SelectItem>
                            <SelectItem value="weeks">Week(s)</SelectItem>
                            <SelectItem value="months">Month(s)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {config.intervalValue === 1 && config.intervalUnit === 'days' && 'Daily rebalancing'}
                        {config.intervalValue === 1 && config.intervalUnit === 'weeks' && 'Weekly rebalancing'}
                        {config.intervalValue === 2 && config.intervalUnit === 'weeks' && 'Bi-weekly rebalancing'}
                        {config.intervalValue === 1 && config.intervalUnit === 'months' && 'Monthly rebalancing'}
                        {config.intervalValue > 1 && `Every ${config.intervalValue} ${config.intervalUnit}`}
                      </p>
                    </div>

                    {/* Day Selection for Weekly intervals */}
                    {config.intervalUnit === 'weeks' && (
                      <div className="space-y-2">
                        <Label>On Which Day(s)</Label>
                        <div className="grid grid-cols-4 gap-2">
                          {WEEKDAYS.map(day => (
                            <div key={day.value} className="flex items-center space-x-2">
                              <Checkbox
                                id={`day-${day.value}`}
                                checked={config.daysOfWeek.includes(day.value)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setConfig(prev => ({
                                      ...prev,
                                      daysOfWeek: [...prev.daysOfWeek, day.value]
                                    }));
                                  } else {
                                    setConfig(prev => ({
                                      ...prev,
                                      daysOfWeek: prev.daysOfWeek.filter(d => d !== day.value)
                                    }));
                                  }
                                }}
                              />
                              <Label htmlFor={`day-${day.value}`} className="text-sm">
                                {day.label}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Day of Month for Monthly intervals */}
                    {config.intervalUnit === 'months' && (
                      <div className="space-y-2">
                        <Label>On Which Day(s) of the Month</Label>
                        <Input
                          type="text"
                          placeholder="e.g., 1, 15 (comma-separated)"
                          value={config.daysOfMonth.join(', ')}
                          onChange={(e) => {
                            const days = e.target.value
                              .split(',')
                              .map(d => parseInt(d.trim()))
                              .filter(d => !isNaN(d) && d >= 1 && d <= 31);
                            setConfig(prev => ({ ...prev, daysOfMonth: days }));
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          Enter day(s) of the month (1-31). For end of month, use 31.
                        </p>
                      </div>
                    )}

                    {/* Time of Day */}
                    <div className="space-y-2">
                      <Label>Hour of Day</Label>
                      <Select
                        value={config.timeOfDay}
                        onValueChange={(value) => setConfig(prev => ({ ...prev, timeOfDay: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {Array.from({ length: 24 }, (_, i) => {
                            const hour = i.toString().padStart(2, '0');
                            const time12 = i === 0 ? '12:00 AM' :
                              i < 12 ? `${i}:00 AM` :
                                i === 12 ? '12:00 PM' :
                                  `${i - 12}:00 PM`;
                            return (
                              <SelectItem key={hour} value={`${hour}:00`}>
                                {time12}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Rebalances execute at the start of the selected hour (cron runs hourly)
                      </p>
                    </div>

                    {/* Timezone */}
                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select
                        value={config.timezone}
                        onValueChange={(value) => setConfig(prev => ({ ...prev, timezone: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone">
                            {(() => {
                              // Find and display the selected timezone
                              for (const [region, zones] of Object.entries(TIMEZONE_GROUPS)) {
                                const zone = zones.find(z => z.value === config.timezone);
                                if (zone) {
                                  const offset = getTimezoneOffset(config.timezone);
                                  return `${zone.label} (UTC${offset})`;
                                }
                              }
                              return config.timezone;
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {/* Search input */}
                          <div className="px-2 pb-2">
                            <Input
                              placeholder="Search timezone..."
                              value={timezoneSearch}
                              onChange={(e) => setTimezoneSearch(e.target.value)}
                              className="h-8"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>

                          {/* Grouped timezone options */}
                          {Object.entries(TIMEZONE_GROUPS).map(([region, zones]) => {
                            // Filter zones based on search
                            const filteredZones = zones.filter(zone =>
                              zone.label.toLowerCase().includes(timezoneSearch.toLowerCase()) ||
                              zone.value.toLowerCase().includes(timezoneSearch.toLowerCase()) ||
                              region.toLowerCase().includes(timezoneSearch.toLowerCase())
                            );

                            if (filteredZones.length === 0) return null;

                            return (
                              <div key={region}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                                  {region}
                                </div>
                                {filteredZones.map(tz => {
                                  const offset = getTimezoneOffset(tz.value);
                                  return (
                                    <SelectItem key={tz.value} value={tz.value}>
                                      <span>{tz.label}</span>
                                      <span className="ml-2 text-muted-foreground text-xs">
                                        (UTC{offset})
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Select your local timezone for accurate scheduling
                      </p>
                    </div>

                    {/* Next Run Preview */}
                    {config.enabled && (
                      <div className="pt-4 border-t">
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="font-medium">Next scheduled run:</span>
                          <span className="text-muted-foreground">
                            {getNextRunTime()}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Stock Selection Tab */}
          <TabsContent value="stocks" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 data-[state=inactive]:hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Loading portfolio data...</p>
              </div>
            ) : error ? (
              <Card className="p-6">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-5 h-5" />
                  <p>{error}</p>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Portfolio Composition Visualization */}
                {positions.length > 0 && (
                  <Card className="p-4">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold">Current Portfolio Composition</h4>

                      {/* Stacked Bar */}
                      <div className="w-full h-10 flex rounded-lg overflow-hidden border">
                        {positions.map((position) => (
                          <div
                            key={position.ticker}
                            className="relative group transition-opacity hover:opacity-90"
                            style={{
                              width: `${position.currentAllocation}%`,
                              backgroundColor: positionColors[position.ticker]
                            }}
                          >
                            {/* Show percentage if space allows */}
                            {position.currentAllocation >= 8 && (
                              <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-medium drop-shadow">
                                {position.currentAllocation.toFixed(1)}%
                              </span>
                            )}

                            {/* Tooltip on hover */}
                            <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10 pointer-events-none transition-opacity">
                              {position.ticker}: {position.currentAllocation.toFixed(1)}%
                            </div>
                          </div>
                        ))}

                        {/* Cash portion */}
                        {cashAllocation > 0 && (
                          <div
                            className="bg-gray-500 relative group transition-opacity hover:opacity-90"
                            style={{ width: `${cashAllocation}%` }}
                          >
                            {cashAllocation >= 8 && (
                              <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-medium drop-shadow">
                                {cashAllocation.toFixed(1)}%
                              </span>
                            )}

                            {/* Tooltip on hover */}
                            <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10 pointer-events-none transition-opacity">
                              Cash: {cashAllocation.toFixed(1)}%
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-3 text-xs">
                        {positions.map((position) => (
                          <div key={position.ticker} className="flex items-center gap-1.5">
                            <div
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: positionColors[position.ticker] }}
                            />
                            <span className="font-medium">{position.ticker}:</span>
                            <span className="text-muted-foreground">{position.currentAllocation.toFixed(1)}%</span>
                          </div>
                        ))}
                        {cashAllocation > 0 && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-gray-500" />
                            <span className="font-medium">Cash:</span>
                            <span className="text-muted-foreground">{cashAllocation.toFixed(1)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                )}

                {/* Include Watchlist Stocks Option */}
                <Card className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label htmlFor="include-watchlist" className="text-sm font-semibold">
                          Include Watchlist Stocks
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Add stocks from your watchlist to the rebalancing analysis
                        </p>
                      </div>
                      <Switch
                        id="include-watchlist"
                        checked={includeWatchlist}
                        onCheckedChange={handleIncludeWatchlistChange}
                        disabled={loadingWatchlist}
                      />
                    </div>
                    
                    {includeWatchlist && watchlistStocks.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-2">
                          Watchlist stocks available for analysis (not in portfolio):
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {watchlistStocks.map(ticker => {
                            const isSelected = selectedPositions.has(ticker);
                            return (
                              <Badge 
                                key={ticker} 
                                variant={isSelected ? "default" : "secondary"}
                                className="text-xs cursor-pointer"
                                onClick={() => togglePosition(ticker)}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                {ticker}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {loadingWatchlist && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="text-xs">Loading watchlist...</span>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Stock Selection List */}
                {positions.length === 0 && watchlistStocks.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-muted-foreground">No positions found in your account</p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {/* Current Portfolio Positions */}
                    {positions.length > 0 && (
                      <>
                        <h4 className="text-sm font-semibold text-muted-foreground">Portfolio Holdings</h4>
                        {positions.map((position) => {
                          const isSelected = selectedPositions.has(position.ticker);

                          return (
                            <div
                              key={position.ticker}
                              className={`p-4 rounded-lg border transition-all cursor-pointer ${
                                isSelected ? 'bg-muted/50 border-primary' : 'bg-background border-border'
                              }`}
                              onClick={() => togglePosition(position.ticker)}
                            >
                              <div className="space-y-3">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => togglePosition(position.ticker)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <span className="font-semibold text-lg">{position.ticker}</span>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-medium">
                                      Total Value: ${position.currentValue.toLocaleString(undefined, { 
                                        minimumFractionDigits: 2, 
                                        maximumFractionDigits: 2 
                                      })}
                                    </p>
                                    {position.avgPrice && (
                                      <p className="text-xs text-muted-foreground">
                                        Avg Price: ${position.avgPrice.toFixed(2)}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {/* Current Allocation */}
                                <div className="flex items-center gap-4">
                                  <span className="text-xs text-muted-foreground w-24">Current Allocation:</span>
                                  <Progress value={position.currentAllocation} className="flex-1 h-2" />
                                  <span className="text-xs font-medium w-12 text-right">
                                    {position.currentAllocation.toFixed(1)}%
                                  </span>
                                </div>

                                {/* Current Position */}
                                <div className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">
                                      Current Position: {position.currentShares} shares
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                    
                    {/* Watchlist Stocks (if included) */}
                    {includeWatchlist && watchlistStocks.length > 0 && (
                      <>
                        <h4 className="text-sm font-semibold text-muted-foreground mt-4">Watchlist Stocks (Not in Portfolio)</h4>
                        {watchlistStocks.map((ticker) => {
                          const isSelected = selectedPositions.has(ticker);
                          
                          return (
                            <div
                              key={ticker}
                              className={`p-4 rounded-lg border transition-all cursor-pointer ${
                                isSelected ? 'bg-muted/50 border-primary' : 'bg-background border-border'
                              }`}
                              onClick={() => togglePosition(ticker)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => togglePosition(ticker)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span className="font-semibold">{ticker}</span>
                                  <Badge variant="outline" className="text-xs">
                                    <Eye className="w-3 h-3 mr-1" />
                                    Watchlist
                                  </Badge>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm text-muted-foreground">
                                    Not currently owned
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Available for opportunity analysis
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Rebalance Settings Tab */}
          <TabsContent value="settings" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 data-[state=inactive]:hidden">
            <div className="space-y-6">
              <Card className="p-6">
                <div className="space-y-6">
                  {/* Use Default Settings */}
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="useDefault"
                      checked={rebalanceConfig.useDefaultSettings}
                      onCheckedChange={(checked) =>
                        setRebalanceConfig(prev => ({ ...prev, useDefaultSettings: checked as boolean }))
                      }
                    />
                    <Label htmlFor="useDefault" className="text-sm font-medium">
                      Use default rebalance configuration from user settings
                    </Label>
                  </div>

                  {/* Configuration Fields */}
                  <div className={`space-y-6 ${rebalanceConfig.useDefaultSettings ? 'opacity-50 pointer-events-none' : ''}`}>
                    {/* Position Size Limits */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="minPosition">Minimum Position Size ($)</Label>
                        <Input
                          id="minPosition"
                          type="number"
                          value={rebalanceConfig.minPosition}
                          onChange={(e) => setRebalanceConfig(prev => ({
                            ...prev,
                            minPosition: Number(e.target.value)
                          }))}
                          disabled={rebalanceConfig.useDefaultSettings}
                        />
                        <p className="text-xs text-muted-foreground">
                          Minimum dollar amount for any position
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="maxPosition">Maximum Position Size ($)</Label>
                        <Input
                          id="maxPosition"
                          type="number"
                          value={rebalanceConfig.maxPosition}
                          onChange={(e) => setRebalanceConfig(prev => ({
                            ...prev,
                            maxPosition: Number(e.target.value)
                          }))}
                          disabled={rebalanceConfig.useDefaultSettings}
                        />
                        <p className="text-xs text-muted-foreground">
                          Maximum dollar amount for any position
                        </p>
                      </div>
                    </div>

                    {/* Rebalance Threshold */}
                    <div className="space-y-2">
                      <Label htmlFor="threshold">
                        Rebalance Threshold: {rebalanceConfig.rebalanceThreshold}%
                      </Label>
                      <Slider
                        id="threshold"
                        min={1}
                        max={50}
                        step={1}
                        value={[rebalanceConfig.rebalanceThreshold]}
                        onValueChange={(value) => setRebalanceConfig(prev => ({
                          ...prev,
                          rebalanceThreshold: value[0]
                        }))}
                        disabled={rebalanceConfig.useDefaultSettings || rebalanceConfig.skipThresholdCheck}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Minimum allocation drift to trigger rebalancing. When drift is below this threshold, only stocks with compelling market signals will be analyzed (via Opportunity Agent).
                      </p>

                      {/* Skip Threshold Check Option */}
                      <div className="flex items-center space-x-3 pt-2">
                        <Checkbox
                          id="skipThreshold"
                          checked={rebalanceConfig.skipThresholdCheck}
                          onCheckedChange={(checked) => {
                            setRebalanceConfig(prev => ({
                              ...prev,
                              skipThresholdCheck: checked as boolean,
                              // If forcing rebalance, automatically disable opportunity agent
                              skipOpportunityAgent: checked ? true : prev.skipOpportunityAgent
                            }));
                          }}
                          disabled={rebalanceConfig.useDefaultSettings}
                        />
                        <Label htmlFor="skipThreshold" className="text-sm font-normal cursor-pointer">
                          Skip Threshold Check
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6">
                        When enabled, all selected stocks will be analyzed for rebalance agent regardless of rebalance threshold
                      </p>
                    </div>

                    {/* Opportunity Agent Option */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="skipOpportunity"
                          checked={rebalanceConfig.skipOpportunityAgent}
                          onCheckedChange={(checked) =>
                            setRebalanceConfig(prev => ({ ...prev, skipOpportunityAgent: checked as boolean }))
                          }
                          disabled={rebalanceConfig.useDefaultSettings || rebalanceConfig.skipThresholdCheck}
                        />
                        <Label
                          htmlFor="skipOpportunity"
                          className={`text-sm font-normal cursor-pointer ${rebalanceConfig.skipThresholdCheck ? 'opacity-50' : ''
                            }`}
                        >
                          Skip opportunity analysis (analyze all selected stocks)
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6">
                        {rebalanceConfig.skipThresholdCheck
                          ? "Opportunity analysis is automatically skipped when forcing rebalance (skip threshold check)"
                          : "When disabled, the Opportunity Agent evaluates market conditions to filter stocks for analysis when drift is below threshold"
                        }
                      </p>
                    </div>

                    {/* Portfolio Allocation */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Portfolio Allocation</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Stock Allocation: {rebalanceConfig.targetStockAllocation}%</Label>
                            <Slider
                              min={0}
                              max={100}
                              step={5}
                              value={[rebalanceConfig.targetStockAllocation]}
                              onValueChange={handleStockAllocationChange}
                              disabled={rebalanceConfig.useDefaultSettings}
                              className="w-full"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Cash Allocation: {rebalanceConfig.targetCashAllocation}%</Label>
                            <Progress value={rebalanceConfig.targetCashAllocation} className="h-2 mt-6" />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Target allocation between stocks and cash in your portfolio
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Workflow Explanation */}
                  {!rebalanceConfig.skipThresholdCheck && !rebalanceConfig.skipOpportunityAgent && (
                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-semibold mb-2">How Scheduled Rebalancing Works</h4>
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <div className="flex items-start gap-2">
                          <span className="font-medium">1.</span>
                          <span>Schedule triggers at configured time intervals</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium">2.</span>
                          <span>Calculate allocation drift for all selected stocks</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium">3.</span>
                          <span>
                            If max drift &lt; {rebalanceConfig.rebalanceThreshold}%: Opportunity Agent evaluates market signals to identify high-priority stocks
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium">4.</span>
                          <span>
                            If max drift &ge; {rebalanceConfig.rebalanceThreshold}%: Analyze all selected stocks immediately
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium">5.</span>
                          <span>Run full multi-agent analysis on selected stocks</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="font-medium">6.</span>
                          <span>Portfolio Manager creates optimal rebalance trades</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-semibold mb-3">Configuration Summary</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Position Range:</span>
                        <span className="font-medium">
                          ${rebalanceConfig.minPosition.toLocaleString()} - ${rebalanceConfig.maxPosition.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rebalance Threshold:</span>
                        <span className="font-medium">
                          {rebalanceConfig.skipThresholdCheck ? 'Skipped' : `${rebalanceConfig.rebalanceThreshold}%`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stock Allocation:</span>
                        <span className="font-medium">{rebalanceConfig.targetStockAllocation}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cash Allocation:</span>
                        <span className="font-medium">{rebalanceConfig.targetCashAllocation}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Opportunity Analysis:</span>
                        <span className="font-medium">
                          {rebalanceConfig.skipOpportunityAgent || rebalanceConfig.skipThresholdCheck ? 
                            'Disabled (all stocks analyzed)' : 
                            'Enabled (smart filtering)'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Selected Stocks:</span>
                        <span className="font-medium">
                          {selectedPositions.size} {selectedPositions.size === 1 ? 'stock' : 'stocks'}
                          {includeWatchlist && watchlistStocks.filter(t => selectedPositions.has(t)).length > 0 && 
                            ` (${watchlistStocks.filter(t => selectedPositions.has(t)).length} from watchlist)`
                          }
                        </span>
                      </div>
                    </div>
                    {rebalanceConfig.skipThresholdCheck && (
                      <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                        <p className="text-xs text-yellow-700 dark:text-yellow-400">
                          ⚠️ Force rebalance enabled - will proceed regardless of current allocation drift
                        </p>
                      </div>
                    )}
                    {!rebalanceConfig.skipThresholdCheck && !rebalanceConfig.skipOpportunityAgent && (
                      <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                          💡 Opportunity analysis enabled - When allocation drift is below threshold, AI will evaluate selected stocks (including watchlist) to identify which ones have compelling market signals and warrant full analysis
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Fixed Footer */}
        <div className="border-t px-6 py-4 bg-background shrink-0">
          <div className="flex justify-between">
            <div>
              {existingSchedule && (
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={saving}
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