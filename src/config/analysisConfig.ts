/**
 * Analysis Configuration
 * Controls how analyses are executed
 */

export const analysisConfig = {
  /**
   * Enable server-side execution
   * Set to true AFTER deploying the Supabase Edge Functions
   * 
   * Instructions:
   * 1. Deploy Edge Functions: 
   *    - supabase functions deploy analysis-coordinator
   *    - supabase functions deploy rebalance-coordinator
   * 2. Set environment variables in Supabase dashboard
   * 3. Change this to true
   * 4. Analyses will continue running even after page refresh!
   * 
   * Note: The system now uses separate coordinators:
   * - analysis-coordinator: handles individual stock analysis
   * - rebalance-coordinator: handles portfolio rebalancing with parallel execution
   */
  useServerExecution: true,

  /**
   * Polling interval for server-side analysis updates
   * How often to check for updates (in milliseconds)
   */
  serverPollingInterval: 2000,

  /**
   * Enable debug logging
   * Shows detailed logs in browser console
   */
  debugMode: true,

  /**
   * API configuration reminder
   * Make sure you have valid API keys configured in Settings!
   */
  apiReminder: {
    ai: 'Configure your AI provider (OpenAI, Anthropic, etc.)'
  }
};