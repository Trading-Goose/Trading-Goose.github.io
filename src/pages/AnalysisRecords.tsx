import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import UnifiedAnalysisHistory from '@/components/UnifiedAnalysisHistory';
import { FileText } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function AnalysisRecords() {
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
      
      <main className="flex-1 container mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Analysis Records
          </h1>
          <p className="text-muted-foreground mt-2">
            View and manage your AI trading analysis history
          </p>
        </div>
        
        <UnifiedAnalysisHistory />
      </main>
      
      <Footer />
    </div>
  );
}