import { AnalysisContext, ApiSettings } from '../types/index.ts';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { invokeWithRetry, invokeAgentWithRetry } from '../../_shared/invokeWithRetry.ts';
import { updateAnalysisPhase, setAgentToError, updateWorkflowStepStatus, markAnalysisCompleted } from '../../_shared/atomicUpdate.ts';

/**
 * Handle portfolio routing decisions centralized in analysis-coordinator
 * This function decides whether to route to analysis-portfolio-manager or rebalance-coordinator
 */
export async function handlePortfolioRouting(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext: AnalysisContext
): Promise<Response> {
  
  console.log(`🎯 Portfolio routing decision: ${analysisContext.type} analysis for ${ticker}`);
  
  // For rebalance analyses, skip individual portfolio routing only when we have a valid rebalance request id
  const isRebalanceContext = analysisContext.type === 'rebalance' && !!analysisContext.rebalanceRequestId;

  if (analysisContext.type === 'rebalance' && !analysisContext.rebalanceRequestId) {
    console.warn('⚠️ Rebalance context flagged without rebalanceRequestId - falling back to analysis-portfolio-manager routing');
  }

  if (isRebalanceContext) {
    console.log('📊 Rebalance analysis - notifying rebalance-coordinator (skipping analysis-portfolio-manager)');
    // Notify rebalance-coordinator that this individual analysis is complete
    return await routeToRebalanceCoordinator(
      supabase,
      analysisId,
      ticker,
      userId,
      apiSettings,
      analysisContext
    );
  }
  
  // Individual analysis - route to analysis-portfolio-manager
  return await routeToPortfolioManager(
    supabase,
    analysisId,
    ticker,
    userId,
    apiSettings,
    analysisContext
  );
}

/**
 * Route rebalance analysis to rebalance-coordinator
 */
async function routeToRebalanceCoordinator(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext: AnalysisContext
): Promise<Response> {
  
  console.log('🔄 Rebalance analysis - routing to rebalance-coordinator');
  
  // CRITICAL: Mark the analysis as COMPLETED before notifying rebalance-coordinator
  // Use the atomic helper with force + skipWorkflowCheck so rebalance hand-off is guaranteed
  const completedAt = new Date().toISOString();
  const completionResult = await markAnalysisCompleted(supabase, analysisId, {
    fullAnalysisPatch: {
      status: 'completed',
      completedAt
    },
    force: true,
    skipWorkflowCheck: true
  });

  if (!completionResult.success) {
    if (completionResult.cancelled) {
      console.log('⚠️ Analysis was cancelled before completion update');
    } else {
      console.error('❌ Failed to mark analysis as completed:', completionResult.error);
    }
  } else if (completionResult.alreadyCompleted) {
    console.log('ℹ️ Analysis already marked as completed');
  } else {
    console.log(`✅ Marked analysis ${analysisId} as COMPLETED`);
  }
  
  // Update the workflow phase to indicate risk phase is complete
  const updateResult = await updateAnalysisPhase(
    supabase,
    analysisId,
    'Risk Complete',
    {
      agent: 'Analysis Coordinator',
      message: 'Risk phase completed - notifying rebalance coordinator',
      timestamp: new Date().toISOString(),
      type: 'phase_completion'
    }
  );
  
  if (!updateResult.success) {
    const errorText = updateResult.error || 'unknown error';
    console.error('❌ Failed to update analysis phase:', errorText);

    const benignFailure =
      errorText.includes('Concurrent modification') ||
      errorText.includes('Analysis not found') ||
      errorText.includes('cancelled');

    if (!benignFailure) {
      return createErrorResponse(
        'Failed to update analysis phase',
        500,
        errorText
      );
    }

    console.warn('⚠️ Proceeding despite phase update failure (considered non-fatal).');
  }
  
  console.log(`📊 Analysis ${analysisId} marked as COMPLETED - notifying rebalance coordinator`);
  
  // Route to rebalance-coordinator using invokeWithRetry
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
      
      // Rollback analysis status on failure
      const rollbackResult = await setAgentToError(
        supabase,
        analysisId,
        'portfolio',
        'Analysis Coordinator',
        `Failed to notify rebalance-coordinator: ${result.error}`,
        'other'
      );

      if (!rollbackResult.success) {
        console.error('❌ Failed to rollback analysis status:', rollbackResult.error);
      }

      return createErrorResponse(`Failed to notify rebalance-coordinator: ${result.error}`);
    }
    
    console.log('✅ Successfully notified rebalance-coordinator of analysis completion');
    
    return createSuccessResponse({
      message: 'Portfolio routing completed - rebalance-coordinator notified',
      rebalanceRequestId: analysisContext.rebalanceRequestId,
      analysisId
    });
    
  } catch (error: any) {
    console.error('❌ Error calling rebalance-coordinator:', error);
    
    // Rollback analysis status on exception
    const rollbackResult = await setAgentToError(
      supabase,
      analysisId,
      'portfolio',
      'Analysis Coordinator',
      `Error calling rebalance-coordinator: ${error.message}`,
      'other'
    );

    if (!rollbackResult.success) {
      console.error('❌ Failed to rollback analysis status:', rollbackResult.error);
    }

    return createErrorResponse(`Error calling rebalance-coordinator: ${error.message}`);
  }
}

/**
 * Route individual analysis to analysis-portfolio-manager
 */
async function routeToPortfolioManager(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext: AnalysisContext  // Kept for future use but not currently needed
): Promise<Response> {
  
  console.log('📈 Individual analysis - routing to analysis-portfolio-manager');
  
  // Check if portfolio-manager has already been invoked for this analysis
  const { data: fullAnalysis } = await supabase
    .from('analysis_history')
    .select('full_analysis')
    .eq('id', analysisId)
    .single();
  
  const portfolioManagerStep = fullAnalysis?.full_analysis?.workflowSteps?.find((step: any) => 
    step.id === 'portfolio' || step.id === 'portfolio-manager'
  );
  
  if (portfolioManagerStep) {
    const agents = Array.isArray(portfolioManagerStep.agents) ? portfolioManagerStep.agents : [];
    const portfolioAgent = agents.find((agent: any) =>
      agent?.name === 'Analysis Portfolio Manager' || agent?.name === 'Portfolio Manager'
    );

    if (portfolioAgent && portfolioAgent.status && portfolioAgent.status !== 'pending') {
      console.log('⚠️ Analysis Portfolio Manager already invoked for this analysis, skipping duplicate invocation');
      console.log(`  Current status: ${portfolioAgent.status}`);
      return createSuccessResponse({
        message: 'Portfolio routing completed - Analysis Portfolio Manager already invoked'
      });
    }
  }

  console.log('✅ Analysis Portfolio Manager not yet invoked, proceeding with invocation');
  
  // Ensure portfolio phase exists in workflow steps
  if (!portfolioManagerStep) {
    console.log('📝 Creating portfolio phase in workflow steps');
    
    // Get current workflow steps and add portfolio phase if missing
    const currentSteps = fullAnalysis?.full_analysis?.workflowSteps || [];
    const portfolioPhase = {
      id: 'portfolio',
      name: 'Portfolio Management',
      status: 'pending',
      agents: [
        {
          name: 'Analysis Portfolio Manager',
          status: 'pending',
          functionName: 'analysis-portfolio-manager'
        }
      ]
    };
    
    // Add portfolio phase to workflow steps
    const updatedSteps = [...currentSteps, portfolioPhase];
    
    // Update the database with the new workflow steps
    const { error: updateError } = await supabase
      .from('analysis_history')
      .update({
        full_analysis: {
          ...fullAnalysis?.full_analysis,
          workflowSteps: updatedSteps
        }
      })
      .eq('id', analysisId);
    
    if (updateError) {
      console.error('❌ Failed to create portfolio phase in workflow steps:', updateError);
    } else {
      console.log('✅ Portfolio phase created in workflow steps');
    }
  }
  
  // Mark portfolio-manager as running before invoking to prevent duplicates
  const updateResult = await updateWorkflowStepStatus(
    supabase,
    analysisId,
    'portfolio',
    'Analysis Portfolio Manager',
    'running'
  );

  if (!updateResult.success) {
    console.warn('⚠️ Failed to update Analysis Portfolio Manager status to running, but continuing with invocation');
  }
  
  // Route to analysis-portfolio-manager using invokeAgentWithRetry for proper settings handling
  // Fire-and-forget invocation of portfolio manager
  invokeAgentWithRetry(
      supabase,
      'analysis-portfolio-manager',
      analysisId,
      ticker,
      userId,
      apiSettings,
      2, // maxRetries
      'portfolio' // phase
      // analysisContext removed - not needed for agents
  );
  
  console.log('✅ analysis-portfolio-manager started for individual analysis');
  
  return createSuccessResponse({
    message: 'Portfolio routing completed - Analysis Portfolio Manager started'
  });
}
