import { updateAnalysisPhase, updateWorkflowStepStatus, updateAgentInsights } from '../../_shared/atomicUpdate.ts';
import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';
import { 
  prepareUserSettings, 
  adjustConfidenceForRiskLevel, 
  validateDecision, 
  formatPendingOrdersInfo
} from './individual-logic.ts';
import { processAnalysisData, executeAnalysisDecision } from './individual-processor.ts';

/**
 * Mark analysis as failed when portfolio manager encounters critical errors
 * This enables manual retry functionality
 */
async function markAnalysisAsFailed(
  supabase: any,
  analysisId: string,
  errorMessage: string
): Promise<void> {
  try {
    console.log('❌ Analysis Portfolio Manager failed - marking analysis as failed for retry');
    
    // Mark analysis as failed (like risk-manager does)
    await supabase
      .from('analysis_history')
      .update({ 
        analysis_status: ANALYSIS_STATUS.ERROR,
        decision: 'ERROR',
        confidence: 0 
      })
      .eq('id', analysisId);
    
    // Mark portfolio workflow step as error
    await updateWorkflowStepStatus(
      supabase,
      analysisId,
      'portfolio',
      'Analysis Portfolio Manager',
      'error'
    );
    
    console.log('✅ Analysis marked as failed - manual retry will be available');
  } catch (updateError) {
    console.error('Failed to mark analysis as failed:', updateError);
  }
}

export async function handleIndividualAnalysis(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: any,
  portfolioData: any
): Promise<Response> {
  console.log(`📊 Processing individual analysis for ${ticker}`);
  console.log(`  - Analysis ID: ${analysisId}`);

  // CRITICAL: Check for existing orders first to handle retries gracefully
  console.log(`🔍 Checking for existing orders for analysis ${analysisId}`);
  const { data: existingOrders, error: checkError } = await supabase
    .from('trading_actions')
    .select('ticker, action, dollar_amount, shares, reasoning')
    .eq('analysis_id', analysisId);
  
  if (checkError) {
    console.error('⚠️ Error checking for existing orders:', checkError);
  }

  // Fetch risk manager decision from database
  const { data: analysis, error: fetchError } = await supabase
    .from('analysis_history')
    .select('decision, confidence, agent_insights')
    .eq('id', analysisId)
    .single();

  if (fetchError || !analysis) {
    console.error('❌ Failed to fetch analysis for risk data:', fetchError);
    const errorMessage = `Failed to fetch analysis: ${fetchError?.message || 'Analysis not found'}`;
    await markAnalysisAsFailed(supabase, analysisId, errorMessage);
    throw new Error(errorMessage);
  }

  const riskManagerDecision = {
    decision: analysis.decision,
    confidence: analysis.confidence,
    assessment: analysis.agent_insights?.riskManager?.finalAssessment
  };

  console.log(`📊 Risk Manager Analysis:`);
  console.log(`  - Decision from DB: ${analysis.decision}`);
  console.log(`  - Confidence from DB: ${analysis.confidence}%`);
  console.log(`  - Risk Manager Decision: ${riskManagerDecision?.decision || 'N/A'}`);
  console.log(`  - Risk Manager Confidence: ${riskManagerDecision?.confidence || 0}%`);

  // Update analysis phase
  await updateAnalysisPhase(supabase, analysisId, 'portfolio', {
    agent: 'Analysis Portfolio Manager',
    message: 'Analysis Portfolio Manager starting analysis',
    timestamp: new Date().toISOString(),
    type: 'info'
  });

  // Get full analysis data
  const { data: fullAnalysis } = await supabase
    .from('analysis_history')
    .select('*')
    .eq('id', analysisId)
    .single();

  if (!fullAnalysis) {
    const errorMessage = 'Analysis not found';
    await markAnalysisAsFailed(supabase, analysisId, errorMessage);
    throw new Error(errorMessage);
  }

  // Update workflow status
  await updateWorkflowStepStatus(supabase, analysisId, 'portfolio', 'Analysis Portfolio Manager', 'running');
  
  // Check if we have existing orders from a previous attempt
  if (existingOrders && existingOrders.length > 0) {
    console.log(`📋 Found ${existingOrders.length} existing order(s) from previous attempt, using them as decisions`);
    
    // Extract the order details
    const existingOrder = existingOrders[0]; // Should only be one order per analysis
    
    // Update agent insights with existing order info
    await updateAgentInsights(supabase, analysisId, 'portfolio', {
      portfolioManager: {
        decision: existingOrder.action,
        confidence: existingOrder.confidence || riskManagerDecision.confidence,
        reasoning: existingOrder.reasoning || `Using existing ${existingOrder.action} order from previous attempt`,
        positionSizing: {
          dollarAmount: existingOrder.dollar_amount,
          shares: existingOrder.shares,
          action: existingOrder.action
        },
        existingOrderUsed: true,
        orderCreatedAt: new Date().toISOString()
      }
    });
    
    // Mark portfolio phase as complete
    await updateAnalysisPhase(supabase, analysisId, 'portfolio', {
      agent: 'Analysis Portfolio Manager',
      message: `Using existing ${existingOrder.action} order - ${existingOrder.dollar_amount ? `$${existingOrder.dollar_amount}` : `${existingOrder.shares} shares`}`,
      timestamp: new Date().toISOString(),
      type: 'decision'
    });

    // Update workflow status to complete
    await updateWorkflowStepStatus(supabase, analysisId, 'portfolio', 'Analysis Portfolio Manager', 'completed');
    
    console.log(`✅ Analysis Portfolio Manager completed using existing order for ${ticker}`);
    
    return new Response(JSON.stringify({
      success: true,
      ticker,
      decision: existingOrder.action,
      confidence: existingOrder.confidence,
      existingOrderUsed: true,
      orderDetails: {
        ticker: existingOrder.ticker,
        action: existingOrder.action,
        dollarAmount: existingOrder.dollar_amount,
        shares: existingOrder.shares
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // No existing orders, proceed with normal processing
  console.log(`📝 No existing orders found, proceeding with AI analysis`);
  
  // Process the analysis data and generate AI response
  const analysisResult = await processAnalysisData(
    supabase, fullAnalysis, analysisId, ticker, userId, apiSettings, 
    portfolioData
  );
  
  if (!analysisResult.success) {
    // Mark analysis as failed for critical errors that should allow retry
    const errorMessage = analysisResult.error || 'Analysis processing failed';
    await markAnalysisAsFailed(supabase, analysisId, errorMessage);
    
    return new Response(JSON.stringify({
      ...analysisResult,
      criticalError: true
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: analysisResult.status || 400
    });
  }
  
  // Execute the decision based on analysis results
  return executeAnalysisDecision(
    supabase, analysisId, ticker, userId, apiSettings,
    analysisResult.data!, portfolioData
  );
}
