import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, CheckCircle, AlertCircle, Eye, EyeOff, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

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
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const handleInvitation = async () => {
      console.log('InvitationSetup: Processing invitation...');
      
      // Log the full URL for debugging
      console.log('Current URL:', window.location.href);
      console.log('URL Hash:', window.location.hash);
      
      // Check if we have tokens in the hash
      const hash = window.location.hash;
      if (!hash) {
        console.error('No hash found in URL');
        setError('Invalid invitation link - no authentication tokens found');
        setIsProcessing(false);
        setTimeout(() => navigate('/login'), 5000);
        return;
      }

      // Parse hash parameters
      const hashParams = new URLSearchParams(hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const type = hashParams.get('type');
      
      console.log('Token details:', {
        type,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        tokenLength: accessToken?.length
      });

      // Check if this is an invitation
      if (type !== 'invite') {
        console.error('Not an invitation link, type:', type);
        setError('This link is not a valid invitation');
        setIsProcessing(false);
        setTimeout(() => navigate('/login'), 5000);
        return;
      }

      try {
        // For invitation tokens that have been verified by Supabase and redirected here,
        // we should have access_token and refresh_token in the URL hash.
        // We just need to set the session using these tokens.
        
        if (!accessToken || !refreshToken) {
          throw new Error('Missing authentication tokens. Please request a new invitation.');
        }

        console.log('Setting session with provided tokens...');
        
        // First, clear any existing URL hash to prevent Supabase from re-processing it
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        
        const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        
        console.log('setSession result:', { sessionData, setSessionError });
        
        if (setSessionError) {
          console.error('Error setting session:', setSessionError);
          throw new Error(`Failed to authenticate: ${setSessionError.message}`);
        }
        
        if (!sessionData.session || !sessionData.session.user) {
          throw new Error('Session was not established properly');
        }

        console.log('Session established successfully');
        console.log('Authenticated as:', sessionData.session.user.email);
        
        const currentUser = sessionData.session.user;
        setUserEmail(currentUser.email || '');
        
        // Check if user already completed setup directly from the session
        if (currentUser.user_metadata?.name || currentUser.user_metadata?.full_name) {
          console.log('User already has name in metadata, redirecting to dashboard');
          navigate('/dashboard');
          return;
        }

        // Check profile table to see if user already has a profile
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('name, full_name')
            .eq('id', currentUser.id)
            .single();

          if (!profileError && profile && (profile.name || profile.full_name)) {
            console.log('User already has profile, redirecting to dashboard');
            navigate('/dashboard');
            return;
          }
        } catch (err) {
          console.log('No existing profile found, continuing with setup');
        }

        // Update auth store with the session
        useAuth.setState({ 
          session: sessionData.session,
          user: currentUser,
          isAuthenticated: true,
          isLoading: false
        });
        
        // Ready to show setup form
        console.log('Ready for account setup');
        setIsProcessing(false);
        
      } catch (err: any) {
        console.error('Invitation processing error:', err);
        
        // Provide user-friendly error messages
        if (err.message?.includes('expired')) {
          setError('Your invitation link has expired. Please contact your administrator for a new invitation.');
        } else if (err.message?.includes('invalid')) {
          setError('This invitation link is invalid or has already been used. Please contact your administrator.');
        } else if (err.message?.includes('JWT')) {
          setError('The invitation token is malformed. Please request a new invitation.');
        } else {
          setError(err.message || 'Unable to process invitation. Please try again or contact support.');
        }
        
        setIsProcessing(false);
        setTimeout(() => navigate('/login'), 5000);
      }
    };

    handleInvitation();
  }, [navigate]);

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

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Update or create profile
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

        // Update invitation status if invitation_id is in metadata
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
      
      // Initialize auth system now that setup is complete
      await useAuth.getState().initialize();
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
      
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Setup error:", err);
      setIsLoading(false);
    }
  };

  // Show loading while processing
  if (isProcessing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Processing invitation...</p>
              <p className="text-xs text-muted-foreground">Authenticating your account</p>
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