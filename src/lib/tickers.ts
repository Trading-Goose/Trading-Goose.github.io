export interface FormatTickerOptions {
  assetClass?: string | null;
  assetSymbol?: string | null;
}

const sanitize = (ticker: string) => ticker.replace(/[^A-Z0-9/]/gi, "").toUpperCase();

/**
 * Format tickers for display. Equity tickers are uppercased, while crypto pairs
 * preserve any explicit slash formatting supplied by upstream metadata.
 */
export function formatTickerForDisplay(ticker?: string | null, options: FormatTickerOptions = {}): string {
  if (!ticker) return "";

  const raw = ticker.trim();
  if (!raw) return "";

  const preferred = options.assetSymbol?.trim();
  if (preferred && preferred.includes('/')) {
    return sanitize(preferred);
  }

  const upper = sanitize(raw);
  if (upper.includes('/')) {
    return upper;
  }

  return upper;
}

/**
 * Normalize a ticker for comparisons by removing non-alphanumeric characters
 * and uppercasing the result. Works for both equities and crypto pairs.
 */
export function normalizeTickerForComparison(ticker?: string | null): string {
  if (!ticker) return "";
  return ticker.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}
