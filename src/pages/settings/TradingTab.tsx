import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Save,
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  DollarSign,
  Lock,
  Target,
  ShieldAlert,
} from "lucide-react";
import type { TradingTabProps } from "./types";

export default function TradingTab({
  alpacaPaperApiKey,
  alpacaPaperSecretKey,
  alpacaLiveApiKey,
  alpacaLiveSecretKey,
  alpacaPaperTrading,
  autoExecuteTrades,
  userRiskLevel,
  defaultPositionSizeDollars,
  profitTarget,
  stopLoss,
  configuredProviders,
  showKeys,
  saved,
  activeTab,
  setAlpacaPaperApiKey,
  setAlpacaPaperSecretKey,
  setAlpacaLiveApiKey,
  setAlpacaLiveSecretKey,
  setAlpacaPaperTrading,
  setAutoExecuteTrades,
  setUserRiskLevel,
  setDefaultPositionSizeDollars,
  setProfitTarget,
  setStopLoss,
  toggleShowKey,
  handleSaveTab,
  canUseLiveTrading = true,
  canUseAutoTrading = true,
}: TradingTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Alpaca Trading Configuration
        </CardTitle>
        <CardDescription>
          Configure your Alpaca trading credentials
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Information and Trading Mode Toggle Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Getting Started Information */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <span className="block text-sm font-medium mb-2">
              Getting Started
            </span>
            <ol className="space-y-1 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="font-medium">1.</span>
                <span>Visit <a href="https://alpaca.markets" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">alpaca.markets</a> and create an account</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium">2.</span>
                <span>Navigate to your dashboard and select API Keys</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium">3.</span>
                <span>Generate separate keys for Paper and Live trading</span>
              </li>
            </ol>
          </div>

          {/* Trading Mode Toggle */}
          <div className="rounded-lg border bg-muted/30 p-4">
            {!canUseLiveTrading && (
              <Alert className="mb-3">
                <Lock className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Live trading requires a higher subscription plan. Paper trading is available for testing.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-3">
              <Label className="text-base font-medium">Trading Mode</Label>
              <div className={`flex items-center justify-center gap-4 ${!canUseLiveTrading ? 'opacity-50' : ''}`}>
                <div className={`flex items-center gap-2 ${!alpacaPaperTrading ? 'font-semibold' : 'text-muted-foreground'}`}>
                  <TrendingDown className={`h-4 w-4 ${!alpacaPaperTrading ? 'text-red-500' : ''}`} />
                  <span>Live Trading</span>
                  {!canUseLiveTrading && !alpacaPaperTrading && <Lock className="h-3 w-3" />}
                </div>
                <div className="relative">
                  <Switch
                    id="paper-trading"
                    checked={alpacaPaperTrading}
                    onCheckedChange={(checked) => {
                      // If trying to switch to live trading, check permission
                      if (!checked && !canUseLiveTrading) {
                        return; // Don't allow switching to live trading
                      }
                      setAlpacaPaperTrading(checked);
                    }}
                    disabled={!canUseLiveTrading && !alpacaPaperTrading}
                    className="data-[state=checked]:bg-green-600 data-[state=unchecked]:bg-red-500/80"
                  />
                </div>
                <div className={`flex items-center gap-2 ${alpacaPaperTrading ? 'font-semibold' : 'text-muted-foreground'}`}>
                  <span>Paper Trading</span>
                  <TrendingUp className={`h-4 w-4 ${alpacaPaperTrading ? 'text-green-500' : ''}`} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                {alpacaPaperTrading
                  ? "Testing mode with simulated money - no real funds at risk"
                  : "⚠️ Real money trading - actual funds will be used"}
              </p>
            </div>
          </div>
        </div>

        {/* Trade Execution Settings */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Trade Execution Settings
          </h3>

          {/* Auto-Execute Trade Orders */}
          <div className={`rounded-lg border bg-muted/30 p-4 `}>
            {!canUseAutoTrading && (
              <Alert className="mb-3">
                <Lock className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Auto-execution requires a higher subscription plan. Upgrade to enable automatic trade execution.
                </AlertDescription>
              </Alert>
            )}
            <div className={`space-y-3 ${!canUseAutoTrading ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-execute" className="text-base font-medium cursor-pointer flex items-center gap-2">
                    Auto-Execute Trade Orders
                    {!canUseAutoTrading && <Lock className="h-4 w-4 text-muted-foreground" />}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically execute approved trade recommendations
                  </p>
                </div>
                <Switch
                  id="auto-execute"
                  checked={autoExecuteTrades}
                  onCheckedChange={setAutoExecuteTrades}
                  disabled={!canUseAutoTrading}
                  className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted-foreground/30"
                />
              </div>
              {autoExecuteTrades && canUseAutoTrading && (
                <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                  <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>Auto-execution will use {alpacaPaperTrading ? 'paper' : 'live'} trading mode</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Risk Level and Position Size on same line */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* User Risk Level */}
            <div className="space-y-2">
              <Label htmlFor="risk-level">Risk Tolerance Level</Label>
              <Select value={userRiskLevel} onValueChange={setUserRiskLevel}>
                <SelectTrigger id="risk-level">
                  <SelectValue placeholder="Select risk level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-blue-500" />
                      <span>Conservative</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="moderate">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-yellow-500" />
                      <span>Moderate (Recommended)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="aggressive">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-red-500" />
                      <span>Aggressive</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {userRiskLevel === 'conservative' &&
                  "Lower position sizes, focuses on capital preservation"
                }
                {userRiskLevel === 'moderate' &&
                  "Balanced approach between risk and reward"
                }
                {userRiskLevel === 'aggressive' &&
                  "Larger position sizes, maximizes growth potential"
                }
              </p>
            </div>

            {/* Default Position Size */}
            <div className="space-y-2">
              <Label htmlFor="position-size">Default Position Size</Label>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="position-size"
                  type="number"
                  min="100"
                  step="100"
                  value={defaultPositionSizeDollars}
                  onChange={(e) => setDefaultPositionSizeDollars(Number(e.target.value))}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Base amount in dollars for each trade position
              </p>
            </div>
          </div>
        </div>

        {/* Position Management Preferences */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-4 w-4" />
            Position Management Preferences
          </h3>
          <p className="text-sm text-muted-foreground">
            These preferences guide (but don't dictate) trading decisions to help manage your positions effectively.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profit Target */}
            <div className="space-y-2">
              <Label htmlFor="profit-target" className="text-sm">
                Profit Target: {profitTarget}%
              </Label>
              <Slider
                id="profit-target"
                min={5}
                max={100}
                step={1}
                value={[profitTarget]}
                onValueChange={(value) => setProfitTarget(value[0])}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Consider taking profits when positions gain this percentage
              </p>
            </div>

            {/* Stop Loss */}
            <div className="space-y-2">
              <Label htmlFor="stop-loss" className="text-sm">
                Stop Loss: {stopLoss}%
              </Label>
              <Slider
                id="stop-loss"
                min={5}
                max={25}
                step={1}
                value={[stopLoss]}
                onValueChange={(value) => setStopLoss(value[0])}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Consider exiting when positions lose this percentage
              </p>
            </div>
          </div>

          <Alert className="mt-4">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              These are preferences that influence AI recommendations, not hard rules. The AI will consider these targets along with market conditions, technical analysis, and other factors when making trading decisions.
            </AlertDescription>
          </Alert>
        </div>

        {/* Paper Trading Credentials */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            Paper Trading Credentials
          </h3>
          <div className="rounded-lg border bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium">
                Safe Testing Environment
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Test strategies safely with simulated money. No real funds at risk.
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Paper API Key
                  {configuredProviders.alpaca_paper && (
                    <Badge variant="success" className="text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type={showKeys.alpacaPaperApiKey ? "text" : "password"}
                    placeholder="Enter your paper trading API key"
                    value={alpacaPaperApiKey}
                    onChange={(e) => setAlpacaPaperApiKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => toggleShowKey('alpacaPaperApiKey')}
                  >
                    {showKeys.alpacaPaperApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Paper Secret Key</Label>
                <div className="relative">
                  <Input
                    type={showKeys.alpacaPaperSecretKey ? "text" : "password"}
                    placeholder="Enter your paper trading secret key"
                    value={alpacaPaperSecretKey}
                    onChange={(e) => setAlpacaPaperSecretKey(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => toggleShowKey('alpacaPaperSecretKey')}
                  >
                    {showKeys.alpacaPaperSecretKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Trading Credentials */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
            Live Trading Credentials
            {!canUseLiveTrading && <Lock className="h-4 w-4 text-muted-foreground" />}
          </h3>

          {!canUseLiveTrading ? (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                Live trading requires a higher subscription plan. Upgrade to enable real money trading capabilities.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className={`rounded-lg border bg-red-500/10 dark:bg-red-500/5 border-red-500/20 dark:border-red-500/10 p-4 ${!canUseLiveTrading ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <span className="text-sm font-medium">
                Real Money Trading
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              <strong>⚠️ Warning:</strong> These credentials will execute real trades with actual money. Use extreme caution and ensure you understand the risks.
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Live API Key
                  {configuredProviders.alpaca_live && (
                    <Badge variant="success" className="text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type={showKeys.alpacaLiveApiKey ? "text" : "password"}
                    placeholder="Enter your live trading API key"
                    value={alpacaLiveApiKey}
                    onChange={(e) => setAlpacaLiveApiKey(e.target.value)}
                    disabled={!canUseLiveTrading}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => toggleShowKey('alpacaLiveApiKey')}
                    disabled={!canUseLiveTrading}
                  >
                    {showKeys.alpacaLiveApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Live Secret Key</Label>
                <div className="relative">
                  <Input
                    type={showKeys.alpacaLiveSecretKey ? "text" : "password"}
                    placeholder="Enter your live trading secret key"
                    value={alpacaLiveSecretKey}
                    onChange={(e) => setAlpacaLiveSecretKey(e.target.value)}
                    disabled={!canUseLiveTrading}
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => toggleShowKey('alpacaLiveSecretKey')}
                    disabled={!canUseLiveTrading}
                  >
                    {showKeys.alpacaLiveSecretKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button for Trading Tab */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={() => {
              console.log('Button clicked - calling handleSaveTab for trading');
              handleSaveTab('trading');
            }}
            size="lg"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Trading Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}