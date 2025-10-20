/**
 * Fetch analysis data from database
 * Returns null if analysis not found instead of throwing
 */
export async function fetchAnalysisData(
  supabase: any,
  analysisId: string
): Promise<{ analysis: any; fullAnalysis: any } | null> {
  
  try {
    // First check for duplicates
    const { data: allAnalyses, error: checkError } = await supabase
      .from('analysis_history')
      .select('id, full_analysis, created_at')
      .eq('id', analysisId)
      .order('created_at', { ascending: false });
    
    if (checkError) {
      console.error(`Error fetching analysis ${analysisId}:`, checkError);
      return null;
    }
    
    if (!allAnalyses || allAnalyses.length === 0) {
      console.warn(`Analysis ${analysisId} not found in database - may have been deleted`);
      return null;
    }
    
    if (allAnalyses.length > 1) {
      console.warn(`⚠️ Multiple analyses found with same ID - using most recent`);
      console.warn(`   Found ${allAnalyses.length} analyses with ID ${analysisId}`);
      console.warn(`   Using most recent created at ${allAnalyses[0].created_at}`);
    }
    
    // Use the most recent analysis
    const analysis = allAnalyses[0];
    const fullAnalysis = analysis.full_analysis || {};
    
    return { analysis, fullAnalysis };
  } catch (error) {
    console.error(`Unexpected error fetching analysis ${analysisId}:`, error);
    return null;
  }
}