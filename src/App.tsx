import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/AuthProvider";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import AnalysisRecords from "./pages/AnalysisRecords";
import RebalanceRecords from "./pages/RebalanceRecords";
import AdminInvitations from "./pages/AdminInvitationsNew";
import AdminRoleManager from "./pages/AdminRoleManager";
import AdminUserManager from "./pages/AdminUserManager";
import NotFound from "./pages/NotFound";
import ForgotPassword from "./components/ForgotPassword";
import ResetPasswordPage from "./pages/ResetPasswordPage";

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
      <Route path="/admin/invitations" element={<AdminInvitations />} />
      <Route path="/admin/roles" element={<AdminRoleManager />} />
      <Route path="/admin/users" element={<AdminUserManager />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => {
  // Get basename from Vite's base configuration
  const basename = import.meta.env.BASE_URL || '/';

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename={basename}>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
