import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { RoleWithLimits } from "@/hooks/useRoleManagement";

interface LimitsDisplayProps {
  role: RoleWithLimits;
}

// Define the boolean access fields and their display names
const BOOLEAN_ACCESS_FIELDS: Record<string, string> = {
  rebalance_access: 'Rebalance',
  opportunity_agent_access: 'Opportunity Agent',
  additional_provider_access: 'Additional Providers',
  enable_live_trading: 'Live Trading',
  enable_auto_trading: 'Auto Trading',
  near_limit_analysis_access: 'Near Limit Analysis'
};

export default function LimitsDisplay({ role }: LimitsDisplayProps) {
  // Dynamically get all boolean access values from the role
  const booleanAccessEntries = Object.entries(BOOLEAN_ACCESS_FIELDS).map(([key, label]) => ({
    key,
    label,
    value: role[key as keyof RoleWithLimits] as boolean
  }));

  return (
    <>
      {/* Numeric Limits Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <Label className="text-xs">Parallel Analysis</Label>
          <p className="text-lg font-semibold">{role.max_parallel_analysis}</p>
        </div>
        <div>
          <Label className="text-xs">Watchlist Stocks</Label>
          <p className="text-lg font-semibold">{role.max_watchlist_stocks}</p>
        </div>
        <div>
          <Label className="text-xs">Rebalance Stocks</Label>
          <p className="text-lg font-semibold">{role.max_rebalance_stocks}</p>
        </div>
        <div>
          <Label className="text-xs">Schedule Resolution</Label>
          <p className="text-sm font-semibold">{role.schedule_resolution}</p>
        </div>
        <div>
          <Label className="text-xs">Optimization Mode</Label>
          <p className="text-sm font-semibold">{role.optimization_mode || 'speed'}</p>
        </div>
        <div>
          <Label className="text-xs">Search Sources</Label>
          <p className="text-lg font-semibold">{role.number_of_search_sources || 5}</p>
        </div>
      </div>

      {/* Access Flags - Dynamically rendered */}
      <div className="flex flex-wrap gap-2">
        {booleanAccessEntries.map(({ key, label, value }) => (
          <Badge key={key} variant={value ? "default" : "secondary"}>
            {label}: {value ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
          </Badge>
        ))}
      </div>
    </>
  );
}