import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { createSuccessResponse } from '../utils/response-helpers.ts';
import { runResearchDebateRound } from '../utils/phase-manager.ts';
import { invokeAgentWithRetry } from '../../_shared/invokeWithRetry.ts';

/**
 * Handle research debate round completion and progression
 */
export async function handleDebateRoundCompletion(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  fullAnalysis: any,
  analysisContext?: AnalysisContext
): Promise<Response> {
  
  const currentDebateCount = fullAnalysis.currentDebateCount || 0;
  const maxRounds = apiSettings.research_debate_rounds || 2;
  
  console.log(`📊 Debate Status: Completed round ${currentDebateCount}/${maxRounds}`);
  
  if (currentDebateCount < maxRounds) {
    const nextRound = currentDebateCount + 1;
    console.log(`🚀 Starting next debate round ${nextRound}/${maxRounds}`);
    
    // Update debate count and start next round
    await supabase
      .from('analysis_history')
      .update({
        full_analysis: {
          ...fullAnalysis,
          currentDebateCount: nextRound
        }
      })
      .eq('id', analysisId);
    
    // Start next debate round with context
    runResearchDebateRound(supabase, analysisId, ticker, userId, apiSettings, nextRound, analysisContext)
      .then(() => console.log(`✅ Started debate round ${nextRound}`))
      .catch((error) => console.error('❌ Failed to start debate round:', error));
  } else {
    console.log(`✅ All ${maxRounds} debate rounds completed, starting research manager`);
    
    // Start research manager
    console.log('🚀 Starting research manager...');
    invokeAgentWithRetry(
      supabase,
      'agent-research-manager',
      analysisId,
      ticker,
      userId,
      apiSettings,
      2, // maxRetries
      'research',
      analysisContext // Pass context through to research manager
    );
  }
  
  return createSuccessResponse({});
}