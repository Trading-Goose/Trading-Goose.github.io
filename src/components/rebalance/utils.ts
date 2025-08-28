// Utility functions for rebalance functionality
// Extracted from RebalanceModal.tsx maintaining exact same logic

// Generate a random color for each stock
export function generateRandomColor(seed: string): string {
  // Use the ticker as a seed for consistent colors
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Generate vibrant colors by ensuring high saturation and medium lightness
  const hue = Math.abs(hash) % 360;
  const saturation = 65 + (Math.abs(hash >> 8) % 20); // 65-85%
  const lightness = 45 + (Math.abs(hash >> 16) % 15); // 45-60%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Generate colors for all positions
export function generatePositionColors(positions: Array<{ ticker: string }>): Record<string, string> {
  return positions.reduce((acc, position) => {
    acc[position.ticker] = generateRandomColor(position.ticker);
    return acc;
  }, {} as Record<string, string>);
}