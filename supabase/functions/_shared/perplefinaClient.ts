/**
 * Shared Perplefina API client for finance-focused analysis
 */

const PERPLEFINA_API_URL = Deno.env.get('PERPLEXICA_API_URL') || 'http://134.199.224.223:3000/api/search';

export interface PerplefinaRequest {
  focusMode: 'news' | 'social' | 'fundamentals' | 'macroEconomy';
  query: string;
  optimizationMode: 'speed' | 'balanced';
  maxSources: number;
  chatModel: {
    provider: string;
    model: string;
    apiKey: string;
    baseUrl?: string;
  };
  maxTokens?: number;
  systemInstructions?: string;
  history?: any[];
  timeoutMs?: number;
}

export interface PerplefinaResponse {
  message: string;
  sources: Array<{
    pageContent: string;
    metadata: {
      title: string;
      url: string;
    };
  }>;
}

/**
 * Call Perplefina API for finance-focused analysis
 */
export async function callPerplefina(request: PerplefinaRequest): Promise<PerplefinaResponse> {
  // Normalize model name for non-OpenRouter providers
  let normalizedModel = request.chatModel.model;
  if (request.chatModel.provider !== 'openrouter' && normalizedModel.includes('/')) {
    // Strip prefix for non-OpenRouter providers (e.g., "openai/gpt-4o" -> "gpt-4o")
    normalizedModel = normalizedModel.split('/').pop() || normalizedModel;
  }

  const perplefinaRequest = {
    focusMode: request.focusMode,
    query: request.query,
    optimizationMode: request.optimizationMode || 'speed',
    maxSources: request.maxSources || 10,
    stream: false,
    chatModel: {
      provider: request.chatModel.provider,
      model: normalizedModel,
      apiKey: request.chatModel.apiKey,
      ...(request.chatModel.baseUrl && { baseUrl: request.chatModel.baseUrl })
    },
    ...(request.systemInstructions && {
      systemInstructions: request.systemInstructions
    }),
    ...(request.maxTokens && {
      maxTokens: request.maxTokens
    }),
    ...(request.history && {
      history: request.history
    })
  };

  console.log(`🔍 Calling Perplefina with focus mode: ${request.focusMode}`);

  const envTimeout = Deno.env.get('PERPLEFINA_TIMEOUT_MS');
  const numericEnvTimeout = envTimeout ? Number(envTimeout) : NaN;
  const defaultTimeout = Number.isFinite(numericEnvTimeout) && numericEnvTimeout > 0
    ? numericEnvTimeout
    : 120000;
  const timeoutMs = request.timeoutMs && request.timeoutMs > 0
    ? request.timeoutMs
    : defaultTimeout;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response: Response;

  try {
    response = await fetch(PERPLEFINA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(perplefinaRequest),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Perplefina request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perplefina API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Fix newlines in the message for proper markdown display
  if (data.message) {
    data.message = data.message.replace(/\\n/g, '\n');
  }

  console.log(`✅ Perplefina analysis completed, sources: ${data.sources?.length || 0}`);

  return data;
}
