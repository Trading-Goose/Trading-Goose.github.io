import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callAIProviderWithRetry, SYSTEM_PROMPTS } from '../_shared/aiProviders.ts'
import { checkAnalysisCancellation } from '../_shared/cancellationCheck.ts'
import { notifyCoordinatorAsync } from '../_shared/coordinatorNotification.ts'
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts'
import { AgentRequest } from '../_shared/types.ts'
import { updateAgentInsights, appendAnalysisMessage, updateWorkflowStepStatus, updateAnalysisPhase, updateResearchConclusion, setAgentToError } from '../_shared/atomicUpdate.ts'

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
    console.log(`👔 Research Manager starting for ${ticker} (${retryStatus})`);

    // Setup timeout with self-retry mechanism
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      {
        functionName: 'agent-research-manager',
        maxRetries: 3,
        timeoutMs: 180000,
        retryDelay: 3000   // 3 second delay between retries
      },
      'Research Manager'
    );

    // Check if analysis has been canceled before starting work
    const cancellationCheck = await checkAnalysisCancellation(supabase, analysisId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 agent-research-manager stopped: ${cancellationCheck.reason}`);
      return new Response(JSON.stringify({
        success: false,
        message: `agent-research-manager stopped: ${cancellationCheck.reason}`,
        canceled: cancellationCheck.isCanceled
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Check if analysis still exists by trying to update it (deletion check)
    const updateResult = await updateAnalysisPhase(supabase, analysisId, 'Research Manager analyzing', {
      agent: 'Research Manager',
      message: 'Starting research synthesis',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // If analysis phase update fails, it likely means analysis was deleted
    if (!updateResult.success) {
      console.log(`🛑 Research Manager stopped: ${updateResult.error}`);
      return new Response(JSON.stringify({
        success: false,
        message: `Research Manager stopped: ${updateResult.error}`,
        canceled: true
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }

    console.log(`🤖 Using AI: ${apiSettings.ai_provider || 'openai'} | Model: ${apiSettings.ai_model || 'default'}`);

    // Get analysis data including all research debates
    const { data: analysis } = await supabase
      .from('analysis_history')
      .select('agent_insights, full_analysis')
      .eq('id', analysisId)
      .single();

    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // Update analysis status
    await updateAnalysisPhase(supabase, analysisId, 'Research Manager synthesizing findings', {
      agent: 'Research Manager',
      message: 'Synthesizing research and forming recommendation',
      timestamp: new Date().toISOString(),
      type: 'info'
    });

    // Extract all relevant data
    const debateRounds = analysis.full_analysis?.debateRounds || [];
    const bullResearch = analysis.agent_insights?.bullResearcher || {};
    const bearResearch = analysis.agent_insights?.bearResearcher || {};
    const fundamentals = analysis.agent_insights?.fundamentalsAnalyst?.summary || {};
    const marketData = analysis.agent_insights?.marketAnalyst?.summary || {};
    const sentiment = analysis.agent_insights?.socialMediaAnalyst?.summary || {};
    const news = analysis.agent_insights?.newsAnalyst?.summary || {};

    // Prepare AI prompt
    const prompt = `
    As the Research Manager for ${ticker}, synthesize all research findings and provide a balanced recommendation.
    
    Debate Summary (${debateRounds.length} rounds):
    ${debateRounds.map((round: any, i: number) => `
    Round ${i + 1}:
    - Bull Points: ${round.bullPoints?.join(', ') || 'N/A'}
    - Bear Points: ${round.bearPoints?.join(', ') || 'N/A'}
    `).join('\n')}

    Bull Researcher Summary:
    - Conviction: ${bullResearch.summary?.conviction || 'N/A'}
    - Price Target: ${bullResearch.summary?.priceTarget || 'N/A'}
    - Key Points: ${bullResearch.summary?.keyPoints?.join(', ') || 'N/A'}

    Bear Researcher Summary:
    - Conviction: ${bearResearch.summary?.conviction || 'N/A'}
    - Price Target: ${bearResearch.summary?.priceTarget || 'N/A'}
    - Key Points: ${bearResearch.summary?.keyPoints?.join(', ') || 'N/A'}

    Supporting Analysis:
    - Fundamentals: ${JSON.stringify(fundamentals, null, 2)}
    - Market Performance: ${JSON.stringify(marketData, null, 2)}
    - Sentiment: ${JSON.stringify(sentiment, null, 2)}
    - News: ${JSON.stringify(news, null, 2)}

    Provide a comprehensive research conclusion including:
    1. Overall investment recommendation (Strong Buy, Buy, Hold, Sell, Strong Sell)
    2. Conviction level (1-10) with rationale
    3. Fair value estimate and methodology
    4. Key factors supporting the recommendation
    5. Primary risks to monitor
    6. Recommended position sizing and time horizon
    7. Specific action items for traders
    `;

    // Call AI provider
    let aiResponse = '';
    let agentError = null;
    let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'database' | 'timeout' | 'other' = 'other';

    try {
      const maxTokens = apiSettings.research_max_tokens || 1200;
      console.log(`📝 Using ${maxTokens} max tokens for research synthesis`);
      aiResponse = await callAIProviderWithRetry(apiSettings, prompt, SYSTEM_PROMPTS.researchManager, maxTokens, 3);
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
      aiResponse = `Error: Unable to complete research synthesis due to AI provider error.

Research data was collected but could not be synthesized.

Error details: ${agentError}

Please retry the analysis or check your AI provider settings.`;
    }

    // Extract recommendation from AI response (not from hardcoded scoring!)
    const recommendation = extractRecommendationFromAI(aiResponse, bullResearch, bearResearch, fundamentals);

    // Save agent output (even if there was an error)
    const agentOutput = {
      agent: 'Research Manager',
      timestamp: new Date().toISOString(),
      analysis: aiResponse,
      error: agentError,
      summary: {
        recommendation: agentError ? 'ERROR' : recommendation.rating,
        conviction: agentError ? 'error' : recommendation.conviction,
        fairValue: agentError ? 'N/A' : recommendation.fairValue,
        upside: agentError ? 'N/A' : recommendation.upside,
        keyFactors: agentError ? ['Error during analysis'] : [
          'Strong fundamental metrics',
          'Positive market momentum',
          'Manageable risk profile',
          'Favorable risk/reward ratio'
        ],
        risks: agentError ? ['Analysis failed'] : [
          'Valuation concerns',
          'Competitive pressures',
          'Market volatility'
        ],
        timeHorizon: agentError ? 'N/A' : '6-12 months',
        positionSize: agentError ? 'N/A' : 'Medium (3-5% of portfolio)',
        hasError: !!agentError
      }
    };

    // Update agent insights atomically
    const insightsResult = await updateAgentInsights(supabase, analysisId, 'researchManager', agentOutput);
    if (!insightsResult.success) {
      console.error('Failed to update insights:', insightsResult.error);
    }

    // Append message atomically
    const messageResult = await appendAnalysisMessage(
      supabase,
      analysisId,
      'Research Manager',
      aiResponse,
      'synthesis'
    );
    if (!messageResult.success) {
      console.error('Failed to append message:', messageResult.error);
    }

    // The debate rounds already contain the bull and bear analysis text from updateDebateRounds
    // Just store them in agent insights for the UI to display
    if (debateRounds.length > 0) {
      const researchDebateResult = await updateAgentInsights(supabase, analysisId, 'researchDebate', debateRounds);
      if (!researchDebateResult.success) {
        console.error('Failed to store research debate for UI:', researchDebateResult.error);
      }
    }

    // Update research conclusion
    await updateResearchConclusion(supabase, analysisId, agentOutput.summary);

    // Handle agent completion - either success or error
    if (agentError) {
      // Set agent to error status
      const errorResult = await setAgentToError(
        supabase,
        analysisId,
        'research',
        'Research Manager',
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
        clearAgentTimeout(timeoutId, 'Research Manager', 'error in AI processing');
      }

      // CRITICAL: Notify the coordinator about the error
      console.log('❌ Research Manager encountered error - notifying coordinator');

      // The coordinator needs to know so it can decide whether to continue or stop the workflow
      await supabase.functions.invoke('analysis-coordinator', {
        body: {
          action: 'agent-completion',
          agent: 'agent-research-manager',
          analysisId,
          ticker,
          userId,
          apiSettings,
          completionType: 'agent_error',
          error: agentError,
          errorType: errorType
        }
      });

      return new Response(JSON.stringify({
        success: false,
        agent: 'Research Manager',
        error: agentError,
        errorType: errorType,
        retryInfo: retryStatus
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    } else {
      // Only set to completed if no errors
      const statusResult = await updateWorkflowStepStatus(supabase, analysisId, 'research', 'Research Manager', 'completed');
      if (!statusResult.success) {
        console.error('Failed to update workflow status:', statusResult.error);
      }

      // Clear timeout on successful completion
      if (timeoutId !== null) {
        clearAgentTimeout(timeoutId, 'Research Manager', 'completed successfully');
      }

      // Notify coordinator that research phase is complete
      notifyCoordinatorAsync(supabase, {
        analysisId,
        ticker,
        userId,
        phase: 'research',
        agent: 'agent-research-manager',
        apiSettings,
        analysisContext,
        completionType: 'last_in_phase' // Research Manager is the last agent in research phase
      }, 'Research Manager');
    }

    console.log(`✅ Research Manager completed for ${ticker} (${retryStatus})`);

    return new Response(JSON.stringify({
      success: true,
      agent: 'Research Manager',
      summary: agentOutput.summary,
      retryInfo: retryStatus
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Research Manager', 'error occurred');
    }

    console.error('❌ Research Manager critical error:', error);

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
          'Research Manager',
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

/**
 * Extract recommendation from AI response following TradingGoose approach
 * Let the AI make the decision, don't override with hardcoded scoring
 */
function extractRecommendationFromAI(aiResponse: string, bullResearch: any, bearResearch: any, fundamentals: any) {
  let rating = 'Hold'; // Default only if extraction fails
  let conviction = 5;
  let fairValue = '$150';
  let upside = '0%';

  try {
    // Extract recommendation from AI response
    // Look for common patterns the AI uses
    const recommendationPatterns = [
      /recommendation[:\s]+(?:is\s+)?(?:a\s+)?(\w+\s+\w+|\w+)/i,
      /(?:Overall|Final)\s+(?:investment\s+)?recommendation[:\s]+(\w+\s+\w+|\w+)/i,
      /(?:I|We)\s+recommend\s+(?:a\s+)?(\w+\s+\w+|\w+)/i,
      /Rating[:\s]+(\w+\s+\w+|\w+)/i,
      /Decision[:\s]+(\w+\s+\w+|\w+)/i,
      /\*\*(\w+\s+\w+|\w+)\*\*/i, // Bold text
      /###\s+(\w+\s+\w+|\w+)/i, // Headers
    ];

    for (const pattern of recommendationPatterns) {
      const match = aiResponse.match(pattern);
      if (match) {
        const extracted = match[1].trim();
        // Map to standard ratings
        if (extracted.match(/strong\s*buy/i)) {
          rating = 'Strong Buy';
        } else if (extracted.match(/buy/i) && !extracted.match(/sell/i)) {
          rating = 'Buy';
        } else if (extracted.match(/strong\s*sell/i)) {
          rating = 'Strong Sell';
        } else if (extracted.match(/sell/i) && !extracted.match(/buy/i)) {
          rating = 'Sell';
        } else if (extracted.match(/hold/i)) {
          rating = 'Hold';
        }
        break;
      }
    }

    // Extract conviction level from AI response
    const convictionPatterns = [
      /conviction[:\s]+(?:level\s+)?(?:is\s+)?(\d+)/i,
      /conviction[:\s]+(?:level\s+)?(?:is\s+)?(\w+)/i,
      /confidence[:\s]+(?:level\s+)?(?:is\s+)?(\d+)/i,
      /confidence[:\s]+(?:level\s+)?(?:is\s+)?(\w+)/i,
      /(\d+)(?:\/|\s*out\s*of\s*)10/i,
    ];

    for (const pattern of convictionPatterns) {
      const match = aiResponse.match(pattern);
      if (match) {
        const extracted = match[1];
        if (!isNaN(Number(extracted))) {
          conviction = Math.min(10, Math.max(1, parseInt(extracted)));
        } else {
          // Map text to numbers
          if (extracted.match(/very\s*high|strong/i)) conviction = 8;
          else if (extracted.match(/high/i)) conviction = 7;
          else if (extracted.match(/moderate|medium/i)) conviction = 5;
          else if (extracted.match(/low/i)) conviction = 3;
        }
        break;
      }
    }

    // Extract fair value from AI response
    const pricePatterns = [
      /fair\s+value[:\s]+\$?([\d.]+)/i,
      /target\s+price[:\s]+\$?([\d.]+)/i,
      /price\s+target[:\s]+\$?([\d.]+)/i,
      /valued?\s+at[:\s]+\$?([\d.]+)/i,
      /estimate[:\s]+\$?([\d.]+)/i,
    ];

    for (const pattern of pricePatterns) {
      const match = aiResponse.match(pattern);
      if (match) {
        fairValue = `$${match[1]}`;
        break;
      }
    }

    // If AI didn't provide fair value, try to get from bull/bear research
    if (fairValue === '$150') {
      const bullTarget = extractPriceTarget(bullResearch.summary?.priceTarget || bullResearch.analysis);
      const bearTarget = extractPriceTarget(bearResearch.summary?.priceTarget || bearResearch.analysis);
      if (bullTarget > 0 || bearTarget > 0) {
        const avgTarget = bullTarget > 0 && bearTarget > 0 ?
          Math.round((bullTarget + bearTarget) / 2) :
          (bullTarget > 0 ? bullTarget : bearTarget);
        fairValue = `$${avgTarget}`;
      }
    }

    // Extract upside/downside from AI response
    const upsidePatterns = [
      /upside[:\s]+([+-]?[\d.]+)%/i,
      /downside[:\s]+([+-]?[\d.]+)%/i,
      /potential[:\s]+([+-]?[\d.]+)%/i,
      /return[:\s]+([+-]?[\d.]+)%/i,
      /([+-]?[\d.]+)%\s+(?:upside|downside|potential)/i,
    ];

    for (const pattern of upsidePatterns) {
      const match = aiResponse.match(pattern);
      if (match) {
        upside = `${match[1]}%`;
        break;
      }
    }

    // Calculate upside if not extracted but we have fair value
    if (upside === '0%' && fairValue !== '$150') {
      const currentPrice = extractCurrentPrice(bullResearch, bearResearch) || 150;
      const targetPrice = parseFloat(fairValue.replace('$', ''));
      const calculatedUpside = Math.round(((targetPrice - currentPrice) / currentPrice) * 100);
      upside = `${calculatedUpside}%`;
    }

    // Adjust conviction based on the strength of the recommendation
    if (rating === 'Strong Buy' || rating === 'Strong Sell') {
      conviction = Math.max(conviction, 8); // Strong ratings should have high conviction
    } else if (rating === 'Hold' && conviction > 6) {
      conviction = 5; // Hold rarely has high conviction
    }

    console.log(`📊 Extracted from AI: Rating="${rating}", Conviction=${conviction}, FairValue=${fairValue}, Upside=${upside}`);

  } catch (error) {
    console.error('Error extracting recommendation from AI response:', error);
    // If extraction fails completely, make a more intelligent fallback
    // based on the bull vs bear arguments rather than defaulting to Hold
    const bullPoints = countBullishSignals(aiResponse);
    const bearPoints = countBearishSignals(aiResponse);

    if (bullPoints > bearPoints * 1.5) {
      rating = 'Buy';
      conviction = 6;
    } else if (bearPoints > bullPoints * 1.5) {
      rating = 'Sell';
      conviction = 6;
    } else {
      rating = 'Hold';
      conviction = 4;
    }

    console.log(`⚠️ Fallback decision based on signal count: Bull=${bullPoints}, Bear=${bearPoints}, Decision=${rating}`);
  }

  return {
    rating,
    conviction,
    fairValue,
    upside,
    score: 0 // No longer using score-based system
  };
}

/**
 * Count bullish signals in text as a fallback
 */
function countBullishSignals(text: string): number {
  const bullishTerms = [
    /buy/gi, /bullish/gi, /upside/gi, /growth/gi, /strong/gi,
    /positive/gi, /opportunity/gi, /undervalued/gi, /momentum/gi,
    /breakout/gi, /rally/gi, /surge/gi, /gain/gi
  ];
  let count = 0;
  bullishTerms.forEach(term => {
    const matches = text.match(term);
    if (matches) count += matches.length;
  });
  return count;
}

/**
 * Count bearish signals in text as a fallback
 */
function countBearishSignals(text: string): number {
  const bearishTerms = [
    /sell/gi, /bearish/gi, /downside/gi, /risk/gi, /weak/gi,
    /negative/gi, /concern/gi, /overvalued/gi, /decline/gi,
    /fall/gi, /drop/gi, /crash/gi, /loss/gi
  ];
  let count = 0;
  bearishTerms.forEach(term => {
    const matches = text.match(term);
    if (matches) count += matches.length;
  });
  return count;
}

// Helper functions for better extraction
function extractConviction(data: any): number {
  if (typeof data === 'string') {
    if (data.match(/very high|extremely|strong/i)) return 9;
    if (data.match(/high/i)) return 7;
    if (data.match(/moderate|medium/i)) return 5;
    if (data.match(/low/i)) return 3;
  }
  return 5; // default
}

function extractPriceTarget(data: any): number {
  if (typeof data === 'string') {
    const match = data.match(/\$(\d+(?:\.\d+)?)/);
    if (match) return parseFloat(match[1]);
  }
  return 150; // default
}

function extractCurrentPrice(bullResearch: any, bearResearch: any): number {
  // Try to extract from research data
  const bullPrice = extractPriceFromText(bullResearch.analysis);
  const bearPrice = extractPriceFromText(bearResearch.analysis);
  return bullPrice || bearPrice || 150;
}

function extractPriceFromText(text: string): number | null {
  if (!text) return null;
  const match = text.match(/current(?:ly)?.*?\$(\d+(?:\.\d+)?)|trading.*?\$(\d+(?:\.\d+)?)/i);
  if (match) return parseFloat(match[1] || match[2]);
  return null;
}

