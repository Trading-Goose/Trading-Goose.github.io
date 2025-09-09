// Schedule configuration tab component
// Extracted from ScheduleRebalanceModal.tsx

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LabelWithHelp } from "@/components/ui/help-button";
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
import { useRBAC } from "@/hooks/useRBAC";
import type { ScheduleConfig } from "../types";

interface ScheduleTabProps {
  loading: boolean;
  config: ScheduleConfig;
  setConfig: (config: ScheduleConfig) => void;
}

export function ScheduleTab({ loading, config, setConfig }: ScheduleTabProps) {
  const { getScheduleResolution } = useRBAC();
  const allowedResolutions = getScheduleResolution();
  const hasDayAccess = allowedResolutions.includes('Day');
  
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
                <LabelWithHelp
                  label="Rebalance Frequency"
                  helpContent="How often to automatically rebalance your portfolio. Daily for active management, Weekly for regular adjustments, Monthly for long-term investing. Your subscription determines available frequencies."
                />
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
                      {allowedResolutions.includes('Day') && (
                        <SelectItem value="days">Day(s)</SelectItem>
                      )}
                      {allowedResolutions.includes('Week') && (
                        <SelectItem value="weeks">Week(s)</SelectItem>
                      )}
                      {allowedResolutions.includes('Month') && (
                        <SelectItem value="months">Month(s)</SelectItem>
                      )}
                      {allowedResolutions.length === 0 && (
                        <>
                          <SelectItem value="days">Day(s)</SelectItem>
                          <SelectItem value="weeks">Week(s)</SelectItem>
                          <SelectItem value="months">Month(s)</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  {config.intervalValue === 1 && config.intervalUnit === 'days' && 'Daily rebalancing'}
                  {config.intervalValue === 1 && config.intervalUnit === 'weeks' && 'Weekly rebalancing'}
                  {config.intervalValue === 2 && config.intervalUnit === 'weeks' && 'Bi-weekly rebalancing'}
                  {config.intervalValue === 1 && config.intervalUnit === 'months' && 'Monthly rebalancing'}
                  {config.intervalValue > 1 && `Every ${config.intervalValue} ${config.intervalUnit}`}
                  {allowedResolutions.length > 0 && allowedResolutions.length < 3 && (
                    <> (Available: {allowedResolutions.map(res => 
                      res === 'Day' ? 'Daily' : 
                      res === 'Week' ? 'Weekly' : 
                      res === 'Month' ? 'Monthly' : res
                    ).join(', ')})</>
                  )}
                </p>
              </div>

              {/* Day Selection for Weekly intervals */}
              {config.intervalUnit === 'weeks' && (
                <div className="space-y-2">
                  <LabelWithHelp
                    label="On Which Day(s)"
                    helpContent="Select which day(s) of the week to run the rebalance. With higher tier subscriptions, you can select multiple days for more frequent rebalancing."
                  />
                  {hasDayAccess ? (
                    // Multi-selection for users with Day access
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
                  ) : (
                    // Single selection dropdown for users without Day access
                    <Select
                      value={config.daysOfWeek[0]?.toString() || '1'}
                      onValueChange={(value) => {
                        setConfig({ ...config, daysOfWeek: [parseInt(value)] });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map(day => (
                          <SelectItem key={day.value} value={day.value.toString()}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!hasDayAccess && (
                    <p className="text-xs text-muted-foreground">
                      Single day selection only. Upgrade your plan for multiple days per week.
                    </p>
                  )}
                </div>
              )}

              {/* Day of Month for Monthly intervals */}
              {config.intervalUnit === 'months' && (
                <div className="space-y-2">
                  <LabelWithHelp
                    label="On Which Day(s) of the Month"
                    helpContent="Select the day of the month for rebalancing. Day 31 will automatically adjust for shorter months (e.g., will run on Feb 28/29)."
                  />
                  <Select
                    value={config.daysOfMonth[0]?.toString() || '1'}
                    onValueChange={(value) => {
                      setConfig({ ...config, daysOfMonth: [parseInt(value)] });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1st - Beginning of month</SelectItem>
                      <SelectItem value="2">2nd</SelectItem>
                      <SelectItem value="3">3rd</SelectItem>
                      <SelectItem value="4">4th</SelectItem>
                      <SelectItem value="5">5th</SelectItem>
                      <SelectItem value="6">6th</SelectItem>
                      <SelectItem value="7">7th</SelectItem>
                      <SelectItem value="8">8th</SelectItem>
                      <SelectItem value="9">9th</SelectItem>
                      <SelectItem value="10">10th</SelectItem>
                      <SelectItem value="11">11th</SelectItem>
                      <SelectItem value="12">12th</SelectItem>
                      <SelectItem value="13">13th</SelectItem>
                      <SelectItem value="14">14th</SelectItem>
                      <SelectItem value="15">15th - Mid-month</SelectItem>
                      <SelectItem value="16">16th</SelectItem>
                      <SelectItem value="17">17th</SelectItem>
                      <SelectItem value="18">18th</SelectItem>
                      <SelectItem value="19">19th</SelectItem>
                      <SelectItem value="20">20th</SelectItem>
                      <SelectItem value="21">21st</SelectItem>
                      <SelectItem value="22">22nd</SelectItem>
                      <SelectItem value="23">23rd</SelectItem>
                      <SelectItem value="24">24th</SelectItem>
                      <SelectItem value="25">25th</SelectItem>
                      <SelectItem value="26">26th</SelectItem>
                      <SelectItem value="27">27th</SelectItem>
                      <SelectItem value="28">28th</SelectItem>
                      <SelectItem value="29">29th</SelectItem>
                      <SelectItem value="30">30th</SelectItem>
                      <SelectItem value="31">31st - End of month</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select the day of the month for rebalancing. Day 31 will automatically adjust for shorter months.
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