#!/bin/bash

# Test the auto-near-limit-analysis function
echo "Testing auto-near-limit-analysis function..."

# Get Supabase project URL and service role key from .env
SUPABASE_URL=$(grep VITE_SUPABASE_URL .env | cut -d '=' -f2)
SERVICE_ROLE_KEY=$(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d '=' -f2)

if [ -z "$SUPABASE_URL" ] || [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "Error: Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env"
  exit 1
fi

# Invoke the function with service role key
echo "Invoking function at: $SUPABASE_URL/functions/v1/auto-near-limit-analysis"

curl -X POST "$SUPABASE_URL/functions/v1/auto-near-limit-analysis" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data '{}' \
  -v

echo ""
echo "Test complete!"