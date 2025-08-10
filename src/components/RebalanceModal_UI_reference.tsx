import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  PieChart,
  ArrowRight
} from "lucide-react";

interface RebalancePosition {
  ticker: string;
  currentShares: number;
  currentValue: number;
  currentAllocation: number;
  targetAllocation: number;
  recommendedShares: number;
  shareChange: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
}

interface RebalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: (positions: RebalancePosition[]) => void;
}

const mockRebalanceData: RebalancePosition[] = [
  {
    ticker: 'NVDA',
    currentShares: 50,
    currentValue: 25125,
    currentAllocation: 28.5,
    targetAllocation: 20,
    recommendedShares: 35,
    shareChange: -15,
    action: 'SELL',
    reasoning: 'Reduce overweight position to maintain diversification'
  },
  {
    ticker: 'AAPL',
    currentShares: 100,
    currentValue: 17825,
    currentAllocation: 12.2,
    targetAllocation: 18,
    recommendedShares: 130,
    shareChange: 30,
    action: 'BUY',
    reasoning: 'Increase allocation to match target weight, strong fundamentals'
  },
  {
    ticker: 'MSFT',
    currentShares: 50,
    currentValue: 21445,
    currentAllocation: 20.1,
    targetAllocation: 20,
    recommendedShares: 50,
    shareChange: 0,
    action: 'HOLD',
    reasoning: 'Position already at target allocation'
  },
  {
    ticker: 'GOOGL',
    currentShares: 75,
    currentValue: 11235,
    currentAllocation: 15.8,
    targetAllocation: 10,
    recommendedShares: 50,
    shareChange: -25,
    action: 'SELL',
    reasoning: 'Reduce exposure due to recent underperformance'
  },
  {
    ticker: 'TSLA',
    currentShares: 0,
    currentValue: 0,
    currentAllocation: 0,
    targetAllocation: 12,
    recommendedShares: 40,
    shareChange: 40,
    action: 'BUY',
    reasoning: 'Initiate position based on positive agent analysis'
  }
];

export default function RebalanceModal({ isOpen, onClose, onApprove }: RebalanceModalProps) {
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(
    new Set(mockRebalanceData.filter(p => p.shareChange !== 0).map(p => p.ticker))
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
    const positionsToRebalance = mockRebalanceData.filter(p => 
      selectedPositions.has(p.ticker) && p.shareChange !== 0
    );
    onApprove(positionsToRebalance);
    onClose();
  };

  const totalBuyValue = mockRebalanceData
    .filter(p => p.action === 'BUY' && selectedPositions.has(p.ticker))
    .reduce((sum, p) => sum + Math.abs(p.shareChange * (p.currentValue / p.currentShares || 200)), 0);

  const totalSellValue = mockRebalanceData
    .filter(p => p.action === 'SELL' && selectedPositions.has(p.ticker))
    .reduce((sum, p) => sum + Math.abs(p.shareChange * (p.currentValue / p.currentShares)), 0);

  const netCashFlow = totalSellValue - totalBuyValue;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Portfolio Rebalancing Analysis
          </DialogTitle>
          <DialogDescription>
            Review and approve recommended changes to optimize your portfolio allocation
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 my-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Buy Value</span>
                <TrendingUp className="w-4 h-4 text-green-500" />
              </div>
              <p className="text-lg font-semibold text-green-600">
                ${totalBuyValue.toLocaleString()}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Sell Value</span>
                <TrendingDown className="w-4 h-4 text-red-500" />
              </div>
              <p className="text-lg font-semibold text-red-600">
                ${totalSellValue.toLocaleString()}
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Net Cash Flow</span>
                <AlertCircle className="w-4 h-4 text-blue-500" />
              </div>
              <p className={`text-lg font-semibold ${netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {netCashFlow >= 0 ? '+' : ''}${netCashFlow.toLocaleString()}
              </p>
            </Card>
          </div>

          {/* Rebalancing Positions */}
          <div className="space-y-3">
            {mockRebalanceData.map((position) => {
              const isSelected = selectedPositions.has(position.ticker);
              const pricePerShare = position.currentShares > 0 
                ? position.currentValue / position.currentShares 
                : 200; // Default price for new positions
              
              return (
                <div
                  key={position.ticker}
                  className={`p-4 rounded-lg border transition-all cursor-pointer ${
                    isSelected ? 'bg-muted/50 border-primary' : 'bg-background border-border'
                  } ${position.shareChange === 0 ? 'opacity-60' : ''}`}
                  onClick={() => position.shareChange !== 0 && togglePosition(position.ticker)}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => togglePosition(position.ticker)}
                          className="w-4 h-4"
                          disabled={position.shareChange === 0}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="font-semibold text-lg">{position.ticker}</span>
                        <Badge variant={
                          position.action === 'BUY' ? 'secondary' : 
                          position.action === 'SELL' ? 'destructive' : 
                          'outline'
                        }>
                          {position.action}
                        </Badge>
                        {position.shareChange !== 0 && (
                          <span className={`text-sm font-medium ${
                            position.shareChange > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {position.shareChange > 0 ? '+' : ''}{position.shareChange} shares
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          ${Math.abs(position.shareChange * pricePerShare).toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          @ ${pricePerShare.toFixed(2)}/share
                        </p>
                      </div>
                    </div>

                    {/* Allocation Bars */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground w-16">Current:</span>
                        <Progress value={position.currentAllocation} className="flex-1 h-2" />
                        <span className="text-xs font-medium w-12 text-right">
                          {position.currentAllocation.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground w-16">Target:</span>
                        <Progress value={position.targetAllocation} className="flex-1 h-2" />
                        <span className="text-xs font-medium w-12 text-right">
                          {position.targetAllocation.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Position Changes */}
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {position.currentShares} shares
                        </span>
                        {position.shareChange !== 0 && (
                          <>
                            <ArrowRight className="w-4 h-4" />
                            <span className="font-medium">
                              {position.recommendedShares} shares
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Reasoning */}
                    <p className="text-xs text-muted-foreground italic">
                      {position.reasoning}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleRebalance}
            disabled={selectedPositions.size === 0}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Execute Rebalancing ({selectedPositions.size} positions)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}