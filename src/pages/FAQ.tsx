import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Bot,
  Shield,
  DollarSign,
  Settings,
  Users,
  Zap
} from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
  icon?: React.ReactNode;
}

interface FAQSection {
  title: string;
  icon: React.ReactNode;
  items: FAQItem[];
}

const FAQ = () => {
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(() => {
    // Create a set with all item keys to start collapsed
    const allItems = new Set<string>();
    let sectionCount = 5; // Number of sections (removed Legal & Compliance)
    let itemsPerSection = [3, 8, 4, 3, 4]; // Items in each section
    for (let i = 0; i < sectionCount; i++) {
      for (let j = 0; j < itemsPerSection[i]; j++) {
        allItems.add(`${i}-${j}`);
      }
    }
    return allItems;
  });

  // Scroll to top when component mounts
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const toggleCollapse = (itemKey: string) => {
    setCollapsedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemKey)) {
        newSet.delete(itemKey);
      } else {
        newSet.add(itemKey);
      }
      return newSet;
    });
  };

  const faqSections: FAQSection[] = [
    {
      title: "Getting Started",
      icon: <Zap className="w-5 h-5" />,
      items: [
        {
          question: "What is TradingGoose?",
          answer: "TradingGoose is an AI-powered platform that provides structured analysis workflows for processing market data. It uses a sophisticated multi-agent AI system with 15+ specialized agents to analyze stocks and provide informational insights.\n\n**Requirements**:\n- Alpaca API credentials (PAPER or LIVE account)\n- At least one configured AI provider (OpenAI, Anthropic, etc.)\n\nThe platform does NOT execute trades or provide investment advice - it's purely an informational tool that helps you process and understand market data through AI-powered workflows."
        },
        {
          question: "How do I get started with TradingGoose?",
          answer: "Getting started with TradingGoose:\n\n1. **Create an Account**: Sign up with your email address\n2. **Configure AI Provider (Required)**: Add at least one AI provider API key (OpenAI, Anthropic, etc.) in Settings - this is required for the platform to function\n3. **Connect Alpaca (Required)**: Add your Alpaca API credentials (either PAPER or LIVE account) - this is required even if you only want to analyze stocks\n4. **Set Default AI Provider**: Choose your default AI provider in Settings\n5. **Start Analyzing**: Use the Dashboard to analyze stocks or set up portfolio rebalancing workflows\n\n**Important**: Both Alpaca API and at least one AI provider are required for TradingGoose to work. All API keys are securely encrypted and stored in Supabase's protected database."
        },
        {
          question: "Do I need coding knowledge to use TradingGoose?",
          answer: "No coding knowledge is required! TradingGoose provides an intuitive user interface for all features. The platform handles all the complex AI orchestration and workflow management behind the scenes. You simply need to:\n\n- Enter stock symbols you want to analyze\n- Configure your preferences in settings\n- Review the AI-generated insights and analysis\n\nThe platform is designed to be accessible to both technical and non-technical users."
        }
      ]
    },
    {
      title: "AI Agents, Analysis & Trading",
      icon: <Bot className="w-5 h-5" />,
      items: [
        {
          question: "How does the multi-agent AI system work?",
          answer: "TradingGoose orchestrates **15+ specialized AI agents** through a sophisticated 5-phase analysis workflow, ensuring comprehensive market analysis from multiple perspectives.\n\n## 📊 **Phase 1: Data Analysis**\nFive specialist analysts gather and process diverse data sources:\n- **🌍 Macro Analyst**: Economic indicators, treasury data, global market trends\n- **📈 Market Analyst**: Technical indicators, price patterns, historical data from Yahoo Finance\n- **📰 News Analyst**: Breaking news, market sentiment from Bloomberg, Reuters, and financial media\n- **💬 Social Media Analyst**: Social sentiment, trending discussions from Reddit, YouTube, Twitter\n- **🏢 Fundamentals Analyst**: Company financials, earnings, balance sheets, insider trading data\n\n## 🔬 **Phase 2: Research Debate**\nTwo researchers present opposing viewpoints:\n- **🟢 Bull Researcher**: Presents optimistic evidence and growth potential\n- **🔴 Bear Researcher**: Highlights risks and potential downsides\n- **⚖️ Research Manager**: Synthesizes both perspectives into balanced insights\n\n## 💹 **Phase 3: Trading Decision**\n- **Trader Agent**: Evaluates all research to provide clear **BUY**, **SELL**, or **HOLD** recommendations with detailed reasoning\n\n## 🛡️ **Phase 4: Risk Assessment**\nThree risk analysts evaluate from different perspectives:\n- **⚠️ Risky Analyst**: Advocates for high-return opportunities, aggressive strategies\n- **🔒 Safe Analyst**: Emphasizes capital preservation and conservative approaches\n- **⚡ Neutral Analyst**: Provides balanced risk-reward perspective\n- **Risk Manager**: Combines all risk analyses to determine final risk rating and signals\n\n## 📊 **Phase 5: Portfolio Management**\n- **Portfolio Manager**: Determines optimal position sizing, portfolio allocation, and execution strategy based on:\n  - User's risk tolerance\n  - Current portfolio composition\n  - Market conditions\n  - Risk assessment outcomes\n\n### 💡 **Key Benefits**\n- **Multi-perspective analysis**: Every stock is evaluated from 15+ different angles\n- **Built-in debate mechanism**: Bull vs Bear ensures balanced analysis\n- **Risk-adjusted recommendations**: Three-tier risk assessment prevents blind spots\n- **Portfolio-aware decisions**: Final recommendations consider your entire portfolio\n- **Data diversity**: Combines technical, fundamental, sentiment, and macro analysis"
        },
        {
          question: "What AI providers does TradingGoose support?",
          answer: "TradingGoose supports multiple AI providers:\n\n- **OpenAI** (GPT-4, GPT-3.5)\n- **Anthropic** (Claude 3.5, Claude 3)\n- **Google** (Gemini Pro)\n- **Groq** (Fast inference models)\n- **Local Models** via Ollama\n\n**Important**: You must configure at least one AI provider with a valid API key for TradingGoose to function. You can then:\n- Set a default AI provider in Settings\n- Configure different providers for different agents\n- Switch between providers based on your needs\n\nAll API keys are encrypted and securely stored in Supabase's protected database."
        },
        {
          question: "How accurate are the AI-generated insights?",
          answer: "**Important**: AI-generated insights are for informational purposes only and should NOT be used as the sole basis for investment decisions.\n\n- AI analyses are based on historical data and current information\n- Market conditions can change rapidly and unpredictably\n- AI systems have inherent limitations and biases\n- Past performance does not guarantee future results\n\n**Always**:\n- Conduct your own research\n- Consult with qualified financial advisors\n- Consider multiple sources of information\n- Understand that all investments carry risk"
        },
        {
          question: "Can I customize which AI agents are used?",
          answer: "You can customize AI agent configuration in Settings:\n\n**What you CAN configure**:\n- Choose different AI providers for different agent teams (Analysis, Research, Trading, Risk, Portfolio Manager)\n- Set different AI models for each team\n- Configure **Max Tokens** (500-8000) for each agent team to control response length\n- Adjust analysis optimization level (Speed vs Balanced)\n- Set historical data range for analysis\n- Configure number of debate rounds for research agents\n\n**What you CANNOT configure**:\n- Cannot enable/disable specific agents (all agents in the workflow are required)\n- Cannot configure timeouts for individual agents\n\nThe multi-agent system works as an integrated workflow where all agents are essential for comprehensive analysis."
        },
        {
          question: "Can TradingGoose execute trades automatically?",
          answer: "TradingGoose itself does NOT execute trades. However:\n\n- You can configure auto-execution through your connected Alpaca account\n- TradingGoose provides the analysis and signals\n- Your Alpaca account handles the actual trade execution\n- You maintain full control over execution settings\n- All trades happen directly between you and Alpaca\n\nThink of TradingGoose as providing the 'brain' (analysis) while Alpaca provides the 'hands' (execution)."
        },
        {
          question: "How does portfolio rebalancing work?",
          answer: "Portfolio rebalancing follows a systematic approach:\n\n1. **Configuration**: Set your target allocations and thresholds\n2. **Monitoring**: System checks for drift from targets\n3. **Analysis**: When thresholds are exceeded, full analysis runs\n4. **Recommendations**: AI agents provide rebalancing suggestions\n5. **Execution** (Optional): Execute through your Alpaca account\n\nYou can schedule automatic rebalancing checks or trigger them manually. All rebalancing decisions remain under your control."
        },
        {
          question: "What is the difference between Analysis and Rebalance?",
          answer: "**Analysis**: Single-stock deep dive\n- Comprehensive analysis of one stock\n- All 15+ agents provide insights\n- Includes trading recommendation (BUY/SELL/HOLD)\n- Results in detailed report with multiple perspectives\n\n**Rebalance**: Portfolio-level optimization\n- Analyzes multiple stocks in your watchlist\n- Focuses on portfolio allocation\n- Considers risk distribution\n- Provides specific rebalancing actions\n- Can be scheduled for automatic monitoring"
        },
        {
          question: "Can I paper trade before using real money?",
          answer: "Yes! Alpaca provides paper trading accounts:\n\n1. Create a paper trading account on Alpaca\n2. Use paper trading API keys in TradingGoose\n3. Test all features without real money\n4. Analyze your performance and refine strategies\n5. Switch to live trading when ready\n\nWe strongly recommend starting with paper trading to understand the platform and test your strategies."
        }
      ]
    },
    {
      title: "Security & Privacy",
      icon: <Shield className="w-5 h-5" />,
      items: [
        {
          question: "How are my API credentials stored?",
          answer: "**Your API credentials are securely stored using Supabase's encrypted database.**\n\nAll sensitive credentials (AI API keys, Alpaca keys) are:\n- Stored in Supabase, a secure database-as-a-service platform\n- Protected by Supabase's enterprise-grade encryption at rest and in transit\n- Subject to Supabase's SOC 2 Type II compliance and security standards\n- Encrypted using industry-standard algorithms\n- Accessible only through authenticated API calls\n\nSupabase provides:\n- Row Level Security (RLS) ensuring users can only access their own credentials\n- SSL/TLS encryption for all data transfers\n- Regular security audits and compliance certifications\n- Automatic backups and data redundancy\n\n**Why we store credentials**: This allows TradingGoose to run analyses in the backend - you can start an analysis, close your browser, and return later to see the results. Your credentials are never stored in plain text and are protected by multiple layers of security."
        },
        {
          question: "Does TradingGoose have access to my trading account?",
          answer: "**No, TradingGoose does NOT directly access or control your trading account.**\n\n- Your Alpaca credentials are encrypted and stored securely in Supabase\n- Trading connections are made from our secure backend to Alpaca on your behalf\n- We don't monitor or log your individual trades\n- We can't execute trades without your explicit action\n- We don't store or access your portfolio balance or positions beyond what you request\n\nTradingGoose acts as a secure intermediary:\n- Your credentials are encrypted and used only for authorized API calls\n- All trading operations require your explicit confirmation\n- You maintain full control over your trading account through Alpaca"
        },
        {
          question: "What data does TradingGoose collect?",
          answer: "TradingGoose collects the following data to provide our services:\n\n**We collect and securely store**:\n- Email address (for authentication)\n- Username and preferences\n- **Encrypted API credentials** (AI providers and Alpaca) - stored securely in Supabase to run analyses in the backend\n- Workflow configurations and analysis settings\n- Stock symbols you've searched (public information)\n- Platform usage statistics\n\n**We do NOT collect or store**:\n- Actual trading positions or balances from your brokerage\n- Financial account numbers\n- Credit card or banking information\n- Personal investment strategies beyond what you configure\n\n**Why we store API credentials**: By securely storing your encrypted API keys, we can run analyses in our backend servers. This means you don't need to keep your browser open - you can start an analysis and come back later to see the results."
        },
        {
          question: "Is my data shared with third parties?",
          answer: "**TradingGoose does NOT sell, trade, or rent your personal information.**\n\nWe NEVER share:\n- Your encrypted API credentials\n- Trading account information\n- Personal financial data\n- Individual usage patterns\n- Any user data with third parties\n\nYour data remains private and is used solely for providing TradingGoose services to you."
        }
      ]
    },
    {
      title: "Subscription & Billing",
      icon: <DollarSign className="w-5 h-5" />,
      items: [
        {
          question: "What does TradingGoose cost?",
          answer: "TradingGoose offers different pricing tiers to suit various needs. Please check our pricing page for current plans.\n\n**Important costs to consider**:\n- TradingGoose subscription fee\n- AI API costs (paid directly to providers like OpenAI)\n- Alpaca trading fees (if applicable)\n- Market data fees (if using premium data)\n\nNote: AI API costs can vary significantly based on usage. We recommend starting with conservative usage and monitoring your costs."
        },
        {
          question: "Do I need to pay for AI API usage separately?",
          answer: "**Yes, AI API costs are separate from TradingGoose subscription.**\n\n- You pay AI providers (OpenAI, Anthropic, etc.) directly\n- Costs depend on your usage volume\n- Different models have different pricing\n- You can set spending limits with most providers\n- Consider starting with cheaper models (GPT-3.5) before upgrading\n\nTradingGoose does not mark up or charge for AI API usage - you pay providers directly at their standard rates."
        },
        {
          question: "Can I use TradingGoose without Alpaca?",
          answer: "**No, Alpaca API is required for TradingGoose to function.**\n\nYou must have either:\n- **Alpaca PAPER account** (recommended for testing) - Free paper trading account for testing without real money\n- **Alpaca LIVE account** - For actual trading with real money\n\nEven if you only want to analyze stocks without trading, Alpaca API is required because:\n- It provides market data access\n- Powers portfolio analysis features\n- Enables the trading simulation workflows\n\nYou can start with a free Alpaca PAPER account to test all features without any financial risk."
        }
      ]
    },
    {
      title: "Technical & Troubleshooting",
      icon: <Settings className="w-5 h-5" />,
      items: [
        {
          question: "What browsers are supported?",
          answer: "TradingGoose works best on modern browsers:\n\n**Recommended**:\n- Chrome (version 90+)\n- Firefox (version 88+)\n- Safari (version 14+)\n- Edge (version 90+)\n\n**Not Supported**:\n- Internet Explorer\n- Older browser versions\n\nFor best performance, keep your browser updated to the latest version."
        },
        {
          question: "Why is my analysis taking so long?",
          answer: "Analysis time can vary based on several factors:\n\n**Common causes of delays**:\n- AI API rate limits (especially with free tiers)\n- Network connectivity issues\n- High demand on AI provider services\n- Complex analysis with many agents\n\n**Solutions**:\n- Check your API rate limits\n- Use faster AI providers (like Groq)\n- Ensure stable internet connection\n- Consider upgrading AI API tiers for higher limits"
        },
        {
          question: "What should I do if I get an API error?",
          answer: "**Common API errors and solutions**:\n\n**Invalid API Key**:\n- Double-check key in Settings\n- Ensure no extra spaces\n- Verify key is active with provider\n\n**Rate Limit Exceeded**:\n- Wait before retrying\n- Upgrade API plan\n- Reduce request frequency\n\n**Insufficient Credits**:\n- Add credits to your AI provider account\n- Switch to a cheaper model\n- Monitor usage more carefully\n\n**Connection Error**:\n- Check internet connection\n- Try refreshing the page\n- Verify provider service status"
        },
        {
          question: "How can I optimize AI costs?",
          answer: "**Tips to reduce AI API costs**:\n\n1. **Use appropriate models**: GPT-3.5 for simple tasks, GPT-4 for complex analysis\n2. **Limit agent usage**: Disable non-essential agents\n3. **Batch analyses**: Group multiple stocks in rebalancing instead of individual analyses\n4. **Set spending limits**: Configure limits with your AI provider\n5. **Monitor usage**: Regularly check your API usage dashboard\n6. **Use caching**: Avoid re-analyzing the same stock multiple times per day\n7. **Consider local models**: Use Ollama for some agents if you have capable hardware"
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <HelpCircle className="h-8 w-8" />
            Frequently Asked Questions
          </h1>
          <p className="text-muted-foreground mt-2">
            Find answers to common questions about TradingGoose
          </p>
        </div>

        <div className="space-y-8">
          {faqSections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                {section.icon}
                <h2 className="text-xl font-semibold">{section.title}</h2>
              </div>

              {section.items.map((item, itemIndex) => {
                const itemKey = `${sectionIndex}-${itemIndex}`;
                const isCollapsed = collapsedItems.has(itemKey);

                return (
                  <Collapsible key={itemKey} open={!isCollapsed}>
                    <Card className="overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/40 transition-colors">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span className="pr-4">{item.question}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCollapse(itemKey);
                              }}
                            >
                              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                            </Button>
                          </CardTitle>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-6">
                          <MarkdownRenderer
                            content={item.answer}
                            className="text-muted-foreground"
                          />
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                );
              })}
            </div>
          ))}

          {/* Contact Section */}
          <Card className="mt-12 border-primary/30 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <Users className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold mb-2">Still have questions?</h3>
                  <p className="text-muted-foreground">
                    If you couldn't find the answer you're looking for, please don't hesitate to reach out to our support team.
                    We're here to help you get the most out of TradingGoose.
                  </p>
                  <Button 
                    className="mt-4" 
                    variant="default"
                    onClick={() => window.open('https://discord.gg/3dkTaNyp', '_blank')}
                  >
                    Contact Support
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer Note */}
          <div className="text-center text-sm text-muted-foreground pt-8 pb-4">
            <p className="italic">
              <strong className="text-primary">TradingGoose</strong> - Providing structured AI analysis workflows for 
              informational purposes only.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default FAQ;