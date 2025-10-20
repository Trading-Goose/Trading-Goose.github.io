import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAndExtractUser } from '../_shared/auth.ts';
import { generateCryptoSymbolCandidates } from '../_shared/alpacaSymbol.ts';

interface BatchRequest {
  tickers?: string[];
  includeQuotes?: boolean;
  includeBars?: boolean;
  includeAccount?: boolean;
  includePositions?: boolean;
  includeOrders?: boolean;
  orderIds?: string[];
  includeActivities?: boolean;
  activitiesTypes?: string[];
  activitiesSince?: string;
  activitiesUntil?: string;
  maxActivityPages?: number;
  activityPageSize?: number;
}

interface NormalizedTicker {
  raw: string;
  assetSymbol: string;
  stockSymbol: string;
  cryptoCandidates: string[];
}

const normalizeTicker = (ticker: string): NormalizedTicker => {
  const raw = ticker.trim().toUpperCase();
  const assetSymbol = raw.replace('/', '');
  const candidateList = generateCryptoSymbolCandidates(raw);
  const slashCandidates = candidateList.filter((value) => value.includes('/'));
  const plainCandidates = candidateList.filter((value) => !value.includes('/'));
  const combinedCandidates = [...slashCandidates, ...plainCandidates];
  const cryptoCandidates = combinedCandidates.length > 0 ? combinedCandidates : [raw];

  return {
    raw,
    assetSymbol,
    stockSymbol: assetSymbol,
    cryptoCandidates
  };
};

const looksLikeCrypto = (info: NormalizedTicker): boolean => {
  if (info.raw.includes('/')) {
    return true;
  }

  if (info.assetSymbol.length >= 6) {
    return true;
  }

  return info.cryptoCandidates.some((candidate) => candidate.includes('/'));
};

const MAX_CRYPTO_CANDIDATES = 3;

const DEFAULT_CASH_ACTIVITY_TYPES = ['TRANS', 'JNLS', 'JNLC', 'ACATC', 'ACATS', 'ACATJ'];

const toFiniteNumber = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toRounded = (value: number, precision = 2): number => {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
};

const resolveActivityTimestamp = (activity: Record<string, any>): number | null => {
  const keys = ['transaction_time', 'activity_date', 'date', 'trade_date', 'processed_at', 'created_at'];

  for (const key of keys) {
    const value = activity[key];
    if (!value) {
      continue;
    }

    const direct = new Date(value);
    if (!isNaN(direct.getTime())) {
      return direct.getTime();
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const normalized = new Date(`${value}T00:00:00Z`);
      if (!isNaN(normalized.getTime())) {
        return normalized.getTime();
      }
    }
  }

  return null;
};

const summarizeCashFlows = (activities: any[], activityTypes: string[]) => {
  const totalsByType: Record<string, { deposits: number; withdrawals: number; count: number }> = {};
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let earliest: number | null = null;
  let latest: number | null = null;

  for (const activity of activities) {
    const type = String(activity?.activity_type || activity?.type || '').toUpperCase();
    if (!type) {
      continue;
    }

    const amount = toFiniteNumber(activity?.net_amount ?? activity?.netAmount ?? activity?.amount);
    if (amount === 0) {
      continue;
    }

    if (!totalsByType[type]) {
      totalsByType[type] = { deposits: 0, withdrawals: 0, count: 0 };
    }

    totalsByType[type].count += 1;

    if (amount > 0) {
      totalsByType[type].deposits += amount;
      totalDeposits += amount;
    } else {
      const withdrawal = Math.abs(amount);
      totalsByType[type].withdrawals += withdrawal;
      totalWithdrawals += withdrawal;
    }

    const timestamp = resolveActivityTimestamp(activity);
    if (timestamp !== null) {
      if (earliest === null || timestamp < earliest) {
        earliest = timestamp;
      }
      if (latest === null || timestamp > latest) {
        latest = timestamp;
      }
    }
  }

  const byTypeSummaries = Object.entries(totalsByType).reduce<Record<string, { count: number; totalDeposits: number; totalWithdrawals: number }>>((acc, [key, value]) => {
    acc[key] = {
      count: value.count,
      totalDeposits: toRounded(value.deposits),
      totalWithdrawals: toRounded(value.withdrawals)
    };
    return acc;
  }, {});

  return {
    activityCount: activities.length,
    totalDeposits: toRounded(totalDeposits),
    totalWithdrawals: toRounded(totalWithdrawals),
    netContributions: toRounded(totalDeposits - totalWithdrawals),
    byType: byTypeSummaries,
    fetchedTypes: activityTypes,
    earliestActivityAt: earliest !== null ? new Date(earliest).toISOString() : null,
    latestActivityAt: latest !== null ? new Date(latest).toISOString() : null,
    sample: activities.slice(-5).map((activity) => ({
      activity_type: activity?.activity_type || activity?.type,
      net_amount: activity?.net_amount ?? activity?.netAmount,
      date: activity?.transaction_time || activity?.activity_date || activity?.trade_date || activity?.date
    }))
  };
};

const fetchAccountActivities = async (
  fetcher: (url: string, options: any, timeoutMs?: number, retries?: number) => Promise<Response>,
  baseUrl: string,
  headers: Record<string, string>,
  activityTypes: string[],
  options: {
    after?: string;
    until?: string;
    direction?: 'asc' | 'desc';
    pageSize?: number;
    maxPages?: number;
  } = {}
) => {
  if (activityTypes.length === 0) {
    return [] as any[];
  }

  const collected: any[] = [];
  const direction = options.direction ?? 'asc';
  const pageSize = Math.min(Math.max(options.pageSize ?? 100, 1), 100);
  const maxPages = Math.max(options.maxPages ?? 50, 1);

  let pageToken: string | undefined;
  let pagesFetched = 0;

  while (pagesFetched < maxPages) {
    const params = new URLSearchParams();
    params.append('direction', direction);
    params.append('page_size', String(pageSize));
    params.append('activity_types', activityTypes.join(','));

    if (options.after) {
      params.append('after', options.after);
    }

    if (options.until) {
      params.append('until', options.until);
    }

    if (pageToken) {
      params.append('page_token', pageToken);
    }

    const url = `${baseUrl}/v2/account/activities?${params.toString()}`;
    const response = await fetcher(url, { headers }, 20000, 2);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch account activities:', response.status, errorText);
      break;
    }

    let data = await response.json();
    let page: any[] = [];
    let nextToken: string | undefined;

    if (Array.isArray(data)) {
      page = data;
    } else if (data?.activities && Array.isArray(data.activities)) {
      page = data.activities;
      nextToken = typeof data.next_page_token === 'string' ? data.next_page_token : undefined;
    } else {
      console.error('Unexpected activities response format:', data);
      break;
    }

    collected.push(...page);
    pagesFetched += 1;

    const headerToken = response.headers.get('Next-Page-Token')
      || response.headers.get('next-page-token')
      || response.headers.get('x-next-page-token')
      || response.headers.get('X-Next-Page-Token');

    if (headerToken && headerToken !== 'null') {
      pageToken = headerToken;
      continue;
    }

    if (!nextToken && page.length > 0) {
      const last = page[page.length - 1];
      if (last && typeof last.id === 'string' && last.id.length > 0) {
        nextToken = last.id;
      }
    }

    if (nextToken && nextToken !== 'null') {
      pageToken = nextToken;
      continue;
    }

    if (page.length === pageSize) {
      pageToken = undefined;
    } else {
      break;
    }
  }

  return collected;
};

const buildCryptoSymbolList = (tickers: NormalizedTicker[], maxPerTicker: number = MAX_CRYPTO_CANDIDATES): string[] => {
  const seen = new Set<string>();

  for (const info of tickers) {
    const limit = Math.min(maxPerTicker, info.cryptoCandidates.length);

    for (let index = 0; index < limit; index++) {
      const candidate = info.cryptoCandidates[index];
      if (!seen.has(candidate)) {
        seen.add(candidate);
      }
    }
  }

  return Array.from(seen);
};

const findFirstCryptoMatch = (
  container: Record<string, any> | undefined,
  info: NormalizedTicker,
  maxPerTicker: number = MAX_CRYPTO_CANDIDATES
) => {
  if (!container) {
    return null;
  }

  const limit = Math.min(maxPerTicker, info.cryptoCandidates.length);

  for (let index = 0; index < limit; index++) {
    const candidate = info.cryptoCandidates[index];
    if (candidate && container[candidate] !== undefined) {
      return { key: candidate, value: container[candidate] };
    }

    const collapsed = candidate.replace('/', '');
    if (collapsed && container[collapsed] !== undefined) {
      return { key: collapsed, value: container[collapsed] };
    }
  }

  return null;
};
serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const authHeader = req.headers.get('Authorization');
    const { userId, error: authError } = await verifyAndExtractUser(authHeader);

    if (authError || !userId) {
      console.error('Authentication failed for alpaca-batch:', authError);
      return new Response(JSON.stringify({
        error: authError || 'Authentication failed'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    // Use service role to access database
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // Get user's API settings
    const { data: apiSettings, error: settingsError } = await supabaseAdmin.from('api_settings').select('*').eq('user_id', userId).single();
    if (settingsError || !apiSettings) {
      return new Response(JSON.stringify({
        error: 'API settings not found'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 404
      });
    }
    // Parse request body
    const { 
      tickers = [], 
      includeQuotes = true, 
      includeBars = false,
      includeAccount = false,
      includePositions = false,
      includeOrders = false,
      orderIds = [],
      includeActivities = false,
      activitiesTypes = [],
      activitiesSince,
      activitiesUntil,
      maxActivityPages,
      activityPageSize
    }: BatchRequest = await req.json();
    // Validate that we have something to fetch
    if (!includeAccount && !includePositions && !includeOrders && !includeActivities && (!tickers || tickers.length === 0) && (!orderIds || orderIds.length === 0)) {
      return new Response(JSON.stringify({
        error: 'No tickers, orders, or account/positions requested'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    
    // Limit to 50 tickers at once
    if (tickers && tickers.length > 50) {
      return new Response(JSON.stringify({
        error: 'Too many tickers. Maximum 50 allowed.'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    // Determine which credentials to use
    const isPaper = apiSettings.alpaca_paper_trading ?? true;
    const apiKey = isPaper ? apiSettings.alpaca_paper_api_key : apiSettings.alpaca_live_api_key;
    const secretKey = isPaper ? apiSettings.alpaca_paper_secret_key : apiSettings.alpaca_live_secret_key;
    if (!apiKey || !secretKey) {
      return new Response(JSON.stringify({
        error: 'Alpaca credentials not configured'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    const dataUrl = 'https://data.alpaca.markets';
    const headers = {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': secretKey,
      'Content-Type': 'application/json'
    };
    console.log(`Batch fetching data: ${tickers.length} tickers, account: ${includeAccount}, positions: ${includePositions}, orders: ${includeOrders}, activities: ${includeActivities}, orderIds: ${orderIds.length}`);
    
    const results: Record<string, any> = {};
    
    // Helper function to fetch with timeout and retry
    const fetchWithTimeout = async (url: string, options: any, timeoutMs = 15000, retries = 2) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
          
          const response = await fetch(url, {
            ...options,
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          return response;
        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.error(`Request timeout after ${timeoutMs}ms (attempt ${attempt + 1}/${retries + 1})`);
            if (attempt === retries) {
              throw new Error(`Request timed out after ${retries + 1} attempts`);
            }
            // Wait a bit before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          } else {
            throw error;
          }
        }
      }
      throw new Error('Failed after all retries');
    };
    
    // Fetch account data if requested
    if (includeAccount) {
      try {
        const response = await fetchWithTimeout(`${baseUrl}/v2/account`, { headers }, 15000, 1);
        if (response.ok) {
          const accountData = await response.json();
          results.account = accountData;
          console.log('Fetched account data successfully');
        } else {
          const errorText = await response.text();
          console.error('Failed to fetch account:', response.status, errorText);
          // Check for specific Alpaca errors
          if (response.status === 429) {
            return new Response(JSON.stringify({
              error: 'Alpaca rate limit exceeded. Please wait and try again.'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 429
            });
          } else if (response.status >= 500) {
            return new Response(JSON.stringify({
              error: 'Alpaca services appear to be down. Please check https://app.alpaca.markets/dashboard/overview for status.'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 503
            });
          }
          // Don't throw - return partial results
        }
      } catch (error: any) {
        console.error('Error fetching account:', error);
        if (error.message?.includes('timed out')) {
          return new Response(JSON.stringify({
            error: 'Unable to connect to Alpaca. Please check if Alpaca services are operational at https://app.alpaca.markets/dashboard/overview'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 504
          });
        }
        // Don't throw - return partial results
      }
    }
    
    // Fetch positions data if requested
    if (includePositions) {
      try {
        const response = await fetchWithTimeout(`${baseUrl}/v2/positions`, { headers }, 15000, 1);
        if (response.ok) {
          const positionsData = await response.json();
          results.positions = positionsData;
          console.log(`Fetched ${positionsData.length || 0} positions`);
        } else {
          const errorText = await response.text();
          console.error('Failed to fetch positions:', response.status, errorText);
          if (response.status >= 500) {
            return new Response(JSON.stringify({
              error: 'Alpaca services appear to be down. Please check https://app.alpaca.markets/dashboard/overview for status.'
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 503
            });
          }
          // Don't throw - return partial results
        }
      } catch (error: any) {
        console.error('Error fetching positions:', error);
        if (error.message?.includes('timed out')) {
          return new Response(JSON.stringify({
            error: 'Unable to connect to Alpaca. Please check if Alpaca services are operational at https://app.alpaca.markets/dashboard/overview'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 504
          });
        }
        // Don't throw - return partial results
      }
    }

    if (includeActivities) {
      const uniqueTypes = (activitiesTypes && activitiesTypes.length > 0)
        ? Array.from(new Set(activitiesTypes.map((value) => String(value).toUpperCase()).filter(Boolean)))
        : DEFAULT_CASH_ACTIVITY_TYPES;

      try {
        const activityItems = await fetchAccountActivities(
          fetchWithTimeout,
          baseUrl,
          headers,
          uniqueTypes,
          {
            after: activitiesSince,
            until: activitiesUntil,
            maxPages: maxActivityPages,
            pageSize: activityPageSize,
            direction: 'asc'
          }
        );

        results.cashFlows = summarizeCashFlows(activityItems, uniqueTypes);
        console.log(`Fetched ${results.cashFlows.activityCount} account activities across types: ${uniqueTypes.join(',')}`);
      } catch (error) {
        console.error('Error fetching account activities:', error);
      }
    }

    // Fetch orders if requested
    if (includeOrders || (orderIds && orderIds.length > 0)) {
      try {
        let ordersData = [];
        
        if (orderIds && orderIds.length > 0) {
          // Fetch specific orders by ID
          console.log(`Fetching ${orderIds.length} specific orders`);
          const orderPromises = orderIds.map(async (orderId) => {
            try {
              const response = await fetchWithTimeout(`${baseUrl}/v2/orders/${orderId}`, { headers }, 10000, 1);
              if (response.ok) {
                return await response.json();
              }
              return null;
            } catch (error) {
              console.error(`Error fetching order ${orderId}:`, error);
              return null;
            }
          });
          
          const orderResults = await Promise.all(orderPromises);
          ordersData = orderResults.filter(order => order !== null);
        } else {
          // Fetch all orders
          const response = await fetchWithTimeout(`${baseUrl}/v2/orders?status=all&limit=500`, { headers }, 15000, 1);
          if (response.ok) {
            ordersData = await response.json();
          }
        }
        
        results.orders = ordersData;
        console.log(`Fetched ${ordersData.length} orders`);
      } catch (error: any) {
        console.error('Error fetching orders:', error);
        if (error.message?.includes('timed out')) {
          return new Response(JSON.stringify({
            error: 'Unable to connect to Alpaca. Please check if Alpaca services are operational.'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 504
          });
        }
        // Don't throw - return partial results
      }
    }
    
    // Only process ticker data if tickers were provided
    if (tickers && tickers.length > 0) {
      const normalizedTickers = tickers.map(normalizeTicker);

      const assetResults = await Promise.all(normalizedTickers.map(async (info) => {
        try {
          let response = await fetchWithTimeout(`${baseUrl}/v2/assets/${encodeURIComponent(info.assetSymbol)}`, { headers }, 10000, 1);

          if (!response.ok && response.status === 404 && info.assetSymbol !== info.raw) {
            const fallbackResponse = await fetchWithTimeout(`${baseUrl}/v2/assets/${encodeURIComponent(info.raw)}`, { headers }, 10000, 1);
            if (fallbackResponse.ok) {
              response = fallbackResponse;
            }
          }

          if (response.ok) {
            const asset = await response.json();
            return { info, asset };
          }

          console.log(`No asset data for ${info.raw}: ${response.status}`);
          return { info, asset: null };
        } catch (error) {
          console.error(`Error fetching asset ${info.raw}:`, error);
          return { info, asset: null };
        }
      }));

      const assetClassByTicker: Record<string, string | undefined> = {};

      for (const { info, asset } of assetResults) {
        assetClassByTicker[info.raw] = asset?.asset_class;
        results[info.raw] = {
          ...(results[info.raw] || {}),
          asset
        };
      }

      const stockTickers: NormalizedTicker[] = [];
      const cryptoTickers: NormalizedTicker[] = [];

      for (const info of normalizedTickers) {
        const assetClass = assetClassByTicker[info.raw]?.toLowerCase();

        if (assetClass && assetClass.includes('crypto')) {
          cryptoTickers.push(info);
        } else if (assetClass) {
          stockTickers.push(info);
        } else if (looksLikeCrypto(info)) {
          cryptoTickers.push(info);
        } else {
          stockTickers.push(info);
        }
      }

      if (includeQuotes) {
        if (stockTickers.length > 0) {
          const params = new URLSearchParams();
          params.set('symbols', stockTickers.map((info) => info.stockSymbol).join(','));

          try {
            const response = await fetch(`${dataUrl}/v2/stocks/quotes/latest?${params.toString()}`, {
              headers
            });

            if (response.ok) {
              const data = await response.json();
              const quotes = data.quotes || {};

              for (const info of stockTickers) {
                const quote = quotes[info.stockSymbol];
                if (quote) {
                  results[info.raw] = results[info.raw] || {};
                  results[info.raw].quote = quote;
                }
              }
            }
          } catch (error) {
            console.error('Error fetching batch stock quotes:', error);
          }
        }

        if (cryptoTickers.length > 0) {
          const cryptoSymbols = buildCryptoSymbolList(cryptoTickers);

          if (cryptoSymbols.length > 0) {
            const params = new URLSearchParams();
            params.set('symbols', cryptoSymbols.join(','));

            try {
              const response = await fetch(`${dataUrl}/v1beta3/crypto/us/quotes/latest?${params.toString()}`, {
                headers
              });

              if (response.ok) {
                const data = await response.json();
                const quotes = data.quotes || data;

                for (const info of cryptoTickers) {
                  const match = findFirstCryptoMatch(quotes, info);
                  if (match?.value) {
                    results[info.raw] = results[info.raw] || {};
                    results[info.raw].quote = match.value;
                    console.log(`${info.raw}: Matched crypto quote via ${match.key}`);
                  }
                }
              }
            } catch (error) {
              console.error('Error fetching batch crypto quotes:', error);
            }
          }
        }
      }

      if (includeBars) {
        if (stockTickers.length > 0) {
          const params = new URLSearchParams();
          params.set('symbols', stockTickers.map((info) => info.stockSymbol).join(','));
          const snapshotUrl = `${dataUrl}/v2/stocks/snapshots?${params.toString()}`;
          console.log(`Fetching stock snapshots for: ${params.get('symbols')}`);

          try {
            const response = await fetch(snapshotUrl, { headers });

            if (response.ok) {
              const data = await response.json();

              for (const info of stockTickers) {
                const entry = data[info.stockSymbol];
                if (!entry) {
                  console.log(`${info.raw}: No stock snapshot data received`);
                  continue;
                }

                results[info.raw] = results[info.raw] || {};

                if (entry.prevDailyBar) {
                  results[info.raw].previousBar = entry.prevDailyBar;
                  console.log(`${info.raw}: Got previous stock daily bar close ${entry.prevDailyBar.c}`);
                }

                if (entry.dailyBar) {
                  results[info.raw].currentBar = entry.dailyBar;
                  console.log(`${info.raw}: Got stock daily bar close ${entry.dailyBar.c}`);
                }

                if (entry.latestQuote && includeQuotes) {
                  results[info.raw].quote = entry.latestQuote;
                  console.log(`${info.raw}: Stock snapshot quote bid=${entry.latestQuote.bp}, ask=${entry.latestQuote.ap}`);
                }

                if (entry.latestTrade) {
                  results[info.raw].latestTrade = entry.latestTrade;
                  console.log(`${info.raw}: Stock snapshot latest trade price=${entry.latestTrade.p}`);
                }
              }
            } else {
              const errorText = await response.text();
              console.error(`Stock snapshot request failed with status ${response.status}: ${errorText}`);

              const endDate = new Date();
              endDate.setDate(endDate.getDate() - 1);
              const startDate = new Date(endDate);
              startDate.setDate(startDate.getDate() - 10);

              const barsParams = new URLSearchParams({
                symbols: stockTickers.map((info) => info.stockSymbol).join(','),
                timeframe: '1Day',
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0],
                limit: '5',
                adjustment: 'raw',
                feed: 'iex'
              });

              const barsUrl = `${dataUrl}/v2/stocks/bars?${barsParams.toString()}`;
              const barsResponse = await fetch(barsUrl, { headers });

              if (barsResponse.ok) {
                const barsData = await barsResponse.json();
                const barEntries = barsData.bars || {};

                for (const info of stockTickers) {
                  const bars = barEntries[info.stockSymbol];
                  if (Array.isArray(bars) && bars.length > 0) {
                    results[info.raw] = results[info.raw] || {};
                    const mostRecentBar = bars[bars.length - 1];
                    results[info.raw].previousBar = mostRecentBar;
                    console.log(`${info.raw}: Fallback stock bar close ${mostRecentBar.c}`);
                  }
                }
              }
            }
          } catch (error) {
            console.error('Error fetching stock snapshot data:', error);
          }
        }

        if (cryptoTickers.length > 0) {
          const cryptoSymbols = buildCryptoSymbolList(cryptoTickers);

          if (cryptoSymbols.length > 0) {
            const params = new URLSearchParams();
            params.set('symbols', cryptoSymbols.join(','));
            const snapshotUrl = `${dataUrl}/v1beta3/crypto/us/snapshots?${params.toString()}`;
            console.log(`Fetching crypto snapshots for: ${params.get('symbols')}`);

            try {
              const response = await fetch(snapshotUrl, { headers });

              if (response.ok) {
                const data = await response.json();
                const snapshots = data.snapshots || data;

                for (const info of cryptoTickers) {
                  const match = findFirstCryptoMatch(snapshots, info);
                  if (!match?.value) {
                    console.log(`${info.raw}: No crypto snapshot data received`);
                    continue;
                  }

                  const entry = match.value;
                  results[info.raw] = results[info.raw] || {};

                  if (entry.prevDailyBar) {
                    results[info.raw].previousBar = entry.prevDailyBar;
                    console.log(`${info.raw}: Crypto prev daily close ${entry.prevDailyBar.c} via ${match.key}`);
                  }

                  if (entry.dailyBar) {
                    results[info.raw].currentBar = entry.dailyBar;
                    console.log(`${info.raw}: Crypto daily close ${entry.dailyBar.c} via ${match.key}`);
                  }

                  if (entry.latestQuote && includeQuotes) {
                    results[info.raw].quote = entry.latestQuote;
                    console.log(`${info.raw}: Crypto snapshot quote bid=${entry.latestQuote.bp}, ask=${entry.latestQuote.ap} via ${match.key}`);
                  }

                  if (entry.latestTrade) {
                    results[info.raw].latestTrade = entry.latestTrade;
                    console.log(`${info.raw}: Crypto snapshot latest trade price=${entry.latestTrade.p} via ${match.key}`);
                  }
                }
              } else {
                const errorText = await response.text();
                console.error(`Crypto snapshot request failed with status ${response.status}: ${errorText}`);

                const endDate = new Date();
                const startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 10);

                const barsParams = new URLSearchParams({
                  symbols: cryptoSymbols.join(','),
                  timeframe: '1Day',
                  start: startDate.toISOString(),
                  end: endDate.toISOString(),
                  limit: '5'
                });

                const barsUrl = `${dataUrl}/v1beta3/crypto/us/bars?${barsParams.toString()}`;
                const barsResponse = await fetch(barsUrl, { headers });

                if (barsResponse.ok) {
                  const barsData = await barsResponse.json();
                  const barEntries = barsData.bars || {};

                  for (const info of cryptoTickers) {
                    const barMatch = findFirstCryptoMatch(barEntries, info);
                    if (Array.isArray(barMatch?.value) && barMatch.value.length > 0) {
                      results[info.raw] = results[info.raw] || {};
                      const mostRecentBar = barMatch.value[barMatch.value.length - 1];
                      results[info.raw].previousBar = mostRecentBar;
                      console.log(`${info.raw}: Fallback crypto bar close ${mostRecentBar.c} via ${barMatch.key}`);
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Error fetching crypto snapshot data:', error);
            }
          }
        }
      }
    } // End ticker processing block
    
    return new Response(JSON.stringify({
      data: results
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Alpaca batch error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
