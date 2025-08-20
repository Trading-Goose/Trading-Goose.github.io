-- Fix RLS policy for trading_actions table
-- Remove the problematic policy that accesses auth.users table

-- Drop the problematic policy
DROP POLICY IF EXISTS "trading_actions_simple_access" ON public.trading_actions;

-- Create a simpler policy that doesn't access auth.users
CREATE POLICY "trading_actions_user_access" ON public.trading_actions 
FOR SELECT 
USING (
  current_setting('role') = 'service_role' 
  OR user_id = auth.uid()
);

-- Verify the policy
SELECT 
  policyname, 
  cmd, 
  qual 
FROM pg_policies 
WHERE tablename = 'trading_actions' 
  AND schemaname = 'public';