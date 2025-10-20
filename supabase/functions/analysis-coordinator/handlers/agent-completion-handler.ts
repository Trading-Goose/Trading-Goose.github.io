import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { handlePhaseCompletion } from './phase-completion.ts';
import { handleFailedInvocationFallback } from '../utils/phase-manager.ts';
import { handleRiskManagerCompletion } from './risk-completion.ts';
import { handleBearResearcherCompletion } from './research-completion.ts';
import {
  categorizeAgentError,
  shouldContinueAfterError,
  checkPhaseHealth,
  evaluatePostErrorPhaseHealth
} from '../utils/phase-health-checker.ts';
import { markAnalysisAsErrorWithRebalanceCheck } from '../utils/analysis-error-handler.ts';
import { checkAndExecuteAutoTrades } from '../../_shared/autoTradeChecker.ts';
import { invokeWithRetry } from '../../_shared/invokeWithRetry.ts';
import { markAnalysisCompleted } from '../../_shared/atomicUpdate.ts';

/**
 * Handle agent completion and workflow coordination for individual stock analysis
 */
export async function handleAgentCompletion(
  supabase: any,
  phase: string,
  agent: string,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext,
  error?: string,
  errorType?: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'other',
  completionType?: 'normal' | 'last_in_phase' | 'fallback_invocation_failed' | 'agent_error',
  failedToInvoke?: string
): Promise<Response> {
  
  // First, check if the analysis is already in ERROR state
  // EXCEPTION: Research Manager can recover from ERROR state if it completes successfully
  const { data: currentAnalysis } = await supabase
    .from('analysis_history')
    .select('analysis_status')
    .eq('id', analysisId)
    .single();
  
  if (currentAnalysis?.analysis_status === 'error') {
    // Special exception for Research Manager - it can recover the analysis
    if (agent === 'agent-research-manager' && !error) {
      console.log(`🔄 Research Manager completed successfully - recovering analysis from ERROR state`);
      // Update the analysis status back to RUNNING since Research Manager succeeded
      const { error: recoveryError } = await supabase
        .from('analysis_history')
        .update({ 
          analysis_status: 'running',
          full_analysis: supabase.raw(`
            COALESCE(full_analysis, '{}'::jsonb) || 
            jsonb_build_object(
              'recoveredFromError', true,
              'recoveryAgent', 'Research Manager',
              'recoveryTime', '${new Date().toISOString()}'
            )
          `)
        })
        .eq('id', analysisId);
      
      if (recoveryError) {
        console.error('Failed to recover analysis from ERROR state:', recoveryError);
      } else {
        console.log('✅ Analysis recovered from ERROR state to RUNNING');
      }
      // Allow Research Manager to continue and complete the phase
    } else {
      console.log(`⚠️ Analysis ${analysisId} is already in ERROR state - agent ${agent} completion ignored`);
      return createSuccessResponse({
        message: `Analysis already in error state - ${agent} completion ignored`,
        analysisId,
        status: 'error',
        agent,
        phase
      });
    }
  }
  
  if (error) {
    console.log(`⚠️ Agent ${agent} completed with error in phase ${phase}: ${error}`);
    console.log(`   Error type: ${errorType || 'unknown'}`);

    // Store the error in the database for tracking
    try {
      await supabase.rpc('update_agent_error', {
        p_analysis_id: analysisId,
        p_agent_name: agent,
        p_error_message: error,
        p_error_type: errorType || 'other'
      });
    } catch (err: any) {
      // If RPC doesn't exist, fall back to direct update
      console.log('Falling back to direct error update:', err.message);
      try {
        await supabase
          .from('analysis_history')
          .update({
            agent_insights: supabase.raw(`
              agent_insights || jsonb_build_object(
                '${agent}_error', jsonb_build_object(
                  'message', '${error.replace(/'/g, "''")}',
                  'type', '${errorType || 'other'}',
                  'timestamp', '${new Date().toISOString()}'
                )
              )
            `)
          })
          .eq('id', analysisId);
      } catch (fallbackErr: any) {
        console.error('Error updating agent error in database:', fallbackErr);
      }
    }
    
    const isInvocationFailure = completionType === 'invocation_failed';
    if (isInvocationFailure) {
      console.log(`📡 Invocation failure reported for ${agent} - coordinator will evaluate before marking error`);
    }

    // Mark the agent as completed with error in workflow
    if (!isInvocationFailure) {
      try {
        // Convert agent name from kebab-case to proper format
        // Remove 'agent-' prefix and convert to Title Case
        let agentNameForWorkflow: string;
        if (agent === 'analysis-portfolio-manager') {
          agentNameForWorkflow = 'Analysis Portfolio Manager';
        } else if (agent.startsWith('agent-')) {
          agentNameForWorkflow = agent
            .substring(6)
            .split('-')
            .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
            .join(' ');
        } else {
          agentNameForWorkflow = agent
            .split('-')
            .map((s: string) => s.charAt(0).toUpperCase() + s.slice(1))
            .join(' ');
        }
        
        let workflowUpdate = await supabase.rpc('update_workflow_step_status', {
          p_analysis_id: analysisId,
          p_phase_id: phase,
          p_agent_name: agentNameForWorkflow,
          p_status: 'error'
        });

        if (!workflowUpdate.error && workflowUpdate.data === false && agentNameForWorkflow === 'Analysis Portfolio Manager') {
          console.warn('⚠️ Analysis Portfolio Manager step not found; attempting legacy Portfolio Manager fallback');
          workflowUpdate = await supabase.rpc('update_workflow_step_status', {
            p_analysis_id: analysisId,
            p_phase_id: phase,
            p_agent_name: 'Portfolio Manager',
            p_status: 'error'
          });
        }

        if (workflowUpdate.error) {
          throw workflowUpdate.error;
        }
      } catch (err: any) {
        console.error('Error updating workflow step status for failed agent:', err);
      }
    } else {
      console.log(`ℹ️ Workflow status left unchanged for ${agent} due to invocation failure (step reset to pending by invoker)`);
    }

    if (isInvocationFailure) {
      try {
        await supabase
          .from('analysis_messages')
          .insert({
            analysis_id: analysisId,
            agent_name: agent,
            message: `Invocation failed for ${agent} in ${phase} phase: ${error}`,
            message_type: 'warning',
            metadata: {
              phase,
              agent,
              error,
              errorType: errorType || 'other',
              timestamp: new Date().toISOString()
            }
          });
      } catch (logError: any) {
        console.error('Failed to log invocation failure message:', logError);
      }

      return createSuccessResponse({
        message: `Invocation failure recorded for ${agent}`,
        invocationFailed: true,
        agent,
        phase
      });
    }

    // Categorize the error to determine its severity
    const errorCategory = categorizeAgentError(agent, errorType);
    console.log(`   Error category:`, errorCategory);
    
    // Special handling for research manager failure - it should continue to trading phase
    if (agent === 'agent-research-manager' && phase === 'research') {
      console.log(`📊 Research Manager failed - but we can continue with debate results`);
      
      // Check if we have at least one debate round to work with
      const { data: analysis } = await supabase
        .from('analysis_history')
        .select('full_analysis')
        .eq('id', analysisId)
        .single();
      
      const debateRounds = analysis?.full_analysis?.debateRounds || [];
      const completedRounds = debateRounds.filter((round: any) => 
        round.bull && round.bear
      );
      
      if (completedRounds.length === 0) {
        console.log(`❌ Research Manager failed AND no debate rounds available - marking analysis as ERROR`);
        
        // Use unified helper to mark analysis as error
        const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
          supabase,
          analysisId,
          ticker,
          userId,
          apiSettings,
          `Research phase failed - Research Manager error and no debate content`,
          { decision: 'PENDING', confidence: 0 }
        );
        
        if (!errorResult.success) {
          console.error(`❌ Failed to mark analysis as ERROR:`, errorResult.error);
        }
        
        return createErrorResponse(
          `Research phase failed - Research Manager failed with no debate content`,
          500
        );
      }
      
      console.log(`✅ Research Manager failed but we have ${completedRounds.length} debate round(s) - continuing to trading phase`);
      
      // Research Manager is not critical if we have debate content - we can continue
      // Continue to trading phase despite Research Manager failure
      return await handlePhaseCompletion(
        supabase, 
        'research', 
        agent, 
        analysisId, 
        ticker, 
        userId, 
        apiSettings, 
        analysisContext
      );
    }
    
    // Special handling for bull/bear researcher failures
    if (agent === 'agent-bull-researcher' || agent === 'agent-bear-researcher') {
      console.log(`🔍 ${agent} failed - checking if we have any debate rounds`);
      
      // Check if we have at least one completed debate round
      const { data: analysis } = await supabase
        .from('analysis_history')
        .select('full_analysis')
        .eq('id', analysisId)
        .single();
      
      const debateRounds = analysis?.full_analysis?.debateRounds || [];
      const completedRounds = debateRounds.filter((round: any) => 
        round.bull && round.bear
      );
      
      console.log(`📊 Debate status: ${completedRounds.length} complete rounds`);
      
      // We need at least ONE complete round (both bull AND bear) to proceed
      if (completedRounds.length === 0) {
        console.log(`❌ No complete debate rounds (need both bull AND bear) - cannot proceed without proper research debate`);
        
        // Use unified helper to mark analysis as error and notify rebalance if needed
        const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
          supabase,
          analysisId,
          ticker,
          userId,
          apiSettings,
          `Research phase failed - no debate rounds completed due to ${agent} failure`,
          { decision: 'PENDING', confidence: 0 }  // Use PENDING for failed analyses
        );
        
        if (!errorResult.success) {
          console.error(`❌ Failed to mark analysis as ERROR:`, errorResult.error);
        } else {
          console.log(`✅ Analysis marked as ERROR successfully`);
          if (errorResult.rebalanceNotified) {
            console.log(`📊 Rebalance-coordinator notified`);
          }
        }
        
        return createErrorResponse(
          `Research phase failed - ${agent} failed and no debate rounds were completed`,
          500
        );
      } else {
        console.log(`✅ Have ${completedRounds.length} complete debate round(s) - proceeding to research manager`);
        
        // IMPORTANT: Do NOT mark analysis as ERROR here - we have debate content and can proceed
        // The Research Manager will synthesize what we have
        
        // CRITICAL: Ensure analysis is not in ERROR state when we have valid debate content
        const { data: currentStatus } = await supabase
          .from('analysis_history')
          .select('analysis_status')
          .eq('id', analysisId)
          .single();
        
        if (currentStatus?.analysis_status === 'error') {
          console.log(`🔄 Reverting analysis from ERROR to RUNNING since we have ${completedRounds.length} debate rounds`);
          await supabase
            .from('analysis_history')
            .update({ 
              analysis_status: 'running',
              full_analysis: supabase.raw(`
                COALESCE(full_analysis, '{}'::jsonb) || 
                jsonb_build_object(
                  'partialDebateRecovery', true,
                  'completedDebateRounds', ${completedRounds.length},
                  'recoveryTime', '${new Date().toISOString()}'
                )
              `)
            })
            .eq('id', analysisId);
        }
        
        // CRITICAL: Set Research Manager status to 'running' before invoking
        // This ensures the phase health checker can find it
        await supabase.rpc('update_workflow_step_status', {
          p_analysis_id: analysisId,
          p_phase_id: 'research',
          p_agent_name: 'Research Manager',
          p_status: 'running'
        });
        
        // Skip to research manager since we have at least one debate round
        const { invokeAgentWithRetry } = await import('../../_shared/invokeWithRetry.ts');
        
        console.log(`🚀 Invoking research manager directly due to ${agent} failure`);
        console.log(`   Analysis will continue with ${completedRounds.length} debate round(s) instead of planned ${analysis?.full_analysis?.maxDebateRounds || 2}`);
        
        invokeAgentWithRetry(
          supabase,
          'agent-research-manager',
          analysisId,
          ticker,
          userId,
          apiSettings,
          2, // maxRetries
          'research',
          analysisContext // Pass context through
        );
        
        return createSuccessResponse({
          message: `${agent} failed but proceeding with ${completedRounds.length} debate rounds to research manager`,
          analysisId,
          phase: 'research',
          decision: 'skip_to_research_manager',
          continueWithPartialDebate: true
        });
      }
    }
    
    if (phase !== 'research') {
      const postErrorPhaseHealth = await checkPhaseHealth(supabase, analysisId, phase);
      console.log(`📊 Phase health after ${agent} error:`, postErrorPhaseHealth);

      const abortDecision = evaluatePostErrorPhaseHealth(phase, agent, postErrorPhaseHealth);

      if (abortDecision.abort) {
        console.log(`❌ Phase ${phase} cannot continue after ${agent} error: ${abortDecision.reason}`);

        const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
          supabase,
          analysisId,
          ticker,
          userId,
          apiSettings,
          `Phase ${phase} cannot recover after ${agent} error: ${abortDecision.reason || postErrorPhaseHealth.reason || 'phase health failure'}`
        );

        if (!errorResult.success) {
          console.error(`❌ Failed to mark analysis as ERROR:`, errorResult.error);
        } else {
          console.log(`✅ Analysis marked as ERROR and workflow stopped`);
          if (errorResult.rebalanceNotified) {
            console.log(`📊 Rebalance-coordinator notified about early phase termination`);
          }
        }

        return createErrorResponse(
          `Phase ${phase} cannot proceed after ${agent} error`,
          500,
          { phaseHealth: postErrorPhaseHealth, reason: abortDecision.reason }
        );
      }
    }

    // Check if we should continue after this error
    const isLastAgent = completionType === 'last_in_phase';
    const { shouldContinue, reason } = await shouldContinueAfterError(
      supabase,
      analysisId,
      phase,
      agent,
      errorType,
      isLastAgent
    );
    
    console.log(`📊 Error continuation decision: ${shouldContinue ? 'CONTINUE' : 'STOP'} - ${reason}`);
    
    // Handle workflow-stopping errors
    if (!shouldContinue && errorCategory.shouldStopWorkflow) {
      console.log(`❌ Critical failure in ${agent} - stopping workflow`);
      
      // Use unified helper to mark analysis as error and notify rebalance if needed
      const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
        supabase,
        analysisId,
        ticker,
        userId,
        apiSettings,
        `${agent} failed: ${error}`,
        { decision: 'PENDING', confidence: 0 }  // Use PENDING for failed analyses
      );
      
      if (!errorResult.success) {
        console.error(`❌ Failed to mark analysis as ERROR:`, errorResult.error);
      } else {
        console.log(`✅ Analysis marked as ERROR successfully`);
        if (errorResult.rebalanceNotified) {
          console.log(`📊 Rebalance-coordinator notified`);
        }
      }
      
      return createErrorResponse(`${agent} failed critically - ${reason}`);
    }
    
    // Phase-stopping errors when this is the last agent
    if (!shouldContinue && isLastAgent) {
      console.log(`⚠️ Phase ${phase} cannot proceed - ${reason}`);
      
      // Don't transition to next phase
      return createSuccessResponse({
        message: `Phase ${phase} stopped due to errors`,
        error: true,
        phaseCompleted: false,
        reason
      });
    }
    
    // Continue with workflow despite error
    console.log(`📊 Continuing workflow despite ${agent} error`);
    
    // When an agent has an error, we need to invoke the next agent in the phase
    // Import the helper functions
    const { getNextAgentInPhase } = await import('../utils/phase-manager.ts');
    const { invokeAgentWithRetry } = await import('../../_shared/invokeWithRetry.ts');
    
    const nextAgent = getNextAgentInPhase(phase, agent);
    
    if (nextAgent) {
      console.log(`🔄 Agent ${agent} had error - coordinator will invoke next agent: ${nextAgent}`);
      
      // Directly invoke the next agent (not using fallback handler which is for a different scenario)
      // Fire-and-forget invocation of next agent after error
      invokeAgentWithRetry(
        supabase,
        nextAgent,
        analysisId,
        ticker,
        userId,
        apiSettings,
        2, // maxRetries
        phase, // phase parameter
        analysisContext // Pass context through to next agent
      );
      
      console.log(`✅ Successfully started ${nextAgent} after ${agent} error`);
      return createSuccessResponse({
        message: `Continued to ${nextAgent} after ${agent} error`,
        continuedAfterError: true,
        nextAgent
      });
    } else {
      // This was the last agent in the phase
      console.log(`📋 Agent ${agent} was last in phase ${phase} and had an error`);
      // Set completion type to handle phase transition check
      completionType = 'last_in_phase';
      // Continue to the completion type routing below
    }
  } else {
    console.log(`✅ Agent ${agent} completed successfully in phase ${phase}`);
  }
  
  // Only handle specific agent completions if they completed successfully (no error)
  if (!error) {
    // Handle specific agent completions that need special logic
    if (agent === 'risk-manager') {
      return await handleRiskManagerCompletion(supabase, analysisId, analysisContext, ticker, userId, apiSettings);
    }
    
    if (agent === 'bear-researcher') {
      return await handleBearResearcherCompletion(
        supabase,
        analysisId,
        ticker,
        userId,
        apiSettings,
        analysisContext
      );
    }
    
    // Handle portfolio manager completion (final step in individual analysis)
    if (agent === 'analysis-portfolio-manager') {
      console.log(`✅ Analysis Portfolio Manager completed - finalizing analysis`);
      console.log(`   Context type: ${analysisContext?.type}`);
      
      // Portfolio manager should NEVER complete for rebalance analyses
      // If we somehow get here for a rebalance, it's an error
      if (analysisContext?.type === 'rebalance') {
        console.error(`❌ ERROR: Analysis Portfolio Manager should not be invoked for rebalance analyses!`);
        console.error(`   Rebalance analyses should skip portfolio manager and notify rebalance-coordinator directly`);
        
        // Still notify rebalance-coordinator to prevent the workflow from getting stuck
        const completedAt = new Date().toISOString();
        const forcedCompletion = await markAnalysisCompleted(supabase, analysisId, {
          fullAnalysisPatch: {
            status: 'completed',
            completedAt
          },
          force: true,
          skipWorkflowCheck: true
        });

        if (!forcedCompletion.success) {
          if (forcedCompletion.cancelled) {
            console.log('⚠️ Analysis was cancelled before forced completion update');
          } else {
            console.error('❌ Failed to force completion before rebalance callback:', forcedCompletion.error);
          }
        } else if (forcedCompletion.alreadyCompleted) {
          console.log('ℹ️ Analysis already marked as completed prior to rebalance callback');
        } else {
          console.log('✅ Forced analysis completion before notifying rebalance-coordinator');
        }

        try {
          const result = await invokeWithRetry(
            supabase,
            'rebalance-coordinator',
            {
              action: 'analysis-completed',
              rebalanceRequestId: analysisContext.rebalanceRequestId,
              analysisId,
              ticker,
              userId,
              apiSettings,
              success: true
            }
          );
          
          if (!result.success) {
            console.error('❌ Failed to notify rebalance-coordinator:', result.error);
            return createErrorResponse(`Failed to notify rebalance-coordinator: ${result.error}`);
          }
          
          console.log('✅ Notified rebalance-coordinator despite portfolio manager invocation error');
          
          return createSuccessResponse({
            message: 'Analysis Portfolio Manager incorrectly invoked for rebalance - rebalance-coordinator notified',
            rebalanceRequestId: analysisContext.rebalanceRequestId,
            analysisId,
            error: 'Portfolio manager should not be invoked for rebalance analyses'
          });
        } catch (error: any) {
          console.error('❌ Error notifying rebalance-coordinator:', error);
          return createErrorResponse(`Error notifying rebalance-coordinator: ${error.message}`);
        }
      }
      
      // For individual analysis, check and execute auto-trades
      const autoTradeResult = await checkAndExecuteAutoTrades(
        supabase,
        userId,
        'individual_analysis',
        analysisId
      );
      
      if (autoTradeResult.autoTradeEnabled) {
        console.log(`🤖 Auto-trade executed: ${autoTradeResult.ordersExecuted} orders`);
        if (autoTradeResult.errors.length > 0) {
          console.error(`⚠️ Auto-trade errors:`, autoTradeResult.errors);
        }
      }
      
      // Mark analysis as complete NOW (portfolio manager no longer does this)
      const completedAt = new Date().toISOString();
      const completionResult = await markAnalysisCompleted(supabase, analysisId, {
        fullAnalysisPatch: {
          status: 'completed',
          completedAt,
          autoTradeEnabled: autoTradeResult.autoTradeEnabled,
          ordersExecuted: autoTradeResult.ordersExecuted,
          autoTradeErrors: autoTradeResult.errors || []
        },
        force: true,
        skipWorkflowCheck: true
      });

      if (!completionResult.success) {
        if (completionResult.cancelled) {
          console.log('⚠️ Analysis was cancelled before completion update');
        } else {
          console.error('Failed to mark analysis as complete:', completionResult.error);
        }
      } else if (completionResult.alreadyCompleted) {
        console.log('ℹ️ Analysis already marked as completed');
      } else {
        console.log('🎆 Analysis marked as completed');
      }
      
      return createSuccessResponse({
        message: 'Analysis Portfolio Manager completed successfully - analysis complete',
        analysisId,
        ticker,
        completed: true,
        autoTradeEnabled: autoTradeResult.autoTradeEnabled,
        ordersExecuted: autoTradeResult.ordersExecuted,
        autoTradeErrors: autoTradeResult.errors
      });
    }
  }
  
  // Route based on completion type - this is the critical fix
  console.log(`🔀 Routing agent completion: type=${completionType || 'default'}, agent=${agent}, phase=${phase}`);
  
  if (completionType === 'invocation_failed') {
    console.log(`ℹ️ Invocation failure completion routed without additional error context`);
    return createSuccessResponse({
      message: `Invocation failure noted for ${agent}`,
      invocationFailed: true,
      agent,
      phase
    });
  }

  if (completionType === 'agent_error') {
    // Agent had an error and notified coordinator via setAgentToError
    // The error handling logic above should have already processed this
    console.log(`⚠️ Agent error completion type - error already handled, not advancing phase`);
    
    // If we get here, the error handling above should have either:
    // 1. Stopped the workflow (critical error)
    // 2. Invoked the next agent (non-critical error)
    // 3. Set completionType to 'last_in_phase' if it was the last agent
    
    // This is a safety check - we should not advance phases on agent_error
    return createSuccessResponse({
      message: `Agent ${agent} error handled`,
      error: true,
      completionType: 'agent_error'
    });
    
  } else if (completionType === 'fallback_invocation_failed') {
    // Agent failed to invoke next agent - coordinator takes over as fallback
    console.log(`🔄 FALLBACK DETECTED: ${agent} failed to invoke next agent, coordinator handling fallback`);
    
    if (!failedToInvoke) {
      console.error(`❌ Fallback scenario but no failedToInvoke specified`);
      return createErrorResponse('Fallback scenario detected but no failed agent specified');
    }
    
    return await handleFailedInvocationFallback(
      supabase, phase, agent, failedToInvoke, analysisId, ticker, userId, apiSettings, analysisContext
    );
    
  } else if (completionType === 'last_in_phase') {
    // Agent is explicitly the last in phase - check phase health before transitioning
    console.log(`🔍 Last agent in phase: ${agent} completed - checking phase health`);
    
    // Check if the phase is healthy enough to proceed
    const phaseHealth = await checkPhaseHealth(supabase, analysisId, phase);
    console.log(`📊 Phase health check:`, phaseHealth);
    
    if (!phaseHealth.canProceed) {
      console.log(`❌ Phase ${phase} cannot proceed: ${phaseHealth.reason}`);
      
      // For research phase, only mark as ERROR if we have ZERO debate content
      // Insufficient debate rounds should NOT be marked as ERROR
      let shouldMarkAsError = false;
      
      if (phase === 'research') {
        // Check if we have ANY debate content
        const { data: analysis } = await supabase
          .from('analysis_history')
          .select('full_analysis')
          .eq('id', analysisId)
          .single();
        
        const debateRounds = analysis?.full_analysis?.debateRounds || [];
        const hasAnyDebateContent = debateRounds.some((round: any) => round.bull || round.bear);
        
        if (!hasAnyDebateContent) {
          console.log(`❌ Research phase has ZERO debate content - marking as ERROR`);
          shouldMarkAsError = true;
        } else {
          console.log(`⚠️ Research phase has some debate content but insufficient - NOT marking as ERROR`);
          // Don't mark as ERROR, just let it continue with what we have
        }
      } else if (phase === 'trading' || 
                 (phaseHealth.criticalFailures.length > 0 && 
                  !phaseHealth.criticalFailures.includes('agent-research-manager'))) {
        // Other phases: mark as error for critical failures (but not Research Manager) or trading phase failures
        shouldMarkAsError = true;
      }
      
      if (shouldMarkAsError) {
        // Use unified helper to mark analysis as error and notify rebalance if needed
        const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
          supabase,
          analysisId,
          ticker,
          userId,
          apiSettings,
          `Phase ${phase} failed: ${phaseHealth.reason}`
        );
        
        if (!errorResult.success) {
          console.error(`❌ Failed to mark analysis as ERROR:`, errorResult.error);
        } else {
          console.log(`✅ Analysis marked as ERROR successfully`);
          if (errorResult.rebalanceNotified) {
            console.log(`📊 Rebalance-coordinator notified about phase health failure`);
          }
        }
      }
      
      return createSuccessResponse({
        message: `Phase ${phase} cannot proceed due to failures`,
        error: true,
        phaseCompleted: false,
        phaseHealth,
        reason: phaseHealth.reason
      });
    }
    
    console.log(`✅ Phase ${phase} is healthy - proceeding with transition`);
    return await handlePhaseCompletion(supabase, phase, agent, analysisId, ticker, userId, apiSettings, analysisContext);
    
  } else {
    // Default behavior - this should NOT trigger phase completion
    // Only log the unexpected case and return success without advancing
    console.warn(`⚠️ Unexpected completion type for ${agent} in ${phase} phase: ${completionType || 'undefined'}`);
    console.warn(`   This agent completion will be acknowledged but won't trigger phase transitions`);
    
    // Just acknowledge the agent completion without advancing phases
    // This prevents infinite loops from agents that don't specify proper completion types
    return createSuccessResponse({
      message: `Agent ${agent} completed without explicit completion type`,
      warning: 'No phase transition triggered - completionType not specified',
      agent,
      phase,
      completionType: completionType || 'undefined'
    });
  }
}
