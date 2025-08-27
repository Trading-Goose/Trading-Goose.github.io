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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Mail,
  Send,
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  Calendar,
  RefreshCw,
  Users,
  Shield,
  Info
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";

interface Invitation {
  id: string;
  email: string;
  name?: string;
  invited_at?: string;  // Make optional as it might not exist
  confirmed_at?: string;
  status: 'pending' | 'sent' | 'confirmed' | 'expired';
  invited_by: string;
  created_at: string;
  confirmed_user_id?: string;  // Add this to check actual confirmation
  is_truly_confirmed?: boolean;  // Based on last_sign_in_at
  user_last_sign_in?: string;  // User's last sign in time
}

export default function AdminInvitationsNew() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    isAuthenticated,
    isAdmin,
    isLoading: authLoading,
    profile
  } = useAuth();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingInvitations, setIsFetchingInvitations] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [stats, setStats] = useState({
    totalSent: 0,
    confirmed: 0,
    pending: 0
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Fetch existing invitations
  const fetchInvitations = async () => {
    if (!isAdmin) return;

    setIsFetchingInvitations(true);
    try {
      // Use the new function that checks last_sign_in_at
      const { data, error } = await supabase
        .rpc('get_invitations_with_confirmation_status');

      if (error) {
        console.error('Error fetching invitations:', error);
        // Fallback to direct query if function doesn't exist
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('invitations')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (!fallbackError && fallbackData) {
          setInvitations(fallbackData as Invitation[]);
          const confirmed = fallbackData.filter(inv => inv.confirmed_user_id != null).length;
          const pending = fallbackData.filter(inv => !inv.confirmed_user_id && inv.status !== 'expired').length;
          setStats({
            totalSent: fallbackData.length,
            confirmed,
            pending
          });
        } else {
          setInvitations([]);
          setStats({ totalSent: 0, confirmed: 0, pending: 0 });
        }
        return;
      }

      if (data) {
        setInvitations(data as Invitation[]);

        // Calculate stats - use is_truly_confirmed for accurate confirmation status
        const confirmed = data.filter(inv => inv.is_truly_confirmed === true).length;
        const pending = data.filter(inv => !inv.is_truly_confirmed && inv.status !== 'expired').length;

        setStats({
          totalSent: data.length,
          confirmed,
          pending
        });
      }
    } catch (error) {
      console.error('Error fetching invitations:', error);
      setInvitations([]);
      setStats({ totalSent: 0, confirmed: 0, pending: 0 });
    } finally {
      setIsFetchingInvitations(false);
    }
  };

  useEffect(() => {
    if (isAdmin && !authLoading) {
      fetchInvitations();
    }
  }, [isAdmin, authLoading]);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No access token available');
      }

      const response = await fetch(
        `${import.meta.env.SUPABASE_URL}/functions/v1/send-invitation`,
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
        // Show appropriate message based on whether email was sent
        let description = result.message || `Invitation created for ${email}`;

        // If email wasn't sent, show the registration URL
        if (result.invitation && !result.emailSent) {
          description += `. Registration URL: ${result.invitation.registrationUrl}`;
        }

        toast({
          title: "Success",
          description: description,
          duration: result.emailSent ? 3000 : 10000, // Show longer if manual action needed
        });

        // Clear form
        setEmail("");
        setName("");

        // Refresh invitations list
        fetchInvitations();
      } else {
        throw new Error(result.error || "Failed to send invitation");
      }
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive",
      });
      console.error("Invitation error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (invitation: Invitation) => {
    // Check if user has actually signed in (truly confirmed)
    const actualStatus = invitation.is_truly_confirmed === true ? 'confirmed' :
      invitation.is_truly_confirmed === false ? 'sent' :
        // Fallback for old data without is_truly_confirmed field
        invitation.confirmed_user_id ? 'sent' :
          (invitation.status === 'confirmed' && !invitation.confirmed_user_id ? 'pending' : invitation.status);

    switch (actualStatus) {
      case 'confirmed':
        return <Badge variant="success" className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Confirmed
        </Badge>;
      case 'sent':
        return <Badge variant="outline" className="flex items-center gap-1">
          <Mail className="h-3 w-3" />
          Sent
        </Badge>;
      case 'expired':
        return <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Expired
        </Badge>;
      default:
        return <Badge variant="secondary" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>;
    }
  };

  // Show loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
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
          <Alert className="max-w-md mx-auto">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              You don't have permission to send invitations.
            </AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  // Main admin interface
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="h-8 w-8" />
            Invitation Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Send invitations and manage user access to TradingGoose
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Total Invitations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSent}</div>
              <p className="text-xs text-muted-foreground">All time sent</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Confirmed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.confirmed}</div>
              <p className="text-xs text-muted-foreground">Successfully joined</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">Awaiting confirmation</p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Send New Invitation Card */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Send New Invitation</CardTitle>
                  <CardDescription>
                    Invite new users via email with a secure magic link
                  </CardDescription>
                </div>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Admin Only
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSendInvitation} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="email">
                      Email Address <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="name">
                      Name <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={isLoading}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <Button
                    type="submit"
                    disabled={isLoading || !email}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Invitation
                      </>
                    )}
                  </Button>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Info className="h-4 w-4" />
                    <span>Invitation will be sent immediately</span>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Recent Invitations */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Recent Invitations</CardTitle>
                  <CardDescription>
                    Track invitation status and user confirmations
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchInvitations}
                  disabled={isFetchingInvitations}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isFetchingInvitations ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isFetchingInvitations ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : invitations.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No invitations sent yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Send your first invitation to get started
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Invited</TableHead>
                        <TableHead>Confirmed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitations.map((invitation) => (
                        <TableRow key={invitation.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{invitation.email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {invitation.name || <span className="text-muted-foreground">—</span>}
                            </span>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(invitation)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 text-sm">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {format(new Date(invitation.invited_at || invitation.created_at), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            {invitation.confirmed_at ? (
                              <div className="flex items-center gap-1 text-sm text-green-600">
                                <CheckCircle2 className="h-3 w-3" />
                                {format(new Date(invitation.confirmed_at), 'MMM d, yyyy')}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How It Works</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                      1
                    </div>
                    <span className="text-sm font-medium">Enter Email</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-10">
                    Provide the user's email address
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                      2
                    </div>
                    <span className="text-sm font-medium">Send Invite</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-10">
                    System sends secure magic link
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                      3
                    </div>
                    <span className="text-sm font-medium">User Confirms</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-10">
                    Clicks link to activate account
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                      4
                    </div>
                    <span className="text-sm font-medium">Access Granted</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-10">
                    User can now sign in
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}