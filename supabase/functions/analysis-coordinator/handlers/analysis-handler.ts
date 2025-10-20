import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { createErrorResponse, createSuccessResponse } from '../utils/response-helpers.ts';
import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';
import { markAnalysisAsErrorWithRebalanceCheck } from '../utils/analysis-error-handler.ts';
import { invokeWithRetry } from '../../_shared/invokeWithRetry.ts';

/**
 * Start a single stock analysis with optional context (supports rebalance linkage)
 */
export async function startSingleAnalysis(
  supabase: any,
  userId: string,
  ticker: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<Response> {
  console.log(`🚀 Creating analysis record for ${ticker}${analysisContext?.rebalanceRequestId ? ` (rebalance: ${analysisContext.rebalanceRequestId})` : ''}`);
  
  // Validate ticker format (allow slashes for crypto pairs like ETH/USD)
  if (!/^[A-Z0-9.\-\/]+$/.test(ticker)) {
    return createErrorResponse(
      'Invalid ticker symbol format'
    );
  }
  
  const { data: runningAnalyses } = await supabase
    .from('analysis_history')
    .select('id, full_analysis, created_at, metadata, analysis_context, rebalance_request_id')
    .eq('user_id', userId)
    .eq('ticker', ticker)
    .in('analysis_status', [ANALYSIS_STATUS.PENDING, ANALYSIS_STATUS.RUNNING])
    .order('created_at', { ascending: false });

  const metadataFromContext: Record<string, any> = {};
  if (analysisContext?.metadata && typeof analysisContext.metadata === 'object') {
    Object.assign(metadataFromContext, analysisContext.metadata);
  }
  if (typeof analysisContext?.near_limit_analysis === 'boolean') {
    metadataFromContext.near_limit_analysis = analysisContext.near_limit_analysis;
  }
  if (analysisContext?.triggered_by) {
    metadataFromContext.triggered_by = analysisContext.triggered_by;
  }
  const derivedTriggeredAt = analysisContext?.triggered_at
    || (typeof metadataFromContext.triggered_at === 'string' ? metadataFromContext.triggered_at : undefined);
  if (!derivedTriggeredAt && analysisContext?.near_limit_analysis) {
    metadataFromContext.triggered_at = new Date().toISOString();
  } else if (derivedTriggeredAt) {
    metadataFromContext.triggered_at = derivedTriggeredAt;
  }

  let analysis;
  if (runningAnalyses && runningAnalyses.length > 0) {
    analysis = runningAnalyses[0];
    console.log(`⚠️ Found existing pending/running analysis for ${ticker}, reusing ID: ${analysis.id}`);

    // If this is a rebalance context and the existing analysis doesn't have rebalance_request_id, update it
    if (analysisContext?.rebalanceRequestId && !analysis.rebalance_request_id) {
      console.log(`🔗 Linking existing analysis ${analysis.id} to rebalance ${analysisContext.rebalanceRequestId}`);
      await supabase
        .from('analysis_history')
        .update({
          rebalance_request_id: analysisContext.rebalanceRequestId
        })
        .eq('id', analysis.id);
    }

    if (analysisContext) {
      const updatePayload: Record<string, any> = {};
      const existingContext = analysis.analysis_context || {};
      updatePayload.analysis_context = { ...existingContext, ...analysisContext };

      if (Object.keys(metadataFromContext).length > 0) {
        const existingMetadata = analysis.metadata || {};
        updatePayload.metadata = { ...existingMetadata, ...metadataFromContext };
      }

      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from('analysis_history')
          .update(updatePayload)
          .eq('id', analysis.id);
        analysis = { ...analysis, ...updatePayload };
      }
    }
    
    if (runningAnalyses.length > 1) {
      const orphanedIds = runningAnalyses.slice(1).map((a: any) => a.id);
      console.log(`🧹 Cleaning up ${orphanedIds.length} orphaned pending/running analyses for ${ticker}`);
      
      // Check which orphaned analyses are part of rebalances
      const orphanedAnalyses = runningAnalyses.slice(1);
      const rebalanceOrphanedAnalyses = orphanedAnalyses.filter((a: any) => a.rebalance_request_id);
      
      // Update all orphaned analyses using unified helper
      for (const orphanedId of orphanedIds) {
        const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
          supabase,
          orphanedId,
          ticker,
          userId,
          apiSettings,
          'Analysis superseded by newer request'
        );
        
        if (!errorResult.success) {
          console.error(`❌ Failed to mark orphaned analysis ${orphanedId} as ERROR:`, errorResult.error);
        } else {
          console.log(`✅ Orphaned analysis ${orphanedId} marked as ERROR`);
          if (errorResult.rebalanceNotified) {
            console.log(`📊 Rebalance-coordinator notified about orphaned analysis`);
          }
        }
      }
    }
  } else {
    // Create new analysis record with proper rebalance linkage
    const insertData: any = {
      user_id: userId,
      ticker,
      analysis_date: new Date().toISOString().split('T')[0],
      decision: 'PENDING',
      confidence: 0,
      agent_insights: {},
      analysis_status: ANALYSIS_STATUS.PENDING,
      full_analysis: createInitialWorkflowSteps()
    };

    // Add rebalance_request_id if this is a rebalance analysis
    if (analysisContext?.rebalanceRequestId) {
      insertData.rebalance_request_id = analysisContext.rebalanceRequestId;
      console.log(`🔗 Creating analysis for ${ticker} linked to rebalance ${analysisContext.rebalanceRequestId}`);
    }

    if (analysisContext) {
      insertData.analysis_context = analysisContext;
    }

    if (Object.keys(metadataFromContext).length > 0) {
      insertData.metadata = metadataFromContext;
    }

    const { data: newAnalysis, error } = await supabase
      .from('analysis_history')
      .insert(insertData)
      .select()
      .single();
    
    if (error) {
      console.error(`❌ Failed to create analysis for ${ticker}:`, error);
      return createErrorResponse(error.message);
    }
    
    if (!newAnalysis) {
      console.error('❌ No analysis record returned after insert');
      return createErrorResponse('Failed to create analysis record');
    }
    
    analysis = newAnalysis;
    console.log(`✅ Created new analysis record for ${ticker}, ID: ${analysis.id}`);
  }
  
  // Call the analysis-coordinator (this same function) to start the workflow
  const coordinatorResult = await invokeWithRetry(
    supabase,
    'analysis-coordinator',
    {
      analysisId: analysis.id,
      ticker,
      userId,
      phase: 'analysis',
      apiSettings,
      analysisContext: analysisContext || { type: 'individual' }
    }
  );
  
  if (!coordinatorResult.success) {
    console.error('❌ Failed to start coordinator workflow:', coordinatorResult.error);
    
    // Use unified helper to mark analysis as error and notify rebalance if needed
    const errorResult = await markAnalysisAsErrorWithRebalanceCheck(
      supabase,
      analysis.id,
      ticker,
      userId,
      apiSettings,
      `Failed to start coordinator workflow: ${coordinatorResult.error}`
    );
    
    if (!errorResult.success) {
      console.error(`❌ Failed to mark analysis as ERROR:`, errorResult.error);
    } else {
      console.log(`✅ Analysis marked as ERROR successfully`);
      if (errorResult.rebalanceNotified) {
        console.log(`📊 Failed to start coordinator - rebalance-coordinator notified`);
      }
    }
    
    return createErrorResponse(
      `Failed to start coordinator workflow: ${coordinatorResult.error}`
    );
  }
  console.log('✅ Coordinator workflow initiated successfully');
  
  return createSuccessResponse({
    analysisId: analysis.id,
    message: 'Analysis workflow started - will complete in multiple phases',
    workflow: 'chunked'
  });
}

/**
 * Create initial workflow steps structure for new analysis
 */
function createInitialWorkflowSteps() {
  const pendingAgent = { status: 'pending', progress: 0 };
  
  return {
    // Remove status from full_analysis - use analysis_status field instead
    startedAt: new Date().toISOString(),
    messages: [],
    workflowSteps: [
      {
        id: 'analysis',
        name: 'Market Analysis',
        status: 'pending',
        agents: [
          { name: 'Macro Analyst', functionName: 'agent-macro-analyst', ...pendingAgent },
          { name: 'Market Analyst', functionName: 'agent-market-analyst', ...pendingAgent },
          { name: 'News Analyst', functionName: 'agent-news-analyst', ...pendingAgent },
          { name: 'Social Media Analyst', functionName: 'agent-social-media-analyst', ...pendingAgent },
          { name: 'Fundamentals Analyst', functionName: 'agent-fundamentals-analyst', ...pendingAgent }
        ]
      },
      {
        id: 'research',
        name: 'Research Team',
        status: 'pending',
        agents: [
          { name: 'Bull Researcher', functionName: 'agent-bull-researcher', ...pendingAgent },
          { name: 'Bear Researcher', functionName: 'agent-bear-researcher', ...pendingAgent },
          { name: 'Research Manager', functionName: 'agent-research-manager', ...pendingAgent }
        ]
      },
      {
        id: 'trading',
        name: 'Trading Decision',
        status: 'pending',
        agents: [{ name: 'Trader', functionName: 'agent-trader', ...pendingAgent }]
      },
      {
        id: 'risk',
        name: 'Risk Management',
        status: 'pending',
        agents: [
          { name: 'Risky Analyst', functionName: 'agent-risky-analyst', ...pendingAgent },
          { name: 'Safe Analyst', functionName: 'agent-safe-analyst', ...pendingAgent },
          { name: 'Neutral Analyst', functionName: 'agent-neutral-analyst', ...pendingAgent },
          { name: 'Risk Manager', functionName: 'agent-risk-manager', ...pendingAgent }
        ]
      },
      {
        id: 'portfolio',
        name: 'Portfolio Management',
        status: 'pending',
        agents: [{ name: 'Analysis Portfolio Manager', functionName: 'analysis-portfolio-manager', ...pendingAgent }]
      }
    ]
  };
}
