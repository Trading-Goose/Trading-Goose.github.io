// Custom hook for managing watchlist functionality
// Extracted from RebalanceModal.tsx maintaining exact same logic

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { RebalancePosition } from "../types";

export function useWatchlist(
  isOpen: boolean,
  positions: RebalancePosition[],
  selectedPositions: Set<string>,
  setSelectedPositions: (value: Set<string>) => void,
  maxStocks: number
) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [includeWatchlist, setIncludeWatchlist] = useState(false);
  const [watchlistStocks, setWatchlistStocks] = useState<string[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);

  // Reset watchlist when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIncludeWatchlist(false);
      setWatchlistStocks([]);
    }
  }, [isOpen]);

  // Load watchlist stocks when includeWatchlist changes
  useEffect(() => {
    if (includeWatchlist && user) {
      loadWatchlistStocks();
    } else if (!includeWatchlist) {
      // Remove watchlist stocks from selection when disabled
      const newSelection = new Set(selectedPositions);
      watchlistStocks.forEach(ticker => {
        newSelection.delete(ticker);
      });
      setSelectedPositions(newSelection);
      setWatchlistStocks([]);
    }
  }, [includeWatchlist, user, positions]);

  const loadWatchlistStocks = async () => {
    if (!user) return;
    
    setLoadingWatchlist(true);
    try {
      const { data, error } = await supabase
        .from('watchlist')
        .select('ticker')
        .eq('user_id', user.id)
        .order('ticker');
      
      if (error) {
        console.error('Error loading watchlist:', error);
        return;
      }
      
      if (data) {
        // Filter out stocks that are already in positions
        const positionTickers = new Set(positions.map(p => p.ticker));
        const watchlistOnlyStocks = data
          .map(item => item.ticker)
          .filter(ticker => !positionTickers.has(ticker));
        
        setWatchlistStocks(watchlistOnlyStocks);
        
        // Auto-select watchlist stocks when loaded (respecting the max limit)
        if (watchlistOnlyStocks.length > 0) {
          setSelectedPositions((() => {
            const newSelection = new Set(selectedPositions);
            let addedCount = 0;
            for (const ticker of watchlistOnlyStocks) {
              // Check if adding this stock would exceed the limit
              if (maxStocks > 0 && newSelection.size >= maxStocks) {
                if (addedCount < watchlistOnlyStocks.length) {
                  toast({
                    title: "Stock Selection Limit",
                    description: `Only ${addedCount} of ${watchlistOnlyStocks.length} watchlist stocks were selected due to the ${maxStocks} stock limit.`,
                    variant: "default",
                  });
                }
                break;
              }
              newSelection.add(ticker);
              addedCount++;
            }
            return newSelection;
          })());
        }
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  const handleIncludeWatchlistChange = (checked: boolean) => {
    setIncludeWatchlist(checked);
    // The actual selection/deselection happens in the useEffect and loadWatchlistStocks
  };

  return {
    includeWatchlist,
    watchlistStocks,
    loadingWatchlist,
    handleIncludeWatchlistChange
  };
}