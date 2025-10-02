import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Bot, Shield, Calendar, Play, Key, TrendingUp, CheckCircle } from "lucide-react";

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
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center py-16 space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-6xl font-bold" style={{ color: '#FFCC00' }}>
                TradingGoose
              </h1>
              <div className="flex items-center justify-center gap-3 my-4">
                <span className="text-lg text-muted-foreground">
                  Open Source Available
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => window.open('https://github.com/Trading-Goose/Open-TradingGoose', '_blank')}
                >
                  <svg
                    className="h-4 w-4 fill-current"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
                  </svg>
                  View on GitHub
                </Button>
              </div>
              <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
                AI Trading Analytical Workflow
              </p>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Advanced analytical workflow powered by 15 specialized LLM agents for comprehensive market research, analysis synthesis, and trading intelligence.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {!isLoading && isAuthenticated ? (
                <Button size="lg" className="text-lg px-8 py-6" onClick={() => navigate('/dashboard')}>
                  Go to Dashboard
                </Button>
              ) : (
                <>
                  <Button size="lg" className="text-lg px-8 py-6" onClick={() => navigate('/register')}>
                    Get Started
                  </Button>
                  <Button variant="outline" size="lg" className="text-lg px-8 py-6" onClick={() => navigate('/login')}>
                    Sign In
                  </Button>
                </>
              )}
            </div>
          </div>


          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 py-16">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Multiple AI Agent Teams</h3>
              <p className="text-muted-foreground">
                Analysts, Bull/Bear Researchers, Trader, Risk Analysts, and Portfolio Manager.
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
              <h2 className="text-2xl md:text-3xl font-bold">How <span style={{ color: '#FFCC00' }}>TradingGoose</span> Works</h2>
              <p className="text-base text-muted-foreground max-w-3xl mx-auto">
                <span style={{ color: '#FFCC00' }}>TradingGoose</span> employs a sophisticated multi-agent AI system that orchestrates 15 specialized AI agents through structured workflows to analyze stocks and manage portfolios.
              </p>
            </div>

            {/* Analysis Workflow */}
            <div className="space-y-6 ">
              <div className="text-center space-y-3">
                <h3 className="text-xl font-bold">Multi-Agent Analysis Pipeline</h3>
                <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                  When you analyze a stock, our AI agents work through a structured 5-phase process
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                {/* Workflow Image */}
                <div className="lg:col-span-2">
                  <img
                    src="/Analysis-Flow-dark.png"
                    alt="Multi-Agent Analysis Pipeline - 5 Phase Trading System"
                    loading="lazy"
                    width="1200"
                    height="800"
                    className="w-full mx-auto"
                  />
                </div>

                {/* Phase Steps */}
                <div className="space-y-3">
                  {[
                    { num: 1, title: "Analysis", desc: "Macro, Market, News, Social, Fundamentals", color: "yellow" },
                    { num: 2, title: "Research", desc: "Bull & Bear debate + synthesis", color: "green" },
                    { num: 3, title: "Trading", desc: "BUY/SELL/HOLD recommendation", color: "purple" },
                    { num: 4, title: "Risk", desc: "Multi-perspective risk evaluation", color: "red" },
                    { num: 5, title: "Portfolio", desc: "Final position sizing decisions", color: "blue" }
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
            <div className="py-12  space-y-6">
              <div className="text-center space-y-3">
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
                    { num: 4, title: "Portfolio Execution", desc: "Execute rebalancing strategy", color: "blue" }
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
                    src="/Rebalance-Flow-dark.png"
                    alt="Intelligent Portfolio Rebalancing System - Automated Trading Workflow"
                    loading="lazy"
                    width="1200"
                    height="800"
                    className="w-full mx-auto"
                  />
                </div>
              </div>
            </div>

            {/* Prerequisites Section */}
            <div className="py-12 space-y-6">
              <div className="text-center space-y-3">
                <h3 className="text-xl font-bold">Getting Started with <span style={{ color: '#FFCC00' }}>TradingGoose</span></h3>
                <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
                  Three simple steps to unleash the full power of AI-driven trading
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
                {/* Step 1: Join Discord */}
                <div className="bg-card/50 rounded-lg border border-border/50 p-6 space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-[#5865F2]/10 rounded-full -mr-10 -mt-10" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-[#5865F2] rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold">1</span>
                      </div>
                      <h4 className="font-semibold">Join Discord Community</h4>
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Get project updates and connect with traders:
                      </p>
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Community Supports</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Live support</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Feature updates</span>
                        </li>
                      </ul>
                      <Button
                        size="sm"
                        className="w-full mt-4"
                        style={{ backgroundColor: '#5865F2' }}
                        onClick={() => window.open('https://discord.gg/wavf5JWhuT', '_blank')}
                      >
                        <svg
                          className="mr-2 h-4 w-4 fill-current"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                        </svg>
                        Join Discord
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Step 2: AI API Setup */}
                <div className="bg-card/50 rounded-lg border border-border/50 p-6 space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-full -mr-10 -mt-10" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold">2</span>
                      </div>
                      <h4 className="font-semibold">Setup AI Provider</h4>
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Choose an AI provider for analysis:
                      </p>
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>OpenAI (GPT-4)</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Anthropic (Claude)</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Google (Gemini)</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>DeepSeek</span>
                        </li>
                      </ul>
                      <p className="text-xs text-muted-foreground pt-2">
                        Configure in Settings → AI Providers
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 3: Alpaca Account Setup */}
                <div className="bg-card/50 rounded-lg border border-border/50 p-6 space-y-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-primary/10 rounded-full -mr-10 -mt-10" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold">3</span>
                      </div>
                      <h4 className="font-semibold">Connect Alpaca</h4>
                    </div>
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Trading account for market data:
                      </p>
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Free paper trading</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Real-time data</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Portfolio tracking</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>Live trading ready</span>
                        </li>
                      </ul>
                      <p className="text-xs text-muted-foreground pt-2">
                        Sign up at <a href="https://alpaca.markets" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">alpaca.markets</a>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center pt-6">
                <Button
                  size="lg"
                  className="text-lg px-8 py-6"
                  onClick={() => navigate('/register')}
                >
                  Getting started now
                </Button>
              </div>
            </div>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Index;