import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { setupAgentTimeout, clearAgentTimeout, getRetryStatus } from '../_shared/agentSelfInvoke.ts';
import { AgentRequest } from '../_shared/types.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { MarketData } from './types.ts';
import { fetchMarketDataWithCachedIndicators } from './cachedMarketDataFetcher.ts';
import { evaluateOpportunities } from './evaluator.ts';
import { handleWorkflowUpdates, handleWorkflowError } from './workflowHandler.ts';
import { validateAndCheckCancellation, prepareData } from './requestValidator.ts';

serve(async (req) => {
  let timeoutId: number | null = null;
  let rebalanceRequestId: string | undefined;

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const request: AgentRequest = await req.json();
    rebalanceRequestId = request.rebalanceRequestId;

    // Validate request and check for cancellation
    const validation = await validateAndCheckCancellation(request, rebalanceRequestId);
    if (!validation.isValid) {
      return validation.response!;
    }

    // Get AI settings
    const { apiSettings } = request;
    const aiProvider = apiSettings?.opportunity_agent_ai || apiSettings?.ai_provider || 'openai';
    const aiModel = apiSettings?.opportunity_agent_model || apiSettings?.ai_model || 'gpt-4';

    // Determine which API key will be used
    let apiKeySource = 'none';
    if (aiProvider === apiSettings?.ai_provider && apiSettings?.ai_api_key) {
      apiKeySource = 'general';
    } else if (apiSettings[`${aiProvider}_api_key`]) {
      apiKeySource = `${aiProvider}_api_key`;
    } else if (apiSettings?.ai_api_key) {
      apiKeySource = 'general (fallback)';
    }

    const retryStatus = getRetryStatus(request);
    console.log(`🔍 Opportunity Agent: Evaluating market opportunities (${retryStatus})`);
    console.log(`🤖 Using AI: ${aiProvider} | Model: ${aiModel} | Key: ${apiKeySource}`);

    // Setup timeout with self-retry mechanism
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    timeoutId = setupAgentTimeout(
      supabase,
      request,
      {
        functionName: 'opportunity-agent',
        maxRetries: 3,
        timeoutMs: 180000,
        retryDelay: 3000
      },
      'Opportunity Agent'
    );

    // Prepare and validate data
    const { portfolioData, watchlistData, marketRange, alpacaCredentials } = prepareData(request);

    // Fetch market data with cached indicators if credentials are available
    if (alpacaCredentials.apiKey && alpacaCredentials.secretKey && watchlistData.length > 0) {
      try {
        // Use the new cached approach with indicators
        await fetchMarketDataWithCachedIndicators(
          watchlistData as MarketData[], 
          alpacaCredentials, 
          marketRange,
          validation.supabase || supabase,
          request.userId
        );
      } catch (marketDataError) {
        console.error('❌ Error fetching market data:', marketDataError);
        // Log error but continue with analysis
        if (rebalanceRequestId && validation.supabase) {
          await validation.supabase
            .from('rebalance_requests')
            .update({
              opportunity_reasoning: {
                marketDataError: `Failed to fetch market data: ${marketDataError.message}`,
                marketDataErrorType: 'data_fetch',
                timestamp: new Date().toISOString()
              }
            })
            .eq('id', rebalanceRequestId)
            .catch((err: any) => console.error('Failed to log market data error:', err));
        }
      }
    }

    // Analyze market data for opportunities
    const opportunities = await evaluateOpportunities(
      portfolioData,
      watchlistData as MarketData[],
      apiSettings,
      marketRange
    );

    // Clear timeout on successful completion
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Opportunity Agent', 'completed successfully');
    }

    console.log(`✅ Opportunity evaluation complete (${retryStatus}): ${
      opportunities.recommendAnalysis ? 'Analysis recommended' : 'No action needed'
    }`);

    if (opportunities.recommendAnalysis) {
      console.log(`  Selected ${opportunities.selectedStocks.length} stocks for analysis`);
    }

    // Handle workflow updates and coordinator notification
    await handleWorkflowUpdates(rebalanceRequestId, request, opportunities);

    return new Response(JSON.stringify({
      success: true,
      ...opportunities,
      retryInfo: retryStatus
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    // Clear timeout on error
    if (timeoutId !== null) {
      clearAgentTimeout(timeoutId, 'Opportunity Agent', 'error occurred');
    }

    console.error('❌ Opportunity agent error:', error);

    // Handle error recording for rebalance workflows
    await handleWorkflowError(rebalanceRequestId, error);

    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // Return 200 so coordinator notifications work
    });
  }
});