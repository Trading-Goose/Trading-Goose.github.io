-- Alternative approach using a function to handle cancellation
-- This bypasses RLS issues by using a SECURITY DEFINER function

-- Create a function to cancel rebalance requests
CREATE OR REPLACE FUNCTION public.cancel_rebalance_request(p_request_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_current_status TEXT;
BEGIN
    -- Get the user_id and current status of the request
    SELECT user_id, status INTO v_user_id, v_current_status
    FROM public.rebalance_requests
    WHERE id = p_request_id;
    
    -- Check if request exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rebalance request not found';
    END IF;
    
    -- Check if the user owns this request
    IF v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: You can only cancel your own rebalance requests';
    END IF;
    
    -- Check if already in terminal state
    IF v_current_status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot cancel: Rebalance is already %', v_current_status;
    END IF;
    
    -- Update the request to cancelled
    UPDATE public.rebalance_requests
    SET 
        status = 'cancelled',
        is_canceled = true,
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Also cancel any related analyses
    UPDATE public.analysis_history
    SET 
        is_canceled = true,
        analysis_status = -1
    WHERE 
        rebalance_request_id = p_request_id
        AND analysis_status = 0; -- Only cancel running analyses
    
    RETURN TRUE;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.cancel_rebalance_request(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.cancel_rebalance_request IS 'Safely cancels a rebalance request and its associated analyses. Only the owner can cancel their own requests.';

-- Test the function (replace with actual UUID)
-- SELECT public.cancel_rebalance_request('your-rebalance-id-here');