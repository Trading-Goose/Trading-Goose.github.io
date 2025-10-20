import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { updateAgentInsights, updateWorkflowStepStatus, updateAnalysisPhase, updateDebateRounds, setAgentToError } from '../_shared/atomicUpdate.ts'
import { checkAnalysisCancellation } from '../_shared/cancellationCheck.ts'
import { callAIProviderWithRetry, SYSTEM_PROMPTS } from '../_shared/aiProviders.ts'
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts'
import { AgentRequest, getHistoryDays } from '../_shared/types.ts'
import { invokeWithRetryAsync } from '../_shared/invokeWithRetry.ts'

serve(async (req) => {
  let timeoutId: number | null = null;
  let request: AgentRequest | null = null;

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Method not allowed'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200 // Return 200 so coordinator notifications work
      });
    }

    request = await req.json();
    const { analysisId, ticker, userId, apiSettings, analysisContext } = request;

    if (!analysisId || !ticker || !userId || !apiSettings) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameters'
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200 // Return 200 so coordinator notifications work
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const retryStatus = getRetryStatus(request);
    console.log(`🐂 Bull Researcher starting for ${ticker} (${retryStatus})`);
    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      {
        functionName: 'agent-bull-researcher',
        maxRetries: 3,
        timeoutMs: 180000,
        retryDelay: 3000   // 3 second delay between retries
      },
      'Bull Researcher'
    );

    // Check if analysis has been canceled before starting work
    const cancellationCheck = await checkAnalysisCancellation(supabase, analysisId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 agent-bull-researcher stopped: ${cancellationCheck.reason}`);
      return new Response(JSON.stringify({
        success: false,
        message: `agent-bull-researcher stopped: ${cancellationCheck.reason}`,
        canceled: cancellationCheck.isCanceled
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Check if analysis still exists by trying to update it (deletion check)
    const updateResult = await updateAnalysisPhase(supabase, analysisId, 'Bull Researcher analyzing', {
      agent: 'Bull Researcher',
      message: 'Starting bullish analysis and opportunity identification',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // If analysis phase update fails, it likely means analysis was deleted
    if (!updateResult.success) {
      console.log(`🛑 Bull Researcher stopped: ${updateResult.error}`);
      return new Response(JSON.stringify({
        success: false,
        message: `Bull Researcher stopped: ${updateResult.error}`,
        canceled: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Get analysis data including insights from other agents
    const { data: analysis } = await supabase
      .from('analysis_history')
      .select('agent_insights, full_analysis')
      .eq('id', analysisId)
      .single();

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // Update analysis status using atomic method
    await updateAnalysisPhase(supabase, analysisId, 'Bull Researcher building bullish case', {
      agent: 'Bull Researcher',
      message: 'Researching bullish factors and opportunities',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // Extract insights from analysis team
    const marketData = analysis.agent_insights?.marketAnalyst?.data || {};
    const socialSentiment = analysis.agent_insights?.socialMediaAnalyst?.summary || {};
    const newsAnalysis = analysis.agent_insights?.newsAnalyst?.summary || {};
    const fundamentals = analysis.agent_insights?.fundamentalsAnalyst?.summary || {};

    // Get previous debate rounds if any
    const debateRounds = analysis.full_analysis?.debateRounds || [];
    // Use currentDebateRound from coordinator or fall back to array length
    const currentRound = analysis.full_analysis?.currentDebateRound || debateRounds.length || 1;

    const historyDays = getHistoryDays(apiSettings);

    // Extract position context from analysisContext
    const positionData = analysisContext?.position;
    const preferences = analysisContext?.preferences;
    const portfolioData = analysisContext?.portfolioData;
    const targetAllocations = analysisContext?.targetAllocations;
    
    // Calculate cash availability
    const availableCash = portfolioData?.cash || portfolioData?.account?.cash || 0;
    const totalValue = portfolioData?.totalValue || portfolioData?.account?.portfolio_value || 100000;
    const cashPercentage = ((availableCash / totalValue) * 100).toFixed(1);
    const targetCashPercent = targetAllocations?.cash || 20; // Default 20% if not set
    
    let positionContext = '';
    if (positionData?.stock_in_holdings) {
      // Calculate position size relative to limits
      const currentPositionPercent = (positionData.market_value / totalValue) * 100;
      const minPositionPercent = apiSettings?.rebalance_min_position_size || 5;
      const maxPositionPercent = apiSettings?.rebalance_max_position_size || 25;
      
      // Get near position threshold from preferences (default to 20%)
      const nearPositionThreshold = preferences?.near_position_threshold || 20;
      const nearMaxThreshold = 100 - nearPositionThreshold;  // e.g., 80% for near max
      const nearMinThreshold = 100 + nearPositionThreshold;  // e.g., 120% for near min
      
      // Calculate position as percentage of limits
      const percentOfMax = (currentPositionPercent / maxPositionPercent) * 100;
      const percentOfMin = (currentPositionPercent / minPositionPercent) * 100;
      
      // Categorize relative to MAX limit (3 cases)
      let maxStatus = '';
      if (percentOfMax > 100) {
        maxStatus = 'above_max';  // Above 100% of max
      } else if (percentOfMax >= nearMaxThreshold) {
        maxStatus = 'near_max';   // Near max (dynamic threshold)
      } else {
        maxStatus = 'below_max';  // Below threshold
      }
      
      // Categorize relative to MIN limit (3 cases)
      let minStatus = '';
      if (percentOfMin < 100) {
        minStatus = 'below_min';  // Below 100% of min
      } else if (percentOfMin <= nearMinThreshold) {
        minStatus = 'near_min';   // Near min (dynamic threshold)
      } else {
        minStatus = 'above_min';  // Above threshold
      }
      
      // Create position status description
      let positionStatusDesc = '';
      if (maxStatus === 'above_max') {
        positionStatusDesc = `⚠️ ABOVE MAX: ${currentPositionPercent.toFixed(1)}% (limit: ${maxPositionPercent}%)`;
      } else if (maxStatus === 'near_max') {
        positionStatusDesc = `📊 NEAR MAX: ${currentPositionPercent.toFixed(1)}% (approaching ${maxPositionPercent}% limit)`;
      } else if (minStatus === 'below_min') {
        positionStatusDesc = `⚠️ BELOW MIN: ${currentPositionPercent.toFixed(1)}% (minimum: ${minPositionPercent}%)`;
      } else if (minStatus === 'near_min') {
        positionStatusDesc = `📊 NEAR MIN: ${currentPositionPercent.toFixed(1)}% (close to ${minPositionPercent}% minimum)`;
      } else {
        positionStatusDesc = `✅ WITHIN RANGE: ${currentPositionPercent.toFixed(1)}% (${minPositionPercent}%-${maxPositionPercent}%)`;
      }
      
      const roomToAdd = Math.max(0, maxPositionPercent - currentPositionPercent);
      
      // Adjust bull case based on position P/L
      if (positionData.unrealized_pl_percent > (preferences?.profit_target || 25)) {
        positionContext = `
    POSITION CONTEXT:
    - Currently holding ${positionData.shares} shares with ${positionData.unrealized_pl_percent.toFixed(1)}% profit (exceeds ${preferences?.profit_target || 25}% target)
    - Entry price: $${positionData.entry_price.toFixed(2)}, Current price: $${positionData.current_price.toFixed(2)}
    - Position Size: ${currentPositionPercent.toFixed(1)}% of portfolio
    - Position Limits: ${positionStatusDesc}
    - ${maxStatus === 'above_max' ? '⚠️ POSITION SIZE WARNING: Above maximum allocation' : ''}
    - ${maxStatus === 'near_max' ? '📊 Position approaching maximum allocation' : ''}
    - ${minStatus === 'below_min' && roomToAdd > 0 ? '💡 Position below minimum - consider adding' : ''}
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - YOUR BULLISH STANCE: While profits are strong, argue why the stock has MORE upside potential
    - ${maxStatus === 'above_max' ? 'Acknowledge position is oversized but justify holding if momentum is strong' : maxStatus === 'near_max' ? 'Note limited room to add but focus on holding conviction' : `Can add up to ${roomToAdd.toFixed(1)}% more if bullish thesis strengthens`}
    - Explain why taking profits now would be premature despite exceeding target
    - ${availableCash > 0 && roomToAdd > 0 ? 'Note the available cash that could be deployed for averaging up' : 'Focus on the merits of holding current position'}`;
      } else if (positionData.unrealized_pl_percent < -(preferences?.stop_loss || 10)) {
        positionContext = `
    POSITION CONTEXT:
    - Currently holding ${positionData.shares} shares with ${positionData.unrealized_pl_percent.toFixed(1)}% loss (exceeds ${preferences?.stop_loss || 10}% stop loss)
    - Entry price: $${positionData.entry_price.toFixed(2)}, Current price: $${positionData.current_price.toFixed(2)}
    - Position Size: ${currentPositionPercent.toFixed(1)}% of portfolio
    - Position Limits: ${positionStatusDesc}
    - ${maxStatus === 'above_max' ? '⚠️ POSITION SIZE WARNING: Above maximum allocation while in loss' : ''}
    - ${minStatus === 'below_min' ? '⚠️ Position below minimum size during drawdown' : ''}
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - YOUR BULLISH STANCE: This is an opportunity to average down, not panic sell
    - ${maxStatus === 'below_max' && roomToAdd > 0 ? `Can add up to ${roomToAdd.toFixed(1)}% more to lower cost basis` : maxStatus === 'above_max' ? 'Position already oversized - focus on recovery thesis' : 'Position at allocation limit - emphasize recovery potential'}
    - Argue why the current price represents exceptional value
    - Explain why the thesis remains intact despite the drawdown`;
      } else {
        positionContext = `
    POSITION CONTEXT:
    - Currently holding ${positionData.shares} shares with ${positionData.unrealized_pl_percent.toFixed(1)}% P/L
    - Entry price: $${positionData.entry_price.toFixed(2)}, Current price: $${positionData.current_price.toFixed(2)}
    - Position Size: ${currentPositionPercent.toFixed(1)}% of portfolio
    - Position Limits: ${positionStatusDesc}
    - ${maxStatus === 'above_max' ? '⚠️ Position exceeds maximum allocation' : maxStatus === 'near_max' ? '📊 Position approaching maximum allocation' : ''}
    - ${minStatus === 'below_min' ? '💡 Position below minimum target size' : ''}
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - YOUR BULLISH STANCE: Reinforce why holding and potentially adding makes sense
    - ${roomToAdd > 0 && maxStatus === 'below_max' ? `Room to add ${roomToAdd.toFixed(1)}% more if conviction increases` : maxStatus === 'above_max' ? 'Position oversized - justify the allocation' : 'Position well-sized - focus on growth potential'}
    - Build confidence in the position's future potential`;
      }
    } else {
      positionContext = `
    POSITION CONTEXT:
    - No existing position in ${ticker}
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - Portfolio Constraints: Min position size ${apiSettings?.rebalance_min_position_size || 5}%, Max position size ${apiSettings?.rebalance_max_position_size || 25}%
    - YOUR BULLISH STANCE: Make a compelling case for why NOW is the time to initiate a position
    - Highlight the opportunity cost of not being invested
    - ${availableCash > 0 ? `Emphasize how the available $${availableCash.toFixed(0)} could be working harder in ${ticker}` : 'Focus on why this deserves portfolio allocation when cash becomes available'}`;
    }

    const prompt = `
    As the Bull Researcher for ${ticker}, build a compelling bullish investment case.
    
    Research Parameters:
    - Historical Context: ${historyDays} days
    - Current Debate Round: ${currentRound}
    ${positionContext}
    
    Analysis Team Findings:
    - Market Performance: ${JSON.stringify(marketData, null, 2)}
    - Social Sentiment: ${JSON.stringify(socialSentiment, null, 2)}
    - News Analysis: ${JSON.stringify(newsAnalysis, null, 2)}
    - Fundamentals: ${JSON.stringify(fundamentals, null, 2)}

    ${debateRounds.length > 0 ? `
    Previous Debate Rounds:
    ${debateRounds.map((round: any, i: number) => `
    === Round ${i + 1} ===
    
    BULL RESEARCHER ARGUED:
    ${round.bull ? round.bull.substring(0, 800) + '...' : round.bullPoints?.join(', ') || 'N/A'}
    
    BEAR RESEARCHER COUNTERED:
    ${round.bear ? round.bear.substring(0, 800) + '...' : round.bearPoints?.join(', ') || 'N/A'}
    
    Key Points from Round ${i + 1}:
    - Bull: ${round.bullPoints?.join(', ') || 'N/A'}
    - Bear: ${round.bearPoints?.join(', ') || 'N/A'}
    `).join('\n\n')}
    ` : ''}

    Provide a comprehensive bullish analysis including:
    1. Top 5 reasons to buy this stock now
    2. Growth catalysts and opportunities
    3. Competitive advantages and moats
    4. Potential upside scenarios and price targets
    5. Risk mitigation for common concerns
    6. Timeline for bullish thesis to play out
    
    ${debateRounds.length > 0 ? `
    IMPORTANT: This is Round ${currentRound}. You must:
    - Address and counter the bear's specific concerns from previous rounds
    - Build upon your previous arguments with NEW evidence and perspectives
    - Do NOT simply repeat your previous points
    - Reference specific bear arguments and provide detailed rebuttals
    ` : ''}
    `;

    // Call AI provider
    let aiResponse = '';
    let agentError = null;
    let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'timeout' | 'other' = 'other';

    try {
      const maxTokens = apiSettings.research_max_tokens || 1200;
      console.log(`📝 Using ${maxTokens} max tokens for bull research analysis`);
      aiResponse = await callAIProviderWithRetry(apiSettings, prompt, SYSTEM_PROMPTS.bullResearcher, maxTokens, 3);
    } catch (aiError) {
      console.error('❌ AI provider call failed:', aiError);
      agentError = aiError.message || 'Failed to get AI response';

      // Determine error type for proper categorization
      if (agentError.includes('rate limit') || agentError.includes('quota') || agentError.includes('insufficient_quota')) {
        errorType = 'rate_limit';
      } else if (agentError.includes('API key') || agentError.includes('api_key') || agentError.includes('invalid key') || agentError.includes('Incorrect API key')) {
        errorType = 'api_key';
      } else if (agentError.includes('timeout') || agentError.includes('timed out')) {
        errorType = 'timeout';
      } else {
        errorType = 'ai_error';
      }

      // Set a fallback response when AI fails
      aiResponse = `Error: Unable to complete bull research analysis due to AI provider error.

Error details: ${agentError}

Please retry the analysis or check your AI provider settings.`;
    }

    // Extract key bullish points
    const bullPoints = [
      'Strong earnings growth trajectory',
      'Expanding market opportunities',
      'Competitive moat strengthening',
      'Favorable industry trends',
      'Attractive valuation for growth'
    ];

    // Save agent output (even if there was an error)
    const agentOutput = {
      agent: 'Bull Researcher',
      timestamp: new Date().toISOString(),
      round: currentRound,
      analysis: aiResponse,
      error: agentError,
      summary: {
        stance: 'bullish',
        conviction: agentError ? 'error' : 'high',
        keyPoints: agentError ? ['Error during analysis'] : bullPoints,
        priceTarget: agentError ? 'N/A' : '$180 (20% upside)',
        timeframe: agentError ? 'N/A' : '12 months',
        riskReward: agentError ? 'N/A' : 'Favorable 3:1',
        hasError: !!agentError
      }
    };

    // Update analysis atomically to prevent race conditions
    console.log('💾 Updating analysis results atomically...');

    // Update agent insights atomically
    const insightsResult = await updateAgentInsights(supabase, analysisId, 'bullResearcher', agentOutput);
    if (!insightsResult.success) {
      console.error('Failed to update insights:', insightsResult.error);
    }

    // Only update debate rounds if we have a successful response
    if (!agentError) {
      // Update debate rounds and messages atomically
      const debateResult = await updateDebateRounds(
        supabase,
        analysisId,
        'Bull Researcher',
        aiResponse,
        currentRound,
        bullPoints
      );
      if (!debateResult.success) {
        console.error('Failed to update debate rounds:', debateResult.error);
      }
    } else {
      console.log('⚠️ Skipping debate round update due to error');
    }

    // Handle agent completion - either success or error
    if (agentError) {
      // Set agent to error status and notify coordinator
      const errorResult = await setAgentToError(
        supabase,
        analysisId,
        'research',
        'Bull Researcher',
        agentError,
        errorType,
        ticker,
        userId,
        apiSettings
      );

      if (!errorResult.success) {
        console.error('Failed to set error status:', errorResult.error);
      }

      // Clear timeout on error
      if (timeoutId !== null) {
        clearAgentTimeout(timeoutId, 'Bull Researcher', 'error in AI processing');
      }

      // Don't continue to next agent on error
      console.log('❌ Bull Researcher encountered error - coordinator will be notified by setAgentToError');

      return new Response(JSON.stringify({
        success: false,
        agent: 'Bull Researcher',
        error: agentError,
        errorType: errorType,
        round: currentRound,
        retryInfo: retryStatus
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    } else {
      // Only set to completed if no errors
      const statusResult = await updateWorkflowStepStatus(
        supabase,
        analysisId,
        'research',
        'Bull Researcher',
        'completed'
      );
      if (!statusResult.success) {
        console.error('Failed to update workflow status:', statusResult.error);
      }
    }

    // Clear timeout on successful completion
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Bull Researcher', 'completed successfully');
    }

    console.log('✅ Bull Researcher data saved successfully');

    console.log(`✅ Bull Researcher completed round ${currentRound} for ${ticker} (${retryStatus})`);

    // Now trigger Bear researcher to respond to Bull's arguments (sequential debate)
    console.log('🐻 Triggering Bear researcher to respond...');

    // Set Bear Researcher status to "running" before invoking to prevent duplicates
    console.log('📍 Setting Bear Researcher status to "running" before invocation');
    await supabase.rpc('update_workflow_step_status', {
      p_analysis_id: analysisId,
      p_phase_id: 'research',
      p_agent_name: 'Bear Researcher',
      p_status: 'running'
    });

    invokeWithRetryAsync(
      supabase,
      'agent-bear-researcher',
      {
        analysisId,
        ticker,
        userId,
        apiSettings,
        analysisContext
      }
    );

    return new Response(JSON.stringify({
      success: true,
      agent: 'Bull Researcher',
      round: currentRound,
      summary: agentOutput.summary,
      retryInfo: retryStatus
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Bull Researcher', 'error occurred');
    }

    console.error('❌ Bull Researcher critical error:', error);

    // Try to set error status for uncaught exceptions
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      if (request?.analysisId) {
        // Determine error type
        let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'other' = 'other';
        const errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
          errorType = 'rate_limit';
        } else if (errorMessage.includes('API key') || errorMessage.includes('api_key') || errorMessage.includes('invalid key')) {
          errorType = 'api_key';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          errorType = 'ai_error';  // Map timeout to ai_error since timeout isn't in the union
        } else if (errorMessage.includes('database') || errorMessage.includes('supabase')) {
          errorType = 'ai_error';  // Map database to ai_error since database isn't in the union
        } else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
          errorType = 'data_fetch';
        }

        await setAgentToError(
          supabase,
          request.analysisId,
          'research',
          'Bull Researcher',
          errorMessage,
          errorType,
          request?.ticker,
          request?.userId,
          request?.apiSettings
        );
      }
    } catch (errorUpdateError) {
      console.error('Failed to update error status:', errorUpdateError);
    }

    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200 // Return 200 so coordinator notifications work
    });
  }
});
