# Alpaca Proxy Edge Function

## Overview
This edge function acts as a secure server-side proxy for Alpaca API calls, eliminating CORS issues and protecting API credentials.

## Architecture Changes

### Previous Flow (Direct Browser → Alpaca)
1. Browser fetches credentials from database
2. Browser makes direct API calls to Alpaca with credentials
3. CORS errors occur due to browser security restrictions

### New Flow (Browser → Edge Function → Alpaca)
1. Browser calls Supabase edge function with authentication
2. Edge function retrieves user's Alpaca credentials from database
3. Edge function makes server-side API calls to Alpaca
4. Edge function returns data to browser

## Security Benefits
- API credentials never exposed to browser/client
- All credential management happens server-side
- Authenticated access via Supabase Auth
- No CORS issues

## Usage

### Frontend Example
```typescript
// Instead of direct Alpaca API call:
// const response = await fetch('https://api.alpaca.markets/v2/account', { headers: ... });

// Use the edge function proxy:
const { data, error } = await supabase.functions.invoke('alpaca-proxy', {
  body: {
    method: 'GET',
    endpoint: '/v2/account'
  }
});
```

### Supported Endpoints
All Alpaca v2 API endpoints are supported:
- Account: `/v2/account`
- Positions: `/v2/positions`
- Orders: `/v2/orders`
- Portfolio History: `/v2/account/portfolio/history`
- Market Data: `/v2/stocks/{symbol}/bars`, `/v2/stocks/{symbol}/quotes/latest`
- Assets: `/v2/assets`

### Request Format
```typescript
interface AlpacaRequest {
  method: string;        // GET, POST, DELETE, etc.
  endpoint: string;      // API endpoint path
  params?: Record<string, any>;  // Query parameters
  body?: any;           // Request body for POST/PUT
}
```

## Configuration
The function automatically:
1. Authenticates the user via Supabase Auth
2. Retrieves API settings from `api_settings` table
3. Uses paper or live credentials based on `alpaca_paper_trading` setting
4. Routes to appropriate Alpaca base URL (paper/live/data)

## Error Handling
- Returns 401 if user not authenticated
- Returns 404 if API settings not found
- Returns 400 if Alpaca credentials not configured
- Passes through Alpaca API errors with proper status codes

## Deployment
```bash
npx supabase functions deploy alpaca-proxy --project-ref <your-project-ref>
```