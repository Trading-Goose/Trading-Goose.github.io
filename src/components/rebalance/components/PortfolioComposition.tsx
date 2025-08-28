// Portfolio composition visualization component
// Extracted from RebalanceModal.tsx maintaining exact same styles and behavior

import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { RebalancePosition } from "../types";

interface PortfolioCompositionProps {
  positions: RebalancePosition[];
  cashAllocation: number;
  positionColors: Record<string, string>;
}

export function PortfolioComposition({
  positions,
  cashAllocation,
  positionColors
}: PortfolioCompositionProps) {
  if (positions.length === 0) return null;

  return (
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
  );
}