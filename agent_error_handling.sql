-- Create RPC function to update agent errors
CREATE OR REPLACE FUNCTION public.update_agent_error(
    p_analysis_id UUID,
    p_agent_name TEXT,
    p_error_message TEXT,
    p_error_type TEXT DEFAULT 'other'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update the analysis_history with agent error information
    UPDATE public.analysis_history 
    SET agent_insights = COALESCE(agent_insights, '{}'::jsonb) || 
        jsonb_build_object(
            p_agent_name || '_error', 
            jsonb_build_object(
                'message', p_error_message,
                'type', p_error_type,
                'timestamp', NOW()::text
            )
        )
    WHERE id = p_analysis_id;
    
    -- Also insert into analysis_messages for tracking
    INSERT INTO public.analysis_messages (analysis_id, agent_name, message, message_type)
    VALUES (p_analysis_id, p_agent_name, 'ERROR: ' || p_error_message, 'error');
    
    RETURN jsonb_build_object('success', true, 'message', 'Agent error recorded');
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Create RPC function to update workflow step status
CREATE OR REPLACE FUNCTION public.update_workflow_step_status(
    p_analysis_id UUID,
    p_phase_id TEXT,
    p_agent_name TEXT,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_full_analysis JSONB;
    v_workflow_steps JSONB;
    v_step_found BOOLEAN := false;
    v_step JSONB;
    v_agents JSONB;
    v_agent JSONB;
    v_updated_agents JSONB := '[]'::jsonb;
    v_updated_steps JSONB := '[]'::jsonb;
BEGIN
    -- Get current full_analysis
    SELECT full_analysis INTO v_full_analysis
    FROM public.analysis_history
    WHERE id = p_analysis_id;
    
    -- Initialize if null
    IF v_full_analysis IS NULL THEN
        v_full_analysis := '{}'::jsonb;
    END IF;
    
    -- Get workflow steps
    v_workflow_steps := COALESCE(v_full_analysis->'workflowSteps', '[]'::jsonb);
    
    -- Update the specific agent status in the workflow step
    FOR i IN 0..jsonb_array_length(v_workflow_steps) - 1 LOOP
        v_step := v_workflow_steps->i;
        
        IF v_step->>'id' = p_phase_id THEN
            v_step_found := true;
            v_agents := COALESCE(v_step->'agents', '[]'::jsonb);
            v_updated_agents := '[]'::jsonb;
            
            -- Update the specific agent
            FOR j IN 0..jsonb_array_length(v_agents) - 1 LOOP
                v_agent := v_agents->j;
                
                IF v_agent->>'name' = p_agent_name THEN
                    -- Update this agent's status
                    v_agent := v_agent || jsonb_build_object('status', p_status);
                END IF;
                
                v_updated_agents := v_updated_agents || v_agent;
            END LOOP;
            
            -- Update the step with new agents array
            v_step := v_step || jsonb_build_object('agents', v_updated_agents);
        END IF;
        
        v_updated_steps := v_updated_steps || v_step;
    END LOOP;
    
    -- Update the full_analysis with modified workflow steps
    v_full_analysis := v_full_analysis || jsonb_build_object('workflowSteps', v_updated_steps);
    
    -- Save back to database
    UPDATE public.analysis_history 
    SET full_analysis = v_full_analysis
    WHERE id = p_analysis_id;
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Workflow step status updated',
        'step_found', v_step_found
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_agent_error(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_workflow_step_status(UUID, TEXT, TEXT, TEXT) TO authenticated;