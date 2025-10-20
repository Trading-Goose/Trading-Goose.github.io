// Helper function to mask credentials (show first 6 and last 6 characters)
export const maskCredential = (credential: string | null): string | null => {
  if (!credential || credential.length <= 8) {
    return credential ? '••••••••' : null;
  }
  const first6 = credential.substring(0, 6);
  const last6 = credential.substring(credential.length - 6);
  const middleLength = credential.length - 12;
  const maskedMiddle = '•'.repeat(Math.max(middleLength, 6));
  return `${first6}${maskedMiddle}${last6}`;
};

// Check if a value is masked
export const isMaskedValue = (value: any): boolean => {
  if (!value || typeof value !== 'string') return false;
  return value.includes('•') && value.length >= 8;
};

// Credential field names for batch operations
export const CREDENTIAL_FIELDS = [
  'ai_api_key',
  'openai_api_key',
  'anthropic_api_key',
  'google_api_key',
  'deepseek_api_key',
  'openrouter_api_key',
  'alpaca_paper_api_key',
  'alpaca_paper_secret_key',
  'alpaca_live_api_key',
  'alpaca_live_secret_key'
];

// Mask all credentials in settings object
export function maskAllCredentials(settings: any): any {
  if (!settings) return null;
  
  const masked = { ...settings };
  CREDENTIAL_FIELDS.forEach(field => {
    if (masked[field]) {
      masked[field] = maskCredential(masked[field]);
    }
  });
  
  return masked;
}

// Process settings to handle masked values during updates
export function processSettingsUpdate(newSettings: Record<string, any>, currentSettings: any): Record<string, any> | { error: string } {
  const processed: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(newSettings)) {
    // Skip if value is undefined (partial save support)
    if (value === undefined) continue;

    // Handle empty strings for credential fields (user is clearing the value)
    const isCredentialField = key.includes('api_key') || key.includes('secret_key');
    if (isCredentialField && value === '') {
      processed[key] = ''; // Keep empty string to clear the field
      continue;
    }
    
    // Handle null values for credential fields (user is clearing the value)
    if (isCredentialField && value === null) {
      processed[key] = ''; // Convert null to empty string for database
      continue;
    }

    // If the value is masked, check if it matches the current masked value
    if (isMaskedValue(value)) {
      const currentValue = currentSettings?.[key];
      const currentMasked = maskCredential(currentValue);

      // If the masked value matches the current masked value, don't update
      if (value === currentMasked) continue;
      
      // If masked value doesn't match, this is suspicious - reject with error
      // For credential fields, we should never accept a masked value that doesn't match
      if (isCredentialField) {
        console.error(`Rejecting suspicious masked credential for field ${key}`);
        return { 
          error: `Invalid masked value for ${key}. If you're trying to update credentials, please enter the actual API key, not a masked value.`
        };
      }
    }

    // Include the value for update only if it's not a suspicious masked value
    processed[key] = value;
  }
  
  return processed;
}