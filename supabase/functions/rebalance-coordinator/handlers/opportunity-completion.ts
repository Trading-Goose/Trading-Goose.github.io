import { checkRebalanceCancellation } from '../../analysis-coordinator/utils/cancellation.ts';
import { updateRebalanceWorkflowStep } from '../../_shared/atomicUpdate.ts';
import { REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { createSuccessResponse, createCanceledResponse } from '../utils/response-helpers.ts';
import { startAnalysesForStocks } from './rebalance-start.ts';
/**
 * Handle opportunity agent completion for rebalance workflow
 * This function processes the opportunity agent's recommendations and decides the next steps
 */ export async function handleOpportunityCompletion(supabase, rebalanceRequestId, userId, apiSettings, selectedStocks, recommendAnalysis) {
  console.log(`🎯 Opportunity Agent completed evaluation for rebalance: ${rebalanceRequestId}`);
  // Check if rebalance was canceled
  const cancellationCheck = await checkRebalanceCancellation(supabase, rebalanceRequestId);
  if (!cancellationCheck.shouldContinue) {
    console.log('🛑 Rebalance was canceled during opportunity evaluation');
    return createCanceledResponse('Rebalance canceled');
  }
  console.log(`💡 Opportunity evaluation results:`);
  console.log(`  - Recommend Analysis: ${recommendAnalysis}`);
  console.log(`  - Selected Stocks: ${selectedStocks?.length || 0}`);
  if (selectedStocks?.length > 0) {
    console.log(`  - Stock details:`, JSON.stringify(selectedStocks, null, 2));
  }
  // Check if opportunity agent recommends analysis
  if (recommendAnalysis && selectedStocks?.length > 0) {
    const selectedTickers = selectedStocks.map((s) => s.ticker).filter(Boolean);
    console.log(`🎯 Opportunity Agent selected ${selectedTickers.length} stocks for analysis:`, selectedTickers);
    // Use the same startAnalysesForStocks function that rebalance-start uses
    // This ensures ALL stocks get analysis records created upfront
    console.log('🚀 Creating analysis records for all selected stocks and starting analyses');
    return await startAnalysesForStocks(supabase, userId, rebalanceRequestId, selectedTickers, apiSettings);
  } else {
    console.log('📉 Opportunity Agent found no compelling opportunities');
    // Mark opportunity agent step as complete with no selections
    const opportunityCompleteResult = await updateRebalanceWorkflowStep(supabase, rebalanceRequestId, 'opportunity_analysis', 'completed', {
      completedAt: new Date().toISOString(),
      selectedStocks: [],
      noOpportunities: true,
      reasoning: 'No compelling opportunities identified in current market conditions'
    });
    if (!opportunityCompleteResult.success) {
      console.error('❌ Failed to update opportunity step:', opportunityCompleteResult.error);
    }
    // Update status to completed since no analysis is needed
    const { error: statusUpdateError } = await supabase.from('rebalance_requests').update({
      status: REBALANCE_STATUS.COMPLETED,
      completed_at: new Date().toISOString(),
      rebalance_plan: {
        recommendation: 'no_action_needed',
        message: 'Opportunity analysis found no compelling trading opportunities in current market conditions.',
        reasoning: 'Market scan completed with no stocks meeting opportunity thresholds for deeper analysis.',
        selectedStocks: [],
        timestamp: new Date().toISOString()
      }
    }).eq('id', rebalanceRequestId);
    if (statusUpdateError) {
      console.error('❌ Failed to update rebalance status:', statusUpdateError);
    }
    return createSuccessResponse({
      message: 'No opportunities found - rebalance completed with no action needed',
      rebalanceRequestId,
      noOpportunities: true
    });
  }
}
