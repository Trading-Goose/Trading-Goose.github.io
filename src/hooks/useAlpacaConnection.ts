import { create } from 'zustand';
import { useState, useEffect } from 'react';
import { alpacaAPI } from '@/lib/alpaca';
import { useAuth, isSessionValid } from '@/lib/auth';

interface AlpacaConnectionStore {
  isConnected: boolean;
  isLoading: boolean;
  lastError: string | null;
  lastCheckTime: Date | null;
  setConnectionStatus: (connected: boolean, error?: string) => void;
  setLoading: (loading: boolean) => void;
  checkConnection: () => Promise<void>;
}

export const useAlpacaConnectionStore = create<AlpacaConnectionStore>((set, get) => ({
  isConnected: true, // Assume connected initially
  isLoading: false,
  lastError: null,
  lastCheckTime: null,

  setConnectionStatus: (connected: boolean, error?: string) => {
    set({ 
      isConnected: connected, 
      lastError: error || null,
      lastCheckTime: new Date()
    });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  checkConnection: async () => {
    // Check if session is valid before making API call
    if (!isSessionValid()) {
      console.log('useAlpacaConnection: Skipping connection check - session invalid');
      return;
    }
    
    const { setConnectionStatus, setLoading } = get();
    setLoading(true);
    
    try {
      // Try to get account data as a connection test
      const data = await alpacaAPI.getBatchAccountData();
      
      // If we get here without error, connection is good
      setConnectionStatus(true);
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      
      // Check if it's a connection/service issue
      if (errorMessage.includes('timeout') ||
          errorMessage.includes('504') ||
          errorMessage.includes('503') ||
          errorMessage.includes('Unable to connect to Alpaca') ||
          errorMessage.includes('Alpaca services appear to be down') ||
          errorMessage.includes('https://app.alpaca.markets/dashboard/overview')) {
        
        // Extract or build a meaningful error message
        let displayError = errorMessage;
        if (!errorMessage.includes('https://app.alpaca.markets/dashboard/overview')) {
          displayError = 'Unable to connect to Alpaca trading platform. Please check if services are operational.';
        }
        
        setConnectionStatus(false, displayError);
      } else if (errorMessage.includes('API settings not found') || 
                 errorMessage.includes('not configured') ||
                 errorMessage.includes('Alpaca credentials not configured')) {
        // This is not a connection error but a configuration issue
        // Consider it as "connected" but not configured
        setConnectionStatus(true);
      } else {
        // Other errors - assume connection is ok but something else failed
        setConnectionStatus(true);
      }
    } finally {
      setLoading(false);
    }
  }
}));

// Hook to monitor Alpaca connection status
export function useAlpacaConnection() {
  const store = useAlpacaConnectionStore();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  useEffect(() => {
    // Don't check connection until auth is ready and session is valid
    if (authLoading || !isAuthenticated || !isSessionValid()) {
      return;
    }
    
    // Add a small delay on initial mount to ensure session is settled
    const timeoutId = setTimeout(() => {
      // Initial check after auth is ready
      store.checkConnection();
      
      // Check periodically (every 30 seconds)
      const interval = setInterval(() => {
        // Only check if session is still valid
        if (isSessionValid()) {
          store.checkConnection();
        }
      }, 30000);
      
      // Store interval for cleanup
      (window as any).__alpacaConnectionInterval = interval;
    }, 500);
    
    return () => {
      clearTimeout(timeoutId);
      const interval = (window as any).__alpacaConnectionInterval;
      if (interval) {
        clearInterval(interval);
        delete (window as any).__alpacaConnectionInterval;
      }
    };
  }, [authLoading, isAuthenticated]);
  
  return {
    isConnected: store.isConnected,
    isLoading: store.isLoading,
    lastError: store.lastError,
    lastCheckTime: store.lastCheckTime,
    checkConnection: store.checkConnection
  };
}