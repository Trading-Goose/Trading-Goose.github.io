import { JSON_RESPONSE_HEADERS, CORS_HEADERS } from './constants.ts';
/**
 * Shared response helper functions for rebalance coordinator
 */ export function createSuccessResponse(data, status = 200) {
  return new Response(JSON.stringify({
    success: true,
    ...data
  }), {
    status,
    headers: JSON_RESPONSE_HEADERS
  });
}
export function createErrorResponse(error, status = 200, details) {
  return new Response(JSON.stringify({
    success: false,
    error,
    ...details && {
      details
    }
  }), {
    status,
    headers: JSON_RESPONSE_HEADERS
  });
}
export function createCanceledResponse(message, canceled = true) {
  return new Response(JSON.stringify({
    success: false,
    message,
    canceled
  }), {
    status: 200,
    headers: JSON_RESPONSE_HEADERS
  });
}
export function createOptionsResponse() {
  return new Response('ok', {
    headers: CORS_HEADERS
  });
}
export function createMethodNotAllowedResponse() {
  return new Response(JSON.stringify({
    success: false,
    error: 'Method not allowed'
  }), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json'
    }
  });
}
