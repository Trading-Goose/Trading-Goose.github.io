import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, CheckCircle, AlertCircle, Eye, EyeOff, User } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function InvitationSetup() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const setupInvitation = async () => {
      console.log('InvitationSetup component mounted');
      if (!mounted) return;
      
      setCheckingSession(true);
      
      try {
        console.log('Starting invitation setup process...');
        // Get the hash from the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        
        console.log('InvitationSetup - URL params:', { 
          type, 
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          fullHash: window.location.hash
        });

        // Verify this is an invitation token
        if (type !== 'invite' || !accessToken) {
          setError('Invalid invitation link');
          setCheckingSession(false);
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        // Wait a moment for any ongoing auth initialization
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Set the session using the tokens
        console.log('Setting session with tokens...');
        let sessionData, sessionError;
        try {
          const result = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || ''
          });
          sessionData = result.data;
          sessionError = result.error;
        } catch (err) {
          console.error('Exception during setSession:', err);
          sessionError = err;
        }

        console.log('setSession result:', { sessionData, sessionError });

        if (sessionError) {
          console.error('Error setting session:', sessionError);
          setError('Invalid or expired invitation link');
          setCheckingSession(false);
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        console.log('Session established successfully');
        
        // Get the user's email from the session
        console.log('Getting user info...');
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        console.log('getUser result:', { user, userError });
        
        if (userError || !user) {
          console.error('Error getting user:', userError);
          setError('Unable to retrieve user information');
          setCheckingSession(false);
          setTimeout(() => navigate('/login'), 3000);
          return;
        }
        
        if (user?.email) {
          setUserEmail(user.email);
          console.log('Invitation for:', user.email);
        }
        
        // Check if user has already completed setup (has a name set)
        console.log('User metadata:', user.user_metadata);
        if (user.user_metadata?.name || user.user_metadata?.full_name) {
          console.log('User already completed setup, redirecting to dashboard');
          navigate('/dashboard');
          return;
        }
        
        // Check if this user already has a profile
        console.log('Checking for existing profile...');
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('name, full_name')
          .eq('id', user.id)
          .single();
        
        console.log('Profile check result:', { profile, profileError });
          
        if (profile?.name || profile?.full_name) {
          console.log('User already has profile, redirecting to dashboard');
          navigate('/dashboard');
          return;
        }
        
        // Successfully processed invitation - show setup form
        console.log('Invitation setup ready for user:', user.email);
        
        if (!mounted) {
          console.log('Component unmounted, aborting');
          return;
        }
        
        // Add a small delay to ensure state updates properly
        setTimeout(() => {
          if (mounted) {
            console.log('Setting checkingSession to false');
            setCheckingSession(false);
          }
        }, 100);
      } catch (error) {
        console.error('Error processing invitation:', error);
        setError('Error processing invitation. Please request a new one.');
        setCheckingSession(false);
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    // Add a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (checkingSession) {
        console.error('Invitation setup timeout - checkingSession still true');
        setError('Setup timeout. Please try again.');
        setCheckingSession(false);
      }
    }, 15000); // 15 second timeout

    setupInvitation();

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, []); // Empty dependency array - only run once on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);

    try {
      // Update user password and metadata
      const { error: updateError } = await supabase.auth.updateUser({ 
        password: password,
        data: { 
          name: name.trim(),
          full_name: name.trim()
        }
      });

      if (updateError) {
        setError(updateError.message);
        setIsLoading(false);
        return;
      }

      // Update or create profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            name: name.trim(),
            full_name: name.trim(),
            updated_at: new Date().toISOString()
          });

        if (profileError) {
          console.error('Profile update error:', profileError);
        }

        // Update invitation status
        const invitationId = user.user_metadata?.invitation_id;
        if (invitationId) {
          await supabase
            .from('invitations')
            .update({
              status: 'confirmed',
              confirmed_at: new Date().toISOString(),
              confirmed_user_id: user.id
            })
            .eq('id', invitationId);
        }
      }

      setSuccess(true);
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
      
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Setup error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while checking session
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Processing invitation...</p>
              <p className="text-xs text-muted-foreground">Setting up your account</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error state
  if (error && !userEmail) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <div className="flex flex-col items-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-2">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Invitation Error</h3>
              <p className="text-muted-foreground text-center">{error}</p>
              <p className="text-sm text-muted-foreground">Redirecting to login...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Welcome to TradingGoose!</CardTitle>
            <CardDescription className="mt-2">
              Your account has been set up successfully
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Redirecting to dashboard...
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete Your Account Setup</CardTitle>
          <CardDescription>
            Welcome! Please set your name and password to complete your account.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {userEmail && (
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={userEmail}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  This email was provided in your invitation
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <div className="relative">
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isLoading}
                />
                <User className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isLoading}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || !name || !password || !confirmPassword}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up account...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Complete Setup
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}