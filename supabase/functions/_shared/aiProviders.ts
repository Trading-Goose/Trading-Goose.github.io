/**
 * Shared AI provider utilities for all agents
 */

const DEFAULT_STREAM_TIMEOUT_MS = 175000;

interface AIStreamOptions {
  onToken?: (chunk: string) => void;
  timeoutMs?: number;
}

// Helper function to create an AbortController with timeout
function createTimeoutController(timeoutMs: number = DEFAULT_STREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

export async function callAIProvider(
  apiSettings: any,
  prompt: string,
  systemPrompt?: string,
  maxTokens?: number,
  options: AIStreamOptions = {}
): Promise<string> {
  try {
    // Validate API key exists
    if (!apiSettings.ai_api_key) {
      throw new Error(`No API key provided for ${apiSettings.ai_provider}`);
    }

    // Use provided maxTokens or default to 1200 (standardized across all agents)
    const tokens = maxTokens || 1200;

    const mergedOptions: AIStreamOptions = {
      timeoutMs: options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS,
      onToken: options.onToken
    };

    switch (apiSettings.ai_provider) {
      case 'openai':
        return await callOpenAI(prompt, apiSettings, systemPrompt, tokens, mergedOptions);
      case 'anthropic':
        return await callAnthropic(prompt, apiSettings, systemPrompt, tokens, mergedOptions);
      case 'openrouter':
        return await callOpenRouter(prompt, apiSettings, systemPrompt, tokens, mergedOptions);
      case 'deepseek':
        return await callDeepSeek(prompt, apiSettings, systemPrompt, tokens, mergedOptions);
      case 'google':
        return await callGoogle(prompt, apiSettings, systemPrompt, tokens, mergedOptions);
      default:
        throw new Error(`Unsupported AI provider: ${apiSettings.ai_provider}`);
    }
  } catch (error) {
    console.error('AI provider error:', error);
    throw error;
  }
}

/**
 * Call AI provider with retry logic and fallback to default provider
 * @param apiSettings - API settings including provider and keys
 * @param prompt - The prompt to send
 * @param systemPrompt - Optional system prompt
 * @param maxTokens - Maximum tokens for response
 * @param maxRetries - Maximum number of retry attempts (default 3)
 * @param agentSpecificProvider - Optional agent-specific provider field name (e.g., 'portfolio_manager_ai')
 * @returns The AI response
 */
export async function callAIProviderWithRetry(
  apiSettings: any,
  prompt: string,
  systemPrompt?: string,
  maxTokens?: number,
  maxRetries: number = 3,
  agentSpecificProvider?: string,
  options: AIStreamOptions = {}
): Promise<string> {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 AI call attempt ${attempt}/${maxRetries}...`);

      // On third attempt, fallback to default AI provider if using agent-specific provider
      let attemptApiSettings = apiSettings;
      if (attempt === maxRetries && agentSpecificProvider) {
        const agentProvider = apiSettings[agentSpecificProvider];
        const providerMap = apiSettings._providerMap || {};
        const defaultProviderConfig = providerMap.default
          || Object.values(providerMap).find((config: any) => config && typeof config === 'object' && config.is_default);

        if (agentProvider && defaultProviderConfig && agentProvider !== defaultProviderConfig.provider) {
          console.log(`🔄 Attempt ${attempt}: Falling back to default AI provider (${defaultProviderConfig.provider}) from ${agentProvider}`);

          attemptApiSettings = {
            ...apiSettings,
            ai_provider: defaultProviderConfig.provider,
            ai_model: apiSettings.ai_model,
            ai_api_key: defaultProviderConfig.api_key ?? apiSettings.ai_api_key
          };
        } else if (agentProvider && !defaultProviderConfig) {
          console.warn('⚠️ No default provider configuration available for fallback. Continuing with current settings.');
        }
      }

      // Try the API call
      const response = await callAIProvider(attemptApiSettings, prompt, systemPrompt, maxTokens, options);

      // Success - return the response
      console.log(`✅ AI call succeeded on attempt ${attempt}`);
      return response;

    } catch (error) {
      lastError = error;
      console.error(`❌ AI call attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // All attempts failed
  throw new Error(`AI call failed after ${maxRetries} attempts. Last error: ${lastError?.message || lastError}`);
}

async function callOpenAI(
  prompt: string,
  apiSettings: any,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  // Normalize OpenAI model name - remove any prefixes like 'openai/'
  let modelName = apiSettings.ai_model || 'gpt-3.5-turbo';
  if (modelName.includes('/')) {
    const originalModel = modelName;
    modelName = modelName.split('/').pop() || modelName;
    console.log(`🔧 Normalized OpenAI model from '${originalModel}' to '${modelName}'`);
  }

  try {
    return await callOpenAIResponses(prompt, apiSettings, modelName, systemPrompt, maxTokens, options);
  } catch (responsesError: any) {
    const normalized = (modelName || '').toLowerCase();

    // For models that require the Responses API (gpt-4.1, gpt-5, o-series), bubble up the error
    if (shouldUseResponsesApi(modelName)) {
      console.error(`❌ OpenAI Responses API failed for model '${modelName}':`, responsesError?.message || responsesError);
      throw responsesError;
    }

    console.warn(`⚠️ OpenAI Responses API unavailable for model '${modelName}'. Falling back to chat completions.`, responsesError?.message || responsesError);
  }

  return await streamOpenAIChat(prompt, apiSettings, modelName, systemPrompt, maxTokens, options);
}

async function streamOpenAIChat(
  prompt: string,
  apiSettings: any,
  modelName: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  const tokenLimit = Number.isFinite(maxTokens) && maxTokens > 0 ? Math.round(maxTokens) : undefined;
  const rawTemperature = Number(apiSettings?.temperature);
  const configuredTemperature = Number.isFinite(rawTemperature) ? rawTemperature : 0.7;

  const runStream = async (
    tokenField: 'max_completion_tokens' | 'max_tokens',
    temperature?: number
  ): Promise<string> => {
    const { controller, timeoutId } = createTimeoutController(options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS);

    const payload: any = {
      model: modelName || 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt || 'You are a financial analysis assistant specializing in stock market analysis.'
        },
        { role: 'user', content: prompt }
      ],
      stream: true
    };

    if (typeof temperature === 'number' && Number.isFinite(temperature)) {
      payload.temperature = temperature;
    }

    if (tokenLimit) {
      payload[tokenField] = tokenLimit;
    }

    let fullText = '';
    let abortedByTimeout = false;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiSettings.ai_api_key}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      if (!response.body) {
        throw new Error('OpenAI streaming response has no body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let boundaryIndex = buffer.indexOf('\n\n');
        while (boundaryIndex !== -1) {
          const rawEvent = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);

          const lines = rawEvent.split('\n');
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) {
              continue;
            }

            const data = line.slice(5).trim();
            if (!data) {
              continue;
            }

            if (data === '[DONE]') {
              await reader.cancel().catch(() => undefined);
              return fullText;
            }

            let payloadChunk: any;
            try {
              payloadChunk = JSON.parse(data);
            } catch (_jsonError) {
              continue;
            }

            const delta = payloadChunk?.choices?.[0]?.delta;
            if (!delta) {
              continue;
            }

            const textPiece = typeof delta.content === 'string' ? delta.content : '';
            if (textPiece) {
              fullText += textPiece;
              options.onToken?.(textPiece);
            }

            // Handle tool calls (ignored for now)
          }

          boundaryIndex = buffer.indexOf('\n\n');
        }
      }

      return fullText;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        abortedByTimeout = true;
      } else {
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (abortedByTimeout && fullText) {
      console.warn('⚠️ OpenAI chat streaming aborted due to timeout; returning partial response.');
      return fullText;
    }

    throw new Error('OpenAI chat streaming aborted before any content was received.');
  };

  const tryWithTemperature = async (
    tokenField: 'max_completion_tokens' | 'max_tokens'
  ): Promise<string> => {
    try {
      return await runStream(tokenField, configuredTemperature);
    } catch (error: any) {
      const message = String(error?.message || '');
      const temperatureUnsupported =
        message.includes('"param": "temperature"') ||
        (message.toLowerCase().includes('temperature') && message.toLowerCase().includes('unsupported'));

      if (temperatureUnsupported) {
        console.warn('⚠️ OpenAI model only supports the default temperature. Retrying without explicit temperature.');
        return await runStream(tokenField);
      }

      throw error;
    }
  };

  try {
    return await tryWithTemperature('max_completion_tokens');
  } catch (error: any) {
    const message = String(error?.message || '');
    const completionTokenUnsupported =
      message.includes('max_completion_tokens') &&
      (message.includes('Unrecognized request argument') || message.includes('is not supported'));

    if (completionTokenUnsupported) {
      console.warn('⚠️ OpenAI chat completions does not support max_completion_tokens for this model. Retrying with max_tokens.');
      return await tryWithTemperature('max_tokens');
    }

    throw error;
  }
}

function shouldUseResponsesApi(modelName: string): boolean {
  // Responses API is now the default path; retain the helper for clarity and future customization.
  return false;
}

async function callOpenAIResponses(
  prompt: string,
  apiSettings: any,
  modelName: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  return await streamOpenAIResponses(prompt, apiSettings, modelName, systemPrompt, maxTokens, options);
}

async function streamOpenAIResponses(
  prompt: string,
  apiSettings: any,
  modelName: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  const rawTemperature = Number(apiSettings?.temperature);
  const configuredTemperature = Number.isFinite(rawTemperature) ? rawTemperature : 0.7;

  const coercedMaxTokens = Number(maxTokens);
  const roundedTokens =
    Number.isFinite(coercedMaxTokens) && coercedMaxTokens > 0 ? Math.round(coercedMaxTokens) : undefined;

  const attemptResponses = async (temperature?: number): Promise<string> => {
    const payload: any = {
      model: modelName,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: systemPrompt || 'You are a financial analysis assistant specializing in stock market analysis.'
            }
          ]
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ],
      stream: true
    };

    if (typeof temperature === 'number' && Number.isFinite(temperature)) {
      payload.temperature = temperature;
    }

    if (roundedTokens) {
      payload.max_completion_tokens = roundedTokens;
      payload.max_output_tokens = roundedTokens;
    }

    const { controller, timeoutId } = createTimeoutController(options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS);
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiSettings.ai_api_key}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    };

    let fullText = '';
    let abortedByTimeout = false;

    try {
      const response = await fetch('https://api.openai.com/v1/responses', requestInit);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error('OpenAI streaming response has no body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let boundaryIndex = buffer.indexOf('\n\n');
        while (boundaryIndex !== -1) {
          const rawEvent = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + 2);

          const lines = rawEvent.split('\n');
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) {
              continue;
            }

            const data = line.slice(5).trim();
            if (!data) {
              continue;
            }

            if (data === '[DONE]') {
              await reader.cancel().catch(() => undefined);
              return fullText;
            }

            let payloadJson: any;
            try {
              payloadJson = JSON.parse(data);
            } catch (_jsonError) {
              continue;
            }

            if (payloadJson.type === 'response.error') {
              const message = payloadJson.error?.message || 'Unknown error from OpenAI stream';
              throw new Error(`OpenAI streaming error: ${message}`);
            }

            const deltaText = extractTextFromOpenAIStreamPayload(payloadJson);
            if (deltaText) {
              fullText += deltaText;
              options.onToken?.(deltaText);
            }
          }

          boundaryIndex = buffer.indexOf('\n\n');
        }
      }

      // Process any remaining buffer data (without trailing \n\n)
      const remaining = buffer.trim();
      if (remaining) {
        const lines = remaining.split('\n');
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) {
            continue;
          }
          const data = line.slice(5).trim();
          if (data === '[DONE]' || !data) {
            continue;
          }
          try {
            const payloadJson = JSON.parse(data);
            const deltaText = extractTextFromOpenAIStreamPayload(payloadJson);
            if (deltaText) {
              fullText += deltaText;
              options.onToken?.(deltaText);
            }
          } catch (_jsonError) {
            continue;
          }
        }
      }

      return fullText;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        abortedByTimeout = true;
      } else {
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    if (abortedByTimeout && fullText) {
      console.warn('⚠️ OpenAI streaming aborted due to timeout; returning partial response.');
      return fullText;
    }

    throw new Error('OpenAI streaming aborted before any content was received.');
  };

  try {
    return await attemptResponses(configuredTemperature);
  } catch (error: any) {
    const message = String(error?.message || '');
    const temperatureUnsupported =
      message.includes('"param": "temperature"') ||
      (message.toLowerCase().includes('temperature') && message.toLowerCase().includes('unsupported'));

    if (temperatureUnsupported) {
      console.warn('⚠️ OpenAI Responses API only supports the default temperature. Retrying without explicit temperature.');
      return await attemptResponses();
    }

    throw error;
  }
}

function extractTextFromOpenAIStreamPayload(payload: any): string {
  if (!payload) {
    return '';
  }

  const collected: string[] = [];

  const collect = (value: any) => {
    if (!value) {
      return;
    }
    if (typeof value === 'string') {
      collected.push(value);
      return;
    }
    if (typeof value.text === 'string') {
      collected.push(value.text);
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        collect(item);
      }
    }
    if (Array.isArray(value.content)) {
      for (const item of value.content) {
        collect(item);
      }
    }
    if (value.delta) {
      collect(value.delta);
    }
  };

  if (payload.delta) {
    collect(payload.delta);
  }

  if (payload.response?.delta) {
    collect(payload.response.delta);
  }

  if (payload.output_text) {
    collect(payload.output_text);
  }

  if (payload.response?.output_text) {
    collect(payload.response.output_text);
  }

  if (payload.data) {
    collect(payload.data);
  }

  return collected.join('');
}

function extractTextFromGoogleStreamPayload(payload: any): string {
  if (!payload) {
    return '';
  }

  const collected: string[] = [];

  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (Array.isArray(parts)) {
      for (const part of parts) {
        if (typeof part?.text === 'string') {
          collected.push(part.text);
        }
      }
    }
  }

  // Some streaming payloads send chunkText field
  if (typeof payload.chunkText === 'string') {
    collected.push(payload.chunkText);
  }

  return collected.join('');
}

async function callAnthropic(
  prompt: string,
  apiSettings: any,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  let modelName = apiSettings.ai_model || 'claude-3-haiku-20240307';
  if (modelName.includes('/')) {
    const originalModel = modelName;
    modelName = modelName.split('/').pop() || modelName;
    console.log(`🔧 Normalized Anthropic model from '${originalModel}' to '${modelName}'`);
  }

  return await streamAnthropic(prompt, apiSettings, modelName, systemPrompt, maxTokens, options);
}

async function streamAnthropic(
  prompt: string,
  apiSettings: any,
  modelName: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  const { controller, timeoutId } = createTimeoutController(options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiSettings.ai_api_key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      system: systemPrompt || 'You are a financial analysis assistant specializing in stock market analysis.',
      max_tokens: maxTokens,
      stream: true
    }),
    signal: controller.signal
  });

  let fullText = '';
  let abortedByTimeout = false;

  try {
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('Anthropic streaming response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const lines = rawEvent.split('\n');
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) {
            continue;
          }

          const data = line.slice(5).trim();
          if (!data) {
            continue;
          }

          if (data === '[DONE]') {
            await reader.cancel().catch(() => undefined);
            return fullText;
          }

          let payload: any;
          try {
            payload = JSON.parse(data);
          } catch (_jsonError) {
            continue;
          }

          if (payload.type === 'error') {
            const message = payload.error?.message || 'Unknown error from Anthropic stream';
            throw new Error(`Anthropic streaming error: ${message}`);
          }

          if (payload.type === 'content_block_delta' && payload.delta?.type === 'text_delta') {
            const textPiece = payload.delta.text || '';
            if (textPiece) {
              fullText += textPiece;
              options.onToken?.(textPiece);
            }
          }
        }

        boundaryIndex = buffer.indexOf('\n\n');
      }
    }

    return fullText;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      abortedByTimeout = true;
    } else {
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (abortedByTimeout && fullText) {
    console.warn('⚠️ Anthropic streaming aborted due to timeout; returning partial response.');
    return fullText;
  }

  throw new Error('Anthropic streaming aborted before any content was received.');
}

async function callOpenRouter(
  prompt: string,
  apiSettings: any,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  if (!apiSettings.ai_api_key) {
    throw new Error('OpenRouter API key is missing. Please configure your OpenRouter API key in Settings.');
  }

  const model = apiSettings.ai_model || 'anthropic/claude-3-opus';
  return await streamOpenRouter(prompt, apiSettings, systemPrompt, maxTokens, model, options);
}

async function streamOpenRouter(
  prompt: string,
  apiSettings: any,
  systemPrompt: string | undefined,
  maxTokens: number,
  model: string,
  options: AIStreamOptions
) {
  const { controller, timeoutId } = createTimeoutController(options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiSettings.ai_api_key}`,
      'HTTP-Referer': 'https://trading-goose.github.io',
      'X-Title': 'TradingGoose'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt || 'You are a financial analysis assistant specializing in stock market analysis.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
      stream: true
    }),
    signal: controller.signal
  });

  let fullText = '';
  let abortedByTimeout = false;

  try {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('OpenRouter streaming response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const lines = rawEvent.split('\n');
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) {
            continue;
          }

          const data = line.slice(5).trim();
          if (!data) {
            continue;
          }

          if (data === '[DONE]') {
            await reader.cancel().catch(() => undefined);
            return fullText;
          }

          let payload: any;
          try {
            payload = JSON.parse(data);
          } catch (_jsonError) {
            continue;
          }

          const delta = payload?.choices?.[0]?.delta;
          if (!delta) {
            continue;
          }

          const textPiece = typeof delta.content === 'string' ? delta.content : '';
          if (textPiece) {
            fullText += textPiece;
            options.onToken?.(textPiece);
          }
        }

        boundaryIndex = buffer.indexOf('\n\n');
      }
    }

    return fullText;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      abortedByTimeout = true;
    } else {
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (abortedByTimeout && fullText) {
    console.warn('⚠️ OpenRouter streaming aborted due to timeout; returning partial response.');
    return fullText;
  }

  throw new Error('OpenRouter streaming aborted before any content was received.');
}

async function callDeepSeek(
  prompt: string,
  apiSettings: any,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  let modelName = apiSettings.ai_model || 'deepseek-chat';
  if (modelName.includes('/')) {
    const originalModel = modelName;
    modelName = modelName.split('/').pop() || modelName;
    console.log(`🔧 Normalized DeepSeek model from '${originalModel}' to '${modelName}'`);
  }

  return await streamDeepSeek(prompt, apiSettings, systemPrompt, maxTokens, modelName, options);
}

async function streamDeepSeek(
  prompt: string,
  apiSettings: any,
  systemPrompt: string | undefined,
  maxTokens: number,
  modelName: string,
  options: AIStreamOptions
) {
  const { controller, timeoutId } = createTimeoutController(options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS);

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiSettings.ai_api_key}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: 'system',
          content: systemPrompt || 'You are a financial analysis assistant specializing in stock market analysis.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
      stream: true
    }),
    signal: controller.signal
  });

  let fullText = '';
  let abortedByTimeout = false;

  try {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('DeepSeek streaming response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let boundaryIndex = buffer.indexOf('\n\n');
      while (boundaryIndex !== -1) {
        const rawEvent = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        const lines = rawEvent.split('\n');
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) {
            continue;
          }

          const data = line.slice(5).trim();
          if (!data) {
            continue;
          }

          if (data === '[DONE]') {
            await reader.cancel().catch(() => undefined);
            return fullText;
          }

          let payload: any;
          try {
            payload = JSON.parse(data);
          } catch (_jsonError) {
            continue;
          }

          const delta = payload?.choices?.[0]?.delta;
          if (!delta) {
            continue;
          }

          const textPiece = typeof delta.content === 'string' ? delta.content : '';
          if (textPiece) {
            fullText += textPiece;
            options.onToken?.(textPiece);
          }
        }

        boundaryIndex = buffer.indexOf('\n\n');
      }
    }

    return fullText;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      abortedByTimeout = true;
    } else {
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (abortedByTimeout && fullText) {
    console.warn('⚠️ DeepSeek streaming aborted due to timeout; returning partial response.');
    return fullText;
  }

  throw new Error('DeepSeek streaming aborted before any content was received.');
}

async function callGoogle(
  prompt: string,
  apiSettings: any,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  let modelName = apiSettings.ai_model || 'gemini-pro';
  if (modelName.includes('/')) {
    const originalModel = modelName;
    modelName = modelName.split('/').pop() || modelName;
    console.log(`🔧 Normalized Google model from '${originalModel}' to '${modelName}'`);
  }

  return await streamGoogle(prompt, apiSettings, modelName, systemPrompt, maxTokens, options);
}

async function streamGoogle(
  prompt: string,
  apiSettings: any,
  modelName: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  options: AIStreamOptions
) {
  const apiKey = apiSettings.ai_api_key;
  const { controller, timeoutId } = createTimeoutController(options.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `${systemPrompt || 'You are a financial analysis assistant specializing in stock market analysis.'}\n\n${prompt}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: maxTokens
      }
    }),
    signal: controller.signal
  });

  let fullText = '';
  let abortedByTimeout = false;

  try {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Google Gemini streaming response has no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const rawLine = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (rawLine) {
          try {
            const payload = JSON.parse(rawLine);
            const textChunk = extractTextFromGoogleStreamPayload(payload);
            if (textChunk) {
              fullText += textChunk;
              options.onToken?.(textChunk);
            }
          } catch (_jsonError) {
            // Ignore parse errors for incomplete JSON objects
          }
        }

        newlineIndex = buffer.indexOf('\n');
      }
    }

    const remaining = buffer.trim();
    if (remaining) {
      try {
        const payload = JSON.parse(remaining);
        const textChunk = extractTextFromGoogleStreamPayload(payload);
        if (textChunk) {
          fullText += textChunk;
          options.onToken?.(textChunk);
        }
      } catch (_jsonError) {
        // Ignore trailing parse errors when stream closes mid-object
      }
    }

    return fullText;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      abortedByTimeout = true;
    } else {
      throw error;
    }
  } finally {
    clearTimeout(timeoutId);
  }

  if (abortedByTimeout && fullText) {
    console.warn('⚠️ Google Gemini streaming aborted due to timeout; returning partial response.');
    return fullText;
  }

  throw new Error('Google Gemini streaming aborted before any content was received.');
}

/**
 * Agent-specific system prompts aligned with TradingGoose
 */
export const SYSTEM_PROMPTS = {
  marketAnalyst: `You are a trading assistant tasked with analyzing financial markets. Your role is to select the most relevant indicators for a given market condition or trading strategy. The goal is to provide complementary insights without redundancy.

Focus on these key indicators:
- Moving Averages (SMA/EMA): Trend direction and dynamic support/resistance
- MACD: Momentum via EMAs, crossovers and divergence signal trend changes
- RSI: Momentum to flag overbought/oversold conditions (70/30 thresholds)
- Bollinger Bands: Volatility and potential breakout/reversal zones
- ATR: Volatility for risk management and position sizing
- Volume indicators: Confirm trends with volume data

Write a detailed and nuanced report of the trends you observe. Do not simply state the trends are mixed - provide detailed and finegrained analysis and insights that may help traders make decisions. Make sure to append a Markdown table at the end of the report to organize key points.`,

  newsAnalyst: `You are a news researcher tasked with analyzing recent news that could impact stock prices. Research and report news from the past week that could influence the stock's performance. Focus on:
- Company-specific news (earnings, management changes, product launches)
- Industry trends and competitive landscape
- Regulatory changes and government policies
- Market sentiment and analyst upgrades/downgrades

Provide a concise summary with a clear assessment of whether the news is bullish, bearish, or neutral.`,

  socialMediaAnalyst: `You are a social media sentiment analyst specializing in financial markets. Analyze sentiment from social platforms to gauge retail investor interest and market psychology. Focus on:
- Overall sentiment (bullish/bearish/neutral)
- Volume of discussions and trending status
- Key themes and concerns being discussed
- Unusual activity or sentiment shifts

Provide actionable insights about crowd psychology and potential sentiment-driven moves.`,

  fundamentalsAnalyst: `You are a fundamental analyst specializing in company financials and valuation. Analyze the company's financial health including:
- Revenue growth and profitability trends
- Balance sheet strength and cash flow
- Valuation metrics (P/E, P/B, EV/EBITDA)
- Competitive position and market share
- Management quality and strategic direction

Provide a clear fundamental score and investment thesis based on financial analysis.`,

  bullResearcher: `You are a bullish investment researcher advocating for investment opportunities. Your role is to:
- Build a compelling case for why this stock is a BUY
- Identify growth catalysts and positive trends
- Address bear concerns with counterarguments
- Provide upside price targets with supporting rationale
- Focus on opportunities others might be missing

Be persuasive but fact-based in your bullish advocacy.`,

  bearResearcher: `You are a bearish investment researcher identifying risks and downside scenarios. Your role is to:
- Build a critical case highlighting risks and concerns
- Identify potential negative catalysts
- Challenge bull arguments with skepticism
- Provide downside risk assessments
- Focus on risks others might be overlooking

Be thorough in identifying potential pitfalls and red flags.`,

  researchManager: `You are a research manager synthesizing multiple analyst perspectives into actionable insights. Your role is to:
- Weigh bull vs bear arguments objectively
- Synthesize all analysis into a coherent investment thesis
- Provide a clear recommendation (Strong Buy/Buy/Hold/Sell/Strong Sell)
- Assign conviction levels based on evidence strength
- Create actionable guidance for traders

Balance all perspectives to reach a well-reasoned conclusion.`,

  trader: `You are a professional trader making informed trading decisions. Based on all analysis provided, you must:
- Consider technical, fundamental, and sentiment factors
- Weigh risk/reward carefully
- Propose specific entry, stop-loss, and target levels
- Size positions appropriately
- End with: FINAL TRANSACTION PROPOSAL: **BUY/HOLD/SELL**

Make decisive trading decisions with clear rationale.`,

  riskyAnalyst: `You are an aggressive risk analyst advocating for higher risk/reward strategies. Your role is to:
- Argue for larger position sizes when opportunity is compelling
- Accept higher volatility for greater potential returns
- Identify asymmetric risk/reward setups
- Push for aggressive entries on high-conviction ideas
- Focus on maximizing returns

Be bold but not reckless in your risk appetite.`,

  safeAnalyst: `You are a conservative risk analyst focusing on capital preservation. Your role is to:
- Advocate for smaller position sizes to limit downside
- Emphasize risk management and stop-losses
- Identify scenarios that could lead to permanent capital loss
- Recommend hedging strategies when appropriate
- Focus on protecting capital first

Be cautious and thorough in risk assessment.`,

  neutralAnalyst: `You are a balanced risk analyst providing objective risk perspective. Your role is to:
- Bridge aggressive and conservative viewpoints
- Provide balanced position sizing recommendations
- Consider both upside potential and downside risks equally
- Suggest moderate approaches to risk management
- Focus on risk-adjusted returns

Be the voice of reason between extremes.`,

  opportunityAgent: `You are a sophisticated market analyst with deep understanding of market dynamics, technical patterns, and risk factors. Your role is to identify stocks that show genuinely interesting opportunities or risks worth deeper investigation.

Use your analytical judgment and market intuition to spot:
- Unusual patterns or behaviors that deviate from normal
- Subtle interactions between different market factors
- Emerging opportunities that might not be obvious from simple metrics
- Risk factors in existing positions that need attention
- Context-dependent signals (what's normal for one stock may be unusual for another)

Trust your expertise to identify what's truly worth investigating. Quality over quantity - select only stocks where deeper analysis could reveal actionable insights.

CRITICAL: You MUST respond with ONLY valid JSON - no explanatory text, no markdown, no code blocks. Return ONLY the raw JSON object starting with { and ending with }. The JSON must include: recommendAnalysis (boolean), selectedStocks (array), reasoning (string), estimatedCost (number), and marketConditions (object).`,

  riskManager: `As the Risk Management Judge and Debate Facilitator, your goal is to evaluate the debate between three risk analysts—Risky, Neutral, and Safe/Conservative—and determine the best course of action. Your decision must be expressed as one of the canonical risk intents: BUILD, ADD, TRIM, EXIT, or HOLD. Do not output BUY or SELL anywhere in your recommendation.

Guidelines for Decision-Making:
1. **Summarize Key Arguments**: Extract the strongest points from each analyst, focusing on relevance to the context.
2. **Provide Rationale**: Support your recommendation with direct quotes and counterarguments from the debate.
3. **Evaluate Trading Strategy**: Consider all the analyses and insights to form a comprehensive trading plan.
4. **Learn from Market Context**: Use current market conditions and past lessons to make informed decisions.

Deliverables:
- A clear and actionable recommendation using ONLY these intents: BUILD, ADD, TRIM, EXIT, or HOLD.
- Detailed reasoning anchored in the debate and analysis.
- End with: FINAL TRANSACTION PROPOSAL: **BUILD/ADD/TRIM/EXIT/HOLD**

Focus on actionable insights and decisive recommendations. Build on all perspectives and ensure each decision is well-reasoned without predetermined bias.`
};
