/**
 * Alert dialogs for workflow limitations and warnings
 */

import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

interface AlertDialogsProps {
  showLimitAlert: boolean;
  setShowLimitAlert: (value: boolean) => void;
  showRebalanceAlert: boolean;
  setShowRebalanceAlert: (value: boolean) => void;
  maxParallelAnalysis: number;
  runningAnalysesCount: number;
}

export function AlertDialogs({
  showLimitAlert,
  setShowLimitAlert,
  showRebalanceAlert,
  setShowRebalanceAlert,
  maxParallelAnalysis,
  runningAnalysesCount
}: AlertDialogsProps) {
  return (
    <>
      {/* Limit Reached Alert Dialog */}
      <AlertDialog open={showLimitAlert} onOpenChange={setShowLimitAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Analysis Limit Reached
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                You have reached your maximum limit of {maxParallelAnalysis} parallel {maxParallelAnalysis === 1 ? 'analysis' : 'analyses'}.
              </p>
              <p>
                Currently {runningAnalysesCount} {runningAnalysesCount === 1 ? 'analysis is' : 'analyses are'} running. Please wait for one to complete before starting another.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowLimitAlert(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rebalance Running Alert Dialog */}
      <AlertDialog open={showRebalanceAlert} onOpenChange={setShowRebalanceAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-yellow-500 animate-spin" />
              Portfolio Rebalance in Progress
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                A portfolio rebalance is currently running. Individual stock analyses are temporarily disabled during rebalancing.
              </p>
              <p>
                Please wait for the rebalance to complete before starting new analyses.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowRebalanceAlert(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}