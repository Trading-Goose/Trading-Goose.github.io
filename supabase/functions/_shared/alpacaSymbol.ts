const addUnique = (list: string[], value?: string | null) => {
  if (!value) return;
  const normalized = value.trim().toUpperCase();
  if (!normalized) return;
  if (!list.includes(normalized)) {
    list.push(normalized);
  }
};

const buildQuoteLengths = (length: number): number[] => {
  const minQuoteLength = 2;
  const maxQuoteLength = Math.min(6, length - 1);

  if (maxQuoteLength < minQuoteLength) {
    return [];
  }

  const values: number[] = [];
  for (let candidate = minQuoteLength; candidate <= maxQuoteLength; candidate++) {
    values.push(candidate);
  }

  const ideal = Math.round(length / 2);

  return values.sort((a, b) => {
    const diff = Math.abs(a - ideal) - Math.abs(b - ideal);
    if (diff !== 0) {
      return diff;
    }
    return a - b;
  });
};

export const generateCryptoSymbolCandidates = (symbol: string): string[] => {
  const upper = symbol.trim().toUpperCase();
  const sanitized = upper.replace(/[^A-Z0-9]/g, '');
  const slashCandidates: string[] = [];
  const plainCandidates: string[] = [];

  addUnique(plainCandidates, sanitized);

  if (upper.includes('/')) {
    addUnique(slashCandidates, upper);
  } else {
    addUnique(plainCandidates, upper);

    if (sanitized.length >= 5) {
      const quoteLengths = buildQuoteLengths(sanitized.length);

      for (const quoteLength of quoteLengths) {
        const splitIndex = sanitized.length - quoteLength;
        if (splitIndex < 2) {
          continue;
        }

        const base = sanitized.slice(0, splitIndex);
        const quote = sanitized.slice(splitIndex);
        addUnique(slashCandidates, `${base}/${quote}`);
      }
    }
  }

  const combined = [...slashCandidates, ...plainCandidates];
  return combined.length > 0 ? combined : [upper];
};

export const ensureCryptoPairSymbol = (symbol: string): string => {
  const candidates = generateCryptoSymbolCandidates(symbol);
  const withDelimiter = candidates.find((value) => value.includes('/'));
  return withDelimiter ?? candidates[0] ?? symbol.toUpperCase();
};
