/Users/bruzwj/Downloads/.env.local#!/bin/bash

# Deployment script for Supabase Edge Functions
# Run this when Docker is working properly
if [ -f .env.local ]; then
  # Load environment variables, handling = signs and quotes properly
  set -a
  source .env.local
  set +a
fi

echo "🚀 Deploying Supabase Edge Functions..."

# Debug: Check if variables are loaded
echo "Debug: SUPABASE_ACCESS_TOKEN is ${#SUPABASE_ACCESS_TOKEN} characters long"
echo "Debug: SUPABASE_PROJECT_REF = $SUPABASE_PROJECT_REF"

# Ensure variables are set
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "Error: SUPABASE_ACCESS_TOKEN not found in .env.local"
  exit 1
fi

if [ -z "$SUPABASE_PROJECT_REF" ]; then
  echo "Error: SUPABASE_PROJECT_REF not found in .env.local"
  exit 1
fi

# Deploy functions that require --no-verify-jwt flag
no_verify_jwt_functions=(
  "alpaca-batch"
  "alpaca-proxy"
  "settings-proxy"
  "execute-trade"
  "analysis-coordinator"
  "rebalance-coordinator"
  "send-invitation"
  "discord-role-sync"
  "stripe-webhook"
  "create-smart-session"
)

echo "📦 Deploying functions with --no-verify-jwt flag..."
for func in "${no_verify_jwt_functions[@]}"; do
  echo "  📦 Deploying $func..."
  SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy $func --project-ref $SUPABASE_PROJECT_REF --no-verify-jwt
done

# Deploy functions that use standard JWT verification
standard_functions=(
  "process-scheduled-rebalances"
  "detect-stale-analysis"
  "auto-near-limit-analysis"
)

echo "📦 Deploying functions with standard JWT verification..."
for func in "${standard_functions[@]}"; do
  echo "  📦 Deploying $func..."
  SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy $func --project-ref $SUPABASE_PROJECT_REF
done

# Deploy all agent functions
agents=(
  "agent-macro-analyst"
  "agent-market-analyst"
  "agent-news-analyst"
  "agent-social-media-analyst"
  "agent-fundamentals-analyst"
  "agent-bull-researcher"
  "agent-bear-researcher"
  "agent-research-manager"
  "agent-trader"
  "agent-risky-analyst"
  "agent-safe-analyst"
  "agent-neutral-analyst"
  "agent-risk-manager"
  "analysis-portfolio-manager"
  "rebalance-portfolio-manager"
  "opportunity-agent"
)

echo "📦 Deploying agent functions..."
for agent in "${agents[@]}"; do
  echo "  📦 Deploying $agent..."
  SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy $agent --project-ref $SUPABASE_PROJECT_REF
done

echo "✅ All functions deployed successfully!"