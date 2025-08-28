// Timezone selector component
// Extracted from ScheduleTab.tsx to reduce file size

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIMEZONE_GROUPS } from "../constants";
import { getTimezoneOffset } from "../utils";

interface TimezoneSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TimezoneSelector({ value, onChange }: TimezoneSelectorProps) {
  const [timezoneSearch, setTimezoneSearch] = useState("");

  return (
    <div className="space-y-2">
      <Label>Timezone</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select timezone">
            {(() => {
              for (const [region, zones] of Object.entries(TIMEZONE_GROUPS)) {
                const zone = zones.find(z => z.value === value);
                if (zone) {
                  const offset = getTimezoneOffset(value);
                  return `${zone.label} (UTC${offset})`;
                }
              }
              return value;
            })()}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          <div className="px-2 pb-2">
            <Input
              placeholder="Search timezone..."
              value={timezoneSearch}
              onChange={(e) => setTimezoneSearch(e.target.value)}
              className="h-8"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {Object.entries(TIMEZONE_GROUPS).map(([region, zones]) => {
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
  );
}