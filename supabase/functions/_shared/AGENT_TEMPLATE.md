# Agent Completion Check Template

This template shows how to add completion checking to prevent duplicate agent execution and save API calls.

## 1. Import the Required Functions

Add this import at the top of your agent file:

```typescript
import { checkAgentCompletion, checkForBlockingOperations } from '../_shared/agentCompletionCheck.ts'
```

## 2. Add Completion Check After Initial Setup

After creating the Supabase client and logging initial status, but BEFORE setting up timeouts or doing any actual work, add:

```typescript
// Check if this agent has already completed for this analysis
const completionStatus = await checkAgentCompletion(
  supabase,
  analysisId,
  'agent-[YOUR-AGENT-NAME]',  // e.g., 'agent-fundamentals-analyst'
  '[Your Agent Display Name]'   // e.g., 'Fundamentals Analyst'
);

if (completionStatus.hasCompleted && completionStatus.status === 'completed') {
  console.log(`✅ [Agent Name] already completed for analysis ${analysisId}`);
  console.log(`   Skipping duplicate execution to save API calls`);
  
  // Clear any timeout that might have been set
  if (timeoutId !== null) {
    clearAgentTimeout(timeoutId, '[Agent Name]', 'already completed');
  }
  
  // Return the existing insights if available
  return createSuccessResponse({
    agent: '[Agent Name]',
    message: 'Agent already completed for this analysis',
    alreadyCompleted: true,
    existingInsights: completionStatus.existingInsights,
    retryInfo: retryStatus
  });
}

// Don't check for "already running" - the coordinator handles that before invocation
// The agent will see itself as "running" because the coordinator marks it as such
// Only check for "already completed" to avoid re-doing work

// Check for any blocking operations (canceled analysis, etc.)
const blockingCheck = await checkForBlockingOperations(supabase, analysisId, 'agent-[your-agent-name]');
if (!blockingCheck.canProceed) {
  console.log(`🛑 [Agent Name] cannot proceed: ${blockingCheck.reason}`);
  return createCanceledResponse(
    `[Agent Name] cannot proceed: ${blockingCheck.reason}`,
    true
  );
}
```

## 3. Complete Example Structure

```typescript
serve(async (req) => {
  let timeoutId: number | null = null;
  
  try {
    // 1. Validate request method and parameters
    if (req.method !== 'POST') {
      return createMethodNotAllowedResponse();
    }
    
    const request: AgentRequest = await req.json();
    // ... parameter validation ...
    
    // 2. Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // 3. Log initial status
    console.log(`🎯 [Agent Name] starting for ${ticker}`);
    
    // 4. ⭐ ADD COMPLETION CHECK HERE ⭐
    const completionStatus = await checkAgentCompletion(...);
    // ... handle completion status as shown above ...
    
    // 5. Setup timeout (AFTER completion check)
    timeoutId = setupAgentTimeout(...);
    
    // 6. Check cancellation
    const cancellationCheck = await checkAnalysisCancellation(...);
    
    // 7. Do actual work
    // ... your agent logic ...
    
  } catch (error) {
    // Error handling
  }
});
```

## Agent Names Reference

For the `checkAgentCompletion` function, use these exact names:

| Agent Function Name | Display Name |
|-------------------|--------------|
| agent-market-analyst | Market Analyst |
| agent-news-analyst | News Analyst |
| agent-social-media-analyst | Social Media Analyst |
| agent-fundamentals-analyst | Fundamentals Analyst |
| agent-macro-analyst | Macro Analyst |
| agent-bull-researcher | Bull Researcher |
| agent-bear-researcher | Bear Researcher |
| agent-research-manager | Research Manager |
| agent-trader | Trader |
| agent-risky-analyst | Risky Analyst |
| agent-safe-analyst | Safe Analyst |
| agent-neutral-analyst | Neutral Analyst |
| agent-risk-manager | Risk Manager |

## Benefits

1. **Prevents Duplicate Work**: Agents won't re-run if already completed
2. **Saves API Calls**: No unnecessary AI API calls for completed agents
3. **Handles Race Conditions**: Prevents concurrent execution of the same agent
4. **Graceful Recovery**: Allows retry for failed agents while blocking completed ones
5. **Better User Experience**: Faster responses when agents have already run

## Notes

- The check happens BEFORE setting up timeouts to avoid unnecessary timeout handlers
- The check happens BEFORE any actual work (API calls, data fetching, etc.)
- Failed agents (status='error') are allowed to retry
- Running agents are blocked to prevent concurrent execution
- Completed agents return their existing insights if available