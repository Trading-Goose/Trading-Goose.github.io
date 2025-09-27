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