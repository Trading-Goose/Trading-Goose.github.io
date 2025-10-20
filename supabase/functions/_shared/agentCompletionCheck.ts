/**
 * Shared utility for checking if an agent has already completed its work
 * This prevents duplicate processing and unnecessary AI API calls
 */

export interface AgentCompletionStatus {
  hasCompleted: boolean;
  status?: 'pending' | 'running' | 'completed' | 'error';
  message?: string;
  existingInsights?: any;
}

/**
 * Check if an agent has already completed its work for a given analysis
 * @param supabase - Supabase client
 * @param analysisId - The analysis ID to check
 * @param agentName - The agent function name (e.g., 'agent-market-analyst')
 * @param agentDisplayName - The display name in workflow (e.g., 'Market Analyst')
 * @param isRetryAttempt - Whether this is an intentional retry (from retry handler or self-retry)
 * @returns Status indicating if the agent has completed and any existing insights
 */
export async function checkAgentCompletion(
  supabase: any,
  analysisId: string,
  agentName: string,
  agentDisplayName: string,
  isRetryAttempt: boolean = false
): Promise<AgentCompletionStatus> {
  try {
    // Fetch the analysis record
    const { data: analysis, error } = await supabase
      .from('analysis_history')
      .select('full_analysis, agent_insights')
      .eq('id', analysisId)
      .single();
    
    if (error || !analysis) {
      console.error(`Failed to fetch analysis for completion check:`, error);
      return {
        hasCompleted: false,
        message: 'Failed to fetch analysis record'
      };
    }
    
    // Check workflow steps for agent status
    const workflowSteps = analysis.full_analysis?.workflowSteps || [];
    let agentStatus: string | undefined;
    
    // Find the agent's status in workflow steps
    for (const phase of workflowSteps) {
      const agent = phase.agents?.find((a: any) => 
        a.name === agentDisplayName || 
        a.functionName === agentName
      );
      
      if (agent) {
        agentStatus = agent.status;
        break;
      }
    }
    
    // Check if agent has already completed successfully
    if (agentStatus === 'completed') {
      console.log(`✅ Agent ${agentDisplayName} already completed for analysis ${analysisId}`);
      
      // Get existing insights if available
      const agentKey = getAgentInsightKey(agentName);
      const existingInsights = analysis.agent_insights?.[agentKey];
      
      return {
        hasCompleted: true,
        status: 'completed',
        message: 'Agent has already completed successfully',
        existingInsights
      };
    }
    
    // Check if agent is currently running (prevent concurrent execution)
    if (agentStatus === 'running') {
      console.log(`⚠️ Agent ${agentDisplayName} is already running for analysis ${analysisId}`);
      return {
        hasCompleted: true, // Treat as completed to prevent duplicate execution
        status: 'running',
        message: 'Agent is already running'
      };
    }
    
    // Check if agent had an error
    if (agentStatus === 'error') {
      // If this is an intentional retry (from retry handler or self-retry mechanism)
      if (isRetryAttempt) {
        console.log(`🔄 Agent ${agentDisplayName} previously failed - allowing intentional retry`);
        return {
          hasCompleted: false,  // Allow the retry
          status: 'error',
          message: 'Agent previously failed, allowing intentional retry'
        };
      } else {
        // This is an accidental re-invocation - block it
        console.log(`❌ Agent ${agentDisplayName} previously failed - blocking accidental re-invocation`);
        console.log(`   The coordinator already handled this error and moved on`);
        console.log(`   To retry, use the retry handler or wait for self-retry mechanism`);
        return {
          hasCompleted: true,  // Block accidental re-invocation
          status: 'error',
          message: 'Agent previously failed - blocking accidental re-invocation'
        };
      }
    }
    
    // Agent hasn't run yet
    return {
      hasCompleted: false,
      status: 'pending',
      message: 'Agent has not run yet'
    };
    
  } catch (error) {
    console.error(`Error checking agent completion:`, error);
    return {
      hasCompleted: false,
      message: 'Error checking completion status'
    };
  }
}

/**
 * Get the agent insight key based on agent name
 */
function getAgentInsightKey(agentName: string): string {
  const keyMap: { [key: string]: string } = {
    'agent-market-analyst': 'marketAnalyst',
    'agent-news-analyst': 'newsAnalyst',
    'agent-social-media-analyst': 'socialMediaAnalyst',
    'agent-fundamentals-analyst': 'fundamentalsAnalyst',
    'agent-macro-analyst': 'macroAnalyst',
    'agent-bull-researcher': 'bullResearcher',
    'agent-bear-researcher': 'bearResearcher',
    'agent-research-manager': 'researchManager',
    'agent-trader': 'trader',
    'agent-risky-analyst': 'riskyAnalyst',
    'agent-safe-analyst': 'safeAnalyst',
    'agent-neutral-analyst': 'neutralAnalyst',
    'agent-risk-manager': 'riskManager'
  };
  
  return keyMap[agentName] || agentName;
}

/**
 * Check if there are any pending operations that would block agent execution
 * Similar to how portfolio manager checks for pending orders
 */
export async function checkForBlockingOperations(
  supabase: any,
  analysisId: string,
  agentName: string
): Promise<{ canProceed: boolean; reason?: string }> {
  try {
    // Check if the analysis is canceled
    const { data: analysis, error } = await supabase
      .from('analysis_history')
      .select('is_canceled, analysis_status')
      .eq('id', analysisId)
      .single();
    
    if (error || !analysis) {
      return {
        canProceed: false,
        reason: 'Failed to fetch analysis status'
      };
    }
    
    if (analysis.is_canceled) {
      return {
        canProceed: false,
        reason: 'Analysis has been canceled'
      };
    }
    
    if (analysis.analysis_status === 'error' || analysis.analysis_status === 'completed') {
      return {
        canProceed: false,
        reason: `Analysis already ${analysis.analysis_status}`
      };
    }
    
    // Add any agent-specific blocking checks here
    // For example, trader might check for pending orders
    // Risk manager might check for pending portfolio updates
    
    return {
      canProceed: true
    };
    
  } catch (error) {
    console.error(`Error checking for blocking operations:`, error);
    return {
      canProceed: true // Default to allowing execution if check fails
    };
  }
}