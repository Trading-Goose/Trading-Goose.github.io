import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Bot, Shield, Calendar, Play } from "lucide-react";

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
              <h1 className="text-4xl md:text-6xl font-bold text-primary">
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
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">11 AI Specialists</h3>
              <p className="text-muted-foreground">
                Market Analyst, News Analyst, Social Media Analyst, Fundamentals Analyst, Bull/Bear Researchers, Trader, Risk Analysts, and Portfolio Manager.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Multi-Perspective Risk</h3>
              <p className="text-muted-foreground">
                Risky, Safe, and Neutral analysts provide different risk perspectives before final portfolio decisions.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Calendar className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Scheduled Auto Rebalance</h3>
              <p className="text-muted-foreground">
                Automated portfolio rebalancing on your schedule with intelligent threshold monitoring and opportunity detection.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Play className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Auto Execute AI Decisions</h3>
              <p className="text-muted-foreground">
                Automatically execute trading decisions from AI analysis with configurable risk controls and position sizing.
              </p>
            </div>
          </div>

          {/* How It Works Section */}
          <div className="py-12 space-y-16">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full text-primary font-medium text-xs">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
                AI-Powered Workflows
              </div>
              <h2 className="text-2xl md:text-3xl font-bold">How TradingGoose Works</h2>
              <p className="text-base text-muted-foreground max-w-3xl mx-auto">
                TradingGoose employs a sophisticated multi-agent AI system that orchestrates 11 specialized AI agents through structured workflows to analyze stocks and manage portfolios.
              </p>
            </div>

            {/* Analysis Workflow */}
            <div className="space-y-6 p-6">
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-500/20 rounded-full text-yellow-700 dark:text-yellow-300 font-medium text-xs">
                  <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
                  Stock Analysis
                </div>
                <h3 className="text-xl font-bold">Multi-Agent Analysis Pipeline</h3>
                <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                  When you analyze a stock, our AI agents work through a structured 5-phase process
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                {/* Workflow Image */}
                <div className="lg:col-span-2">
                  <img
                    src="/Analysis-Flow.png"
                    alt="TradingGoose Analysis Workflow"
                    className="w-full mx-auto"
                  />
                </div>

                {/* Phase Steps */}
                <div className="space-y-3">
                  {[
                    { num: 1, title: "Analysis", desc: "Market, News, Social Media & Fundamentals", color: "yellow" },
                    { num: 2, title: "Research", desc: "Bull & Bear debate + synthesis", color: "green" },
                    { num: 3, title: "Trading", desc: "BUY/SELL/HOLD recommendation", color: "purple" },
                    { num: 4, title: "Risk", desc: "Multi-perspective risk evaluation", color: "orange" },
                    { num: 5, title: "Portfolio", desc: "Final position sizing decisions", color: "sky" }
                  ].map((step, index) => (
                    <div key={index} className="inline-flex items-center gap-3 px-3 py-2 bg-card/50 rounded-full border border-border/50 hover:bg-card transition-colors">
                      <div className={`w-6 h-6 bg-${step.color}-500 text-white rounded-full flex items-center justify-center font-bold text-xs`}>
                        {step.num}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{step.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Rebalance Workflow */}
            <div className="space-y-6 p-6">
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-500/20 rounded-full text-orange-700 dark:text-orange-300 font-medium text-xs">
                  <span className="w-1.5 h-1.5 bg-orange-500 rounded-full"></span>
                  Portfolio Rebalancing
                </div>
                <h3 className="text-xl font-bold">Intelligent Rebalancing System</h3>
                <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                  Automated portfolio rebalancing with intelligent opportunity detection and risk management
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                {/* Phase Steps */}
                <div className="space-y-3">
                  {[
                    { num: 1, title: "Threshold Check", desc: "Monitor portfolio drift triggers", color: "yellow" },
                    { num: 2, title: "Opportunity Check", desc: "Evaluate market conditions", color: "orange" },
                    { num: 3, title: "Full Analysis", desc: "Complete 5-phase analysis", color: "gray" },
                    { num: 4, title: "Portfolio Execution", desc: "Execute rebalancing strategy", color: "sky" }
                  ].map((step, index) => (
                    <div key={index} className="inline-flex items-center gap-3 px-3 py-2 bg-card/50 rounded-full border border-border/50 hover:bg-card transition-colors">
                      <div className={`w-6 h-6 bg-${step.color}-500 text-white rounded-full flex items-center justify-center font-bold text-xs`}>
                        {step.num}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{step.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{step.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Workflow Image */}
                <div className="lg:col-span-2">
                  <img
                    src="/Rebalance-Flow.png"
                    alt="TradingGoose Rebalance Workflow"
                    className="w-full mx-auto"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default Index;