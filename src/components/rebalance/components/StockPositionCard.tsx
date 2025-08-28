// Reusable stock position card component
// Extracted from RebalanceModal.tsx maintaining exact same styles and behavior

import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Lock, Eye } from "lucide-react";
import type { RebalancePosition } from "../types";

interface StockPositionCardProps {
  position?: RebalancePosition;
  ticker?: string;
  isSelected: boolean;
  isDisabled: boolean;
  isWatchlist?: boolean;
  onToggle: () => void;
}

export function StockPositionCard({
  position,
  ticker,
  isSelected,
  isDisabled,
  isWatchlist = false,
  onToggle
}: StockPositionCardProps) {
  const displayTicker = ticker || position?.ticker || '';
  
  if (isWatchlist && ticker) {
    // Watchlist stock card (simpler version)
    return (
      <div
        className={`p-4 rounded-lg border transition-all ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'bg-muted/50 border-primary' : 'bg-background border-border'
          }`}
        onClick={() => !isDisabled && onToggle()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => !isDisabled && onToggle()}
              onClick={(e) => e.stopPropagation()}
              disabled={isDisabled}
            />
            <span className="font-semibold">{ticker}</span>
            {isDisabled && <Lock className="h-4 w-4 text-muted-foreground" />}
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
  }

  if (!position) return null;

  // Portfolio position card (full version)
  return (
    <div
      className={`p-4 rounded-lg border transition-all ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isSelected ? 'bg-muted/50 border-primary' : 'bg-background border-border'
        }`}
      onClick={() => !isDisabled && onToggle()}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => !isDisabled && onToggle()}
              onClick={(e) => e.stopPropagation()}
              disabled={isDisabled}
            />
            <span className="font-semibold text-lg">{position.ticker}</span>
            {isDisabled && <Lock className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">
              Total Value: ${position.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
}