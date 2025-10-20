// Helper function to get CORS headers with dynamic origin
export function getCorsHeaders(origin?: string): Record<string, string> {
  const allowedOrigins = [
    'https://trading-goose.github.io',
    'http://localhost:8080',
    'http://127.0.0.1:8080'
  ];

  const customOrigin = Deno.env.get('CORS_ORIGIN');
  if (customOrigin) {
    allowedOrigins.push(customOrigin);
  }

  // Check if the origin is allowed
  const isAllowedOrigin = !origin || allowedOrigins.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowedOrigin ? (origin || '*') : 'https://trading-goose.github.io',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Default CORS headers for backwards compatibility
export const corsHeaders = getCorsHeaders();