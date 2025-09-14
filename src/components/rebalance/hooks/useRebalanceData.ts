// Custom hook for loading and managing rebalance data
// Extracted from RebalanceModal.tsx maintaining exact same logic

import { useState, useEffect } from "react";
import { alpacaAPI } from "@/lib/alpaca";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useRBAC } from "@/hooks/useRBAC";
import type { RebalancePosition, RebalanceConfig } from "../types";

export function useRebalanceData(isOpen: boolean) {
  const { apiSettings } = useAuth();
  const { toast } = useToast();
  const { hasOpportunityAgentAccess } = useRBAC();
  const [loading, setLoading] = useState(false);
  const [positions, setPositions] = useState<RebalancePosition[]>([]);
  const [cashAllocation, setCashAllocation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [portfolioTotalValue, setPortfolioTotalValue] = useState(0);
  const [portfolioCashBalance, setPortfolioCashBalance] = useState(0);
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(new Set());

  // Check if user has opportunity agent access
  const hasOppAccess = hasOpportunityAgentAccess();

  // Configuration state - if no opportunity agent access, skip it by default
  const [config, setConfig] = useState<RebalanceConfig>({
    maxPosition: 25,  // Default 25% max position size
    minPosition: 5,   // Default 5% min position size
    rebalanceThreshold: 10,
    targetStockAllocation: 80,
    targetCashAllocation: 20,
    skipThresholdCheck: false,
    skipOpportunityAgent: !hasOppAccess // Auto-skip if no access
  });

  // Load data when modal opens
  useEffect(() => {
    if (isOpen && apiSettings) {
      loadData();
    } else if (!isOpen) {
      // Reset state when modal closes
      setPositions([]);
      setCashAllocation(0);
      setSelectedPositions(new Set());
      setError(null);
    }
  }, [isOpen, apiSettings]);

  const loadData = async () => {
    // Check if API settings are available
    const isPaper = apiSettings?.alpaca_paper_trading ?? true;

    if (isPaper) {
      if (!apiSettings?.alpaca_paper_api_key || !apiSettings?.alpaca_paper_secret_key) {
        setError("Alpaca paper trading credentials not configured");
        return;
      }
    } else {
      if (!apiSettings?.alpaca_live_api_key || !apiSettings?.alpaca_live_secret_key) {
        setError("Alpaca live trading credentials not configured");
        return;
      }
    }

    setLoading(true);
    setError(null);
    setPositions([]);
    setCashAllocation(0);

    try {
      // These values come from the user's saved settings in the database
      setConfig(prev => {
        if (apiSettings) {
          return {
            ...prev,
            maxPosition: apiSettings.rebalance_max_position_size ?? prev.maxPosition,  // Use user's saved percentage
            minPosition: apiSettings.rebalance_min_position_size ?? prev.minPosition,  // Use user's saved percentage
            rebalanceThreshold: apiSettings.rebalance_threshold ?? prev.rebalanceThreshold,
            targetStockAllocation: apiSettings.target_stock_allocation ?? prev.targetStockAllocation,
            targetCashAllocation: apiSettings.target_cash_allocation ?? prev.targetCashAllocation,
            // Ensure skipOpportunityAgent is true if user doesn't have access
            skipOpportunityAgent: !hasOppAccess ? true : prev.skipOpportunityAgent
          };
        }
        return prev;
      });

      // Load Alpaca account and positions
      console.log('Fetching Alpaca account and positions...');
      const [accountData, positionsData] = await Promise.all([
        alpacaAPI.getAccount(),
        alpacaAPI.getPositions()
      ]);

      console.log('Account data:', accountData);
      console.log('Positions data:', positionsData);

      if (!accountData) {
        throw new Error('Failed to fetch account data from Alpaca');
      }

      // Calculate total portfolio value
      const totalEquity = parseFloat(accountData.equity || '0');
      const cashBalance = parseFloat(accountData.cash || '0');

      console.log(`Account summary: Equity=$${totalEquity}, Cash=$${cashBalance}`);

      // Check for account/position mismatch
      if (cashBalance < 0 && (!positionsData || positionsData.length === 0)) {
        console.warn('⚠️ Account has negative cash (margin) but no positions!');
        console.warn('This likely means positions are in the other account type (PAPER vs LIVE)');
        console.warn('Please check your Alpaca settings in the Settings page');
      }

      if (totalEquity === 0) {
        throw new Error('Account has no equity');
      }

      // Store portfolio values
      setPortfolioTotalValue(totalEquity);
      setPortfolioCashBalance(cashBalance);

      // Process positions if any exist
      if (positionsData && Array.isArray(positionsData) && positionsData.length > 0) {
        console.log(`Processing ${positionsData.length} positions`);
        const processedPositions: RebalancePosition[] = positionsData.map((pos: any) => ({
          ticker: pos.symbol,
          currentShares: parseFloat(pos.qty || '0'),
          currentValue: parseFloat(pos.market_value || '0'),
          currentAllocation: (parseFloat(pos.market_value || '0') / totalEquity) * 100,
          avgPrice: parseFloat(pos.avg_entry_price || '0')
        }));

        // Sort positions by allocation (descending)
        processedPositions.sort((a, b) => b.currentAllocation - a.currentAllocation);

        setPositions(processedPositions);

        // Auto-select positions (will be limited by maxStocks in parent)
        setSelectedPositions(new Set(processedPositions.map(p => p.ticker)));
      } else {
        setPositions([]);
        setSelectedPositions(new Set());
      }

      setCashAllocation((cashBalance / totalEquity) * 100);

    } catch (error: any) {
      console.error('Error loading data:', error);
      setError(error.message || 'Failed to load portfolio data');
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    positions,
    cashAllocation,
    portfolioTotalValue,
    portfolioCashBalance,
    selectedPositions,
    setSelectedPositions,
    config,
    setConfig
  };
}