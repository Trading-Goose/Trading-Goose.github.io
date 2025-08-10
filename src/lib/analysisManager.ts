/**
 * Analysis Manager - Handles background analysis state and persistence
 */

import { createTradingEngine, type AgentMessage, type WorkflowStep, type AnalysisResult } from './tradingEngine';
import { supabase } from './supabase';
import { ServerAnalysisManager } from './serverAnalysisManager';
import { analysisConfig } from '@/config/analysisConfig';

export interface AnalysisState {
  id?: string;
  ticker: string;
  status: 'running' | 'completed' | 'error';
  startedAt: string;
  completedAt?: string;
  messages: AgentMessage[];
  workflowSteps: WorkflowStep[];
  result?: AnalysisResult;
  error?: string;
}

class AnalysisManager {
  private analyses: Map<string, AnalysisState> = new Map();
  private listeners: Map<string, Set<(state: AnalysisState) => void>> = new Map();
  private initialized = false;
  private serverManager: ServerAnalysisManager;
  private useServerExecution = analysisConfig.useServerExecution;

  constructor() {
    this.serverManager = new ServerAnalysisManager({
      pollingInterval: analysisConfig.serverPollingInterval
    });
    
    if (analysisConfig.debugMode) {
      console.log('📊 Analysis Manager initialized with config:', {
        serverExecution: this.useServerExecution,
        pollingInterval: analysisConfig.serverPollingInterval
      });
    }
  }

  // Initialize and restore running analyses from database
  async initialize(userId?: string) {
    if (this.initialized || !userId) return;
    
    try {
      // Get running analyses from database
      const { data, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Restore running analyses
      for (const item of data || []) {
        if (item.full_analysis && item.full_analysis.status === 'running') {
          // Check if this is a server-side analysis
          if (this.useServerExecution) {
            console.log('📡 Resuming server-side analysis for:', item.ticker);
            
            // Resume monitoring the server analysis
            await this.serverManager.resumeAnalysis(item.id, item.ticker);
            
            // Subscribe to updates
            this.serverManager.subscribe(item.ticker, (state) => {
              this.analyses.set(item.ticker, state);
              this.notifyListeners(item.ticker);
              
              // Keep completed analyses for a short time for UI continuity
              if (state.status === 'completed' || state.status === 'error') {
                setTimeout(() => {
                  // Only remove if it's still in the same state
                  const currentState = this.analyses.get(item.ticker);
                  if (currentState && currentState.status === state.status) {
                    console.log(`🧹 Cleaning up ${state.status} analysis for ${item.ticker}`);
                    this.analyses.delete(item.ticker);
                    this.notifyListeners(item.ticker);
                  }
                }, 5000); // 5 seconds - enough time for UI transitions
              }
            });
            
            // Set initial state
            const state: AnalysisState = {
              ticker: item.ticker,
              status: 'running',
              startedAt: item.full_analysis.startedAt || item.created_at,
              messages: [
                ...(item.full_analysis.messages || []),
                {
                  agent: 'System',
                  message: 'Reconnected to running analysis...',
                  timestamp: new Date().toISOString(),
                  type: 'info' as const
                }
              ],
              workflowSteps: item.full_analysis.workflowSteps || []
            };
            this.analyses.set(item.ticker, state);
          } else {
            // Client-side analysis was interrupted
            const state: AnalysisState = {
              ticker: item.ticker,
              status: 'error',
              startedAt: item.full_analysis.startedAt || item.created_at,
              completedAt: new Date().toISOString(),
              messages: [
                ...(item.full_analysis.messages || []),
                {
                  agent: 'System',
                  message: 'Analysis was interrupted by page refresh. You can restart the analysis.',
                  timestamp: new Date().toISOString(),
                  type: 'error' as const
                }
              ],
              workflowSteps: item.full_analysis.workflowSteps || [],
              error: 'Analysis interrupted by page refresh'
            };
            this.analyses.set(item.ticker, state);
            
            // Update database to mark as interrupted
            try {
              await supabase
                .from('analysis_history')
                .update({
                  full_analysis: {
                    ...item.full_analysis,
                    status: 'error',
                    completedAt: state.completedAt,
                    error: 'Analysis interrupted by page refresh',
                    messages: state.messages
                  }
                })
                .eq('id', item.id);
            } catch (error) {
              console.error('Error updating interrupted analysis:', error);
            }
          }
        }
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize analysis manager:', error);
    }
  }

  // Get analysis state
  getAnalysis(ticker: string): AnalysisState | undefined {
    return this.analyses.get(ticker);
  }

  // Restore analysis state to memory
  restoreAnalysis(ticker: string, state: AnalysisState): void {
    this.analyses.set(ticker, state);
    this.notifyListeners(ticker);
  }

  // Get all analyses
  getAllAnalyses(): AnalysisState[] {
    return Array.from(this.analyses.values());
  }

  // Check if analysis is running
  isRunning(ticker: string): boolean {
    const analysis = this.analyses.get(ticker);
    return analysis?.status === 'running';
  }

  // Subscribe to analysis updates
  subscribe(ticker: string, callback: (state: AnalysisState) => void): () => void {
    if (!this.listeners.has(ticker)) {
      this.listeners.set(ticker, new Set());
    }
    this.listeners.get(ticker)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(ticker)?.delete(callback);
    };
  }

  // Notify listeners
  private notifyListeners(ticker: string) {
    const state = this.analyses.get(ticker);
    if (state) {
      this.listeners.get(ticker)?.forEach(callback => callback(state));
    }
  }

  // Start new analysis
  async startAnalysis(
    ticker: string,
    apiSettings: { ai_provider: string; ai_api_key: string; ai_model?: string; alpha_vantage_api_key: string },
    userId?: string
  ): Promise<string | undefined> {
    // Check if already running
    if (this.isRunning(ticker)) {
      console.log(`Analysis already running for ${ticker}`);
      return undefined;
    }

    // Use server-side execution if enabled
    if (this.useServerExecution && userId) {
      try {
        console.log('🚀 Starting server-side analysis for:', ticker);
        
        // Initialize local state for UI updates
        const analysisState: AnalysisState = {
          ticker,
          status: 'running',
          startedAt: new Date().toISOString(),
          messages: [{
            agent: 'System',
            message: 'Starting server-side analysis...',
            timestamp: new Date().toISOString(),
            type: 'info'
          }],
          workflowSteps: [],
        };
        
        this.analyses.set(ticker, analysisState);
        this.notifyListeners(ticker);
        
        // Start server analysis
        const analysisId = await this.serverManager.startServerAnalysis(ticker, apiSettings, userId);
        
        // Update state with analysis ID
        if (analysisId && analysisState) {
          analysisState.id = analysisId;
          this.analyses.set(ticker, analysisState);
          this.notifyListeners(ticker);
        }
        
        // Subscribe to server updates
        this.serverManager.subscribe(ticker, (state) => {
          this.analyses.set(ticker, state);
          this.notifyListeners(ticker);
          
          // Keep completed analyses for a short time for UI continuity
          if (state.status === 'completed' || state.status === 'error') {
            setTimeout(() => {
              // Only remove if it's still in the same state
              const currentState = this.analyses.get(ticker);
              if (currentState && currentState.status === state.status) {
                console.log(`🧹 Cleaning up ${state.status} analysis for ${ticker}`);
                this.analyses.delete(ticker);
                this.notifyListeners(ticker);
              }
            }, 5000); // 5 seconds - enough time for UI transitions
          }
        });
        
        return analysisId;
      } catch (error) {
        console.error('Failed to start server analysis, falling back to client-side:', error);
        // Continue with client-side execution as fallback
      }
    }

    // Initialize analysis state
    const analysisState: AnalysisState = {
      ticker,
      status: 'running',
      startedAt: new Date().toISOString(),
      messages: [],
      workflowSteps: [],
    };

    this.analyses.set(ticker, analysisState);
    this.notifyListeners(ticker);

    // Save initial running state to database
    let analysisId: string | null = null;
    if (userId) {
      try {
        console.log('💾 Saving initial analysis state for:', ticker);
        
        const { data, error } = await supabase
          .from('analysis_history')
          .insert({
            user_id: userId,
            ticker: ticker,
            analysis_date: new Date().toISOString().split('T')[0],
            decision: 'HOLD', // Placeholder
            confidence: 0, // Placeholder
            agent_insights: {},
            full_analysis: {
              ...analysisState,
              status: 'running',
            },
          })
          .select('id')
          .single();

        if (error) {
          console.error('❌ Error saving initial analysis state:', error);
          throw error;
        }
        
        analysisId = data?.id;
        console.log('✅ Initial analysis state saved with ID:', analysisId);
        
        // Update state with analysis ID
        if (analysisId) {
          analysisState.id = analysisId;
          this.analyses.set(ticker, analysisState);
          this.notifyListeners(ticker);
        }
      } catch (error) {
        console.error('Error saving initial analysis state:', error);
      }
    }

    try {
      // Create trading engine with callbacks
      const engine = await createTradingEngine({
        alphaVantageApiKey: apiSettings.alpha_vantage_api_key,
        aiProvider: apiSettings.ai_provider,
        aiApiKey: apiSettings.ai_api_key,
        aiModel: apiSettings.ai_model,
        onMessage: (message) => {
          const state = this.analyses.get(ticker);
          if (state) {
            state.messages.push(message);
            this.notifyListeners(ticker);
            // Update database periodically
            this.updateAnalysisInDatabase(ticker, userId, analysisId, state);
          }
        },
        onWorkflowUpdate: (steps) => {
          const state = this.analyses.get(ticker);
          if (state) {
            state.workflowSteps = steps;
            this.notifyListeners(ticker);
            // Update database periodically
            this.updateAnalysisInDatabase(ticker, userId, analysisId, state);
          }
        },
      });

      // Run analysis - use yesterday to ensure we have market data
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const analysisDate = yesterday.toISOString().split('T')[0];
      
      console.log('🚀 Starting analysis for:', ticker, 'on date:', analysisDate);
      
      const result = await engine.analyzeStock(ticker, analysisDate);
      console.log('✅ Analysis completed for:', ticker, 'Decision:', result.decision);

      // Update state with result
      const state = this.analyses.get(ticker);
      if (state) {
        state.status = 'completed';
        state.completedAt = new Date().toISOString();
        state.result = result;
        console.log('📝 Updated analysis state:', { ticker, status: state.status, completedAt: state.completedAt });
        this.notifyListeners(ticker);

        // Update database with final result
        if (userId && analysisId) {
          try {
            console.log('🔄 Updating analysis in database:', { analysisId, ticker, decision: result.decision });
            
            // Update the existing analysis record
            const { data, error } = await supabase
              .from('analysis_history')
              .update({
                decision: result.decision,
                confidence: result.confidence,
                agent_insights: result.agentInsights,
                full_analysis: {
                  ...result,
                  messages: state.messages,
                  workflowSteps: state.workflowSteps,
                  status: 'completed',
                  completedAt: state.completedAt,
                },
              })
              .eq('id', analysisId)
              .select();

            if (error) {
              console.error('❌ Database update error:', error);
              throw error;
            }
            
            console.log('✅ Analysis saved successfully:', data);

            // Update watchlist with latest decision
            const { data: watchlistItem } = await supabase
              .from('watchlist')
              .select('id')
              .eq('user_id', userId)
              .eq('ticker', result.ticker)
              .single();

            if (watchlistItem) {
              await supabase
                .from('watchlist')
                .update({
                  last_analysis: new Date().toISOString(),
                  last_decision: result.decision,
                })
                .eq('id', watchlistItem.id);
            }
          } catch (error) {
            console.error('Error saving analysis to database:', error);
          }
        }
      }
    } catch (error) {
      console.error('❌ Analysis failed for:', ticker, 'Error:', error);
      
      // Update state with error
      const state = this.analyses.get(ticker);
      if (state) {
        state.status = 'error';
        state.completedAt = new Date().toISOString();
        state.error = error instanceof Error ? error.message : 'Unknown error';
        console.log('📝 Updated analysis state with error:', { ticker, status: state.status, error: state.error });
        this.notifyListeners(ticker);

        // Update database with error state
        if (userId && analysisId) {
          try {
            console.log('🔄 Updating database with error state for:', ticker);
            await supabase
              .from('analysis_history')
              .update({
                full_analysis: {
                  ...state,
                  status: 'error',
                  completedAt: state.completedAt,
                  error: state.error,
                },
              })
              .eq('id', analysisId);
            console.log('✅ Error state saved to database');
          } catch (dbError) {
            console.error('❌ Error updating database with error state:', dbError);
          }
        }
      }
    }
    
    // Return the analysis ID if available
    return analysisId || undefined;
  }

  // Update analysis state in database (throttled)
  private updateQueue = new Map<string, NodeJS.Timeout>();
  
  private updateAnalysisInDatabase(ticker: string, userId?: string, analysisId?: string | null, state?: AnalysisState) {
    if (!userId || !analysisId || !state) return;

    // Throttle database updates to avoid too frequent calls
    if (this.updateQueue.has(ticker)) {
      clearTimeout(this.updateQueue.get(ticker)!);
    }

    const timeout = setTimeout(async () => {
      try {
        await supabase
          .from('analysis_history')
          .update({
            full_analysis: {
              ...state,
              status: state.status,
            },
          })
          .eq('id', analysisId);
        
        this.updateQueue.delete(ticker);
      } catch (error) {
        console.error('Error updating analysis in database:', error);
      }
    }, 2000); // Update every 2 seconds at most

    this.updateQueue.set(ticker, timeout);
  }

  // Clear completed analysis
  clearAnalysis(ticker: string) {
    if (this.analyses.get(ticker)?.status !== 'running') {
      this.analyses.delete(ticker);
      this.listeners.delete(ticker);
      
      // Clear any pending database updates
      if (this.updateQueue.has(ticker)) {
        clearTimeout(this.updateQueue.get(ticker)!);
        this.updateQueue.delete(ticker);
      }
    }
  }

  // Cancel/Stop running analysis
  async cancelAnalysis(ticker: string, userId?: string): Promise<void> {
    const analysis = this.analyses.get(ticker);
    if (!analysis || analysis.status !== 'running') {
      console.log(`No running analysis found for ${ticker}`);
      return;
    }

    console.log(`🛑 Cancelling analysis for ${ticker}`);

    // If it's a server-side analysis, stop server monitoring
    if (this.useServerExecution) {
      try {
        await this.serverManager.cancelAnalysis(ticker);
      } catch (error) {
        console.error('Failed to cancel server analysis:', error);
      }
    }

    // Update local state to cancelled
    analysis.status = 'error';
    analysis.completedAt = new Date().toISOString();
    analysis.error = 'Analysis cancelled by user';
    analysis.messages.push({
      agent: 'System',
      message: 'Analysis cancelled by user',
      timestamp: new Date().toISOString(),
      type: 'error'
    });

    // Clear any pending database updates
    if (this.updateQueue.has(ticker)) {
      clearTimeout(this.updateQueue.get(ticker)!);
      this.updateQueue.delete(ticker);
    }

    // Update database with cancelled status
    if (userId) {
      try {
        const { error } = await supabase
          .from('analysis_history')
          .update({
            full_analysis: {
              ...analysis,
              status: 'error',
              completedAt: analysis.completedAt,
              error: 'Analysis cancelled by user',
              messages: analysis.messages
            }
          })
          .eq('user_id', userId)
          .eq('ticker', ticker)
          .eq('full_analysis->>status', 'running');

        if (error) throw error;
        console.log(`✅ Cancelled analysis for ${ticker} updated in database`);
      } catch (error) {
        console.error(`❌ Failed to update cancelled analysis for ${ticker}:`, error);
        throw error;
      }
    }

    this.notifyListeners(ticker);
  }

  // Delete analysis (including in-progress ones)
  async deleteAnalysis(ticker: string, userId?: string): Promise<void> {
    const analysis = this.analyses.get(ticker);
    if (!analysis) return;

    // If it's a server-side analysis, stop server monitoring
    if (this.useServerExecution && analysis.status === 'running') {
      try {
        await this.serverManager.cancelAnalysis(ticker);
      } catch (error) {
        console.error('Failed to cancel server analysis:', error);
      }
    }

    // Remove from local state
    this.analyses.delete(ticker);
    this.listeners.delete(ticker);
    
    // Clear any pending database updates
    if (this.updateQueue.has(ticker)) {
      clearTimeout(this.updateQueue.get(ticker)!);
      this.updateQueue.delete(ticker);
    }

    // Delete from database if userId is provided
    if (userId) {
      try {
        const { error } = await supabase
          .from('analysis_history')
          .delete()
          .eq('user_id', userId)
          .eq('ticker', ticker)
          .eq('full_analysis->>status', analysis.status);

        if (error) throw error;
        console.log(`✅ Deleted analysis for ${ticker} from database`);
      } catch (error) {
        console.error(`❌ Failed to delete analysis for ${ticker} from database:`, error);
        throw error;
      }
    }
  }

  // Clear all completed analyses
  clearCompleted() {
    for (const [ticker, state] of this.analyses.entries()) {
      if (state.status !== 'running') {
        this.analyses.delete(ticker);
        this.listeners.delete(ticker);
      }
    }
  }
}

// Export singleton instance
export const analysisManager = new AnalysisManager();