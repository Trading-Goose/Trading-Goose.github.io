import { serve } from 'https://deno.land/std@0.210.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { ANALYSIS_STATUS } from '../_shared/statusTypes.ts';

/**
 * Edge function to detect and reactivate stale running analyses
 * Called by pg_cron periodically to check for analyses stuck in 'running' state
 * Analyses are considered stale if they haven't been updated in 3.5+ minutes
 * 
 * Note: Only checks RUNNING status, not PENDING (as pending might be queued in rebalance workflows)
 * Restricted to internal calls only (service role authentication required)
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
    const staleThreshold = 3.5 * 60 * 1000; // 3.5 minutes in milliseconds
    const staleTime = new Date(currentTime.getTime() - staleThreshold);

    console.log(`🔍 Detecting stale analyses at ${currentTime.toISOString()}`);
    console.log(`   Looking for analyses not updated since ${staleTime.toISOString()}`);

    // Query for stale RUNNING analyses only
    // We don't check PENDING analyses as they might be queued in a rebalance workflow
    const { data: staleAnalyses, error: fetchError } = await supabase
      .from('analysis_history')
      .select('id, ticker, user_id, updated_at, created_at, analysis_status, metadata')
      .eq('analysis_status', ANALYSIS_STATUS.RUNNING)
      .lt('updated_at', staleTime.toISOString())
      .order('updated_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch stale analyses: ${fetchError.message}`);
    }

    if (!staleAnalyses || staleAnalyses.length === 0) {
      console.log('No stale running analyses detected');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No stale running analyses detected',
          checked_at: currentTime.toISOString(),
          stale_threshold_minutes: 3.5,
          checked_count: 0,
          reactivated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${staleAnalyses.length} stale running analysis(es) to reactivate`);

    let reactivatedCount = 0;
    let failedCount = 0;
    const results: any[] = [];

    // Process each stale analysis
    for (const analysis of staleAnalyses) {
      try {
        const timeSinceUpdate = currentTime.getTime() - new Date(analysis.updated_at || analysis.created_at).getTime();
        const minutesStale = Math.round(timeSinceUpdate / 60000);

        console.log(`\n🔄 Processing stale analysis ${analysis.id}`);
        console.log(`   Ticker: ${analysis.ticker}`);
        console.log(`   User: ${analysis.user_id}`);
        console.log(`   Status: ${analysis.analysis_status}`);
        console.log(`   Last updated: ${analysis.updated_at} (${minutesStale} minutes ago)`);

        // Re-verify current status before processing (prevent race conditions)
        const { data: currentAnalysis, error: verifyError } = await supabase
          .from('analysis_history')
          .select('analysis_status')
          .eq('id', analysis.id)
          .single();

        if (verifyError) {
          console.error(`Failed to verify current status for analysis ${analysis.id}:`, verifyError);
          failedCount++;
          results.push({
            analysisId: analysis.id,
            ticker: analysis.ticker,
            userId: analysis.user_id,
            status: 'error',
            error: 'Failed to verify current status'
          });
          continue;
        }

        // Check if status has changed since our initial query
        if (currentAnalysis.analysis_status !== ANALYSIS_STATUS.RUNNING) {
          console.log(`⏩ Skipping analysis ${analysis.id} - status changed to ${currentAnalysis.analysis_status}`);
          results.push({
            analysisId: analysis.id,
            ticker: analysis.ticker,
            userId: analysis.user_id,
            status: 'skipped',
            reason: `Status changed to ${currentAnalysis.analysis_status}`,
            message: 'Analysis no longer stale/running'
          });
          continue;
        }

        // Check automatic reactivation attempts to prevent infinite loops
        // Note: This counter only applies to automatic reactivations by detect-stale-analysis
        // Manual reactivations by users are not limited by this counter
        const reactivationAttempts = analysis.metadata?.reactivation_attempts || 0;
        const maxReactivationAttempts = 3;

        console.log(`   Previous automatic reactivation attempts: ${reactivationAttempts}`);

        if (reactivationAttempts >= maxReactivationAttempts) {
          console.error(`❌ Max automatic reactivation attempts (${maxReactivationAttempts}) reached for analysis ${analysis.id}`);

          // Mark analysis as error after too many automatic reactivation attempts
          const { data: updateData, error: updateError } = await supabase
            .from('analysis_history')
            .update({
              analysis_status: ANALYSIS_STATUS.ERROR,
              metadata: {
                ...(analysis.metadata || {}),
                max_reactivations_reached: true,
                final_reactivation_check: new Date().toISOString(),
                error_message: `Analysis failed after ${maxReactivationAttempts} automatic reactivation attempts. Last stale detection at ${new Date().toISOString()}`
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', analysis.id)
            .select();

          if (updateError) {
            console.error(`❌ Failed to update analysis ${analysis.id} to ERROR status:`, updateError);
            console.error(`   Error details:`, updateError.message, updateError.details, updateError.hint);
          } else {
            console.log(`✅ Successfully marked analysis ${analysis.id} as ERROR`);
            console.log(`   Updated data:`, updateData);
          }

          failedCount++;
          results.push({
            analysisId: analysis.id,
            ticker: analysis.ticker,
            userId: analysis.user_id,
            status: 'error',
            error: `Max automatic reactivation attempts (${maxReactivationAttempts}) exceeded`,
            updateSuccess: !updateError
          });
          continue;
        }

        // Get user's API settings for the reactivation
        const { data: apiSettings, error: settingsError } = await supabase
          .from('api_settings')
          .select('*')
          .eq('user_id', analysis.user_id)
          .single();

        if (settingsError || !apiSettings) {
          console.error(`Failed to get API settings for user ${analysis.user_id}:`, settingsError);

          // Mark analysis as error if we can't get settings
          const { error: updateError } = await supabase
            .from('analysis_history')
            .update({
              analysis_status: ANALYSIS_STATUS.ERROR,
              metadata: {
                ...(analysis.metadata || {}),
                error_reason: 'api_settings_not_found',
                final_check: new Date().toISOString(),
                error_message: 'API settings not found during stale detection'
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', analysis.id);

          if (updateError) {
            console.error(`❌ Failed to update analysis ${analysis.id} to ERROR (no settings):`, updateError);
          } else {
            console.log(`✅ Marked analysis ${analysis.id} as ERROR (no API settings)`);
          }

          failedCount++;
          results.push({
            analysisId: analysis.id,
            ticker: analysis.ticker,
            userId: analysis.user_id,
            status: 'error',
            error: 'API settings not found'
          });
          continue;
        }

        // Validate that API settings have required fields
        if (!apiSettings.ai_provider || !apiSettings.ai_api_key || !apiSettings.ai_model) {
          console.error(`Invalid API settings for user ${analysis.user_id}: missing provider, key, or model`);

          // Mark analysis as error if API settings are incomplete
          const { error: updateError } = await supabase
            .from('analysis_history')
            .update({
              analysis_status: ANALYSIS_STATUS.ERROR,
              metadata: {
                ...(analysis.metadata || {}),
                error_reason: 'incomplete_api_settings',
                final_check: new Date().toISOString(),
                error_message: 'Invalid or incomplete API settings - missing AI provider configuration'
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', analysis.id);

          if (updateError) {
            console.error(`❌ Failed to update analysis ${analysis.id} to ERROR (incomplete settings):`, updateError);
          } else {
            console.log(`✅ Marked analysis ${analysis.id} as ERROR (incomplete API settings)`);
          }

          failedCount++;
          results.push({
            analysisId: analysis.id,
            ticker: analysis.ticker,
            userId: analysis.user_id,
            status: 'error',
            error: 'Invalid API settings - missing AI provider, key, or model'
          });
          continue;
        }

        console.log('   Invoking analysis-coordinator reactivate action...');

        // Increment reactivation attempt counter
        await supabase
          .from('analysis_history')
          .update({
            metadata: {
              ...(analysis.metadata || {}),
              reactivation_attempts: reactivationAttempts + 1,
              last_reactivation_attempt: new Date().toISOString()
            }
          })
          .eq('id', analysis.id);

        // Invoke the analysis-coordinator with reactivate action
        const coordinatorResponse = await supabase.functions.invoke(
          'analysis-coordinator',
          {
            body: {
              action: 'reactivate',
              analysisId: analysis.id,
              userId: analysis.user_id,
              forceReactivate: true // Force reactivation since we've already verified it's stale
            }
          }
        );

        if (coordinatorResponse.error) {
          throw new Error(`Coordinator reactivation failed: ${coordinatorResponse.error.message || JSON.stringify(coordinatorResponse.error)}`);
        }

        // Parse response to check if reactivation was successful
        let responseData: any;
        try {
          responseData = typeof coordinatorResponse.data === 'string'
            ? JSON.parse(coordinatorResponse.data)
            : coordinatorResponse.data;
        } catch (parseError) {
          responseData = coordinatorResponse.data;
        }

        if (responseData?.success === false) {
          throw new Error(responseData.error || 'Reactivation failed');
        }

        reactivatedCount++;
        results.push({
          analysisId: analysis.id,
          ticker: analysis.ticker,
          userId: analysis.user_id,
          status: 'reactivated',
          minutesStale,
          message: responseData?.message || 'Analysis reactivated successfully',
          nextAgent: responseData?.agent,
          phase: responseData?.phase
        });

        console.log(`   ✅ Successfully reactivated analysis ${analysis.id}`);

      } catch (analysisError) {
        console.error(`Error reactivating analysis ${analysis.id}:`, analysisError);

        const errorMessage = analysisError instanceof Error ? analysisError.message : String(analysisError);

        // Update analysis to error status if reactivation fails
        const { error: updateError } = await supabase
          .from('analysis_history')
          .update({
            analysis_status: ANALYSIS_STATUS.ERROR,
            metadata: {
              ...(analysis.metadata || {}),
              reactivation_failed: true,
              failure_reason: errorMessage,
              final_check: new Date().toISOString(),
              error_message: `Failed to reactivate stale analysis: ${errorMessage}`
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', analysis.id);

        if (updateError) {
          console.error(`❌ Failed to update analysis ${analysis.id} to ERROR (reactivation failed):`, updateError);
        } else {
          console.log(`✅ Marked analysis ${analysis.id} as ERROR (reactivation failed)`);
        }

        failedCount++;
        results.push({
          analysisId: analysis.id,
          ticker: analysis.ticker,
          userId: analysis.user_id,
          status: 'error',
          error: errorMessage
        });
      }
    }

    const summary = `Detected ${staleAnalyses.length} stale running analyses: ${reactivatedCount} reactivated, ${failedCount} failed`;
    console.log(`\n📊 Summary: ${summary}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: summary,
        checked_at: currentTime.toISOString(),
        stale_threshold_minutes: 3.5,
        checked_count: staleAnalyses.length,
        reactivated: reactivatedCount,
        failed: failedCount,
        results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error in detect-stale-analysis:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        checked_at: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
