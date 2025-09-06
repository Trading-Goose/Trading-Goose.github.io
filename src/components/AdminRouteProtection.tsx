import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import NotFound from "@/pages/NotFound";

interface AdminRouteProtectionProps {
  children: React.ReactNode;
}

export const AdminRouteProtection = ({ children }: AdminRouteProtectionProps) => {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();

  // Show loading state while checking auth
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </div>;
  }

  // If not authenticated or not admin, show NotFound page
  if (!isAuthenticated || !isAdmin) {
    return <NotFound />;
  }

  // User is authenticated and is admin
  return <>{children}</>;
};