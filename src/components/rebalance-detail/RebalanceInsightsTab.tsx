import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  Zap,
  PieChart,
  CheckCircle,
  Loader2,
  XCircle,
  FileText
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import MarkdownRenderer from "../MarkdownRenderer";

interface RebalanceInsightsTabProps {
  rebalanceData: any;
  selectedAnalysis: {
    ticker: string;
    date: string;
  } | null;
  setSelectedAnalysis: (analysis: { ticker: string; date: string } | null) => void;
}

// Helper functions for analysis card rendering
const getDecisionVariant = (decision: string): "default" | "secondary" | "destructive" | "outline" | "buy" | "sell" | "hold" | "completed" | "running" | "error" | "pending" => {
  switch (decision) {
    case 'BUY': return 'buy';
    case 'SELL': return 'sell';
    case 'HOLD': return 'hold';
    default: return 'outline';
  }
};

const getDecisionIcon = (decision: string) => {
  switch (decision) {
    case 'BUY': return <TrendingUp className="w-3 h-3" />;
    case 'SELL': return <TrendingDown className="w-3 h-3" />;
    case 'HOLD': return <Activity className="w-3 h-3" />;
    default: return <Activity className="w-3 h-3" />;
  }
};

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 80) return 'text-green-600 dark:text-green-400';
  if (confidence >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
};

export default function RebalanceInsightsTab({ 
  rebalanceData, 
  selectedAnalysis, 
  setSelectedAnalysis 
}: RebalanceInsightsTabProps) {
  return (
    <TabsContent value="insights" className="data-[state=active]:block hidden">
      <ScrollArea className="h-[calc(90vh-220px)] px-6 pt-6">
        <div className="pb-6 space-y-4">
          {/* Threshold Check Insights */}
          {!rebalanceData.skipThresholdCheck && (() => {
            const thresholdStep = rebalanceData.workflowSteps?.find((s: any) => s.id === 'threshold');
            if (thresholdStep?.insights) {
              return (
                <Card className="overflow-hidden">
                  <CardHeader className="bg-muted/30">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Threshold Check Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Rebalance Threshold</p>
                        <p className="text-lg font-semibold">{thresholdStep.insights.threshold}%</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Maximum Drift Detected</p>
                        <p className={`text-lg font-semibold ${thresholdStep.insights.exceededThreshold ? 'text-orange-500' : 'text-green-500'}`}>
                          {thresholdStep.insights.maxPriceChange?.toFixed(2)}%
                        </p>
                      </div>
                    </div>

                    {thresholdStep.insights.positionDrifts && thresholdStep.insights.positionDrifts.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-sm font-medium mb-2">
                          {thresholdStep.insights.positionsExceedingThreshold} of {thresholdStep.insights.totalPositions} positions exceeded threshold
                        </p>
                        <div className="space-y-2">
                          {thresholdStep.insights.positionDrifts
                            .filter((d: any) => d.exceedsThreshold)
                            .map((drift: any) => (
                              <div key={drift.ticker} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                <span className="font-mono font-medium">{drift.ticker}</span>
                                <span className={`text-sm ${drift.exceedsThreshold ? 'text-orange-500' : ''}`}>
                                  Price change: {drift.priceChangePercent > 0 ? '+' : ''}{drift.priceChangePercent.toFixed(1)}%
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-3">
                      <MarkdownRenderer content={thresholdStep.insights.reasoning} className="text-sm text-muted-foreground italic" />
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return null;
          })()}

          {/* Opportunity Analysis Insights */}
          {!rebalanceData.skipOpportunityAgent && (() => {
            const opportunityStep = rebalanceData.workflowSteps?.find((s: any) => s.id === 'opportunity');

            // Check if we have insights in the workflow step
            let insights = opportunityStep?.insights || opportunityStep?.data;

            // If we have basic selectedStocks data but no complete insights structure, create one
            if (insights && insights.selectedStocks && insights.recommendAnalysis !== true && insights.recommendAnalysis !== false) {

              // Try to find the reasoning from the original opportunity step data
              const fullOpportunityData = opportunityStep?.data;

              // Check multiple sources for the reasoning text
              let reasoningText = fullOpportunityData?.reasoning || insights.reasoning;

              // If still no reasoning, try to get it from rebalanceData.opportunity_reasoning
              if (!reasoningText && rebalanceData.opportunity_reasoning?.reasoning) {
                reasoningText = rebalanceData.opportunity_reasoning.reasoning;
              }

              // Try to get from rebalance_plan
              if (!reasoningText && rebalanceData.rebalance_plan?.opportunity_reasoning) {
                reasoningText = rebalanceData.rebalance_plan.opportunity_reasoning.reasoning;
              }

              // Try to get from agentInsights
              if (!reasoningText && rebalanceData.agentInsights?.opportunityAgent) {
                reasoningText = rebalanceData.agentInsights.opportunityAgent;
              }

              // Last fallback
              if (!reasoningText) {
                reasoningText = 'Market conditions suggest analyzing the selected stocks for potential opportunities.';
              }

              insights = {
                ...insights,
                recommendAnalysis: true, // If we have selected stocks, analysis was recommended
                reasoning: reasoningText,
                selectedStocksCount: insights.selectedStocks?.length || 0,
                evaluatedStocksCount: insights.evaluatedStocks?.length || 0
              };
            }

            if (insights) {
              // Handle case where insights might be a string (raw AI response)
              let parsedInsights = insights;
              if (typeof parsedInsights === 'string') {

                // Try to parse the JSON string
                try {
                  parsedInsights = JSON.parse(parsedInsights);

                } catch (parseError) {
                  console.error('❌ Failed to parse opportunity insights:', parseError);

                  // Try to extract key information from the malformed JSON string
                  const recommendMatch = parsedInsights.match(/"recommendAnalysis"\s*:\s*(true|false)/);
                  const selectedStocksMatch = parsedInsights.match(/"selectedStocks"\s*:\s*\[(.*?)\]/s);
                  const reasoningMatch = parsedInsights.match(/"reasoning"\s*:\s*"([^"]+)"/);

                  if (recommendMatch || selectedStocksMatch) {
                    // Attempt to extract meaningful data from the malformed JSON
                    const extractedStocks: any[] = [];

                    if (selectedStocksMatch && selectedStocksMatch[1]) {
                      // Try to extract stock information using regex
                      const stockMatches = selectedStocksMatch[1].matchAll(/"ticker"\s*:\s*"([^"]+)"[^}]*?"reason"\s*:\s*"([^"]+)"[^}]*?"priority"\s*:\s*"([^"]+)"/g);
                      for (const match of stockMatches) {
                        extractedStocks.push({
                          ticker: match[1],
                          reason: match[2],
                          priority: match[3]
                        });
                      }
                    }

                    return (
                      <Card className="overflow-hidden">
                        <CardHeader className="bg-muted/30">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            Opportunity Analysis
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Recommendation</p>
                              <p className={`text-lg font-semibold ${recommendMatch && recommendMatch[1] === 'true' ? 'text-green-500' : 'text-gray-500'}`}>
                                {recommendMatch && recommendMatch[1] === 'true' ? 'Analysis Recommended' : 'No Action Needed'}
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Stocks Selected</p>
                              <p className="text-lg font-semibold">
                                {extractedStocks.length}
                              </p>
                            </div>
                          </div>

                          {extractedStocks.length > 0 && (
                            <div className="border-t pt-3">
                              <p className="text-sm font-medium mb-2">Selected Stocks for Analysis</p>
                              <div className="space-y-2">
                                {extractedStocks.map((stock: any, idx: number) => (
                                  <div key={idx} className="p-2 bg-muted/30 rounded">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-mono font-medium">{stock.ticker}</span>
                                      <Badge variant="outline" className="text-xs">
                                        {stock.priority}
                                      </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{stock.reason}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {reasoningMatch && reasoningMatch[1] && (
                            <div className="border-t pt-3">
                              <p className="text-sm text-muted-foreground italic">{reasoningMatch[1]}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  }

                  // If we can't extract anything meaningful, show a clean error message
                  return (
                    <Card className="overflow-hidden">
                      <CardHeader className="bg-muted/30">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Zap className="w-4 h-4" />
                          Opportunity Analysis
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                          <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                            ⚠️ Unable to display opportunity analysis details
                          </p>
                          <p className="text-xs text-muted-foreground">
                            The opportunity agent response could not be properly formatted. The analysis may still have been completed successfully.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
              }

              return (
                <Card className="overflow-hidden">
                  <CardHeader className="bg-muted/30">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Opportunity Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Recommendation</p>
                        <p className={`text-lg font-semibold ${parsedInsights.recommendAnalysis ? 'text-green-500' : 'text-gray-500'}`}>
                          {parsedInsights.recommendAnalysis ? 'Analysis Recommended' : 'No Action Needed'}
                        </p>
                      </div>
                      {parsedInsights.marketConditions && (
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">Market Conditions</p>
                          <p className="text-lg font-semibold capitalize">
                            {parsedInsights.marketConditions.trend} / {parsedInsights.marketConditions.volatility}
                          </p>
                        </div>
                      )}
                    </div>

                    {parsedInsights.selectedStocks && parsedInsights.selectedStocks.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-sm font-medium mb-2">
                          Selected {parsedInsights.selectedStocksCount} of {parsedInsights.evaluatedStocksCount} stocks for analysis
                        </p>
                        <div className="space-y-2">
                          {parsedInsights.selectedStocks.map((stock: any, idx: number) => {
                            // Handle both string arrays and object arrays
                            const ticker = typeof stock === 'string' ? stock : stock.ticker;
                            const reason = typeof stock === 'string' ? 'Selected for analysis based on market conditions' : stock.reason;
                            const priority = typeof stock === 'string' ? 'High' : stock.priority;

                            return (
                              <div key={ticker || idx} className="p-2 bg-muted/30 rounded">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-mono font-medium">{ticker}</span>
                                  {priority && (
                                    <Badge variant="outline" className="text-xs">
                                      {priority}
                                    </Badge>
                                  )}
                                </div>
                                {reason && (
                                  <MarkdownRenderer content={reason} className="text-sm text-muted-foreground" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-3">
                      <MarkdownRenderer content={parsedInsights.reasoning} className="text-sm text-muted-foreground italic" />
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return null;
          })()}

          {/* Related Stock Analyses */}
          {rebalanceData.relatedAnalyses && rebalanceData.relatedAnalyses.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">Individual Stock Analyses</h3>
              {rebalanceData.relatedAnalyses.map((analysis: any) => (
                <div
                  key={analysis.id}
                  className="border border-border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{analysis.ticker}</span>
                      {analysis.decision && (
                        <Badge variant={getDecisionVariant(analysis.decision)}>
                          <span className="flex items-center gap-1">
                            {getDecisionIcon(analysis.decision)}
                            {analysis.decision}
                          </span>
                        </Badge>
                      )}
                      {analysis.confidence && (
                        <span className={`text-sm font-medium ${getConfidenceColor(analysis.confidence)}`}>
                          {analysis.confidence}% confidence
                        </span>
                      )}
                      {/* Show completed badge if risk manager is done in rebalance context */}
                      {(analysis.analysis_status === 1 ||
                        (analysis.analysis_status === 0 && analysis.agent_insights?.riskManager)) && (
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Completed
                          </Badge>
                        )}
                      {analysis.analysis_status === 0 && !analysis.agent_insights?.riskManager && (
                        <Badge variant="outline" className="text-xs">
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          Analyzing
                        </Badge>
                      )}
                      {analysis.analysis_status === -1 && (
                        <Badge variant="destructive" className="text-xs">
                          <XCircle className="w-3 h-3 mr-1" />
                          Failed
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="border border-border"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAnalysis({
                          ticker: analysis.ticker,
                          date: analysis.created_at
                        });
                      }}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      View Details
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Analysis date: {new Date(analysis.created_at).toLocaleDateString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(analysis.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Show agent insights preview if available */}
                  {analysis.agent_insights && (
                    <div className="text-xs text-muted-foreground">
                      {Object.keys(analysis.agent_insights).filter(k => analysis.agent_insights[k]).length} agents completed
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Portfolio Manager Insights */}
          {(() => {
            const portfolioStep = rebalanceData.workflowSteps?.find((s: any) => s.id === 'rebalance');
            // Check all possible locations where Portfolio Manager insights might be stored
            // Priority: Check new fields first, then legacy fields
            const portfolioInsights =
              rebalanceData.rebalance_plan?.portfolioManagerAnalysis ||
              rebalanceData.rebalance_plan?.portfolioManagerInsights ||
              rebalanceData.rebalance_plan?.rebalance_agent_insight ||
              rebalanceData.rebalance_plan?.agentInsights?.portfolioManager ||
              rebalanceData.rebalance_plan?.agentInsights?.rebalanceAgent ||
              rebalanceData.agentInsights?.portfolioManager ||
              rebalanceData.agentInsights?.rebalanceAgent;


            // Show insights if they exist, even if status isn't marked complete yet
            if (portfolioInsights) {
              return (
                <Card className="overflow-hidden">
                  <CardHeader className="bg-muted/30">
                    <CardTitle className="text-base flex items-center gap-2">
                      <PieChart className="w-4 h-4" />
                      Portfolio Manager Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <MarkdownRenderer content={portfolioInsights} />
                  </CardContent>
                </Card>
              );
            }
            return null;
          })()}
        </div>
      </ScrollArea>
    </TabsContent>
  );
}