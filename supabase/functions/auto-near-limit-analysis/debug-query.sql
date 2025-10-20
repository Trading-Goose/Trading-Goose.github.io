-- Find the most recent completed analysis for PDD
-- This query will show all the relevant fields to debug the metadata storage issue

-- Most recent completed PDD analysis with all metadata fields
SELECT 
    id,
    ticker,
    user_id,
    analysis_status,
    created_at,
    metadata,
    analysis_context,
    -- Extract specific fields from JSON for easier reading
    metadata->>'triggered_by' as metadata_triggered_by,
    metadata->>'near_limit_analysis' as metadata_near_limit_analysis,
    analysis_context->>'triggered_by' as context_triggered_by,
    analysis_context->>'near_limit_analysis' as context_near_limit_analysis,
    full_analysis->'analysisContext'->>'triggered_by' as full_context_triggered_by,
    full_analysis->'analysisContext'->>'near_limit_analysis' as full_context_near_limit
FROM analysis_history
WHERE ticker = 'PDD' 
  AND analysis_status = 'COMPLETED'
ORDER BY created_at DESC
LIMIT 5;

-- Alternative: Find ALL PDD analyses in the last 2 hours regardless of status
SELECT 
    id,
    ticker,
    analysis_status,
    created_at,
    metadata,
    analysis_context,
    metadata->>'triggered_by' as metadata_triggered_by,
    metadata->>'near_limit_analysis' as metadata_near_limit_analysis
FROM analysis_history
WHERE ticker = 'PDD' 
  AND created_at >= NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC;

-- Check the specific analyses mentioned in the logs
SELECT 
    id,
    ticker,
    analysis_status,
    created_at,
    metadata,
    analysis_context
FROM analysis_history
WHERE id IN (
    'd975f66e-61c0-4b97-94cd-0895a3f27921',
    'b761e888-11e9-4b07-b395-56195caef77d',
    '2bdc0c99-205c-43e3-ab87-24b8a351ce36',
    '3ca0ec5c-c0fa-4940-a136-c19b7d986191'
)
ORDER BY created_at DESC;