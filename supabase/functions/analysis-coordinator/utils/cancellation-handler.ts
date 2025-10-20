import { AnalysisContext } from '../types/index.ts';
import { checkCombinedCancellation } from './cancellation.ts';
import { createCanceledResponse } from './response-helpers.ts';

/**
 * Check cancellation status and return response if canceled
 * Note: analysisContext is no longer used but kept in signature for compatibility
 */
export async function checkAndHandleCancellation(
  supabase: any,
  analysisId: string,
  analysisContext?: AnalysisContext
): Promise<Response | null> {
  
  const cancellationCheck = await checkCombinedCancellation(supabase, analysisId);
  if (!cancellationCheck.shouldContinue) {
    return createCanceledResponse(
      `Analysis stopped: ${cancellationCheck.reason}`,
      cancellationCheck.isCanceled
    );
  }
  
  return null; // No cancellation
}