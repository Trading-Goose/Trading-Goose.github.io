import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import RebalanceHistoryTable from '@/components/RebalanceHistoryTable';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function RebalanceRecords() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Don't render content until auth is checked
  if (!isAuthenticated) {
    return null;
  }

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