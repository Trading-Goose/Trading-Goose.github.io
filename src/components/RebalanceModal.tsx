import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Settings,
  List,
  ArrowRight,
  Loader2
} from "lucide-react";
import { useAuth } from "@/lib/auth-supabase";
import { alpacaAPI } from "@/lib/alpaca";

interface RebalancePosition {
  ticker: string;
  currentShares: number;
  currentValue: number;
  currentAllocation: number;
  avgPrice?: number;
}

interface RebalanceConfig {
  useDefaultSettings: boolean;
  maxPosition: number;
  minPosition: number;
  rebalanceThreshold: number;
  targetStockAllocation: number;
  targetCashAllocation: number;
  skipThresholdCheck: boolean;
  skipOpportunityAgent: boolean;
}

interface RebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: (positions: RebalancePosition[], config: RebalanceConfig) => void;
}

// Generate a random color for each stock
function generateRandomColor(seed: string): string {
  // Use the ticker as a seed for consistent colors
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate vibrant colors by ensuring high saturation and medium lightness
  const hue = Math.abs(hash) % 360;
  const saturation = 65 + (Math.abs(hash >> 8) % 20); // 65-85%
  const lightness = 45 + (Math.abs(hash >> 16) % 15); // 45-60%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export default function RebalanceModal({ isOpen, onClose, onApprove }: RebalanceModalProps) {
  const { user, apiSettings } = useAuth();
  const [activeTab, setActiveTab] = useState("config");
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<RebalancePosition[]>([]);
  const [cashAllocation, setCashAllocation] = useState(0);
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Configuration state
  const [config, setConfig] = useState<RebalanceConfig>({
    useDefaultSettings: true,
    maxPosition: 10000,
    minPosition: 100,
    rebalanceThreshold: 10,
    targetStockAllocation: 80,
    targetCashAllocation: 20,
    skipThresholdCheck: false,
    skipOpportunityAgent: false
  });

  // Load user settings and positions when modal opens
  useEffect(() => {
    if (isOpen && apiSettings) {
      loadData();
    } else if (!isOpen) {
      // Reset state when modal closes
      setPositions([]);
      setCashAllocation(0);
      setSelectedPositions(new Set());
      setError(null);
      setActiveTab("config");
    }
  }, [isOpen, apiSettings]);

  const loadData = async () => {
    // Check if API settings are available
    const isPaper = apiSettings?.alpaca_paper_trading ?? true;

    if (isPaper) {
      if (!apiSettings?.alpaca_paper_api_key || !apiSettings?.alpaca_paper_secret_key) {
        setError("Alpaca paper trading credentials not configured");
        return;
      }
    } else {
      if (!apiSettings?.alpaca_live_api_key || !apiSettings?.alpaca_live_secret_key) {
        setError("Alpaca live trading credentials not configured");
        return;
      }
    }

    setLoading(true);
    setError(null);
    setPositions([]);
    setCashAllocation(0);

    try {
      // Update config from apiSettings
      setConfig(prev => ({
        ...prev,
        maxPosition: apiSettings?.rebalance_max_position_size || 10000,
        minPosition: apiSettings?.rebalance_min_position_size || 100,
        rebalanceThreshold: apiSettings?.rebalance_threshold || 10,
        targetStockAllocation: 80,
        targetCashAllocation: 20
      }));

      // Load Alpaca account and positions
      const [accountData, positionsData] = await Promise.all([
        alpacaAPI.getAccount(),
        alpacaAPI.getPositions()
      ]);

      if (!accountData) {
        throw new Error('Failed to fetch account data from Alpaca');
      }

      // Calculate total portfolio value
      const totalEquity = parseFloat(accountData.equity || '0');
      const cashBalance = parseFloat(accountData.cash || '0');

      if (totalEquity === 0) {
        throw new Error('Account has no equity');
      }

      // Process positions if any exist
      if (positionsData && Array.isArray(positionsData) && positionsData.length > 0) {
        const processedPositions: RebalancePosition[] = positionsData.map((pos: any) => ({
          ticker: pos.symbol,
          currentShares: parseFloat(pos.qty || '0'),
          currentValue: parseFloat(pos.market_value || '0'),
          currentAllocation: (parseFloat(pos.market_value || '0') / totalEquity) * 100,
          avgPrice: parseFloat(pos.avg_entry_price || '0')
        }));

        // Sort positions by allocation (descending)
        processedPositions.sort((a, b) => b.currentAllocation - a.currentAllocation);

        setPositions(processedPositions);
        // Select all positions by default
        setSelectedPositions(new Set(processedPositions.map(p => p.ticker)));
      } else {
        setPositions([]);
        setSelectedPositions(new Set());
      }

      setCashAllocation((cashBalance / totalEquity) * 100);

    } catch (error: any) {
      console.error('Error loading data:', error);
      setError(error.message || 'Failed to load portfolio data');
    } finally {
      setLoading(false);
    }
  };

  const togglePosition = (ticker: string) => {
    const newSet = new Set(selectedPositions);
    if (newSet.has(ticker)) {
      newSet.delete(ticker);
    } else {
      newSet.add(ticker);
    }
    setSelectedPositions(newSet);
  };

  const handleRebalance = () => {
    const positionsToRebalance = positions.filter(p =>
      selectedPositions.has(p.ticker)
    );
    onApprove(positionsToRebalance, config);
    onClose();
  };

  // Validate that stock + cash allocation equals 100%
  const handleStockAllocationChange = (value: number[]) => {
    setConfig(prev => ({
      ...prev,
      targetStockAllocation: value[0],
      targetCashAllocation: 100 - value[0]
    }));
  };

  // Generate colors for all positions
  const positionColors = positions.reduce((acc, position) => {
    acc[position.ticker] = generateRandomColor(position.ticker);
    return acc;
  }, {} as Record<string, string>);

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
          </div>

          <TabsContent value="config" className="flex-1 overflow-y-auto px-6 pb-4 mt-4 data-[state=inactive]:hidden">
            <div className="space-y-6">
              <Card className="p-6">
                <div className="space-y-6">
                  {/* Use Default Settings */}
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="useDefault"
                      checked={config.useDefaultSettings}
                      onCheckedChange={(checked) =>
                        setConfig(prev => ({ ...prev, useDefaultSettings: checked as boolean }))
                      }
                    />
                    <Label htmlFor="useDefault" className="text-sm font-medium">
                      Use default rebalance configuration from user settings
                    </Label>
                  </div>

                  {/* Configuration Fields */}
                  <div className={`space-y-6 ${config.useDefaultSettings ? 'opacity-50 pointer-events-none' : ''}`}>
                    {/* Position Size Limits */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="minPosition">Minimum Position Size ($)</Label>
                        <Input
                          id="minPosition"
                          type="number"
                          value={config.minPosition}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            minPosition: Number(e.target.value)
                          }))}
                          disabled={config.useDefaultSettings}
                        />
                        <p className="text-xs text-muted-foreground">
                          Minimum dollar amount for any position
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="maxPosition">Maximum Position Size ($)</Label>
                        <Input
                          id="maxPosition"
                          type="number"
                          value={config.maxPosition}
                          onChange={(e) => setConfig(prev => ({
                            ...prev,
                            maxPosition: Number(e.target.value)
                          }))}
                          disabled={config.useDefaultSettings}
                        />
                        <p className="text-xs text-muted-foreground">
                          Maximum dollar amount for any position
                        </p>
                      </div>
                    </div>

                    {/* Rebalance Threshold */}
                    <div className="space-y-2">
                      <Label htmlFor="threshold">
                        Rebalance Threshold: {config.rebalanceThreshold}%
                      </Label>
                      <Slider
                        id="threshold"
                        min={1}
                        max={50}
                        step={1}
                        value={[config.rebalanceThreshold]}
                        onValueChange={(value) => setConfig(prev => ({
                          ...prev,
                          rebalanceThreshold: value[0]
                        }))}
                        disabled={config.useDefaultSettings || config.skipThresholdCheck}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Minimum deviation from target allocation to trigger rebalancing
                      </p>

                      {/* Skip Threshold Check Option */}
                      <div className="flex items-center space-x-3 pt-2">
                        <Checkbox
                          id="skipThreshold"
                          checked={config.skipThresholdCheck}
                          onCheckedChange={(checked) => {
                            setConfig(prev => ({
                              ...prev,
                              skipThresholdCheck: checked as boolean,
                              // If forcing rebalance, automatically disable opportunity agent
                              skipOpportunityAgent: checked ? true : prev.skipOpportunityAgent
                            }));
                          }}
                          disabled={config.useDefaultSettings}
                        />
                        <Label htmlFor="skipThreshold" className="text-sm font-normal cursor-pointer">
                          Skip Threshold Check
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6">
                        When enabled, all selected stocks will be analyzed for rebalance agent regardless of rebalance threshold
                      </p>
                    </div>

                    {/* Opportunity Agent Option */}
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id="skipOpportunity"
                          checked={config.skipOpportunityAgent}
                          onCheckedChange={(checked) =>
                            setConfig(prev => ({ ...prev, skipOpportunityAgent: checked as boolean }))
                          }
                          disabled={config.useDefaultSettings || config.skipThresholdCheck}
                        />
                        <Label
                          htmlFor="skipOpportunity"
                          className={`text-sm font-normal cursor-pointer ${config.skipThresholdCheck ? 'opacity-50' : ''
                            }`}
                        >
                          Skip opportunity analysis
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6">
                        {config.skipThresholdCheck
                          ? "Opportunity analysis is automatically skipped when skip threshold check is enabled"
                          : "When enabled, rebalance agent will skip opportunity analysis regardless of rebalance threshold"
                        }
                      </p>
                    </div>

                    {/* Portfolio Allocation */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Portfolio Allocation</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Stock Allocation: {config.targetStockAllocation}%</Label>
                            <Slider
                              min={0}
                              max={100}
                              step={5}
                              value={[config.targetStockAllocation]}
                              onValueChange={handleStockAllocationChange}
                              disabled={config.useDefaultSettings}
                              className="w-full"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm">Cash Allocation: {config.targetCashAllocation}%</Label>
                            <Progress value={config.targetCashAllocation} className="h-2 mt-6" />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Target allocation between stocks and cash in your portfolio
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-semibold mb-3">Configuration Summary</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Position Range:</span>
                        <span className="font-medium">
                          ${config.minPosition.toLocaleString()} - ${config.maxPosition.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rebalance Threshold:</span>
                        <span className="font-medium">
                          {config.skipThresholdCheck ? 'Skipped' : `${config.rebalanceThreshold}%`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stock Allocation:</span>
                        <span className="font-medium">{config.targetStockAllocation}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Cash Allocation:</span>
                        <span className="font-medium">{config.targetCashAllocation}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Opportunity Analysis:</span>
                        <span className="font-medium">
                          {config.skipOpportunityAgent || config.skipThresholdCheck ? 'Disabled' : 'Enabled'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Selected Stocks:</span>
                        <span className="font-medium">{selectedPositions.size} stocks</span>
                      </div>
                    </div>
                    {config.skipThresholdCheck && (
                      <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                        <p className="text-xs text-yellow-700 dark:text-yellow-400">
                          ⚠️ Force rebalance enabled - will proceed regardless of current allocation drift
                        </p>
                      </div>
                    )}
                    {!config.skipThresholdCheck && !config.skipOpportunityAgent && (
                      <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                          💡 Opportunity analysis enabled - AI may suggest additional stocks beyond your selection
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

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
                {positions.length > 0 && (
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
                )}

                {/* Stock Selection List */}
                {positions.length === 0 ? (
                  <Card className="p-6 text-center">
                    <p className="text-muted-foreground">No positions found in your account</p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {positions.map((position) => {
                      const isSelected = selectedPositions.has(position.ticker);

                      return (
                        <div
                          key={position.ticker}
                          className={`p-4 rounded-lg border transition-all cursor-pointer ${isSelected ? 'bg-muted/50 border-primary' : 'bg-background border-border'
                            }`}
                          onClick={() => togglePosition(position.ticker)}
                        >
                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => togglePosition(position.ticker)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span className="font-semibold text-lg">{position.ticker}</span>
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
                    })}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Fixed Footer */}
        <div className="border-t px-6 py-4 bg-background shrink-0">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleRebalance}
              disabled={selectedPositions.size === 0 || loading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Execute Rebalancing ({selectedPositions.size} positions)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}