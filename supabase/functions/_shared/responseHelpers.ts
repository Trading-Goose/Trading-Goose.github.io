import { corsHeaders } from './cors.ts';

/**
 * Shared response helper functions for consistent error handling across all Edge Functions
 * Following the pattern established by rebalance-coordinator and analysis-coordinator
 */

export const JSON_RESPONSE_HEADERS = {
  ...corsHeaders,
  'Content-Type': 'application/json'
};

/**
 * Creates a success response with consistent format
 * @param data - The response data to include
 * @param status - HTTP status code (defaults to 200)
 */
export function createSuccessResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify({
    success: true,
    ...data
  }), {
    status,
    headers: JSON_RESPONSE_HEADERS
  });
}

/**
 * Creates an error response with consistent format
 * @param error - The error message to display
 * @param status - HTTP status code (defaults to 200 for coordinator compatibility)
 * @param details - Optional additional error details
 */
export function createErrorResponse(
  error: string, 
  status: number = 200, // Default to 200 so coordinator notifications work
  details?: any
): Response {
  return new Response(JSON.stringify({
    success: false,
    error,
    ...(details && { details })
  }), {
    status,
    headers: JSON_RESPONSE_HEADERS
  });
}

/**
 * Creates a cancellation response for cancelled analysis
 * @param message - The cancellation message
 * @param canceled - Whether the operation was canceled (defaults to true)
 */
export function createCanceledResponse(
  message: string, 
  canceled: boolean = true
): Response {
  return new Response(JSON.stringify({
    success: false,
    message,
    canceled
  }), {
    status: 200,
    headers: JSON_RESPONSE_HEADERS
  });
}

/**
 * Creates a response for CORS preflight OPTIONS requests
 */
export function createOptionsResponse(): Response {
  return new Response('ok', { headers: corsHeaders });
}

/**
 * Creates a method not allowed response
 */
export function createMethodNotAllowedResponse(): Response {
  return new Response(JSON.stringify({
    success: false,
    error: 'Method not allowed'
  }), {
    status: 200, // Return 200 so coordinator notifications work
    headers: JSON_RESPONSE_HEADERS
  });
}

/**
 * Creates a response for missing required parameters
 * @param missingParams - Array of missing parameter names or a general message
 */
export function createMissingParametersResponse(missingParams?: string | string[]): Response {
  const errorMessage = Array.isArray(missingParams) 
    ? `Missing required parameters: ${missingParams.join(', ')}`
    : missingParams || 'Missing required parameters';
    
  return new Response(JSON.stringify({
    success: false,
    error: errorMessage
  }), {
    status: 200,
    headers: JSON_RESPONSE_HEADERS
  });
}

/**
 * Creates a response for configuration errors
 * @param configType - Type of configuration that's missing/invalid
 */
export function createConfigurationErrorResponse(configType: string): Response {
  return new Response(JSON.stringify({
    success: false,
    error: `${configType} configuration error. Please check your settings.`
  }), {
    status: 200,
    headers: JSON_RESPONSE_HEADERS
  });
}

/**
 * Creates a response for API-related errors
 * @param provider - The API provider name
 * @param errorType - Type of API error (key, quota, connection, etc.)
 */
export function createApiErrorResponse(provider: string, errorType: 'key' | 'quota' | 'connection' | 'other' = 'other'): Response {
  let errorMessage: string;
  
  switch (errorType) {
    case 'key':
      errorMessage = `${provider} API key is invalid or missing. Please check your API configuration in Settings.`;
      break;
    case 'quota':
      errorMessage = `${provider} API quota exceeded or rate limit reached. Please try again later or check your API usage.`;
      break;
    case 'connection':
      errorMessage = `Failed to connect to ${provider} API. Please check your internet connection and try again.`;
      break;
    default:
      errorMessage = `${provider} API error occurred. Please verify your configuration and try again.`;
  }
  
  return new Response(JSON.stringify({
    success: false,
    error: errorMessage
  }), {
    status: 200,
    headers: JSON_RESPONSE_HEADERS
  });
}

/**
 * Creates a response for database errors
 * @param operation - The database operation that failed
 */
export function createDatabaseErrorResponse(operation: string): Response {
  return new Response(JSON.stringify({
    success: false,
    error: `Database error during ${operation}. Please try again or contact support if the problem persists.`
  }), {
    status: 200,
    headers: JSON_RESPONSE_HEADERS
  });
}

/**
 * Creates a response for data validation errors
 * @param field - The field that failed validation
 * @param requirement - The validation requirement that failed
 */
export function createValidationErrorResponse(field: string, requirement: string): Response {
  return new Response(JSON.stringify({
    success: false,
    error: `Invalid ${field}: ${requirement}`
  }), {
    status: 200,
    headers: JSON_RESPONSE_HEADERS
  });
}