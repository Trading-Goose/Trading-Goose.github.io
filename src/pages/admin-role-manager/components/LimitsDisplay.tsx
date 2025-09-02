import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Check, X } from "lucide-react";
import { RoleWithLimits } from "@/hooks/useRoleManagement";

interface LimitsDisplayProps {
  role: RoleWithLimits;
}

export default function LimitsDisplay({ role }: LimitsDisplayProps) {
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

      {/* Access Flags */}
      <div className="flex flex-wrap gap-2">
        <Badge variant={role.rebalance_access ? "default" : "secondary"}>
          Rebalance: {role.rebalance_access ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
        </Badge>
        <Badge variant={role.opportunity_agent_access ? "default" : "secondary"}>
          Opportunity Agent: {role.opportunity_agent_access ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
        </Badge>
        <Badge variant={role.additional_provider_access ? "default" : "secondary"}>
          Additional Providers: {role.additional_provider_access ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
        </Badge>
        <Badge variant={role.enable_live_trading ? "default" : "secondary"}>
          Live Trading: {role.enable_live_trading ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
        </Badge>
        <Badge variant={role.enable_auto_trading ? "default" : "secondary"}>
          Auto Trading: {role.enable_auto_trading ? <Check className="h-3 w-3 ml-1" /> : <X className="h-3 w-3 ml-1" />}
        </Badge>
      </div>
    </>
  );
}