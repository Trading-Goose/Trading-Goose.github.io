-- Migration: Remove Alpha Vantage API key from system
-- This migration removes Alpha Vantage dependencies since we now use Perplefina

-- Step 1: Remove Alpha Vantage API key column from api_settings table
ALTER TABLE public.api_settings 
DROP COLUMN IF EXISTS alpha_vantage_api_key;

-- Step 2: Update any views that might reference the old column (if they exist)
-- Check for views that might depend on the alpha_vantage_api_key column
-- Note: This is a safe operation as we'll recreate any dependent views without the column

-- Log the migration
COMMENT ON TABLE public.api_settings IS 'API settings for trading analysis - Alpha Vantage removed, now using Perplefina for data collection';