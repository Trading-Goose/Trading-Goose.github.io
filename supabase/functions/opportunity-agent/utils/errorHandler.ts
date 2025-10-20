/**
 * Categorize and enhance error messages for better tracking
 */
export function categorizeError(error: any): Error {
  // Determine error type for proper tracking
  let errorType: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'other' = 'other';
  let errorMessage = error.message || 'Unknown error in opportunity evaluation';

  // Categorize the error
  if (error.message?.includes('rate limit') || error.message?.includes('quota') ||
    error.message?.includes('insufficient_quota') || error.message?.includes('429')) {
    errorType = 'rate_limit';
    errorMessage = `Rate limit or quota exceeded: ${error.message}`;
  } else if (error.message?.includes('API key') || error.message?.includes('api_key') ||
    error.message?.includes('Unauthorized') || error.message?.includes('401')) {
    errorType = 'api_key';
    errorMessage = `API key issue: ${error.message}`;
  } else if (error.message?.includes('empty response') || error.message?.includes('invalid JSON') ||
    error.message?.includes('AI provider') || error.message?.includes('model')) {
    errorType = 'ai_error';
    errorMessage = `AI provider error: ${error.message}`;
  } else if (error.message?.includes('fetch') || error.message?.includes('network') ||
    error.message?.includes('timeout')) {
    errorType = 'data_fetch';
    errorMessage = `Data fetch error: ${error.message}`;
  }

  // Throw with categorized error
  const categorizedError = new Error(errorMessage);
  categorizedError['errorType'] = errorType;
  return categorizedError;
}