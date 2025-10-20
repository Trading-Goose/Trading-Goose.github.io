import { serve } from "https://deno.land/std@0.210.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAndExtractUser } from '../_shared/auth.ts';
import { TRADE_ORDER_STATUS, isAlpacaOrderTerminal } from '../_shared/statusTypes.ts';
import {
  createOptionsResponse,
  createMissingParametersResponse,
  createSuccessResponse,
  createErrorResponse,
  createApiErrorResponse
} from '../_shared/responseHelpers.ts';

interface SymbolResolution {
  orderSymbol: string;
  positionSymbol: string;
  assetSymbol: string;
  asset: any | null;
  candidate: string;
  lookedUpSymbols: Array<{ candidate: string; assetSymbol?: string; tradable?: boolean; fractionable?: boolean }>;
  isCrypto: boolean;
}

function looksLikeCryptoTicker(ticker: string): boolean {
  return ticker.includes('/');
}

function addSlashVariants(symbol: string, target: Set<string>) {
  const sanitized = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!sanitized || sanitized.length < 4) return;

  const maxQuoteLen = Math.min(5, sanitized.length - 1);
  for (let quoteLen = 2; quoteLen <= maxQuoteLen; quoteLen++) {
    const splitIndex = sanitized.length - quoteLen;
    if (splitIndex <= 0) continue;
    const base = sanitized.slice(0, splitIndex);
    const quote = sanitized.slice(splitIndex);
    if (base.length && quote.length) {
      target.add(`${base}/${quote}`);
    }
  }
}

function guessPairFromSymbol(symbol: string): string | null {
  const sanitized = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!sanitized || sanitized.length < 4) return null;
  const maxQuoteLen = Math.min(5, sanitized.length - 1);
  for (let quoteLen = 3; quoteLen >= 2; quoteLen--) {
    if (quoteLen > sanitized.length - 1) continue;
    const splitIndex = sanitized.length - quoteLen;
    const base = sanitized.slice(0, splitIndex);
    const quote = sanitized.slice(splitIndex);
    if (base.length && quote.length) {
      return `${base}/${quote}`;
    }
  }
  return null;
}

function buildSymbolCandidates(ticker: string): string[] {
  const cleaned = (ticker || '').trim().toUpperCase();
  if (!cleaned) return [];

  const candidates = new Set<string>();
  candidates.add(cleaned);

  const compact = cleaned.replace(/\s+/g, '').replace(/\//g, '');
  if (compact) {
    candidates.add(compact);
    addSlashVariants(compact, candidates);
  }

  if (cleaned.includes('/')) {
    addSlashVariants(cleaned, candidates);
  } else {
    addSlashVariants(cleaned, candidates);
  }

  return Array.from(candidates).filter(Boolean);
}

async function resolveAlpacaSymbol(
  ticker: string,
  baseUrl: string,
  apiKey: string,
  apiSecret: string
): Promise<SymbolResolution> {
  const candidates = buildSymbolCandidates(ticker);
  const headers = {
    'APCA-API-KEY-ID': apiKey,
    'APCA-API-SECRET-KEY': apiSecret
  };

  const lookups: SymbolResolution['lookedUpSymbols'] = [];
  const responses: Array<{ candidate: string; asset: any }> = [];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const response = await fetch(`${baseUrl}/v2/assets/${encodeURIComponent(candidate)}`, {
        headers
      });

      if (!response.ok) {
        lookups.push({ candidate });
        continue;
      }

      const asset = await response.json();
      lookups.push({
        candidate,
        assetSymbol: asset?.symbol,
        tradable: asset?.tradable,
        fractionable: asset?.fractionable
      });
      responses.push({ candidate, asset });
    } catch (error) {
      console.error(`Asset lookup failed for ${candidate}:`, error);
    }
  }

  if (responses.length === 0) {
    const fallback = candidates[0] || ticker.toUpperCase();
    const fallbackIsCrypto = looksLikeCryptoTicker(fallback);
    const guessedPair = fallbackIsCrypto ? fallback : guessPairFromSymbol(fallback);
    const orderSymbol = (guessedPair || fallback).toUpperCase();
    const positionSymbol = orderSymbol.replace('/', '');

    return {
      orderSymbol,
      positionSymbol,
      assetSymbol: fallback,
      asset: null,
      candidate: fallback,
      lookedUpSymbols: lookups,
      isCrypto: fallbackIsCrypto
    };
  }

  const tradableResponses = responses.filter((r) => r.asset?.tradable);
  const originalLooksCrypto = looksLikeCryptoTicker(ticker);

  const prioritized =
    tradableResponses.find((r) => {
      const assetClass = (r.asset?.asset_class || '').toLowerCase();
      return assetClass.includes('crypto') || (r.asset?.symbol || '').includes('/');
    }) ||
    tradableResponses.find((r) => r.asset?.fractionable === true && !originalLooksCrypto) ||
    tradableResponses[0] ||
    responses[0];

  const assetSymbol = prioritized.asset?.symbol || prioritized.candidate || ticker;
  const assetClass = (prioritized.asset?.asset_class || '').toLowerCase();
  const assetLooksCrypto = assetClass.includes('crypto') || (assetSymbol || '').includes('/');
  const shouldTreatAsCrypto = assetLooksCrypto || originalLooksCrypto;

  let orderSymbol: string;
  if (shouldTreatAsCrypto) {
    const inferredPair = assetLooksCrypto ? assetSymbol : guessPairFromSymbol(assetSymbol);
    orderSymbol = (inferredPair || assetSymbol).toUpperCase();
  } else {
    orderSymbol = assetSymbol.toUpperCase().replace('/', '');
  }
  const positionSymbol = orderSymbol.replace('/', '');

  return {
    orderSymbol,
    positionSymbol,
    assetSymbol,
    asset: prioritized.asset,
    candidate: prioritized.candidate,
    lookedUpSymbols: lookups,
    isCrypto: shouldTreatAsCrypto
  };
}

interface ExecuteTradeRequest {
  tradeActionId: string;   // Direct ID of trading_actions record (primary method)
  action: 'approve' | 'reject';
  userId?: string;         // Optional userId for server-to-server calls
  isServerCall?: boolean;  // Flag to indicate call from another edge function
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse the request body first to check for server-to-server calls
    const requestBody = await req.json() as ExecuteTradeRequest;
    const { tradeActionId, action, userId: serverProvidedUserId, isServerCall } = requestBody;

    const authHeader = req.headers.get('Authorization');
    const bearerToken = authHeader?.replace('Bearer ', '').trim();
    const functionAccessToken = Deno.env.get('SUPABASE_FUNCTION_ACCESS_TOKEN') || Deno.env.get('FUNCTION_ACCESS_TOKEN');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const isServiceAuth = bearerToken && [functionAccessToken, serviceRoleKey].filter(Boolean).includes(bearerToken);

    let userId: string;

    if (isServerCall) {
      if (!serverProvidedUserId) {
        return createErrorResponse('Server requests must include userId');
      }

      if (!isServiceAuth) {
        return createErrorResponse('Invalid service authentication');
      }

      console.log('Server-to-server call detected, using provided userId:', serverProvidedUserId);
      userId = serverProvidedUserId;
    } else {
      const { userId: extractedUserId, error: authError } = await verifyAndExtractUser(authHeader);

      if (authError || !extractedUserId) {
        console.error('Authentication failed:', authError);
        return createErrorResponse(authError || 'Authentication failed');
      }

      if (serverProvidedUserId && serverProvidedUserId !== extractedUserId) {
        return createErrorResponse('User mismatch');
      }

      userId = extractedUserId;
    }

    // Use service role to access database
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Validate that we have tradeActionId
    if (!tradeActionId) {
      return createErrorResponse('tradeActionId is required');
    }

    const { data: tradeOrder, error: fetchError } = await supabaseAdmin
      .from('trading_actions')
      .select('*')
      .eq('id', tradeActionId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !tradeOrder) {
      console.error('Trade order fetch error:', fetchError);
      return createErrorResponse('Trade order not found');
    }

    const existingResolvedOrder = await findExistingResolvedOrder(
      supabaseAdmin,
      tradeOrder,
      userId
    );

    if (existingResolvedOrder) {
      console.log(
        `Existing resolved order found for ${tradeOrder.ticker} (status=${existingResolvedOrder.status}), skipping ${action}`
      );
      await cleanUpOrdersForTicker(supabaseAdmin, tradeOrder, userId);
      return createErrorResponse(
        'Order already processed for this ticker',
        200,
        {
          existingOrderId: existingResolvedOrder.id,
          existingOrderStatus: existingResolvedOrder.status
        }
      );
    }

    if (action === 'reject') {
      // Handle rejection - just update status
      const { error: updateError } = await supabaseAdmin
        .from('trading_actions')
        .update({
          status: TRADE_ORDER_STATUS.REJECTED
        })
        .eq('id', tradeActionId)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      await cleanUpOrdersForTicker(supabaseAdmin, tradeOrder, userId);

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Trade order rejected',
          status: TRADE_ORDER_STATUS.REJECTED
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle approval - execute on Alpaca

    // Check if already approved or has Alpaca order
    if (tradeOrder.status === TRADE_ORDER_STATUS.APPROVED && tradeOrder.metadata?.alpaca_order?.id) {
      await cleanUpOrdersForTicker(supabaseAdmin, tradeOrder, userId);
      return createErrorResponse(
        'Order already executed',
        200,
        {
          alpacaOrderId: tradeOrder.metadata?.alpaca_order?.id,
          tradeActionId
        }
      );
    }

    // Get user's Alpaca credentials
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('api_settings')
      .select('alpaca_paper_api_key, alpaca_paper_secret_key, alpaca_live_api_key, alpaca_live_secret_key, alpaca_paper_trading')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings) {
      console.error('Settings error for user', userId, ':', settingsError);
      return createErrorResponse('API settings not found. Please configure in Settings.');
    }

    // Determine which credentials to use based on paper trading setting
    const isPaper = settings?.alpaca_paper_trading ?? true;
    const alpacaApiKey = isPaper ? settings?.alpaca_paper_api_key : settings?.alpaca_live_api_key;
    const alpacaApiSecret = isPaper ? settings?.alpaca_paper_secret_key : settings?.alpaca_live_secret_key;

    if (!alpacaApiKey || !alpacaApiSecret) {
      console.log('Missing Alpaca credentials for user', userId);
      return createErrorResponse('Alpaca credentials not configured. Please add them in Settings.');
    }

    // Alpaca API base URL
    const alpacaBaseUrl = isPaper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    // Log metadata for debugging
    console.log(`📋 Trade order metadata for ${tradeOrder.ticker}:`, tradeOrder.metadata);

    const symbolResolution = await resolveAlpacaSymbol(
      tradeOrder.ticker,
      alpacaBaseUrl,
      alpacaApiKey,
      alpacaApiSecret
    );
    const alpacaOrderSymbol = symbolResolution.orderSymbol;
    const alpacaPositionSymbol = symbolResolution.positionSymbol;
    const encodedPositionSymbol = encodeURIComponent(alpacaPositionSymbol);

    const sanitizedAsset = symbolResolution.asset ? {
      symbol: symbolResolution.asset.symbol,
      name: symbolResolution.asset.name,
      status: symbolResolution.asset.status,
      asset_class: symbolResolution.asset.asset_class,
      exchange: symbolResolution.asset.exchange,
      tradable: symbolResolution.asset.tradable,
      fractionable: symbolResolution.asset.fractionable,
      marginable: symbolResolution.asset.marginable,
      shortable: symbolResolution.asset.shortable,
      easy_to_borrow: symbolResolution.asset.easy_to_borrow,
      maintenance_margin_requirement: symbolResolution.asset.maintenance_margin_requirement,
      min_order_size: symbolResolution.asset.min_order_size,
      min_trade_increment: symbolResolution.asset.min_trade_increment,
      price_increment: symbolResolution.asset.price_increment,
      round_lot: symbolResolution.asset.round_lot
    } : null;

    const symbolMetadata = {
      original_ticker: tradeOrder.ticker,
      resolved_symbol: alpacaOrderSymbol,
      resolved_position_symbol: alpacaPositionSymbol,
      resolved_asset_symbol: symbolResolution.assetSymbol,
      resolved_candidate: symbolResolution.candidate,
      looked_up_symbols: symbolResolution.lookedUpSymbols,
      asset: sanitizedAsset,
      is_crypto: symbolResolution.isCrypto
    };

    if (symbolResolution.lookedUpSymbols.length > 0) {
      console.log('🔁 Alpaca symbol lookup attempts:', symbolResolution.lookedUpSymbols);
    }

    if (symbolResolution.asset) {
      console.log(
        `🎯 Resolved Alpaca asset for ${tradeOrder.ticker}: order=${alpacaOrderSymbol}, position=${alpacaPositionSymbol}, asset=${symbolResolution.assetSymbol} (asset class: ${symbolResolution.asset.asset_class}, fractionable: ${symbolResolution.asset.fractionable})`
      );
    } else {
      console.log(`⚠️ Using fallback Alpaca symbol for ${tradeOrder.ticker}: ${alpacaOrderSymbol}`);
    }

    // Check if this is a full position closure SELL order
    // Also check if we're trying to sell almost all shares (within 0.01% tolerance for precision issues)
    let shouldUseClosePosition =
      tradeOrder.action === 'SELL' &&
      tradeOrder.shares &&
      tradeOrder.shares > 0 &&
      (tradeOrder.metadata?.useCloseEndpoint === true ||
        tradeOrder.metadata?.shouldClosePosition === true ||
        tradeOrder.metadata?.isFullPositionClosure === true);
    
    console.log(`🔍 Close position check: action=${tradeOrder.action}, shares=${tradeOrder.shares}, useCloseEndpoint=${tradeOrder.metadata?.useCloseEndpoint}, shouldClose=${shouldUseClosePosition}`);

    // Additional safety check: If it's a SELL order, fetch current position to check for precision issues
    if (tradeOrder.action === 'SELL' && tradeOrder.shares > 0 && !shouldUseClosePosition) {
      try {
        console.log(`🔍 Checking position for ${tradeOrder.ticker} (${alpacaPositionSymbol}) to detect precision issues`);
        const positionResponse = await fetch(`${alpacaBaseUrl}/v2/positions/${encodedPositionSymbol}`, {
          headers: {
            'APCA-API-KEY-ID': alpacaApiKey,
            'APCA-API-SECRET-KEY': alpacaApiSecret,
          },
        });

        if (positionResponse.ok) {
          const position = await positionResponse.json();
          const currentQty = parseFloat(position.qty);
          const requestedQty = tradeOrder.shares;
          const difference = Math.abs(currentQty - requestedQty);
          const percentDiff = (difference / currentQty) * 100;

          console.log(`📊 Position check: Current=${currentQty}, Requested=${requestedQty}, Diff=${difference}`);

          // If trying to sell within 0.1% of total position, use close endpoint to avoid precision issues
          if (percentDiff < 0.1) {
            console.log(`⚠️ Detected near-full position sale (${percentDiff.toFixed(4)}% difference) - switching to close position endpoint`);
            shouldUseClosePosition = true;
          }
        }
      } catch (error) {
        console.error('Error checking position for precision issues:', error);
        // Continue with regular order if check fails
      }
    }

    let alpacaResponse;
    let alpacaOrder: any;
    let orderRequest: any = null;

    if (shouldUseClosePosition) {
      // Use DELETE /positions/{symbol} endpoint for clean position closure
      console.log(
        `🎯 Using close position endpoint for ${tradeOrder.ticker} (resolved: position=${alpacaPositionSymbol}, order=${alpacaOrderSymbol}) - closing entire position`
      );

      alpacaResponse = await fetch(`${alpacaBaseUrl}/v2/positions/${encodedPositionSymbol}`, {
        method: 'DELETE',
        headers: {
          'APCA-API-KEY-ID': alpacaApiKey,
          'APCA-API-SECRET-KEY': alpacaApiSecret,
        },
      });

      if (!alpacaResponse.ok) {
        const errorText = await alpacaResponse.text();
        let parsedError: any = null;
        try {
          parsedError = JSON.parse(errorText);
        } catch {
          parsedError = null;
        }

        const rawErrorString = parsedError ? JSON.stringify(parsedError) : errorText;
        const detailedMessage = parsedError?.message || parsedError?.error;
        const errorMessage = rawErrorString
          ? `Alpaca API error: ${rawErrorString}`
          : 'Alpaca API error: Unknown error';

        const errorPayload = {
          success: false,
          error: errorMessage,
          errorDetail: detailedMessage || null,
          errorCode: parsedError?.code,
          alpacaError: parsedError || errorText,
          alpacaStatus: alpacaResponse.status,
          symbol: alpacaOrderSymbol,
          position_symbol: alpacaPositionSymbol,
          symbolMetadata,
          request: orderRequest
        };

        console.error('Alpaca close position error:', errorPayload);

        // If position doesn't exist, that's actually OK - nothing to close
        if (alpacaResponse.status === 404) {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'No position exists to close',
              warning: 'Position was already closed or never existed',
              symbol: alpacaOrderSymbol,
              position_symbol: alpacaPositionSymbol,
              symbolMetadata
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify(errorPayload),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Parse the close position response
      // Alpaca's close position endpoint returns an order object
      const closeResponse = await alpacaResponse.json();
      console.log('Position closed successfully:', closeResponse);
      console.log('Order ID from close position:', closeResponse.id || closeResponse.order_id || 'No order ID in response');

      // The close position endpoint returns an actual order object
      // Use the real order data from Alpaca
      const fallbackTimeInForce = symbolResolution.isCrypto ? 'gtc' : 'day';

      alpacaOrder = {
        id: closeResponse.id || closeResponse.order_id,  // Use actual Alpaca order ID
        client_order_id: closeResponse.client_order_id || `ai_close_${tradeActionId}_${Date.now()}`,
        created_at: closeResponse.created_at || new Date().toISOString(),
        submitted_at: closeResponse.submitted_at || new Date().toISOString(),
        filled_at: closeResponse.filled_at || new Date().toISOString(),
        status: closeResponse.status || 'filled',  // Use actual status from Alpaca
        symbol: closeResponse.symbol || alpacaOrderSymbol,
        side: closeResponse.side || 'sell',
        order_type: closeResponse.order_type || 'market',
        time_in_force: closeResponse.time_in_force || fallbackTimeInForce,
        qty: closeResponse.qty || tradeOrder.shares,
        filled_qty: closeResponse.filled_qty || closeResponse.qty || tradeOrder.shares,
        filled_avg_price: closeResponse.filled_avg_price || closeResponse.avg_fill_price || 
                         (closeResponse.market_value && closeResponse.qty ? closeResponse.market_value / closeResponse.qty : 0),
        close_position_used: true,  // Flag to indicate close endpoint was used
        position_closed: closeResponse  // Store the full response data
      };

    } else {
      // Use standard order submission
      const timeInForce = symbolResolution.isCrypto ? 'gtc' : 'day';
      orderRequest = {
        symbol: alpacaOrderSymbol,
        side: tradeOrder.action.toLowerCase(),
        type: 'market',
        time_in_force: timeInForce,
        client_order_id: `ai_${tradeActionId}_${Date.now()}`
      };

      // Set quantity based on order type
      if (tradeOrder.dollar_amount && tradeOrder.dollar_amount > 0) {
        orderRequest.notional = tradeOrder.dollar_amount;
      } else if (tradeOrder.shares && tradeOrder.shares > 0) {
        orderRequest.qty = tradeOrder.shares;
      } else {
        throw new Error('Invalid order: no quantity or dollar amount specified');
      }

      console.log('Submitting Alpaca order:', { ...orderRequest, original_symbol: tradeOrder.ticker });

      // Submit order to Alpaca
      alpacaResponse = await fetch(`${alpacaBaseUrl}/v2/orders`, {
        method: 'POST',
        headers: {
          'APCA-API-KEY-ID': alpacaApiKey,
          'APCA-API-SECRET-KEY': alpacaApiSecret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderRequest),
      });

      if (!alpacaResponse.ok) {
        const errorText = await alpacaResponse.text();
        let parsedError: any = null;
        try {
          parsedError = JSON.parse(errorText);
        } catch {
          parsedError = null;
        }

        const rawErrorString = parsedError ? JSON.stringify(parsedError) : errorText;
        const detailedMessage = parsedError?.message || parsedError?.error;
        const errorMessage = rawErrorString
          ? `Alpaca API error: ${rawErrorString}`
          : 'Alpaca API error: Unknown error';

        const errorPayload = {
          success: false,
          error: errorMessage,
          errorDetail: detailedMessage || null,
          errorCode: parsedError?.code,
          alpacaError: parsedError || errorText,
          alpacaStatus: alpacaResponse.status,
          symbol: alpacaOrderSymbol,
          position_symbol: alpacaPositionSymbol,
          symbolMetadata,
          request: orderRequest
        };

        console.error('Alpaca API error:', errorPayload);

        return new Response(
          JSON.stringify(errorPayload),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      alpacaOrder = await alpacaResponse.json();
      if (!alpacaOrder.symbol) {
        alpacaOrder.symbol = alpacaOrderSymbol;
      }
      console.log('Alpaca order created:', alpacaOrder);
    }

    if (!alpacaOrder.symbol) {
      alpacaOrder.symbol = alpacaOrderSymbol;
    }
    if (orderRequest?.notional && !alpacaOrder.notional) {
      alpacaOrder.notional = orderRequest.notional;
    }
    if (orderRequest?.qty && !alpacaOrder.qty) {
      alpacaOrder.qty = orderRequest.qty;
    }

    // Update database with Alpaca order info - only update status to approved and add Alpaca metadata
    const { error: updateError } = await supabaseAdmin
      .from('trading_actions')
      .update({
        status: TRADE_ORDER_STATUS.APPROVED,
        executed_at: new Date().toISOString(),
        metadata: {
          ...tradeOrder.metadata,
          alpaca_symbol_resolution: {
            ...(tradeOrder.metadata?.alpaca_symbol_resolution || {}),
            ...symbolMetadata
          },
          alpaca_order: {
            id: alpacaOrder.id,
            client_order_id: alpacaOrder.client_order_id,
            created_at: alpacaOrder.created_at,
            submitted_at: alpacaOrder.submitted_at,
            status: alpacaOrder.status,
            type: alpacaOrder.order_type,
            time_in_force: alpacaOrder.time_in_force,
            symbol: alpacaOrder.symbol || alpacaOrderSymbol,
            requested_symbol: alpacaOrderSymbol,
            position_symbol: alpacaPositionSymbol,
            limit_price: alpacaOrder.limit_price,
            stop_price: alpacaOrder.stop_price,
            notional: alpacaOrder.notional || orderRequest?.notional || null,
            qty: alpacaOrder.qty || orderRequest?.qty || null,
            filled_qty: alpacaOrder.filled_qty || null,
            filled_avg_price: alpacaOrder.filled_avg_price || null
          }
        }
      })
      .eq('id', tradeOrder.id)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update database after order execution:', updateError);
      // Don't throw here - order was successfully placed
    }

    await cleanUpOrdersForTicker(supabaseAdmin, tradeOrder, userId);

    // Start a background task to poll order status (only for regular orders, not close position)
    if (!alpacaOrder.close_position_used) {
      setTimeout(async () => {
        try {
          await pollOrderStatus(
            alpacaOrder.id,
            tradeOrder.id,
            userId,
            alpacaApiKey,
            alpacaApiSecret,
            alpacaBaseUrl,
            supabaseAdmin
          );
        } catch (err) {
          console.error('Error polling order status:', err);
        }
      }, 5000);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Trade order executed successfully',
        alpacaOrderId: alpacaOrder.id,
        alpacaStatus: alpacaOrder.status,
        alpacaOrderSymbol,
        alpacaPositionSymbol,
        symbolResolution: symbolMetadata,
        order: {
          symbol: alpacaOrder.symbol,
          side: alpacaOrder.side,
          qty: alpacaOrder.qty,
          notional: alpacaOrder.notional,
          type: alpacaOrder.order_type,
          status: alpacaOrder.status
        },
        request: orderRequest
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error executing trade:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error)?.message || 'Internal server error',
        errorDetail: error instanceof Error ? error.stack : null,
        httpStatus: 500
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  }
});

async function cleanUpOrdersForTicker(
  supabase: any,
  tradeOrder: any,
  userId: string
) {
  try {
    let query = supabase
      .from('trading_actions')
      .select('id, status, created_at')
      .eq('user_id', userId)
      .eq('ticker', tradeOrder.ticker);

    if (tradeOrder.source_type) {
      query = query.eq('source_type', tradeOrder.source_type);
    }

    if (tradeOrder.rebalance_request_id) {
      query = query.eq('rebalance_request_id', tradeOrder.rebalance_request_id);
    } else {
      query = query.is('rebalance_request_id', null);
    }

    if (tradeOrder.analysis_id) {
      query = query.eq('analysis_id', tradeOrder.analysis_id);
    } else {
      query = query.is('analysis_id', null);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Failed to load orders for cleanup:', error);
      return;
    }

    if (!data || data.length <= 1) {
      return;
    }

    const sortByCreatedDesc = (items: any[]) =>
      [...items].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });

    const approved = data.filter((row) => row.status === TRADE_ORDER_STATUS.APPROVED);
    const rejected = data.filter((row) => row.status === TRADE_ORDER_STATUS.REJECTED);
    const pending = data.filter((row) => row.status === TRADE_ORDER_STATUS.PENDING);

    const idsToKeep = new Set<string>();

    if (approved.length > 0) {
      const [latestApproved] = sortByCreatedDesc(approved);
      if (latestApproved) idsToKeep.add(latestApproved.id);
    } else if (rejected.length > 0) {
      const [latestRejected] = sortByCreatedDesc(rejected);
      if (latestRejected) idsToKeep.add(latestRejected.id);
    } else if (pending.length > 0) {
      const [latestPending] = sortByCreatedDesc(pending);
      if (latestPending) idsToKeep.add(latestPending.id);
    }

    const idsToDelete = data
      .filter((row) => !idsToKeep.has(row.id))
      .map((row) => row.id);

    if (idsToDelete.length === 0) {
      return;
    }

    const { error: deleteError } = await supabase
      .from('trading_actions')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) {
      console.error('Failed to delete duplicate orders:', deleteError);
    } else {
      console.log(
        `Cleaned up ${idsToDelete.length} duplicate order(s) for ${tradeOrder.ticker}`
      );
    }
  } catch (error) {
    console.error('Error cleaning up orders for ticker:', error);
  }
}

async function findExistingResolvedOrder(
  supabase: any,
  tradeOrder: any,
  userId: string
) {
  try {
    let query = supabase
      .from('trading_actions')
      .select('id, status')
      .eq('user_id', userId)
      .eq('ticker', tradeOrder.ticker)
      .neq('id', tradeOrder.id)
      .in('status', [
        TRADE_ORDER_STATUS.APPROVED,
        TRADE_ORDER_STATUS.REJECTED
      ])
      .limit(1);

    if (tradeOrder.source_type) {
      query = query.eq('source_type', tradeOrder.source_type);
    }

    if (tradeOrder.rebalance_request_id) {
      query = query.eq('rebalance_request_id', tradeOrder.rebalance_request_id);
    } else {
      query = query.is('rebalance_request_id', null);
    }

    if (tradeOrder.analysis_id) {
      query = query.eq('analysis_id', tradeOrder.analysis_id);
    } else {
      query = query.is('analysis_id', null);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Failed to check for existing resolved orders:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error checking for existing resolved orders:', error);
    return null;
  }
}

// Helper function to poll order status
async function pollOrderStatus(
  alpacaOrderId: string,
  tradeActionId: string,
  userId: string,
  apiKey: string,
  apiSecret: string,
  baseUrl: string,
  supabase: any
) {
  const maxAttempts = 12; // Poll for up to 1 minute
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    try {
      // Get order status from Alpaca
      const response = await fetch(`${baseUrl}/v2/orders/${alpacaOrderId}`, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        console.error('Failed to fetch order status');
        return;
      }

      const order = await response.json();

      // Get current metadata
      const { data: currentAction } = await supabase
        .from('trading_actions')
        .select('metadata')
        .eq('id', tradeActionId)
        .eq('user_id', userId)
        .single();

      // Update database with latest Alpaca status (metadata only - do NOT change main status)
      await supabase
        .from('trading_actions')
        .update({
          metadata: {
            ...currentAction?.metadata,
            alpaca_order: {
              ...currentAction?.metadata?.alpaca_order,
              status: order.status,
              filled_qty: order.filled_qty || null,
              filled_avg_price: order.filled_avg_price || null,
              updated_at: new Date().toISOString()
            }
          }
        })
        .eq('id', tradeActionId)
        .eq('user_id', userId);

      // Stop polling if order is in terminal state
      if (isAlpacaOrderTerminal(order.status)) {
        console.log(`Order ${alpacaOrderId} reached terminal state: ${order.status}`);
        return;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
      console.error('Error polling order status:', error);
      return;
    }
  }
}
