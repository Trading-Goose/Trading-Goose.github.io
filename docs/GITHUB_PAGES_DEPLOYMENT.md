# GitHub Pages Deployment Guide

This guide explains how to deploy the TradingGoose frontend to GitHub Pages.

## Prerequisites

1. A GitHub repository for your project
2. GitHub Pages enabled in your repository settings
3. Supabase project with public URL and anon key

## Setup Steps

### 1. Configure GitHub Secrets

Go to your GitHub repository settings → Secrets and variables → Actions, and add the following secrets:

- `VITE_SUPABASE_URL`: Your Supabase project URL (e.g., `https://lnvjsqyvhczgxvygbqer.supabase.co`)
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anon/public key (safe to expose, but stored as secret for convenience)

**Important**: These are the only environment variables that should be in GitHub Secrets for the frontend. All sensitive API keys (like Alpaca, AI providers, etc.) should be stored in the Supabase database and accessed through authenticated API calls.

### 2. Enable GitHub Pages

1. Go to Settings → Pages in your GitHub repository
2. Under "Build and deployment", select "GitHub Actions" as the source
3. Save the settings

### 3. Deploy

The deployment will happen automatically when you:
- Push to the `main` branch
- Manually trigger the workflow from Actions tab

### 4. Access Your Site

After deployment, your site will be available at:
```
https://[your-github-username].github.io/[repository-name]/
```

## Security Considerations

### What's Safe to Expose

- ✅ `VITE_SUPABASE_URL` - This is public
- ✅ `VITE_SUPABASE_ANON_KEY` - This is a public key with RLS (Row Level Security)

### What Should Never Be in Frontend Code

- ❌ Alpaca API keys
- ❌ AI provider API keys (OpenAI, Anthropic, etc.)
- ❌ Supabase service role key
- ❌ Any trading/financial API credentials

### How Sensitive Data is Handled

1. **User API Keys**: Stored encrypted in Supabase database
2. **Authentication**: Handled by Supabase Auth
3. **API Calls**: Made through Supabase Edge Functions which have access to secrets
4. **Trading Operations**: Executed server-side via Edge Functions

## Environment Variables

The frontend only needs these environment variables:

```env
# .env.production (example - don't commit real values)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## Updating the Deployment

### To Change Environment Variables

1. Update the secrets in GitHub repository settings
2. Re-run the deployment workflow

### To Update the Code

Simply push to the `main` branch - the GitHub Action will automatically:
1. Build the project with the secrets
2. Deploy to GitHub Pages

## Troubleshooting

### Site Not Loading

- Check that GitHub Pages is enabled
- Verify the workflow completed successfully
- Ensure the base path in `vite.config.ts` matches your repository name

### API Calls Failing

- Verify Supabase URL and anon key are correct
- Check Supabase RLS policies
- Ensure Edge Functions are deployed and running

### Assets Not Loading

- Check the `base` configuration in `vite.config.ts`
- Verify the PUBLIC_URL in the GitHub Actions workflow

## Local Development

For local development, create a `.env.local` file:

```env
VITE_SUPABASE_URL=https://lnvjsqyvhczgxvygbqer.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

This file is gitignored and won't be committed.

## Important Notes

1. **Never commit real API keys** to the repository
2. **GitHub Pages is static hosting** - all dynamic operations must go through Supabase
3. **The site is public** - anyone can access it (authentication is handled by Supabase)
4. **CORS must be configured** in Supabase to allow requests from your GitHub Pages domain