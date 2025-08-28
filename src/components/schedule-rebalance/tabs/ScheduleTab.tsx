// Schedule configuration tab component
// Extracted from ScheduleRebalanceModal.tsx

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, Loader2 } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { WEEKDAYS } from "../constants";
import { getNextRunTime } from "../utils";
import { TimezoneSelector } from "../components/TimezoneSelector";
import { TimeSelector } from "../components/TimeSelector";
import type { ScheduleConfig } from "../types";

interface ScheduleTabProps {
  loading: boolean;
  config: ScheduleConfig;
  setConfig: (config: ScheduleConfig) => void;
}

export function ScheduleTab({ loading, config, setConfig }: ScheduleTabProps) {
  return (
    <TabsContent value="schedule" className="flex-1 overflow-y-auto px-6 pb-4 mt-4">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
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
                      onChange={(e) => setConfig({
                        ...config,
                        intervalValue: parseInt(e.target.value) || 1
                      })}
                      className="w-20"
                    />
                  </div>
                  <Select
                    value={config.intervalUnit}
                    onValueChange={(value: any) => setConfig({
                      ...config,
                      intervalUnit: value
                    })}
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
                              setConfig({
                                ...config,
                                daysOfWeek: [...config.daysOfWeek, day.value]
                              });
                            } else {
                              setConfig({
                                ...config,
                                daysOfWeek: config.daysOfWeek.filter(d => d !== day.value)
                              });
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
                      setConfig({ ...config, daysOfMonth: days });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter day(s) of the month (1-31). For end of month, use 31.
                  </p>
                </div>
              )}

              {/* Time of Day */}
              <TimeSelector
                value={config.timeOfDay}
                onChange={(timeOfDay) => setConfig({ ...config, timeOfDay })}
              />

              {/* Timezone */}
              <TimezoneSelector
                value={config.timezone}
                onChange={(timezone) => setConfig({ ...config, timezone })}
              />

              {/* Next Run Preview */}
              {config.enabled && (
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="font-medium">Next scheduled run:</span>
                    <span className="text-muted-foreground">
                      {getNextRunTime(config)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </TabsContent>
  );
}