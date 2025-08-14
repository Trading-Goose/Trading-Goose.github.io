import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import Header from "@/components/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, UserPlus, AlertCircle, CheckCircle, Shield, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminInvitationsNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { 
    isAuthenticated, 
    isAdmin, 
    isLoading: authLoading, 
    user, 
    profile,
    forceAssignAdmin 
  } = useAuth();
  
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [assigningAdmin, setAssigningAdmin] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleAssignAdmin = async () => {
    setAssigningAdmin(true);
    try {
      const result = await forceAssignAdmin();
      
      if (result.success) {
        toast({
          title: "Admin Role Assigned!",
          description: "You now have admin access. Page will reload...",
        });
        
        // Reload page after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to assign admin role",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Admin assignment error:", err);
      toast({
        title: "Error",
        description: "Failed to assign admin role",
        variant: "destructive",
      });
    } finally {
      setAssigningAdmin(false);
    }
  };

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
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      if (result.success) {
        setSuccessMessage(`Invitation sent successfully to ${email}!`);
        setEmail("");
        setName("");
        toast({
          title: "Success",
          description: `Invitation sent to ${email}`,
        });
      } else {
        setError(result.error || "Failed to send invitation");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      console.error("Invitation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-8 text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
              <h2 className="text-lg font-semibold">Loading...</h2>
              <p className="text-muted-foreground">Checking authentication status</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Show access denied if not admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-8 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Admin Access Required</h2>
              <p className="text-muted-foreground mb-4">
                You need administrator privileges to access this page.
              </p>
              
              {profile && (
                <div className="my-4 p-3 bg-muted rounded-lg text-sm">
                  <p className="text-muted-foreground">Logged in as:</p>
                  <p className="font-mono text-xs mt-1">{profile.email}</p>
                </div>
              )}
              
              <div className="space-y-2">
                <Button
                  onClick={handleAssignAdmin}
                  disabled={assigningAdmin}
                  className="w-full"
                >
                  {assigningAdmin ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Assigning Admin Role...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Assign Admin Role to Me
                    </>
                  )}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => navigate('/dashboard')}
                  className="w-full"
                >
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Main admin interface
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
              <Shield className="h-8 w-8 text-green-500" />
              Admin: Send Invitations
            </h1>
            <p className="text-muted-foreground mt-2">
              Invite new users to join TradingGoose
            </p>
            <div className="mt-2">
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
                ADMIN ACCESS VERIFIED
              </span>
            </div>
          </div>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>• Enter the user's email address</p>
                <p>• They'll receive a secure invitation email</p>
                <p>• Users click the magic link to sign in</p>
                <p>• No invite codes needed!</p>
              </div>
            </CardContent>
          </Card>

          {/* Invitation Form */}
          <Card>
            <CardHeader>
              <CardTitle>Send New Invitation</CardTitle>
              <CardDescription>
                The user will receive an email with a magic link
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

          {/* Admin Info */}
          <Card className="bg-muted/50">
            <CardContent className="py-4">
              <div className="text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Logged in as:</span>
                  <span className="font-mono text-xs">{profile?.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <span className="text-green-600 font-medium">Administrator</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}