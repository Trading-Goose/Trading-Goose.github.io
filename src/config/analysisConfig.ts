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
   * 1. Deploy Edge Functions: supabase functions deploy analyze-stock-coordinator
   * 2. Set environment variables in Supabase dashboard
   * 3. Change this to true
   * 4. Analyses will continue running even after page refresh!
   * 
   * Note: The analyze-stock function now redirects to analyze-stock-coordinator
   * which handles both single stock analysis and portfolio rebalancing
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
    alpha_vantage: 'Get free API key at https://www.alphavantage.co/support/#api-key',
    ai: 'Configure your AI provider (OpenAI, Anthropic, etc.)'
  }
};