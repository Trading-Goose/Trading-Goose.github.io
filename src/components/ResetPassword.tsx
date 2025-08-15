import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isInvitation, setIsInvitation] = useState(false);

  useEffect(() => {
    // Handle the password recovery token from the URL
    const handlePasswordRecovery = async () => {
      try {
        // Get the hash from the URL (Supabase sends the token in the hash)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const type = hashParams.get('type');
        const errorCode = hashParams.get('error_code');
        const errorDescription = hashParams.get('error_description');
        
        console.log('ResetPassword - Hash params:', { 
          type, 
          hasToken: !!accessToken,
          errorCode,
          errorDescription,
          fullHash: window.location.hash
        });

        // Check for errors first (expired token, etc.)
        if (errorCode === 'otp_expired' || errorDescription?.includes('expired')) {
          setError('Your password reset link has expired. Please request a new one.');
          setCheckingSession(false);
          setTimeout(() => {
            navigate("/forgot-password");
          }, 3000);
          return;
        }

        if (errorCode || errorDescription) {
          setError(errorDescription || 'Invalid reset link. Please request a new one.');
          setCheckingSession(false);
          setTimeout(() => {
            navigate("/forgot-password");
          }, 3000);
          return;
        }

        // Check if this is a recovery or invite link
        if ((type === 'recovery' || type === 'invite') && accessToken) {
          console.log(`Valid ${type} token found`);
          // Set invitation flag if this is an invite
          if (type === 'invite') {
            setIsInvitation(true);
          }
          // The recovery/invite token is valid, allow password reset
          setIsValidSession(true);
          setCheckingSession(false);
          return;
        }

        // Also check for existing session (for users who are already in password reset mode)
        const { data: { session } } = await supabase.auth.getSession();
        console.log('Current session:', session);
        
        // If we have a session, we can allow password reset
        // This happens after the user has clicked the email link and Supabase has created a session
        if (session) {
          setIsValidSession(true);
        } else {
          // No valid session or recovery token
          console.log('No valid session or recovery token, redirecting to forgot password');
          setError('Invalid or missing reset link. Please request a new one.');
          setTimeout(() => {
            navigate("/forgot-password");
          }, 3000);
        }
      } catch (error) {
        console.error('Error checking recovery session:', error);
        setError('An error occurred. Please request a new reset link.');
        setTimeout(() => {
          navigate("/forgot-password");
        }, 3000);
      } finally {
        setCheckingSession(false);
      }
    };

    handlePasswordRecovery();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
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
      const { error } = await supabase.auth.updateUser({ 
        password: password 
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        
        if (isInvitation) {
          // For invitations, keep user logged in and redirect to dashboard
          setTimeout(() => {
            navigate("/dashboard");
          }, 3000);
        } else {
          // For password resets, sign out and redirect to login
          await supabase.auth.signOut();
          setTimeout(() => {
            navigate("/login");
          }, 3000);
        }
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Password update error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while checking session or error state
  if (checkingSession || error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <div className="flex flex-col items-center space-y-4">
              {error ? (
                <>
                  <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-2">
                    <AlertCircle className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Reset Link Error</h3>
                  <p className="text-muted-foreground text-center">{error}</p>
                  <p className="text-sm text-muted-foreground">Redirecting to password reset request...</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-muted-foreground">Verifying reset link...</p>
                </>
              )}
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
            <CardTitle>{isInvitation ? 'Account Setup Complete' : 'Password Reset Successful'}</CardTitle>
            <CardDescription className="mt-2">
              {isInvitation ? 'Your account has been set up successfully' : 'Your password has been updated successfully'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                {isInvitation ? 'Welcome to TradingGoose! Redirecting to dashboard...' : 'You can now log in with your new password. Redirecting to login page...'}
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
          <CardTitle>{isInvitation ? 'Set Your Password' : 'Reset Your Password'}</CardTitle>
          <CardDescription>
            {isInvitation ? 'Welcome! Please set your password to complete your account setup.' : 'Enter your new password below'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
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
              <Label htmlFor="confirm-password">Confirm New Password</Label>
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
              disabled={isLoading || !password || !confirmPassword}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isInvitation ? 'Setting password...' : 'Updating password...'}
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  {isInvitation ? 'Set Password' : 'Reset Password'}
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}