/**
 * AI Provider wrapper for OpenRouter and other AI services
 */

import { useAuth } from './auth-supabase';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
}

class AIProvider {
  private getConfig() {
    const authState = useAuth.getState();
    const apiSettings = authState.apiSettings;
    
    if (!apiSettings?.ai_api_key) {
      throw new Error('AI API key not configured');
    }

    return {
      provider: apiSettings.ai_provider || 'openai',
      apiKey: apiSettings.ai_api_key,
      model: apiSettings.ai_model || 'gpt-4-turbo-preview'
    };
  }

  async chat(options: ChatOptions): Promise<string> {
    const config = this.getConfig();
    
    if (config.provider === 'openrouter') {
      return this.chatWithOpenRouter(options, config);
    } else if (config.provider === 'openai') {
      return this.chatWithOpenAI(options, config);
    } else {
      throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
  }

  private async chatWithOpenRouter(options: ChatOptions, config: any): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'TradingGoose'
      },
      body: JSON.stringify({
        model: options.model || config.model,
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private async chatWithOpenAI(options: ChatOptions, config: any): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || config.model,
        messages: options.messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.max_tokens || 1000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }
}

export const aiProvider = new AIProvider();