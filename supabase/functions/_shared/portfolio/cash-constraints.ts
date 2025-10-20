export function calculateAllowedCash(
  availableCash: number,
  totalValue: number,
  targetCashAllocationPercent?: number,
  bufferMultiplier = 0.25
): number {
  const safeAvailable = Number.isFinite(availableCash) ? Math.max(0, availableCash) : 0;
  const safeTotalValue = Number.isFinite(totalValue) ? Math.max(0, totalValue) : 0;

  if (safeAvailable === 0) {
    return 0;
  }

  const rawPercent = typeof targetCashAllocationPercent === 'number'
    ? targetCashAllocationPercent
    : 20; // default 20%

  const normalizedPercent = Math.max(0, Math.min(1, rawPercent > 1 ? rawPercent / 100 : rawPercent));
  const targetDollarCash = safeTotalValue * normalizedPercent;

  if (targetDollarCash <= 0) {
    return safeAvailable;
  }

  if (safeAvailable >= targetDollarCash) {
    const spareCash = safeAvailable - targetDollarCash;
    const buffer = targetDollarCash * bufferMultiplier;
    return Math.min(safeAvailable, Math.max(0, spareCash + buffer));
  }

  const constrainedCash = safeAvailable * bufferMultiplier;
  return Math.min(safeAvailable, Math.max(0, constrainedCash));
}
