import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callAIProviderWithRetry, SYSTEM_PROMPTS } from '../_shared/aiProviders.ts'
import { checkAnalysisCancellation } from '../_shared/cancellationCheck.ts'
import { notifyCoordinatorAsync } from '../_shared/coordinatorNotification.ts'
import { AgentRequest } from '../_shared/types.ts'
import { updateAgentInsights, appendAnalysisMessage, updateWorkflowStepStatus, updateAnalysisPhase, updateFinalAnalysisResults, setAgentToError } from '../_shared/atomicUpdate.ts'
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts'
import { calculateAllowedCash } from '../_shared/portfolio/cash-constraints.ts'

type RiskIntent = 'BUILD' | 'ADD' | 'TRIM' | 'EXIT' | 'HOLD'

type FinalDecisionRecord = {
  decision: 'BUY' | 'SELL' | 'HOLD'
  tradeDirection: 'BUY' | 'SELL' | 'HOLD'
  intent: RiskIntent
  confidence: number
  suggestedPercent: string
  executionNote: string
}

type AgentInsightsSummary = {
  marketAnalyst?: { data?: { volatility?: { current?: string } } }
  fundamentalsAnalyst?: { summary?: { fundamentalScore?: number } }
  socialMediaAnalyst?: { summary?: { overallSentiment?: string } }
  researchManager?: { summary?: { conviction?: number } }
  [key: string]: unknown
}

type ResearchConclusionSummary = {
  recommendation?: string | null
  [key: string]: unknown
}

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
    console.log(`🎯 Risk Manager starting final assessment for ${ticker} (${retryStatus})`);
    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      {
        functionName: 'agent-risk-manager',
        maxRetries: 3,
        timeoutMs: 180000, // 3 minutes
        retryDelay: 3000   // 3 second delay between retries
      },
      'Risk Manager'
    );

    // Check if analysis has been canceled before starting work
    const cancellationCheck = await checkAnalysisCancellation(supabase, analysisId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 agent-risk-manager stopped: ${cancellationCheck.reason}`);
      return new Response(JSON.stringify({
        success: false,
        message: `agent-risk-manager stopped: ${cancellationCheck.reason}`,
        canceled: cancellationCheck.isCanceled
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Check if analysis still exists by trying to update it (deletion check)
    const updateResult = await updateAnalysisPhase(supabase, analysisId, 'Risk Manager analyzing', {
      agent: 'Risk Manager',
      message: 'Starting final risk assessment',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // If analysis phase update fails, it likely means analysis was deleted
    if (!updateResult.success) {
      console.log(`🛑 Risk Manager stopped: ${updateResult.error}`);
      return new Response(JSON.stringify({
        success: false,
        message: `Risk Manager stopped: ${updateResult.error}`,
        canceled: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Get complete analysis data
    const { data: analysis } = await supabase
      .from('analysis_history')
      .select('agent_insights, full_analysis')
      .eq('id', analysisId)
      .single();

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // Update analysis status
    await updateAnalysisPhase(supabase, analysisId, 'Risk Manager finalizing recommendations', {
      agent: 'Risk Manager',
      message: 'Synthesizing all risk perspectives for final recommendation',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // Extract all risk analyst perspectives
    const riskyAnalyst = analysis.agent_insights?.riskyAnalyst?.strategies || {};
    const safeAnalyst = analysis.agent_insights?.safeAnalyst?.strategies || {};
    const neutralAnalyst = analysis.agent_insights?.neutralAnalyst?.strategies || {};
    const tradingPlan = analysis.full_analysis?.tradingPlan || {};
    const researchConclusion = analysis.full_analysis?.researchConclusion || {};

    // Extract position context from analysisContext
    const positionData = analysisContext?.position;
    const preferences = analysisContext?.preferences;
    const portfolioData = analysisContext?.portfolioData;
    
    // Get the near limit threshold (percentage to consider "near" target/stop)
    const nearLimitThreshold = preferences?.near_limit_threshold || 20;
    // Get the near position threshold (percentage to consider "near" min/max position size)
    const nearPositionThreshold = preferences?.near_position_threshold || 20;
    // Get target cash allocation for the portfolio
    const targetCashAllocationRaw = preferences?.cash ?? apiSettings?.target_cash_allocation ?? 20; // Default 20% target cash
    const targetCashAllocation = (() => {
      if (typeof targetCashAllocationRaw === 'number') {
        return Number.isFinite(targetCashAllocationRaw) ? targetCashAllocationRaw : 20;
      }
      const parsed = typeof targetCashAllocationRaw === 'string'
        ? parseFloat(targetCashAllocationRaw.replace(/%/g, ''))
        : NaN;
      return Number.isFinite(parsed) ? parsed : 20;
    })();
    
    // Extract cash availability and deployable limits
    const availableCash = portfolioData?.cash || portfolioData?.account?.cash || 0;
    const totalValue = portfolioData?.totalValue || portfolioData?.account?.portfolio_value || 100000;
    const cashPercentage = totalValue > 0 ? ((availableCash / totalValue) * 100).toFixed(1) : '0.0';
    const allowedDeployableCash = calculateAllowedCash(availableCash, totalValue, targetCashAllocation);
    const allowedDeployablePercentage = totalValue > 0 ? ((allowedDeployableCash / totalValue) * 100).toFixed(1) : '0.0';
    const hasCashAvailable = allowedDeployableCash > (totalValue * 0.01); // At least 1% of portfolio deployable under policy
    
    // Determine if we have "sufficient" deployable cash based on policy buffers
    const hasSufficientCash = parseFloat(allowedDeployablePercentage) >= (targetCashAllocation * 0.5); // At least 50% of policy buffer
    const hasAmpleCash = parseFloat(allowedDeployablePercentage) >= targetCashAllocation; // At or above policy buffer
    const deployableCashStatus = !hasCashAvailable
      ? '⚠️ Allowed deployable cash exhausted - Cannot execute BUY orders without breaching cash policy'
      : !hasSufficientCash
        ? `⚠️ Deployable cash limited (${allowedDeployablePercentage}% vs ${targetCashAllocation}% policy buffer) - Keep adds modest`
        : hasAmpleCash
          ? `✅ Deployable cash ample (${allowedDeployablePercentage}% of portfolio) - Full flexibility for adds`
          : `✅ Deployable cash available (${allowedDeployablePercentage}% of portfolio) - Proceed with disciplined sizing`;
    
    // Build comprehensive position context with categorization
    let positionContext = '';
    let positionCategorization = '';
    let plStatus = '';  // Move to outer scope for use in prompt
    let sizeStatus = '';  // Move to outer scope for use in prompt
    
    if (positionData?.stock_in_holdings) {
      const plPercent = positionData.unrealized_pl_percent || 0;
      const profitTarget = preferences?.profit_target || 25;
      const stopLoss = preferences?.stop_loss || 10;
      const totalValue = portfolioData?.totalValue || portfolioData?.account?.portfolio_value || 100000;
      const positionSize = ((positionData.market_value / totalValue) * 100).toFixed(1);
      const minSize = apiSettings?.rebalance_min_position_size || 5;
      const maxSize = apiSettings?.rebalance_max_position_size || 25;
      
      // Categorize P/L status
      let plGuidance = '';
      
      if (plPercent > 0) {
        const percentOfTarget = (plPercent / profitTarget) * 100;
        if (percentOfTarget >= 100) {
          plStatus = 'ABOVE_PROFIT_TARGET';
          plGuidance = `Position has exceeded ${profitTarget}% target by ${(percentOfTarget - 100).toFixed(0)}%`;
        } else if (percentOfTarget >= (100 - nearLimitThreshold)) {
          plStatus = 'NEAR_PROFIT_TARGET';
          plGuidance = `Position at ${percentOfTarget.toFixed(0)}% of ${profitTarget}% target (within ${nearLimitThreshold}% threshold)`;
        } else {
          plStatus = 'PROFITABLE';
          plGuidance = `Position profitable but only ${percentOfTarget.toFixed(0)}% toward target`;
        }
      } else if (plPercent < 0) {
        const percentOfStop = (Math.abs(plPercent) / stopLoss) * 100;
        if (percentOfStop >= 100) {
          plStatus = 'EXCEEDED_STOP_LOSS';
          plGuidance = `Position breached ${stopLoss}% stop by ${(percentOfStop - 100).toFixed(0)}%`;
        } else if (percentOfStop >= (100 - nearLimitThreshold)) {
          plStatus = 'NEAR_STOP_LOSS';
          plGuidance = `Position at ${percentOfStop.toFixed(0)}% of ${stopLoss}% stop threshold (within ${nearLimitThreshold}% threshold) - Consider averaging down opportunity`;
        } else {
          plStatus = 'MINOR_LOSS';
          plGuidance = `Loss contained at ${Math.abs(plPercent).toFixed(1)}%`;
        }
      } else {
        plStatus = 'BREAKEVEN';
        plGuidance = 'Position at breakeven';
      }
      
      // Categorize position size
      let sizeGuidance = '';
      const positionPercent = parseFloat(positionSize);
      
      // Calculate thresholds based on nearPositionThreshold
      const nearMaxThreshold = maxSize * (1 - nearPositionThreshold / 100);
      const nearMinThreshold = minSize * (1 + nearPositionThreshold / 100);
      
      if (positionPercent >= maxSize) {
        sizeStatus = 'AT_MAX_SIZE';
        sizeGuidance = `Position at maximum ${maxSize}% allocation - no room to add`;
      } else if (positionPercent >= nearMaxThreshold) {
        sizeStatus = 'NEAR_MAX_SIZE';
        sizeGuidance = `Position at ${positionSize}%, within ${nearPositionThreshold}% of ${maxSize}% maximum`;
      } else if (positionPercent <= minSize) {
        sizeStatus = 'AT_MIN_SIZE';
        sizeGuidance = `Position at/below minimum ${minSize}% - consider closing or adding`;
      } else if (positionPercent <= nearMinThreshold) {
        sizeStatus = 'NEAR_MIN_SIZE';
        sizeGuidance = `Position at ${positionSize}%, within ${nearPositionThreshold}% of ${minSize}% minimum`;
      } else {
        sizeStatus = 'NORMAL_SIZE';
        sizeGuidance = `Position at ${positionSize}%, within normal range (${minSize}%-${maxSize}%)`;
      }
      
      positionContext = `
    
    **CURRENT POSITION STATUS:**
    - Owns: ${positionData.shares} shares
    - Entry Price: $${positionData.entry_price?.toFixed(2) || 'N/A'}
    - Current Price: $${positionData.current_price?.toFixed(2) || 'N/A'}
    - Unrealized P/L: ${plPercent >= 0 ? '+' : ''}${plPercent.toFixed(1)}% ($${positionData.unrealized_pl?.toFixed(2) || 'N/A'})
    - Position Size: ${positionSize}% of portfolio
    
    **P/L CATEGORIZATION:**
    - Status: ${plStatus}
    - ${plGuidance}
    - User Targets: ${profitTarget}% profit target, ${stopLoss}% stop loss
    
    **POSITION SIZE CATEGORIZATION:**
    - Status: ${sizeStatus}
    - ${sizeGuidance}
    - Portfolio Constraints: Min ${minSize}%, Max ${maxSize}%
    
    **CASH AVAILABILITY:**
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - Policy-Limited Deployable Cash: $${allowedDeployableCash.toFixed(2)} (${allowedDeployablePercentage}% of portfolio)
    - Target Cash Allocation: ${targetCashAllocation}%
    - ${deployableCashStatus}`;
      
      positionCategorization = `${plStatus} / ${sizeStatus}`;
    } else {
      positionContext = `
    
    **POSITION STATUS:**
    - No existing position in ${ticker}
    - User Preferences: ${preferences?.profit_target || 25}% profit target, ${preferences?.stop_loss || 10}% stop loss
    - Portfolio Constraints: Min ${apiSettings?.rebalance_min_position_size || 5}%, Max ${apiSettings?.rebalance_max_position_size || 25}% per position`;
      
      positionContext += `
    
    **CASH AVAILABILITY:**
    - Available Cash: $${availableCash.toFixed(2)} (${cashPercentage}% of portfolio)
    - Policy-Limited Deployable Cash: $${allowedDeployableCash.toFixed(2)} (${allowedDeployablePercentage}% of portfolio)
    - Target Cash Allocation: ${targetCashAllocation}%
    - ${deployableCashStatus}`;
      
      positionCategorization = 'NO_POSITION';
    }

    // Prepare AI prompt
    const prompt = `
    As the Risk Manager for ${ticker}, synthesize all risk perspectives and provide final recommendations.
    ${positionContext}
    
    Trading Plan Summary:
    - Recommendation: ${researchConclusion.recommendation}
    - Base Strategy: ${tradingPlan.action} with ${tradingPlan.positionSize} position
    - Entry: ${tradingPlan.entryPrice}, Stop: ${tradingPlan.stopLoss}

    Risk Analyst Perspectives:
    
    Aggressive (Risky Analyst):
    - Position Size: ${riskyAnalyst.aggressivePosition?.size}
    - Max Loss: ${riskyAnalyst.maxLoss}
    - Warning Level: ${riskyAnalyst.warningLevel}

    Conservative (Safe Analyst):
    - Position Size: ${safeAnalyst.conservativePosition?.size}
    - Max Loss: ${safeAnalyst.maxLoss}
    - Warning Level: ${safeAnalyst.warningLevel}

    Balanced (Neutral Analyst):
    - Position Size: ${neutralAnalyst.balancedPosition?.size}
    - Expected Return: ${neutralAnalyst.expectedReturn}
    - Warning Level: ${neutralAnalyst.warningLevel}

    ${!hasCashAvailable ? `
    ⚠️ CRITICAL: NO DEPLOYABLE CASH - BUILD/ADD actions are prohibited until cash policy buffer is restored` : ''}
    ${plStatus === 'ABOVE_PROFIT_TARGET' ? `
    ⚠️ POSITION ABOVE ${preferences?.profit_target || 25}% TARGET - Consider profit-taking, not adding` : ''}
    ${sizeStatus === 'AT_MAX_SIZE' ? `
    ⚠️ POSITION AT MAXIMUM ${apiSettings?.rebalance_max_position_size || 25}% ALLOCATION - Cannot add more` : 
      sizeStatus === 'NEAR_MAX_SIZE' ? `
    ⚠️ POSITION NEAR MAXIMUM - Limited room to add, focus on management` :
      sizeStatus === 'AT_MIN_SIZE' ? `
    ⚠️ POSITION AT/BELOW MINIMUM ${apiSettings?.rebalance_min_position_size || 5}% - Must exit or add to viable size` :
      sizeStatus === 'NEAR_MIN_SIZE' ? `
    ⚠️ POSITION NEAR MINIMUM - Consider sizing up or preparing to exit` : ''}
    
    Provide comprehensive risk management guidance including:
    1. Final position size recommendation for different investor types
       ${positionData?.stock_in_holdings ? `- Consider current position: ${positionCategorization}` : '- New position sizing guidance'}
    2. Comprehensive risk scoring (1-10 scale)
       ${positionData?.stock_in_holdings && positionData.unrealized_pl_percent > 0 
         ? '- Factor in unrealized gains and profit protection needs'
         : positionData?.stock_in_holdings && positionData.unrealized_pl_percent < 0
         ? '- Account for existing losses and recovery potential'
         : '- Assess entry risk for new position'}
    3. Portfolio impact analysis
       ${positionData?.stock_in_holdings 
         ? `- Current allocation: ${((positionData.market_value / (portfolioData?.totalValue || 100000)) * 100).toFixed(1)}%`
         : '- Impact of new position on portfolio'}
    4. Correlation and diversification considerations
    5. Black swan event preparation
    6. Specific risk monitoring checklist
       ${positionData?.stock_in_holdings 
         ? `- Monitor P/L relative to ${preferences?.profit_target || 25}% target and ${preferences?.stop_loss || 10}% stop`
         : '- Set initial alerts at target and stop levels'}
    7. Clear exit criteria and conditions
       ${positionData?.stock_in_holdings && plStatus === 'ABOVE_PROFIT_TARGET'
         ? '- PRIORITY: Define profit-taking strategy for position above target'
         : positionData?.stock_in_holdings && plStatus === 'EXCEEDED_STOP_LOSS'
         ? '- URGENT: Assess immediate exit vs. recovery potential'
         : '- Standard exit rules based on user preferences'}
    8. Final GO/NO-GO recommendation with confidence level
       - IMPORTANT: Only use intents from this set: BUILD, ADD, TRIM, EXIT, HOLD
       - IMPORTANT: Do NOT use BUY or SELL wording in any final recommendations or proposals
       ${positionData?.stock_in_holdings 
         ? `- Recommendation should use these verbs: ADD (increase to average down), TRIM (partial reduce), EXIT (close fully), or HOLD (no action)
       ${(() => {
           if (plStatus === 'NEAR_PROFIT_TARGET') {
             return '- IMPORTANT: Position is NEAR profit target - favor TRIM with partial profit-taking (suggest 15-30%)';
           } else if (plStatus === 'NEAR_STOP_LOSS') {
             if (hasAmpleCash) {
               return `- IMPORTANT: Position NEAR stop loss with ${allowedDeployablePercentage}% deployable cash (policy buffer ${targetCashAllocation}%) - PRIORITIZE ADD (average down 25-40%) if conviction remains high, otherwise TRIM small size (10-20%)`;
             } else if (hasSufficientCash) {
               return `- IMPORTANT: Position NEAR stop loss with ${allowedDeployablePercentage}% deployable cash (below ${targetCashAllocation}% buffer) - Consider ADD (10-20%) or TRIM risk (20-30%)`;
             } else if (hasCashAvailable) {
               return `- IMPORTANT: Position NEAR stop loss with constrained deployable cash (${allowedDeployablePercentage}% vs ${targetCashAllocation}% buffer) - Small ADD (5-10%) only if high conviction, otherwise TRIM (30-40%)`;
             } else {
               return '- IMPORTANT: Position NEAR stop loss with NO deployable cash - recommend TRIM (10-30%) to manage risk';
             }
           } else if (plStatus === 'ABOVE_PROFIT_TARGET') {
             return '- IMPORTANT: Position EXCEEDED profit target - favor TRIM (35-60%) or EXIT for conservative investors';
           } else if (plStatus === 'EXCEEDED_STOP_LOSS') {
             if (hasAmpleCash) {
               return `- CRITICAL: Position EXCEEDED stop loss with ample deployable cash (${allowedDeployablePercentage}% vs ${targetCashAllocation}% buffer) - Strongly consider EXIT (50-100%), ADD only for aggressive investors with full conviction`;
             } else if (hasSufficientCash) {
               return `- CRITICAL: Position EXCEEDED stop loss with moderate deployable cash (${allowedDeployablePercentage}% vs ${targetCashAllocation}% buffer) - recommend EXIT (70-100%), minimal ADD only if extremely confident`;
             } else {
               return `- CRITICAL: Position EXCEEDED stop loss with limited/no deployable cash (${allowedDeployablePercentage}% vs ${targetCashAllocation}% buffer) - recommend immediate EXIT (70-100%) to preserve capital`;
             }
           }
           return '';
       })()}`
         : '- Recommendation for initiating new position: BUILD or HOLD'}
      ${positionData?.stock_in_holdings
        ? '- PRIORITIZE INTENTS: Favor TRIM or ADD to keep the position actively managed; escalate to EXIT for deliberate profit-taking or decisive risk management; reserve HOLD only for conviction <60% or when cash/constraints block action.'
        : '- BUILD and HOLD carry equal priority for new positions—select based on conviction level and cash availability.'}
    `;

    // Call AI provider
    let aiResponse = '';
    let agentError = null;
    let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'timeout' | 'other' = 'other';

    try {
      const maxTokens = apiSettings.risk_max_tokens || 1200;
      console.log(`📝 Using ${maxTokens} max tokens for final risk assessment`);
      aiResponse = await callAIProviderWithRetry(apiSettings, prompt, SYSTEM_PROMPTS.riskManager, maxTokens, 3);
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
      aiResponse = `Error: Unable to complete final risk assessment due to AI provider error.

Risk analysis data was collected but final assessment could not be made.

Error details: ${agentError}

Please retry the analysis or check your AI provider settings.`;
    }

    // Calculate comprehensive risk score
    const riskScore = calculateRiskScore(analysis.agent_insights);

    // Determine final recommendation based on investor profile and position status
    let finalRecommendations;
    
    if (positionData?.stock_in_holdings) {
      // Position-aware recommendations
      const currentPositionSize = ((positionData.market_value / (portfolioData?.totalValue || 100000)) * 100).toFixed(1);
      
      const planActionExisting = translatePlanAction(tradingPlan.action, true);

      finalRecommendations = {
        aggressive: {
          action: plStatus === 'ABOVE_PROFIT_TARGET' ? 'TRIM 40-60% to lock gains' :
                  plStatus === 'NEAR_PROFIT_TARGET' ? 'TRIM 15-30% and trail stops' :
                  plStatus === 'EXCEEDED_STOP_LOSS' ? 
                    (hasAmpleCash ? 'EXIT 50-70% (ADD only with conviction)' : 
                     hasSufficientCash ? 'EXIT 60-80%' : 'EXIT 70-100%') :
                  plStatus === 'NEAR_STOP_LOSS' ? 
                    (hasAmpleCash ? 'ADD 30-50% to average down' : 
                     hasSufficientCash ? 'ADD 15-25% to average down' : 
                     hasCashAvailable ? 'ADD 5-10% to average down' :
                     'TRIM 10-20% to manage risk') :
                  sizeStatus === 'AT_MAX_SIZE' ? 'HOLD (max size reached)' :
                  !hasCashAvailable && tradingPlan.action === 'BUY' ? 'HOLD (deployable cash unavailable for ADD)' :
                  planActionExisting,
          positionSize: `Currently ${currentPositionSize}% - ${
            sizeStatus === 'AT_MAX_SIZE' ? 'no room to add' : 
            sizeStatus === 'NEAR_MAX_SIZE' ? 'limited room to add' :
            sizeStatus === 'AT_MIN_SIZE' ? 'must EXIT or size up' :
            sizeStatus === 'NEAR_MIN_SIZE' ? 'consider sizing up' :
            plStatus === 'NEAR_STOP_LOSS' && hasCashAvailable ? 'consider lifting to 10-15% with ADD' :
            'can adjust to 7-10%'
          }`,
          strategy: plStatus === 'ABOVE_PROFIT_TARGET' ? 'Use staged TRIMs with trailing stops' :
                   plStatus === 'EXCEEDED_STOP_LOSS' ? 'Prioritise EXIT, reserve ADD for conviction only' :
                   plStatus === 'NEAR_STOP_LOSS' && hasCashAvailable ? 'Deploy ADD to lower basis, keep fail-safe stops' :
                   'Manage existing exposure actively',
          maxLoss: '10-15% from entry'
        },
        moderate: {
          action: plStatus === 'ABOVE_PROFIT_TARGET' ? 'TRIM 30-45% to bank gains' :
                  plStatus === 'NEAR_PROFIT_TARGET' ? 'TRIM 20-30% and tighten stops' :
                  plStatus === 'EXCEEDED_STOP_LOSS' ? 'EXIT 80-100% to preserve capital' :
                  plStatus === 'NEAR_STOP_LOSS' ? 
                    (hasAmpleCash ? 'ADD 10-20% selectively (fallback TRIM 20-30%)' : 
                     hasSufficientCash ? 'ADD 5-15% cautiously (fallback TRIM 25-35%)' :
                     'TRIM 30-40% to control risk') :
                  !hasCashAvailable && tradingPlan.action === 'BUY' ? 'HOLD (deployable cash unavailable for ADD)' :
                  planActionExisting,
          positionSize: `Currently ${currentPositionSize}% - ${
            sizeStatus === 'AT_MAX_SIZE' ? 'reduce via TRIM' : 
            sizeStatus === 'NEAR_MAX_SIZE' ? 'near upper limit' :
            sizeStatus === 'AT_MIN_SIZE' ? 'EXIT or rebuild position' :
            sizeStatus === 'NEAR_MIN_SIZE' ? 'increase toward target' :
            plStatus === 'NEAR_STOP_LOSS' && hasCashAvailable ? 'can expand to 5-7% with ADD' :
            'maintain around 3-5%'
          }`,
          strategy: plStatus === 'ABOVE_PROFIT_TARGET' ? 'Lock gains while leaving upside optionality' :
                   plStatus === 'EXCEEDED_STOP_LOSS' ? 'Move to EXIT, reassess thesis later' :
                   plStatus === 'NEAR_STOP_LOSS' && hasCashAvailable ? 'Blend selective ADD with strict stops' :
                   'Balanced risk management with periodic trims',
          maxLoss: '5-7% from entry'
        },
        conservative: {
          action: plStatus === 'ABOVE_PROFIT_TARGET' ? 'TRIM 60-80% or EXIT entirely' :
                  plStatus === 'NEAR_PROFIT_TARGET' ? 'TRIM 40-60% to lock gains' :
                  plStatus === 'EXCEEDED_STOP_LOSS' ? 'EXIT 100% immediately' :
                  plStatus === 'NEAR_STOP_LOSS' ? 
                    (hasAmpleCash ? 'TRIM 30-50% (ADD only token size if conviction extreme)' : 
                     'TRIM 50-70% to defend capital') :
                  'HOLD with tight risk controls',
          positionSize: `Currently ${currentPositionSize}% - ${
            sizeStatus === 'AT_MAX_SIZE' ? 'must reduce via TRIM' : 
            sizeStatus === 'NEAR_MAX_SIZE' ? 'trim back toward neutral' :
            sizeStatus === 'AT_MIN_SIZE' ? 'exit position' :
            sizeStatus === 'NEAR_MIN_SIZE' ? 'prepare to EXIT if momentum weakens' :
            'dial down to 1-2%'
          }`,
          strategy: plStatus === 'NEAR_STOP_LOSS' && hasCashAvailable ? 'Capital preservation with optional micro-ADD' : 'Capital preservation first',
          maxLoss: '2-3% from entry'
        }
      };
    } else {
      // New position recommendations
      const planActionNew = translatePlanAction(tradingPlan.action, false);

      finalRecommendations = {
        aggressive: {
          action: !hasCashAvailable ? 'HOLD (deployable cash unavailable)' : 'BUILD 7-10% position',
          positionSize: !hasCashAvailable ? 'N/A - deployable cash constrained' : '7-10%',
          strategy: !hasCashAvailable ? 'Cannot enter - restore cash buffer first' : `${planActionNew} with options overlay and quick adds`,
          maxLoss: '10-15%'
        },
        moderate: {
          action: !hasCashAvailable ? 'HOLD (deployable cash unavailable)' : 'BUILD 3-5% starter position',
          positionSize: !hasCashAvailable ? 'N/A - deployable cash constrained' : '3-5%',
          strategy: !hasCashAvailable ? 'Cannot enter - restore cash buffer first' : `${planActionNew} using staggered entries and stops`,
          maxLoss: '5-7%'
        },
        conservative: {
          action: !hasCashAvailable ? 'HOLD (deployable cash unavailable)' : 'BUILD 1-2% pilot position',
          positionSize: !hasCashAvailable ? 'N/A - deployable cash constrained' : '1-2%',
          strategy: !hasCashAvailable ? 'Cannot enter - restore cash buffer first' : `${planActionNew} with hedges / protective puts`,
          maxLoss: '2-3%'
        }
      };
    }

    // Save agent output
    const agentOutput = {
      agent: 'Risk Manager',
      timestamp: new Date().toISOString(),
      analysis: aiResponse,
      finalAssessment: {
        overallRiskScore: riskScore,
        marketRisk: 'Medium',
        executionRisk: 'Low',
        liquidityRisk: 'Low',
        recommendations: finalRecommendations,
        decision: '', // Will be filled from AI extraction
        intent: 'HOLD', // Placeholder until extraction completes
        executionPlan: {
          intent: 'HOLD',
          action: 'HOLD',
          suggestedPercent: '',
          note: ''
        },
        confidence: '70%', // Will be updated with extracted value from AI
        keyRisks: [
          'Market volatility',
          'Valuation concerns',
          'Sector rotation risk'
        ],
        monitoringPlan: {
          daily: ['Price action', 'Volume', 'News flow'],
          weekly: ['Technical indicators', 'Sector performance'],
          monthly: ['Fundamental changes', 'Portfolio weight']
        }
      }
    };

    // Extract final decision and confidence from AI analysis
    const finalDecision = extractDecisionFromAI(
      aiResponse,
      researchConclusion,
      riskScore,
      Boolean(positionData?.stock_in_holdings)
    );

    const researchRecommendation = String(researchConclusion?.recommendation ?? '').trim().toUpperCase();
    const isResearchBullish = researchRecommendation === 'BUY' || researchRecommendation === 'ADD' || researchRecommendation === 'BUILD';
    const isResearchBearish = researchRecommendation === 'SELL' || researchRecommendation === 'TRIM' || researchRecommendation === 'EXIT';
    const strongAddConviction = isResearchBullish || riskScore <= 4;
    const strongExitConviction = isResearchBearish || riskScore >= 7;

    // Override decisions based on position status and cash availability
    if (positionData?.stock_in_holdings) {
      if (plStatus === 'NEAR_STOP_LOSS') {
        if (hasAmpleCash) {
          if (strongAddConviction) {
            console.log(`📊 ${plStatus} with ample deployable cash (${allowedDeployablePercentage}% vs ${targetCashAllocation}% policy buffer) - prioritising ADD 25-40%`);
            setFinalDecisionIntent(finalDecision, 'ADD', '25-40%', 'Average down meaningfully to improve basis with ample cash cushion');
          } else if (strongExitConviction) {
            console.log(`📊 ${plStatus} but thesis weak - shifting to TRIM 30-40% despite ample cash`);
            setFinalDecisionIntent(finalDecision, 'TRIM', '30-40%', 'Reduce exposure near stop due to weakening thesis');
          } else if (finalDecision.intent !== 'ADD') {
            console.log(`📊 ${plStatus} with mixed outlook - defaulting to ADD 15-25% cautiously`);
            setFinalDecisionIntent(finalDecision, 'ADD', '15-25%', 'Cautious average down with protective stops');
          }
        } else if (hasSufficientCash) {
          if (strongAddConviction && finalDecision.intent !== 'ADD') {
            console.log(`📊 ${plStatus} with sufficient deployable cash (${allowedDeployablePercentage}% vs ${targetCashAllocation}% policy buffer) - ADD 10-20% selectively`);
            setFinalDecisionIntent(finalDecision, 'ADD', '10-20%', 'Selective average down while keeping dry powder');
          } else if (!strongAddConviction && finalDecision.intent !== 'TRIM') {
            console.log(`📊 ${plStatus} with moderate cash - favour TRIM 20-30% to control risk`);
            setFinalDecisionIntent(finalDecision, 'TRIM', '20-30%', 'Trim exposure near stop to maintain discipline');
          }
        } else if (hasCashAvailable) {
          if (strongAddConviction && finalDecision.intent !== 'ADD') {
            console.log(`📊 ${plStatus} with limited deployable cash (${allowedDeployablePercentage}% vs ${targetCashAllocation}% policy buffer) - micro ADD 5-10%`);
            setFinalDecisionIntent(finalDecision, 'ADD', '5-10%', 'Small add using remaining liquidity, stop tight');
          } else if (finalDecision.intent !== 'TRIM') {
            console.log(`📊 ${plStatus} with scarce cash - pivoting to TRIM 30-40%`);
            setFinalDecisionIntent(finalDecision, 'TRIM', '30-40%', 'Free up capital and defend downside');
          }
        } else if (finalDecision.intent !== 'TRIM') {
          console.log(`📊 ${plStatus} with NO cash - enforcing TRIM 15-25% for risk control`);
          setFinalDecisionIntent(finalDecision, 'TRIM', '15-25%', 'No cash to average down, reduce exposure instead');
        }
      } else if (plStatus === 'NEAR_PROFIT_TARGET') {
        if (finalDecision.intent !== 'TRIM' && finalDecision.intent !== 'EXIT') {
          console.log(`📊 ${plStatus} - enforcing TRIM 20-35% to secure gains`);
          setFinalDecisionIntent(finalDecision, 'TRIM', '20-35%', 'Lock partial gains as target approaches');
        }
      } else if (plStatus === 'ABOVE_PROFIT_TARGET') {
        if (finalDecision.intent !== 'TRIM' && finalDecision.intent !== 'EXIT') {
          console.log(`📊 ${plStatus} - enforcing TRIM 40-60% or more`);
          setFinalDecisionIntent(finalDecision, 'TRIM', '40-60%', 'Harvest gains above target and trail remainder');
        }
      } else if (plStatus === 'EXCEEDED_STOP_LOSS') {
        if (finalDecision.intent !== 'EXIT') {
          if (hasAmpleCash && strongAddConviction && finalDecision.intent === 'ADD') {
            console.log(`📊 ${plStatus} but ample cash & strong conviction - honour existing ADD plan`);
          } else {
            console.log(`📊 ${plStatus} - overriding to EXIT 70-100% (deployable cash ${allowedDeployablePercentage}% vs policy ${targetCashAllocation}%)`);
            setFinalDecisionIntent(finalDecision, 'EXIT', '70-100%', 'Cut losses decisively after stop breach');
          }
        }
      }

      console.log(`📊 Final decision after overrides: intent=${finalDecision.intent}, trade=${finalDecision.tradeDirection}, confidence=${finalDecision.confidence}%`);
    }

    if (!hasCashAvailable && (finalDecision.intent === 'ADD' || finalDecision.intent === 'BUILD')) {
      console.log('🚫 Deployable cash constraint - overriding ADD/BUILD to HOLD');
      setFinalDecisionIntent(finalDecision, 'HOLD', undefined, 'Deployable cash exhausted; maintain position until cash policy buffer is restored');
    }

    // Normalise trade direction/decision before persisting (guards against stale values)
    const normalisedTradeDirection = intentToTradeDirection(finalDecision.intent);
    finalDecision.tradeDirection = normalisedTradeDirection;
    finalDecision.decision = normalisedTradeDirection;

    // Update the confidence and decision in agentOutput to use the extracted values
    agentOutput.finalAssessment.confidence = `${finalDecision.confidence}%`;
    agentOutput.finalAssessment.decision = finalDecision.decision;
    agentOutput.finalAssessment.intent = finalDecision.intent;
    agentOutput.finalAssessment.executionPlan = {
      intent: finalDecision.intent,
      action: finalDecision.tradeDirection,
      suggestedPercent: finalDecision.suggestedPercent,
      note: finalDecision.executionNote
    };

    // Update agent insights atomically
    const insightsResult = await updateAgentInsights(supabase, analysisId, 'riskManager', agentOutput);
    if (!insightsResult.success) {
      console.error('Failed to update insights:', insightsResult.error);
    }

    // Append message atomically
    const messageResult = await appendAnalysisMessage(
      supabase,
      analysisId,
      'Risk Manager',
      aiResponse,
      'final-assessment'
    );
    if (!messageResult.success) {
      console.error('Failed to append message:', messageResult.error);
    }

    // Update decision and confidence but NOT final status (Portfolio Manager will do that)
    const { error: updateError } = await supabase
      .from('analysis_history')
      .update({
        decision: finalDecision.decision,
        confidence: finalDecision.confidence,
        // Don't set analysis_status to completed here - Portfolio Manager will do that
      })
      .eq('id', analysisId);

    if (updateError) {
      console.error('Failed to update decision:', updateError);
    }

    // Update watchlist with last analysis date and decision
    console.log(`📊 Updating watchlist for ${ticker} with decision: ${finalDecision.decision}`);
    const { error: watchlistError } = await supabase
      .from('watchlist')
      .update({
        last_analysis: new Date().toISOString(),
        last_decision: finalDecision.decision
      })
      .eq('user_id', userId)
      .eq('ticker', ticker);

    if (watchlistError) {
      console.error('⚠️ Failed to update watchlist:', watchlistError);
    } else {
      console.log('✅ Watchlist updated successfully');
    }

    // Handle agent completion - either success or error
    if (agentError) {
      // Set agent to error status
      const errorResult = await setAgentToError(
        supabase,
        analysisId,
        'risk',
        'Risk Manager',
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
        clearAgentTimeout(timeoutId, 'Risk Manager', 'error in AI processing');
      }

      // Don't continue to next phase on error
      console.log('❌ Risk Manager encountered error - not notifying coordinator');

      return new Response(JSON.stringify({
        success: false,
        agent: 'Risk Manager',
        error: agentError,
        errorType: errorType,
        finalAssessment: agentOutput.finalAssessment,
        retryInfo: retryStatus
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    } else {
      // Only set to completed if no errors
      await updateWorkflowStepStatus(supabase, analysisId, 'risk', 'Risk Manager', 'completed');

      // Clear timeout on successful completion
      if (timeoutId !== null) {
        clearAgentTimeout(timeoutId, 'Risk Manager', 'completed successfully');
      }

      console.log(`✅ Risk Manager completed final assessment for ${ticker} (${retryStatus})`);
      console.log(`📊 Final Decision: intent=${finalDecision.intent}, tradeDirection=${finalDecision.tradeDirection}, confidence=${finalDecision.confidence}%`);
      console.log(`📤 Passing to Portfolio Manager for position sizing...`);

      // Notify coordinator of completion using reliable notification with retry logic
      notifyCoordinatorAsync(supabase, {
        analysisId,
        ticker,
        userId,
        phase: 'risk',
        agent: 'risk-manager',
        apiSettings,
        analysisContext
      }, 'Risk Manager');
    }

    return new Response(JSON.stringify({
      success: true,
      agent: 'Risk Manager',
      finalAssessment: agentOutput.finalAssessment,
      decision: finalDecision,
      retryInfo: retryStatus
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Risk Manager', 'error occurred');
    }

    console.error('❌ Risk Manager critical error:', error);

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
          'risk',
          'Risk Manager',
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

function calculateRiskScore(agentInsights: AgentInsightsSummary): number {
  let totalScore = 0;
  let factors = 0;

  // Market risk factors
  const volatility = agentInsights.marketAnalyst?.data?.volatility?.current || 'medium';
  if (volatility === 'low') totalScore += 2;
  else if (volatility === 'medium') totalScore += 5;
  else totalScore += 8;
  factors++;

  // Fundamental risk
  const fundamentalScore = agentInsights.fundamentalsAnalyst?.summary?.fundamentalScore || 50;
  totalScore += Math.round((100 - fundamentalScore) / 10);
  factors++;

  // Sentiment risk
  const sentiment = agentInsights.socialMediaAnalyst?.summary?.overallSentiment || 'neutral';
  if (sentiment === 'positive') totalScore += 3;
  else if (sentiment === 'neutral') totalScore += 5;
  else totalScore += 7;
  factors++;

  // Research conclusion risk
  const conviction = agentInsights.researchManager?.summary?.conviction || 5;
  totalScore += (10 - conviction);
  factors++;

  return Math.round(totalScore / factors);
}

function translatePlanAction(action: string | undefined, hasPosition: boolean): string {
  if (!action) {
    return hasPosition ? 'HOLD (per trading plan)' : 'BUILD (per trading plan)';
  }

  const mapped = normaliseRecommendation(action.toString().trim().toUpperCase(), hasPosition);

  switch (mapped.intent) {
    case 'BUILD':
      return 'BUILD (per trading plan)';
    case 'ADD':
      return 'ADD (per trading plan)';
    case 'TRIM':
      return 'TRIM (per trading plan)';
    case 'EXIT':
      return 'EXIT (per trading plan)';
    default:
      return 'HOLD (per trading plan)';
  }
}

function containsAny(text: string, keywords: string[]): boolean {
  const haystack = text.toLowerCase();
  return keywords.some(keyword => haystack.includes(keyword.toLowerCase()));
}

function deduceIntent(decision: 'BUY' | 'SELL' | 'HOLD', aiResponse: string, hasPosition: boolean): RiskIntent {
  const text = aiResponse.toLowerCase();

  if (containsAny(text, ['full exit', 'exit position', 'close position', 'liquidate', 'close out'])) {
    return hasPosition ? 'EXIT' : 'HOLD';
  }
  if (containsAny(text, ['trim', 'partial sell', 'scale out', 'take profit', 'reduce exposure', 'lock in gains'])) {
    return hasPosition ? 'TRIM' : 'HOLD';
  }
  if (containsAny(text, ['average down', 'add to position', 'scale in', 'increase position', 'double down', 'top up'])) {
    return hasPosition ? 'ADD' : 'BUILD';
  }
  if (!hasPosition && containsAny(text, ['build position', 'initiate position', 'open position', 'start position'])) {
    return 'BUILD';
  }
  if (!hasPosition && /\bbuild\b/.test(text)) {
    return 'BUILD';
  }
  if (!hasPosition && /\bgo\b/.test(text)) {
    return 'BUILD';
  }

  if (decision === 'BUY') {
    return hasPosition ? 'ADD' : 'BUILD';
  }
  if (decision === 'SELL') {
    return hasPosition ? 'TRIM' : 'EXIT';
  }
  return 'HOLD';
}

function intentToTradeDirection(intent: RiskIntent): 'BUY' | 'SELL' | 'HOLD' {
  if (intent === 'BUILD' || intent === 'ADD') {
    return 'BUY';
  }
  if (intent === 'TRIM' || intent === 'EXIT') {
    return 'SELL';
  }
  return 'HOLD';
}

function normaliseRecommendation(recommendation: string, hasPosition: boolean): { decision: 'BUY' | 'SELL' | 'HOLD'; intent: RiskIntent } {
  switch (recommendation) {
    case 'BUY':
      return { decision: 'BUY', intent: hasPosition ? 'ADD' : 'BUILD' };
    case 'SELL':
      return { decision: 'SELL', intent: hasPosition ? 'TRIM' : 'EXIT' };
    case 'TRIM':
      return { decision: 'SELL', intent: 'TRIM' };
    case 'EXIT':
      return { decision: 'SELL', intent: 'EXIT' };
    case 'ADD':
      return { decision: 'BUY', intent: hasPosition ? 'ADD' : 'BUILD' };
    case 'BUILD':
      return { decision: 'BUY', intent: 'BUILD' };
    case 'HOLD':
      return { decision: 'HOLD', intent: 'HOLD' };
    default:
      return { decision: hasPosition ? 'HOLD' : 'HOLD', intent: hasPosition ? 'HOLD' : 'HOLD' };
  }
}

function formatPercentValue(raw: string | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const numeric = Number.parseFloat(trimmed);
  if (Number.isFinite(numeric)) {
    return Number.isInteger(numeric) ? Math.trunc(numeric).toString() : numeric.toString();
  }
  return trimmed;
}

function findPercentWithKeywords(text: string, leadKeywords: string[], tailKeywords: string[]): string {
  const percentValue = '(\\d{1,3}(?:\\.\\d{1,2})?)';
  const rangePart = `${percentValue}(?:\\s*(?:-|to)\\s*(\\d{1,3}(?:\\.\\d{1,2})?))?`;
  const suffix = '\\s*(?:%|percent)';

  const leadPattern = new RegExp(`(?:${leadKeywords.join('|')})[^\\d%]{0,40}?${rangePart}${suffix}`, 'i');
  const tailPattern = new RegExp(`${rangePart}${suffix}[^\\d%]{0,25}?(?:${tailKeywords.join('|')})`, 'i');
  const positionPattern = new RegExp(`${rangePart}${suffix}[^\\d%]{0,20}?(?:position|allocation|exposure|holding|stake)`, 'i');

  const patterns = [leadPattern, tailPattern, positionPattern];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const first = formatPercentValue(match[1]);
      const second = formatPercentValue(match[2]);
      if (first && second) {
        return `${first}-${second}%`;
      }
      if (first) {
        return `${first}%`;
      }
    }
  }

  return '';
}

function extractSuggestedPercent(text: string, intent: RiskIntent): string {
  if (intent === 'HOLD') {
    return '';
  }

  if (intent === 'EXIT') {
    return '100%';
  }

  if (intent === 'TRIM') {
    return findPercentWithKeywords(
      text,
      ['trim', 'reduce', 'sell', 'scale\\s+out', 'take\\s+profit', 'lock\\s+in', 'lighten', 'cut', 'de-risk'],
      ['trim', 'reduction', 'sell', 'take\\s+profit', 'scale\\s+out', 'de-risk']
    );
  }

  if (intent === 'ADD') {
    return findPercentWithKeywords(
      text,
      ['add', 'increase', 'average\\s+down', 'scale\\s+in', 'top\\s+up', 'boost', 'double\\s+down'],
      ['add', 'increase', 'scale\\s+in', 'average\\s+down', 'boost']
    );
  }

  if (intent === 'BUILD') {
    return findPercentWithKeywords(
      text,
      ['build', 'initiate', 'start', 'open', 'establish', 'target', 'allocate'],
      ['build', 'initiation', 'starter', 'allocation', 'position', 'exposure']
    );
  }

  return '';
}

function setFinalDecisionIntent(finalDecision: FinalDecisionRecord, intent: RiskIntent, suggestedPercent?: string, note?: string) {
  finalDecision.intent = intent;
  finalDecision.tradeDirection = intentToTradeDirection(intent);
  finalDecision.decision = finalDecision.tradeDirection;
  if (typeof suggestedPercent === 'string') {
    finalDecision.suggestedPercent = suggestedPercent;
  }
  if (typeof note === 'string') {
    finalDecision.executionNote = note;
  }
}

function extractDecisionFromAI(
  aiResponse: string,
  researchConclusion: ResearchConclusionSummary | null | undefined,
  riskScore: number,
  hasPosition: boolean
): FinalDecisionRecord {
  let confidence = 70;
  let resolvedIntent: RiskIntent | null = null;
  let percentSource = '';

  try {
    const finalTransactionIntent = extractIntentFromFinalTransaction(aiResponse, hasPosition);
    if (finalTransactionIntent) {
      resolvedIntent = finalTransactionIntent.intent;
      percentSource = finalTransactionIntent.source;
      console.log(`📊 Extracted FINAL TRANSACTION PROPOSAL intent: ${resolvedIntent}`);
    }

    const recommendationIntent = extractIntentFromRecommendation(aiResponse, hasPosition);
    if (recommendationIntent) {
      if (!resolvedIntent) {
        resolvedIntent = recommendationIntent.intent;
      }
      if (!percentSource) {
        percentSource = recommendationIntent.source;
      }
      console.log(`📊 Extracted Recommendation intent: ${recommendationIntent.intent}`);
    }

    if (!resolvedIntent) {
      const fallbackIntent = extractIntentFromDecisionLine(aiResponse, hasPosition);
      if (fallbackIntent) {
        resolvedIntent = fallbackIntent.intent;
        if (!percentSource) {
          percentSource = fallbackIntent.source;
        }
        console.log(`📊 Extracted fallback decision intent: ${resolvedIntent}`);
      }
    }

    if (!resolvedIntent && researchConclusion?.recommendation) {
      const normalized = String(researchConclusion.recommendation ?? '').trim().toUpperCase();
      if (normalized) {
        resolvedIntent = normaliseRecommendation(normalized, hasPosition).intent;
        console.log(`📊 Using Research Manager recommendation: ${normalized}`);
      }
    }

    if (!resolvedIntent) {
      resolvedIntent = deduceIntent('HOLD', aiResponse, hasPosition);
      console.log('📊 Falling back to deduced intent from narrative text');
    }

    const finalIntent = resolvedIntent ?? 'HOLD';
    const finalDecision = intentToTradeDirection(finalIntent);

    const extractedConfidence = extractConfidenceScore(aiResponse);
    if (extractedConfidence !== null) {
      confidence = extractedConfidence;
      console.log(`📊 Extracted confidence from AI: ${confidence}%`);
    } else {
      confidence = calculateConfidenceFromRiskScore(riskScore, finalDecision, aiResponse);
      console.log(`📊 Calculated confidence from risk score: ${confidence}%`);
    }

    const percentText = percentSource || aiResponse;
    const suggestedPercent = finalIntent === 'HOLD' ? '' : extractSuggestedPercent(percentText, finalIntent);

    console.log(`🎯 Extracted from AI: Intent="${finalIntent}", Trade Direction="${finalDecision}", Confidence=${confidence}%`);

    return {
      decision: finalDecision,
      tradeDirection: finalDecision,
      intent: finalIntent,
      confidence,
      suggestedPercent,
      executionNote: ''
    };
  } catch (error) {
    console.error('Error extracting decision from AI response:', error);

    let fallbackIntent: RiskIntent = 'HOLD';

    if (researchConclusion?.recommendation) {
      const normalized = String(researchConclusion.recommendation ?? '').trim().toUpperCase();
      if (normalized) {
        fallbackIntent = normaliseRecommendation(normalized, hasPosition).intent;
        console.log(`📊 Using Research Manager recommendation: ${normalized}`);
      }
    } else if (riskScore <= 4) {
      fallbackIntent = hasPosition ? 'ADD' : 'BUILD';
      console.log(`📊 Low risk score (${riskScore}) suggests ${fallbackIntent}`);
    } else if (riskScore >= 7) {
      fallbackIntent = hasPosition ? 'TRIM' : 'EXIT';
      console.log(`📊 High risk score (${riskScore}) suggests ${fallbackIntent}`);
    }

    const fallbackDecision = intentToTradeDirection(fallbackIntent);

    return {
      decision: fallbackDecision,
      tradeDirection: fallbackDecision,
      intent: fallbackIntent,
      confidence,
      suggestedPercent: fallbackIntent === 'HOLD' ? '' : extractSuggestedPercent(aiResponse, fallbackIntent),
      executionNote: ''
    };
  }
}

type IntentExtractionResult = {
  intent: RiskIntent
  source: string
}

const LINE_PREFIX_PATTERN = '(?:^|\\r?\\n)\\s*(?:[-*•]\\s*)?(?:\\d+\\.\\s*)?';
const RECOMMENDATION_LINE_PATTERN = new RegExp(`${LINE_PREFIX_PATTERN}(?:FINAL\\s+)?(?:GO\\/NO-GO\\s+|GO\\s+)?RECOMMENDATION(?:\\s*\\d+)?(?:\\s*[-:]\\s*)?([^\\n]*)`, 'i');
const DECISION_LINE_PATTERN = new RegExp(`${LINE_PREFIX_PATTERN}(?:FINAL\\s+DECISION|DECISION|OVERALL\\s+DECISION|Recommendation)\\s*[:\\-]\\s*([^\\n]*)`, 'i');
const FINAL_TRANSACTION_LABEL = 'FINAL TRANSACTION PROPOSAL';

function extractIntentFromFinalTransaction(text: string, hasPosition: boolean): IntentExtractionResult | null {
  const upper = text.toUpperCase();
  const labelIndex = upper.lastIndexOf(FINAL_TRANSACTION_LABEL);
  if (labelIndex === -1) {
    return null;
  }

  const afterLabel = text.slice(labelIndex + FINAL_TRANSACTION_LABEL.length);
  const remainder = afterLabel.replace(/^[\s:;\-–—]+/, '');
  const firstLine = remainder.split(/\r?\n/)[0] || '';
  const tokenMatch = /(NO-GO|GO|BUILD|ADD|TRIM|EXIT|HOLD|BUY|SELL)/.exec(firstLine.toUpperCase());
  if (!tokenMatch) {
    return null;
  }

  const intent = mapTokenToIntent(tokenMatch[1], hasPosition);
  if (!intent) {
    return null;
  }

  const sourceSnippet = text.slice(labelIndex, labelIndex + FINAL_TRANSACTION_LABEL.length + firstLine.length + 1);
  return {
    intent,
    source: sourceSnippet.trim()
  };
}

function extractIntentFromRecommendation(text: string, hasPosition: boolean): IntentExtractionResult | null {
  const match = RECOMMENDATION_LINE_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  let payload = match[1].trim();
  if (!payload) {
    const afterIndex = match.index + match[0].length;
    const remaining = text.slice(afterIndex);
    const nextLine = remaining.split(/\n/)[0]?.trim();
    if (nextLine) {
      payload = nextLine;
    }
  }
  const tokenMatch = /(NO-GO|GO|BUILD|ADD|TRIM|EXIT|HOLD|BUY|SELL)/.exec(payload.toUpperCase());
  if (!tokenMatch) {
    return null;
  }
  const intent = mapTokenToIntent(tokenMatch[1], hasPosition);
  if (!intent) {
    return null;
  }
  return {
    intent,
    source: match[0]
  };
}

function extractIntentFromDecisionLine(text: string, hasPosition: boolean): IntentExtractionResult | null {
  const match = DECISION_LINE_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  const tokenMatch = /(NO-GO|GO|BUILD|ADD|TRIM|EXIT|HOLD|BUY|SELL)/.exec(match[1].toUpperCase());
  if (!tokenMatch) {
    return null;
  }
  const intent = mapTokenToIntent(tokenMatch[1], hasPosition);
  if (!intent) {
    return null;
  }
  return {
    intent,
    source: match[0]
  };
}

function mapTokenToIntent(token: string, hasPosition: boolean): RiskIntent | null {
  switch (token) {
    case 'BUILD':
      return 'BUILD';
    case 'ADD':
      return hasPosition ? 'ADD' : 'BUILD';
    case 'TRIM':
      return 'TRIM';
    case 'EXIT':
      return 'EXIT';
    case 'HOLD':
      return 'HOLD';
    case 'BUY':
      return hasPosition ? 'ADD' : 'BUILD';
    case 'SELL':
      return hasPosition ? 'TRIM' : 'EXIT';
    case 'GO':
      return hasPosition ? 'ADD' : 'BUILD';
    case 'NO-GO':
      return hasPosition ? 'EXIT' : 'HOLD';
    default:
      return null;
  }
}

const CONFIDENCE_PATTERNS = [
  /Confidence[^\d]*(\d+)\s*%/i,
  /Confidence\s*Level[:\s]+(\d+)\/10/i,
  /Confidence[:\s]+(\d+)\/10/i,
  /(\d+)\/10\s+(?:\()?(?:High|Medium|Low)?\s*confidence/i,
  /confidence[:\s]+(\d+)%/i,
  /confidence[:\s]*(\d+)\s*%/i,
  /(\d+)%\s+confidence/i,
  /(\d+)\s*%\s+confidence/i,
  /Confidence:\s*(\d+)\s*%/i,
  /with\s+(\d+)%\s+confidence/i,
  /(\d+)%\s+confident/i
];

function extractConfidenceScore(aiResponse: string): number | null {
  for (const pattern of CONFIDENCE_PATTERNS) {
    const match = pattern.exec(aiResponse);
    if (match) {
      const value = parseInt(match[1]);
      return value <= 10 ? value * 10 : Math.min(100, value);
    }
  }
  return null;
}

function calculateConfidenceFromRiskScore(riskScore: number, decision: string, aiResponse: string): number {
  let baseConfidence = 70;

  // Adjust confidence based on risk score (lower risk = higher confidence)
  if (riskScore <= 3) {
    baseConfidence = 90;
  } else if (riskScore <= 5) {
    baseConfidence = 80;
  } else if (riskScore <= 7) {
    baseConfidence = 70;
  } else {
    baseConfidence = 60;
  }

  // Adjust based on decision type
  if (decision === 'HOLD') {
    baseConfidence -= 10; // HOLD typically indicates uncertainty
  }

  // Look for confidence indicators in the text
  const strongIndicators = [
    /strongly/i, /clear/i, /definitive/i, /compelling/i, /robust/i, /significant/i
  ];
  const weakIndicators = [
    /cautious/i, /uncertain/i, /mixed/i, /limited/i, /moderate/i, /potential/i
  ];

  let strengthAdjustment = 0;
  strongIndicators.forEach(regex => {
    if (regex.test(aiResponse)) strengthAdjustment += 5;
  });
  weakIndicators.forEach(regex => {
    if (regex.test(aiResponse)) strengthAdjustment -= 5;
  });

  return Math.max(50, Math.min(95, baseConfidence + strengthAdjustment));
}
