import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-supabase";
import { useAdminVerification } from "@/hooks/useAdminVerification";

export default function AdminInvitationsDebug() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { isAdmin, role, isLoading: isLoadingAdmin, error: adminError } = useAdminVerification();
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    async function fetchDebugInfo() {
      if (!user) return;

      try {
        // Get session info
        const { data: { session } } = await supabase.auth.getSession();
        
        // Try to query admin_roles directly
        const { data: adminRoles, error: rolesError } = await supabase
          .from('admin_roles')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true);

        // Try to call the RPC function
        const { data: isAdminRpc, error: rpcError } = await supabase
          .rpc('is_admin', { user_id: user.id });

        setDebugInfo({
          userId: user.id,
          userEmail: user.email,
          hasSession: !!session,
          sessionUserId: session?.user?.id,
          adminRolesData: adminRoles,
          adminRolesError: rolesError?.message,
          isAdminRpc,
          rpcError: rpcError?.message,
          hookIsAdmin: isAdmin,
          hookRole: role,
          hookError: adminError
        });
      } catch (err) {
        setDebugInfo({ error: err });
      }
    }

    fetchDebugInfo();
  }, [user, isAdmin, role, adminError]);

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-6 py-8">
        <Card className="max-w-4xl mx-auto">
          <CardContent className="py-8">
            <h2 className="text-2xl font-bold mb-4">Admin Access Debug Information</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">Current User</h3>
                <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
                  {JSON.stringify({
                    id: user?.id,
                    email: user?.email,
                    name: user?.name
                  }, null, 2)}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Admin Verification Hook</h3>
                <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
                  {JSON.stringify({
                    isAdmin,
                    role,
                    isLoading: isLoadingAdmin,
                    error: adminError
                  }, null, 2)}
                </pre>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Debug Information</h3>
                <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </div>

              <div className="flex gap-4 mt-6">
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/admin/invitation')}
                >
                  Try Admin Page
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/dashboard')}
                >
                  Back to Dashboard
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}