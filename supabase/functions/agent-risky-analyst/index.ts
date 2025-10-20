import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { appendAnalysisMessage, updateAgentInsights, updateWorkflowStepStatus, updateAnalysisPhase, setAgentToError } from '../_shared/atomicUpdate.ts'
import { callAIProviderWithRetry, SYSTEM_PROMPTS } from '../_shared/aiProviders.ts'
import { notifyCoordinatorAsync } from '../_shared/coordinatorNotification.ts'
import { invokeNextAgentInSequence } from '../_shared/phaseProgressChecker.ts'
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts'
import { checkAgentCompletion, checkForBlockingOperations } from '../_shared/agentCompletionCheck.ts'
import { AgentRequest } from '../_shared/types.ts'
import { formatNYTimestamp, getMarketSession } from '../_shared/timezoneUtils.ts'

serve(async (req) => {
    let timeoutId: number | null = null;

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

        const request: AgentRequest = await req.json();
        const { analysisId, ticker, userId, apiSettings, context, analysisContext } = request;

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
        console.log(`🔥 Risky Analyst starting for: ${ticker} (${retryStatus})`);
        console.log(`🕒 Analysis time: ${formatNYTimestamp()} - Market session: ${getMarketSession()}`);
        console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

        // Check if this agent has already completed for this analysis
        const isRetryAttempt = request.retryCount !== undefined && request.retryCount > 0;
        
        const completionStatus = await checkAgentCompletion(
            supabase,
            analysisId,
            'agent-risky-analyst',
            'Risky Analyst',
            isRetryAttempt
        );
        
        if (completionStatus.hasCompleted && completionStatus.status === 'completed') {
            console.log(`✅ Risky Analyst already completed for analysis ${analysisId}`);
            console.log(`   Skipping duplicate execution to save API calls`);
            
            // Clear any timeout that might have been set
            if (timeoutId !== null) {
                clearAgentTimeout(timeoutId, 'Risky Analyst', 'already completed');
            }
            
            // Return the existing insights if available
            return new Response(JSON.stringify({
                success: true,
                agent: 'Risky Analyst',
                message: 'Agent already completed for this analysis',
                alreadyCompleted: true,
                existingInsights: completionStatus.existingInsights,
                retryInfo: retryStatus
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            });
        }
        
        // Don't check for "already running" - the coordinator handles that before invocation
        // The agent will see itself as "running" because the coordinator marks it as such
        // Only check for "already completed" to avoid re-doing work

        // Check for any blocking operations
        const blockingCheck = await checkForBlockingOperations(supabase, analysisId, 'agent-risky-analyst');
        if (!blockingCheck.canProceed) {
            console.log(`🛑 Risky Analyst cannot proceed: ${blockingCheck.reason}`);
            return new Response(JSON.stringify({
                success: false,
                error: `Risky Analyst cannot proceed: ${blockingCheck.reason}`,
                isCanceled: true
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            });
        }

        // Setup timeout with self-retry mechanism
        timeoutId = setupAgentTimeout(
            supabase,
            request,
            {
                functionName: 'agent-risky-analyst',
                maxRetries: 3,
                timeoutMs: 180000, // 3 minutes
                retryDelay: 3000   // 3 second delay between retries
            },
            'Risky Analyst'
        );

        // Check if analysis still exists by trying to update it (deletion check)
        const updateResult = await updateAnalysisPhase(supabase, analysisId, 'Risky Analyst analyzing', {
            agent: 'Risky Analyst',
            message: 'Starting aggressive risk analysis',
            timestamp: new Date().toISOString(),
            type: 'info'
        });

        // If analysis phase update fails, it likely means analysis was deleted
        if (!updateResult.success) {
            console.log(`🛑 Risky Analyst stopped: ${updateResult.error}`);
            return new Response(JSON.stringify({
                success: false,
                message: `Risky Analyst stopped: ${updateResult.error}`,
                canceled: true
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            });
        }

        // Get existing analysis data
        const { data: analysisData, error: analysisError } = await supabase
            .from('analysis_history')
            .select('full_analysis')
            .eq('id', analysisId)
            .single();

        if (analysisError || !analysisData) {
            console.error('❌ Failed to fetch analysis data:', analysisError);
            throw new Error('Could not retrieve analysis data');
        }

        const fullAnalysis = analysisData.full_analysis || {};
        const insights = fullAnalysis.insights || {};

        console.log(`📊 Available insights: ${Object.keys(insights).join(', ')}`);

        // Extract position context
        const positionData = analysisContext?.position;
        const preferences = analysisContext?.preferences;
        const portfolioData = analysisContext?.portfolioData;

        // Build and call AI analysis
        let analysisText = '';
        let agentError = null;

        try {
            analysisText = await analyzeWithAI(ticker, insights, apiSettings, positionData, preferences, portfolioData);

            // Validate that we got a response
            if (!analysisText || analysisText.trim() === '') {
                console.error('⚠️ Risky Analyst received empty analysis text from AI');
                throw new Error('AI provider returned empty response');
            }
        } catch (aiError) {
            console.error('❌ AI analysis failed:', aiError.message);
            agentError = aiError.message || 'Failed to get AI response';

            // Create a detailed fallback analysis
            analysisText = createFallbackAnalysis(ticker, agentError);
            console.log('📝 Using fallback analysis due to error');
        }

        // Create structured insight object
        const agentOutput = {
            agent: 'Risky Analyst',
            timestamp: new Date().toISOString(),
            analysis: analysisText,
            error: agentError,
            summary: {
                riskProfile: 'aggressive',
                focus: 'high-risk high-reward opportunities',
                perspective: 'growth-oriented with volatility tolerance'
            }
        };

        console.log(`🔥 Risky Analyst insight created - Analysis length: ${analysisText.length} chars`);

        // Update analysis atomically to prevent race conditions
        console.log('💾 Updating analysis results atomically...');

        // Handle agent completion - either success or error
        if (agentError) {
            // Set agent to error status using the new helper function
            const errorResult = await setAgentToError(
                supabase,
                analysisId,
                'risk',
                'Risky Analyst',
                agentError,
                agentError.includes('rate limit') || agentError.includes('quota') ? 'rate_limit' :
                    agentError.includes('API key') || agentError.includes('invalid key') || agentError.includes('api_key') ? 'api_key' :
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
            const insightsResult = await updateAgentInsights(supabase, analysisId, 'riskyAnalyst', agentOutput);
            if (!insightsResult.success) {
                console.error('Failed to update insights:', insightsResult.error);
            }

            // Append message atomically
            const messageResult = await appendAnalysisMessage(
                supabase,
                analysisId,
                'Risky Analyst',
                analysisText,
                'risk'
            );
            if (!messageResult.success) {
                console.error('Failed to append message:', messageResult.error);
            }

            // Update workflow step status to completed
            const statusResult = await updateWorkflowStepStatus(
                supabase,
                analysisId,
                'risk',
                'Risky Analyst',
                'completed'
            );
            if (!statusResult.success) {
                console.error('Failed to update workflow status:', statusResult.error);
            }
        }

        // Clear timeout on successful completion
        if (timeoutId !== null) {
            clearAgentTimeout(timeoutId, 'Risky Analyst', 'completed successfully');
        }

        console.log(`✅ Risky Analyst data saved successfully`);
        console.log(`✅ Risky Analyst completed for: ${ticker} (${retryStatus})`);

        // Only invoke next agent if this agent completed successfully
        if (agentError) {
            // Notify coordinator about the error - do NOT invoke next agent
            console.log(`⚠️ Risky Analyst completed with errors - notifying coordinator, NOT invoking next agent`);
            notifyCoordinatorAsync(supabase, {
                analysisId,
                ticker,
                userId,
                phase: 'risk',
                agent: 'risky-analyst',
                apiSettings,
                error: agentError,
                errorType: agentError.includes('rate limit') || agentError.includes('quota') ? 'rate_limit' :
                    agentError.includes('API key') || agentError.includes('invalid key') || agentError.includes('api_key') ? 'api_key' :
                        agentError.includes('AI provider') || agentError.includes('No API key provided') ? 'ai_error' : 'other',
                completionType: 'error',
                analysisContext: analysisContext || context?.analysisContext
            }, 'Risky Analyst');
        } else {
            // Success case - invoke next agent
            console.log(`🔄 Risky Analyst attempting to invoke next agent in risk phase...`);

            const nextAgentResult = await invokeNextAgentInSequence(
                supabase,
                analysisId,
                'risk',
                'risky-analyst',
                ticker,
                request.userId,
                request.apiSettings,
                analysisContext || request.analysisContext
            );

            if (nextAgentResult.success) {
                if (nextAgentResult.isLastInPhase) {
                    console.log(`📋 Risky Analyst is last in risk phase - notifying coordinator for phase transition`);
                    notifyCoordinatorAsync(supabase, {
                        analysisId,
                        ticker,
                        userId,
                        phase: 'risk',
                        agent: 'risky-analyst',
                        apiSettings,
                        completionType: 'last_in_phase',
                        analysisContext: analysisContext || context?.analysisContext
                    }, 'Risky Analyst');
                } else {
                    console.log(`✅ Risky Analyst successfully handed off to: ${nextAgentResult.nextAgent}`);
                }
            } else {
                console.log(`⚠️ Failed to invoke next agent, falling back to coordinator: ${nextAgentResult.error}`);
                notifyCoordinatorAsync(supabase, {
                    analysisId,
                    ticker,
                    userId,
                    phase: 'risk',
                    agent: 'risky-analyst',
                    apiSettings,
                    completionType: 'fallback_invocation_failed',
                    failedToInvoke: nextAgentResult.intendedAgent,
                    analysisContext: analysisContext || context?.analysisContext
                }, 'Risky Analyst');
            }
        }

        return new Response(JSON.stringify({
            success: true,
            agent: 'Risky Analyst',
            analysis: analysisText,
            retryInfo: retryStatus
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        // Clear timeout on error
        if (timeoutId !== null) {
            clearAgentTimeout(timeoutId, 'Risky Analyst', 'error occurred');
        }

        console.error('❌ Risky Analyst error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            agent: 'Risky Analyst'
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200 // Return 200 so coordinator notifications work
        });
    }
});

async function analyzeWithAI(ticker: string, insights: any, apiSettings: any, positionData?: any, preferences?: any, portfolioData?: any): Promise<string> {
    // Build position context for the prompt
    let positionContext = '';
    if (positionData?.stock_in_holdings) {
        const plPercent = positionData.unrealized_pl_percent || 0;
        const profitTarget = preferences?.profit_target || 25;
        const stopLoss = preferences?.stop_loss || 10;
        const positionSize = ((positionData.market_value / (portfolioData?.totalValue || 100000)) * 100).toFixed(1);
        const minSize = apiSettings?.rebalance_min_position_size || 5;
        const maxSize = apiSettings?.rebalance_max_position_size || 25;
        
        // Get near threshold from preferences (default to 20%, meaning "near" is 80% of target)
        const nearLimitThreshold = preferences?.near_limit_threshold || 20;
        const nearThresholdPercent = 100 - nearLimitThreshold;
        
        // Calculate P/L relative to targets
        const percentOfProfitTarget = (plPercent / profitTarget) * 100;
        const percentOfStopLoss = (Math.abs(plPercent) / stopLoss) * 100;
        
        // Categorize relative to PROFIT TARGET (3 cases)
        let profitStatus = '';
        if (plPercent > 0) {
            if (percentOfProfitTarget >= 100) {
                profitStatus = 'above_profit_target';  // Above profit target
            } else if (percentOfProfitTarget >= nearThresholdPercent) {
                profitStatus = 'near_profit_target';   // Near profit target (dynamic threshold)
            } else {
                profitStatus = 'below_profit_target';  // Below threshold
            }
        }
        
        // Categorize relative to STOP LOSS (3 cases)
        let lossStatus = '';
        if (plPercent < 0) {
            if (percentOfStopLoss >= 100) {
                lossStatus = 'above_stop_loss';  // Exceeded stop loss
            } else if (percentOfStopLoss >= nearThresholdPercent) {
                lossStatus = 'near_stop_loss';   // Near stop loss (dynamic threshold)
            } else {
                lossStatus = 'below_stop_loss';  // Below threshold
            }
        }
        
        // Build position context based on categorization
        if (profitStatus === 'above_profit_target') {
            positionContext = `
**CURRENT POSITION:**
- Owns: ${positionData.shares} shares
- Entry Price: $${positionData.entry_price?.toFixed(2) || 'N/A'}
- Current Price: $${positionData.current_price?.toFixed(2) || 'N/A'}
- Unrealized P/L: +${plPercent.toFixed(1)}% ($${positionData.unrealized_pl?.toFixed(2) || 'N/A'})
- Position Size: ${positionSize}% of portfolio (Min: ${minSize}%, Max: ${maxSize}%)
- 🎯 STATUS: Position has exceeded the ${profitTarget}% profit target
- Current gain is ${(percentOfProfitTarget - 100).toFixed(0)}% above the target level
- From an aggressive perspective, momentum may continue`;
        } else if (profitStatus === 'near_profit_target') {
            positionContext = `
**CURRENT POSITION:**
- Owns: ${positionData.shares} shares
- Entry Price: $${positionData.entry_price?.toFixed(2) || 'N/A'}
- Current Price: $${positionData.current_price?.toFixed(2) || 'N/A'}
- Unrealized P/L: +${plPercent.toFixed(1)}% ($${positionData.unrealized_pl?.toFixed(2) || 'N/A'})
- Position Size: ${positionSize}% of portfolio (Min: ${minSize}%, Max: ${maxSize}%)
- 📊 STATUS: Position is approaching the ${profitTarget}% profit target
- Currently at ${percentOfProfitTarget.toFixed(0)}% of target
- 💡 AGGRESSIVE ACTION: Consider taking 10-20% partial profits to lock minimal gains while maximizing upside
- From an aggressive perspective, potential breakout zone - hold majority for momentum`;
        } else if (profitStatus === 'below_profit_target' && plPercent > 0) {
            positionContext = `
**CURRENT POSITION:**
- Owns: ${positionData.shares} shares
- Entry Price: $${positionData.entry_price?.toFixed(2) || 'N/A'}
- Current Price: $${positionData.current_price?.toFixed(2) || 'N/A'}
- Unrealized P/L: +${plPercent.toFixed(1)}% ($${positionData.unrealized_pl?.toFixed(2) || 'N/A'})
- Position Size: ${positionSize}% of portfolio (Min: ${minSize}%, Max: ${maxSize}%)
- 🚀 STATUS: Position is profitable but below the ${profitTarget}% target
- Currently at ${percentOfProfitTarget.toFixed(0)}% of profit target
- From an aggressive perspective, position is building momentum`;
        } else if (lossStatus === 'above_stop_loss') {
            positionContext = `
**CURRENT POSITION:**
- Owns: ${positionData.shares} shares
- Entry Price: $${positionData.entry_price?.toFixed(2) || 'N/A'}
- Current Price: $${positionData.current_price?.toFixed(2) || 'N/A'}
- Unrealized P/L: ${plPercent.toFixed(1)}% ($${positionData.unrealized_pl?.toFixed(2) || 'N/A'})
- Position Size: ${positionSize}% of portfolio (Min: ${minSize}%, Max: ${maxSize}%)
- 🔥 STATUS: Position has exceeded the -${stopLoss}% stop loss threshold
- Current loss is ${(percentOfStopLoss - 100).toFixed(0)}% beyond the stop level
- From an aggressive perspective, potential turnaround opportunity`;
        } else if (lossStatus === 'near_stop_loss') {
            positionContext = `
**CURRENT POSITION:**
- Owns: ${positionData.shares} shares
- Entry Price: $${positionData.entry_price?.toFixed(2) || 'N/A'}
- Current Price: $${positionData.current_price?.toFixed(2) || 'N/A'}
- Unrealized P/L: ${plPercent.toFixed(1)}% ($${positionData.unrealized_pl?.toFixed(2) || 'N/A'})
- Position Size: ${positionSize}% of portfolio (Min: ${minSize}%, Max: ${maxSize}%)
- ⚠️ STATUS: Position is approaching the -${stopLoss}% stop loss threshold
- Currently at ${percentOfStopLoss.toFixed(0)}% of stop loss level
- 💡 AGGRESSIVE ACTION: Consider exiting 10-20% to reduce risk slightly, hold majority for potential reversal
- From an aggressive perspective, critical decision zone - watch for bounce signals`;
        } else if (lossStatus === 'below_stop_loss') {
            positionContext = `
**CURRENT POSITION:**
- Owns: ${positionData.shares} shares
- Entry Price: $${positionData.entry_price?.toFixed(2) || 'N/A'}
- Current Price: $${positionData.current_price?.toFixed(2) || 'N/A'}
- Unrealized P/L: ${plPercent.toFixed(1)}% ($${positionData.unrealized_pl?.toFixed(2) || 'N/A'})
- Position Size: ${positionSize}% of portfolio (Min: ${minSize}%, Max: ${maxSize}%)
- 📉 STATUS: Position has a minor loss, well within the -${stopLoss}% threshold
- Currently at ${percentOfStopLoss.toFixed(0)}% of stop loss level
- From an aggressive perspective, temporary volatility`;
        } else {
            positionContext = `
**CURRENT POSITION:**
- Owns: ${positionData.shares} shares
- Entry Price: $${positionData.entry_price?.toFixed(2) || 'N/A'}
- Current Price: $${positionData.current_price?.toFixed(2) || 'N/A'}
- Unrealized P/L: ${plPercent.toFixed(1)}% ($${positionData.unrealized_pl?.toFixed(2) || 'N/A'})
- Position Size: ${positionSize}% of portfolio (Min: ${minSize}%, Max: ${maxSize}%)
- User Targets: ${profitTarget}% profit / -${stopLoss}% stop loss
- Position is near breakeven
- From an aggressive perspective, coiling for potential move`;
        }
    } else {
        positionContext = `
**CURRENT POSITION:**
- No existing position in ${ticker}
- Portfolio Constraints: Min position size ${apiSettings?.rebalance_min_position_size || 5}%, Max position size ${apiSettings?.rebalance_max_position_size || 25}%
- AGGRESSIVE PERSPECTIVE: Evaluate optimal entry for maximum risk/reward
- Consider aggressive initial position sizing or options strategies`;
    }

    const prompt = `You are an aggressive risk analyst focused on high-risk, high-reward investment opportunities for ${ticker}.

**Your Role:**
- Identify maximum profit potential scenarios
- Assess aggressive trading strategies
- Evaluate high-volatility opportunities
- Consider leveraged positions and derivatives
- Focus on growth potential over safety

${positionContext}

**Available Analysis Data:**
${JSON.stringify(insights, null, 2)}

**Analysis Instructions:**
1. **Aggressive Opportunities** - Identify high-risk scenarios with maximum upside potential
2. **Volatility Assessment** - How can volatility be leveraged for profits?
3. **Growth Scenarios** - Best-case growth scenarios and catalysts
4. **Leveraged Strategies** - Options, margin, and leverage considerations
5. **Risk Tolerance** - For investors comfortable with significant downside risk
6. **Timing Considerations** - When to maximize aggressive positions

Provide an aggressive, growth-focused analysis that prioritizes maximum returns.`;

    try {
        const maxTokens = apiSettings.analysis_max_tokens || 1800;
        console.log(`📝 Using ${maxTokens} max tokens for risky analysis`);

        const result = await callAIProviderWithRetry(apiSettings, prompt, SYSTEM_PROMPTS.riskyAnalyst, maxTokens, 3);

        if (!result || result.trim() === '') {
            throw new Error('AI provider returned empty response. Please check your API configuration.');
        }

        return result;
    } catch (error) {
        console.error(`AI analysis error:`, error);
        throw error;
    }
}

function createFallbackAnalysis(ticker: string, error: string): string {
    return `# Risky Analysis for ${ticker}

## Analysis Status
⚠️ **Limited Analysis Available**: ${error}

## Aggressive Investment Perspective
**High-Risk Tolerance Required** - This analysis is for aggressive investors comfortable with significant losses.

### Risk-Reward Framework
- Potential for outsized returns in favorable scenarios
- Suitable for portfolio allocation of 5-10% maximum
- High volatility trading opportunities

*Analysis generated with limited data due to: ${error}*`;
}