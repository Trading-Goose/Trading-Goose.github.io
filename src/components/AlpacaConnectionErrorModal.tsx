import { useEffect, useState } from 'react';
import { 
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAlpacaConnectionStore } from '@/hooks/useAlpacaConnection';

export function AlpacaConnectionErrorModal() {
  const { isConnected, lastError, checkConnection, isLoading } = useAlpacaConnectionStore();
  const [isOpen, setIsOpen] = useState(false);
  const [hasShownOnce, setHasShownOnce] = useState(false);

  useEffect(() => {
    // Show modal when connection is lost and we haven't shown it already
    if (!isConnected && !hasShownOnce) {
      setIsOpen(true);
      setHasShownOnce(true);
    }
    
    // Reset the "shown once" flag when connection is restored
    if (isConnected && hasShownOnce) {
      setHasShownOnce(false);
      setIsOpen(false);
    }
  }, [isConnected, hasShownOnce]);

  const handleRetry = async () => {
    await checkConnection();
    // Modal will auto-close if connection is restored
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Trading Platform Connection Error
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Unable to connect to the Alpaca trading platform and data source. 
              This may be due to service maintenance or connectivity issues.
            </p>
            
            <p className="font-medium">
              While the connection is down:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Analysis features are temporarily disabled</li>
              <li>Portfolio rebalancing is unavailable</li>
              <li>Real-time market data cannot be fetched</li>
            </ul>
            
            {lastError && (
              <p className="text-sm text-muted-foreground italic mt-2">
                {lastError}
              </p>
            )}
            
            <div className="flex items-center gap-2 pt-2">
              <a 
                href="https://app.alpaca.markets/dashboard/overview" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
              >
                Check Alpaca Status
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Connection
              </>
            )}
          </Button>
          <AlertDialogAction onClick={() => setIsOpen(false)}>
            Close
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}