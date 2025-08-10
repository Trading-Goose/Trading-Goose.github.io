# Alpaca API Proxy Setup

The Alpaca API cannot be called directly from the browser due to CORS restrictions. To use real Alpaca data, you need to set up a backend proxy.

## Why is this needed?

- Alpaca's API servers don't allow cross-origin requests from browsers
- API keys should never be exposed in frontend code
- A backend proxy keeps your credentials secure

## Solutions:

### 1. Use Alpaca's JavaScript SDK (Recommended)
Instead of making direct HTTP requests, use the official Alpaca JavaScript SDK which handles authentication properly.

### 2. Create a Backend Proxy
Set up a simple Express.js server to proxy requests:

```javascript
const express = require('express');
const axios = require('axios');
const app = express();

app.use('/api/alpaca/*', async (req, res) => {
  try {
    const alpacaUrl = req.path.replace('/api/alpaca', '');
    const response = await axios({
      method: req.method,
      url: `https://paper-api.alpaca.markets${alpacaUrl}`,
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY,
      },
      data: req.body
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json(error.response?.data || { error: 'Proxy error' });
  }
});
```

### 3. Use Supabase Edge Functions
Create a Supabase Edge Function to proxy Alpaca requests:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const { method, url } = req
  const alpacaUrl = new URL(url).pathname.replace('/alpaca', '')
  
  const response = await fetch(`https://paper-api.alpaca.markets${alpacaUrl}`, {
    method,
    headers: {
      'APCA-API-KEY-ID': Deno.env.get('ALPACA_API_KEY'),
      'APCA-API-SECRET-KEY': Deno.env.get('ALPACA_SECRET_KEY'),
    },
    body: method !== 'GET' ? await req.text() : undefined,
  })
  
  return new Response(await response.text(), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
```
