/**
 * Analysis controls component for starting and viewing analyses
 */

import { Activity, Info, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StockTickerAutocomplete from '@/components/StockTickerAutocomplete';

interface AnalysisControlsProps {
  activeAnalysisTicker: string | null;
  isAnalyzing: boolean;
  searchTicker: string;
  setSearchTicker: (value: string) => void;
  handleStartAnalysis: () => void;
  setShowAnalysisDetail: (value: boolean) => void;
}

export function AnalysisControls({
  activeAnalysisTicker,
  isAnalyzing,
  searchTicker,
  setSearchTicker,
  handleStartAnalysis,
  setShowAnalysisDetail
}: AnalysisControlsProps) {
  return (
    <div className="flex items-center justify-center p-2 rounded-lg mb-2 min-h-[36px]">
      {activeAnalysisTicker && isAnalyzing ? (
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center">
            <Activity className="w-4 h-4 mr-2 animate-pulse text-primary" />
            <span className="text-sm font-medium">
              Running analysis for {activeAnalysisTicker}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeAnalysisTicker) {
                setShowAnalysisDetail(true);
              }
            }}
            className="ml-2"
          >
            <Info className="h-3 w-3 mr-1" />
            View Details
          </Button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); handleStartAnalysis(); }} className="flex gap-2 w-full">
          <div className="flex-1">
            <StockTickerAutocomplete
              value={searchTicker}
              onChange={setSearchTicker}
              placeholder="Enter ticker to analyze"
            />
          </div>
          <Button
            type="submit"
            disabled={!searchTicker || isAnalyzing}
            size="sm"
          >
            <Play className="h-4 w-4 mr-1" />
            Analyze
          </Button>
        </form>
      )}
    </div>
  );
}