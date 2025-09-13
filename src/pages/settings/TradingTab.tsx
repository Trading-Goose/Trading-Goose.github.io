import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { HelpButton, LabelWithHelp, HelpContent } from "@/components/ui/help-button";
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
  nearLimitThreshold,
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
  setNearLimitThreshold,
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
              <LabelWithHelp
                label="Trading Mode"
                helpContent={
                  <HelpContent
                    description="Choose between paper trading (safe testing with simulated money) or live trading (real money at risk)."
                    tips={[
                      "Always start with paper trading to test strategies",
                      "Switch to live only when consistently profitable",
                      "Paper trading uses simulated money - no real funds at risk"
                    ]}
                    warning={!alpacaPaperTrading ? "Live trading uses real money - actual funds will be used" : undefined}
                  />
                }
                className="text-base font-medium"
              />
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
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Trade Execution Settings
            </h3>
            <HelpButton
              content={
                <HelpContent
                  description="Configure how trades are executed and managed in your account."
                  tips={[
                    "Auto-execution saves time but requires trust in the AI",
                    "Risk tolerance affects position sizing",
                    "Position size is the base amount for each trade"
                  ]}
                />
              }
            />
          </div>

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
                  <LabelWithHelp
                    htmlFor="auto-execute"
                    label="Auto-Execute Trade Orders"
                    helpContent={
                      <HelpContent
                        description="When enabled, approved trades execute automatically. When disabled, you manually review each trade."
                        tips={[
                          "Requires higher subscription tier",
                          "Start with manual, switch to auto when comfortable",
                          "All trades still go through risk management"
                        ]}
                      />
                    }
                    className="text-base font-medium cursor-pointer"
                  />
                  {!canUseAutoTrading && <Lock className="h-4 w-4 text-muted-foreground" />}
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
              <LabelWithHelp
                htmlFor="risk-level"
                label="Risk Tolerance Level"
                helpContent={
                  <HelpContent
                    description="Affects position sizing and trade recommendations based on your risk appetite."
                    tips={[
                      "Conservative: Smaller positions, preservation focus",
                      "Moderate: Balanced risk/reward (recommended for most)",
                      "Aggressive: Larger positions, growth focus"
                    ]}
                  />
                }
              />
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
              <LabelWithHelp
                htmlFor="position-size"
                label="Default Position Size"
                helpContent={
                  <HelpContent
                    description="Base dollar amount for each new position."
                    example="$1,000 for $25,000 account (4%)"
                    tips={[
                      "Adjust based on account size and risk tolerance",
                      "Can be overridden for individual trades",
                      "Consider starting small and increasing over time"
                    ]}
                  />
                }
              />
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
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Target className="h-4 w-4" />
              Position Management Preferences
            </h3>
            <HelpButton
              content={
                <HelpContent
                  description="Set preferences for when the AI should consider taking profits or cutting losses."
                  tips={[
                    "These are guidelines, not hard rules",
                    "AI evaluates market conditions alongside these targets",
                    "Adjust based on market volatility and your strategy"
                  ]}
                />
              }
            />
          </div>
          <p className="text-sm text-muted-foreground">
            These preferences guide (but don't dictate) trading decisions to help manage your positions effectively.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profit Target */}
            <div className="space-y-2">
              <LabelWithHelp
                htmlFor="profit-target"
                label={`Profit Target: ${profitTarget}%`}
                helpContent={
                  <HelpContent
                    description="AI considers selling when position gains this percentage."
                    tips={[
                      "Conservative: 10-15%",
                      "Moderate: 20-30%",
                      "Aggressive: 40%+",
                      "Not a hard sell rule - AI evaluates market conditions"
                    ]}
                  />
                }
                className="text-sm"
              />
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
              <LabelWithHelp
                htmlFor="stop-loss"
                label={`Stop Loss: ${stopLoss}%`}
                helpContent={
                  <HelpContent
                    description="AI considers exiting when position loses this percentage."
                    tips={[
                      "Conservative: 5-8%",
                      "Moderate: 10-12%",
                      "Aggressive: 15-20%",
                      "Protects capital from large losses",
                      "Balance with profit target for good risk/reward ratio"
                    ]}
                  />
                }
                className="text-sm"
              />
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

          {/* Near Limit Threshold */}
          <div className="space-y-2">
            <LabelWithHelp
              htmlFor="near-limit-threshold"
              label={`Near Limit Threshold: ${nearLimitThreshold}%`}
              helpContent={
                <HelpContent
                  description="Defines when a position is considered 'near' profit target or stop loss."
                  example="If set to 20%, a position at 80% of profit target (e.g., 20% gain with 25% target) is considered 'near target'"
                  tips={[
                    "Lower values (5-10%): More conservative, earlier warnings",
                    "Medium values (15-20%): Balanced approach (recommended)",
                    "Higher values (20-25%): Less sensitive to approaches",
                    "Affects when AI starts considering exit strategies"
                  ]}
                />
              }
              className="text-sm"
            />
            <Slider
              id="near-limit-threshold"
              min={5}
              max={25}
              step={1}
              value={[nearLimitThreshold]}
              onValueChange={(value) => setNearLimitThreshold(value[0])}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Position considered "near" when within {nearLimitThreshold}% of profit target or stop loss
            </p>
          </div>

          <Alert className="mt-4">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              These are preferences that influence AI recommendations, not hard rules. The AI will consider these targets along with market conditions, technical analysis, and other factors when making decisions.
            </AlertDescription>
          </Alert>
        </div>

        {/* Paper Trading Credentials */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              Paper Trading Credentials
            </h3>
            <HelpButton
              content={
                <HelpContent
                  description="Paper trading credentials for safe testing with simulated money."
                  tips={[
                    "Get from Alpaca dashboard → Paper Trading → API Keys",
                    "No real money involved - safe to test strategies",
                    "Paper keys typically start with 'PK'"
                  ]}
                />
              }
            />
          </div>
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
                <div className="flex items-center gap-2">
                  <LabelWithHelp
                    label="Paper API Key"
                    helpContent={
                      <HelpContent
                        description="Your paper trading API key from Alpaca."
                        tips={[
                          "Get from Alpaca dashboard → Paper Trading → API Keys",
                          "Starts with 'PK' for paper keys",
                          "Safe to test - no real money involved",
                          "Keep secure even though it's paper trading"
                        ]}
                      />
                    }
                  />
                  {configuredProviders.alpaca_paper && (
                    <Badge variant="success" className="text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  )}
                </div>
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
                <LabelWithHelp
                  label="Paper Secret Key"
                  helpContent={
                    <HelpContent
                      description="Paired with API key for authentication."
                      tips={[
                        "Get from same location as API key",
                        "Required for API access",
                        "Never share or expose in code",
                        "Regenerate if compromised"
                      ]}
                    />
                  }
                />
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
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              Live Trading Credentials
              {!canUseLiveTrading && <Lock className="h-4 w-4 text-muted-foreground" />}
            </h3>
            <HelpButton
              content={
                <HelpContent
                  description="Live trading credentials for real money trading."
                  warning="These credentials enable real money transactions. Use extreme caution and ensure you understand the risks."
                  tips={[
                    "Requires higher subscription tier",
                    "Get from Alpaca dashboard → Live Trading → API Keys",
                    "Consider using separate account for automated trading",
                    "Always test strategies in paper trading first"
                  ]}
                />
              }
            />
          </div>

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
                <div className="flex items-center gap-2">
                  <LabelWithHelp
                    label="Live API Key"
                    helpContent={
                      <HelpContent
                        description="Your live trading API key from Alpaca."
                        warning="REAL MONEY - Use extreme caution. This key enables real trades with actual funds."
                        tips={[
                          "Get from Alpaca dashboard → Live Trading → API Keys",
                          "Different from paper trading keys",
                          "Store securely, rotate regularly",
                          "Never share or commit to code"
                        ]}
                      />
                    }
                  />
                  {configuredProviders.alpaca_live && (
                    <Badge variant="success" className="text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Configured
                    </Badge>
                  )}
                </div>
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
                <LabelWithHelp
                  label="Live Secret Key"
                  helpContent={
                    <HelpContent
                      description="Paired with live API key for authentication."
                      warning="Enables real money transactions. Critical security - never share or expose."
                      tips={[
                        "Use environment variables in production",
                        "Rotate regularly for security",
                        "Never commit to version control",
                        "Consider using separate account for automated trading"
                      ]}
                    />
                  }
                />
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