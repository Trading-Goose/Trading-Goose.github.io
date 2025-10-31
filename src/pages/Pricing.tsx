import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  X,
  BotMessageSquare,
  Crown,
  Zap,
  Bolt,
  Loader2,
  AlertCircle
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { supabase } from "@/lib/supabase";
import { useAuth, isSessionValid } from "@/lib/auth";
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
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { hasSubscription, subscriptionStatus, variantName } = useSubscription();
  const { hasRole, getPrimaryRole, userRoles, roleDetails, isLoading: rbacLoading } = useRBAC();
  const { toast } = useToast();

  const [roles, setRoles] = useState<RoleData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [roleExpiration, setRoleExpiration] = useState<{ expires_at?: string; current_period_end?: string } | null>(null);
  const [roleExpirationLoaded, setRoleExpirationLoaded] = useState(false);
  const [primaryRole, setPrimaryRole] = useState<any>(null);
  const [primaryRoleLoaded, setPrimaryRoleLoaded] = useState(false);
  
  // Single source of truth for loading state
  const isDataLoading = authLoading || rbacLoading || (isAuthenticated && !roleExpirationLoaded) || (isAuthenticated && !primaryRoleLoaded);
  
  // Set primary role when auth and RBAC data is ready
  useEffect(() => {
    if (!authLoading && !rbacLoading) {
      if (isAuthenticated && userRoles.length > 0) {
        const role = getPrimaryRole();
        setPrimaryRole(role);
        setPrimaryRoleLoaded(true);
        console.log('[Pricing] Primary role set:', role);
      } else if (isAuthenticated && userRoles.length === 0) {
        // User is authenticated but has no roles yet
        setPrimaryRole(null);
        setPrimaryRoleLoaded(true);
      } else if (!isAuthenticated) {
        setPrimaryRole(null);
        setPrimaryRoleLoaded(true);
      }
    }
  }, [authLoading, rbacLoading, isAuthenticated, userRoles]);


  // Fetch role expiration if authenticated
  useEffect(() => {
    const fetchRoleExpiration = async () => {
      // Only fetch after auth is determined
      if (authLoading) return;
      
      // If not authenticated, mark as complete immediately
      if (!isAuthenticated) {
        setRoleExpirationLoaded(true);
        return;
      }
      
      if (!user?.id) {
        // No user data yet
        return;
      }
      
      try {
        // Get the user's primary role with expiration info
        const { data, error } = await supabase
          .from('user_roles')
          .select(`
            expires_at,
            current_period_end,
            roles!inner(
              priority,
              name
            )
          `)
          .eq('user_id', user.id)
          .eq('is_active', true);

        console.log('[Pricing] Role expiration data:', data);
        
        if (!error && data && data.length > 0) {
          // Sort by priority (highest first) to get the primary role
          const sortedRoles = data.sort((a, b) => (b.roles?.priority || 0) - (a.roles?.priority || 0));
          const highestPriorityRole = sortedRoles[0];
          
          setRoleExpiration({
            expires_at: highestPriorityRole?.expires_at,
            current_period_end: highestPriorityRole?.current_period_end
          });
        } else {
          // Set empty object to indicate we checked but found no expiration
          setRoleExpiration({});
        }
      } catch (error) {
        console.error('[Pricing] Error fetching role expiration:', error);
        setRoleExpiration({});
      } finally {
        setRoleExpirationLoaded(true);
      }
    };

    fetchRoleExpiration();
  }, [user, isAuthenticated, authLoading]);

  // Fetch all roles except admin
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('[Pricing] Fetching roles from database...');
        
        // Fetch roles without authentication requirement
        // Using anon key which should have read access to roles table
        const { data, error: fetchError } = await supabase
          .from('roles')
          .select('*')
          .neq('name', 'admin') // Exclude admin role
          .order('priority', { ascending: true }); // Lower priority first (free plan first)

        console.log('[Pricing] Roles fetch result:', { data, error: fetchError });

        if (fetchError) {
          console.error('[Pricing] Error fetching roles:', fetchError);
          throw fetchError;
        }

        if (!data || data.length === 0) {
          console.warn('[Pricing] No roles found in database');
          setError('No pricing plans available at this time');
          return;
        }

        // Mark pro as most popular if it exists
        const rolesWithPopular = data.map(role => ({
          ...role,
          is_most_popular: role.name === 'pro'
        }));

        console.log('[Pricing] Roles loaded successfully:', rolesWithPopular.length);
        setRoles(rolesWithPopular);
      } catch (err) {
        console.error('[Pricing] Error in fetchRoles:', err);
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

  // Check if a plan is available for selection
  const isPlanAvailable = (role: RoleData): boolean => {
    // Don't make any decisions while loading
    if (isDataLoading) return false;
    
    // If user is not authenticated, all plans are available
    if (!isAuthenticated) return true;
    
    // If it's the user's current plan, it's always available
    if (primaryRole?.name === role.name) return true;
    
    // For permanent roles: expires_at should be checked (not current_period_end which is subscription-related)
    // A permanent role has no expires_at or an invalid expires_at
    const expirationDate = roleExpiration?.expires_at;
    let hasValidExpiration = false;
    
    if (expirationDate) {
      // Check if it's a valid date
      const date = new Date(expirationDate);
      // Check if date is valid and not some placeholder like --/--/-- or invalid date
      hasValidExpiration = !isNaN(date.getTime()) && date.getTime() > 0;
    }
    
    // If user has a permanent role (no valid expires_at) and it's not the default role
    // then other plans are unavailable
    if (!hasValidExpiration && primaryRole && primaryRole.name !== 'default') {
      return false;
    }
    
    // Otherwise, plan is available
    return true;
  };

  // Handle subscription selection
  const handleSelectPlan = async (role: RoleData) => {
    // If user is not authenticated, redirect to login page
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Check if plan is available
    if (!isPlanAvailable(role)) {
      toast({
        title: "Plan Unavailable",
        description: "This plan is not available for your account type. Please contact support if you need assistance.",
        variant: "destructive"
      });
      return;
    }

    // Use the state variable primaryRole instead of calling getPrimaryRole()

    // If user has an active subscription and wants to switch to a different plan
    if (hasSubscription && primaryRole?.name !== role.name) {
      setIsProcessing(role.id);
      try {
        // Check session validity before proceeding
        if (!isSessionValid()) {
          console.error('[Pricing] Session invalid');
          toast({
            title: "Authentication Required",
            description: "Please log in to manage your subscription",
            variant: "destructive"
          });
          navigate('/login');
          setIsProcessing(null);
          return;
        }

        console.log('[Pricing] Session valid, proceeding with plan switch');

        // Get the appropriate Stripe price ID for the target plan
        const targetPriceId = billingCycle === 'yearly'
          ? role.stripe_price_id_yearly
          : role.stripe_price_id_monthly;

        // If switching to free plan, send user to billing portal to manage cancellation
        if (!role.price_monthly || role.price_monthly === 0) {
          const { data: result, error: invokeError } = await supabase
            .functions.invoke('create-smart-session', {
              body: {
                action: 'manage',
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
                success_url: `${window.location.origin}/profile?plan_changed=true`,
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
          // Check session validity before proceeding
          if (!isSessionValid()) {
            console.error('[Pricing] Session invalid for cancellation');
            toast({
              title: "Authentication Required",
              description: "Please log in to manage your subscription",
              variant: "destructive"
            });
            navigate('/login');
            setIsProcessing(null);
            return;
          }

          // Open billing portal so the user can manage their cancellation
          const { data: sessionData, error: sessionError } = await supabase
            .functions.invoke('create-smart-session', {
              body: {
                action: 'manage',
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
      // Check session validity before proceeding
      if (!isSessionValid()) {
        console.error('[Pricing] Session invalid for checkout');
        toast({
          title: "Authentication Required",
          description: "Please log in to subscribe",
          variant: "destructive"
        });
        navigate('/login');
        setIsProcessing(null);
        return;
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
    // Don't calculate anything while loading
    if (isDataLoading) return "";
    
    if (isProcessing === role.id) return "Processing...";

    // If user is not authenticated, always show "Get Started"
    if (!isAuthenticated) {
      return "Get Started";
    }

    // Only show "Current Plan" for the user's primary (highest priority) role
    const isCurrentPlan = primaryRole?.name === role.name;

    if (isCurrentPlan) {
      return "Current Plan";
    }

    // Check if plan is available
    if (!isPlanAvailable(role)) {
      return "Unavailable";
    }

    // If user has a subscription, show "Switch to [Role Display Name]"
    if (hasSubscription) {
      const roleDisplayName = role.display_name || role.name;
      return `Switch to ${roleDisplayName}`;
    }

    // For users without subscription, just show "Get Started"
    return "Get Started";
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
            <h1 className="text-4xl font-bold mb-4">Choose Your Plan</h1>
            <p className="text-xl text-muted-foreground mb-8">
              Unlock advanced AI-powered Portfolio management features with our flexible pricing plans
            </p>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="pb-12 px-6">
          <div className="container mx-auto">
            <div className={`grid gap-8 ${roles.length === 1 ? 'max-w-md mx-auto' :
              roles.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' :
                roles.length === 3 ? 'md:grid-cols-3 max-w-6xl mx-auto' :
                  'md:grid-cols-2 lg:grid-cols-4'
              }`}>
              {roles.map((role) => {
                // Don't calculate anything while loading
                const isCurrentPlan = !isDataLoading && isAuthenticated && primaryRole?.name === role.name;
                const isAvailable = !isDataLoading ? isPlanAvailable(role) : false;
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
                    className={`relative overflow-hidden transition-all hover:shadow-lg flex flex-col ${isCurrentPlan ? 'ring-2 ring-[#fc0] border-[#fc0]' : role.color ? '' : 'border-border'
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
                      {isDataLoading ? (
                        <Button
                          className="w-full"
                          variant="outline"
                          style={role.color ? {
                            borderColor: role.color,
                            color: role.color,
                            backgroundColor: `${role.color}08`
                          } : {}}
                          disabled={true}
                        >
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Checking Availability...
                        </Button>
                      ) : isCurrentPlan ? (
                        <div className="w-full text-center py-2">
                          <span className="text-[#fc0] font-semibold text-lg">
                            Current Plan
                          </span>
                        </div>
                      ) : !isAvailable ? (
                        <div className="w-full text-center py-2">
                          <span 
                            className="font-semibold text-lg"
                            style={{ 
                              color: role.color || '#6b7280',
                              opacity: 0.5
                            }}
                          >
                            Unavailable
                          </span>
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
                <Bolt className="h-8 w-8 mx-auto mb-2 text-primary" />
                <h3 className="font-semibold mb-1">Flexibility</h3>
                <p className="text-sm text-muted-foreground">
                  Flexible Agent configurations with personalized risk settings
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
                <BotMessageSquare className="h-8 w-8 mx-auto mb-2 text-primary" />
                <h3 className="font-semibold mb-1">Support</h3>
                <p className="text-sm text-muted-foreground">
                  Open support ticket through our server support channel
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
