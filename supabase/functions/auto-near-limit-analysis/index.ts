import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { ANALYSIS_STATUS, REBALANCE_STATUS, TRADE_ORDER_STATUS, isAnalysisActive, isRebalanceActive } from '../_shared/statusTypes.ts';
import { fetchAlpacaPortfolio } from '../_shared/portfolio/alpacaClient.ts';
import { invokeWithRetry } from '../_shared/invokeWithRetry.ts';

/**
 * Edge function to automatically trigger analysis when positions approach profit/loss thresholds
 * Called by pg_cron periodically to check portfolios of users who enabled auto_near_limit_analysis
 * 
 * Triggers analysis when position P/L is within the near-limit range:
 * - Profit side: between (profit_target * (1 - near_limit_threshold/100)) and profit_target
 * - Loss side: between -stop_loss and -(stop_loss * (1 - near_limit_threshold/100))
 * 
 * Includes safeguards to prevent duplicate analysis and conflicts with running operations
 */
serve(async (req) => {
  console.log('🚀 auto-near-limit-analysis function invoked');
  console.log('Method:', req.method);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Restrict access to internal calls only (pg_cron, service role)
    const authHeader = req.headers.get('authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    console.log('Auth check - has auth header:', !!authHeader);
    console.log('Auth check - has service key:', !!supabaseServiceKey);

    // For pg_cron calls, we just need to verify there's an auth header
    // pg_cron sends a valid service role JWT token
    // We'll create the client with our service role key regardless
    let supabase;
    
    if (authHeader) {
      // Extract token from "Bearer <token>" format
      const token = authHeader.replace('Bearer ', '');
      
      // Simple check: if it starts with a JWT format and contains "service_role", it's likely from pg_cron
      // JWT tokens always start with eyJ (base64 encoded {")
      if (token.startsWith('eyJ')) {
        try {
          // Decode the JWT payload (middle part)
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            console.log('JWT payload:', { role: payload.role, ref: payload.ref });
            
            // Check if it's a service role token
            if (payload.role === 'service_role') {
              console.log('✅ Authorized with service role JWT');
              supabase = createClient(supabaseUrl, supabaseServiceKey);
              console.log('Supabase client created successfully');
            } else {
              console.log('❌ Not a service role token');
              return new Response(
                JSON.stringify({ error: 'Unauthorized: Service role required' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        } catch (e) {
          console.error('Failed to decode JWT:', e);
          return new Response(
            JSON.stringify({ error: 'Invalid JWT token' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        console.log('❌ Not a valid JWT token');
        return new Response(
          JSON.stringify({ error: 'Invalid authorization format' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log('❌ No authorization header');
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentTime = new Date();
    console.log(`📊 Checking for near-limit positions at ${currentTime.toISOString()}`);

    // Debug: First check if any users exist in api_settings at all
    const { data: allUsers, error: allUsersError } = await supabase
      .from('api_settings')
      .select('user_id, auto_near_limit_analysis')
      .limit(5);
    
    console.log('DEBUG - Sample api_settings records:', {
      count: allUsers?.length || 0,
      sample: allUsers?.slice(0, 2).map((u: any) => ({ 
        user_id: u.user_id?.substring(0, 8), 
        auto_near_limit_analysis: u.auto_near_limit_analysis 
      })),
      error: allUsersError?.message
    });

    // Query for users who have enabled auto_near_limit_analysis
    console.log('Querying for users with auto_near_limit_analysis enabled...');
    const { data: enabledUsers, error: fetchError } = await supabase
      .from('api_settings')
      .select(`
        user_id,
        alpaca_paper_api_key,
        alpaca_paper_secret_key,
        alpaca_live_api_key,
        alpaca_live_secret_key,
        alpaca_paper_trading,
        profit_target,
        stop_loss,
        near_limit_threshold,
        auto_near_limit_analysis,
        ai_provider,
        ai_api_key,
        ai_model
      `)
      .eq('auto_near_limit_analysis', true);

    console.log('Query result:', { 
      hasData: !!enabledUsers, 
      userCount: enabledUsers?.length || 0,
      error: fetchError?.message || null 
    });

    if (fetchError) {
      console.error('Database query failed:', fetchError);
      throw new Error(`Failed to fetch enabled users: ${fetchError.message}`);
    }

    if (!enabledUsers || enabledUsers.length === 0) {
      console.log('No users have auto_near_limit_analysis enabled');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No users with auto_near_limit_analysis enabled',
          checked_at: currentTime.toISOString(),
          users_checked: 0,
          analyses_triggered: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter users who have Alpaca credentials configured
    const usersWithCredentials = enabledUsers.filter((user: any) => {
      const hasPaperCreds = user.alpaca_paper_api_key && user.alpaca_paper_secret_key;
      const hasLiveCreds = user.alpaca_live_api_key && user.alpaca_live_secret_key;
      return hasPaperCreds || hasLiveCreds;
    });

    if (usersWithCredentials.length === 0) {
      console.log('No users with both auto_near_limit_analysis and Alpaca credentials');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No users with both auto_near_limit_analysis and Alpaca credentials configured',
          checked_at: currentTime.toISOString(),
          users_checked: 0,
          analyses_triggered: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${usersWithCredentials.length} user(s) with auto_near_limit_analysis enabled and Alpaca credentials`);

    let analysesTriggered = 0;
    let positionsChecked = 0;
    const results: any[] = [];

    // Process each enabled user with credentials
    for (const userSettings of usersWithCredentials) {
      const userId = userSettings.user_id;
      
      // Prepare settings object with correct Alpaca credentials
      const apiSettings = {
        ...userSettings,
        // Use paper or live credentials based on the alpaca_paper_trading setting
        alpaca_api_key: userSettings.alpaca_paper_trading 
          ? userSettings.alpaca_paper_api_key 
          : userSettings.alpaca_live_api_key,
        alpaca_secret_key: userSettings.alpaca_paper_trading 
          ? userSettings.alpaca_paper_secret_key 
          : userSettings.alpaca_live_secret_key,
        paper_trading: userSettings.alpaca_paper_trading
      };
      
      try {
        console.log(`\n👤 Processing user ${userId} (${userSettings.alpaca_paper_trading ? 'paper' : 'live'} mode)`);

        // Check if user has any running analyses
        const { data: runningAnalyses, error: analysisError } = await supabase
          .from('analysis_history')
          .select('id, ticker, analysis_status')
          .eq('user_id', userId)
          .in('analysis_status', [ANALYSIS_STATUS.PENDING, ANALYSIS_STATUS.RUNNING]);

        if (analysisError) {
          console.error(`Failed to check running analyses for user ${userId}:`, analysisError);
          continue;
        }

        if (runningAnalyses && runningAnalyses.length > 0) {
          console.log(`   ⏳ User has ${runningAnalyses.length} running analysis(es) - skipping`);
          results.push({
            userId,
            status: 'skipped',
            reason: 'Has running analyses',
            runningCount: runningAnalyses.length
          });
          continue;
        }

        // Check if user has any running rebalances
        const { data: runningRebalances, error: rebalanceError } = await supabase
          .from('rebalance_requests')
          .select('id, status')
          .eq('user_id', userId)
          .in('status', [REBALANCE_STATUS.PENDING, REBALANCE_STATUS.RUNNING]);

        if (rebalanceError) {
          console.error(`Failed to check running rebalances for user ${userId}:`, rebalanceError);
          continue;
        }

        if (runningRebalances && runningRebalances.length > 0) {
          console.log(`   ⏳ User has ${runningRebalances.length} running rebalance(s) - skipping`);
          results.push({
            userId,
            status: 'skipped',
            reason: 'Has running rebalances',
            rebalanceCount: runningRebalances.length
          });
          continue;
        }

        // Check if any analysis was done in the last 3 hours for this user
        const threeHoursAgo = new Date(currentTime.getTime() - 3 * 60 * 60 * 1000);

        // Query for all analyses in the last 3 hours for this user
        const { data: recentAnalyses, error: recentError } = await supabase
          .from('analysis_history')
          .select('id, ticker, created_at')
          .eq('user_id', userId)
          .gte('created_at', threeHoursAgo.toISOString())
          .order('created_at', { ascending: false });

        if (recentError) {
          console.error(`Failed to check recent analyses for user ${userId}:`, recentError);
          continue;
        }

        // Track tickers that had any analysis in the last 3 hours
        const recentAnalysisTickers = new Set<string>();
        
        if (recentAnalyses) {
          for (const analysis of recentAnalyses) {
            const tickerKey = (analysis.ticker || '').toUpperCase();
            if (tickerKey) {
              recentAnalysisTickers.add(tickerKey);
            }
          }
        }

        if (recentAnalysisTickers.size > 0) {
          console.log(`   📊 Recent analyses (last 3h) for: ${Array.from(recentAnalysisTickers).join(', ')}`);
        }

        // Check for pending trade actions in Supabase to avoid duplicate orders
        const { data: tradingActions, error: tradingActionsError } = await supabase
          .from('trading_actions')
          .select('id, ticker, status')
          .eq('user_id', userId)
          .eq('status', TRADE_ORDER_STATUS.PENDING);

        const pendingTradeActionTickers = new Set<string>();
        if (tradingActionsError) {
          console.error(`Failed to load trading actions for user ${userId}:`, tradingActionsError);
        } else if (tradingActions && tradingActions.length > 0) {
          const pendingSummaries: string[] = [];
          for (const action of tradingActions) {
            if (action.ticker) {
              pendingTradeActionTickers.add(action.ticker.toUpperCase());
              pendingSummaries.push(`${action.ticker} (id=${action.id})`);
            }
          }
          console.log(`   📄 Pending trade actions for: ${pendingSummaries.join(', ')}`);
        }

        // Now fetch user's portfolio (only after passing all preliminary checks)
        console.log(`   📈 Fetching portfolio for user ${userId}...`);

        let portfolioData;
        try {
          portfolioData = await fetchAlpacaPortfolio(apiSettings);
        } catch (portfolioError: unknown) {
          const errorMsg = portfolioError instanceof Error ? portfolioError.message : String(portfolioError);
          console.error(`   ❌ Failed to fetch portfolio for user ${userId}:`, portfolioError);
          results.push({
            userId,
            status: 'error',
            error: `Portfolio fetch failed: ${errorMsg}`
          });
          continue;
        }

        // Check for open orders and build a set of tickers with pending orders
        const pendingOrderTickers = new Set<string>();
        if (portfolioData?.openOrders && portfolioData.openOrders.length > 0) {
          console.log(`   📦 Found ${portfolioData.openOrders.length} open order(s)`);
          for (const order of portfolioData.openOrders) {
            if (order.symbol) {
              pendingOrderTickers.add(order.symbol.toUpperCase());
            }
            console.log(`      - ${order.symbol}: ${order.side} ${order.qty} @ ${order.type} (${order.status})`);
          }
        }

        if (!portfolioData?.positions || portfolioData.positions.length === 0) {
          console.log(`   📭 User has no positions`);
          results.push({
            userId,
            status: 'no_positions',
            message: 'No positions to check'
          });
          continue;
        }

        console.log(`   📊 Found ${portfolioData.positions.length} position(s)`);

        // Get user's threshold settings (with defaults)
        const profitTarget = userSettings.profit_target || 25;
        const stopLoss = userSettings.stop_loss || 10;
        const nearLimitThreshold = userSettings.near_limit_threshold || 20;

        console.log(`   🎯 User thresholds: profit=${profitTarget}%, loss=${stopLoss}%, near=${nearLimitThreshold}%`);

        // Calculate near-limit ranges
        const profitLowerBound = profitTarget * (1 - nearLimitThreshold / 100);
        const lossUpperBound = -stopLoss * (1 - nearLimitThreshold / 100);

        console.log(`   📏 Near-limit ranges:`);
        console.log(`      Profit: ${profitLowerBound.toFixed(1)}% to ${profitTarget}%`);
        console.log(`      Loss: ${-stopLoss}% to ${lossUpperBound.toFixed(1)}%`);

        // Check each position
        const nearLimitPositions: any[] = [];
        
        for (const position of portfolioData.positions) {
          positionsChecked++;
          
          const symbol = position.symbol;
          const normalizedSymbol = symbol?.toUpperCase();
          const unrealizedPlPercent = position.unrealized_plpc ? position.unrealized_plpc * 100 : 0;

          console.log(`      ${symbol}: P/L = ${unrealizedPlPercent.toFixed(2)}%`);

          // Check if position is within near-limit range
          const isNearProfit = unrealizedPlPercent >= profitLowerBound && unrealizedPlPercent <= profitTarget;
          const isNearLoss = unrealizedPlPercent <= lossUpperBound && unrealizedPlPercent >= -stopLoss;

          if (isNearProfit || isNearLoss) {
            console.log(`      ⚠️ ${symbol} is near ${isNearProfit ? 'profit' : 'loss'} limit!`);
            
            // Skip if there's a pending order in Alpaca or Supabase for this ticker
            if (normalizedSymbol && (pendingOrderTickers.has(normalizedSymbol) || pendingTradeActionTickers.has(normalizedSymbol))) {
              console.log(`      📦 Skipping ${symbol} - pending order detected (${pendingOrderTickers.has(normalizedSymbol) ? 'Alpaca' : 'Supabase'})`);
              continue;
            }
            
            // Check if we already have any analysis for this ticker in the last 3 hours
            if (normalizedSymbol && recentAnalysisTickers.has(normalizedSymbol)) {
              console.log(`      ⏰ Already analyzed ${symbol} in the last 3 hours - skipping`);
              continue;
            }

            nearLimitPositions.push({
              symbol,
              unrealizedPlPercent,
              type: isNearProfit ? 'profit' : 'loss',
              qty: position.qty,
              market_value: position.market_value,
              avg_entry_price: position.avg_entry_price
            });
          }
        }

        if (nearLimitPositions.length === 0) {
          console.log(`   ✅ No positions near limits`);
          results.push({
            userId,
            status: 'checked',
            positionsChecked: portfolioData.positions.length,
            nearLimitFound: 0
          });
          continue;
        }

        // Trigger analysis for each near-limit position
        console.log(`   🚀 Found ${nearLimitPositions.length} position(s) near limits`);
        
        for (const position of nearLimitPositions) {
          try {
            console.log(`   📊 Triggering analysis for ${position.symbol}...`);

            // Trigger the analysis workflow - let coordinator create the record
            // Same pattern as frontend: just ticker and userId, no phase
            const result = await invokeWithRetry(
              supabase,
              'analysis-coordinator',
              {
                ticker: position.symbol,
                userId,
                // No phase - this tells coordinator to start a new analysis
                // No analysisId - coordinator will create it
                // No apiSettings - coordinator will fetch from database
                analysisContext: {
                  type: 'individual',
                  near_limit_analysis: true,
                  position_pl_percent: position.unrealizedPlPercent,
                  near_limit_type: position.type,
                  profit_target: profitTarget,
                  stop_loss: stopLoss,
                  near_limit_threshold: nearLimitThreshold
                }
              }
            );

            if (result.success) {
              const analysisId = result.data?.analysisId || 'unknown';
              console.log(`   ✅ Successfully triggered analysis for ${position.symbol} (ID: ${analysisId})`);
              analysesTriggered++;
              
              results.push({
                userId,
                ticker: position.symbol,
                analysisId,
                status: 'triggered',
                nearLimitType: position.type,
                plPercent: position.unrealizedPlPercent.toFixed(2)
              });
            } else {
              console.error(`   ❌ Failed to trigger analysis workflow:`, result.error);
              
              results.push({
                userId,
                ticker: position.symbol,
                status: 'failed',
                error: result.error || 'Unknown error',
                nearLimitType: position.type,
                plPercent: position.unrealizedPlPercent.toFixed(2)
              });
            }

          } catch (triggerError) {
            console.error(`   ❌ Error triggering analysis for ${position.symbol}:`, triggerError);
          }
        }

      } catch (userError: unknown) {
        const errorMsg = userError instanceof Error ? userError.message : String(userError);
        console.error(`Error processing user ${userId}:`, userError);
        results.push({
          userId,
          status: 'error',
          error: errorMsg
        });
      }
    }

    const summary = `Checked ${enabledUsers.length} user(s), ${positionsChecked} position(s), triggered ${analysesTriggered} analysis(es)`;
    console.log(`\n📊 Summary: ${summary}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: summary,
        checked_at: currentTime.toISOString(),
        users_checked: enabledUsers.length,
        positions_checked: positionsChecked,
        analyses_triggered: analysesTriggered,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Error in auto-near-limit-analysis:', errorMessage);
    console.error('Full error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage || 'Unknown error occurred',
        checked_at: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
