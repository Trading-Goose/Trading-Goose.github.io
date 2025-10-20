import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleRebalanceRequest } from './handlers/request-handler.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAndExtractUser } from '../_shared/auth.ts';

/**
 * Rebalance Coordinator - Portfolio Rebalancing Workflow Manager
 * 
 * This coordinator manages portfolio rebalancing workflows that involve
 * multiple parallel stock analyses. It orchestrates the entire rebalance
 * process from initial opportunity evaluation through final portfolio
 * management and trade execution.
 * 
 * Key Responsibilities:
 * 1. Start parallel analysis-coordinator calls for each stock in rebalance
 * 2. Track completion of individual analyses within the rebalance
 * 3. Check when ALL analyses in a rebalance are complete
 * 4. Call rebalance-portfolio-manager when all analyses are done
 * 5. Handle rebalance cancellation and error scenarios
 * 
 * Workflow Pattern:
 * - Invoked by rebalance-scheduler to start multiple analyses
 * - Invoked by analysis-coordinator when individual analyses complete
 * - Manages atomic completion checking with concurrent execution safety
 * - Calls rebalance-portfolio-manager for final portfolio decisions
 * 
 * Concurrent Execution Features:
 * - Atomic database operations to prevent race conditions
 * - Completion checking that works with parallel analysis execution
 * - Safe handling of multiple simultaneous analysis completions
 */

/**
 * Main Deno Deploy function handler
 */
serve(async (req: Request): Promise<Response> => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing required environment variables');
      return new Response(JSON.stringify({
        success: false,
        error: 'Server configuration error'
      }), {
        status: 200, // Return 200 so coordinator notifications work
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    const functionAccessToken = Deno.env.get('SUPABASE_FUNCTION_ACCESS_TOKEN') || Deno.env.get('FUNCTION_ACCESS_TOKEN');

    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Authentication required'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    const bearerToken = authHeader.replace('Bearer ', '').trim();
    const allowedServiceTokens = [functionAccessToken, supabaseServiceKey].filter(Boolean) as string[];

    let authUserId: string | null = null;
    let isServiceRequest = false;

    if (allowedServiceTokens.some(token => token === bearerToken)) {
      isServiceRequest = true;
    } else {
      const { userId, error: authError } = await verifyAndExtractUser(authHeader);
      if (authError || !userId) {
        return new Response(JSON.stringify({
          success: false,
          error: authError || 'Authentication failed'
        }), {
          status: 401,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      authUserId = userId;
    }
    
    // Delegate all request handling to the rebalance request handler
    return await handleRebalanceRequest(req, supabase, {
      userId: authUserId,
      isServiceRequest
    });
    
  } catch (error: any) {
    console.error('❌ Unhandled error in rebalance-coordinator:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message
    }), {
      status: 200, // Return 200 so coordinator notifications work
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
