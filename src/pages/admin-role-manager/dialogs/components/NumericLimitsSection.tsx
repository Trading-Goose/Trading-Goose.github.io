import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RoleWithLimits } from "@/hooks/useRoleManagement";

interface NumericLimitsSectionProps {
  limits: RoleWithLimits;
  onUpdate: (limits: RoleWithLimits) => void;
}

export default function NumericLimitsSection({
  limits,
  onUpdate
}: NumericLimitsSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label>Max Parallel Analysis: {limits.max_parallel_analysis}</Label>
        <Slider
          value={[limits.max_parallel_analysis]}
          onValueChange={(v) => onUpdate({ ...limits, max_parallel_analysis: v[0] })}
          min={1}
          max={10}
          step={1}
          className="mt-2"
        />
      </div>
      <div>
        <Label>Max Debate Rounds: {limits.max_debate_rounds || 2}</Label>
        <Slider
          value={[limits.max_debate_rounds || 2]}
          onValueChange={(v) => onUpdate({ ...limits, max_debate_rounds: v[0] })}
          min={1}
          max={5}
          step={1}
          className="mt-2"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Number of debate rounds between bull and bear researchers. More rounds provide deeper analysis.
        </p>
      </div>
      <div>
        <Label>Max Watchlist Stocks: {limits.max_watchlist_stocks}</Label>
        <Slider
          value={[limits.max_watchlist_stocks]}
          onValueChange={(v) => onUpdate({ ...limits, max_watchlist_stocks: v[0] })}
          min={0}
          max={30}
          step={1}
          className="mt-2"
        />
      </div>
      <div>
        <Label>Max Stocks per Rebalance: {limits.max_rebalance_stocks}</Label>
        <Slider
          value={[limits.max_rebalance_stocks]}
          onValueChange={(v) => onUpdate({ ...limits, max_rebalance_stocks: v[0] })}
          min={0}
          max={20}
          step={1}
          className="mt-2"
        />
      </div>
      <div>
        <Label>Max Scheduled Rebalances: {limits.max_scheduled_rebalances}</Label>
        <Slider
          value={[limits.max_scheduled_rebalances]}
          onValueChange={(v) => onUpdate({ ...limits, max_scheduled_rebalances: v[0] })}
          min={0}
          max={5}
          step={1}
          className="mt-2"
        />
      </div>
      <div>
        <Label>Number of Search Sources: {limits.number_of_search_sources || 5}</Label>
        <Slider
          value={[limits.number_of_search_sources || 5]}
          onValueChange={(v) => onUpdate({ ...limits, number_of_search_sources: v[0] })}
          min={0}
          max={25}
          step={1}
          className="mt-2"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Maximum number of search sources for analysis. Higher values provide more comprehensive data.
        </p>
      </div>
    </div>
  );
}