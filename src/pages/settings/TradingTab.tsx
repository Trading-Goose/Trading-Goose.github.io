import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  toggleShowKey,
  handleSaveTab,
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
            <div className="flex items-start space-x-3">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  id="paper-trading"
                  checked={alpacaPaperTrading}
                  onChange={(e) => setAlpacaPaperTrading(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-2 focus:ring-2 focus:ring-offset-background transition-all cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="paper-trading" className="text-base font-medium cursor-pointer leading-none">
                  Use Paper Trading
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Recommended for testing strategies with simulated money
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Execution Settings */}
        <div className="space-y-4 p-4 border rounded-lg bg-card">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Trade Execution Settings
          </h3>
          
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
                "Lower position sizes, focuses on capital preservation and steady growth"
              }
              {userRiskLevel === 'moderate' && 
                "Balanced approach between risk and reward, suitable for most investors"
              }
              {userRiskLevel === 'aggressive' && 
                "Larger position sizes, maximizes growth potential with higher risk tolerance"
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
              Base amount in dollars for each trade position. Will be adjusted based on confidence and risk level.
            </p>
          </div>
          
          {/* Auto-Execute Trade Orders */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-start space-x-3">
              <div className="flex items-center h-5">
                <input
                  type="checkbox"
                  id="auto-execute"
                  checked={autoExecuteTrades}
                  onChange={(e) => setAutoExecuteTrades(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-offset-2 focus:ring-2 focus:ring-offset-background transition-all cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="auto-execute" className="text-base font-medium cursor-pointer leading-none">
                  Auto-Execute Trade Orders
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  When enabled, approved trade recommendations will be automatically executed without manual confirmation
                </p>
                {autoExecuteTrades && (
                  <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      <span>Auto-execution will use {alpacaPaperTrading ? 'paper' : 'live'} trading mode</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
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
          </h3>
          <div className="rounded-lg border bg-red-500/10 dark:bg-red-500/5 border-red-500/20 dark:border-red-500/10 p-4">
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
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => toggleShowKey('alpacaLiveApiKey')}
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
                    className="font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => toggleShowKey('alpacaLiveSecretKey')}
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
          {saved && activeTab === 'trading' && (
            <Alert className="mr-4 w-auto bg-green-50 border-green-200">
              <Check className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Trading settings saved successfully!
              </AlertDescription>
            </Alert>
          )}
          <Button 
            onClick={() => {
              console.log('Button clicked - calling handleSaveTab for trading');
              handleSaveTab('trading').catch(err => {
                console.error('Error in handleSaveTab:', err);
              });
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