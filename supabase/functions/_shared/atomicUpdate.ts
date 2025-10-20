import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ANALYSIS_STATUS } from './statusTypes.ts';

/**
 * Atomically append a message to the analysis history
 * Uses a dual approach: immediate write to message queue + optimistic locking for full_analysis
 */
export async function appendAnalysisMessage(
  supabase: any,
  analysisId: string,
  agentName: string,
  message: string,
  messageType: string = 'analysis',
  maxRetries: number = 5
) {
  try {
    // First, always insert into the message queue table (truly atomic)
    const { error: queueError } = await supabase
      .from('analysis_messages')
      .insert({
        analysis_id: analysisId,
        agent_name: agentName,
        message: message,
        message_type: messageType
      });

    if (queueError && !queueError.message.includes('already exists')) {
      console.error(`Failed to queue message for ${agentName}:`, queueError);
      // Continue anyway - we'll try to update the main table
    }

    // Now try to update the main analysis_history table with retry logic
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // Get current state
        const { data: current, error: fetchError } = await supabase
          .from('analysis_history')
          .select('full_analysis, updated_at')
          .eq('id', analysisId)
          .single();

        if (fetchError) {
          throw new Error(`Failed to fetch analysis: ${fetchError.message}`);
        }

        // For backward compatibility with existing system
        const currentTimestamp = current.updated_at;
        const messages = current.full_analysis?.messages || [];
        
        // Create new message
        const newMessage = {
          agent: agentName,
          message: message,
          timestamp: new Date().toISOString(),
          type: messageType
        };
        
        // Append the new message
        const updatedMessages = [...messages, newMessage];

        // Try to update with optimistic locking if updated_at exists
        let updateQuery = supabase
          .from('analysis_history')
          .update({
            full_analysis: {
              ...current.full_analysis,
              messages: updatedMessages,
              lastUpdated: new Date().toISOString()
            },
            updated_at: new Date().toISOString() // Explicitly update updated_at
          })
          .eq('id', analysisId);

        // Only add timestamp check if the column exists
        if (currentTimestamp) {
          updateQuery = updateQuery.eq('updated_at', currentTimestamp);
        }

        const { data: updateResult, error: updateError } = await updateQuery.select();

        if (updateError) {
          throw new Error(`Failed to update analysis: ${updateError.message}`);
        }

        // If we have timestamp checking and no rows were updated, retry
        if (currentTimestamp && (!updateResult || updateResult.length === 0)) {
          retries++;
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
            console.log(`Retry ${retries} for ${agentName} due to concurrent update`);
            continue;
          }
          throw new Error('Concurrent modification detected after max retries');
        }

        console.log(`✅ Successfully appended message for ${agentName}`);
        return { success: true };
        
      } catch (error) {
        if (retries < maxRetries - 1) {
          retries++;
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
          continue;
        }
        console.error(`Failed to update full_analysis for ${agentName} after ${retries} retries:`, error);
        // Even if main update fails, we have the message in the queue
        return { success: true, warning: 'Message queued but full_analysis update failed' };
      }
    }
    
  } catch (error) {
    console.error(`Failed to append message for ${agentName}:`, error);
    return { success: false, error: error.message };
  }
  
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Atomically update agent insights
 */
export async function updateAgentInsights(
  supabase: any,
  analysisId: string,
  agentKey: string,
  insights: any
) {
  try {
    // Get current insights
    const { data: current, error: fetchError } = await supabase
      .from('analysis_history')
      .select('agent_insights')
      .eq('id', analysisId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch insights: ${fetchError.message}`);
    }

    // Update with new insights
    const updatedInsights = {
      ...current.agent_insights,
      [agentKey]: insights
    };

    const { error: updateError } = await supabase
      .from('analysis_history')
      .update({
        agent_insights: updatedInsights,
        updated_at: new Date().toISOString() // Explicitly update updated_at
      })
      .eq('id', analysisId);

    if (updateError) {
      throw new Error(`Failed to update insights: ${updateError.message}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to update insights for ${agentKey}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Update workflow step status atomically
 */
export async function updateWorkflowStepStatus(
  supabase: any,
  analysisId: string,
  phaseId: string,
  agentName: string,
  status: string
) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`🔄 Updating workflow status: ${agentName} -> ${status} in ${phaseId} phase [v3.0-${timestamp}]`);

    // Use atomic database function to prevent race conditions
    console.log(`📝 Calling update_workflow_step_status with:`, {
      p_analysis_id: analysisId,
      p_phase_id: phaseId,
      p_agent_name: agentName,
      p_status: status
    });
    
    const { data, error } = await supabase.rpc('update_workflow_step_status', {
      p_analysis_id: analysisId,
      p_phase_id: phaseId,
      p_agent_name: agentName,
      p_status: status
    });

    if (error) {
      console.error(`❌ Workflow DB function failed for ${agentName}:`, error);
      
      // Fallback to optimistic locking
      console.log(`🔄 ${agentName} falling back to optimistic locking for workflow update...`);
      
      let retries = 3;
      while (retries > 0) {
        try {
          // First, let's check if there are duplicates
          const { data: allMatches, error: checkError } = await supabase
            .from('analysis_history')
            .select('id, created_at')
            .eq('id', analysisId);
          
          if (checkError) {
            throw new Error(`Failed to check for duplicates: ${checkError.message}`);
          }
          
          if (!allMatches || allMatches.length === 0) {
            console.warn(`Analysis ${analysisId} not found - may have been deleted`);
            return { success: false, error: 'Analysis not found' };
          }
          
          if (allMatches.length > 1) {
            console.error(`❌ CRITICAL: Found ${allMatches.length} duplicate analyses with ID ${analysisId}!`);
            console.error(`   Duplicates:`, allMatches.map(a => ({ id: a.id, created_at: a.created_at })));
            
            // Use the most recent one
            const mostRecent = allMatches.sort((a, b) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0];
            console.warn(`   Using most recent analysis created at ${mostRecent.created_at}`);
          }
          
          // Now fetch the single record (or most recent if duplicates)
          const { data: current, error: fetchError } = await supabase
            .from('analysis_history')
            .select('full_analysis')
            .eq('id', analysisId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (fetchError) {
            throw new Error(`Failed to fetch analysis: ${fetchError.message}`);
          }

          const workflowSteps = current.full_analysis?.workflowSteps || [];
          const stepIndex = workflowSteps.findIndex((s: any) => s.id === phaseId);
          
          if (stepIndex >= 0) {
            const agentIndex = workflowSteps[stepIndex].agents.findIndex(
              (a: any) => a.name === agentName ||
                (agentName === 'Analysis Portfolio Manager' && a.name === 'Portfolio Manager')
            );
            
            if (agentIndex >= 0) {
              workflowSteps[stepIndex].agents[agentIndex].status = status;
              workflowSteps[stepIndex].agents[agentIndex].progress = status === 'completed' ? 100 : (status === 'error' ? 0 : 50);
              if (status === 'completed') {
                workflowSteps[stepIndex].agents[agentIndex].completedAt = new Date().toISOString();
              } else if (status === 'error') {
                workflowSteps[stepIndex].agents[agentIndex].errorAt = new Date().toISOString();
              }
            }
          }

          const { error: updateError } = await supabase
            .from('analysis_history')
            .update({
              full_analysis: {
                ...current.full_analysis,
                workflowSteps,
                lastUpdated: new Date().toISOString()
              },
              updated_at: new Date().toISOString() // Explicitly update updated_at
            })
            .eq('id', analysisId);

          if (!updateError) {
            console.log(`✅ ${agentName} workflow status updated via fallback (attempt ${4 - retries})`);
            return { success: true };
          }

          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (retryError) {
          retries--;
          if (retries === 0) throw retryError;
        }
      }
      
      return { success: false, error: 'Failed workflow update after fallback retries' };
    }

    console.log(`📊 RPC returned - data:`, data, `error:`, error);
    
    if (data) {
      console.log(`✅ ${agentName} workflow status updated to ${status} via DB function`);
      return { success: true };
    } else {
      if (agentName === 'Analysis Portfolio Manager') {
        console.warn(`⚠️ Workflow step not found for ${agentName}; attempting legacy Portfolio Manager fallback`);
        return await updateWorkflowStepStatus(
          supabase,
          analysisId,
          phaseId,
          'Portfolio Manager',
          status
        );
      }
      console.warn(`⚠️ Workflow DB function returned false for ${agentName}`);
      console.warn(`   This means either the phase '${phaseId}' or agent '${agentName}' was not found in the workflow structure`);
      return { success: false, error: 'Workflow DB function returned false' };
    }

  } catch (error) {
    console.error(`❌ Failed to update workflow status for ${agentName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Atomically update analysis phase and status
 * NOTE: This is for status updates only - use appendAnalysisMessage for actual content
 */
export async function updateAnalysisPhase(
  supabase: any,
  analysisId: string,
  currentPhase: string,
  message: {
    agent: string;
    message: string;
    timestamp: string;
    type: string;
  },
  maxRetries: number = 5
) {
  // For status messages, we don't need to append to messages array
  // Just update the current phase status
  try {
    let retries = 0;
    
    while (retries < maxRetries) {
      try {
        // Get current state with timestamp for optimistic locking
        const { data: current, error: fetchError } = await supabase
          .from('analysis_history')
          .select('full_analysis, updated_at, analysis_status')
          .eq('id', analysisId)
          .single();

        if (fetchError) {
          throw new Error(`Failed to fetch analysis: ${fetchError.message}`);
        }

        const currentTimestamp = current.updated_at;

        // Check if analysis has been cancelled - DO NOT override cancelled status
        if (current.analysis_status === ANALYSIS_STATUS.CANCELLED) {
          console.log(`⚠️ Analysis ${analysisId} is cancelled, skipping phase update`);
          return { 
            success: false, 
            error: 'Analysis has been cancelled',
            cancelled: true 
          };
        }

        // Only update to RUNNING if current status is PENDING or already RUNNING
        // This preserves COMPLETED, ERROR, and CANCELLED states
        let newStatus = current.analysis_status;
        if (current.analysis_status === ANALYSIS_STATUS.PENDING || 
            current.analysis_status === ANALYSIS_STATUS.RUNNING) {
          newStatus = ANALYSIS_STATUS.RUNNING;
        }

        // Update only the phase status, not messages
        // Messages should be added via appendAnalysisMessage
        let updateQuery = supabase
          .from('analysis_history')
          .update({
            full_analysis: {
              ...current.full_analysis,
              // Remove status from full_analysis - use analysis_status field instead
              currentPhase: currentPhase,
              lastUpdated: new Date().toISOString(),
              // Store the latest status message separately
              currentStatus: {
                agent: message.agent,
                message: message.message,
                timestamp: message.timestamp
              }
            },
            // Only update status if not in terminal state
            analysis_status: newStatus,
            updated_at: new Date().toISOString() // Explicitly update updated_at
          })
          .eq('id', analysisId);

        // Add optimistic locking if timestamp exists
        if (currentTimestamp) {
          updateQuery = updateQuery.eq('updated_at', currentTimestamp);
        }

        const { data: updateResult, error: updateError } = await updateQuery.select();

        if (updateError) {
          throw new Error(`Failed to update analysis phase: ${updateError.message}`);
        }

        // If we have timestamp checking and no rows were updated, retry
        if (currentTimestamp && (!updateResult || updateResult.length === 0)) {
          retries++;
          if (retries < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
            console.log(`Retry ${retries} for phase update due to concurrent modification`);
            continue;
          }
          throw new Error('Concurrent modification detected after max retries');
        }

        console.log(`✅ Successfully updated phase to: ${currentPhase}`);
        return { success: true };
        
      } catch (error) {
        if (retries < maxRetries - 1) {
          retries++;
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 100));
          continue;
        }
        throw error;
      }
    }
    
  } catch (error) {
    console.error(`Failed to update analysis phase after ${maxRetries} retries:`, error);
    return { success: false, error: error.message };
  }
  
  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Atomically update debate rounds and messages
 */
export async function updateDebateRounds(
  supabase: any,
  analysisId: string,
  agentName: string,
  aiResponse: string,
  currentRound: number,
  points: string[]
) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`🔄 ${agentName} updating debate round ${currentRound} using atomic DB function v3.0 [${timestamp}]`);

    // First, add the message to the message queue (truly atomic)
    const { error: queueError } = await supabase
      .from('analysis_messages')
      .insert({
        analysis_id: analysisId,
        agent_name: agentName,
        message: aiResponse,
        message_type: 'research',
        metadata: { round: currentRound }
      });

    if (queueError) {
      console.error('Failed to insert into message queue:', queueError);
    }

    // Determine agent type for database function
    const agentType = agentName === 'Bull Researcher' ? 'bull' : 'bear';
    
    // Use the atomic database function to prevent race conditions
    const { data, error } = await supabase.rpc('update_debate_round', {
      p_analysis_id: analysisId,
      p_round: currentRound,
      p_agent_type: agentType,
      p_response: aiResponse,
      p_points: points
    });

    if (error) {
      console.error(`❌ Database function failed for ${agentName}:`, error);
      
      // Fallback to optimistic locking if database function fails
      console.log(`🔄 ${agentName} falling back to optimistic locking...`);
      
      let retries = 3;
      while (retries > 0) {
        try {
          const { data: current, error: fetchError } = await supabase
            .from('analysis_history')
            .select('full_analysis')
            .eq('id', analysisId)
            .single();

          if (fetchError) {
            throw new Error(`Failed to fetch analysis: ${fetchError.message}`);
          }

          const messages = current.full_analysis?.messages || [];
          messages.push({
            agent: agentName,
            message: aiResponse,
            timestamp: new Date().toISOString(),
            type: 'research',
            round: currentRound
          });

          const debateRounds = current.full_analysis?.debateRounds || [];
          
          // Initialize round if it doesn't exist
          if (!debateRounds[currentRound - 1]) {
            debateRounds[currentRound - 1] = { 
              round: currentRound, 
              timestamp: new Date().toISOString() 
            };
          }
          
          // IMPORTANT: Preserve existing data from the other researcher
          const existingRound = debateRounds[currentRound - 1];
          
          console.log(`🔍 ${agentName} - Round ${currentRound} BEFORE update:`, {
            hasBull: !!existingRound.bull,
            hasBear: !!existingRound.bear,
          });
          
          if (agentName === 'Bull Researcher') {
            existingRound.bullPoints = points;
            existingRound.bull = aiResponse;
            console.log(`🐂 Bull setting data, preserving bear: ${!!existingRound.bear}`);
          } else if (agentName === 'Bear Researcher') {
            existingRound.bearPoints = points;
            existingRound.bear = aiResponse;
            console.log(`🐻 Bear setting data, preserving bull: ${!!existingRound.bull}`);
          }

          const { error: updateError } = await supabase
            .from('analysis_history')
            .update({
              full_analysis: {
                ...current.full_analysis,
                messages,
                debateRounds,
                lastUpdated: new Date().toISOString()
              },
              updated_at: new Date().toISOString() // Explicitly update updated_at
            })
            .eq('id', analysisId);

          if (!updateError) {
            console.log(`✅ ${agentName} fallback update successful (attempt ${4 - retries})`);
            return { success: true };
          }

          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (retryError) {
          retries--;
          if (retries === 0) throw retryError;
        }
      }
      
      return { success: false, error: 'Failed after fallback retries' };
    }

    if (data) {
      console.log(`✅ ${agentName} successfully updated debate round ${currentRound} via DB function`);
      return { success: true };
    } else {
      console.warn(`⚠️ Database function returned false for ${agentName}`);
      return { success: false, error: 'Database function returned false' };
    }

  } catch (error) {
    console.error(`❌ Failed to update debate rounds for ${agentName}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize debate round atomically
 */
export async function initializeDebateRound(
  supabase: any,
  analysisId: string,
  round: number
) {
  try {
    const { data: current, error: fetchError } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch analysis: ${fetchError.message}`);
    }

    const debateRounds = current.full_analysis?.debateRounds || [];
    
    // Only add if this round doesn't exist yet
    if (!debateRounds.find((r: any) => r.round === round)) {
      debateRounds.push({
        round,
        startedAt: new Date().toISOString()
      });
    }

    const { error: updateError } = await supabase
      .from('analysis_history')
      .update({
        full_analysis: {
          ...current.full_analysis,
          debateRounds,
          currentDebateRound: round,
          lastUpdated: new Date().toISOString()
        },
        updated_at: new Date().toISOString() // Explicitly update updated_at
      })
      .eq('id', analysisId);

    if (updateError) {
      throw new Error(`Failed to initialize debate round: ${updateError.message}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to initialize debate round ${round}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Update research conclusion atomically
 */
export async function updateResearchConclusion(
  supabase: any,
  analysisId: string,
  researchConclusion: any
) {
  try {
    const { data: current, error: fetchError } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch analysis: ${fetchError.message}`);
    }

    const { error: updateError } = await supabase
      .from('analysis_history')
      .update({
        full_analysis: {
          ...current.full_analysis,
          researchConclusion: researchConclusion,
          lastUpdated: new Date().toISOString()
        },
        updated_at: new Date().toISOString() // Explicitly update updated_at
      })
      .eq('id', analysisId);

    if (updateError) {
      throw new Error(`Failed to update research conclusion: ${updateError.message}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to update research conclusion:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Update final analysis results atomically (used by Risk Manager)
 */
export async function updateFinalAnalysisResults(
  supabase: any,
  analysisId: string,
  decision: string,
  confidence: number,
  finalAssessment: any
) {
  try {
    const { data: current, error: fetchError } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch analysis: ${fetchError.message}`);
    }

    const { error: updateError } = await supabase
      .from('analysis_history')
      .update({
        full_analysis: {
          ...current.full_analysis,
          // Remove status from full_analysis - use analysis_status field instead
          completedAt: new Date().toISOString(),
          finalAssessment: finalAssessment,
          lastUpdated: new Date().toISOString()
        },
        decision: decision,
        confidence: confidence,
        analysis_status: ANALYSIS_STATUS.COMPLETED,  // Mark as complete - this is the final agent
        updated_at: new Date().toISOString() // Explicitly update updated_at
      })
      .eq('id', analysisId);

    if (updateError) {
      throw new Error(`Failed to update final analysis results: ${updateError.message}`);
    }

    return { success: true };
  } catch (error) {
    console.error(`Failed to update final analysis results:`, error);
    return { success: false, error: error.message };
  }
}

interface MarkAnalysisCompletedOptions {
  fullAnalysisPatch?: Record<string, unknown>;
  additionalUpdates?: Record<string, unknown>;
  maxRetries?: number;
  force?: boolean;
  skipWorkflowCheck?: boolean;
}

interface MarkAnalysisCompletedResult {
  success: boolean;
  cancelled?: boolean;
  alreadyCompleted?: boolean;
  activeAgents?: number;
  error?: string;
}

export async function markAnalysisCompleted(
  supabase: any,
  analysisId: string,
  options: MarkAnalysisCompletedOptions = {}
): Promise<MarkAnalysisCompletedResult> {
  const {
    fullAnalysisPatch = {},
    additionalUpdates = {},
    maxRetries = 5,
    force = false,
    skipWorkflowCheck = false
  } = options;

  let attempt = 0;

  while (attempt < maxRetries) {
    const { data: current, error: fetchError } = await supabase
      .from('analysis_history')
      .select('full_analysis, updated_at, analysis_status')
      .eq('id', analysisId)
      .single();

    if (fetchError) {
      console.error(`Failed to fetch analysis for completion update:`, fetchError);
      return { success: false, error: fetchError.message };
    }

    if (current.analysis_status === ANALYSIS_STATUS.CANCELLED) {
      console.log(`⚠️ Analysis ${analysisId} is cancelled, skipping completion update`);
      return { success: false, cancelled: true };
    }

    if (current.analysis_status === ANALYSIS_STATUS.COMPLETED && !force) {
      return { success: true, alreadyCompleted: true };
    }

    if (!force && !skipWorkflowCheck) {
      const workflowSteps = current.full_analysis?.workflowSteps || [];
      const activeAgents = workflowSteps.reduce((count: number, phase: any) => {
        if (!phase?.agents) return count;
        const activeInPhase = phase.agents.filter((agent: any) => {
          const status = agent?.status;
          return status !== 'completed' && status !== 'skipped';
        }).length;
        return count + activeInPhase;
      }, 0);

      if (activeAgents > 0) {
        console.log(`⚠️ Workflow still has ${activeAgents} active agent(s); deferring completion update`);
        return { success: false, activeAgents };
      }
    }

    const currentTimestamp = current.updated_at;
    const existingFullAnalysis = (current.full_analysis && typeof current.full_analysis === 'object')
      ? current.full_analysis
      : {};

    const mergedFullAnalysis = {
      ...existingFullAnalysis,
      ...fullAnalysisPatch
    };

    if (Object.keys(mergedFullAnalysis).length > 0) {
      mergedFullAnalysis.lastUpdated = new Date().toISOString();
    }

    const updatePayload: Record<string, unknown> = {
      analysis_status: ANALYSIS_STATUS.COMPLETED,
      updated_at: new Date().toISOString(),
      ...additionalUpdates
    };

    if (Object.keys(mergedFullAnalysis).length > 0) {
      updatePayload.full_analysis = mergedFullAnalysis;
    }

    let updateQuery = supabase
      .from('analysis_history')
      .update(updatePayload)
      .eq('id', analysisId);

    if (currentTimestamp) {
      updateQuery = updateQuery.eq('updated_at', currentTimestamp);
    }

    const { data: updateResult, error: updateError } = await updateQuery.select();

    if (updateError) {
      console.error(`Failed to mark analysis as completed (attempt ${attempt + 1}):`, updateError);
      return { success: false, error: updateError.message };
    }

    if (currentTimestamp && (!updateResult || updateResult.length === 0)) {
      attempt++;
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, backoff));
        continue;
      }
      return { success: false, error: 'Concurrent modification detected after max retries' };
    }

    console.log(`✅ Analysis ${analysisId} marked as COMPLETED via atomic helper`);
    return { success: true };
  }

  return { success: false, error: 'Max retries exceeded marking analysis complete' };
}

/**
 * Set agent workflow step to error status atomically AND notify coordinator
 * This ensures agents that fail are properly marked as failed and coordinator is informed
 */
export async function setAgentToError(
  supabase: any,
  analysisId: string,
  phaseId: string,
  agentName: string,
  errorMessage: string,
  errorType?: 'rate_limit' | 'api_key' | 'ai_error' | 'data_fetch' | 'other',
  ticker?: string,
  userId?: string,
  apiSettings?: any
) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`❌ Setting ${agentName} to error status: ${errorMessage}`);

    // Also store error in agent insights for detailed error tracking
    const normalizedAgentKey = agentName.toLowerCase().replace(/\s+/g, '');
    const canonicalAgentKey = normalizedAgentKey === 'analysisportfoliomanager'
      ? 'portfoliomanager'
      : normalizedAgentKey;

    const errorInsight = {
      error: errorMessage,
      errorType: errorType || 'other',
      timestamp: timestamp,
      status: 'error'
    };

    const primaryInsightResult = await updateAgentInsights(
      supabase,
      analysisId,
      `${canonicalAgentKey}_error`,
      errorInsight
    );

    if (normalizedAgentKey !== canonicalAgentKey) {
      await updateAgentInsights(
        supabase,
        analysisId,
        `${normalizedAgentKey}_error`,
        errorInsight
      );
    }

    // Append error message to analysis
    const messageResult = await appendAnalysisMessage(
      supabase,
      analysisId,
      agentName,
      `❌ Error: ${errorMessage}`,
      'error'
    );

    // Do not mutate workflow status here. The coordinator owns the decision to
    // escalate an agent failure into an error state (or to retry/continue).
    console.log(`⚠️ Agent ${agentName} reported an error - notifying coordinator for evaluation`);

    // CRITICAL: Notify the coordinator about the agent error
    // The coordinator will decide whether to continue, stop, or notify rebalance-coordinator
    // If ticker, userId, and apiSettings are provided, notify the coordinator
    if (ticker && userId && apiSettings) {
      console.log(`📡 Notifying analysis-coordinator about ${agentName} error`);
      
      try {
        // Convert agentName to function name format for coordinator
    const agentFunctionName = getAgentFunctionName(agentName);
        
        // Notify coordinator with all required data for potential next agent invocation
        // NOTE: Do NOT send 'action' field - coordinator expects agent callbacks without action
        await supabase.functions.invoke('analysis-coordinator', {
          body: {
            agent: agentFunctionName,
            analysisId,
            ticker,
            userId,
            apiSettings,
            phase: phaseId,
            completionType: 'agent_error',
            error: errorMessage,
            errorType: errorType || 'other'
          }
        });
        console.log(`✅ Coordinator notified about ${agentName} error`);
      } catch (notifyError) {
        console.error(`❌ Failed to notify coordinator about ${agentName} error:`, notifyError);
        // Continue anyway - the error status has been set
      }
    } else {
      console.warn(`⚠️ Missing ticker/userId/apiSettings - cannot notify coordinator about ${agentName} error`);
      console.warn(`   Workflow may stall. Agents should pass these parameters to setAgentToError.`);
    }

    const allSucceeded = primaryInsightResult.success && messageResult.success;

    return {
      success: allSucceeded,
      insightsResult: primaryInsightResult,
      messageResult,
      analysisStatusUpdate: true
    };
  } catch (error) {
    console.error(`Failed to set ${agentName} to error:`, error);
    return { success: false, error: error.message };
  }
}

function getAgentFunctionName(agentName: string): string {
  if (!agentName) return '';
  const normalized = agentName.toLowerCase().trim().replace(/\s+/g, '-');
  if (normalized === 'portfolio-manager' || normalized === 'analysis-portfolio-manager') {
    return 'analysis-portfolio-manager';
  }
  if (normalized.startsWith('agent-')) {
    return normalized;
  }
  return `agent-${normalized}`;
}

/**
 * Update rebalance workflow step status atomically
 * This is for rebalance-specific workflow tracking
 */
export async function updateRebalanceWorkflowStep(
  supabase: any,
  rebalanceRequestId: string,
  stepName: string,
  status: string,
  stepData?: any
) {
  try {
    const timestamp = new Date().toISOString();
    console.log(`🔄 Updating rebalance workflow step: ${stepName} -> ${status} [${timestamp}]`);

    // Use atomic database function to prevent race conditions
    const { data, error } = await supabase.rpc('update_rebalance_workflow_step', {
      p_request_id: rebalanceRequestId,
      p_step_name: stepName,
      p_step_status: status,
      p_step_data: stepData || {}
    });

    if (error) {
      console.error(`❌ Rebalance workflow DB function failed for ${stepName}:`, error);
      return { success: false, error: error.message };
    }

    if (data) {
      console.log(`✅ ${stepName} workflow status updated to ${status} via DB function`);
      return { success: true };
    } else {
      console.warn(`⚠️ Rebalance workflow DB function returned false for ${stepName}`);
      return { success: false, error: 'Workflow DB function returned false' };
    }

  } catch (error) {
    console.error(`❌ Failed to update rebalance workflow status for ${stepName}:`, error);
    return { success: false, error: error.message };
  }
}
