import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { appendAnalysisMessage, updateAgentInsights, updateWorkflowStepStatus, updateAnalysisPhase, setAgentToError } from '../_shared/atomicUpdate.ts'
import { callAIProviderWithRetry, SYSTEM_PROMPTS } from '../_shared/aiProviders.ts'
import { checkAnalysisCancellation } from '../_shared/cancellationCheck.ts'
import { notifyCoordinatorAsync } from '../_shared/coordinatorNotification.ts'
import { invokeNextAgentInSequence } from '../_shared/phaseProgressChecker.ts'
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts'
import { checkAgentCompletion, checkForBlockingOperations } from '../_shared/agentCompletionCheck.ts'
import { AgentRequest } from '../_shared/types.ts'
import {
  createMethodNotAllowedResponse,
  createMissingParametersResponse,
  createCanceledResponse,
  createSuccessResponse,
  createErrorResponse,
  createApiErrorResponse,
  createConfigurationErrorResponse
} from '../_shared/responseHelpers.ts'
import {
  getCachedMarketDataWithIndicators,
  formatIndicatorsForAI,
  type HistoricalPrice,
  type TechnicalIndicators
} from '../_shared/technicalIndicators.ts'
import { formatNYTimestamp, getMarketSession } from '../_shared/timezoneUtils.ts'

// Extended interface for Market Analyst specific settings
interface MarketAnalystRequest extends AgentRequest {
  apiSettings: AgentRequest['apiSettings'] & {
    // Alpaca credentials for market data
    alpaca_paper_api_key?: string;
    alpaca_paper_secret_key?: string;
    alpaca_live_api_key?: string;
    alpaca_live_secret_key?: string;
    alpaca_paper_trading?: boolean;
  };
  context?: {
    messages: any[];
    workflowSteps: any[];
  };
}

interface MarketAnalysisData {
  ticker: string;
  company: string;
  currentPrice: number;
  dayChange: number;
  dayChangePercent: number;
  volume: number;
  marketCap: number | null;
  historicalData: HistoricalPrice[];
  technicalIndicators: TechnicalIndicators;
  analysisRange: string;
  dataPoints: number;
}

serve(async (req) => {
  let timeoutId: number | null = null;

  try {
    if (req.method !== 'POST') {
      return createMethodNotAllowedResponse();
    }

    const request: MarketAnalystRequest = await req.json();
    const { analysisId, ticker, userId, apiSettings, analysisContext } = request;

    if (!analysisId || !ticker || !userId || !apiSettings) {
      const missingParams = [];
      if (!analysisId) missingParams.push('analysisId');
      if (!ticker) missingParams.push('ticker');
      if (!userId) missingParams.push('userId');
      if (!apiSettings) missingParams.push('apiSettings');
      return createMissingParametersResponse(missingParams);
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const retryStatus = getRetryStatus(request);
    console.log(`📈 Market Analyst starting for: ${ticker} (${retryStatus})`);
    console.log(`🕒 Analysis time: ${formatNYTimestamp()} - Market session: ${getMarketSession()}`);
    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);
    console.log(`📊 Using Alpaca for reliable historical data and technical indicators`);

    // Check if this agent has already completed for this analysis
    // Check if this is a retry attempt (from retry count in request)
    const isRetryAttempt = request.retryCount !== undefined && request.retryCount > 0;
    
    const completionStatus = await checkAgentCompletion(
      supabase,
      analysisId,
      'agent-market-analyst',
      'Market Analyst',
      isRetryAttempt
    );
    
    if (completionStatus.hasCompleted && completionStatus.status === 'completed') {
      console.log(`✅ Market Analyst already completed for analysis ${analysisId}`);
      console.log(`   Skipping duplicate execution to save API calls`);
      
      // Clear any timeout that might have been set
      if (timeoutId !== null) {
        clearAgentTimeout(timeoutId, 'Market Analyst', 'already completed');
      }
      
      // Return the existing insights if available
      return createSuccessResponse({
        agent: 'Market Analyst',
        message: 'Agent already completed for this analysis',
        alreadyCompleted: true,
        existingInsights: completionStatus.existingInsights,
        retryInfo: getRetryStatus(request)
      });
    }
    
    // Don't check for "already running" - the coordinator handles that before invocation
    // The agent will see itself as "running" because the coordinator marks it as such
    // Only check for "already completed" to avoid re-doing work
    
    // Check for any blocking operations
    const blockingCheck = await checkForBlockingOperations(supabase, analysisId, 'agent-market-analyst');
    if (!blockingCheck.canProceed) {
      console.log(`🛑 Market Analyst cannot proceed: ${blockingCheck.reason}`);
      return createCanceledResponse(
        `Market Analyst cannot proceed: ${blockingCheck.reason}`,
        true
      );
    }

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      {
        functionName: 'agent-market-analyst',
        maxRetries: 3,
        timeoutMs: 180000, // 3 minutes
        retryDelay: 3000   // 3 second delay between retries
      },
      'Market Analyst'
    );

    // Check if analysis has been canceled before starting work
    const cancellationCheck = await checkAnalysisCancellation(supabase, analysisId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 Market Analyst stopped: ${cancellationCheck.reason}`);
      return createCanceledResponse(
        `Market Analyst stopped: ${cancellationCheck.reason}`,
        cancellationCheck.isCanceled
      );
    }

    // Check if analysis still exists by trying to update it (deletion check)
    const updateResult = await updateAnalysisPhase(supabase, analysisId, 'Market Analyst analyzing', {
      agent: 'Market Analyst',
      message: 'Starting market data analysis',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // If analysis phase update fails, it likely means analysis was deleted
    if (!updateResult.success) {
      console.log(`🛑 Market Analyst stopped: ${updateResult.error}`);
      return createCanceledResponse(
        `Market Analyst stopped: ${updateResult.error}`,
        true
      );
    }

    // Get analysis configuration
    const marketRange = apiSettings.analysis_history_days || '1Y';

    console.log(`📅 Analyzing ${marketRange} of historical data with comprehensive technical analysis`);

    // Fetch cached market data with indicators (daily caching)
    let marketData: MarketAnalysisData;
    let agentError = null;

    try {
      console.log(`💾 Checking cache for ${ticker} (${marketRange})...`);
      console.log(`🔐 Alpaca credentials available: ${!!(apiSettings.alpaca_paper_api_key || apiSettings.alpaca_live_api_key)}`);

      // Temporarily store user credentials in supabase client context for the shared function
      supabase._userCredentials = {
        userId,
        alpaca_paper_api_key: apiSettings.alpaca_paper_api_key,
        alpaca_paper_secret_key: apiSettings.alpaca_paper_secret_key,
        alpaca_live_api_key: apiSettings.alpaca_live_api_key,
        alpaca_live_secret_key: apiSettings.alpaca_live_secret_key,
        alpaca_paper_trading: apiSettings.alpaca_paper_trading
      };

      const cachedResult = await getCachedMarketDataWithIndicators(ticker, marketRange, supabase);

      const { historical: historicalData, indicators: technicalIndicators, fromCache } = cachedResult;

      if (!historicalData || historicalData.length < 20) {
        throw new Error(`Insufficient historical data for ${ticker}. Got ${historicalData?.length || 0} data points, need at least 20.`);
      }

      console.log(`✅ ${fromCache ? 'Cached' : 'Fresh'} data: ${historicalData.length} data points for ${ticker}`);
      if (fromCache) {
        console.log(`🎯 Cache hit - using today's cached data for ${ticker}`);
      } else {
        console.log(`🌐 Cache miss - fetched fresh data from Yahoo Finance`);
      }

      // Get current market data (latest data point)
      const latestData = historicalData[historicalData.length - 1];
      const previousData = historicalData[historicalData.length - 2];

      marketData = {
        ticker: ticker.toUpperCase(),
        company: ticker.toUpperCase(), // Yahoo Finance doesn't provide company name in this endpoint
        currentPrice: latestData.close,
        dayChange: latestData.close - previousData.close,
        dayChangePercent: ((latestData.close - previousData.close) / previousData.close) * 100,
        volume: latestData.volume,
        marketCap: null, // Not available from this Yahoo Finance endpoint
        historicalData,
        technicalIndicators,
        analysisRange: marketRange,
        dataPoints: historicalData.length
      };

      console.log(`✅ Technical indicators ready (${fromCache ? 'cached' : 'calculated'})`);
      console.log(`💰 Current Price: $${marketData.currentPrice.toFixed(2)} (${marketData.dayChangePercent >= 0 ? '+' : ''}${marketData.dayChangePercent.toFixed(2)}%)`);

    } catch (error) {
      console.error('❌ Error fetching market data:', error);
      agentError = `Failed to fetch market data: ${error.message}`;

      // Create minimal fallback data structure
      marketData = {
        ticker: ticker.toUpperCase(),
        company: ticker.toUpperCase(),
        currentPrice: 0,
        dayChange: 0,
        dayChangePercent: 0,
        volume: 0,
        marketCap: null,
        historicalData: [],
        technicalIndicators: {} as TechnicalIndicators,
        analysisRange: marketRange,
        dataPoints: 0
      };
    }

    // Build and call AI analysis
    let analysisText = '';

    try {
      if (!agentError) {
        analysisText = await analyzeWithAI(marketData, apiSettings, analysisContext);

        // Validate that we got a response
        if (!analysisText || analysisText.trim() === '') {
          console.error('⚠️ Market Analyst received empty analysis text from AI');
          throw new Error('AI provider returned empty response');
        }
      } else {
        throw new Error(agentError);
      }
    } catch (aiError) {
      console.error('❌ AI analysis failed:', aiError.message);
      agentError = aiError.message || 'Failed to get AI response';

      // Create a detailed fallback analysis
      analysisText = createFallbackAnalysis(marketData, agentError);
      console.log('📝 Using fallback analysis due to error');
    }

    // Create structured insight object with full market data and indicators
    const agentOutput = {
      agent: 'Market Analyst',
      timestamp: new Date().toISOString(),
      data: {
        ticker: marketData.ticker,
        currentPrice: marketData.currentPrice,
        dayChange: marketData.dayChange,
        dayChangePercent: marketData.dayChangePercent,
        volume: marketData.volume,
        analysisRange: marketData.analysisRange,
        dataPoints: marketData.dataPoints
      },
      market_historical: marketData.historicalData, // Store full 1Y historical data
      technical_indicators: marketData.technicalIndicators, // Store all calculated indicators
      analysis: analysisText, // The AI analysis text
      error: agentError,
      summary: {
        currentPrice: marketData.currentPrice,
        dayChange: marketData.dayChangePercent,
        volume: marketData.volume,
        dataPoints: marketData.dataPoints,
        indicatorsCalculated: Object.keys(marketData.technicalIndicators || {}).length,
        analysisRange: marketData.analysisRange
      }
    };

    console.log(`📊 Market Analyst insight created - Analysis length: ${analysisText.length} chars`);
    console.log(`🔧 Indicators calculated: ${Object.keys(marketData.technicalIndicators || {}).length}`);

    // Update analysis atomically to prevent race conditions
    console.log('💾 Updating analysis results atomically...');

    // Handle agent completion - either success or error
    if (agentError) {
      // Set agent to error status using the new helper function
      const errorResult = await setAgentToError(
        supabase,
        analysisId,
        'analysis',
        'Market Analyst',
        agentError,
        agentError.includes('rate limit') || agentError.includes('quota') ? 'rate_limit' :
          agentError.includes('API key') || agentError.includes('invalid key') || agentError.includes('api_key') ? 'api_key' :
            agentError.includes('Yahoo Finance') || agentError.includes('data') ? 'data_fetch' :
              agentError.includes('AI provider') || agentError.includes('No API key provided') ? 'ai_error' : 'other',
        ticker,
        userId,
        apiSettings
      );
      if (!errorResult.success) {
        console.error('Failed to set agent to error:', errorResult.error);
      }
    } else {
      // Update agent insights for successful completion
      const insightsResult = await updateAgentInsights(supabase, analysisId, 'marketAnalyst', agentOutput);
      if (!insightsResult.success) {
        console.error('Failed to update insights:', insightsResult.error);
      }

      // Append message atomically
      const messageResult = await appendAnalysisMessage(
        supabase,
        analysisId,
        'Market Analyst',
        analysisText,
        'analysis'
      );
      if (!messageResult.success) {
        console.error('Failed to append message:', messageResult.error);
      }

      // Update workflow step status to completed
      const statusResult = await updateWorkflowStepStatus(
        supabase,
        analysisId,
        'analysis',
        'Market Analyst',
        'completed'
      );
      if (!statusResult.success) {
        console.error('Failed to update workflow status:', statusResult.error);
      }
    }

    // Clear timeout on successful completion
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Market Analyst', 'completed successfully');
    }

    console.log(`✅ Market Analyst data saved successfully`);
    console.log(`✅ Market Analyst completed for: ${ticker} (${retryStatus})`);

    // Only invoke next agent if this agent completed successfully
    if (agentError) {
      // Notify coordinator about the error - do NOT invoke next agent
      console.log(`⚠️ Market Analyst completed with errors - notifying coordinator, NOT invoking next agent`);
      notifyCoordinatorAsync(supabase, {
        analysisId,
        ticker,
        userId,
        phase: 'analysis',
        agent: 'market-analyst',
        apiSettings,
        error: agentError,
        errorType: agentError.includes('rate limit') || agentError.includes('quota') ? 'rate_limit' :
          agentError.includes('API key') || agentError.includes('invalid key') || agentError.includes('api_key') ? 'api_key' :
            agentError.includes('Yahoo Finance') || agentError.includes('data') ? 'data_fetch' :
              agentError.includes('AI provider') || agentError.includes('No API key provided') ? 'ai_error' : 'other',
        completionType: 'error',
        analysisContext: analysisContext
      }, 'Market Analyst');
    } else {
      // Success case - invoke next agent
      console.log(`🔄 Market Analyst attempting to invoke next agent in analysis phase...`);

      const nextAgentResult = await invokeNextAgentInSequence(
        supabase,
        analysisId,
        'analysis',
        'market-analyst',
        ticker,
        userId,
        apiSettings,
        request.analysisContext
      );

      if (nextAgentResult.success) {
        if (nextAgentResult.isLastInPhase) {
          // We're the last agent in analysis phase - notify coordinator for phase transition
          console.log(`📋 Market Analyst is last in analysis phase - notifying coordinator for phase transition`);
          notifyCoordinatorAsync(supabase, {
            analysisId,
            ticker,
            userId,
            phase: 'analysis',
            agent: 'market-analyst',
            apiSettings,
            completionType: 'last_in_phase',
            analysisContext: analysisContext
          }, 'Market Analyst');
        } else {
          console.log(`✅ Market Analyst successfully handed off to: ${nextAgentResult.nextAgent}`);
        }
      } else {
        // Failed to invoke next agent - fallback to coordinator
        console.log(`⚠️ Failed to invoke next agent, falling back to coordinator: ${nextAgentResult.error}`);
        notifyCoordinatorAsync(supabase, {
          analysisId,
          ticker,
          userId,
          phase: 'analysis',
          agent: 'market-analyst',
          apiSettings,
          completionType: 'fallback_invocation_failed',
          failedToInvoke: nextAgentResult.intendedAgent,
          analysisContext: analysisContext
        }, 'Market Analyst');
      }
    }

    return createSuccessResponse({
      agent: 'Market Analyst',
      analysis: analysisText,
      data: marketData.data || marketData,
      dataSource: 'Yahoo Finance',
      indicatorsCount: Object.keys(marketData.technicalIndicators || {}).length,
      retryInfo: retryStatus
    });

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Market Analyst', 'error occurred');
    }

    console.error('❌ Market Analyst error:', error);

    // Determine the type of error and provide a helpful message
    let errorMessage = 'Market analysis failed due to an internal error.';

    if (error.message.includes('API key') || error.message.includes('api_key') || error.message.includes('invalid key')) {
      return createApiErrorResponse('AI Provider', 'key');
    } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
      return createApiErrorResponse('AI Provider', 'quota');
    } else if (error.message.includes('Yahoo Finance') || error.message.includes('market data')) {
      errorMessage = 'Failed to fetch market data. Please verify the ticker symbol and try again.';
    } else if (error.message.includes('Supabase') || error.message.includes('database')) {
      errorMessage = 'Database error occurred during analysis. Please try again.';
    } else if (error.message.includes('SUPABASE_URL') || error.message.includes('SERVICE_ROLE_KEY')) {
      return createConfigurationErrorResponse('Server');
    } else {
      errorMessage = `Market analysis failed: ${error.message}`;
    }

    return createErrorResponse(errorMessage, 200, { agent: 'Market Analyst' });
  }
});

async function analyzeWithAI(marketData: MarketAnalysisData, apiSettings: any, analysisContext?: any): Promise<string> {
  // Comprehensive technical analysis instructions
  const promptInstructions = 'Write a detailed and comprehensive technical analysis with actionable insights for traders.';
  const indicatorFocus = 'Analyze all moving averages, MACD (line, signal, histogram), RSI, Bollinger Bands, ATR, volume patterns, and identify key support/resistance levels.';

  // Format technical indicators for AI analysis (downsampled to 30 points with most recent data preserved)
  const formattedIndicators = formatIndicatorsForAI(marketData.technicalIndicators, marketData.historicalData, 30);
  console.log(`📊 Downsampled ${marketData.dataPoints} data points to 30 for efficient AI analysis (most recent point preserved)`);

  // Create market summary
  const marketSummary = {
    ticker: marketData.ticker,
    currentPrice: marketData.currentPrice,
    dayChange: marketData.dayChange,
    dayChangePercent: marketData.dayChangePercent,
    volume: marketData.volume,
    analysisRange: marketData.analysisRange,
    totalDataPoints: marketData.dataPoints,
    downsampledPoints: 30
  };

  // Note: Position context is available in analysisContext but not included in prompt
  
  const prompt = `You are a professional technical analyst analyzing ${marketData.ticker}.

${promptInstructions}

${indicatorFocus}
**Current Market Summary:**
${JSON.stringify(marketSummary, null, 2)}

**Technical Analysis Data:**
${formattedIndicators}

**Analysis Instructions:**
- Use the comprehensive technical indicator data provided above
- The data includes ${marketData.dataPoints} data points downsampled to 30 for analysis (most recent data point preserved)
- All major technical indicators are calculated: Moving Averages, MACD, RSI, Bollinger Bands, ATR, Volume indicators
- Support and resistance levels are identified from price action
- Focus on recent trends and current market conditions
- Provide specific price levels and actionable insights

**Response Format:**
1. **Executive Summary** - Key findings and current market state
2. **Trend Analysis** - Short, medium, and long-term trends from moving averages
3. **Momentum Analysis** - RSI, MACD, and stochastic insights
4. **Volatility & Support/Resistance** - Bollinger Bands, ATR, key levels
5. **Volume Analysis** - Volume trends and confirmation signals
6. **Trading Outlook** - Potential scenarios and key levels to watch

**Requirements:**
- Provide specific price levels where possible
- Include probability assessments for different scenarios
- Mention risk factors and confirmation signals
- End with a comprehensive markdown table summarizing key metrics

Analyze the comprehensive technical data and provide professional insights that would be valuable for institutional traders.`;

  try {
    // Use analysis_max_tokens if configured, otherwise default to comprehensive analysis
    const maxTokens = apiSettings.analysis_max_tokens || 2400;
    console.log(`📝 Using ${maxTokens} max tokens for comprehensive market analysis`);
    console.log(`🤖 Calling AI provider: ${apiSettings.ai_provider || 'openai'} with model: ${apiSettings.ai_model || 'default'}`);
    console.log(`🔑 API Key present: ${!!apiSettings.ai_api_key}`);
    console.log(`📊 Prompt length: ${prompt.length} chars`);

    const result = await callAIProviderWithRetry(apiSettings, prompt, SYSTEM_PROMPTS.marketAnalyst, maxTokens, 3);

    console.log(`✅ AI response received - Length: ${result?.length || 0} chars`);
    if (!result || result.trim() === '') {
      console.error('⚠️ AI provider returned empty response');
      throw new Error('AI provider returned empty response. Please check your API configuration.');
    }

    return result;
  } catch (error) {
    console.error(`AI analysis error:`, error);
    throw error;
  }
}

function createFallbackAnalysis(marketData: MarketAnalysisData, error: string): string {
  return `# Market Analysis for ${marketData.ticker}

## Analysis Status
⚠️ **Limited Analysis Available**: ${error}

## Available Market Data
- **Ticker**: ${marketData.ticker}
- **Analysis Range**: ${marketData.analysisRange}
- **Data Points**: ${marketData.dataPoints}

${marketData.currentPrice > 0 ? `
## Current Market Status
- **Current Price**: $${marketData.currentPrice.toFixed(2)}
- **Day Change**: ${marketData.dayChangePercent >= 0 ? '+' : ''}${marketData.dayChangePercent.toFixed(2)}%
- **Volume**: ${(marketData.volume / 1000000).toFixed(2)}M shares

## Historical Context
- **Analysis Period**: ${marketData.analysisRange}
- **Data Quality**: ${marketData.dataPoints} trading days analyzed
` : ''}

## Technical Analysis
**Status**: Unable to complete full technical analysis due to data retrieval issues.

## Recommendations
1. **Data Issue**: Please verify ticker symbol and try again
2. **Manual Review**: Consider checking market data from alternative sources
3. **Retry Analysis**: Technical issues may be temporary

## Risk Notice
This analysis is incomplete due to technical limitations. Please use alternative data sources for trading decisions.

| Metric | Status |
|--------|--------|
| Data Source | Yahoo Finance (Failed) |
| Technical Indicators | Not Available |
| Price Analysis | ${marketData.currentPrice > 0 ? 'Limited' : 'Not Available'} |
| Recommendation | Manual Review Required |

*Analysis generated with limited data due to: ${error}*`;
}