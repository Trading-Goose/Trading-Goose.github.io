import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AdminRouteProtection } from "@/components/AdminRouteProtection";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import AnalysisRecords from "./pages/AnalysisRecords";
import RebalanceRecords from "./pages/RebalanceRecords";
import AdminInvitations from "./pages/AdminInvitations";
import AdminInvitationsDebug from "./pages/AdminInvitations-Debug";
import NotFound from "./pages/NotFound";
import ForgotPassword from "./components/ForgotPassword";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { supabase, supabaseHelpers } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const queryClient = new QueryClient();

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/analysis-records" element={<AnalysisRecords />} />
      <Route path="/rebalance-records" element={<RebalanceRecords />} />
      <Route path="/admin/invitations" element={
        <AdminRouteProtection>
          <AdminInvitations />
        </AdminRouteProtection>
      } />
      <Route path="/admin/debug" element={
        <AdminRouteProtection>
          <AdminInvitationsDebug />
        </AdminRouteProtection>
      } />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => {
  // Auth state is managed in auth.ts

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;