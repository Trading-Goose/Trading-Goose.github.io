#!/bin/bash

# Deployment script for Supabase Edge Functions
# Run this when Docker is working properly

echo "🚀 Deploying Supabase Edge Functions..."

SUPABASE_ACCESS_TOKEN="sbp_72e308dcfc7de7eb83f03ab8fbea9366e3ffe6d6"
PROJECT_REF="lnvjsqyvhczgxvygbqer"

# Deploy analyze-stock (main entry point - critical fix for Alpaca credentials)
echo "📦 Deploying alpaca-batch..."
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy alpaca-batch --project-ref $PROJECT_REF

echo "📦 Deploying alpaca-proxy..."
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy alpaca-proxy --project-ref $PROJECT_REF

echo "📦 Deploying settings-proxy..."
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy settings-proxy --project-ref $PROJECT_REF


echo "📦 Deploying execute-trade..."
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy execute-trade --project-ref $PROJECT_REF


# Deploy coordinator
echo "📦 Deploying analyze-stock-coordinator..."
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy analyze-stock-coordinator --project-ref $PROJECT_REF


# Deploy process-scheduled-rebalances
echo "📦 Deploying process-scheduled-rebalances..."
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy process-scheduled-rebalances --project-ref $PROJECT_REF


# Deploy all agent functions
agents=(
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
  "agent-portfolio-manager"
  "opportunity-agent"
)

for agent in "${agents[@]}"; do
  echo "📦 Deploying $agent..."
  SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN npx supabase functions deploy $agent --project-ref $PROJECT_REF
done

echo "✅ All functions deployed successfully!"
