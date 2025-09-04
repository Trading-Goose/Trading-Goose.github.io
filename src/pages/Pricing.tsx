import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  X,
  Sparkles,
  Crown,
  Zap,
  Shield,
  Loader2,
  AlertCircle
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "@/hooks/useSubscription";
import { useRBAC } from "@/hooks/useRBAC";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface RoleData {
  id: string;
  name: string;
  display_name: string;
  description: string;
  priority: number;
  color?: string;
  icon_url?: string;
  price_monthly?: number;
  price_yearly?: number;
  features?: string[];
  stripe_price_id_monthly?: string;
  stripe_price_id_yearly?: string;
  stripe_product_id?: string;
  is_most_popular?: boolean;
}

export default function Pricing() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { hasSubscription, subscriptionStatus, variantName } = useSubscription();
  const { hasRole, getPrimaryRole, userRoles, roleDetails } = useRBAC();
  const { toast } = useToast();
  
  // Debug logging
  const primaryRole = getPrimaryRole();
  console.log('[Pricing] Primary role:', primaryRole);
  console.log('[Pricing] userRoles:', userRoles);
  console.log('[Pricing] roleDetails:', roleDetails);
  
  const [roles, setRoles] = useState<RoleData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Fetch all roles except admin
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('roles')
          .select('*')
          .neq('name', 'admin') // Exclude admin role
          .order('priority', { ascending: true }); // Lower priority first (free plan first)

        if (fetchError) throw fetchError;

        // Mark pro as most popular if it exists
        const rolesWithPopular = (data || []).map(role => ({
          ...role,
          is_most_popular: role.name === 'pro'
        }));

        setRoles(rolesWithPopular);
      } catch (err) {
        console.error('Error fetching roles:', err);
        setError(err instanceof Error ? err.message : 'Failed to load pricing plans');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoles();
  }, []);

  // Calculate savings for yearly pricing
  const calculateSavings = (monthly?: number, yearly?: number) => {
    if (!monthly || !yearly) return 0;
    const yearlyFromMonthly = monthly * 12;
    return Math.round(((yearlyFromMonthly - yearly) / yearlyFromMonthly) * 100);
  };

  // Handle subscription selection
  const handleSelectPlan = async (role: RoleData) => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const primaryRole = getPrimaryRole();
    
    // If user has an active subscription and wants to switch to a different plan
    if (hasSubscription && primaryRole?.name !== role.name) {
      setIsProcessing(role.id);
      try {
        // Ensure we have a valid session and refresh if needed
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('[Pricing] Session error:', sessionError);
          toast({
            title: "Session Error",
            description: "Please refresh the page and try again",
            variant: "destructive"
          });
          setIsProcessing(null);
          return;
        }
        
        if (!session) {
          console.error('[Pricing] No session found, attempting to refresh...');
          
          // Try to refresh the session
          const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
          
          if (refreshError || !refreshedSession) {
            console.error('[Pricing] Session refresh failed:', refreshError);
            toast({
              title: "Authentication Required",
              description: "Please log in to manage your subscription",
              variant: "destructive"
            });
            navigate('/login');
            setIsProcessing(null);
            return;
          }
          
          console.log('[Pricing] Session refreshed successfully');
        }
        
        console.log('[Pricing] Session valid, proceeding with plan switch');

        // Get the appropriate Stripe price ID for the target plan
        const targetPriceId = billingCycle === 'yearly' 
          ? role.stripe_price_id_yearly 
          : role.stripe_price_id_monthly;

        // If switching to free plan, handle cancellation
        if (!role.price_monthly || role.price_monthly === 0) {
          const { data: result, error: invokeError } = await supabase
            .functions.invoke('create-smart-session', {
              body: {
                action: 'cancel',
                cancel_url: `${window.location.origin}/pricing`
              }
            });

          if (invokeError) throw invokeError;
          
          if (result?.url) {
            window.location.href = result.url;
          } else {
            throw new Error(result?.error || 'Failed to create portal session');
          }
        } else if (targetPriceId) {
          // Switch to a different paid plan
          const { data: result, error: invokeError } = await supabase
            .functions.invoke('create-smart-session', {
              body: {
                action: 'switch_plan',
                price_id: targetPriceId,
                success_url: `${window.location.origin}/dashboard?plan_changed=true`,
                cancel_url: `${window.location.origin}/pricing`
              }
            });

          if (invokeError) throw invokeError;
          
          if (result?.url) {
            window.location.href = result.url;
          } else {
            throw new Error(result?.error || 'Failed to create plan switch session');
          }
        } else {
          toast({
            title: "Plan Not Available",
            description: "This plan is not yet configured for subscriptions.",
            variant: "destructive"
          });
        }
      } catch (error: any) {
        console.error('[Pricing] Portal error:', error);
        toast({
          title: "Error",
          description: error.message || "Failed to switch plans",
          variant: "destructive"
        });
      } finally {
        setIsProcessing(null);
      }
      return;
    }
    
    // If user clicks on their current plan, just show a message
    if (hasSubscription && primaryRole?.name === role.name) {
      toast({
        title: "Current Plan",
        description: "You're already on this plan.",
      });
      return;
    }

    // If it's the free/default plan
    if (!role.price_monthly || role.price_monthly === 0) {
      // Check if user has an active subscription to cancel
      if (hasSubscription && subscriptionStatus === 'active') {
        setIsProcessing(role.id);
        try {
          // Ensure we have a valid session before calling edge function
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            await supabase.auth.refreshSession();
          }
          
          // Use smart session to handle cancellation
          const { data: sessionData, error: sessionError } = await supabase
            .functions.invoke('create-smart-session', {
              body: {
                action: 'cancel',
                cancel_url: window.location.href
              }
            });

          if (sessionError) throw sessionError;

          if (sessionData?.url) {
            window.location.href = sessionData.url;
          } else {
            throw new Error('No portal URL received');
          }
        } catch (err) {
          console.error('Error creating portal session:', err);
          toast({
            title: "Error",
            description: "Failed to open billing portal. Please try again.",
            variant: "destructive"
          });
        } finally {
          setIsProcessing(null);
        }
      } else {
        toast({
          title: "Free Plan",
          description: "You're already on the free plan.",
        });
      }
      return;
    }

    // Get the appropriate Stripe price ID
    const priceId = billingCycle === 'yearly' 
      ? role.stripe_price_id_yearly 
      : role.stripe_price_id_monthly;

    if (!priceId) {
      toast({
        title: "Plan Not Available",
        description: "This plan is not yet configured for subscriptions.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(role.id);

    try {
      // Ensure we have a valid session before calling edge function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          throw new Error('Session expired. Please log in again.');
        }
      }
      
      // Use smart session to handle all subscription operations
      const { data: sessionData, error: sessionError } = await supabase
        .functions.invoke('create-smart-session', {
          body: {
            price_id: priceId,
            success_url: `${window.location.origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: window.location.href
          }
        });

      if (sessionError) throw sessionError;

      if (sessionData?.url) {
        // Redirect to Stripe Checkout or Customer Portal
        window.location.href = sessionData.url;
      } else {
        throw new Error('No session URL received');
      }
    } catch (err) {
      console.error('Error creating session:', err);
      toast({
        title: "Error",
        description: "Failed to start checkout process. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(null);
    }
  };

  // Get button text based on current subscription
  const getButtonText = (role: RoleData) => {
    if (isProcessing === role.id) return "Processing...";
    
    const primaryRole = getPrimaryRole();
    
    // Only show "Current Plan" for the user's primary (highest priority) role
    const isCurrentPlan = primaryRole?.name === role.name;
    
    if (isCurrentPlan) {
      return "Current Plan";
    }
    
    // If user has a subscription, show "Switch to [Role Display Name]"
    if (hasSubscription) {
      const roleDisplayName = role.display_name || role.name;
      return `Switch to ${roleDisplayName}`;
    }
    
    // For users without subscription, just show "Get Started"
    return "Get Started";
  };

  // Get default icon based on role name if no icon_url
  const getDefaultIcon = (roleName: string) => {
    switch (roleName.toLowerCase()) {
      case 'pro':
        return Crown;
      case 'premium':
        return Sparkles;
      case 'enterprise':
        return Zap;
      default:
        return Shield;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-6 py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-6 py-12">
          <Alert variant="destructive" className="max-w-md mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-12 px-6">
          <div className="container mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4">Choose Your Trading Plan</h1>
            <p className="text-xl text-muted-foreground mb-8">
              Unlock advanced AI-powered trading features with our flexible pricing plans
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="pb-12 px-6">
          <div className="container mx-auto">
            <div className={`grid gap-8 ${
              roles.length === 1 ? 'max-w-md mx-auto' :
              roles.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' :
              roles.length === 3 ? 'md:grid-cols-3 max-w-6xl mx-auto' :
              'md:grid-cols-2 lg:grid-cols-4'
            }`}>
              {roles.map((role) => {
                const Icon = role.icon_url ? null : getDefaultIcon(role.name);
                // Only show "Current Plan" badge for the user's primary (highest priority) role
                const isCurrentPlan = primaryRole?.name === role.name;
                const savings = calculateSavings(role.price_monthly, role.price_yearly);
                
                // Create custom styles based on role color
                const customStyle = role.color ? {
                  borderColor: `${role.color}40`, // 25% opacity for border
                  backgroundColor: `${role.color}08` // 5% opacity for background
                } : {};

                const headerStyle = role.color ? {
                  backgroundColor: `${role.color}15` // 10% opacity for header
                } : {};

                return (
                  <Card 
                    key={role.id} 
                    className={`relative overflow-hidden transition-all hover:shadow-lg flex flex-col ${
                      isCurrentPlan ? 'ring-2 ring-[#fc0] border-[#fc0]' : role.color ? '' : 'border-border'
                    }`}
                    style={isCurrentPlan ? {
                      backgroundColor: 'rgba(255, 204, 0, 0.03)',
                      borderColor: '#fc0'
                    } : customStyle}
                  >
                    {/* Current Plan Badge */}
                    {isCurrentPlan && (
                      <div className="absolute top-4 right-4 z-10">
                        <Badge className="border border-[#fc0]/30 bg-[#fc0]/10 text-[#fc0] font-semibold shadow-sm">
                          <span className="flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            Current
                          </span>
                        </Badge>
                      </div>
                    )}

                    <CardHeader style={isCurrentPlan ? { backgroundColor: 'rgba(255, 204, 0, 0.08)' } : headerStyle}>
                      <div className="flex items-center justify-center mb-4">
                        {role.icon_url ? (
                          <img 
                            src={role.icon_url} 
                            alt={role.display_name}
                            className="h-12 w-12 object-contain"
                            style={{ filter: role.color ? `drop-shadow(0 0 8px ${role.color}40)` : undefined }}
                          />
                        ) : Icon ? (
                          <div 
                            className="p-3 rounded-lg"
                            style={isCurrentPlan ? {
                              backgroundColor: 'rgba(255, 204, 0, 0.2)',
                              color: '#fc0'
                            } : { 
                              backgroundColor: role.color ? `${role.color}20` : undefined,
                              color: role.color || undefined
                            }}
                          >
                            <Icon className="h-8 w-8" />
                          </div>
                        ) : null}
                      </div>
                      <CardTitle className="text-2xl text-center">
                        {role.display_name}
                      </CardTitle>
                      <CardDescription className="text-center">
                        {role.description}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="space-y-6 flex-1 pt-6">
                      {/* Pricing */}
                      <div className="text-center">
                        <div className="flex items-baseline justify-center gap-1">
                          <span className="text-4xl font-bold">
                            ${billingCycle === 'yearly' && role.price_yearly !== null && role.price_yearly !== undefined
                              ? (role.price_yearly / 12).toFixed(2)
                              : (role.price_monthly ?? 0).toFixed(2)}
                          </span>
                          <span className="text-muted-foreground">/month</span>
                        </div>
                        {billingCycle === 'yearly' && role.price_yearly !== null && role.price_yearly !== undefined && savings > 0 && (
                          <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                            Save {savings}% with yearly billing
                          </p>
                        )}
                        {billingCycle === 'yearly' && role.price_yearly !== null && role.price_yearly !== undefined && role.price_yearly > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Billed ${role.price_yearly.toFixed(2)} annually
                          </p>
                        )}
                      </div>

                      <Separator />

                      {/* Features */}
                      <div className="space-y-3">
                        {role.features && Array.isArray(role.features) ? (
                          role.features.map((feature, index) => (
                            <div key={index} className="flex items-start gap-2">
                              <Check 
                                className="h-5 w-5 shrink-0 mt-0.5" 
                                style={{ color: role.color || undefined }}
                              />
                              <span className="text-sm">{feature}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground text-center">
                            No features configured
                          </div>
                        )}
                      </div>
                    </CardContent>

                    <CardFooter className="mt-auto">
                      {isCurrentPlan ? (
                        <div className="w-full text-center py-2">
                          <span className="text-[#fc0] font-semibold text-lg">Current Plan</span>
                        </div>
                      ) : (
                        <Button
                          className="w-full"
                          variant="outline"
                          style={role.color ? {
                            borderColor: role.color,
                            color: role.color,
                            backgroundColor: `${role.color}08`
                          } : {}}
                          disabled={isProcessing === role.id}
                          onClick={() => handleSelectPlan(role)}
                          onMouseEnter={(e) => {
                            if (role.color && !isProcessing) {
                              e.currentTarget.style.backgroundColor = `${role.color}15`;
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (role.color && !isProcessing) {
                              e.currentTarget.style.backgroundColor = `${role.color}08`;
                            }
                          }}
                        >
                          {isProcessing === role.id && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          )}
                          {getButtonText(role)}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ or Additional Info Section */}
        <section className="py-12 px-6 border-t">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-bold mb-4">All Plans Include</h2>
            <div className="grid md:grid-cols-3 gap-6 mt-8">
              <div>
                <Shield className="h-8 w-8 mx-auto mb-2 text-primary" />
                <h3 className="font-semibold mb-1">Secure Trading</h3>
                <p className="text-sm text-muted-foreground">
                  Bank-level encryption and secure API connections
                </p>
              </div>
              <div>
                <Zap className="h-8 w-8 mx-auto mb-2 text-primary" />
                <h3 className="font-semibold mb-1">Real-time Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  Live market data and instant AI insights
                </p>
              </div>
              <div>
                <Sparkles className="h-8 w-8 mx-auto mb-2 text-primary" />
                <h3 className="font-semibold mb-1">24/7 Support</h3>
                <p className="text-sm text-muted-foreground">
                  Open support ticket through Discord server
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}