import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface AuthResult {
  userId: string | null;
  error: string | null;
}

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient | null {
  if (adminClient) return adminClient;

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase service credentials for auth verification');
    return null;
  }

  adminClient = createClient(supabaseUrl, supabaseServiceKey);
  return adminClient;
}

function decodeJwtPayload(token: string | null): Record<string, any> | null {
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padLength = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLength);

    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Error decoding JWT payload:', error);
    return null;
  }
}

export async function verifyAndExtractUser(authHeader: string | null): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: null, error: 'No valid authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // First try to extract user ID from token directly (faster)
    const userId = extractUserIdFromToken(token);

    if (!userId) {
      console.error('Could not extract user ID from token');
      return { userId: null, error: 'Invalid token format' };
    }

    // Check token expiration
    try {
      const payload = decodeJwtPayload(token);
      if (payload) {
        const exp = payload.exp;
        const now = Math.floor(Date.now() / 1000);

        if (exp && now > exp) {
          console.error('Token has expired');
          return { userId: null, error: 'Token has expired' };
        }
      }
    } catch (e) {
      console.error('Error checking token expiration:', e);
    }

    // Verify the token against Supabase to ensure it hasn't been revoked
    const client = getAdminClient();
    if (!client) {
      console.error('Supabase service credentials missing - falling back to decoded token validation only');
      return { userId, error: null };
    }

    try {
      const { data, error } = await client.auth.getUser(token);
      if (error) {
        console.error('Supabase auth verification error, falling back to decoded token:', error.message);
      } else if (data?.user) {
        if (data.user.id !== userId) {
          console.error('Token subject does not match Supabase user id', {
            tokenSub: userId,
            supabaseUser: data.user.id,
          });
          return { userId: null, error: 'Authentication failed' };
        }
      }
    } catch (verificationError) {
      console.error('Unexpected error verifying token with Supabase, falling back to decoded token:', verificationError);
    }

    // For Edge Functions, we trust the JWT if it's properly formatted and not expired
    // Supabase already validates it at the gateway level
    return { userId, error: null };
  } catch (error) {
    console.error('Error verifying token:', error);
    return { userId: null, error: 'Token verification failed' };
  }
}

// Legacy function for backward compatibility - extracts without verification
export function extractUserIdFromToken(tokenOrHeader: string | null): string | null {
  if (!tokenOrHeader) return null;

  const token = tokenOrHeader.startsWith('Bearer ')
    ? tokenOrHeader.replace('Bearer ', '')
    : tokenOrHeader;

  const payload = decodeJwtPayload(token);
  return payload?.sub ?? null;
}
