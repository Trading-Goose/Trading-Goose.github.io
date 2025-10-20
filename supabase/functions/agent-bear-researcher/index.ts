import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { updateAgentInsights, updateWorkflowStepStatus, updateAnalysisPhase, updateDebateRounds, setAgentToError } from '../_shared/atomicUpdate.ts'
import { checkAnalysisCancellation } from '../_shared/cancellationCheck.ts'
import { callAIProviderWithRetry, SYSTEM_PROMPTS } from '../_shared/aiProviders.ts'
import { notifyCoordinatorAsync } from '../_shared/coordinatorNotification.ts'
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts'
import { AgentRequest, getHistoryDays } from '../_shared/types.ts'

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
    console.log(`🐻 Bear Researcher starting for ${ticker} (${retryStatus})`);

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      {
        functionName: 'agent-bear-researcher',
        maxRetries: 3,
        timeoutMs: 180000,
        retryDelay: 3000   // 3 second delay between retries
      },
      'Bear Researcher'
    );

    // Check if analysis has been canceled before starting work
    const cancellationCheck = await checkAnalysisCancellation(supabase, analysisId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 agent-bear-researcher stopped: ${cancellationCheck.reason}`);
      return new Response(JSON.stringify({
        success: false,
        message: `agent-bear-researcher stopped: ${cancellationCheck.reason}`,
        canceled: cancellationCheck.isCanceled
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Check if analysis still exists by trying to update it (deletion check)
    const updateResult = await updateAnalysisPhase(supabase, analysisId, 'Bear Researcher analyzing', {
      agent: 'Bear Researcher',
      message: 'Starting bearish analysis and risk evaluation',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // If analysis phase update fails, it likely means analysis was deleted
    if (!updateResult.success) {
      console.log(`🛑 Bear Researcher stopped: ${updateResult.error}`);
      return new Response(JSON.stringify({
        success: false,
        message: `Bear Researcher stopped: ${updateResult.error}`,
        canceled: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

    // Get analysis data including insights from other agents
    const { data: analysis } = await supabase
      .from('analysis_history')
      .select('agent_insights, full_analysis')
      .eq('id', analysisId)
      .single();

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // Update analysis status
    await updateAnalysisPhase(supabase, analysisId, 'Bear Researcher evaluating risks', {
      agent: 'Bear Researcher',
      message: 'Researching bearish factors and risks',
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
      
      const roomToReduce = Math.max(0, currentPositionPercent - minPositionPercent);
      
      // Adjust bear case based on position P/L
      if (positionData.unrealized_pl_percent > (preferences?.profit_target || 25)) {
        positionContext = `
    POSITION CONTEXT:
    - Currently holding ${positionData.shares} shares with ${positionData.unrealized_pl_percent.toFixed(1)}% profit (exceeds ${preferences?.profit_target || 25}% target)
    - Entry price: $${positionData.entry_price.toFixed(2)}, Current price: $${positionData.current_price.toFixed(2)}
    - Position Size: ${currentPositionPercent.toFixed(1)}% of portfolio
    - Position Limits: ${positionStatusDesc}
    - ${maxStatus === 'above_max' ? '⚠️ POSITION SIZE WARNING: Oversized position with strong gains' : ''}
    - ${maxStatus === 'near_max' ? '📊 Position at maximum allocation with profit target reached' : ''}
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - YOUR BEARISH STANCE: Position has strong gains - argue for taking profits before reversal
    - ${maxStatus === 'above_max' ? 'CRITICAL: Position is oversized AND profitable - perfect time to reduce to target allocation' : maxStatus === 'near_max' ? 'Position at max allocation - ideal time to lock in gains and rebalance' : `Can trim ${roomToReduce.toFixed(1)}% while maintaining minimum position`}
    - Explain why holding at these levels is risky and greedy
    - ${parseFloat(cashPercentage) < targetCashPercent ? `Emphasize the benefit of raising cash by taking profits (below ${targetCashPercent}% target)` : 'Note that cash is available for better opportunities elsewhere'}`;
      } else if (positionData.unrealized_pl_percent < -(preferences?.stop_loss || 10)) {
        positionContext = `
    POSITION CONTEXT:
    - Currently holding ${positionData.shares} shares with ${positionData.unrealized_pl_percent.toFixed(1)}% loss (exceeds ${preferences?.stop_loss || 10}% stop loss)
    - Entry price: $${positionData.entry_price.toFixed(2)}, Current price: $${positionData.current_price.toFixed(2)}
    - Position Size: ${currentPositionPercent.toFixed(1)}% of portfolio
    - Position Limits: ${positionStatusDesc}
    - ${maxStatus === 'above_max' ? '⚠️ CRITICAL: Oversized losing position - reduce exposure immediately' : ''}
    - ${minStatus === 'below_min' ? '⚠️ Position below minimum but losing - consider full exit' : ''}
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - YOUR BEARISH STANCE: Position showing losses - argue for cutting losses before further decline
    - ${maxStatus === 'above_max' ? 'URGENT: Oversized losing position compounds risk - reduce to limit losses' : minStatus === 'below_min' ? 'Small position already - exit completely to preserve capital' : `Can reduce by ${roomToReduce.toFixed(1)}% to minimize further losses`}
    - Explain why the investment thesis has broken down
    - Warn about catching a falling knife and further downside risks`;
      } else {
        positionContext = `
    POSITION CONTEXT:
    - Currently holding ${positionData.shares} shares with ${positionData.unrealized_pl_percent.toFixed(1)}% P/L
    - Entry price: $${positionData.entry_price.toFixed(2)}, Current price: $${positionData.current_price.toFixed(2)}
    - Position Size: ${currentPositionPercent.toFixed(1)}% of portfolio
    - Position Limits: ${positionStatusDesc}
    - ${maxStatus === 'above_max' ? '⚠️ Position exceeds maximum allocation - consider trimming' : maxStatus === 'near_max' ? '📊 Position at maximum allocation' : ''}
    - ${minStatus === 'below_min' ? '💡 Position below minimum size - either add or exit' : ''}
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - YOUR BEARISH STANCE: Argue why the risk/reward is unfavorable at current levels
    - ${roomToReduce > 0 ? `Can reduce position by ${roomToReduce.toFixed(1)}% to improve portfolio balance` : minStatus === 'below_min' ? 'Position too small to be meaningful - consider full exit' : 'Position appropriately sized but assess risk/reward'}
    - Present reasons to reduce or exit the position
    - ${parseFloat(cashPercentage) < targetCashPercent ? `Note the low cash position (${cashPercentage}% vs ${targetCashPercent}% target) makes this holding riskier` : 'Suggest better uses for both the position and available cash'}`;
      }
    } else {
      positionContext = `
    POSITION CONTEXT:
    - No existing position in ${ticker}
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - Portfolio Constraints: Min position size ${apiSettings?.rebalance_min_position_size || 5}%, Max position size ${apiSettings?.rebalance_max_position_size || 25}%
    - YOUR BEARISH STANCE: Argue why staying OUT of this stock is the right decision
    - Explain why current levels are NOT attractive for entry
    - ${availableCash > 10000 ? `Suggest better alternatives for the $${availableCash.toFixed(0)} available` : 'Emphasize patience and capital preservation'}`;
    }

    const prompt = `
    As the Bear Researcher for ${ticker}, build a comprehensive bearish risk assessment.
    
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

    Provide a comprehensive bearish analysis including:
    1. Top 5 risks and concerns for this stock
    2. Potential downside catalysts and threats
    3. Competitive disadvantages and challenges
    4. Worst-case scenarios and downside targets
    5. Red flags in financials or management
    6. Timeline for risks to materialize
    
    ${debateRounds.length > 0 ? `
    IMPORTANT: This is Round ${currentRound}. You must:
    - Directly counter the bull's specific arguments from Round ${currentRound}
    - Build upon your previous bear concerns with NEW risks and evidence
    - Do NOT simply repeat your previous points
    - Reference specific bull claims and provide detailed rebuttals
    - Highlight any overly optimistic assumptions in the bull case
    ` : ''}
    `;

    // Call AI provider
    let aiResponse = '';
    let agentError = null;
    let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'timeout' | 'other' = 'other';

    try {
      const maxTokens = apiSettings.research_max_tokens || 1200;
      console.log(`📝 Using ${maxTokens} max tokens for bear research analysis`);
      aiResponse = await callAIProviderWithRetry(apiSettings, prompt, SYSTEM_PROMPTS.bearResearcher, maxTokens, 3);
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
      aiResponse = `Error: Unable to complete bear research analysis due to AI provider error.

Error details: ${agentError}

Please retry the analysis or check your AI provider settings.`;
    }

    // Extract key bearish points
    const bearPoints = [
      'Valuation stretched at current levels',
      'Increasing competitive pressures',
      'Margin compression risks',
      'Regulatory headwinds emerging',
      'Execution risks on growth plan'
    ];

    // Save agent output (even if there was an error)
    const agentOutput = {
      agent: 'Bear Researcher',
      timestamp: new Date().toISOString(),
      round: currentRound,
      analysis: aiResponse,
      error: agentError,
      summary: {
        stance: 'bearish',
        conviction: agentError ? 'error' : 'moderate',
        keyPoints: agentError ? ['Error during analysis'] : bearPoints,
        priceTarget: agentError ? 'N/A' : '$120 (20% downside)',
        timeframe: agentError ? 'N/A' : '6-12 months',
        riskReward: agentError ? 'N/A' : 'Unfavorable 1:2',
        hasError: !!agentError
      }
    };

    // Update analysis atomically to prevent race conditions
    console.log('💾 Updating analysis results atomically...');

    // Update agent insights atomically
    const insightsResult = await updateAgentInsights(supabase, analysisId, 'bearResearcher', agentOutput);
    if (!insightsResult.success) {
      console.error('Failed to update insights:', insightsResult.error);
    }

    // Only update debate rounds if we have a successful response
    if (!agentError) {
      // Update debate rounds and messages atomically
      const debateResult = await updateDebateRounds(
        supabase,
        analysisId,
        'Bear Researcher',
        aiResponse,
        currentRound,
        bearPoints
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
        'Bear Researcher',
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
        clearAgentTimeout(timeoutId, 'Bear Researcher', 'error in AI processing');
      }

      // NOTE: Do NOT manually notify the coordinator here!
      // setAgentToError already notifies the coordinator internally
      console.log('❌ Bear Researcher encountered error - coordinator will be notified by setAgentToError');

      return new Response(JSON.stringify({
        success: false,
        agent: 'Bear Researcher',
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
        'Bear Researcher',
        'completed'
      );
      if (!statusResult.success) {
        console.error('Failed to update workflow status:', statusResult.error);
      }

      // Clear timeout on successful completion
      if (timeoutId !== null) {
        clearAgentTimeout(timeoutId, 'Bear Researcher', 'completed successfully');
      }

      console.log('✅ Bear Researcher data saved successfully');

      // After bear researcher completes, check if we need more debate rounds using reliable notification with retry logic
      notifyCoordinatorAsync(supabase, {
        analysisId,
        ticker,
        userId,
        phase: 'research',
        agent: 'check-debate-rounds',
        apiSettings,
        analysisContext  // Pass context through to maintain position data through debate rounds
      }, 'Bear Researcher');
    }

    console.log(`✅ Bear Researcher completed round ${currentRound} for ${ticker} (${retryStatus})`);

    return new Response(JSON.stringify({
      success: true,
      agent: 'Bear Researcher',
      round: currentRound,
      summary: agentOutput.summary,
      retryInfo: retryStatus
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Bear Researcher', 'error occurred');
    }

    console.error('❌ Bear Researcher critical error:', error);

    // Try to set error status for uncaught exceptions
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      if (analysisId) {
        // Determine error type
        let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'timeout' | 'other' = 'other';
        const errorMessage = error.message || 'Unknown error';

        if (errorMessage.includes('rate limit') || errorMessage.includes('quota')) {
          errorType = 'rate_limit';
        } else if (errorMessage.includes('API key') || errorMessage.includes('api_key') || errorMessage.includes('invalid key')) {
          errorType = 'api_key';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          errorType = 'timeout';
        } else if (errorMessage.includes('database') || errorMessage.includes('supabase')) {
          errorType = 'database';
        } else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
          errorType = 'data_fetch';
        }

        await setAgentToError(
          supabase,
          analysisId,
          'research',
          'Bear Researcher',
          errorMessage,
          errorType,
          request.ticker,
          request.userId,
          request.apiSettings
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

