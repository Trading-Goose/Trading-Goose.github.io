/**
 * Service for managing analysis operations
 */

import { supabase } from '@/lib/supabase';

interface StartAnalysisParams {
  ticker: string;
  userId: string;
}

interface StartAnalysisResult {
  success: boolean;
  analysisId?: string;
  error?: string;
}

export async function startAnalysis({ ticker, userId }: StartAnalysisParams): Promise<StartAnalysisResult> {
  try {
    // Start analysis via analysis coordinator
    // Don't send any credentials from frontend - coordinator will fetch from database
    const { data, error } = await supabase.functions.invoke('analysis-coordinator', {
      body: {
        ticker,
        userId,
        // No phase/agent - indicates new analysis request
      }
    });

    // Check for Supabase client errors (network, auth, etc)
    if (error) {
      // If there's data with an error message, use that instead of the generic error
      if (data?.error) {
        throw new Error(data.error);
      }
      throw error;
    }
    
    // Check for function-level errors
    if (!data?.success) {
      const errorMessage = data?.error || 'Analysis failed';
      
      // Check if it's a configuration issue
      if (errorMessage.includes('API settings not found') || 
          errorMessage.includes('not configured') || 
          errorMessage.includes('No provider configuration found')) {
        throw new Error('Please configure your AI provider settings in the Settings page');
      }
      
      // Show the actual error message from the function
      throw new Error(errorMessage);
    }

    return {
      success: true,
      analysisId: data?.analysisId
    };
  } catch (error) {
    console.error('Failed to start analysis:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start analysis'
    };
  }
}