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
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      console.log('Waiting for auth to load...');
      return;
    }

    // Check if we have a valid invitation session
    const checkInvitation = async () => {
      console.log('Checking invitation status...');
      
      // Check URL for invitation type
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const type = hashParams.get('type');
      
      if (type !== 'invite') {
        console.log('Not an invitation link');
        setError('Invalid invitation link');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      if (!isAuthenticated || !user) {
        console.log('No authenticated user found');
        setError('Invalid or expired invitation');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      console.log('Valid invitation session for:', user.email);

      // Check if user has already completed setup
      if (user.user_metadata?.name || user.user_metadata?.full_name) {
        console.log('User already completed setup, redirecting to dashboard');
        navigate('/dashboard');
        return;
      }

      // Check if this user already has a profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, full_name')
        .eq('id', user.id)
        .single();
        
      if (profile?.name || profile?.full_name) {
        console.log('User already has profile, redirecting to dashboard');
        navigate('/dashboard');
        return;
      }

      console.log('Ready to show setup form');
    };

    checkInvitation();
  }, [authLoading, isAuthenticated, user, navigate]);

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

  // Show loading while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Processing invitation...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show error if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <div className="flex flex-col items-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-2">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold">Invalid Invitation</h3>
              <p className="text-muted-foreground text-center">
                {error || "This invitation link is invalid or has expired."}
              </p>
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
            {user?.email && (
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={user.email}
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