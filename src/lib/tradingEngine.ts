/**
 * Standalone Trading Engine for frontend implementation
 * Integrates AI analysis with multiple data sources and fallback mechanism
 */

import { useAuth } from './auth';
import { DataSourceManager, type UnifiedCandle, type UnifiedQuote } from './dataSourceManager';

// Types
export interface MarketData {
  ticker: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  indicators?: {
    sma50?: number;
    sma200?: number;
    rsi?: number;
    macd?: number;
  };
}

export interface NewsItem {
  headline: string;
  summary: string;
  datetime: string;
  source: string;
  url?: string;
}

export interface AnalysisResult {
  ticker: string;
  date: string;
  decision: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  agentInsights: {
    market?: string;
    socialMedia?: string;
    news?: string;
    fundamentals?: string;
    researchDebate?: DebateRound[];
    researchManager?: string;
    trader?: string;
    riskDebate?: RiskDebateRound[];
    riskManager?: string;
  };
}

export interface AgentMessage {
  agent: string;
  message: string;
  timestamp: string;
  type: 'info' | 'analysis' | 'decision' | 'error' | 'debate';
}

export interface WorkflowStep {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'completed';
  agents: {
    name: string;
    status: 'pending' | 'processing' | 'completed';
    progress: number;
  }[];
}

export interface DebateRound {
  bull: string;
  bear: string;
  round: number;
}

export interface RiskDebateRound {
  risky: string;
  safe: string;
  neutral: string;
  round: number;
}


// AI Analysis client
class AIAnalysisClient {
  private provider: string;
  private apiKey: string;
  private model: string;

  constructor(provider: string, apiKey: string, model?: string) {
    this.provider = provider;
    this.apiKey = apiKey;
    this.model = model || this.getDefaultModel(provider);
  }

  private getDefaultModel(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'gpt-4-turbo-preview';
      case 'anthropic':
        return 'claude-3-opus-20240229';
      case 'openrouter':
        return 'openai/gpt-4-turbo';
      default:
        return 'gpt-4-turbo-preview';
    }
  }

  private getApiUrl(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'https://api.openai.com/v1/chat/completions';
      case 'anthropic':
        return 'https://api.anthropic.com/v1/messages';
      case 'openrouter':
        return 'https://openrouter.ai/api/v1/chat/completions';
      default:
        return 'https://api.openai.com/v1/chat/completions';
    }
  }

  async analyze(systemPrompt: string, userPrompt: string): Promise<string> {
    if (this.provider === 'anthropic') {
      return this.analyzeAnthropic(systemPrompt, userPrompt);
    }

    // OpenAI and OpenRouter format
    const response = await fetch(this.getApiUrl(this.provider), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...(this.provider === 'openrouter' && {
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Tauric AI Trader',
        }),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private async analyzeAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(this.getApiUrl('anthropic'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI analysis failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }
}

// Main Trading Engine
export class TradingEngine {
  private dataSource: DataSourceManager;
  private ai: AIAnalysisClient;
  private onMessage?: (message: AgentMessage) => void;
  private onWorkflowUpdate?: (steps: WorkflowStep[]) => void;

  constructor(config: {
    aiProvider: string;
    aiApiKey: string;
    aiModel?: string;
    onMessage?: (message: AgentMessage) => void;
    onWorkflowUpdate?: (steps: WorkflowStep[]) => void;
  }) {
    // Initialize new data source manager with multiple sources
    this.dataSource = new DataSourceManager({
      preferredSource: 'auto', // Auto-select best source
    });

    this.ai = new AIAnalysisClient(config.aiProvider, config.aiApiKey, config.aiModel);
    this.onMessage = config.onMessage;
    this.onWorkflowUpdate = config.onWorkflowUpdate;

    // Log available data sources
    if (this.onMessage) {
      const sources = this.dataSource.getAvailableSources();
      this.onMessage({
        agent: 'System',
        message: `📡 Data sources available: ${sources.join(', ')}. Using intelligent fallback for maximum reliability.`,
        timestamp: new Date().toISOString(),
        type: 'info'
      });
    }
  }

  private sendMessage(agent: string, message: string, type: AgentMessage['type'] = 'info') {
    if (this.onMessage) {
      this.onMessage({
        agent,
        message,
        timestamp: new Date().toISOString(),
        type,
      });
    }
  }

  private updateWorkflow(steps: WorkflowStep[]) {
    if (this.onWorkflowUpdate) {
      this.onWorkflowUpdate(steps);
    }
  }

  async analyzeStock(ticker: string, date: string): Promise<AnalysisResult> {
    const workflowSteps: WorkflowStep[] = [
      {
        id: 'analysis',
        name: 'Analyst Team',
        status: 'pending',
        agents: [
          { name: 'Market Analyst', status: 'pending', progress: 0 },
          { name: 'Social Media Analyst', status: 'pending', progress: 0 },
          { name: 'News Analyst', status: 'pending', progress: 0 },
          { name: 'Fundamentals Analyst', status: 'pending', progress: 0 },
        ],
      },
      {
        id: 'research',
        name: 'Research Team',
        status: 'pending',
        agents: [
          { name: 'Bull Researcher', status: 'pending', progress: 0 },
          { name: 'Bear Researcher', status: 'pending', progress: 0 },
          { name: 'Research Manager', status: 'pending', progress: 0 },
        ],
      },
      {
        id: 'decision',
        name: 'Trading Decision',
        status: 'pending',
        agents: [
          { name: 'Trader', status: 'pending', progress: 0 },
        ],
      },
      {
        id: 'risk',
        name: 'Risk Management',
        status: 'pending',
        agents: [
          { name: 'Risky Analyst', status: 'pending', progress: 0 },
          { name: 'Safe Analyst', status: 'pending', progress: 0 },
          { name: 'Neutral Analyst', status: 'pending', progress: 0 },
          { name: 'Risk Manager', status: 'pending', progress: 0 },
        ],
      },
    ];

    this.updateWorkflow(workflowSteps);
    this.sendMessage('System', `Starting analysis for ${ticker} on ${date}`);

    try {
      // Step 1: Market Analysis
      workflowSteps[0].status = 'active';
      this.updateWorkflow(workflowSteps);

      // Market Data Analysis
      workflowSteps[0].agents[0].status = 'processing';
      this.updateWorkflow(workflowSteps);
      this.sendMessage('Market Analyst', 'Fetching market data and calculating indicators...');

      const marketAnalysis = await this.analyzeMarketData(ticker, date);

      workflowSteps[0].agents[0].status = 'completed';
      workflowSteps[0].agents[0].progress = 100;
      this.updateWorkflow(workflowSteps);
      this.sendMessage('Market Analyst', marketAnalysis, 'analysis');

      // Social Media Analysis
      workflowSteps[0].agents[1].status = 'processing';
      this.updateWorkflow(workflowSteps);
      this.sendMessage('Social Media Analyst', 'Analyzing social media sentiment and buzz...');

      const socialMediaAnalysis = await this.analyzeSocialMedia(ticker);

      workflowSteps[0].agents[1].status = 'completed';
      workflowSteps[0].agents[1].progress = 100;
      this.updateWorkflow(workflowSteps);
      this.sendMessage('Social Media Analyst', socialMediaAnalysis, 'analysis');

      // News Analysis
      workflowSteps[0].agents[2].status = 'processing';
      this.updateWorkflow(workflowSteps);
      this.sendMessage('News Analyst', 'Analyzing recent news and market events...');

      const newsAnalysis = await this.analyzeNews(ticker, date);

      workflowSteps[0].agents[2].status = 'completed';
      workflowSteps[0].agents[2].progress = 100;
      this.updateWorkflow(workflowSteps);
      this.sendMessage('News Analyst', newsAnalysis, 'analysis');

      // Fundamentals Analysis
      workflowSteps[0].agents[3].status = 'processing';
      this.updateWorkflow(workflowSteps);
      this.sendMessage('Fundamentals Analyst', 'Analyzing company fundamentals...');

      const fundamentalsAnalysis = await this.analyzeFundamentals(ticker);

      workflowSteps[0].agents[3].status = 'completed';
      workflowSteps[0].agents[3].progress = 100;
      workflowSteps[0].status = 'completed';
      this.updateWorkflow(workflowSteps);
      this.sendMessage('Fundamentals Analyst', fundamentalsAnalysis, 'analysis');

      // Step 2: Research Debate
      workflowSteps[1].status = 'active';
      this.updateWorkflow(workflowSteps);

      // Conduct research debate
      const researchDebate = await this.conductResearchDebate(ticker, {
        market: marketAnalysis,
        socialMedia: socialMediaAnalysis,
        news: newsAnalysis,
        fundamentals: fundamentalsAnalysis,
      });

      workflowSteps[1].agents[0].status = 'completed';
      workflowSteps[1].agents[0].progress = 100;
      workflowSteps[1].agents[1].status = 'completed';
      workflowSteps[1].agents[1].progress = 100;
      workflowSteps[1].agents[2].status = 'completed';
      workflowSteps[1].agents[2].progress = 100;
      workflowSteps[1].status = 'completed';
      this.updateWorkflow(workflowSteps);

      // Step 3: Trading Decision
      workflowSteps[2].status = 'active';
      workflowSteps[2].agents[0].status = 'processing';
      this.updateWorkflow(workflowSteps);
      this.sendMessage('Trader', 'Making trading decision based on analysis...');

      const tradingDecision = await this.makeTradingDecision(
        ticker,
        date,
        {
          market: marketAnalysis,
          socialMedia: socialMediaAnalysis,
          news: newsAnalysis,
          fundamentals: fundamentalsAnalysis,
        },
        researchDebate
      );

      workflowSteps[2].agents[0].status = 'completed';
      workflowSteps[2].agents[0].progress = 100;
      workflowSteps[2].status = 'completed';
      this.updateWorkflow(workflowSteps);
      this.sendMessage('Trader', `Decision: ${tradingDecision.decision} (Confidence: ${tradingDecision.confidence}%)`, 'decision');

      // Step 4: Risk Management
      workflowSteps[3].status = 'active';
      this.updateWorkflow(workflowSteps);

      // Conduct risk debate
      const riskDebate = await this.conductRiskDebate(ticker, tradingDecision);

      workflowSteps[3].agents[0].status = 'completed';
      workflowSteps[3].agents[0].progress = 100;
      workflowSteps[3].agents[1].status = 'completed';
      workflowSteps[3].agents[1].progress = 100;
      workflowSteps[3].agents[2].status = 'completed';
      workflowSteps[3].agents[2].progress = 100;
      workflowSteps[3].agents[3].status = 'completed';
      workflowSteps[3].agents[3].progress = 100;
      workflowSteps[3].status = 'completed';
      this.updateWorkflow(workflowSteps);

      this.sendMessage('System', 'Analysis complete', 'info');

      const result = {
        ticker,
        date,
        decision: tradingDecision.decision,
        confidence: tradingDecision.confidence,
        reasoning: tradingDecision.reasoning,
        agentInsights: {
          market: marketAnalysis,
          socialMedia: socialMediaAnalysis,
          news: newsAnalysis,
          fundamentals: fundamentalsAnalysis,
          researchDebate: researchDebate.rounds,
          researchManager: researchDebate.managerDecision,
          trader: tradingDecision.reasoning,
          riskDebate: riskDebate.rounds,
          riskManager: riskDebate.managerDecision,
        },
      };

      console.log('🎯 Trading engine analysis completed:', result);
      return result;
    } catch (error) {
      this.sendMessage('System', `Error during analysis: ${error}`, 'error');
      throw error;
    }
  }

  private async analyzeMarketData(ticker: string, date: string): Promise<string> {
    try {
      const endDate = new Date(date);
      const startDate = new Date(date);
      startDate.setDate(startDate.getDate() - 30);

      const fromTimestamp = Math.floor(startDate.getTime() / 1000);
      const toTimestamp = Math.floor(endDate.getTime() / 1000);

      console.log('📅 Date range for candles:', {
        inputDate: date,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        fromTimestamp,
        toTimestamp,
        fromReadable: new Date(fromTimestamp * 1000).toISOString(),
        toReadable: new Date(toTimestamp * 1000).toISOString()
      });

      let candles: any = { c: [], h: [], l: [], o: [], v: [], t: [] };
      let quote: any = { c: 0, dp: 0, v: 0 };

      try {
        candles = await this.dataSource.getCandles(ticker, fromTimestamp, toTimestamp);
        if (candles.c.length > 0) {
          this.sendMessage('Market Analyst', `✅ Successfully fetched ${candles.c.length} days of historical data for ${ticker}`, 'info');
        }
      } catch (error) {
        this.sendMessage('Market Analyst', `Warning: Could not fetch historical data for ${ticker}: ${error}`, 'info');
      }

      try {
        const unifiedQuote = await this.dataSource.getQuote(ticker);
        if (unifiedQuote) {
          // Convert to legacy format for compatibility
          quote = {
            c: unifiedQuote.currentPrice,
            dp: unifiedQuote.changePercent,
            d: unifiedQuote.change,
            v: unifiedQuote.volume,
            h: unifiedQuote.fiftyTwoWeekHigh,
            l: unifiedQuote.fiftyTwoWeekLow,
            marketCapitalization: unifiedQuote.marketCap,
            peBasicExclExtraTTM: unifiedQuote.peRatio,
          };
          this.sendMessage('Market Analyst', `✅ Successfully fetched current quote for ${ticker}: $${unifiedQuote.currentPrice}`, 'info');
        }
      } catch (error) {
        this.sendMessage('Market Analyst', `Warning: Could not fetch current quote for ${ticker}`, 'info');
      }

      // Calculate basic indicators
      const prices = candles.c || [];
      const sma50 = prices.length > 0 ? this.calculateSMA(prices, 50) : 0;
      const sma200 = prices.length > 0 ? this.calculateSMA(prices, 200) : 0;
      const rsi = prices.length > 0 ? this.calculateRSI(prices) : 50;

      const prompt = `
      Market Data Analysis for ${ticker}:
      - Current Price: ${quote.c > 0 ? `$${quote.c}` : 'N/A'}
      - Day Change: ${quote.dp !== undefined ? `${quote.dp}%` : 'N/A'}
      ${prices.length > 0 ? `- SMA50: $${sma50.toFixed(2)}
      - SMA200: $${sma200.toFixed(2)}
      - RSI: ${rsi.toFixed(2)}` : '- Technical indicators not available'}
      - Volume: ${quote.v || 'N/A'}
      
      ${prices.length > 0 ? 'Price trend over last 30 days available.' : 'Limited historical data available.'} Provide technical analysis insights based on available data.
      `;

      return this.ai.analyze(
        'You are a technical market analyst. Analyze the provided market data and indicators. If data is limited, provide analysis based on what is available.',
        prompt
      );
    } catch (error) {
      this.sendMessage('Market Analyst', `Error during analysis: ${error}`, 'error');
      throw error;
    }
  }

  private async analyzeNews(ticker: string, date: string): Promise<string> {
    try {
      const endDate = new Date(date);
      const startDate = new Date(date);
      startDate.setDate(startDate.getDate() - 7);

      let news: NewsItem[] = [];

      try {
        news = await this.dataSource.getNews(
          ticker,
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0]
        );
      } catch (error) {
        this.sendMessage('News Analyst', `Warning: Could not fetch news for ${ticker}: ${error}`, 'info');
      }

      const newsText = news.length > 0
        ? news
          .slice(0, 5)
          .map((item) => `- ${item.headline}: ${item.summary}`)
          .join('\n')
        : 'No recent news available for analysis.';

      const prompt = `
      Recent news for ${ticker}:
      ${newsText}
      
      ${news.length > 0 ? 'Analyze the sentiment and potential market impact of these news items.' : 'Provide general market sentiment analysis for this ticker based on your knowledge.'}
      `;

      return this.ai.analyze(
        'You are a news analyst. Analyze news sentiment and market impact. If no specific news is available, provide general analysis.',
        prompt
      );
    } catch (error) {
      this.sendMessage('News Analyst', `Error during analysis: ${error}`, 'error');
      throw error;
    }
  }

  private async analyzeSocialMedia(ticker: string): Promise<string> {
    try {
      let sentiment: any = {};

      try {
        sentiment = await this.dataSource.getSentiment(ticker);
      } catch (error) {
        this.sendMessage('Social Media Analyst', `Warning: Could not fetch sentiment data for ${ticker}: ${error}`, 'info');
      }

      const hasSentimentData = sentiment.buzz || sentiment.sentiment;

      const prompt = `
      Social media sentiment data for ${ticker}:
      ${hasSentimentData ? `- Social Buzz Score: ${sentiment.buzz?.buzz || 'N/A'}
      - Sentiment Score: ${sentiment.sentiment?.bullishPercent || 'N/A'}% bullish
      - Volume Change: ${sentiment.buzz?.volumeChange || 'N/A'}
      - Articles in Last Week: ${sentiment.buzz?.articlesInLastWeek || 'N/A'}` : '- No specific social media data available'}
      
      ${hasSentimentData ? 'Analyze social media sentiment, trending discussions, and retail investor mood.' : 'Provide general social media sentiment analysis based on market knowledge.'}
      `;

      return this.ai.analyze(
        'You are a social media analyst. Analyze social media sentiment, retail investor discussions, and trending topics. Focus on platforms like Reddit, Twitter, and StockTwits.',
        prompt
      );
    } catch (error) {
      this.sendMessage('Social Media Analyst', `Error during analysis: ${error}`, 'error');
      throw error;
    }
  }

  private async analyzeSentiment(ticker: string): Promise<string> {
    try {
      let sentiment: any = {};

      try {
        sentiment = await this.dataSource.getSentiment(ticker);
      } catch (error) {
        this.sendMessage('Sentiment Analyst', `Warning: Could not fetch sentiment data for ${ticker}: ${error}`, 'info');
      }

      const hasSentimentData = sentiment.buzz || sentiment.sentiment;

      const prompt = `
      Market sentiment data for ${ticker}:
      ${hasSentimentData ? `- Buzz: ${sentiment.buzz?.buzz || 'N/A'}
      - Sentiment Score: ${sentiment.sentiment?.bullishPercent || 'N/A'}% bullish
      - Volume: ${sentiment.buzz?.volumeChange || 'N/A'}` : '- No specific sentiment data available'}
      
      ${hasSentimentData ? 'Provide insights on market sentiment.' : 'Provide general sentiment analysis based on market knowledge.'}
      `;

      return this.ai.analyze(
        'You are a sentiment analyst. Analyze market sentiment data. If specific data is not available, provide general analysis.',
        prompt
      );
    } catch (error) {
      this.sendMessage('Sentiment Analyst', `Error during analysis: ${error}`, 'error');
      throw error;
    }
  }

  private async analyzeFundamentals(ticker: string): Promise<string> {
    try {
      let metrics: any = {};

      try {
        metrics = await this.dataSource.getMetrics(ticker);
      } catch (error) {
        this.sendMessage('Fundamentals Analyst', `Warning: Could not fetch fundamental data for ${ticker}: ${error}`, 'info');
      }

      const hasMetrics = metrics.metric && Object.keys(metrics.metric).length > 0;

      const prompt = `
      Fundamental metrics for ${ticker}:
      ${hasMetrics ? `- P/E Ratio: ${metrics.metric?.peBasicExclExtraTTM || 'N/A'}
      - Market Cap: ${metrics.metric?.marketCapitalization || 'N/A'}
      - 52W High: ${metrics.metric['52WeekHigh'] || 'N/A'}
      - 52W Low: ${metrics.metric['52WeekLow'] || 'N/A'}
      - Revenue Growth: ${metrics.metric?.revenueGrowthTTMYoy || 'N/A'}%` : '- No specific fundamental data available'}
      
      ${hasMetrics ? 'Analyze the fundamental health of the company.' : 'Provide fundamental analysis based on general knowledge of the company.'}
      `;

      return this.ai.analyze(
        'You are a fundamental analyst. Analyze company fundamentals. If specific metrics are not available, provide general analysis.',
        prompt
      );
    } catch (error) {
      this.sendMessage('Fundamentals Analyst', `Error during analysis: ${error}`, 'error');
      throw error;
    }
  }

  private async conductResearchDebate(
    ticker: string,
    analyses: Record<string, string>
  ): Promise<{ rounds: DebateRound[]; managerDecision: string }> {
    const rounds: DebateRound[] = [];
    const maxRounds = 2;

    for (let round = 1; round <= maxRounds; round++) {
      // Bull Researcher
      this.sendMessage('Bull Researcher', `Making bullish case (Round ${round})...`, 'debate');
      const bullPrompt = `
      You are a Bull Researcher advocating for investing in ${ticker}. Based on the following analysis:
      
      Market Analysis: ${analyses.market}
      Social Media Analysis: ${analyses.socialMedia}
      News Analysis: ${analyses.news}
      Fundamentals Analysis: ${analyses.fundamentals}
      ${rounds.length > 0 ? `
      
      Previous debate rounds:
      ${rounds.map(r => `Round ${r.round}:
      Bull: ${r.bull}
      Bear: ${r.bear}`).join('\n\n')}` : ''}
      
      Build a strong bullish case emphasizing growth potential, competitive advantages, and positive indicators.
      ${round > 1 ? 'Address the bear arguments from the previous round.' : ''}
      `;

      const bullArgument = await this.ai.analyze(
        'You are a Bull Researcher. Make compelling arguments for investment based on data.',
        bullPrompt
      );

      // Bear Researcher
      this.sendMessage('Bear Researcher', `Making bearish case (Round ${round})...`, 'debate');
      const bearPrompt = `
      You are a Bear Researcher cautioning against investing in ${ticker}. Based on the following analysis:
      
      Market Analysis: ${analyses.market}
      Social Media Analysis: ${analyses.socialMedia}
      News Analysis: ${analyses.news}
      Fundamentals Analysis: ${analyses.fundamentals}
      
      Current bull argument: ${bullArgument}
      ${rounds.length > 0 ? `
      
      Previous debate rounds:
      ${rounds.map(r => `Round ${r.round}:
      Bull: ${r.bull}
      Bear: ${r.bear}`).join('\n\n')}` : ''}
      
      Build a strong bearish case emphasizing risks, overvaluation, and negative indicators.
      Directly counter the bull's arguments with specific data and reasoning.
      `;

      const bearArgument = await this.ai.analyze(
        'You are a Bear Researcher. Make compelling arguments against investment based on data.',
        bearPrompt
      );

      rounds.push({
        bull: bullArgument,
        bear: bearArgument,
        round,
      });

      this.sendMessage('Bull Researcher', bullArgument, 'analysis');
      this.sendMessage('Bear Researcher', bearArgument, 'analysis');
    }

    // Research Manager Decision
    this.sendMessage('Research Manager', 'Evaluating research debate and making recommendation...', 'info');
    const managerPrompt = `
    You are the Research Manager. Review the debate between Bull and Bear researchers about ${ticker}:
    
    ${rounds.map(r => `Round ${r.round}:
    Bull Researcher: ${r.bull}
    
    Bear Researcher: ${r.bear}`).join('\n\n')}
    
    Based on the strength of arguments, data quality, and risk-reward analysis, provide:
    1. A summary of key points from both sides
    2. Your assessment of which side has stronger arguments
    3. A clear recommendation (BULLISH, BEARISH, or NEUTRAL) with reasoning
    `;

    const managerDecision = await this.ai.analyze(
      'You are a Research Manager. Synthesize the debate and make a balanced recommendation.',
      managerPrompt
    );

    this.sendMessage('Research Manager', managerDecision, 'decision');

    return {
      rounds,
      managerDecision,
    };
  }

  private async makeTradingDecision(
    ticker: string,
    date: string,
    analyses: Record<string, string>,
    researchDebate: { rounds: DebateRound[]; managerDecision: string }
  ): Promise<{ decision: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string }> {
    const prompt = `
    Based on the following comprehensive analysis for ${ticker} on ${date}:
    
    Market Analysis:
    ${analyses.market}
    
    Social Media Analysis:
    ${analyses.socialMedia}
    
    News Analysis:
    ${analyses.news}
    
    Fundamentals Analysis:
    ${analyses.fundamentals}
    
    Research Team Recommendation:
    ${researchDebate.managerDecision}
    
    As the Trader, synthesize all information and make a trading decision (BUY, SELL, or HOLD) with confidence percentage (0-100) and reasoning.
    Consider the research team's recommendation but make your own independent judgment.
    Format your response as JSON: {"decision": "BUY/SELL/HOLD", "confidence": 85, "reasoning": "..."}
    `;

    const response = await this.ai.analyze(
      'You are a trading agent. Make investment decisions based on comprehensive analysis.',
      prompt
    );

    try {
      const parsed = JSON.parse(response);
      return {
        decision: parsed.decision,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      };
    } catch {
      // Fallback parsing if JSON fails
      const decision = response.includes('BUY') ? 'BUY' : response.includes('SELL') ? 'SELL' : 'HOLD';
      const confidenceMatch = response.match(/(\d+)%/);
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 70;

      return {
        decision,
        confidence,
        reasoning: response,
      };
    }
  }

  private async conductRiskDebate(
    ticker: string,
    tradingDecision: { decision: string; confidence: number; reasoning: string }
  ): Promise<{ rounds: RiskDebateRound[]; managerDecision: string }> {
    const rounds: RiskDebateRound[] = [];
    const maxRounds = 2;

    for (let round = 1; round <= maxRounds; round++) {
      // Risky Analyst
      this.sendMessage('Risky Analyst', `Advocating for aggressive position (Round ${round})...`, 'debate');
      const riskyPrompt = `
      You are the Risky Risk Analyst advocating for high-reward opportunities with ${ticker}.
      Trading decision: ${tradingDecision.decision} with ${tradingDecision.confidence}% confidence
      Reasoning: ${tradingDecision.reasoning}
      ${rounds.length > 0 ? `
      
      Previous debate:
      ${rounds[rounds.length - 1].safe}
      ${rounds[rounds.length - 1].neutral}` : ''}
      
      Champion bold strategies and maximum position sizing. Emphasize upside potential and competitive advantages.
      ${round > 1 ? 'Counter the conservative arguments from the previous round.' : ''}
      `;

      const riskyArgument = await this.ai.analyze(
        'You are a Risky Risk Analyst. Advocate for aggressive positioning and high-reward strategies.',
        riskyPrompt
      );

      // Safe Analyst
      this.sendMessage('Safe Analyst', `Advocating for conservative position (Round ${round})...`, 'debate');
      const safePrompt = `
      You are the Safe Risk Analyst advocating for capital preservation with ${ticker}.
      Trading decision: ${tradingDecision.decision} with ${tradingDecision.confidence}% confidence
      Reasoning: ${tradingDecision.reasoning}
      
      Current risky argument: ${riskyArgument}
      ${rounds.length > 0 ? `
      
      Previous debate:
      ${rounds[rounds.length - 1].risky}
      ${rounds[rounds.length - 1].neutral}` : ''}
      
      Emphasize capital preservation, downside protection, and conservative position sizing.
      Counter the aggressive stance with specific risk factors and worst-case scenarios.
      `;

      const safeArgument = await this.ai.analyze(
        'You are a Safe Risk Analyst. Advocate for conservative positioning and capital preservation.',
        safePrompt
      );

      // Neutral Analyst
      this.sendMessage('Neutral Analyst', `Providing balanced perspective (Round ${round})...`, 'debate');
      const neutralPrompt = `
      You are the Neutral Risk Analyst providing balanced risk assessment for ${ticker}.
      Trading decision: ${tradingDecision.decision} with ${tradingDecision.confidence}% confidence
      Reasoning: ${tradingDecision.reasoning}
      
      Risky argument: ${riskyArgument}
      Safe argument: ${safeArgument}
      
      Provide a balanced perspective considering both upside potential and downside risks.
      Suggest moderate position sizing and specific risk management strategies.
      `;

      const neutralArgument = await this.ai.analyze(
        'You are a Neutral Risk Analyst. Provide balanced risk assessment and moderate strategies.',
        neutralPrompt
      );

      rounds.push({
        risky: riskyArgument,
        safe: safeArgument,
        neutral: neutralArgument,
        round,
      });

      this.sendMessage('Risky Analyst', riskyArgument, 'analysis');
      this.sendMessage('Safe Analyst', safeArgument, 'analysis');
      this.sendMessage('Neutral Analyst', neutralArgument, 'analysis');
    }

    // Risk Manager Decision
    this.sendMessage('Risk Manager', 'Evaluating risk perspectives and making final assessment...', 'info');
    const managerPrompt = `
    You are the Risk Manager. Review the risk debate about ${ticker}:
    
    Trading Decision: ${tradingDecision.decision} with ${tradingDecision.confidence}% confidence
    
    ${rounds.map(r => `Round ${r.round}:
    Risky Analyst: ${r.risky}
    
    Safe Analyst: ${r.safe}
    
    Neutral Analyst: ${r.neutral}`).join('\n\n')}
    
    Provide final risk assessment including:
    1. Position sizing recommendation (percentage of portfolio)
    2. Stop-loss levels
    3. Risk/reward ratio
    4. Key risk factors to monitor
    5. Final approval or modification of the trading decision
    `;

    const managerDecision = await this.ai.analyze(
      'You are a Risk Manager. Make final risk assessment and position sizing recommendations.',
      managerPrompt
    );

    this.sendMessage('Risk Manager', managerDecision, 'decision');

    return {
      rounds,
      managerDecision,
    };
  }

  // Helper methods
  private calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }
}

// Factory function to create engine with user settings
export async function createTradingEngine(config?: {
  onMessage?: (message: AgentMessage) => void;
  onWorkflowUpdate?: (steps: WorkflowStep[]) => void;
}) {
  const authState = useAuth.getState();
  const apiSettings = authState.apiSettings;


  // Get the AI API key
  const aiApiKey = apiSettings.ai_api_key || '';

  if (!aiApiKey) {
    throw new Error(`${apiSettings.ai_provider} API key not configured. Please configure in Settings.`);
  }

  return new TradingEngine({
    aiProvider: apiSettings.ai_provider,
    aiApiKey: aiApiKey,
    aiModel: apiSettings.ai_model,
    ...config,
  });
}