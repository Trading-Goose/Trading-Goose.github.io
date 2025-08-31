import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/AuthProvider";
import { AlpacaConnectionErrorModal } from "@/components/AlpacaConnectionErrorModal";
import { useAlpacaConnection } from "@/hooks/useAlpacaConnection";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import AnalysisRecords from "./pages/AnalysisRecords";
import RebalanceRecords from "./pages/RebalanceRecords";
import TradeHistory from "./pages/TradeHistory";
import AdminInvitations from "./pages/AdminInvitationsNew";
import AdminRoleManager from "./pages/AdminRoleManager";
import AdminUserManager from "./pages/AdminUserManager";
import NotFound from "./pages/NotFound";
import ForgotPassword from "./components/ForgotPassword";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import InvitationSetup from "./pages/InvitationSetup";
import Disclaimer from "./pages/Disclaimer";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import FAQ from "./pages/FAQ";

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
      <Route path="/trade-history" element={<TradeHistory />} />
      <Route path="/admin/invitations" element={<AdminInvitations />} />
      <Route path="/admin/roles" element={<AdminRoleManager />} />
      <Route path="/admin/users" element={<AdminUserManager />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invitation-setup" element={<InvitationSetup />} />
      <Route path="/disclaimer" element={<Disclaimer />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

// Wrapper component to use hooks inside the providers
const AppContent = () => {
  // Start monitoring Alpaca connection
  useAlpacaConnection();
  
  return (
    <>
      <AlpacaConnectionErrorModal />
      <AppRoutes />
    </>
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
            <AppContent />
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
