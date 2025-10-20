import { AnalysisContext, ApiSettings } from '../types/index.ts';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { invokeWithRetry } from '../../_shared/invokeWithRetry.ts';
import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';

/**
 * Handle risk manager completion - simplified to always callback to analysis-coordinator
 * 
 * This function no longer makes routing decisions. Instead, it always calls back to
 * analysis-coordinator with the risk decision context, allowing the coordinator to
 * handle portfolio manager routing decisions centrally.
 */
export async function handleRiskManagerCompletion(
  supabase: any,
  analysisId: string,
  analysisContext?: AnalysisContext,
  ticker?: string,
  userId?: string,
  apiSettings?: ApiSettings
): Promise<Response> {
  
  console.log('🎆 Risk Manager completed - callback to analysis-coordinator for routing');
  
  // Get the analysis to extract risk decision context
  const { data: analysis } = await supabase
    .from('analysis_history')
    .select('agent_insights, decision, confidence, rebalance_request_id, analysis_status, ticker, user_id')
    .eq('id', analysisId)
    .single();
  
  if (!analysis) {
    return createErrorResponse('Analysis not found');
  }
  
  // Use values from analysis if not provided in parameters
  ticker = ticker || analysis.ticker;
  userId = userId || analysis.user_id;
  
  // Check if analysis is already marked as complete to prevent duplicate processing
  if (analysis.analysis_status === ANALYSIS_STATUS.COMPLETED) {
    console.log('⚠️ Analysis already marked as complete - skipping duplicate processing');
    return createSuccessResponse({
      message: 'Risk Manager completed but analysis was already marked complete',
      duplicate: true
    });
  }
  
  // Extract risk manager decision context for portfolio routing
  const riskManagerDecision = {
    decision: analysis.decision,
    confidence: analysis.confidence,
    assessment: analysis.agent_insights?.riskManager?.finalAssessment
  };
  
  // Determine analysis context type for portfolio routing
  // Always fetch from database, don't rely on passed context
  const contextType = analysis.rebalance_request_id ? 'rebalance' : 'individual';
  const rebalanceRequestId = analysis.rebalance_request_id;
  
  console.log(`📊 Risk Manager decision context: ${contextType} analysis with decision=${analysis.decision}, confidence=${analysis.confidence}%`);
  
  // Always callback to analysis-coordinator for portfolio routing decisions
  try {
    const callbackResult = await invokeWithRetry(
      supabase,
      'analysis-coordinator',
      {
        analysisId,
        ticker,
        userId,
        phase: 'portfolio',
        apiSettings,
        analysisContext: {
          type: contextType,
          rebalanceRequestId,
          source: 'risk-completion'
        },
        riskManagerDecision
      }
    );
    
    if (!callbackResult.success) {
      console.error('❌ Failed to callback to analysis-coordinator:', callbackResult.error);
      return createErrorResponse(`Failed to callback to analysis-coordinator: ${callbackResult.error}`);
    }
    
    console.log('✅ Successfully handed off portfolio routing to analysis-coordinator');
    
    return createSuccessResponse({
      message: `Risk Manager completed - analysis-coordinator handling ${contextType} portfolio routing`,
      analysisId,
      contextType,
      rebalanceRequestId
    });
    
  } catch (error: any) {
    console.error('❌ Error calling analysis-coordinator:', error);
    return createErrorResponse(`Error calling analysis-coordinator: ${error.message}`);
  }
}
