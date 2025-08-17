import React from 'react';
import Header from '@/components/Header';
import TradeHistoryTable from '@/components/TradeHistoryTable';
import { TrendingUp } from 'lucide-react';

export default function TradeHistory() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <TrendingUp className="h-8 w-8" />
            Trade History
          </h1>
          <p className="text-muted-foreground mt-2">
            View and manage your complete trading history
          </p>
        </div>
        
        <TradeHistoryTable />
      </main>
    </div>
  );
}