/**
 * Real API validation by making actual test calls to providers
 */

// Simple test prompt to validate API connectivity
const TEST_PROMPT = "Hello";
const TEST_SYSTEM_PROMPT = "You are a helpful assistant. Respond with just 'OK' to confirm the API is working.";

export interface ValidationResult {
  valid: boolean;
  message: string;
  responseTime?: number;
  error?: string;
}

export async function validateApiKey(provider: string, apiKey: string, model?: string, secretKey?: string): Promise<ValidationResult> {
  const startTime = Date.now();
  
  try {
    // Validate basic format first
    const formatResult = validateApiKeyFormat(provider, apiKey);
    if (!formatResult.valid) {
      return formatResult;
    }

    // Create test API settings
    const testApiSettings = {
      ai_provider: provider,
      ai_api_key: apiKey,
      ai_model: model || getDefaultModel(provider)
    };

    // Make actual API call with short timeout
    let response: string;
    
    switch (provider) {
      case 'openai':
      case 'deepseek':
      case 'openrouter':
        response = await testOpenAICompatible(testApiSettings);
        break;
      case 'anthropic':
        response = await testAnthropic(testApiSettings);
        break;
      case 'google':
        response = await testGoogle(testApiSettings);
        break;
      case 'alpaca_paper':
      case 'alpaca_live':
        if (!secretKey) {
          return { valid: false, message: 'Alpaca validation requires both API key and secret key' };
        }
        response = await testAlpaca(provider, apiKey, secretKey);
        break;
      default:
        return { valid: false, message: 'Unsupported provider for validation' };
    }

    const responseTime = Date.now() - startTime;
    
    // Simple check that we got some response
    if (response && response.trim().length > 0) {
      return {
        valid: true,
        message: `${provider} API key is valid and working`,
        responseTime
      };
    } else {
      return {
        valid: false,
        message: `${provider} API returned empty response`,
        responseTime
      };
    }

  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    // Parse common error types
    let errorMessage = error.message || 'Unknown error';
    
    if (errorMessage.includes('401')) {
      return {
        valid: false,
        message: `Invalid ${provider} API key - authentication failed`,
        responseTime,
        error: errorMessage
      };
    }
    
    if (errorMessage.includes('403')) {
      return {
        valid: false,
        message: `${provider} API key lacks required permissions`,
        responseTime,
        error: errorMessage
      };
    }
    
    if (errorMessage.includes('429')) {
      return {
        valid: false,
        message: `${provider} API rate limit exceeded - key might be valid but currently throttled`,
        responseTime,
        error: errorMessage
      };
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
      return {
        valid: false,
        message: `${provider} API request timed out - network or server issue`,
        responseTime,
        error: errorMessage
      };
    }
    
    return {
      valid: false,
      message: `${provider} API validation failed: ${errorMessage}`,
      responseTime,
      error: errorMessage
    };
  }
}

// Format validation fallback
function validateApiKeyFormat(provider: string, apiKey: string): ValidationResult {
  switch (provider) {
    case 'openai':
      const validOpenAI = apiKey.startsWith('sk-') && apiKey.length > 20;
      return {
        valid: validOpenAI,
        message: validOpenAI ? 'Valid OpenAI API key format' : 'Invalid OpenAI API key format (should start with sk-)'
      };
    case 'anthropic':
      const validAnthropic = apiKey.startsWith('sk-ant-') && apiKey.length > 20;
      return {
        valid: validAnthropic,
        message: validAnthropic ? 'Valid Anthropic API key format' : 'Invalid Anthropic API key format (should start with sk-ant-)'
      };
    case 'google':
      const validGoogle = apiKey.length === 39 && /^[A-Za-z0-9_-]+$/.test(apiKey);
      return {
        valid: validGoogle,
        message: validGoogle ? 'Valid Google API key format' : 'Invalid Google API key format'
      };
    case 'deepseek':
      const validDeepSeek = apiKey.startsWith('sk-') && apiKey.length > 20;
      return {
        valid: validDeepSeek,
        message: validDeepSeek ? 'Valid DeepSeek API key format' : 'Invalid DeepSeek API key format'
      };
    case 'openrouter':
      const validOpenRouter = apiKey.startsWith('sk-or-') && apiKey.length > 20;
      return {
        valid: validOpenRouter,
        message: validOpenRouter ? 'Valid OpenRouter API key format' : 'Invalid OpenRouter API key format (should start with sk-or-)'
      };
    case 'alpaca_paper':
    case 'alpaca_live':
      const validAlpaca = apiKey.length > 10 && /^[A-Za-z0-9]+$/.test(apiKey);
      return {
        valid: validAlpaca,
        message: validAlpaca ? 'Valid Alpaca key format' : 'Invalid Alpaca key format'
      };
    default:
      return { valid: false, message: 'Unknown provider' };
  }
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'gpt-3.5-turbo';
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    case 'google':
      return 'gemini-pro';
    case 'deepseek':
      return 'deepseek-chat';
    case 'openrouter':
      return 'anthropic/claude-3-haiku';
    default:
      return '';
  }
}

function getApiEndpoint(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
    case 'deepseek':
      return 'https://api.deepseek.com/v1/chat/completions';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1/chat/completions';
    default:
      return 'https://api.openai.com/v1/chat/completions';
  }
}

function getHeaders(provider: string, apiKey: string): Record<string, string> {
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  if (provider === 'openrouter') {
    return {
      ...baseHeaders,
      'HTTP-Referer': 'https://trading-goose.github.io',
      'X-Title': 'TradingGoose'
    };
  }

  return baseHeaders;
}

// Unified OpenAI-compatible test function for openai, deepseek, and openrouter
async function testOpenAICompatible(apiSettings: any): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
  
  try {
    const endpoint = getApiEndpoint(apiSettings.ai_provider);
    const headers = getHeaders(apiSettings.ai_provider, apiSettings.ai_api_key);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: apiSettings.ai_model,
        messages: [
          { role: 'system', content: TEST_SYSTEM_PROMPT },
          { role: 'user', content: TEST_PROMPT }
        ],
        temperature: 0,
        max_tokens: 10
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${apiSettings.ai_provider} API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    if (!result.choices || result.choices.length === 0) {
      throw new Error(`${apiSettings.ai_provider} returned no choices in response`);
    }

    const content = result.choices[0].message?.content || result.choices[0].message?.reasoning || '';
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function testAnthropic(apiSettings: any): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiSettings.ai_api_key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: apiSettings.ai_model,
        messages: [{ role: 'user', content: TEST_PROMPT }],
        system: TEST_SYSTEM_PROMPT,
        max_tokens: 10
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return result.content[0].text;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function testGoogle(apiSettings: any): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiSettings.ai_model}:generateContent?key=${apiSettings.ai_api_key}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${TEST_SYSTEM_PROMPT}\n\n${TEST_PROMPT}`
          }]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 10
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google AI API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function testAlpaca(provider: string, apiKey: string, secretKey: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    // Determine the correct API endpoint
    const baseUrl = provider === 'alpaca_paper' 
      ? 'https://paper-api.alpaca.markets' 
      : 'https://api.alpaca.markets';
    
    const response = await fetch(`${baseUrl}/v2/account`, {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Alpaca API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    // Return account ID as confirmation
    return `Account validated: ${result.id || 'Unknown'}`;
  } finally {
    clearTimeout(timeoutId);
  }
}