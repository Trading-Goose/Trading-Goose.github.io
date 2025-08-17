import { useEffect, useState } from "react";
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
  LogOut,
  Lock
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import ChangePasswordModal from "@/components/ChangePasswordModal";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, apiSettings, logout, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [activityStats, setActivityStats] = useState({
    totalAnalyses: 0,
    executedTrades: 0,
    rebalances: 0
  });
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);

  const handleSendResetEmail = async () => {
    if (!user?.email) return;

    setSendingResetEmail(true);
    try {
      // Build the correct redirect URL
      const origin = window.location.origin;
      const redirectUrl = `${origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.error('Reset email error:', error);

        // Handle specific error cases
        if (error.message?.includes('429') || error.message?.includes('rate limit')) {
          toast({
            title: "Too Many Requests",
            description: "Please wait a few minutes before requesting another password reset email.",
            variant: "destructive",
          });
        } else if (error.message?.includes('not found')) {
          toast({
            title: "Error",
            description: "Email address not found. Please check your account settings.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: error.message || "Failed to send reset email. Please try again later.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Email Sent",
          description: `Password reset link has been sent to ${user.email}. Please check your inbox.`,
        });
      }
    } catch (error: any) {
      console.error('Error:', error);

      // Check if it's a rate limit error from the network request
      if (error?.status === 429) {
        toast({
          title: "Rate Limit Exceeded",
          description: "You've requested too many password resets. Please wait 60 minutes before trying again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "An unexpected error occurred. Please try again later.",
          variant: "destructive",
        });
      }
    } finally {
      setSendingResetEmail(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const fetchActivityStats = async () => {
      if (!user?.id) return;

      try {
        // Fetch total analyses count
        const { count: analysesCount } = await supabase
          .from('analysis_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        // Fetch executed trades count
        const { count: tradesCount } = await supabase
          .from('trading_actions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'executed');

        // Fetch rebalances count
        const { count: rebalancesCount } = await supabase
          .from('rebalance_requests')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        setActivityStats({
          totalAnalyses: analysesCount || 0,
          executedTrades: tradesCount || 0,
          rebalances: rebalancesCount || 0
        });
      } catch (error) {
        console.error('Error fetching activity stats:', error);
      }
    };

    fetchActivityStats();
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (!user) {
    return null;
  }

  const tradingMode = apiSettings?.alpaca_paper_trading ? 'Paper Trading' : 'Live Trading';
  const hasAIConfig = !!apiSettings?.ai_api_key;
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
                  <p className="font-medium">{profile?.name || profile?.full_name || 'Not set'}</p>
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
                    {new Date(profile?.created_at || user.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    Account Role
                  </div>
                  <Badge variant={profile?.role?.name === 'admin' ? 'default' : 'secondary'}>
                    {profile?.role?.display_name}
                  </Badge>
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

              <div className="flex flex-col space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Password</p>
                    <p className="text-xs text-muted-foreground">Keep your account secure with a strong password</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowChangePasswordModal(true)}
                      title="Change password if you know your current password"
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Change Password
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSendResetEmail}
                      disabled={sendingResetEmail}
                      title="Send a password reset link to your email (use if you forgot your current password)"
                    >
                      <Mail className="mr-2 h-4 w-4" />
                      {sendingResetEmail ? "Sending..." : "Forgot Password?"}
                    </Button>
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    To update other profile information, please contact support.
                  </AlertDescription>
                </Alert>
              </div>
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
                  <p className="text-2xl font-bold">{activityStats.totalAnalyses}</p>
                  <p className="text-sm text-muted-foreground">Total Analyses</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold">{activityStats.executedTrades}</p>
                  <p className="text-sm text-muted-foreground">Trades Executed</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <p className="text-2xl font-bold">{activityStats.rebalances}</p>
                  <p className="text-sm text-muted-foreground">Rebalances</p>
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

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />
    </div>
  );
}