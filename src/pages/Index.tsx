import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import PortfolioPositions from "@/components/PortfolioPositions";
import RecentTrades from "@/components/RecentTrades";
import PerformanceChart from "@/components/PerformanceChart";
import HorizontalWorkflow from "@/components/HorizontalWorkflow";
import StandaloneWatchlist from "@/components/StandaloneWatchlist";
import LoginModal from "@/components/LoginModal";
import { useAuth } from "@/lib/auth-supabase";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();
  const [selectedStock, setSelectedStock] = useState<string | undefined>(undefined);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    // Check if this is a password recovery redirect
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    const accessToken = hashParams.get('access_token');
    
    if (type === 'recovery' && accessToken) {
      console.log('Password recovery token detected, redirecting to reset password page');
      // Preserve the hash parameters when navigating
      navigate(`/reset-password${window.location.hash}`);
      return;
    }

    // Show login modal if not authenticated and not loading
    if (!isAuthenticated && !isLoading) {
      setShowLoginModal(true);
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    // Set a timeout to prevent infinite loading
    if (isLoading) {
      const timer = setTimeout(() => {
        console.warn('Loading timeout reached, forcing completion');
        setLoadingTimeout(true);
        // Force the loading state to false if stuck
        useAuth.setState({ isLoading: false });
      }, 3000); // 3 second timeout
      return () => clearTimeout(timer);
    } else {
      setLoadingTimeout(false);
    }
  }, [isLoading]);

  const handleSelectStock = (symbol: string) => {
    setSelectedStock(symbol);
  };

  const handleClearSelection = () => {
    setSelectedStock(undefined);
  };

  // Show loading state while checking authentication
  if (isLoading && !loadingTimeout) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-6 py-8">
        {isAuthenticated ? (
          <>
            {/* Main Content */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
              {/* Left Side - Performance and Watchlist */}
              <div className="xl:col-span-2 space-y-6">
                <PerformanceChart 
                  selectedStock={selectedStock}
                  onClearSelection={handleClearSelection}
                />
                <StandaloneWatchlist 
                  onSelectStock={handleSelectStock}
                  selectedStock={selectedStock}
                />
              </div>
              
              {/* Right Side - Portfolio Holdings, Workflow, and Trading Actions */}
              <div className="space-y-6">
                <PortfolioPositions 
                  onSelectStock={handleSelectStock}
                  selectedStock={selectedStock}
                />
                <HorizontalWorkflow />
                <RecentTrades />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <h2 className="text-2xl font-bold mb-4">Welcome to TradingGoose</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              Sign in to access your portfolio, execute trades, and leverage AI-powered trading insights.
            </p>
            <Button onClick={() => setShowLoginModal(true)} size="lg">
              Sign In to Get Started
            </Button>
          </div>
        )}
      </main>

      {/* Login Modal */}
      <LoginModal 
        isOpen={showLoginModal && !isAuthenticated} 
        onClose={() => setShowLoginModal(false)} 
      />
    </div>
  );
};

export default Index;