import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, UserPlus, AlertCircle, CheckCircle, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-supabase";
import { useAdminVerification } from "@/hooks/useAdminVerification";

export default function AdminInvitations() {
  const navigate = useNavigate();
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const { isAdmin, role, isLoading: isLoadingAdmin, error: adminError } = useAdminVerification();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Debug logging
  console.log('AdminInvitations - Auth status:', {
    isAuthenticated,
    userEmail: user?.email,
    isAdmin,
    role,
    authLoading,
    isLoadingAdmin,
    adminError
  });

  // Use effect for navigation to avoid render-time state updates
  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  if (!isAuthenticated && !authLoading) {
    return null;
  }

  // Show loading state while auth or admin check is loading
  if (authLoading || isLoadingAdmin) {
    console.log('Still loading - authLoading:', authLoading, 'isLoadingAdmin:', isLoadingAdmin);
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Verifying Access</h2>
              <p className="text-muted-foreground">Checking admin permissions...</p>
              <p className="text-xs text-muted-foreground mt-2">
                {authLoading ? 'Loading authentication...' : 'Verifying admin status...'}
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Show error if admin verification failed
  if (adminError) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-8 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Verification Error</h2>
              <p className="text-muted-foreground mb-4">{adminError}</p>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!isAdmin) {
    console.log('Access denied - isAdmin:', isAdmin, 'role:', role);
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-8 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You don't have permission to access this page.</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => navigate('/dashboard')}
              >
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No access token available');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invitation`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            name: name || undefined,
          }),
        }
      );

      const result = await response.json();
      console.log('Send invitation response:', { status: response.status, result });

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      if (result.success) {
        setSuccessMessage(`Invitation sent successfully to ${email}! They will receive an email with a magic link to join.`);
        setEmail("");
        setName("");
      } else {
        setError(result.error || "Failed to send invitation");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred. Please try again.");
      console.error("Invitation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const copyInviteInstructions = () => {
    const instructions = `
How to send invitations:

1. Enter the user's email address
2. Optionally enter their name
3. Click "Send Invitation"
4. The user will receive an email with a magic link
5. When they click the link, they'll be automatically signed in
6. They can then set up their profile and password

Note: Invitations are sent via Supabase's built-in auth system.
Users don't need to enter invite codes - just click the email link!
    `.trim();

    navigator.clipboard.writeText(instructions);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold">Admin: Send Invitations</h1>
            <p className="text-muted-foreground mt-2">
              Invite new users to join TradingGoose via email
            </p>
            {role && (
              <div className="mt-2">
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  {role.replace('_', ' ').toUpperCase()} ACCESS
                </span>
              </div>
            )}
          </div>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground space-y-2">
                <p>• Enter the user's email address below</p>
                <p>• Supabase will automatically send them a secure invitation email</p>
                <p>• Users click the magic link to automatically sign in</p>
                <p>• No invite codes needed - completely seamless!</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyInviteInstructions}
                className="text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Instructions
              </Button>
            </CardContent>
          </Card>

          {/* Invitation Form */}
          <Card>
            <CardHeader>
              <CardTitle>Send New Invitation</CardTitle>
              <CardDescription>
                The user will receive an email with a magic link to join
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendInvitation} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name (optional)</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    If provided, this will be included in the invitation
                  </p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {successMessage && (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-800">
                      {successMessage}
                    </AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isLoading || !email}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending invitation...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      Send Invitation
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Additional Info */}
          <Card>
            <CardContent className="py-4">
              <div className="text-sm text-muted-foreground space-y-2">
                <h4 className="font-medium text-foreground">Important Notes:</h4>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Invitation emails are sent automatically by Supabase</li>
                  <li>Magic links expire after 24 hours</li>
                  <li>Users can be re-invited if the link expires</li>
                  <li>This replaces the old invite code system</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}