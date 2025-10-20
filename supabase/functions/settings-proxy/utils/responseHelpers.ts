import { corsHeaders } from '../../_shared/cors.ts';

export const JSON_HEADERS = { ...corsHeaders, 'Content-Type': 'application/json' };

export function createJsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export function createErrorResponse(message: string, status: number = 400): Response {
  return createJsonResponse({ error: message }, status);
}

export function createSuccessResponse(data: any): Response {
  return createJsonResponse(data, 200);
}