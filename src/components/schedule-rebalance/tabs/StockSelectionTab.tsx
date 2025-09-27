// Stock selection tab component (reusing components from RebalanceModal)
// Extracted from ScheduleRebalanceModal.tsx

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { LabelWithHelp } from "@/components/ui/help-button";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { Loader2, Eye, Lock, AlertCircle } from "lucide-react";
// Reuse components from RebalanceModal
import { StockPositionCard } from "@/components/rebalance/components/StockPositionCard";
import { PortfolioComposition } from "@/components/rebalance/components/PortfolioComposition";
import { generatePositionColors } from "@/components/rebalance/utils";
import type { Position } from "../types";
import { formatTickerForDisplay } from "@/lib/tickers";

interface StockSelectionTabProps {
  loading: boolean;
  error: string | null;
  positions: Position[];
  selectedPositions: Set<string>;
  includeWatchlist: boolean;
  setIncludeWatchlist: (value: boolean) => void;
  watchlistStocks: string[];
  loadingWatchlist: boolean;
  cashAllocation: number;
  maxStocks: number;
  togglePosition: (ticker: string) => void;
}

export function StockSelectionTab({
  loading,
  error,
  positions,
  selectedPositions,
  includeWatchlist,
  setIncludeWatchlist,
  watchlistStocks,
  loadingWatchlist,
  cashAllocation,
  maxStocks,
  togglePosition
}: StockSelectionTabProps) {
  const positionColors = generatePositionColors(positions);

  return (
    <TabsContent value="stocks" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 data-[state=inactive]:hidden">
      {/* Stock Selection Limit Alert */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading portfolio data...</p>
        </div>
      ) : error ? (
        <Card className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Reuse PortfolioComposition from RebalanceModal */}
          <PortfolioComposition
            positions={positions}
            cashAllocation={cashAllocation}
            positionColors={positionColors}
          />

          {/* Include Watchlist Stocks Option */}
          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <LabelWithHelp 
                    htmlFor="include-watchlist" 
                    label="Include Watchlist Stocks"
                    helpContent="Add stocks from your watchlist to the rebalancing analysis. These stocks will be considered for potential new positions even though you don't currently own them."
                    className="text-sm font-semibold"
                  />
                  <p className="text-xs text-muted-foreground">
                    Add stocks from your watchlist to the rebalancing analysis
                  </p>
                </div>
                <Switch
                  id="include-watchlist"
                  checked={includeWatchlist}
                  onCheckedChange={setIncludeWatchlist}
                  disabled={loadingWatchlist}
                  className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/30"
                />
              </div>

              {includeWatchlist && watchlistStocks.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">
                    Watchlist stocks available for analysis (not in portfolio):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {watchlistStocks.map(ticker => {
                      const isSelected = selectedPositions.has(ticker);
                      const isDisabled = !isSelected && maxStocks > 0 && selectedPositions.size >= maxStocks;
                      const displayTicker = formatTickerForDisplay(ticker);
                      return (
                        <Badge
                          key={ticker}
                          variant={isSelected ? "default" : "secondary"}
                          className={`text-xs ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          onClick={() => !isDisabled && togglePosition(ticker)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          {displayTicker}
                          {isDisabled && <Lock className="w-3 h-3 ml-1" />}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {loadingWatchlist && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-xs">Loading watchlist...</span>
                </div>
              )}
            </div>
          </Card>

          {/* Stock Selection List */}
          {positions.length === 0 && watchlistStocks.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-muted-foreground">No positions found in your account</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Current Portfolio Positions */}
              {positions.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-muted-foreground">Portfolio Holdings</h4>
                  {positions.map((position) => {
                    const isSelected = selectedPositions.has(position.ticker);
                    const isDisabled = !isSelected && maxStocks > 0 && selectedPositions.size >= maxStocks;

                    return (
                      <StockPositionCard
                        key={position.ticker}
                        position={position}
                        isSelected={isSelected}
                        isDisabled={isDisabled}
                        onToggle={() => togglePosition(position.ticker)}
                      />
                    );
                  })}
                </>
              )}

              {/* Watchlist Stocks (if included) */}
              {includeWatchlist && watchlistStocks.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-muted-foreground mt-4">Watchlist Stocks (Not in Portfolio)</h4>
                  {watchlistStocks.map((ticker) => {
                    const isSelected = selectedPositions.has(ticker);
                    const isDisabled = !isSelected && maxStocks > 0 && selectedPositions.size >= maxStocks;

                    return (
                      <StockPositionCard
                        key={ticker}
                        ticker={ticker}
                        isSelected={isSelected}
                        isDisabled={isDisabled}
                        isWatchlist={true}
                        onToggle={() => togglePosition(ticker)}
                      />
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </TabsContent>
  );
}
