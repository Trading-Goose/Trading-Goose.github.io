import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { runResearchDebateRound } from '../utils/phase-manager.ts';
import { invokeAgentWithRetry } from '../../_shared/invokeWithRetry.ts';
import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';
import { WORKFLOW_PHASES } from '../config/workflow.ts';
import { buildAnalysisContext, persistAnalysisContext } from '../utils/context-builder.ts';

/**
 * Initialize workflow phases by launching their first agents
 * Supports retry mode to restart from a specific agent
 */
export async function initializePhase(
  supabase: any,
  phase: string,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<Response> {
  
  // Normal phase initialization
  // Note: Retry logic has been moved to retry-handler which directly invokes failed agents
  if (phase === 'analysis') {
    return await initializeAnalysisPhase(supabase, analysisId, ticker, userId, apiSettings, analysisContext);
  } else if (phase === 'research') {
    return await initializeResearchPhase(supabase, analysisId, ticker, userId, apiSettings, analysisContext);
  } else if (phase === 'trading') {
    return await initializeTradingPhase(supabase, analysisId, ticker, userId, apiSettings, analysisContext);
  } else if (phase === 'risk') {
    return await initializeRiskPhase(supabase, analysisId, ticker, userId, apiSettings, analysisContext);
  }
  
  return createSuccessResponse({
    message: `Phase ${phase} initiated`
  });
}

async function initializeAnalysisPhase(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<Response> {
  
  // Transition analysis status to RUNNING when first agent starts
  // This handles both new analyses (PENDING) and retried analyses (ERROR)
  // But NEVER override CANCELLED status
  console.log('🚀 Transitioning analysis status from PENDING to RUNNING');
  
  // First check if analysis has been cancelled
  const { data: currentAnalysis, error: checkError } = await supabase
    .from('analysis_history')
    .select('analysis_status')
    .eq('id', analysisId)
    .single();
  
  if (checkError || !currentAnalysis) {
    console.error('❌ Failed to check current analysis status:', checkError);
  } else if (currentAnalysis.analysis_status === ANALYSIS_STATUS.CANCELLED) {
    console.log('⏩ Analysis has been cancelled, skipping status transition');
    return createErrorResponse('Cannot start cancelled analysis');
  } else {
    // Only update if not cancelled
    await supabase
      .from('analysis_history')
      .update({ analysis_status: ANALYSIS_STATUS.RUNNING })
      .eq('id', analysisId)
      .in('analysis_status', [ANALYSIS_STATUS.PENDING, ANALYSIS_STATUS.ERROR])
      .neq('analysis_status', ANALYSIS_STATUS.CANCELLED);  // Double-check
  }
  
  let existingFullAnalysis: any = null;
  let mergedContext: AnalysisContext | undefined = analysisContext;

  try {
    const { data: existing } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();

    if (existing?.full_analysis) {
      existingFullAnalysis = existing.full_analysis;
      if (existing.full_analysis.analysisContext) {
        mergedContext = {
          ...existing.full_analysis.analysisContext,
          ...(mergedContext || {})
        } as AnalysisContext;
      }
    }
  } catch (loadError) {
    console.error('Failed to load existing analysis context:', loadError);
  }

  const enhancedContext = await buildAnalysisContext(
    supabase,
    userId,
    ticker,
    apiSettings,
    mergedContext
  );

  try {
    await persistAnalysisContext(
      supabase,
      analysisId,
      existingFullAnalysis,
      enhancedContext
    );
  } catch (persistError) {
    console.error('Failed to persist analysis context:', persistError);
  }
  
  // Randomly select an analysis agent from workflow configuration
  const analysisAgents = WORKFLOW_PHASES.analysis.agents;
  const randomIndex = Math.floor(Math.random() * analysisAgents.length);
  const selectedAgent = analysisAgents[randomIndex];
  
  console.log(`🎲 Randomly selected analysis agent: ${selectedAgent} from ${analysisAgents.length} options`);
  console.log(`🚀 Starting analysis phase with ${selectedAgent}...`);
  
  invokeAgentWithRetry(
    supabase,
    selectedAgent,
    analysisId,
    ticker,
    userId,
    apiSettings,
    2, // maxRetries
    'analysis',
    enhancedContext // Pass enhanced context with position data
  );
  
  return createSuccessResponse({
    message: 'Analysis phase initiated'
  });
}

async function initializeResearchPhase(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<Response> {
  
  // Initialize debate count to 1 when starting research phase
  console.log('🚀 Starting research phase with debate round 1...');
  if (analysisContext?.type === 'rebalance') {
    console.log('📊 This is a rebalance context analysis - preserving context through research phase');
  }
  
  // Get current analysis state
  const { data: currentAnalysis } = await supabase
    .from('analysis_history')
    .select('full_analysis')
    .eq('id', analysisId)
    .single();
  
  const fullAnalysis = currentAnalysis?.full_analysis || {};
  
  // Update the analysis to set currentDebateCount to 1
  await supabase
    .from('analysis_history')
    .update({
      full_analysis: {
        ...fullAnalysis,
        currentDebateCount: 1
      }
    })
    .eq('id', analysisId);
  
  // Start first debate round with context
  runResearchDebateRound(supabase, analysisId, ticker, userId, apiSettings, 1, analysisContext)
    .then(() => console.log('✅ Research debate initiated with round 1'))
    .catch((error) => console.error('❌ Failed to start research:', error));
  
  return createSuccessResponse({
    message: 'Research phase initiated'
  });
}

async function initializeTradingPhase(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<Response> {
  
  // Start trader agent
  console.log('🚀 Starting trader agent...');
  invokeAgentWithRetry(
    supabase,
    'agent-trader',
    analysisId,
    ticker,
    userId,
    apiSettings,
    2, // maxRetries
    'trading',
    analysisContext // Pass context through to trader
  );
  
  return createSuccessResponse({
    message: 'Trading phase initiated'
  });
}

async function initializeRiskPhase(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<Response> {
  
  // Randomly select a risk analyst from workflow configuration
  const riskAgents = WORKFLOW_PHASES.risk.agents;
  const randomIndex = Math.floor(Math.random() * riskAgents.length);
  const selectedAgent = riskAgents[randomIndex];
  
  console.log(`🎲 Randomly selected risk agent: ${selectedAgent} from ${riskAgents.length} options`);
  console.log(`🚀 Starting risk phase with ${selectedAgent}...`);
  
  invokeAgentWithRetry(
    supabase,
    selectedAgent,
    analysisId,
    ticker,
    userId,
    apiSettings,
    2, // maxRetries
    'risk',
    analysisContext // Pass context through to risk analysts
  );
  
  return createSuccessResponse({
    message: 'Risk phase initiated'
  });
}
