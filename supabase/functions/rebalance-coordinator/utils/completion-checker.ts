import { ANALYSIS_STATUS } from '../../_shared/statusTypes.ts';
/**
 * Check if all analyses in a rebalance are complete using atomic database operations
 */ export async function checkRebalanceCompletion(supabase, rebalanceRequestId) {
  console.log(`🔍 Checking completion status for rebalance ${rebalanceRequestId}`);
  try {
    // Get rebalance request info
    const { data: rebalanceReq, error: rebalanceError } = await supabase.from('rebalance_requests').select('total_stocks, stocks_analyzed, selected_stocks, analysis_ids').eq('id', rebalanceRequestId).single();
    if (rebalanceError || !rebalanceReq) {
      console.error('❌ Failed to get rebalance request:', rebalanceError);
      throw new Error(`Failed to get rebalance request: ${rebalanceError?.message}`);
    }
    // Get all analyses for this rebalance
    const { data: analyses, error: analysesError } = await supabase.from('analysis_history').select('id, ticker, analysis_status, decision, confidence, agent_insights').eq('rebalance_request_id', rebalanceRequestId).order('created_at', {
      ascending: true
    });
    if (analysesError) {
      console.error('❌ Failed to get analyses:', analysesError);
      throw new Error(`Failed to get analyses: ${analysesError.message}`);
    }
    if (!analyses || analyses.length === 0) {
      console.warn('⚠️ No analyses found for rebalance');
      return {
        isComplete: false,
        totalAnalyses: 0,
        completedAnalyses: 0,
        pendingAnalyses: 0,
        failedAnalyses: 0,
        cancelledAnalyses: 0,
        analysisDetails: []
      };
    }
    // Categorize analyses by status
    const completedAnalyses = analyses.filter((a) => a.analysis_status === ANALYSIS_STATUS.COMPLETED);
    const errorAnalyses = analyses.filter((a) => a.analysis_status === ANALYSIS_STATUS.ERROR);
    const cancelledAnalyses = analyses.filter((a) => a.analysis_status === ANALYSIS_STATUS.CANCELLED);
    const pendingAnalyses = analyses.filter((a) => a.analysis_status === ANALYSIS_STATUS.PENDING || a.analysis_status === ANALYSIS_STATUS.RUNNING);
    const totalAnalyses = analyses.length;
    // Consider COMPLETED, ERROR, and CANCELLED as finished states
    const finishedAnalyses = completedAnalyses.length + errorAnalyses.length + cancelledAnalyses.length;
    // Rebalance is "complete" when all analyses have finished (completed, error, or cancelled)
    const isComplete = finishedAnalyses >= totalAnalyses;
    console.log(`📊 Completion status:`);
    console.log(`   Total: ${totalAnalyses}`);
    console.log(`   Completed: ${completedAnalyses.length}`);
    console.log(`   Failed: ${errorAnalyses.length}`);
    console.log(`   Cancelled: ${cancelledAnalyses.length}`);
    console.log(`   Pending: ${pendingAnalyses.length}`);
    console.log(`   Is Complete: ${isComplete}`);
    return {
      isComplete,
      totalAnalyses,
      completedAnalyses: completedAnalyses.length,
      pendingAnalyses: pendingAnalyses.length,
      failedAnalyses: errorAnalyses.length,
      cancelledAnalyses: cancelledAnalyses.length,
      analysisDetails: analyses.map((a) => ({
        id: a.id,
        ticker: a.ticker,
        status: a.analysis_status,
        decision: a.decision,
        confidence: a.confidence
      }))
    };
  } catch (error) {
    console.error('❌ Error checking rebalance completion:', error);
    throw error;
  }
}
