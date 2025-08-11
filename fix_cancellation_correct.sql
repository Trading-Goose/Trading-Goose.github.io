-- Fix RLS policy for rebalance_requests to allow cancellation
-- Run this in the Supabase SQL Editor

-- First, drop the existing restrictive update policy
DROP POLICY IF EXISTS "Users can update own pending rebalance requests" ON public.rebalance_requests;

-- Drop any other conflicting update policies
DROP POLICY IF EXISTS "Users can update own rebalance requests" ON public.rebalance_requests;

-- Create a simpler policy that allows users to update their own rebalance requests
-- We'll rely on application logic to enforce what can be updated
CREATE POLICY "Users can update own rebalance requests" 
ON public.rebalance_requests 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- The above policy allows users to update their own rebalance requests
-- The application will control what fields can be updated based on the current status

-- Verify the policy was created
SELECT 
    polname as policy_name,
    polcmd as command,
    pol.polpermissive as is_permissive,
    CASE pol.polcmd 
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT' 
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
    END as operation
FROM pg_policy pol
JOIN pg_class pc ON pol.polrelid = pc.oid
WHERE pc.relname = 'rebalance_requests'
AND pc.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY pol.polname;

-- Also check current rebalance requests to see their status
SELECT id, status, is_canceled, created_at, updated_at
FROM public.rebalance_requests
WHERE user_id = auth.uid()
ORDER BY created_at DESC
LIMIT 5;