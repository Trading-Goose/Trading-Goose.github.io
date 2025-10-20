import { ApiSettings, AnalysisContext } from '../types/index.ts';
import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { runResearchDebateRound } from '../utils/phase-manager.ts';

/**
 * Handle bear researcher completion (triggers debate round check)
 */
export async function handleBearResearcherCompletion(
  supabase: any,
  analysisId: string,
  ticker: string,
  userId: string,
  apiSettings: ApiSettings,
  analysisContext?: AnalysisContext
): Promise<Response> {
  
  console.log('🐻 Bear Researcher completed - checking debate rounds');
  
  // Get current analysis state
  const { data: analysis } = await supabase
    .from('analysis_history')
    .select('full_analysis')
    .eq('id', analysisId)
    .single();
  
  if (!analysis) {
    return createErrorResponse('Analysis not found');
  }
  
  const fullAnalysis = analysis.full_analysis || {};
  const currentDebateCount = fullAnalysis.currentDebateCount || 0;
  const maxRounds = apiSettings.research_debate_rounds || 2;
  
  console.log(`📊 Debate Status: Completed round ${currentDebateCount}/${maxRounds}`);
  
  if (currentDebateCount < maxRounds) {
    const nextRound = currentDebateCount + 1;
    console.log(`🚀 Starting next debate round ${nextRound}/${maxRounds}`);
    
    // Update debate count
    await supabase
      .from('analysis_history')
      .update({
        full_analysis: {
          ...fullAnalysis,
          currentDebateCount: nextRound
        }
      })
      .eq('id', analysisId);
    
    // Start next debate round
    runResearchDebateRound(supabase, analysisId, ticker, userId, apiSettings, nextRound, analysisContext)
      .then(() => console.log(`✅ Started debate round ${nextRound}`))
      .catch((error) => console.error('❌ Failed to start debate round:', error));
  } else {
    console.log(`✅ All ${maxRounds} debate rounds completed, starting research manager`);
    
    // Set Research Manager status to "running" before invoking to prevent duplicates
    console.log('📍 Setting Research Manager status to "running" before invocation');
    await supabase.rpc('update_workflow_step_status', {
      p_analysis_id: analysisId,
      p_phase_id: 'research',
      p_agent_name: 'Research Manager',
      p_status: 'running'
    });
    
    // Start research manager
    supabase.functions.invoke('agent-research-manager', {
      body: {
        analysisId,
        ticker,
        userId,
        apiSettings,
        analysisContext
      }
    }).then(() => {
      console.log('✅ Research manager started');
    }).catch(async (error: any) => {
      console.error('❌ Failed to start research manager:', error);
      // Set status to error if invocation fails
      await supabase.rpc('update_workflow_step_status', {
        p_analysis_id: analysisId,
        p_phase_id: 'research',
        p_agent_name: 'Research Manager',
        p_status: 'error'
      });
    });
  }
  
  return createSuccessResponse({
    message: `Bear researcher completed - round ${currentDebateCount}/${maxRounds}`
  });
}