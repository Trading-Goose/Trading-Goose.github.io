import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { REBALANCE_STATUS } from '../_shared/statusTypes.ts';

/**
 * Edge function to process scheduled rebalances
 * Called by pg_cron at :25 and :55 to execute schedules set for :00 and :30
 * Uses pg_net for HTTP calls from within the database
 * Restricted to internal calls only (service role authentication required)
 * 
 * Default interval for schedules without specified interval_unit is monthly
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Restrict access to internal calls only (pg_cron, service role)
    const authHeader = req.headers.get('authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!authHeader) {
      console.log('❌ No authorization header');
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let supabase;
    const token = authHeader.replace('Bearer ', '');

    if (!token.startsWith('eyJ')) {
      console.log('❌ Not a valid JWT token');
      return new Response(
        JSON.stringify({ error: 'Invalid authorization format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Unexpected JWT structure');
      }

      const payload = JSON.parse(atob(parts[1]));
      console.log('Auth payload:', { role: payload.role, ref: payload.ref });

      if (payload.role === 'service_role') {
        supabase = createClient(supabaseUrl, supabaseServiceKey);
        console.log('✅ Authorized with service role JWT');
      } else {
        console.log('❌ Not a service role token');
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Service role required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.error('Failed to decode JWT:', error);
      return new Response(
        JSON.stringify({ error: 'Invalid JWT token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentTime = new Date();
    console.log(`🕐 Processing scheduled rebalances at ${currentTime.toISOString()}`);
    console.log(`   Running at :${currentTime.getMinutes()} minutes past the hour`);

    // Get schedules that should run in the next 30 minutes
    // This catches :00 schedules when running at :25, and :30 schedules when running at :55
    // The function now calculates next run time based on last_executed_at + frequency
    const { data: upcomingSchedules, error: fetchError } = await supabase
      .rpc('get_upcoming_schedules', { p_minutes_ahead: 30 });

    if (fetchError) {
      throw new Error(`Failed to fetch upcoming schedules: ${fetchError.message}`);
    }

    if (!upcomingSchedules || upcomingSchedules.length === 0) {
      console.log('No schedules to process in the next window');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No schedules to process',
          checked_at: currentTime.toISOString(),
          next_window: `Checking for schedules between now and ${new Date(currentTime.getTime() + 30 * 60000).toISOString()}`,
          processed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${upcomingSchedules.length} schedule(s) to process`);

    let processedCount = 0;
    let failedCount = 0;
    const results: any[] = [];

    // Process each schedule
    for (const schedule of upcomingSchedules) {
      try {
        console.log(`\n📅 Processing schedule ${schedule.schedule_id}`);
        console.log(`   User: ${schedule.user_id}`);
        console.log(`   Next run (calculated): ${schedule.next_scheduled_at}`);
        console.log(`   Last executed: ${schedule.last_executed_at || 'never'}`);
        console.log(`   Frequency: every ${schedule.interval_value} ${schedule.interval_unit}`);

        // Check if we have resolved data
        const hasResolvedData = schedule.resolved_constraints &&
          Object.keys(schedule.resolved_constraints).length > 0;

        let tickersToRebalance: string[] = [];
        let constraints: any = {};

        if (hasResolvedData) {
          // Use pre-resolved data (preferred path)
          console.log('   Using pre-resolved schedule data');
          tickersToRebalance = schedule.resolved_tickers || [];
          constraints = schedule.resolved_constraints || {};

          // Ensure includeTickers is set for backward compatibility
          if (!constraints.includeTickers) {
            constraints.includeTickers = tickersToRebalance;
          }
        } else {
          // Fallback: Build constraints from schedule fields (for old schedules)
          console.log('   Building constraints from schedule fields (legacy mode)');

          // Determine which stocks to include
          // NOTE: include_all_positions is deprecated - we only use selected tickers
          if (schedule.selected_tickers && schedule.selected_tickers.length > 0) {
            tickersToRebalance = schedule.selected_tickers;
            console.log(`   Selected tickers: ${tickersToRebalance.join(', ')}`);
          } else {
            // No tickers selected - this shouldn't happen in normal operation
            console.log('   Warning: No tickers selected for rebalance');
            tickersToRebalance = [];
          }

          // Note: include_watchlist is just a UI flag to show watchlist section when editing
          // The selected_tickers already contains the user's final selection including any watchlist stocks
          // We do NOT add all watchlist stocks here - that would override user's deselection

          // Build constraints
          // Note: Position sizes are now in api_settings and will be fetched by portfolio manager
          // We just store basic constraints for reference/logging
          constraints = {
            rebalanceThreshold: schedule.rebalance_threshold || 10,  // Default 10%
            includeTickers: tickersToRebalance,
            scheduledExecution: true,
            skipThresholdCheck: schedule.skip_threshold_check || false,
            skipOpportunityAgent: schedule.skip_opportunity_agent || false
          };
        }

        // Skip if no stocks selected
        if (tickersToRebalance.length === 0) {
          console.log('   ⚠️ No stocks selected for rebalancing - skipping this schedule');

          await supabase.rpc('mark_schedule_executed', {
            p_schedule_id: schedule.schedule_id,
            p_success: false,
            p_error_message: 'No stocks selected for rebalancing'
          });

          failedCount++;
          results.push({
            scheduleId: schedule.schedule_id,
            userId: schedule.user_id,
            status: REBALANCE_STATUS.ERROR,
            error: 'No stocks selected'
          });
          continue;
        }

        console.log('   Creating rebalance request...');
        console.log('   Using schedule-specific rebalance settings');

        // Create rebalance request in database
        // Note: max_position_size, min_position_size, and allocations are now stored in api_settings
        const { data: rebalanceRequest, error: createError } = await supabase
          .from('rebalance_requests')
          .insert({
            user_id: schedule.user_id,
            status: REBALANCE_STATUS.RUNNING,
            target_allocations: {},
            rebalance_threshold: Number(constraints.rebalanceThreshold) || 10,
            portfolio_snapshot: {},
            total_portfolio_value: 0,
            created_by: 'scheduled',
            notes: `Scheduled rebalance (Schedule ID: ${schedule.schedule_id})`,
            skip_threshold_check: constraints.skipThresholdCheck || false,
            skip_opportunity_agent: constraints.skipOpportunityAgent || false,
            constraints: constraints,
            selected_stocks: tickersToRebalance.length > 0 ? tickersToRebalance : null
          })
          .select('id')
          .single();

        if (createError) {
          throw new Error(`Failed to create rebalance request: ${createError.message}`);
        }

        console.log(`   Created rebalance request: ${rebalanceRequest.id}`);

        // Invoke coordinator to start the rebalance workflow
        console.log('   Invoking rebalance-coordinator...');

        const coordinatorResponse = await supabase.functions.invoke(
          'rebalance-coordinator',
          {
            body: {
              userId: schedule.user_id,
              rebalanceRequestId: rebalanceRequest.id,
              action: 'start-rebalance',
              tickers: tickersToRebalance,
              targetAllocations: {},
              constraints,
              skipOpportunityAgent: constraints.skipOpportunityAgent,
              skipThresholdCheck: constraints.skipThresholdCheck,
              rebalanceThreshold: constraints.rebalanceThreshold,
              scheduledExecution: true,
              scheduleId: schedule.schedule_id
            }
          }
        );

        if (coordinatorResponse.error) {
          throw new Error(`Coordinator failed: ${coordinatorResponse.error.message || JSON.stringify(coordinatorResponse.error)}`);
        }

        // Mark schedule as successfully executed
        await supabase.rpc('mark_schedule_executed', {
          p_schedule_id: schedule.schedule_id,
          p_success: true,
          p_rebalance_request_id: rebalanceRequest.id
        });

        processedCount++;

        // Calculate next run time for logging
        const nextRunTime = new Date(schedule.last_executed_at || new Date());
        switch (schedule.interval_unit) {
          case 'days':
            nextRunTime.setDate(nextRunTime.getDate() + schedule.interval_value);
            break;
          case 'weeks':
            nextRunTime.setDate(nextRunTime.getDate() + (schedule.interval_value * 7));
            break;
          case 'months':
            nextRunTime.setMonth(nextRunTime.getMonth() + schedule.interval_value);
            break;
        }

        results.push({
          scheduleId: schedule.schedule_id,
          userId: schedule.user_id,
          status: 'success',
          rebalanceRequestId: rebalanceRequest.id,
          nextRun: nextRunTime.toISOString()
        });

        console.log(`   ✅ Successfully triggered rebalance ${rebalanceRequest.id}`);
        console.log(`   📅 Next run will be approximately: ${nextRunTime.toISOString()}`);

      } catch (scheduleError) {
        console.error(`Error processing schedule ${schedule.schedule_id}:`, scheduleError);

        await supabase.rpc('mark_schedule_executed', {
          p_schedule_id: schedule.schedule_id,
          p_success: false,
          p_error_message: scheduleError.message || 'Unknown error'
        });

        failedCount++;
        results.push({
          scheduleId: schedule.schedule_id,
          userId: schedule.user_id,
          status: REBALANCE_STATUS.ERROR,
          error: scheduleError.message
        });
      }
    }

    const summary = `Processed ${processedCount} successful, ${failedCount} failed out of ${upcomingSchedules.length} schedules`;
    console.log(`\n📊 Summary: ${summary}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: summary,
        checked_at: currentTime.toISOString(),
        window_checked: `${currentTime.toISOString()} to ${new Date(currentTime.getTime() + 30 * 60000).toISOString()}`,
        processed: processedCount,
        failed: failedCount,
        total: upcomingSchedules.length,
        results,
        note: 'Schedules are now processed based on last_executed_at + frequency instead of pre-calculated next_scheduled_at'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in process-scheduled-rebalances:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        checked_at: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
