import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { moveToNextPhase, handleFailedInvocationFallback } from '../utils/phase-manager.ts';
import { WORKFLOW_PHASES } from '../config/workflow.ts';
import { invokeAgentWithRetry } from '../../_shared/invokeWithRetry.ts';
import { checkPhaseHealth } from '../utils/phase-health-checker.ts';
import { markAnalysisAsErrorWithRebalanceCheck } from '../utils/analysis-error-handler.ts';

/**
 * Handle phase completion - when all agents in phase are complete
 * Note: This should only be called for legitimate phase completion, 
 * NOT for fallback scenarios (those are handled separately)
 */
export async function handlePhaseCompletion(
  supabase: any,
  phase: string,
  agent: string,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<Response> {
  
  console.log(`🎯 Phase completion handler called for ${phase} by ${agent}`);
  
  // Special handling for Research Manager - it's the authoritative end of research phase
  if (agent === 'agent-research-manager' && phase === 'research') {
    console.log(`✅ Research Manager completed - checking debate content before phase transition`);
    
    // Verify we have debate content (the actual requirement for research phase)
    const { data: analysis } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();
    
    const debateRounds = analysis?.full_analysis?.debateRounds || [];
    const hasDebateContent = debateRounds.some((round: any) => round.bull || round.bear);
    
    if (!hasDebateContent) {
      console.error(`❌ Research Manager completed but no debate content found - cannot proceed`);
      
      // This is a critical error - mark analysis as error
      const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
        supabase,
        analysisId,
        ticker,
        userId,
        apiSettings,
        `Research phase failed - no debate content despite Research Manager completion`
      );
      
      return createErrorResponse(
        `Research phase cannot proceed without debate content`,
        500
      );
    }
    
    console.log(`✅ Research phase has ${debateRounds.length} debate rounds - authorized to proceed`);
    // The phase health check will now properly handle Research Manager completion
  }
  
  // Double-check phase health before proceeding
  const phaseHealth = await checkPhaseHealth(supabase, analysisId, phase);
  console.log(`📊 Final phase health check:`, phaseHealth);
  
  if (!phaseHealth.canProceed) {
    console.error(`❌ Phase ${phase} health check failed: ${phaseHealth.reason}`);
    
    // Mark analysis as error if we can't proceed
    if (phaseHealth.criticalFailures.length > 0) {
      // Use unified helper to mark analysis as error and notify rebalance if needed
      const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
        supabase,
        analysisId,
        ticker,
        userId,
        apiSettings,
        `Phase ${phase} cannot proceed: ${phaseHealth.reason}`
      );
      
      if (!errorResult.success) {
        console.error(`❌ Failed to mark analysis as ERROR:`, errorResult.error);
      } else {
        console.log(`✅ Analysis marked as ERROR successfully`);
        if (errorResult.rebalanceNotified) {
          console.log(`📊 Phase ${phase} critical failure - rebalance-coordinator notified`);
        }
      }
        
      return createErrorResponse(
        `Phase ${phase} cannot proceed: ${phaseHealth.reason}`,
        500,
        { phaseHealth }
      );
    }
    
    return createSuccessResponse({
      message: `Phase ${phase} completed with warnings`,
      warning: phaseHealth.reason,
      phaseHealth
    });
  }
  
  console.log(`✅ Phase ${phase} health verified - proceeding with transition`);
  
  const phaseConfig = WORKFLOW_PHASES[phase];
  if (!phaseConfig) {
    console.warn(`⚠️ Unknown phase: ${phase}`);
    return createSuccessResponse({
      message: `Agent ${agent} completed in unknown phase ${phase}`
    });
  }
  
  // This function should only be called when the phase is legitimately complete
  // Check if there's a final agent for this phase that needs to be started
  if (phaseConfig.finalAgent) {
    // Start the final agent for this phase with enhanced retry logic
    console.log(`🎯 Starting final agent: ${phaseConfig.finalAgent}`);
    
    invokeAgentWithRetry(
      supabase,
      phaseConfig.finalAgent,
      analysisId,
      ticker,
      userId,
      apiSettings,
      2, // maxRetries
      phase, // phase parameter
      analysisContext // Pass context through to final agent
    );
    
    return createSuccessResponse({
      message: `Phase ${phase} completed - started final agent ${phaseConfig.finalAgent}`
    });
    
  } else if (phaseConfig.nextPhase) {
    // Move to the next phase
    console.log(`➡️ Moving to next phase: ${phaseConfig.nextPhase}`);
    await moveToNextPhase(supabase, analysisId, ticker, userId, phase, apiSettings, analysisContext);
    
    return createSuccessResponse({
      message: `Phase ${phase} completed - moved to phase ${phaseConfig.nextPhase}`
    });
    
  } else {
    console.log('🎆 All phases complete!');
    
    return createSuccessResponse({
      message: `All phases completed - analysis finished`
    });
  }
}