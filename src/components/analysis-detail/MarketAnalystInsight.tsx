import React from "react";
import { 
  Activity,
  BarChart3,
  FileText,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import MarkdownRenderer from "../MarkdownRenderer";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface MarketAnalystInsightProps {
  insight: any;
  insightContent: string;
  additionalData: any;
  id?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function MarketAnalystInsight({ 
  insight, 
  insightContent,
  additionalData,
  id,
  isCollapsed = false,
  onToggleCollapse
}: MarketAnalystInsightProps) {
  // Get historical data and indicators from the insight
  const marketHistorical = insight?.market_historical || [];
  const technicalIndicators = insight?.technical_indicators || {};
  const analysisRange = insight?.data?.analysisRange || additionalData?.analysisRange;
  const dataPoints = insight?.data?.dataPoints || additionalData?.dataPoints;
  
  // Format data for candlestick chart
  const chartData = marketHistorical.map((price: any, index: number) => ({
    date: price.date,
    dateShort: new Date(price.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    open: price.open,
    high: price.high,
    low: price.low,
    close: price.close,
    volume: price.volume,
    // Add indicators at same index
    sma_20: technicalIndicators.sma_20?.[index],
    sma_50: technicalIndicators.sma_50?.[index],
    sma_200: technicalIndicators.sma_200?.[index],
    ema_12: technicalIndicators.ema_12?.[index],
    ema_26: technicalIndicators.ema_26?.[index],
    rsi: technicalIndicators.rsi?.[index],
    macd: technicalIndicators.macd?.[index],
    macd_signal: technicalIndicators.macd_signal?.[index],
    bollinger_upper: technicalIndicators.bollinger_upper?.[index],
    bollinger_lower: technicalIndicators.bollinger_lower?.[index]
  })).filter((d: any) => d.close); // Filter out any invalid data points
  
  return (
    <Collapsible open={!isCollapsed}>
      <Card id={id} className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
            <CardTitle className="text-base flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Market Analyst
                {analysisRange && (
                  <Badge variant="outline" className="ml-2 text-xs">
                    {analysisRange} • {dataPoints} points
                  </Badge>
                )}
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
          <CardContent className="pt-4 space-y-6">
        {/* Display market data summary if available */}
        {additionalData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/50 rounded-lg text-sm">
            {additionalData.currentPrice && (
              <div>
                <span className="text-muted-foreground">Price:</span>
                <span className="ml-2 font-medium">${additionalData.currentPrice?.toFixed(2)}</span>
              </div>
            )}
            {additionalData.dayChangePercent !== undefined && additionalData.dayChangePercent !== null && (
              <div>
                <span className="text-muted-foreground">Change:</span>
                <span className={`ml-2 font-medium ${
                  additionalData.dayChangePercent > 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {additionalData.dayChangePercent > 0 ? '+' : ''}{additionalData.dayChangePercent.toFixed(2)}%
                </span>
              </div>
            )}
            {additionalData.volume && (
              <div>
                <span className="text-muted-foreground">Volume:</span>
                <span className="ml-2 font-medium">{(additionalData.volume / 1000000).toFixed(2)}M</span>
              </div>
            )}
            {dataPoints && (
              <div>
                <span className="text-muted-foreground">Data Range:</span>
                <span className="ml-2 font-medium">{analysisRange || 'Custom'}</span>
              </div>
            )}
          </div>
        )}
        
        {/* Historical Price Chart */}
        {chartData.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Historical Price & Moving Averages
            </h4>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="dateShort" 
                    fontSize={10}
                    tick={{ fontSize: 10 }}
                    interval={Math.floor(chartData.length / 6)}
                  />
                  <YAxis 
                    domain={(() => {
                      const values = chartData.map((d: any) => d.close).filter((v: any) => v != null);
                      if (values.length === 0) return ['dataMin', 'dataMax'];
                      const min = Math.min(...values);
                      const max = Math.max(...values);
                      const margin = (max - min) * 0.10;
                      return [min - margin, max + margin];
                    })()}
                    fontSize={10}
                    tick={{ fontSize: 10 }}
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#f9fafb',
                      fontSize: '12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                    }}
                    labelStyle={{ color: '#d1d5db', fontWeight: 'bold' }}
                    formatter={(value: any, name: string) => [
                      typeof value === 'number' ? `$${value.toFixed(2)}` : value,
                      name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
                    ]}
                    labelFormatter={(label: string) => `Date: ${label}`}
                  />
                  {/* Price Line */}
                  <Line 
                    type="monotone" 
                    dataKey="close" 
                    stroke="#2563eb" 
                    strokeWidth={2} 
                    dot={false}
                    name="Close Price"
                  />
                  {/* Moving Averages */}
                  {technicalIndicators.sma_20 && (
                    <Line 
                      type="monotone" 
                      dataKey="sma_20" 
                      stroke="#f59e0b" 
                      strokeWidth={1} 
                      dot={false}
                      name="SMA 20"
                      strokeDasharray="5 5"
                    />
                  )}
                  {technicalIndicators.sma_50 && (
                    <Line 
                      type="monotone" 
                      dataKey="sma_50" 
                      stroke="#10b981" 
                      strokeWidth={1} 
                      dot={false}
                      name="SMA 50"
                      strokeDasharray="10 5"
                    />
                  )}
                  {technicalIndicators.sma_200 && (
                    <Line 
                      type="monotone" 
                      dataKey="sma_200" 
                      stroke="#ef4444" 
                      strokeWidth={1} 
                      dot={false}
                      name="SMA 200"
                      strokeDasharray="15 5"
                    />
                  )}
                  {/* Bollinger Bands */}
                  {technicalIndicators.bollinger_upper && (
                    <>
                      <Line 
                        type="monotone" 
                        dataKey="bollinger_upper" 
                        stroke="#8b5cf6" 
                        strokeWidth={1} 
                        dot={false}
                        name="BB Upper"
                        opacity={0.6}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="bollinger_lower" 
                        stroke="#8b5cf6" 
                        strokeWidth={1} 
                        dot={false}
                        name="BB Lower"
                        opacity={0.6}
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        
        {/* Technical Indicators */}
        {Object.keys(technicalIndicators).length > 0 && (
          <div className="space-y-4">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Technical Indicators
            </h4>
            
            {/* RSI Chart */}
            {technicalIndicators.rsi && (
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground">RSI (Relative Strength Index)</h5>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis 
                        dataKey="dateShort" 
                        fontSize={8}
                        interval={Math.floor(chartData.length / 6)}
                      />
                      <YAxis 
                        domain={(() => {
                          const rsiValues = chartData.map((d: any) => d.rsi).filter((v: any) => v != null);
                          if (rsiValues.length === 0) return [0, 100];
                          const min = Math.min(...rsiValues);
                          const max = Math.max(...rsiValues);
                          const margin = (max - min) * 0.10;
                          // Keep within RSI bounds but add margins
                          return [Math.max(0, min - margin), Math.min(100, max + margin)];
                        })()} 
                        fontSize={8}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#f9fafb',
                          fontSize: '12px',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                        }}
                        labelStyle={{ color: '#d1d5db', fontWeight: 'bold' }}
                        formatter={(value: any) => [`${value?.toFixed(2)}`, 'RSI']}
                        labelFormatter={(label: string) => `Date: ${label}`}
                      />
                      <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" opacity={0.5} />
                      <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" opacity={0.5} />
                      <Line 
                        type="monotone" 
                        dataKey="rsi" 
                        stroke="#3b82f6" 
                        strokeWidth={2} 
                        dot={false}
                        name="RSI"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            
            {/* MACD Chart */}
            {technicalIndicators.macd && (
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-muted-foreground">MACD</h5>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis 
                        dataKey="dateShort" 
                        fontSize={8}
                        interval={Math.floor(chartData.length / 6)}
                      />
                      <YAxis 
                        domain={(() => {
                          const macdValues = chartData.map((d: any) => [d.macd, d.macd_signal]).flat().filter((v: any) => v != null);
                          if (macdValues.length === 0) return ['dataMin', 'dataMax'];
                          const min = Math.min(...macdValues);
                          const max = Math.max(...macdValues);
                          const margin = (max - min) * 0.10;
                          return [min - margin, max + margin];
                        })()}
                        fontSize={8} 
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#f9fafb',
                          fontSize: '12px',
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                        }}
                        labelStyle={{ color: '#d1d5db', fontWeight: 'bold' }}
                        formatter={(value: any, name: string) => [
                          value?.toFixed(4), 
                          name === 'macd' ? 'MACD' : 'Signal'
                        ]}
                        labelFormatter={(label: string) => `Date: ${label}`}
                      />
                      <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="3 3" opacity={0.5} />
                      <Line 
                        type="monotone" 
                        dataKey="macd" 
                        stroke="#3b82f6" 
                        strokeWidth={1} 
                        dot={false}
                        name="MACD"
                      />
                      {technicalIndicators.macd_signal && (
                        <Line 
                          type="monotone" 
                          dataKey="macd_signal" 
                          stroke="#ef4444" 
                          strokeWidth={1} 
                          dot={false}
                          name="Signal"
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            
            {/* Indicators Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 bg-muted/30 rounded-lg text-xs">
              {technicalIndicators.sma_20 && (
                <div>
                  <span className="text-muted-foreground">SMA 20:</span>
                  <span className="ml-1 font-medium">
                    ${technicalIndicators.sma_20[technicalIndicators.sma_20.length - 1]?.toFixed(2) || 'N/A'}
                  </span>
                </div>
              )}
              {technicalIndicators.rsi && (
                <div>
                  <span className="text-muted-foreground">RSI:</span>
                  <span className={`ml-1 font-medium ${
                    technicalIndicators.rsi[technicalIndicators.rsi.length - 1] > 70 ? 'text-red-600' :
                    technicalIndicators.rsi[technicalIndicators.rsi.length - 1] < 30 ? 'text-green-600' :
                    'text-blue-600'
                  }`}>
                    {technicalIndicators.rsi[technicalIndicators.rsi.length - 1]?.toFixed(1) || 'N/A'}
                  </span>
                </div>
              )}
              {technicalIndicators.macd && (
                <div>
                  <span className="text-muted-foreground">MACD:</span>
                  <span className="ml-1 font-medium">
                    {technicalIndicators.macd[technicalIndicators.macd.length - 1]?.toFixed(4) || 'N/A'}
                  </span>
                </div>
              )}
              {insight?.metadata && (
                <div>
                  <span className="text-muted-foreground">Indicators:</span>
                  <span className="ml-1 font-medium">
                    {insight.metadata.indicatorsCalculated?.length || 0}
                  </span>
                </div>
              )}
            </div>
            
            {/* Timeframe Note */}
            {insight?.metadata?.timeframeNote && (
              <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-700 dark:text-blue-300">
                <strong>Note:</strong> {insight.metadata.timeframeNote}
              </div>
            )}
          </div>
        )}
        
        {/* Analysis Text */}
        {insightContent && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Analysis
            </h4>
            <MarkdownRenderer content={insightContent} />
          </div>
        )}
      </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}