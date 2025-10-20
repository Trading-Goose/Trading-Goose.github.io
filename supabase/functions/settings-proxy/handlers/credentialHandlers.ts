import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createSuccessResponse, createErrorResponse } from '../utils/responseHelpers.ts';
import { maskCredential, isMaskedValue } from '../utils/credentialHelpers.ts';
import { getUserSettings } from '../utils/dbHelpers.ts';

export async function handleCheckCredentialsChanged(supabase: SupabaseClient, userId: string, body: any): Promise<Response> {
  const { alpacaPaperApiKey, alpacaPaperSecretKey, alpacaLiveApiKey, alpacaLiveSecretKey } = body;
  
  // Get current settings
  const { settings, error } = await getUserSettings(supabase, userId);
  
  if (error || !settings) {
    return createSuccessResponse({ 
      paperChanged: true, // If no settings, treat as new
      liveChanged: true,
      shouldValidatePaper: !!(alpacaPaperApiKey && alpacaPaperSecretKey),
      shouldValidateLive: !!(alpacaLiveApiKey && alpacaLiveSecretKey)
    });
  }
  
  // Check if paper credentials have changed
  let paperChanged = false;
  if (alpacaPaperApiKey && alpacaPaperSecretKey) {
    const currentPaperApiMasked = maskCredential(settings.alpaca_paper_api_key);
    const currentPaperSecretMasked = maskCredential(settings.alpaca_paper_secret_key);
    
    // Validate that if masked values are provided, they match the current masked values
    if (isMaskedValue(alpacaPaperApiKey) && alpacaPaperApiKey !== currentPaperApiMasked) {
      return createErrorResponse('Invalid masked paper API key. Please enter the actual API key or leave unchanged.');
    }
    if (isMaskedValue(alpacaPaperSecretKey) && alpacaPaperSecretKey !== currentPaperSecretMasked) {
      return createErrorResponse('Invalid masked paper secret key. Please enter the actual secret key or leave unchanged.');
    }
    
    paperChanged = (alpacaPaperApiKey !== currentPaperApiMasked) || (alpacaPaperSecretKey !== currentPaperSecretMasked);
  }
  
  // Check if live credentials have changed
  let liveChanged = false;
  if (alpacaLiveApiKey && alpacaLiveSecretKey) {
    const currentLiveApiMasked = maskCredential(settings.alpaca_live_api_key);
    const currentLiveSecretMasked = maskCredential(settings.alpaca_live_secret_key);
    
    // Validate that if masked values are provided, they match the current masked values
    if (isMaskedValue(alpacaLiveApiKey) && alpacaLiveApiKey !== currentLiveApiMasked) {
      return createErrorResponse('Invalid masked live API key. Please enter the actual API key or leave unchanged.');
    }
    if (isMaskedValue(alpacaLiveSecretKey) && alpacaLiveSecretKey !== currentLiveSecretMasked) {
      return createErrorResponse('Invalid masked live secret key. Please enter the actual secret key or leave unchanged.');
    }
    
    liveChanged = (alpacaLiveApiKey !== currentLiveApiMasked) || (alpacaLiveSecretKey !== currentLiveSecretMasked);
  }
  
  return createSuccessResponse({ 
    paperChanged,
    liveChanged,
    shouldValidatePaper: paperChanged && !!(alpacaPaperApiKey && alpacaPaperSecretKey),
    shouldValidateLive: liveChanged && !!(alpacaLiveApiKey && alpacaLiveSecretKey)
  });
}