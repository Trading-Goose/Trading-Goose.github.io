import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRebalanceCancellation } from '../analysis-coordinator/utils/cancellation.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { AgentRequest } from '../_shared/types.ts';

/**
 * Validate the incoming request and check for cancellation
 */
export async function validateAndCheckCancellation(
  request: AgentRequest,
  rebalanceRequestId: string | undefined
): Promise<{ isValid: boolean; response?: Response; supabase?: any }> {
  
  // Validate required parameters
  if (!request.userId) {
    return {
      isValid: false,
      response: new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameter: userId'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    };
  }

  if (!request.apiSettings) {
    return {
      isValid: false,
      response: new Response(JSON.stringify({
        success: false,
        error: 'Missing required parameter: apiSettings'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    };
  }

  // Check for rebalance cancellation if this is part of a rebalance request
  if (rebalanceRequestId) {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const cancellationCheck = await checkRebalanceCancellation(supabase, rebalanceRequestId);
    if (!cancellationCheck.shouldContinue) {
      console.log(`🛑 Opportunity Agent stopped: ${cancellationCheck.reason}`);
      return {
        isValid: false,
        response: new Response(JSON.stringify({
          success: false,
          message: `Opportunity Agent stopped: ${cancellationCheck.reason}`,
          canceled: cancellationCheck.isCanceled
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        })
      };
    }

    // Check if rebalance request still exists (deletion check)
    const { data: rebalanceRequest, error: rebalanceError } = await supabase
      .from('rebalance_requests')
      .select('id, status')
      .eq('id', rebalanceRequestId)
      .single();

    if (rebalanceError || !rebalanceRequest) {
      console.log(`🛑 Opportunity Agent stopped: Rebalance request not found (likely deleted)`);
      return {
        isValid: false,
        response: new Response(JSON.stringify({
          success: false,
          message: 'Opportunity Agent stopped: Rebalance request not found (likely deleted)',
          canceled: true
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        })
      };
    }

    return { isValid: true, supabase };
  }

  return { isValid: true };
}

/**
 * Prepare and validate portfolio and watchlist data
 */
export function prepareData(request: AgentRequest): {
  portfolioData: any;
  watchlistData: any[];
  marketRange: string;
  alpacaCredentials: {
    apiKey: string;
    secretKey: string;
    paper: boolean;
  };
} {
  let { portfolioData, watchlistData, apiSettings } = request;

  // Validate and log portfolio data safely
  if (portfolioData && portfolioData.positions) {
    console.log(`  Portfolio: ${portfolioData.positions.length} positions, $${(portfolioData.totalValue || 0).toLocaleString()}`);
  } else {
    console.log('  Portfolio: No portfolio data provided or missing positions');
    // Set default portfolio data if not provided
    if (!portfolioData) {
      portfolioData = { positions: [], totalValue: 0 };
    } else if (!portfolioData.positions) {
      portfolioData.positions = [];
    }
  }

  // Validate watchlist data
  if (watchlistData && Array.isArray(watchlistData)) {
    console.log(`  Watchlist: ${watchlistData.length} stocks`);
  } else {
    console.log('  Watchlist: No watchlist data provided');
    watchlistData = [];
  }

  // Get market data time range from settings (default to 1M if not set)
  const marketRange = apiSettings?.opportunity_market_range || '1M';

  // Prepare Alpaca credentials
  const alpacaCredentials = {
    apiKey: apiSettings?.alpaca_paper_api_key || apiSettings?.alpaca_live_api_key || '',
    secretKey: apiSettings?.alpaca_paper_secret_key || apiSettings?.alpaca_live_secret_key || '',
    paper: apiSettings?.alpaca_paper_trading ?? true
  };

  return { portfolioData, watchlistData, marketRange, alpacaCredentials };
}