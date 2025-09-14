// Main RebalanceModal component - refactored to use modular components
// Maintains exact same functionality, styles, and behavior as original

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Settings, List, AlertCircle } from "lucide-react";
import { useRBAC } from "@/hooks/useRBAC";
import { useToast } from "@/hooks/use-toast";
import { useAuth, hasRequiredApiKeys, hasAlpacaCredentials } from "@/lib/auth";
import { useRebalanceData } from "./hooks/useRebalanceData";
import { useWatchlist } from "./hooks/useWatchlist";
import { ConfigurationTab } from "./tabs/ConfigurationTab";
import { StockSelectionTab } from "./tabs/StockSelectionTab";
import { generatePositionColors } from "./utils";
import type { RebalanceModalProps } from "./types";

export default function RebalanceModal({ isOpen, onClose, onApprove }: RebalanceModalProps) {
  const { getMaxRebalanceStocks } = useRBAC();
  const { toast } = useToast();
  const { apiSettings } = useAuth();
  const [activeTab, setActiveTab] = useState("config");
  
  // Check for required credentials
  const hasApiKeys = hasRequiredApiKeys(apiSettings);
  const hasAlpaca = hasAlpacaCredentials(apiSettings);
  const canRebalance = hasApiKeys && hasAlpaca;
  
  // Get the maximum number of stocks allowed for rebalancing based on user's role
  const maxStocks = getMaxRebalanceStocks();

  // Use custom hook for data loading and management
  const {
    loading,
    error,
    positions,
    cashAllocation,
    portfolioTotalValue,
    portfolioCashBalance,
    selectedPositions,
    setSelectedPositions,
    config,
    setConfig
  } = useRebalanceData(isOpen);

  // Use custom hook for watchlist management
  const {
    includeWatchlist,
    watchlistStocks,
    loadingWatchlist,
    handleIncludeWatchlistChange
  } = useWatchlist(isOpen, positions, selectedPositions, setSelectedPositions, maxStocks);

  // Reset tab when modal closes
  if (!isOpen && activeTab !== "config") {
    setActiveTab("config");
  }

  const togglePosition = (ticker: string) => {
    const newSet = new Set(selectedPositions);
    if (newSet.has(ticker)) {
      newSet.delete(ticker);
    } else {
      // Check if we've reached the maximum number of stocks
      if (maxStocks > 0 && newSet.size >= maxStocks) {
        toast({
          title: "Stock Selection Limit Reached",
          description: `You can select a maximum of ${maxStocks} stocks for rebalancing based on your subscription plan.`,
          variant: "destructive",
        });
        return;
      }
      newSet.add(ticker);
    }
    setSelectedPositions(newSet);
  };

  const handleRebalance = () => {
    // Include both positions and watchlist stocks if selected
    let positionsToRebalance = positions.filter(p =>
      selectedPositions.has(p.ticker)
    );
    
    // Add watchlist stocks as zero-position entries if included
    if (includeWatchlist) {
      const watchlistPositions = watchlistStocks
        .filter(ticker => selectedPositions.has(ticker))
        .map(ticker => ({
          ticker,
          currentShares: 0,
          currentValue: 0,
          currentAllocation: 0
        }));
      
      positionsToRebalance = [...positionsToRebalance, ...watchlistPositions];
    }
    
    // Pass portfolio data if available, including positions for threshold calculation
    const portfolioData = portfolioTotalValue > 0 ? {
      totalValue: portfolioTotalValue,
      cashBalance: portfolioCashBalance,
      // Include actual portfolio positions for threshold calculation
      positions: positions.map(pos => ({
        ticker: pos.ticker,
        value: pos.currentValue,
        costBasis: pos.currentShares * (pos.avgPrice || 0), // Calculate cost basis
        shares: pos.currentShares,
        avgPrice: pos.avgPrice,
        currentPrice: pos.currentValue / pos.currentShares, // Calculate current price
        // Calculate price change from average
        priceChangeFromAvg: pos.avgPrice && pos.avgPrice > 0 ? 
          ((pos.currentValue / pos.currentShares - pos.avgPrice) / pos.avgPrice) * 100 : 0
      }))
    } : undefined;
    
    onApprove(positionsToRebalance, config, portfolioData);
    onClose();
  };

  // Generate colors for all positions
  const positionColors = generatePositionColors(positions);

  // Calculate watchlist selected count
  const watchlistSelectedCount = watchlistStocks.filter(t => selectedPositions.has(t)).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="!max-w-5xl !max-h-[90vh] !p-0 !flex !flex-col !gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Portfolio Rebalancing
          </DialogTitle>
          <DialogDescription>
            Configure rebalancing parameters and select positions to rebalance
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4 shrink-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="config" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Rebalance Config
              </TabsTrigger>
              <TabsTrigger value="stocks" className="flex items-center gap-2">
                <List className="w-4 h-4" />
                Stock Selection
              </TabsTrigger>
            </TabsList>
            
            {/* Stock Selection Limit Display */}
            {maxStocks > 0 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Stock selection limit: {selectedPositions.size} / {maxStocks} stocks selected
                </span>
                {selectedPositions.size >= maxStocks && (
                  <Badge variant="destructive" className="text-xs">Limit Reached</Badge>
                )}
              </div>
            )}
          </div>

          <ConfigurationTab
            config={config}
            setConfig={setConfig}
            selectedPositionsCount={selectedPositions.size}
            includeWatchlist={includeWatchlist}
            watchlistSelectedCount={watchlistSelectedCount}
          />

          <StockSelectionTab
            loading={loading}
            error={error}
            positions={positions}
            cashAllocation={cashAllocation}
            selectedPositions={selectedPositions}
            maxStocks={maxStocks}
            includeWatchlist={includeWatchlist}
            watchlistStocks={watchlistStocks}
            loadingWatchlist={loadingWatchlist}
            positionColors={positionColors}
            config={config}
            onTogglePosition={togglePosition}
            onIncludeWatchlistChange={handleIncludeWatchlistChange}
          />
        </Tabs>

        {/* Warning message for missing credentials */}
        {!canRebalance && (
          <div className="px-6 py-4 border-t">
            <Alert className="bg-yellow-500/10 border-yellow-500/20">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-600 dark:text-yellow-400">
                {!hasApiKeys && !hasAlpaca ? (
                  <>
                    <strong>Configuration Required:</strong> Please configure both your AI provider API keys and Alpaca credentials in the Settings page before executing a rebalance.
                  </>
                ) : !hasApiKeys ? (
                  <>
                    <strong>AI Provider Required:</strong> Please configure your AI provider API keys in the Settings page before executing a rebalance.
                  </>
                ) : (
                  <>
                    <strong>Alpaca Credentials Required:</strong> Please configure your Alpaca API credentials in the Settings page before executing a rebalance.
                  </>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Fixed Footer */}
        <div className="border-t px-6 py-4 bg-background shrink-0">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleRebalance}
              disabled={selectedPositions.size === 0 || loading || !canRebalance}
              title={!canRebalance ? "Please configure API keys and Alpaca credentials first" : undefined}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Execute Rebalancing ({selectedPositions.size} {selectedPositions.size === 1 ? 'stock' : 'stocks'})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}