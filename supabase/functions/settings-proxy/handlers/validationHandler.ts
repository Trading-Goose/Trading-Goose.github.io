import { validateApiKey } from '../../_shared/apiValidator.ts';
import { createSuccessResponse, createJsonResponse } from '../utils/responseHelpers.ts';

export async function handleValidation(body: any): Promise<Response> {
  const { provider, apiKey, model, secretKey } = body;
  
  if (!provider || !apiKey) {
    return createJsonResponse({ 
      valid: false, 
      message: 'Missing provider or API key' 
    });
  }

  try {
    // Use real API validation (pass secretKey for Alpaca providers)
    const result = await validateApiKey(provider, apiKey, model, secretKey);
    return createSuccessResponse(result);
  } catch (error: any) {
    console.error('Validation error:', error);
    
    return createJsonResponse({ 
      valid: false, 
      message: `Validation failed: ${error.message}`,
      error: error.message
    });
  }
}