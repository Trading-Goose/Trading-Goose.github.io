-- Migration: Change analysis_depth to news_social_optimization (Safe Version)
-- This migration safely handles dependent objects

-- Step 1: Add the new column
ALTER TABLE public.api_settings 
ADD COLUMN IF NOT EXISTS news_social_optimization VARCHAR(20) DEFAULT 'normal';

-- Step 2: Migrate existing data
-- Map existing numeric depth values to optimization levels
UPDATE public.api_settings 
SET news_social_optimization = CASE 
  WHEN analysis_depth <= 3 THEN 'normal'
  WHEN analysis_depth >= 4 THEN 'balanced'
  ELSE 'normal'
END
WHERE analysis_depth IS NOT NULL AND news_social_optimization = 'normal';

-- Step 3: Add constraint for new column
ALTER TABLE public.api_settings 
ADD CONSTRAINT api_settings_news_social_optimization_check 
CHECK (news_social_optimization IN ('normal', 'balanced'));

-- Step 4: Check what views depend on analysis_depth
-- Run this query first to see the view definition:
-- SELECT definition FROM pg_views WHERE viewname = 'api_settings_unified';

-- Step 5: For now, keep both columns during transition
-- Comment out the DROP COLUMN commands below until you've updated all dependent objects

-- Step 6: Update the view to use the new column (example - adjust based on actual view)
-- You'll need to get the actual view definition and update it
/*
CREATE OR REPLACE VIEW public.api_settings_unified AS
SELECT 
    -- Include all existing columns but replace analysis_depth with news_social_optimization
    user_id,
    ai_provider,
    ai_api_key,
    ai_model,
    news_social_optimization,  -- New column instead of analysis_depth
    -- ... include all other columns from the original view
FROM public.api_settings;
*/

-- Step 7: After updating all dependent objects, you can safely drop the old column
-- Uncomment these lines when ready:
/*
ALTER TABLE public.api_settings 
DROP CONSTRAINT IF EXISTS api_settings_analysis_depth_check;

ALTER TABLE public.api_settings 
DROP COLUMN IF EXISTS analysis_depth;
*/

-- Step 8: Update column comment
COMMENT ON COLUMN public.api_settings.news_social_optimization IS 'News and social media analysis optimization: normal=standard coverage, balanced=more thorough analysis';

-- Step 9: Grant permissions (if needed)
-- GRANT SELECT, UPDATE ON public.api_settings TO authenticated;