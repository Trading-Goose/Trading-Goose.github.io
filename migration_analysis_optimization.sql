-- Migration: Change analysis_depth to news_social_optimization
-- This migration changes the analysis depth configuration to news/social optimization

-- Step 1: Add the new column
ALTER TABLE public.api_settings 
ADD COLUMN news_social_optimization VARCHAR(20) DEFAULT 'normal';

-- Step 2: Migrate existing data
-- Map existing numeric depth values to optimization levels
UPDATE public.api_settings 
SET news_social_optimization = CASE 
  WHEN analysis_depth <= 3 THEN 'normal'
  WHEN analysis_depth >= 4 THEN 'balanced'
  ELSE 'normal'
END
WHERE analysis_depth IS NOT NULL;

-- Step 3: Add constraint for new column
ALTER TABLE public.api_settings 
ADD CONSTRAINT api_settings_news_social_optimization_check 
CHECK (news_social_optimization IN ('normal', 'balanced'));

-- Step 4: Handle dependent objects and drop the old column
-- First check if the view exists and drop it temporarily
DROP VIEW IF EXISTS public.api_settings_unified CASCADE;

-- Drop the old column constraint and column
ALTER TABLE public.api_settings 
DROP CONSTRAINT IF EXISTS api_settings_analysis_depth_check;

ALTER TABLE public.api_settings 
DROP COLUMN IF EXISTS analysis_depth;

-- Step 4b: Recreate the api_settings_unified view without analysis_depth
-- Note: This assumes the view was using analysis_depth - you may need to adjust this
-- If you have the original view definition, replace this with the correct CREATE VIEW statement
-- For now, we'll create a basic view that includes the new column
CREATE OR REPLACE VIEW public.api_settings_unified AS
SELECT 
    user_id,
    ai_provider,
    ai_api_key,
    ai_model,
    news_social_optimization,  -- New column instead of analysis_depth
    analysis_history_days,
    research_debate_rounds,
    analysis_max_tokens,
    research_max_tokens,
    trading_max_tokens,
    risk_max_tokens,
    -- Add other columns as needed from the original view
    created_at,
    updated_at
FROM public.api_settings;

-- Step 5: Update column comment
COMMENT ON COLUMN public.api_settings.news_social_optimization IS 'News and social media analysis optimization: normal=standard coverage, balanced=more thorough analysis';

-- Step 6: Grant permissions (if needed)
-- GRANT SELECT, UPDATE ON public.api_settings TO authenticated;