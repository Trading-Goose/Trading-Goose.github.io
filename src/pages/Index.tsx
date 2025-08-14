import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { TrendingUp, Shield, Users, Zap } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

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

    // Redirect authenticated users to dashboard
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center py-16 space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                TradingGoose
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
                AI-Powered Portfolio Management for the Modern Trader
              </p>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Leverage cutting-edge AI to analyze markets, manage risk, and execute trades with confidence.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="text-lg px-8 py-6" onClick={() => navigate('/register')}>
                Get Started Free
              </Button>
              <Button variant="outline" size="lg" className="text-lg px-8 py-6" onClick={() => navigate('/login')}>
                Sign In
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 py-16">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <TrendingUp className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Smart Analysis</h3>
              <p className="text-muted-foreground">
                AI-powered market analysis with real-time insights and recommendations.
              </p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Risk Management</h3>
              <p className="text-muted-foreground">
                Advanced risk assessment and portfolio optimization tools.
              </p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Team Approach</h3>
              <p className="text-muted-foreground">
                Multiple AI agents working together for comprehensive market coverage.
              </p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Zap className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Fast Execution</h3>
              <p className="text-muted-foreground">
                Lightning-fast trade execution with automated portfolio rebalancing.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;