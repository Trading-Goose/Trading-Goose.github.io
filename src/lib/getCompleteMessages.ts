import { supabase } from './supabase';

/**
 * Fetch complete messages for an analysis, combining messages from full_analysis 
 * and the message queue to ensure no messages are lost
 */
export async function getCompleteMessages(analysisId: string) {
  try {
    // First get messages from analysis_history (main source)
    const { data: historyData, error: historyError } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();
    
    if (historyError) {
      console.warn('Failed to fetch analysis history:', historyError);
      return {
        success: false,
        messages: [],
        error: historyError.message
      };
    }

    // Try to get messages from the queue (might not exist yet)
    let queueData = [];
    try {
      const { data, error: queueError } = await supabase
        .from('analysis_messages')
        .select('*')
        .eq('analysis_id', analysisId)
        .order('created_at', { ascending: true });
      
      if (!queueError && data) {
        queueData = data;
      }
    } catch (queueError) {
      // Silently handle case where analysis_messages table doesn't exist
      console.log('Note: analysis_messages table not available yet');
    }

    const messagesFromHistory = historyData?.full_analysis?.messages || [];
    const messagesFromQueue = queueData || [];

    // Convert queue messages to the expected format
    const formattedQueueMessages = messagesFromQueue.map(qm => ({
      agent: qm.agent_name,
      message: qm.message,
      type: qm.message_type,
      timestamp: qm.created_at
    }));

    // Combine and deduplicate messages
    const allMessages = [...messagesFromHistory];
    
    // Add queue messages that aren't already in history
    formattedQueueMessages.forEach(queueMsg => {
      const exists = allMessages.some(histMsg => 
        histMsg.agent === queueMsg.agent && 
        histMsg.message === queueMsg.message &&
        Math.abs(new Date(histMsg.timestamp).getTime() - new Date(queueMsg.timestamp).getTime()) < 5000 // Within 5 seconds
      );
      
      if (!exists) {
        allMessages.push(queueMsg);
      }
    });

    // Sort by timestamp
    allMessages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      success: true,
      messages: allMessages,
      historyCount: messagesFromHistory.length,
      queueCount: messagesFromQueue.length,
      totalCount: allMessages.length
    };
  } catch (error) {
    console.error('Error fetching complete messages:', error);
    return {
      success: false,
      messages: [],
      error: error.message
    };
  }
}

/**
 * Process queued messages into the main analysis history
 * This can be called periodically to consolidate messages
 */
export async function processQueuedMessages(analysisId: string) {
  try {
    // Try to get all unprocessed messages (table might not exist)
    let queuedMessages = [];
    try {
      const { data, error: queueError } = await supabase
        .from('analysis_messages')
        .select('*')
        .eq('analysis_id', analysisId)
        .eq('processed', false)
        .order('created_at', { ascending: true });

      if (queueError || !data?.length) {
        return { success: true, processed: 0 };
      }
      queuedMessages = data;
    } catch (error) {
      console.log('Note: analysis_messages table not available yet');
      return { success: true, processed: 0 };
    }

    // Get current analysis
    const { data: analysis, error: fetchError } = await supabase
      .from('analysis_history')
      .select('full_analysis')
      .eq('id', analysisId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch analysis: ${fetchError.message}`);
    }

    const currentMessages = analysis.full_analysis?.messages || [];
    
    // Add queued messages that aren't already in the history
    const newMessages = [];
    const processedIds = [];
    
    queuedMessages.forEach(qm => {
      const formatted = {
        agent: qm.agent_name,
        message: qm.message,
        type: qm.message_type,
        timestamp: qm.created_at
      };
      
      const exists = currentMessages.some(m => 
        m.agent === formatted.agent && 
        m.message === formatted.message &&
        Math.abs(new Date(m.timestamp).getTime() - new Date(formatted.timestamp).getTime()) < 5000
      );
      
      if (!exists) {
        newMessages.push(formatted);
        processedIds.push(qm.id);
      }
    });

    if (newMessages.length > 0) {
      // Update analysis with new messages
      const allMessages = [...currentMessages, ...newMessages].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const { error: updateError } = await supabase
        .from('analysis_history')
        .update({
          full_analysis: {
            ...analysis.full_analysis,
            messages: allMessages,
            lastUpdated: new Date().toISOString()
          }
        })
        .eq('id', analysisId);

      if (updateError) {
        throw new Error(`Failed to update analysis: ${updateError.message}`);
      }

      // Mark messages as processed
      if (processedIds.length > 0) {
        await supabase
          .from('analysis_messages')
          .update({ processed: true })
          .in('id', processedIds);
      }
    }

    return { success: true, processed: newMessages.length };
  } catch (error) {
    console.error('Error processing queued messages:', error);
    return { success: false, processed: 0, error: error.message };
  }
}