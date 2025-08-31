import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PortfolioPositions from "@/components/PortfolioPositions";
import RecentTrades from "@/components/RecentTrades";
import PerformanceChart from "@/components/PerformanceChart";
import HorizontalWorkflow from "@/components/workflow";
import StandaloneWatchlist from "@/components/StandaloneWatchlist";
import { useAuth } from "@/lib/auth";

const Dashboard = () => {
  const navigate = useNavigate();
  const [selectedStock, setSelectedStock] = useState<string | undefined>(undefined);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const { isAuthenticated, isLoading, user } = useAuth();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/');
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
      }, 15000); // 15 second timeout to allow for database operations
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

  // If not authenticated, don't render anything (redirect will happen)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-6 py-8">
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
      </main>
      <Footer />
    </div>
  );
};

export default Dashboard;