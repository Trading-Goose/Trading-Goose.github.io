/**
 * TradingGoose API client
 */

import { useAuth } from './auth-supabase';

const API_URL = import.meta.env.VITE_TRADING_AGENTS_API_URL || 'http://localhost:8000';

interface AnalyzeRequest {
  ticker: string;
  date: string;
  config?: {
    ai_provider: string;
    ai_api_key: string;
    ai_model?: string;
    alpha_vantage_api_key: string;
    include_full_analysis?: boolean;
  };
}

interface AnalyzeResponse {
  ticker: string;
  date: string;
  decision: 'BUY' | 'SELL' | 'HOLD' | 'ERROR';
  confidence: number;
  agent_insights: Record<string, string>;
  full_analysis?: any;
}

interface PortfolioAnalyzeResponse {
  results: AnalyzeResponse[];
}

class TradingGooseAPI {
  private async getAuthHeader(): Promise<string> {
    // Get the current user's token from Supabase
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : '';
  }

  private async getApiConfig() {
    // Get API settings from the auth store
    const authState = useAuth.getState();
    const apiSettings = authState.apiSettings;
    
    if (!apiSettings) {
      throw new Error('API settings not configured');
    }

    return {
      ai_provider: apiSettings.ai_provider,
      ai_api_key: apiSettings.ai_api_key,
      ai_model: apiSettings.ai_model,
      alpha_vantage_api_key: apiSettings.alpha_vantage_api_key,
    };
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      return data.status === 'healthy' && data.trading_agents_available;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  async analyzeStock(ticker: string, date: string, includeFullAnalysis = false): Promise<AnalyzeResponse> {
    try {
      const authHeader = await this.getAuthHeader();
      const config = await this.getApiConfig();

      const response = await fetch(`${API_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          ticker,
          date,
          config: {
            ...config,
            include_full_analysis: includeFullAnalysis,
          },
        } as AnalyzeRequest),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error analyzing stock:', error);
      throw error;
    }
  }

  async analyzePortfolio(tickers: string[], date: string): Promise<PortfolioAnalyzeResponse> {
    try {
      const authHeader = await this.getAuthHeader();
      const config = await this.getApiConfig();

      const response = await fetch(`${API_URL}/api/analyze-portfolio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({
          tickers,
          date,
          config,
        }),
      });

      if (!response.ok) {
        throw new Error(`Portfolio analysis failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error analyzing portfolio:', error);
      throw error;
    }
  }

  async getConfig() {
    try {
      const response = await fetch(`${API_URL}/api/config`);
      return await response.json();
    } catch (error) {
      console.error('Error getting config:', error);
      throw error;
    }
  }

  async getAgentStatus(ticker: string): Promise<any> {
    try {
      const authHeader = await this.getAuthHeader();
      
      const response = await fetch(`${API_URL}/api/agent-status/${ticker}`, {
        headers: {
          'Authorization': authHeader,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get agent status: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting agent status:', error);
      throw error;
    }
  }

  streamAgentUpdates(ticker: string, onMessage: (event: any) => void, onError?: (error: any) => void): EventSource {
    // EventSource doesn't support custom headers, so we need to pass the token as a query parameter
    const token = supabase.auth.getSession().then(session => 
      session.data.session?.access_token || ''
    );
    
    // For now, skip auth in SSE (you could implement token-based auth via query params)
    const eventSource = new EventSource(`${API_URL}/api/agent-stream/${ticker}`);
    
    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage({ type: 'message', data });
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    });
    
    eventSource.addEventListener('status', (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage({ type: 'status', data });
      } catch (error) {
        console.error('Error parsing SSE status:', error);
      }
    });
    
    eventSource.addEventListener('complete', (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage({ type: 'complete', data });
        eventSource.close();
      } catch (error) {
        console.error('Error parsing SSE complete:', error);
      }
    });
    
    eventSource.addEventListener('error', (event) => {
      console.error('SSE error:', event);
      if (onError) onError(event);
      eventSource.close();
    });
    
    return eventSource;
  }

  async submitAgentResponse(ticker: string, message: string): Promise<any> {
    try {
      const authHeader = await this.getAuthHeader();
      
      const response = await fetch(`${API_URL}/api/agent-response/${ticker}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`Failed to submit response: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error submitting agent response:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const tradingAgentsAPI = new TradingGooseAPI();

// Also export the type
export type { AnalyzeResponse, PortfolioAnalyzeResponse };

// Import supabase here to avoid circular dependency
import { supabase } from './supabase';