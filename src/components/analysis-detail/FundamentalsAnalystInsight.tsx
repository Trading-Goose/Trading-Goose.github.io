import React from "react";
import { TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import MarkdownRenderer from "../MarkdownRenderer";

interface FundamentalsAnalystInsightProps {
  insightContent: string;
  additionalData: any;
  id?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function FundamentalsAnalystInsight({ 
  insightContent,
  additionalData,
  id,
  isCollapsed = false,
  onToggleCollapse
}: FundamentalsAnalystInsightProps) {
  return (
    <Collapsible open={!isCollapsed}>
      <Card id={id} className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Fundamentals Analyst
              </div>
              {onToggleCollapse && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse();
                  }}
                >
                  {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-4 space-y-4">
        {/* Display fundamental data if available */}
        {additionalData && (
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
            {additionalData.PERatio && (
              <div>
                <span className="text-muted-foreground">P/E Ratio:</span>
                <span className="ml-2 font-medium">{parseFloat(additionalData.PERatio).toFixed(2)}</span>
              </div>
            )}
            {additionalData.EPS && (
              <div>
                <span className="text-muted-foreground">EPS:</span>
                <span className="ml-2 font-medium">${additionalData.EPS}</span>
              </div>
            )}
            {additionalData.DividendYield && additionalData.DividendYield !== 'None' && (
              <div>
                <span className="text-muted-foreground">Dividend Yield:</span>
                <span className="ml-2 font-medium">{(parseFloat(additionalData.DividendYield) * 100).toFixed(2)}%</span>
              </div>
            )}
            {additionalData.ProfitMargin && (
              <div>
                <span className="text-muted-foreground">Profit Margin:</span>
                <span className="ml-2 font-medium">{(parseFloat(additionalData.ProfitMargin) * 100).toFixed(2)}%</span>
              </div>
            )}
            {additionalData.Beta && (
              <div>
                <span className="text-muted-foreground">Beta:</span>
                <span className="ml-2 font-medium">{parseFloat(additionalData.Beta).toFixed(2)}</span>
              </div>
            )}
            {additionalData['52WeekHigh'] && (
              <div>
                <span className="text-muted-foreground">52W High:</span>
                <span className="ml-2 font-medium">${additionalData['52WeekHigh']}</span>
              </div>
            )}
          </div>
        )}
        <MarkdownRenderer content={insightContent} />
      </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}