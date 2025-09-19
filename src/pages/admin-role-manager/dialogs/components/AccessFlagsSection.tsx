import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RoleWithLimits } from "@/hooks/useRoleManagement";

interface AccessFlagsSectionProps {
  limits: RoleWithLimits;
  onUpdate: (limits: RoleWithLimits) => void;
}

export default function AccessFlagsSection({
  limits,
  onUpdate
}: AccessFlagsSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Rebalance Access</Label>
        <Switch
          checked={limits.rebalance_access}
          onCheckedChange={(v) => onUpdate({ ...limits, rebalance_access: v })}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label>Opportunity Agent Access</Label>
        <Switch
          checked={limits.opportunity_agent_access}
          onCheckedChange={(v) => onUpdate({ ...limits, opportunity_agent_access: v })}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label>Additional Provider Access</Label>
        <Switch
          checked={limits.additional_provider_access}
          onCheckedChange={(v) => onUpdate({ ...limits, additional_provider_access: v })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Enable Live Trading</Label>
          <p className="text-sm text-muted-foreground">Allow users to execute real trades (vs paper trading)</p>
        </div>
        <Switch
          checked={limits.enable_live_trading ?? false}
          onCheckedChange={(v) => onUpdate({ ...limits, enable_live_trading: v })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Enable Auto Trading</Label>
          <p className="text-sm text-muted-foreground">Allow users to enable automatic trade execution</p>
        </div>
        <Switch
          checked={limits.enable_auto_trading ?? false}
          onCheckedChange={(v) => onUpdate({ ...limits, enable_auto_trading: v })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label>Near Limit Analysis Access</Label>
          <p className="text-sm text-muted-foreground">Allow users to enable auto near limit analysis</p>
        </div>
        <Switch
          checked={limits.near_limit_analysis_access ?? false}
          onCheckedChange={(v) => onUpdate({ ...limits, near_limit_analysis_access: v })}
        />
      </div>
    </div>
  );
}