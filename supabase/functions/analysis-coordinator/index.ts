import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleAnalysisRequest } from './handlers/request-handler.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAndExtractUser } from '../_shared/auth.ts';

/**
 * Analysis Coordinator - Individual Stock Analysis Workflow
 * 
 * This coordinator manages the workflow for individual stock analyses.
 * It handles the full pipeline from initial analysis through risk management
 * and makes decisions about whether to call analysis-portfolio-manager 
 * (for individual stocks) or rebalance-coordinator (for rebalance completions).
 * 
 * Workflow Phases:
 * 1. Analysis: Market, News, Social Media, Fundamentals analysts
 * 2. Research: Bull/Bear researchers with debate rounds
 * 3. Trading: Trading decision agent
 * 4. Risk: Risk analysts and risk manager
 * 5. Decision: Call appropriate portfolio manager based on context
 * 
 * Key Features:
 * - Individual stock analysis workflow management
 * - Phase progression and agent coordination
 * - Rebalance context awareness
 * - Cancellation handling
 * - Error recovery and retry logic
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
    
    console.log('🔍 Coordinator environment check:');
    console.log(`   SUPABASE_URL: ${supabaseUrl ? 'Found' : 'Missing'}`);
    console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? `Found (${supabaseServiceKey.substring(0, 20)}...)` : 'Missing'}`);
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing required environment variables');
      return new Response(JSON.stringify({
        error: 'Server configuration error'
      }), {
        status: 200,
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
    
    // Delegate all request handling to the analysis request handler
    return await handleAnalysisRequest(req, supabase, {
      userId: authUserId,
      isServiceRequest
    });
    
  } catch (error: any) {
    console.error('❌ Unhandled error in analysis-coordinator:', error);
    
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
