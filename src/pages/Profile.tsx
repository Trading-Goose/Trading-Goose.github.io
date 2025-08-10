import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ChevronLeft,
  User, 
  Mail, 
  Calendar,
  Shield,
  Activity,
  TrendingUp,
  AlertCircle,
  LogOut
} from "lucide-react";
import { useAuth } from "@/lib/auth-supabase";
import Header from "@/components/Header";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, apiSettings, logout, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!user) {
    return null;
  }

  const tradingMode = apiSettings?.alpaca_paper_trading ? 'Paper Trading' : 'Live Trading';
  const hasAIConfig = !!apiSettings?.ai_api_key;
  const hasMarketDataConfig = !!apiSettings?.alpha_vantage_api_key;
  const hasAlpacaConfig = apiSettings?.alpaca_paper_trading 
    ? !!apiSettings?.alpaca_paper_api_key 
    : !!apiSettings?.alpaca_live_api_key;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <User className="h-8 w-8" />
            Profile
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your account information and preferences
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Account Information */}
          <Card className="md:col-span-2 lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Account Information
              </CardTitle>
              <CardDescription>
                Your personal account details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    Name
                  </div>
                  <p className="font-medium">{user.name || 'Not set'}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    Email
                  </div>
                  <p className="font-medium">{user.email}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Member Since
                  </div>
                  <p className="font-medium">
                    {new Date(user.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    Account ID
                  </div>
                  <p className="font-mono text-sm">{user.id.slice(0, 8)}...</p>
                </div>
              </div>

              <Separator />

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  To update your profile information or change your password, please contact support.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Configuration Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Configuration Status
              </CardTitle>
              <CardDescription>
                Your API and trading setup
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">AI Provider</span>
                  <Badge variant={hasAIConfig ? "success" : "secondary"}>
                    {hasAIConfig ? "Configured" : "Not Set"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Market Data</span>
                  <Badge variant={hasMarketDataConfig ? "success" : "secondary"}>
                    {hasMarketDataConfig ? "Configured" : "Not Set"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Trading Account</span>
                  <Badge variant={hasAlpacaConfig ? "success" : "secondary"}>
                    {hasAlpacaConfig ? "Configured" : "Not Set"}
                  </Badge>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Trading Mode</span>
                  <Badge 
                    variant={apiSettings?.alpaca_paper_trading ? "secondary" : "destructive"}
                    className="flex items-center gap-1"
                  >
                    <TrendingUp className="h-3 w-3" />
                    {tradingMode}
                  </Badge>
                </div>
              </div>

              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate('/settings')}
              >
                Go to Settings
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle>Account Activity</CardTitle>
              <CardDescription>
                Your trading and analysis activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Total Analyses</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Trades Executed</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Portfolios Created</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="md:col-span-2 lg:col-span-3 border-red-200">
            <CardHeader>
              <CardTitle className="text-red-800">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible actions for your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                variant="destructive" 
                onClick={handleLogout}
                className="flex items-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                Log Out
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}