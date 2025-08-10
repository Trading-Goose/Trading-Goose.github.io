/**
 * Server-side Analysis Manager
 * Handles analysis execution on the server that continues even after page refresh
 */

import { supabase } from './supabase';
import type { AnalysisState } from './analysisManager';

export interface ServerAnalysisOptions {
  useServerExecution?: boolean;
  pollingInterval?: number; // milliseconds
}

export class ServerAnalysisManager {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private listeners: Map<string, Set<(state: AnalysisState) => void>> = new Map();
  private options: ServerAnalysisOptions;

  constructor(options: ServerAnalysisOptions = {}) {
    this.options = {
      useServerExecution: true,
      pollingInterval: 2000, // Poll every 2 seconds
      ...options
    };
  }

  /**
   * Start analysis on the server
   */
  async startServerAnalysis(
    ticker: string,
    apiSettings: any,
    userId: string
  ): Promise<string> {
    try {
      // Don't send any credentials from frontend - edge function will fetch from database
      const { data, error } = await supabase.functions.invoke('analyze-stock', {
        body: {
          ticker,
          userId,
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      // Start polling for updates
      this.startPolling(data.analysisId, ticker);

      return data.analysisId;
    } catch (error) {
      console.error('Failed to start server analysis:', error);
      throw error;
    }
  }

  /**
   * Get analysis status from server
   */
  async getAnalysisStatus(analysisId: string): Promise<AnalysisState | null> {
    try {
      const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('id', analysisId)
        .single();

      if (error) throw error;
      if (!data || !data.full_analysis) {
        console.log('No full_analysis data found for:', analysisId);
        return null;
      }

      console.log(`📊 Analysis status for ${analysisId}:`, {
        ticker: data.ticker,
        status: data.full_analysis.status,
        messageCount: data.full_analysis.messages?.length || 0,
        stepCount: data.full_analysis.workflowSteps?.length || 0
      });

      // Check if we have a valid decision and confidence - if so, it's likely completed
      const hasValidDecision = data.decision && ['BUY', 'SELL', 'HOLD'].includes(data.decision) && data.confidence > 0;
      const hasAgentInsights = data.agent_insights && Object.keys(data.agent_insights).length > 0;
      
      // Determine actual status based on data
      let actualStatus = data.full_analysis.status || 'running';
      if (actualStatus === 'running' && hasValidDecision && hasAgentInsights) {
        console.log(`📊 Analysis appears complete based on decision/confidence for ${data.ticker}`);
        actualStatus = 'completed';
      }
      
      // Convert database format to AnalysisState
      const state: AnalysisState = {
        ticker: data.ticker,
        status: actualStatus,
        startedAt: data.full_analysis.startedAt || data.created_at,
        completedAt: actualStatus === 'completed' ? data.full_analysis.completedAt || new Date().toISOString() : undefined,
        messages: data.full_analysis.messages || [],
        workflowSteps: data.full_analysis.workflowSteps || [],
        result: hasValidDecision ? {
          ticker: data.ticker,
          date: data.analysis_date,
          decision: data.decision,
          confidence: data.confidence,
          agentInsights: data.agent_insights
        } : data.full_analysis.result,
        error: data.full_analysis.error
      };

      return state;
    } catch (error) {
      console.error('Failed to get analysis status:', error);
      return null;
    }
  }

  /**
   * Start polling for analysis updates
   */
  private startPolling(analysisId: string, ticker: string) {
    // Clear any existing polling for this ticker
    this.stopPolling(ticker);

    const startTime = Date.now();
    const maxPollingTime = 10 * 60 * 1000; // 10 minutes max polling (increased since server is fixed)

    const pollForUpdates = async () => {
      // Check if we've been polling too long
      if (Date.now() - startTime > maxPollingTime) {
        console.warn(`⏱️ Polling timeout for ${ticker} after 10 minutes`);
        this.stopPolling(ticker);
        
        // Create timeout state
        const timeoutState: AnalysisState = {
          ticker,
          status: 'completed',
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          messages: [{
            agent: 'System',
            message: 'Analysis completed (timeout after 10 minutes of polling)',
            timestamp: new Date().toISOString(),
            type: 'info'
          }],
          workflowSteps: [],
        };
        
        this.notifyListeners(ticker, timeoutState);
        return;
      }
      try {
        const state = await this.getAnalysisStatus(analysisId);
        
        if (state) {
          // Notify listeners
          this.notifyListeners(ticker, state);

          // Stop polling if analysis is complete or errored
          if (state.status === 'completed' || state.status === 'error') {
            this.stopPolling(ticker);
          }
        } else {
          // If we can't get the state, assume something went wrong
          console.warn(`Could not get analysis status for ${ticker}, analysis may have failed`);
          
          // Create error state
          const errorState: AnalysisState = {
            ticker,
            status: 'error',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            messages: [{
              agent: 'System',
              message: 'Analysis status could not be retrieved. The analysis may have failed on the server.',
              timestamp: new Date().toISOString(),
              type: 'error'
            }],
            workflowSteps: [],
            error: 'Could not retrieve analysis status'
          };
          
          this.notifyListeners(ticker, errorState);
          this.stopPolling(ticker);
        }
      } catch (pollError) {
        console.error(`Error polling analysis status for ${ticker}:`, pollError);
        
        // Create error state for notification
        const errorState: AnalysisState = {
          ticker,
          status: 'error',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          messages: [{
            agent: 'System',
            message: `Polling failed: ${pollError instanceof Error ? pollError.message : 'Unknown error'}`,
            timestamp: new Date().toISOString(),
            type: 'error'
          }],
          workflowSteps: [],
          error: `Polling failed: ${pollError instanceof Error ? pollError.message : 'Unknown error'}`
        };
        
        this.notifyListeners(ticker, errorState);
        this.stopPolling(ticker);
      }
    };

    // Initial poll
    pollForUpdates();

    // Set up interval
    const interval = setInterval(pollForUpdates, this.options.pollingInterval);
    this.pollingIntervals.set(ticker, interval);
  }

  /**
   * Stop polling for a ticker
   */
  private stopPolling(ticker: string) {
    const interval = this.pollingIntervals.get(ticker);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(ticker);
    }
  }

  /**
   * Subscribe to analysis updates
   */
  subscribe(ticker: string, callback: (state: AnalysisState) => void): () => void {
    if (!this.listeners.has(ticker)) {
      this.listeners.set(ticker, new Set());
    }
    this.listeners.get(ticker)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(ticker)?.delete(callback);
      if (this.listeners.get(ticker)?.size === 0) {
        this.stopPolling(ticker);
      }
    };
  }

  /**
   * Notify listeners
   */
  private notifyListeners(ticker: string, state: AnalysisState) {
    this.listeners.get(ticker)?.forEach(callback => callback(state));
  }

  /**
   * Resume monitoring an existing analysis
   */
  async resumeAnalysis(analysisId: string, ticker: string): Promise<void> {
    const state = await this.getAnalysisStatus(analysisId);
    
    if (state && state.status === 'running') {
      // Resume polling
      this.startPolling(analysisId, ticker);
    }
  }

  /**
   * Get all running analyses for a user
   */
  async getRunningAnalyses(userId: string): Promise<Array<{id: string, ticker: string}>> {
    try {
      const { data, error } = await supabase
        .from('analysis_history')
        .select('id, ticker')
        .eq('user_id', userId)
        .eq('full_analysis->>status', 'running');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to get running analyses:', error);
      return [];
    }
  }

  /**
   * Cancel a running analysis
   */
  async cancelAnalysis(ticker: string): Promise<void> {
    // Stop polling
    this.stopPolling(ticker);
    
    // Remove listeners
    this.listeners.delete(ticker);
    
    // Note: We don't actually stop the server-side analysis since it's running 
    // in a Supabase Edge Function that we can't directly control.
    // The analysis will continue running but we stop monitoring it.
    // The database deletion will be handled by the AnalysisManager.
    
    console.log(`🛑 Stopped monitoring server analysis for ${ticker}`);
  }

  /**
   * Clean up all polling intervals
   */
  cleanup() {
    this.pollingIntervals.forEach(interval => clearInterval(interval));
    this.pollingIntervals.clear();
    this.listeners.clear();
  }
}