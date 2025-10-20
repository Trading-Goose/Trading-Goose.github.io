import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { checkRebalanceCompletion } from '../utils/completion-checker.ts';
import { ANALYSIS_STATUS, REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { invokeWithRetry } from '../../_shared/invokeWithRetry.ts';
import { updateRebalanceWorkflowStep } from '../../_shared/atomicUpdate.ts';
import { getUserRoleLimits } from '../utils/role-limits.ts';
/**
 * Handle completion of an individual analysis within a rebalance
 * This is the core function that manages atomic completion checking
 * and decides when to call rebalance-portfolio-manager
 */ export async function handleAnalysisCompletion(supabase, rebalanceRequestId, analysisId, ticker, userId, apiSettings, success, error) {
  console.log(`📊 Analysis completion for rebalance ${rebalanceRequestId}: ${ticker} (${success ? 'SUCCESS' : 'FAILED'})`);
  if (error) {
    console.log(`   Error: ${error}`);
  }
  // CRITICAL: Update the analysis status FIRST before checking slots
  // This ensures the completed analysis doesn't occupy a slot
  const newStatus = success ? ANALYSIS_STATUS.COMPLETED : ANALYSIS_STATUS.ERROR;
  const { error: statusUpdateError } = await supabase.from('analysis_history').update({
    analysis_status: newStatus,
    updated_at: new Date().toISOString()
  }).eq('id', analysisId);
  if (statusUpdateError) {
    console.error(`❌ Failed to update analysis status: ${statusUpdateError.message}`);
    // Continue anyway - don't fail the whole completion
  }
  // First, update the completion tracking atomically
  const completionInfo = {
    analysisId,
    ticker,
    success,
    error
  };
  try {
    // Use atomic completion checking without database migrations - fallback to existing completion checker
    const completionStatus = await checkRebalanceCompletion(supabase, rebalanceRequestId);
    console.log(`✅ Checked completion status for ${ticker}`);
    console.log(`   Total: ${completionStatus.totalAnalyses}, Completed: ${completionStatus.completedAnalyses}, Failed: ${completionStatus.failedAnalyses}, Cancelled: ${completionStatus.cancelledAnalyses || 0}`);
    const isComplete = completionStatus.isComplete;
    const currentProgress = completionStatus.completedAnalyses + completionStatus.failedAnalyses + (completionStatus.cancelledAnalyses || 0);
    const totalAnalyses = completionStatus.totalAnalyses;
    console.log(`📊 Rebalance progress: ${currentProgress}/${totalAnalyses} analyses complete`);
    if (isComplete) {
      // Check if we have enough successful analyses to proceed
      // Use Math.ceil to round up - requiring at least 30% success rate
      // Examples: 1-3 stocks = 1 min, 4-6 stocks = 2 min, 7-9 stocks = 3 min, 10 stocks = 3 min
      const minSuccessfulAnalyses = Math.max(1, Math.ceil(totalAnalyses * 0.3));
      if (completionStatus.completedAnalyses < minSuccessfulAnalyses) {
        const totalFailed = completionStatus.failedAnalyses + (completionStatus.cancelledAnalyses || 0);
        console.error(`❌ Not enough successful analyses to proceed with portfolio manager`);
        console.error(`   Required: ${minSuccessfulAnalyses}, Successful: ${completionStatus.completedAnalyses}, Failed: ${completionStatus.failedAnalyses}, Cancelled: ${completionStatus.cancelledAnalyses || 0}`);
        // Mark the rebalance as failed due to insufficient successful analyses
        const { error: updateError } = await supabase.from('rebalance_requests').update({
          status: REBALANCE_STATUS.ERROR,
          error_message: `Insufficient successful analyses: ${completionStatus.completedAnalyses}/${totalAnalyses} succeeded (minimum ${minSuccessfulAnalyses} required, ${totalFailed} failed/cancelled)`,
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        }).eq('id', rebalanceRequestId);
        if (updateError) {
          console.error('Failed to update rebalance status to error:', updateError);
        }
        // Update workflow step to show error
        await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'parallel_analysis', 'error', {
          error: `Too many analyses failed/cancelled: ${totalFailed}/${totalAnalyses}`,
          completedAt: new Date().toISOString(),
          totalAnalyses,
          completedAnalyses: completionStatus.completedAnalyses,
          failedAnalyses: completionStatus.failedAnalyses,
          cancelledAnalyses: completionStatus.cancelledAnalyses || 0
        });
        return createErrorResponse(`Cannot proceed with portfolio manager: only ${completionStatus.completedAnalyses}/${totalAnalyses} analyses succeeded (minimum ${minSuccessfulAnalyses} required, ${totalFailed} failed/cancelled)`, 400);
      }
      console.log('🎆 ALL ANALYSES COMPLETE - calling rebalance-portfolio-manager');
      console.log(`   Successful: ${completionStatus.completedAnalyses}/${totalAnalyses} (minimum ${minSuccessfulAnalyses} met)`);
      // Update rebalance workflow steps to show analyses complete and portfolio manager starting
      const analysisCompleteResult = await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'parallel_analysis', 'completed', {
        completedAt: new Date().toISOString(),
        totalAnalyses,
        completedAnalyses: currentProgress,
        allAnalysesComplete: true
      });
      if (!analysisCompleteResult.success) {
        console.error('❌ Failed to update parallel analysis step:', analysisCompleteResult.error);
      }
      const portfolioManagerResult = await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'portfolio_manager', 'running', {
        startedAt: new Date().toISOString(),
        trigger: 'all_analyses_complete'
      });
      if (!portfolioManagerResult.success) {
        console.error('❌ Failed to update portfolio manager step:', portfolioManagerResult.error);
      }
      // Call rebalance-portfolio-manager with all completed analyses
      // Using invokeAgentWithRetry will automatically apply agent-specific settings
      try {
        // Note: invokeAgentWithRetry expects individual parameters, not a single body object
        // We need to use invokeWithRetry for custom body structure, but we'll get the settings first
        const { getAgentSpecificSettings } = await import('../../analysis-coordinator/utils/api-settings.ts');
        const portfolioManagerSettings = getAgentSpecificSettings(apiSettings, 'rebalance-portfolio-manager');
        const result = await invokeWithRetry(supabase, 'rebalance-portfolio-manager', {
          rebalanceRequestId,
          userId,
          apiSettings: portfolioManagerSettings,
          triggerEvent: 'all_analyses_complete',
          completionInfo
        });
        if (!result.success) {
          console.error('❌ Failed to invoke rebalance-portfolio-manager:', result.error);
          // Rollback portfolio manager status to error
          const rollbackResult = await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'portfolio_manager', 'error', {
            error: `Failed to invoke portfolio manager: ${result.error}`,
            timestamp: new Date().toISOString()
          });
          if (!rollbackResult.success) {
            console.error('❌ Failed to rollback portfolio manager status:', rollbackResult.error);
          }
          // Mark rebalance as failed
          await supabase.from('rebalance_requests').update({
            status: REBALANCE_STATUS.ERROR,
            error_message: `Failed to invoke portfolio manager: ${result.error}`,
            completed_at: new Date().toISOString()
          }).eq('id', rebalanceRequestId);
          return createErrorResponse(`Failed to invoke rebalance-portfolio-manager: ${result.error}`);
        }
        console.log('✅ Successfully invoked rebalance-portfolio-manager');
        return createSuccessResponse({
          message: 'Analysis completion processed - all analyses complete, portfolio manager started',
          rebalanceRequestId,
          analysisId,
          ticker,
          totalComplete: currentProgress,
          totalAnalyses,
          allComplete: true,
          portfolioManagerStarted: true
        });
      } catch (error) {
        console.error('❌ Error invoking rebalance-portfolio-manager:', error);
        // Rollback portfolio manager status to error
        const rollbackResult = await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'portfolio_manager', 'error', {
          error: `Error invoking portfolio manager: ${error.message}`,
          timestamp: new Date().toISOString()
        });
        if (!rollbackResult.success) {
          console.error('❌ Failed to rollback portfolio manager status:', rollbackResult.error);
        }
        // Mark rebalance as failed
        await supabase.from('rebalance_requests').update({
          status: REBALANCE_STATUS.ERROR,
          error_message: `Error invoking portfolio manager: ${error.message}`,
          completed_at: new Date().toISOString()
        }).eq('id', rebalanceRequestId);
        return createErrorResponse(`Error invoking rebalance-portfolio-manager: ${error.message}`);
      }
    } else {
      console.log(`📈 Waiting for more analyses to complete: ${currentProgress}/${totalAnalyses}`);
      // Check if we need to start any pending analyses
      console.log(`🔍 Checking for pending analyses to start...`);
      try {
        // Fetch user's role limits
        const roleLimits = await getUserRoleLimits(supabase, userId);
        const maxParallelAnalyses = roleLimits.max_parallel_analysis || 1;
        console.log(`👤 User role allows ${maxParallelAnalyses} parallel analyses`);
        // Query for pending analyses
        const { data: pendingAnalyses, error: pendingError } = await supabase.from('analysis_history').select('id, ticker').eq('rebalance_request_id', rebalanceRequestId).eq('analysis_status', ANALYSIS_STATUS.PENDING).order('created_at', {
          ascending: true
        });
        if (pendingError) {
          console.error('❌ Error fetching pending analyses:', pendingError);
        } else if (pendingAnalyses && pendingAnalyses.length > 0) {
          console.log(`⏳ Found ${pendingAnalyses.length} pending analyses`);
          // Count currently running analyses
          const { count: runningCount, error: countError } = await supabase.from('analysis_history').select('*', {
            count: 'exact',
            head: true
          }).eq('rebalance_request_id', rebalanceRequestId).eq('analysis_status', ANALYSIS_STATUS.RUNNING);
          if (countError) {
            console.error('❌ Error counting running analyses:', countError);
          } else {
            const currentRunning = runningCount || 0;
            const availableSlots = Math.max(0, maxParallelAnalyses - currentRunning);
            console.log(`📊 Analysis slots:`);
            console.log(`   - Currently running: ${currentRunning}`);
            console.log(`   - Max allowed: ${maxParallelAnalyses}`);
            console.log(`   - Available slots: ${availableSlots}`);
            if (availableSlots > 0) {
              // Start analyses up to available slots
              const analysesToStart = pendingAnalyses.slice(0, availableSlots);
              console.log(`🚀 Starting ${analysesToStart.length} pending analyses`);
              // Update status to RUNNING for analyses we're about to start (only if not cancelled)
              const statusUpdatePromises = analysesToStart.map(async (analysis) => {
                // First check if analysis has been cancelled
                const { data: currentStatus, error: checkError } = await supabase.from('analysis_history').select('analysis_status').eq('id', analysis.id).single();
                if (checkError || !currentStatus) {
                  console.error(`❌ Failed to check status for ${analysis.ticker}:`, checkError);
                  return null;
                }
                // Skip if analysis has been cancelled
                if (currentStatus.analysis_status === ANALYSIS_STATUS.CANCELLED) {
                  console.log(`⏩ Skipping cancelled analysis for ${analysis.ticker}`);
                  return null;
                }
                const { error: updateError } = await supabase.from('analysis_history').update({
                  analysis_status: ANALYSIS_STATUS.RUNNING,
                  updated_at: new Date().toISOString()
                }).eq('id', analysis.id).neq('analysis_status', ANALYSIS_STATUS.CANCELLED); // Double-check with condition
                if (updateError) {
                  console.error(`❌ Failed to update status for ${analysis.ticker}:`, updateError);
                  return null;
                }
                return analysis;
              });
              const updatedAnalyses = (await Promise.all(statusUpdatePromises)).filter((a) => a !== null);
              // Start analysis-coordinator for each pending analysis
              const startPromises = updatedAnalyses.map(async (analysis) => {
                console.log(`🚀 Invoking analysis-coordinator for ${analysis.ticker} (${analysis.id})`);
                try {
                  const result = await invokeWithRetry(supabase, 'analysis-coordinator', {
                    analysisId: analysis.id,
                    ticker: analysis.ticker,
                    userId,
                    phase: 'analysis',
                    apiSettings,
                    analysisContext: {
                      type: 'rebalance',
                      rebalanceRequestId
                    }
                  });
                  if (!result.success) {
                    console.error(`❌ Failed to start analysis for ${analysis.ticker}:`, result.error);
                    // Mark as failed
                    await supabase.from('analysis_history').update({
                      analysis_status: ANALYSIS_STATUS.ERROR,
                      decision: 'ERROR',
                      full_analysis: {
                        error: `Failed to start: ${result.error}`,
                        completedAt: new Date().toISOString()
                      }
                    }).eq('id', analysis.id);
                    return {
                      ticker: analysis.ticker,
                      success: false
                    };
                  }
                  console.log(`✅ Successfully started analysis for ${analysis.ticker}`);
                  return {
                    ticker: analysis.ticker,
                    success: true
                  };
                } catch (error) {
                  console.error(`❌ Exception starting analysis for ${analysis.ticker}:`, error);
                  // Mark as failed
                  await supabase.from('analysis_history').update({
                    analysis_status: ANALYSIS_STATUS.ERROR,
                    decision: 'ERROR',
                    full_analysis: {
                      error: `Exception: ${error.message}`,
                      completedAt: new Date().toISOString()
                    }
                  }).eq('id', analysis.id);
                  return {
                    ticker: analysis.ticker,
                    success: false
                  };
                }
              });
              const startResults = await Promise.all(startPromises);
              const successfulStarts = startResults.filter((r) => r.success);
              console.log(`📊 Started ${successfulStarts.length} pending analyses`);
              return createSuccessResponse({
                message: `Analysis completed, started ${successfulStarts.length} pending analyses`,
                rebalanceRequestId,
                analysisId,
                ticker,
                totalComplete: currentProgress,
                totalAnalyses,
                allComplete: false,
                remainingAnalyses: totalAnalyses - currentProgress,
                pendingStarted: successfulStarts.length,
                pendingRemaining: pendingAnalyses.length - successfulStarts.length
              });
            } else {
              console.log(`⚠️ No available slots to start pending analyses (all ${maxParallelAnalyses} slots in use)`);
            }
          }
        } else {
          console.log(`✅ No pending analyses found`);
        }
      } catch (error) {
        console.error('❌ Error checking/starting pending analyses:', error);
      }
      return createSuccessResponse({
        message: 'Analysis completion processed - waiting for remaining analyses',
        rebalanceRequestId,
        analysisId,
        ticker,
        totalComplete: currentProgress,
        totalAnalyses,
        allComplete: false,
        remainingAnalyses: totalAnalyses - currentProgress
      });
    }
  } catch (error) {
    console.error('❌ Error in analysis completion handling:', error);
    return createErrorResponse(`Error handling analysis completion: ${error.message}`);
  }
}
