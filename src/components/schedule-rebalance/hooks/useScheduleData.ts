// Hook for managing schedule data loading and saving
// Extracted from ScheduleRebalanceModal.tsx

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { alpacaAPI } from "@/lib/alpaca";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useRBAC } from "@/hooks/useRBAC";
import type { 
  Position, 
  ExistingSchedule, 
  ScheduleConfig, 
  RebalanceConfig 
} from "../types";

export function useScheduleData(isOpen: boolean) {
  const { user, apiSettings } = useAuth();
  const { toast } = useToast();
  const { getMaxRebalanceStocks, hasOpportunityAgentAccess } = useRBAC();
  const maxStocks = getMaxRebalanceStocks();
  const hasOppAccess = hasOpportunityAgentAccess();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingSchedule, setExistingSchedule] = useState<ExistingSchedule | null>(null);

  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());
  const [includeWatchlist, setIncludeWatchlist] = useState(false);
  const [watchlistStocks, setWatchlistStocks] = useState<string[]>([]);
  const [includeAllPositions, setIncludeAllPositions] = useState(true);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);
  const [cashAllocation, setCashAllocation] = useState(0);
  const [portfolioTotalValue, setPortfolioTotalValue] = useState(0);
  const [portfolioCashBalance, setPortfolioCashBalance] = useState(0);

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
        const positionTickers = new Set(positions.map(p => p.ticker));
        const watchlistOnlyStocks = data
          .map(item => item.ticker)
          .filter(ticker => !positionTickers.has(ticker));

        setWatchlistStocks(watchlistOnlyStocks);

        if (watchlistOnlyStocks.length > 0) {
          setSelectedPositions(prev => {
            const newSelection = new Set(prev);
            let addedCount = 0;
            for (const ticker of watchlistOnlyStocks) {
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
          });
        }
      }
    } catch (error) {
      console.error('Error loading watchlist:', error);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  const loadData = async (
    setConfig: (config: ScheduleConfig) => void,
    setRebalanceConfig: (config: RebalanceConfig) => void
  ) => {
    setLoading(true);
    setError(null);

    try {
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('rebalance_schedules')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (scheduleData && !scheduleError) {
        setExistingSchedule(scheduleData as ExistingSchedule);

        setConfig({
          enabled: scheduleData.enabled,
          intervalValue: scheduleData.interval_value || 1,
          intervalUnit: scheduleData.interval_unit || 'weeks',
          daysOfWeek: scheduleData.day_of_week || [1],
          daysOfMonth: scheduleData.day_of_month || [1],
          timeOfDay: (() => {
            const dbTime = scheduleData.time_of_day?.slice(0, 5) || '09:00';
            const [hourStr, minuteStr] = dbTime.split(':');
            const hour24 = parseInt(hourStr);
            const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
            const period = hour24 >= 12 ? 'PM' : 'AM';
            return `${hour12.toString().padStart(2, '0')}:${minuteStr} ${period}`;
          })(),
          timezone: scheduleData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        });

        setRebalanceConfig({
          useDefaultSettings: scheduleData.use_default_settings ?? true,
          maxPosition: scheduleData.max_position_size || apiSettings?.rebalance_max_position_size || 10000,
          minPosition: scheduleData.min_position_size || apiSettings?.rebalance_min_position_size || 100,
          rebalanceThreshold: scheduleData.rebalance_threshold || apiSettings?.rebalance_threshold || 10,
          targetStockAllocation: scheduleData.target_stock_allocation || 80,
          targetCashAllocation: scheduleData.target_cash_allocation || 20,
          skipThresholdCheck: scheduleData.skip_threshold_check || false,
          // Force skip if no opportunity agent access
          skipOpportunityAgent: !hasOppAccess ? true : (scheduleData.skip_opportunity_agent || false)
        });

        if (scheduleData.selected_tickers) {
          setSelectedPositions(new Set(scheduleData.selected_tickers));
        }
        setIncludeWatchlist(scheduleData.include_watchlist || false);
        setIncludeAllPositions(scheduleData.include_all_positions || false);
      } else {
        if (apiSettings) {
          setRebalanceConfig(prev => ({
            useDefaultSettings: true,
            maxPosition: apiSettings.rebalance_max_position_size || 10000,
            minPosition: apiSettings.rebalance_min_position_size || 100,
            rebalanceThreshold: apiSettings.rebalance_threshold || 10,
            targetStockAllocation: 80,
            targetCashAllocation: 20,
            skipThresholdCheck: false,
            // Force skip if no opportunity agent access
            skipOpportunityAgent: !hasOppAccess
          }));
        }
      }

      const [accountData, alpacaPositions] = await Promise.all([
        alpacaAPI.getAccount(),
        alpacaAPI.getPositions()
      ]);

      if (accountData) {
        const totalEquity = parseFloat(accountData.equity || '0');
        const cashBalance = parseFloat(accountData.cash || '0');
        setPortfolioTotalValue(totalEquity);
        setPortfolioCashBalance(cashBalance);
        setCashAllocation((cashBalance / totalEquity) * 100);
      }

      if (alpacaPositions && Array.isArray(alpacaPositions)) {
        const totalEquity = parseFloat(accountData?.equity || '0');
        const processedPositions: Position[] = alpacaPositions.map((pos: any) => ({
          ticker: pos.symbol,
          currentShares: parseFloat(pos.qty || '0'),
          currentValue: parseFloat(pos.market_value || '0'),
          currentAllocation: totalEquity > 0 ? (parseFloat(pos.market_value || '0') / totalEquity) * 100 : 0,
          avgPrice: parseFloat(pos.avg_entry_price || '0')
        }));

        processedPositions.sort((a, b) => b.currentAllocation - a.currentAllocation);
        setPositions(processedPositions);

        if (includeAllPositions) {
          if (maxStocks > 0 && processedPositions.length > maxStocks) {
            const limitedSelection = processedPositions.slice(0, maxStocks).map(p => p.ticker);
            setSelectedPositions(new Set(limitedSelection));
            toast({
              title: "Stock Selection Limited",
              description: `Selected the top ${maxStocks} stocks by allocation. You can deselect some to choose others.`,
              variant: "default",
            });
          } else {
            setSelectedPositions(new Set(processedPositions.map(p => p.ticker)));
          }
        } else if (!scheduleData || !scheduleData.selected_tickers) {
          if (maxStocks > 0 && processedPositions.length > maxStocks) {
            const limitedSelection = processedPositions.slice(0, maxStocks).map(p => p.ticker);
            setSelectedPositions(new Set(limitedSelection));
            toast({
              title: "Stock Selection Limited",
              description: `Selected the top ${maxStocks} stocks by allocation. You can deselect some to choose others.`,
              variant: "default",
            });
          } else {
            setSelectedPositions(new Set(processedPositions.map(p => p.ticker)));
          }
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const togglePosition = (ticker: string) => {
    const newSet = new Set(selectedPositions);
    if (newSet.has(ticker)) {
      newSet.delete(ticker);
    } else {
      if (maxStocks > 0 && newSet.size >= maxStocks) {
        toast({
          title: "Stock Selection Limit Reached",
          description: `You can select a maximum of ${maxStocks} stocks for scheduled rebalancing based on your subscription plan.`,
          variant: "destructive",
        });
        return;
      }
      newSet.add(ticker);
    }
    setSelectedPositions(newSet);
  };

  useEffect(() => {
    if (includeWatchlist && user) {
      loadWatchlistStocks();
    } else if (!includeWatchlist) {
      const newSelection = new Set(selectedPositions);
      watchlistStocks.forEach(ticker => {
        newSelection.delete(ticker);
      });
      setSelectedPositions(newSelection);
      setWatchlistStocks([]);
    }
  }, [includeWatchlist, user, positions]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
      setSelectedPositions(new Set());
      setIncludeWatchlist(false);
      setWatchlistStocks([]);
    }
  }, [isOpen]);

  return {
    loading,
    saving,
    setSaving,
    error,
    existingSchedule,
    setExistingSchedule,
    positions,
    selectedPositions,
    setSelectedPositions,
    includeWatchlist,
    setIncludeWatchlist,
    watchlistStocks,
    includeAllPositions,
    setIncludeAllPositions,
    loadingWatchlist,
    cashAllocation,
    portfolioTotalValue,
    portfolioCashBalance,
    maxStocks,
    loadData,
    togglePosition,
  };
}