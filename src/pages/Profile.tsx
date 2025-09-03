import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertTriangle,
  LogOut,
  Lock,
  Clock,
  Edit2,
  Check,
  X,
  CreditCard,
  ExternalLink,
  Sparkles,
  Zap,
  CheckCircle,
  Loader2
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useRBAC } from "@/hooks/useRBAC";
import { useSubscription } from "@/hooks/useSubscription";
import { format } from "date-fns";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChangePasswordModal from "@/components/ChangePasswordModal";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, apiSettings, logout, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { getPrimaryRole } = useRBAC();
  const {
    hasSubscription,
    subscriptionStatus,
    variantName,
    currentPeriodEnd,
    customerPortalUrl,
    openCustomerPortal,
    formatPeriodEnd,
    getSubscriptionBadgeColor
  } = useSubscription();
  const [activityStats, setActivityStats] = useState({
    totalAnalyses: 0,
    executedTrades: 0,
    rebalances: 0
  });
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [roleExpiration, setRoleExpiration] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(profile?.name || '');
  const [isSavingName, setIsSavingName] = useState(false);

  // Discord integration state
  const [isLinking, setIsLinking] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [discordIdentity, setDiscordIdentity] = useState<any>(null);

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

  useEffect(() => {
    const fetchRoleExpiration = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('expires_at')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .single();

        if (!error && data) {
          setRoleExpiration(data.expires_at);
        }
      } catch (error) {
        console.error('Error fetching role expiration:', error);
      }
    };

    fetchRoleExpiration();
  }, [user]);

  // Update edited name when profile changes
  useEffect(() => {
    setEditedName(profile?.name || '');
  }, [profile]);

  // Fetch Discord identity on mount
  useEffect(() => {
    const fetchDiscordIdentity = async () => {
      if (!user) return;

      try {
        // Get user's linked identities
        const { data: identities, error } = await supabase.auth.getUserIdentities();

        if (!error && identities) {
          const discord = identities.identities?.find((id: any) => id.provider === 'discord');
          setDiscordIdentity(discord);

          // If user has Discord linked, ensure the Discord ID is saved
          if (discord && discord.provider_id) {
            // First try to call the sync function to ensure Discord ID is saved
            console.log('Syncing Discord ID for user:', user.id);
            const { data: syncResult, error: syncError } = await supabase.rpc('sync_discord_id_for_user', {
              user_uuid: user.id
            });

            if (syncError) {
              console.log('RPC sync not available, trying direct update:', syncError);

              // Fallback: Check if discord_id needs to be updated directly
              const { data: currentProfile } = await supabase
                .from('profiles')
                .select('discord_id')
                .eq('id', user.id)
                .single();

              if (!currentProfile?.discord_id || currentProfile.discord_id !== discord.provider_id) {
                console.log('Updating Discord ID in profile:', discord.provider_id);
                const { error: updateError } = await supabase
                  .from('profiles')
                  .update({ discord_id: discord.provider_id })
                  .eq('id', user.id);

                if (updateError) {
                  console.error('Failed to update Discord ID:', updateError);
                } else {
                  console.log('Discord ID saved successfully');
                  // Reload the page to refresh profile data
                  window.location.reload();
                }
              }
            } else {
              console.log('Discord ID sync successful:', syncResult);
              // Check if we need to reload
              const { data: updatedProfile } = await supabase
                .from('profiles')
                .select('discord_id')
                .eq('id', user.id)
                .single();

              if (updatedProfile?.discord_id && !profile?.discord_id) {
                // Discord ID was just synced, reload to show it
                window.location.reload();
              }
            }
          }
        }
      } catch (error) {
        console.error('Error fetching Discord identity:', error);
      }
    };

    fetchDiscordIdentity();
  }, [user]);

  // Handle Discord redirect callback
  useEffect(() => {
    const handleDiscordCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const linkType = params.get('discord_link');

      if (!linkType) return;

      // Remove query param to clean URL
      window.history.replaceState({}, '', window.location.pathname);

      // Check if Discord identity was successfully linked
      const { data: identities } = await supabase.auth.getUserIdentities();
      const discordLinked = identities?.identities?.find((id: any) => id.provider === 'discord');

      if (discordLinked) {
        // Success! Discord was linked
        setDiscordIdentity(discordLinked);

        // Save Discord ID to profile using RPC function or direct update
        if (discordLinked.provider_id && user?.id) {
          console.log('Saving Discord ID after linking:', discordLinked.provider_id);

          // Try RPC sync function first
          const { data: syncResult, error: syncError } = await supabase.rpc('sync_discord_id_for_user', {
            user_uuid: user.id
          });

          if (syncError) {
            console.log('RPC sync not available, trying direct update:', syncError);
            // Fallback to direct update
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ discord_id: discordLinked.provider_id })
              .eq('id', user.id);

            if (updateError) {
              console.error('Failed to save Discord ID:', updateError);
            } else {
              console.log('Discord ID saved to profile via direct update');
            }
          } else {
            console.log('Discord ID saved to profile via RPC sync');
          }
        }

        toast({
          title: "Success",
          description: "Discord account linked successfully",
        });

        // Reload to refresh profile data
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        // Linking failed
        console.log('Discord linking failed');
        toast({
          title: "Error",
          description: "Failed to link Discord account. Please try again.",
          variant: "destructive"
        });
      }
    };

    handleDiscordCallback();
  }, [user]);

  // Handle Discord account linking
  const handleLinkDiscord = async () => {
    setIsLinking(true);
    try {
      // Check if user is authenticated first
      if (!user) {
        toast({
          title: "Not Authenticated",
          description: "Please log in to link your Discord account",
          variant: "destructive"
        });
        setIsLinking(false);
        return;
      }

      // Use linkIdentity for manual linking - works with any email
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'discord',
        options: {
          redirectTo: `${window.location.origin}/profile?discord_link=manual`,
          scopes: 'identify guilds' // Only need identify and guilds, not email
        }
      });

      if (error) {
        console.error('Discord linking error:', error);
        
        // Handle specific error cases
        if (error.message?.includes('already linked')) {
          toast({
            title: "Already Linked",
            description: "This Discord account is already linked to another user",
            variant: "destructive"
          });
        } else if (error.message?.includes('rate limit')) {
          toast({
            title: "Too Many Requests",
            description: "Please wait a moment before trying again",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Linking Failed",
            description: error.message || "Failed to link Discord account. Please try again.",
            variant: "destructive"
          });
        }
        setIsLinking(false);
      }
      // If successful, user will be redirected to Discord OAuth
    } catch (error) {
      console.error('Discord linking error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
      setIsLinking(false);
    }
  };

  // Handle Discord account unlinking
  const handleUnlinkDiscord = async () => {
    if (!discordIdentity) return;

    try {
      console.log('Attempting to unlink Discord identity:', discordIdentity);

      // According to Supabase docs, we should pass the entire identity object
      // not just { identity_id: ... }
      const { data, error } = await supabase.auth.unlinkIdentity(discordIdentity);

      if (error) {
        console.error('Unlink error details:', error);
        throw error;
      }

      // Success - identity was unlinked from auth.identities
      console.log('Discord identity unlinked successfully');

      // Clear discord_id from profile database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ discord_id: null })
        .eq('id', user.id);

      if (updateError) {
        console.error('Warning: Failed to clear discord_id from profile:', updateError);
      }

      // Clear local state
      setDiscordIdentity(null);

      toast({
        title: "Success",
        description: "Discord account disconnected successfully"
      });

      // Reload to refresh all data
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (error: any) {
      console.error('Discord unlinking error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect Discord account. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle role sync
  const handleSyncRole = async () => {
    if (!user) return;

    setIsSyncing(true);
    try {
      console.log('Starting Discord role sync for user:', user.id);

      // Check if user has Discord linked
      if (!profile?.discord_id) {
        toast({
          title: "Discord Not Connected",
          description: "Please connect your Discord account first",
          variant: "destructive"
        });
        setIsSyncing(false);
        return;
      }

      // Call edge function to sync Discord role
      // The supabase client will automatically include the auth token
      const { data, error } = await supabase.functions.invoke('discord-role-sync', {
        body: { userId: user.id }
      });

      console.log('Discord role sync response:', { data, error });

      if (error) {
        console.error('Discord role sync error:', error);

        // Parse error message if it's an object
        let errorMessage = "Failed to sync Discord role";
        if (error.message) {
          errorMessage = error.message;
        } else if (typeof error === 'string') {
          errorMessage = error;
        } else if (error.details) {
          errorMessage = error.details;
        }

        toast({
          title: "Sync Failed",
          description: errorMessage,
          variant: "destructive"
        });
      } else if (data?.error) {
        // Sometimes edge functions return errors in the data
        console.error('Discord role sync returned error:', data.error);
        toast({
          title: "Sync Failed",
          description: data.details || data.error || "Failed to sync Discord role",
          variant: "destructive"
        });
      } else {
        console.log('Discord role sync successful:', data);
        toast({
          title: "Success",
          description: "Discord role synced successfully"
        });
      }
    } catch (error) {
      console.error('Role sync error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleSaveName = async () => {
    if (!user?.id || !editedName.trim()) return;

    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: editedName.trim() })
        .eq('id', user.id);

      if (error) {
        toast({
          title: "Error",
          description: "Failed to update name. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Your name has been updated successfully.",
        });
        setIsEditingName(false);
        // Trigger a profile refresh
        window.location.reload();
      }
    } catch (error) {
      console.error('Error updating name:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedName(profile?.name || '');
    setIsEditingName(false);
  };

  if (!user) {
    return null;
  }

  const hasAIConfig = !!apiSettings?.ai_api_key;
  const hasAlpacaConfig = apiSettings?.alpaca_paper_trading
    ? !!apiSettings?.alpaca_paper_api_key
    : !!apiSettings?.alpaca_live_api_key;

  // Only determine trading mode if Alpaca is actually configured
  const tradingMode = hasAlpacaConfig
    ? (apiSettings?.alpaca_paper_trading ? 'Paper Trading' : 'Live Trading')
    : 'Not Configured';

  // Get primary role display name using the same method as Header
  const primaryRole = getPrimaryRole();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <User className="h-8 w-8" />
            Profile
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your account information and preferences
          </p>
        </div>

        <div className="space-y-6">
          {/* Top row: Account Information and Configuration Status */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Account Information */}
            <Card className="lg:col-span-2">
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4" />
                      Name
                    </div>
                    {isEditingName ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          placeholder="Enter your name"
                          className="max-w-[200px]"
                          disabled={isSavingName}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleSaveName}
                          disabled={isSavingName || !editedName.trim()}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          disabled={isSavingName}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{profile?.name || profile?.full_name || 'Not set'}</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setIsEditingName(true)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
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
                      Account ID
                    </div>
                    <p className="font-mono text-sm">{user.id.slice(0, 8)}...</p>
                  </div>
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
                      variant={
                        !hasAlpacaConfig ? "outline" :
                          apiSettings?.alpaca_paper_trading ? "secondary" : "destructive"
                      }
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
          </div>

          {/* Member Info & Connections - Full width */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Account Settings
              </CardTitle>
              <CardDescription>
                Membership status and account connections
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Role and Subscription Grid */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Role Card */}
                <div className="p-4 rounded-lg border bg-card">
                  {primaryRole ? (
                    <div className="flex gap-4">
                      {/* Left side - Role info */}
                      <div className="flex-1 space-y-3 min-w-0">
                        <div>
                          <p className="text-sm font-medium">Account Role</p>
                          <p className="text-xs text-muted-foreground">Your current access level</p>
                        </div>
                        <div className="space-y-2">
                          <Badge
                            variant={primaryRole.name === 'admin' ? 'default' : 'secondary'}
                            className="inline-flex items-center gap-1 text-sm py-1 px-3"
                          >
                            {primaryRole.icon_url ? (
                              <img
                                src={primaryRole.icon_url}
                                alt={primaryRole.display_name}
                                className="h-4 w-4 object-contain"
                              />
                            ) : (
                              <Shield className="h-4 w-4" />
                            )}
                            {primaryRole.display_name}
                          </Badge>
                          {roleExpiration && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>Expires {format(new Date(roleExpiration), 'MMM dd, yyyy')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Right side - Features */}
                      {primaryRole.features && Array.isArray(primaryRole.features) && primaryRole.features.length > 0 && (
                        <>
                          <Separator orientation="vertical" className="h-auto" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-muted-foreground mb-2">Included Features</p>
                            <div className="space-y-1">
                              {primaryRole.features.slice(0, 4).map((feature: string, index: number) => (
                                <div key={index} className="flex items-start gap-1.5">
                                  <Check className="h-3 w-3 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                                  <span className="text-xs text-muted-foreground leading-relaxed">{feature}</span>
                                </div>
                              ))}
                              {primaryRole.features.length > 4 && (
                                <p className="text-xs text-muted-foreground pl-4.5">+{primaryRole.features.length - 4} more</p>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium">Account Role</p>
                      <p className="text-xs text-muted-foreground mb-3">Your current access level</p>
                      <Badge variant="outline" className="w-fit">No Active Role</Badge>
                    </div>
                  )}
                </div>

                {/* Subscription Card */}
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-md bg-primary/10">
                        <CreditCard className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Subscription</p>
                        <p className="text-xs text-muted-foreground">Billing and plan details</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {hasSubscription ? (
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={getSubscriptionBadgeColor()}>
                            <Zap className="h-3 w-3 mr-1" />
                            {variantName}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            {subscriptionStatus}
                          </Badge>
                        </div>
                        {currentPeriodEnd && (
                          <p className="text-xs text-muted-foreground">
                            {subscriptionStatus === 'active'
                              ? `Renews ${formatPeriodEnd(currentPeriodEnd)}`
                              : `Expires ${formatPeriodEnd(currentPeriodEnd)}`
                            }
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No active subscription</p>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => window.location.href = '/pricing'}
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        View Plans
                      </Button>
                      {customerPortalUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={openCustomerPortal}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Billing
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Discord Integration */}
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-md bg-[#5865F2]/10">
                      <svg className="h-4 w-4 text-[#5865F2]" viewBox="0 0 127.14 96.36" fill="currentColor">
                        <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Discord Integration</p>
                      <p className="text-xs text-muted-foreground">Connect for community features</p>
                    </div>
                  </div>
                  {discordIdentity ? (
                    <Badge className="border border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400 font-semibold hover:bg-green-500/20 hover:border-green-500/40 transition-colors cursor-default">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Connected
                      </span>
                    </Badge>
                  ) : (
                    <Badge className="border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-semibold hover:bg-red-500/20 hover:border-red-500/40 transition-colors cursor-default">
                      <span className="flex items-center gap-1">
                        <X className="h-3 w-3" />
                        Disconnected
                      </span>
                    </Badge>
                  )}
                </div>

                {!discordIdentity ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Link your Discord account to sync roles and access exclusive channels in our community server.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full bg-[#5865F2]/5 border-[#5865F2]/30 text-[#5865F2] hover:bg-[#5865F2]/10 hover:text-[#5865F2] hover:border-[#5865F2]/50 dark:bg-[#5865F2]/5 dark:text-[#5865F2] dark:hover:bg-[#5865F2]/10 dark:hover:text-[#5865F2]"
                      onClick={handleLinkDiscord}
                      disabled={isLinking}
                    >
                      {isLinking ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4 mr-2" viewBox="0 0 127.14 96.36" fill="currentColor">
                            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                          </svg>
                          Connect Discord Account
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Discord ID: {(profile as any)?.discord_id || discordIdentity.provider_id}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-[#5865F2]/5 border-[#5865F2]/30 text-[#5865F2] hover:bg-[#5865F2]/10 hover:text-[#5865F2] hover:border-[#5865F2]/50 dark:bg-[#5865F2]/5 dark:text-[#5865F2] dark:hover:bg-[#5865F2]/10 dark:hover:text-[#5865F2]"
                        onClick={handleSyncRole}
                        disabled={isSyncing}
                      >
                        <Zap className="h-4 w-4 mr-1" />
                        {isSyncing ? "Syncing..." : "Sync Role"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 bg-red-500/5 border-red-500/30 text-red-600 dark:bg-red-500/5 dark:text-red-400 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/50"
                        onClick={handleUnlinkDiscord}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Password & Security */}
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-md bg-primary/10">
                      <Lock className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Password & Security</p>
                      <p className="text-xs text-muted-foreground">Manage your account security</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Keep your account secure with a strong password. We recommend updating it regularly.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setShowChangePasswordModal(true)}
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Change Password
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={handleSendResetEmail}
                      disabled={sendingResetEmail}
                    >
                      {sendingResetEmail ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="mr-2 h-4 w-4" />
                          Reset via Email
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Account Activity - Full width */}
          <Card>
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

          {/* Danger Zone - Full width */}
          <Card className="border-red-500/30 bg-red-500/5 dark:bg-red-500/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-lg bg-red-500/10 dark:bg-red-500/5">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <CardTitle className="text-red-600 dark:text-red-400">Danger Zone</CardTitle>
                  <CardDescription>
                    Irreversible actions for your account
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Logging out will end your current session. You'll need to sign in again to access your account.
              </p>
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

      <Footer />
    </div>
  );
}