import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import RebalanceHistoryTable from '@/components/RebalanceHistoryTable';
import { RefreshCw } from 'lucide-react';

export default function RebalanceRecords() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="container mx-auto px-6 py-8 flex-1">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <RefreshCw className="h-8 w-8" />
            Rebalance Records
          </h1>
          <p className="text-muted-foreground mt-2">
            View and manage your portfolio rebalancing history
          </p>
        </div>
        
        <RebalanceHistoryTable />
      </main>
      
      <Footer />
    </div>
  );
}