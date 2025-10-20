import { ANALYSIS_STATUS, REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { notifyCoordinatorAsync } from '../../_shared/coordinatorNotification.ts';

export async function getUserSettings(
  supabase: any,
  userId: string,
  apiSettings: any,
  constraints?: any,
  portfolioValue?: number
) {
  // Calculate position sizes based on portfolio value
  const totalValue = portfolioValue || 100000; // Fallback for edge cases
  
  if (constraints && Object.keys(constraints).length > 0) {
    console.log('🔄 Using rebalance constraints from frontend/scheduler');
    
    // Constraints now contain percentages, convert to dollars
    const minPositionPercent = constraints.minPositionSize || 5;
    const maxPositionPercent = constraints.maxPositionSize || 25;
    
    const minPositionDollars = (minPositionPercent / 100) * totalValue;
    const maxPositionDollars = (maxPositionPercent / 100) * totalValue;
    
    console.log(`📊 Position sizing from constraints (percentages to dollars):`);
    console.log(`  - Min: ${minPositionPercent}% = $${minPositionDollars.toFixed(2)}`);
    console.log(`  - Max: ${maxPositionPercent}% = $${maxPositionDollars.toFixed(2)}`);
    
    const profitTarget = constraints?.profitTarget ?? apiSettings?.profit_target ?? 25;
    const stopLoss = constraints?.stopLoss ?? apiSettings?.stop_loss ?? 10;
    const nearLimitThreshold = constraints?.nearLimitThreshold ?? apiSettings?.near_limit_threshold ?? 20;
    const nearPositionThreshold = constraints?.nearPositionThreshold ?? apiSettings?.near_position_threshold ?? 20;

    return {
      user_risk_level: apiSettings.user_risk_level || 'moderate',
      default_position_size_dollars: minPositionDollars, // Use min as default
      min_position_size_dollars: minPositionDollars,
      max_position_size_dollars: maxPositionDollars,
      min_position_size_percent: minPositionPercent,
      max_position_size_percent: maxPositionPercent,
      profit_target_percent: profitTarget,
      profit_target: profitTarget,
      stop_loss_percent: stopLoss,
      stop_loss: stopLoss,
      near_limit_threshold_percent: nearLimitThreshold,
      near_limit_threshold: nearLimitThreshold,
      near_position_threshold_percent: nearPositionThreshold,
      near_position_threshold: nearPositionThreshold
    };
  }
  
  // No constraints - fetch from database
  const { data: dbSettings } = await supabase
    .from('api_settings')
    .select('user_risk_level, rebalance_min_position_size, rebalance_max_position_size, profit_target, stop_loss, near_limit_threshold, near_position_threshold')
    .eq('user_id', userId)
    .single();
  
  // Get percentage-based position sizes from database
  const minPositionPercent = dbSettings?.rebalance_min_position_size || apiSettings.rebalance_min_position_size || 5;
  const maxPositionPercent = dbSettings?.rebalance_max_position_size || apiSettings.rebalance_max_position_size || 25;
  
  const minPositionDollars = (minPositionPercent / 100) * totalValue;
  const maxPositionDollars = (maxPositionPercent / 100) * totalValue;
  
  console.log(`📊 Position sizing from database (percentages to dollars):`);
  console.log(`  - Min: ${minPositionPercent}% = $${minPositionDollars.toFixed(2)}`);
  console.log(`  - Max: ${maxPositionPercent}% = $${maxPositionDollars.toFixed(2)}`);
  
  const profitTarget = dbSettings?.profit_target ?? apiSettings?.profit_target ?? 25;
  const stopLoss = dbSettings?.stop_loss ?? apiSettings?.stop_loss ?? 10;
  const nearLimitThreshold = dbSettings?.near_limit_threshold ?? apiSettings?.near_limit_threshold ?? 20;
  const nearPositionThreshold = dbSettings?.near_position_threshold ?? apiSettings?.near_position_threshold ?? 20;

  return {
    user_risk_level: dbSettings?.user_risk_level || 'moderate',
    default_position_size_dollars: minPositionDollars, // Use min as default
    min_position_size_dollars: minPositionDollars,
    max_position_size_dollars: maxPositionDollars,
    min_position_size_percent: minPositionPercent,
    max_position_size_percent: maxPositionPercent,
    profit_target_percent: profitTarget,
    profit_target: profitTarget,
    stop_loss_percent: stopLoss,
    stop_loss: stopLoss,
    near_limit_threshold_percent: nearLimitThreshold,
    near_limit_threshold: nearLimitThreshold,
    near_position_threshold_percent: nearPositionThreshold,
    near_position_threshold: nearPositionThreshold
  };
}

export async function handleNoAnalyses(
  supabase: any,
  rebalanceRequestId: string,
  portfolioData: any,
  userId: string,
  apiSettings: any
): Promise<Response> {
  console.log(`📭 No analyses found for rebalance request ${rebalanceRequestId}`);
  
  // Don't mark as COMPLETED - let coordinator do it after auto-trade check
  // Just update the plan without changing status
  await supabase
    .from('rebalance_requests')
    .update({
      // Don't set status to COMPLETED - coordinator will handle this
      rebalance_plan: {
        recommendation: 'no_action_needed',
        message: 'No analyses were created - no opportunities met criteria',
        totalValue: portfolioData?.totalValue || 0,
        cashBalance: portfolioData?.cashBalance || 0,
        actions: []
      },
      plan_generated_at: new Date().toISOString()
    })
    .eq('id', rebalanceRequestId);
  
  // Notify coordinator even when no analyses found - coordinator will mark as complete
  notifyCoordinatorAsync(supabase, {
    analysisId: '', // No single analysisId for rebalance
    ticker: '', // No single ticker for rebalance  
    userId,
    phase: 'portfolio',
    agent: 'rebalance-portfolio-manager',
    apiSettings,
    analysisContext: {
      type: 'rebalance',
      rebalanceRequestId
    }
  }, 'Rebalance Portfolio Manager');
  
  console.log('✅ Rebalance Portfolio Manager completed (no analyses) - notifying coordinator');
  
  return new Response(JSON.stringify({
    success: true,
    message: 'No analyses found - no rebalancing actions needed',
    rebalanceRequestId,
    rebalancePlan: {
      recommendation: 'no_action_needed',
      actions: [],
      totalValue: portfolioData?.totalValue || 0,
      cashBalance: portfolioData?.cashBalance || 0
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function fetchAnalysesForRebalance(
  supabase: any,
  rebalanceRequestId: string
) {
  // Fetch essential fields plus full risk manager insights for reasoning
  const { data: analyses, error: fetchError } = await supabase
    .from('analysis_history')
    .select(`
      id, 
      ticker, 
      decision, 
      confidence, 
      analysis_status,
      agent_insights->riskManager
    `)
    .eq('rebalance_request_id', rebalanceRequestId)
    .neq('analysis_status', ANALYSIS_STATUS.ERROR);
  
  if (fetchError) {
    throw new Error(`Failed to fetch analyses: ${fetchError.message}`);
  }
  
  // Transform the data to have a cleaner structure
  const transformedAnalyses = analyses?.map((analysis: any) => ({
    id: analysis.id,
    ticker: analysis.ticker,
    decision: analysis.decision,
    confidence: analysis.confidence,
    analysis_status: analysis.analysis_status,
    riskScore: analysis.riskManager?.finalAssessment?.overallRiskScore || null,
    riskManagerInsights: analysis.riskManager || null  // Full insights for reasoning
  }));
  
  return transformedAnalyses;
}

export async function getRebalanceRequestDetails(
  supabase: any,
  rebalanceRequestId: string
) {
  const { data: rebalanceRequest } = await supabase
    .from('rebalance_requests')
    .select('*')
    .eq('id', rebalanceRequestId)
    .single();

  return rebalanceRequest;
}
