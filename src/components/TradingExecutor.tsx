import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import StockTickerAutocomplete from "@/components/StockTickerAutocomplete";
import { alpacaAPI, type CreateOrderRequest } from "@/lib/alpaca";
import { tradingAgentsAPI } from "@/lib/tradingAgents";
import { useAuth } from "@/lib/auth-supabase";

interface TradingExecutorProps {
  isOpen: boolean;
  onClose: () => void;
  prefilledOrder?: {
    symbol: string;
    side: 'buy' | 'sell';
    qty?: number;
    recommendation?: string;
  };
}

export default function TradingExecutor({ isOpen, onClose, prefilledOrder }: TradingExecutorProps) {
  const { apiSettings } = useAuth();
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<any>(null);
  
  // Form state
  const [symbol, setSymbol] = useState(prefilledOrder?.symbol || '');
  const [side, setSide] = useState<'buy' | 'sell'>(prefilledOrder?.side || 'buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [qty, setQty] = useState(prefilledOrder?.qty?.toString() || '');
  const [limitPrice, setLimitPrice] = useState('');
  const [timeInForce, setTimeInForce] = useState<'day' | 'gtc'>('day');

  const getAIRecommendation = async () => {
    if (!symbol) {
      setError('Please enter a symbol');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setAiRecommendation(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const result = await tradingAgentsAPI.analyzeStock(symbol.toUpperCase(), today);
      setAiRecommendation(result);
    } catch (err) {
      console.error('Error getting AI recommendation:', err);
      setError('Failed to get AI recommendation');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!symbol || !qty) {
      setError('Please fill in all required fields');
      return;
    }

    if (orderType === 'limit' && !limitPrice) {
      setError('Limit price is required for limit orders');
      return;
    }

    setLoading(true);

    try {
      const order: CreateOrderRequest = {
        symbol: symbol.toUpperCase(),
        qty: parseInt(qty),
        side,
        type: orderType,
        time_in_force: timeInForce,
        ...(orderType === 'limit' && { limit_price: parseFloat(limitPrice) })
      };

      const result = await alpacaAPI.createOrder(order);
      
      setSuccess(`Order placed successfully! Order ID: ${result.id}`);
      
      // Clear form
      setTimeout(() => {
        onClose();
        setSymbol('');
        setQty('');
        setLimitPrice('');
        setSuccess(null);
        setAiRecommendation(null);
      }, 3000);
      
    } catch (err) {
      console.error('Error placing order:', err);
      setError(err instanceof Error ? err.message : 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Execute Trade
              {apiSettings && (
                <Badge 
                  variant={apiSettings.alpaca_paper_trading ? "secondary" : "destructive"} 
                  className="text-xs"
                >
                  {apiSettings.alpaca_paper_trading ? "Paper Trading" : "Live Trading"}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Place a trade order through your Alpaca {apiSettings?.alpaca_paper_trading ? 'paper' : 'live'} account
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Symbol and AI Analysis */}
            <div className="space-y-2">
              <Label htmlFor="symbol">Symbol</Label>
              <div className="flex gap-2">
                <StockTickerAutocomplete
                  id="symbol"
                  value={symbol}
                  onChange={setSymbol}
                  placeholder="AAPL"
                  required
                  disabled={loading}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={getAIRecommendation}
                  disabled={analyzing || loading}
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    'Get AI Analysis'
                  )}
                </Button>
              </div>
            </div>

            {/* AI Recommendation */}
            {aiRecommendation && (
              <Alert className={`${
                aiRecommendation.decision === 'BUY' ? 'border-green-500' :
                aiRecommendation.decision === 'SELL' ? 'border-red-500' :
                'border-yellow-500'
              }`}>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>AI Recommendation:</strong> {aiRecommendation.decision} 
                  (Confidence: {aiRecommendation.confidence.toFixed(1)}%)
                  {aiRecommendation.agent_insights?.trader && (
                    <p className="mt-1 text-sm">{aiRecommendation.agent_insights.trader}</p>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Order Side */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Order Side</Label>
                <Select value={side} onValueChange={(v) => setSide(v as 'buy' | 'sell')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Order Type</Label>
                <Select value={orderType} onValueChange={(v) => setOrderType(v as 'market' | 'limit')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="market">Market</SelectItem>
                    <SelectItem value="limit">Limit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quantity and Price */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="qty">Quantity</Label>
                <Input
                  id="qty"
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="100"
                  required
                  disabled={loading}
                  min="1"
                />
              </div>

              {orderType === 'limit' && (
                <div className="space-y-2">
                  <Label htmlFor="limitPrice">Limit Price</Label>
                  <Input
                    id="limitPrice"
                    type="number"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder="150.00"
                    required={orderType === 'limit'}
                    disabled={loading}
                    step="0.01"
                    min="0.01"
                  />
                </div>
              )}
            </div>

            {/* Time in Force */}
            <div className="space-y-2">
              <Label>Time in Force</Label>
              <Select value={timeInForce} onValueChange={(v) => setTimeInForce(v as 'day' | 'gtc')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day (expires at market close)</SelectItem>
                  <SelectItem value="gtc">Good Till Canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Error/Success Messages */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">{success}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Placing Order...
                </>
              ) : (
                'Place Order'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}