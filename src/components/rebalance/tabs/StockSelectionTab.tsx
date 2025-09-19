// Stock selection tab component
// Extracted from RebalanceModal.tsx maintaining exact same styles and behavior

import { TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LabelWithHelp } from "@/components/ui/help-button";
import { Loader2, Eye, Lock, AlertCircle } from "lucide-react";
import { PortfolioComposition } from "../components/PortfolioComposition";
import { StockPositionCard } from "../components/StockPositionCard";
import type { RebalancePosition, RebalanceConfig } from "../types";

interface StockSelectionTabProps {
  loading: boolean;
  error: string | null;
  positions: RebalancePosition[];
  cashAllocation: number;
  selectedPositions: Set<string>;
  maxStocks: number;
  includeWatchlist: boolean;
  watchlistStocks: string[];
  loadingWatchlist: boolean;
  positionColors: Record<string, string>;
  config: RebalanceConfig;
  onTogglePosition: (ticker: string) => void;
  onIncludeWatchlistChange: (checked: boolean) => void;
}

export function StockSelectionTab({
  loading,
  error,
  positions,
  cashAllocation,
  selectedPositions,
  maxStocks,
  includeWatchlist,
  watchlistStocks,
  loadingWatchlist,
  positionColors,
  config,
  onTogglePosition,
  onIncludeWatchlistChange
}: StockSelectionTabProps) {
  return (
    <TabsContent value="stocks" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 data-[state=inactive]:hidden">
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
          {/* Portfolio Composition Visualization */}
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
                  onCheckedChange={onIncludeWatchlistChange}
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
                      return (
                        <Badge 
                          key={ticker} 
                          variant={isSelected ? "default" : "secondary"}
                          className={`text-xs ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          onClick={() => !isDisabled && onTogglePosition(ticker)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          {ticker}
                          {isDisabled && <Lock className="w-3 h-3 ml-1" />}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {includeWatchlist && !config.skipOpportunityAgent && !config.skipThresholdCheck && (
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    🎯 When allocation drift is below threshold, only stocks with strong market signals will be analyzed
                  </p>
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
                  {positions.map((position) => (
                    <StockPositionCard
                      key={position.ticker}
                      position={position}
                      isSelected={selectedPositions.has(position.ticker)}
                      isDisabled={!selectedPositions.has(position.ticker) && maxStocks > 0 && selectedPositions.size >= maxStocks}
                      onToggle={() => onTogglePosition(position.ticker)}
                    />
                  ))}
                </>
              )}
              
              {/* Watchlist Stocks (if included) */}
              {includeWatchlist && watchlistStocks.length > 0 && (
                <>
                  <h4 className="text-sm font-semibold text-muted-foreground mt-4">Watchlist Stocks (Not in Portfolio)</h4>
                  {watchlistStocks.map((ticker) => (
                    <StockPositionCard
                      key={ticker}
                      ticker={ticker}
                      isWatchlist={true}
                      isSelected={selectedPositions.has(ticker)}
                      isDisabled={!selectedPositions.has(ticker) && maxStocks > 0 && selectedPositions.size >= maxStocks}
                      onToggle={() => onTogglePosition(ticker)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </TabsContent>
  );
}