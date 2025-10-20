import { JSON_RESPONSE_HEADERS, CORS_HEADERS } from './constants.ts';

/**
 * Shared response helper functions to eliminate duplicate response creation patterns
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

export function createErrorResponse(
  message: string, 
  status: number = 200, // Use 200 for coordinator to ensure errors reach frontend
  details?: any
): Response {
  // Match settings-proxy error format: { error: message }
  return new Response(JSON.stringify({
    error: message,
    ...(details && { details })
  }), {
    status,
    headers: JSON_RESPONSE_HEADERS
  });
}

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

export function createOptionsResponse(): Response {
  return new Response('ok', { headers: CORS_HEADERS });
}

export function createMethodNotAllowedResponse(): Response {
  return new Response(JSON.stringify({
    error: 'Method not allowed'
  }), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json'
    }
  });
}