// Time selector component  
// Extracted from ScheduleTab.tsx to reduce file size

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TimeSelectorProps {
  value: string; // Format: "09:00 AM"
  onChange: (value: string) => void;
}

export function TimeSelector({ value, onChange }: TimeSelectorProps) {
  const [time, period] = value.split(' ');
  const [hourStr, minuteStr] = time ? time.split(':') : ['09', '00'];

  const handleHourChange = (hour: string) => {
    const [, minutePart] = value.split(':');
    const [minute, currentPeriod] = minutePart ? minutePart.split(' ') : ['00', 'AM'];
    onChange(`${hour}:${minute} ${currentPeriod}`);
  };

  const handleMinuteChange = (minute: string) => {
    const hour = value.split(':')[0];
    const currentPeriod = value.includes('PM') ? 'PM' : 'AM';
    onChange(`${hour}:${minute} ${currentPeriod}`);
  };

  const handlePeriodChange = (newPeriod: string) => {
    const [currentTime] = value.split(' ');
    onChange(`${currentTime} ${newPeriod}`);
  };

  return (
    <div className="space-y-2">
      <Label>Time of Day</Label>
      <div className="flex gap-2">
        {/* Hour Selection */}
        <Select value={hourStr} onValueChange={handleHourChange}>
          <SelectTrigger className="w-24">
            <SelectValue placeholder="Hour" />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => {
              const hour = i === 0 ? 12 : i;
              return (
                <SelectItem key={hour} value={hour.toString().padStart(2, '0')}>
                  {hour}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <span className="flex items-center">:</span>

        {/* Minute Selection */}
        <Select value={minuteStr || '00'} onValueChange={handleMinuteChange}>
          <SelectTrigger className="w-24">
            <SelectValue placeholder="Min" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="00">00</SelectItem>
            <SelectItem value="30">30</SelectItem>
          </SelectContent>
        </Select>

        {/* AM/PM Selection */}
        <Select value={period || 'AM'} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-24">
            <SelectValue placeholder="AM/PM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Rebalances execute at the selected time (runs every 30 minutes)
      </p>
    </div>
  );
}