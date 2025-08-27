import React from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Brain,
  Briefcase,
  FileText,
  MessageSquare,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
  PieChart,
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
import MarketAnalystInsight from "./MarketAnalystInsight";
import FundamentalsAnalystInsight from "./FundamentalsAnalystInsight";
import SourcesSection, { CompactSourceBadges } from "./SourcesSection";

interface AnalysisInsightsTabProps {
  analysisData: any;
  getMessageIcon: (type: string) => any;
  getAgentIcon: (agent: string) => React.ReactNode;
  formatAgentName: (agent: string) => string;
  collapsedCards: Set<string>;
  setCollapsedCards: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export default function AnalysisInsightsTab({
  analysisData,
  getMessageIcon,
  getAgentIcon,
  formatAgentName,
  collapsedCards,
  setCollapsedCards
}: AnalysisInsightsTabProps) {

  // Toggle collapse state for a card
  const toggleCollapse = (agentKey: string) => {
    setCollapsedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentKey)) {
        newSet.delete(agentKey);
      } else {
        newSet.add(agentKey);
      }
      return newSet;
    });
  };
  console.log('Insights tab - analysisData.agent_insights:', analysisData.agent_insights);
  console.log('Market Analyst insight:', analysisData.agent_insights?.marketAnalyst);
  console.log('Fundamentals Analyst insight:', analysisData.agent_insights?.fundamentalsAnalyst);

  if (!analysisData.agent_insights || Object.keys(analysisData.agent_insights).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Brain className="w-12 h-12 mb-4 opacity-20" />
        <p>No insights available yet</p>
      </div>
    );
  }

  // Define the display order for insights
  const orderMap: { [key: string]: number } = {
    // 1. Analysts (order: 1-5)
    'macroAnalyst': 1,
    'marketAnalyst': 2,
    'newsAnalyst': 3,
    'socialMediaAnalyst': 4,
    'fundamentalsAnalyst': 5,

    // 2. Research (order: 5-7)
    'bullResearcher': 6,
    'bearResearcher': 7,
    'researchDebate': 8,
    'researchManager': 9,

    // 3. Trader (order: 9)
    'trader': 10,

    // 4. Risk (order: 10-14)
    'riskyAnalyst': 11,
    'safeAnalyst': 12,
    'neutralAnalyst': 13,
    'riskDebate': 14,
    'riskManager': 15,

    // 5. Portfolio (order: 15)
    'portfolioManager': 16
  };

  // Sort entries based on the defined order
  // Get entries from agent_insights
  let entries = Object.entries(analysisData.agent_insights);

  // Filter out Portfolio Manager for rebalance analyses
  if (analysisData.rebalance_request_id) {
    entries = entries.filter(([agent]) => agent !== 'portfolioManager');
  }

  // Filter out standalone Bull and Bear Researcher entries if Research Debate exists
  const hasResearchDebate = analysisData.agent_insights?.researchDebate;
  if (hasResearchDebate) {
    entries = entries.filter(([agent]) => agent !== 'bullResearcher' && agent !== 'bearResearcher');
  }

  // Add missing agents that have messages but no insights
  const missingAgents = ['fundamentalsAnalyst', 'safeAnalyst'];
  missingAgents.forEach(agentKey => {
    if (!analysisData.agent_insights[agentKey]) {
      // Check if this agent has messages
      const agentDisplayName = agentKey === 'fundamentalsAnalyst' ? 'Fundamentals Analyst' : 'Safe Analyst';
      const hasMessage = analysisData.messages?.some((msg: any) => msg.agent === agentDisplayName);
      if (hasMessage) {
        // Add a placeholder entry so it gets processed
        entries.push([agentKey, null]);
      }
    }
  });

  const sortedEntries = entries.sort(([agentA], [agentB]) => {
    const orderA = orderMap[agentA] || 999;
    const orderB = orderMap[agentB] || 999;
    return orderA - orderB;
  });

  console.log('Sorted insight entries (including missing):', sortedEntries.map(([agent]) => agent));

  return (
    <>
      {sortedEntries.map(([agent, insight]) => {
        console.log(`Processing insight for ${agent}:`, typeof insight, insight);

        // Handle debate rounds specially
        if ((agent === 'researchDebate' || agent === 'riskDebate') && Array.isArray(insight)) {
          const isResearchDebate = agent === 'researchDebate';
          
          // Debug: Log the debate rounds to check for duplicates
          console.log(`${agent} rounds:`, insight);
          insight.forEach((round: any, idx: number) => {
            console.log(`Round ${idx + 1}:`, {
              round: round.round,
              bullLength: round.bull?.length,
              bearLength: round.bear?.length,
              bullPreview: round.bull?.substring(0, 100),
              bearPreview: round.bear?.substring(0, 100)
            });
          });
          
          const isCollapsed = collapsedCards.has(agent);
          
          return (
            <Collapsible key={agent} open={!isCollapsed}>
              <Card id={`insight-${agent}`} className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <CardHeader className="bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {isResearchDebate ? 'Research' : 'Risk'} Debate
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(agent);
                        }}
                      >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0">
                    {/* Show debate rounds only */}
                    {insight.map((round: any, index: number) => (
                      <div key={index} className={index > 0 ? "border-t" : ""} id={index === 0 ? "insight-bullResearcher" : undefined}>
                        <div className="p-4 bg-muted/10">
                          <h4 className="font-medium text-sm">Round {round.round}</h4>
                        </div>
                        <div className="p-4 space-y-3">
                          {isResearchDebate ? (
                            <>
                              <div className="rounded-lg border bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                                  <span className="text-sm font-medium">
                                    Bull Researcher
                                  </span>
                                </div>
                                <MarkdownRenderer content={round.bull} className="text-sm" />
                              </div>
                              <div className="rounded-lg border bg-red-500/10 dark:bg-red-500/5 border-red-500/20 dark:border-red-500/10 p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                                  <span className="text-sm font-medium">
                                    Bear Researcher
                                  </span>
                                </div>
                                <MarkdownRenderer content={round.bear} className="text-sm" />
                              </div>
                            </>
                          ) : (
                        <>
                          <div className="rounded-lg border bg-red-500/10 dark:bg-red-500/5 border-red-500/20 dark:border-red-500/10 p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                              <span className="text-sm font-medium">
                                Risky Analyst
                              </span>
                            </div>
                            <MarkdownRenderer content={round.risky} className="text-sm" />
                          </div>
                          <div className="rounded-lg border bg-blue-500/10 dark:bg-blue-500/5 border-blue-500/20 dark:border-blue-500/10 p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <span className="text-sm font-medium">
                                Safe Analyst
                              </span>
                            </div>
                            <MarkdownRenderer content={round.safe} className="text-sm" />
                          </div>
                          <div className="rounded-lg border bg-muted/50 p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Activity className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm font-medium">
                                Neutral Analyst
                              </span>
                            </div>
                            <MarkdownRenderer content={round.neutral} className="text-sm" />
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        }

        // Handle all other insights
        // First extract the content from the insight regardless of type
        let insightContent = '';
        let additionalData = null;

        if (typeof insight === 'string') {
          insightContent = insight;
        } else if (typeof insight === 'object' && insight !== null && !Array.isArray(insight)) {
          // Extract the analysis text from various possible fields
          insightContent = insight.analysis || insight.assessment || insight.content || insight.summary || '';

          // For market and fundamental analysts, also capture additional data
          if (agent === 'marketAnalyst' || agent === 'fundamentalsAnalyst') {
            additionalData = insight.data || null;

            // If still no content, try to extract from nested structures
            if (!insightContent && insight.data) {
              insightContent = insight.data.analysis || insight.data.assessment || '';
            }

            // FALLBACK: If still no content, try to find it in messages
            if (!insightContent || insightContent.trim() === '') {
              const agentDisplayName = formatAgentName(agent);
              const agentMessage = analysisData.messages?.find((msg: any) =>
                msg.agent === agentDisplayName ||
                msg.agent === agent.replace(/([A-Z])/g, ' $1').trim()
              );
              if (agentMessage?.message) {
                insightContent = agentMessage.message;
                console.log(`Using message fallback for ${agent}:`, insightContent.substring(0, 100));
              }
            }

            // Log for debugging
            console.log(`${agent} insight structure:`, {
              hasAnalysis: !!insight.analysis,
              hasData: !!insight.data,
              keys: Object.keys(insight),
              contentLength: insightContent?.length || 0,
              usingMessageFallback: !insight.analysis && insightContent.length > 0
            });
          }
        }

        // For missing fundamentalsAnalyst, try to get from messages
        if (agent === 'fundamentalsAnalyst' && !insight) {
          const fundamentalsMessage = analysisData.messages?.find((msg: any) =>
            msg.agent === 'Fundamentals Analyst'
          );
          if (fundamentalsMessage?.message) {
            insightContent = fundamentalsMessage.message;
            console.log('Using message for missing Fundamentals Analyst insight');
          }
        }

        // Skip if no content
        if (!insightContent) {
          console.warn(`Skipping empty insight for ${agent}. Full insight:`, insight);
          return null;
        }

        // Special styling for bull and bear researchers
        if (agent === 'bullResearcher') {
          const isCollapsed = collapsedCards.has(agent);
          return (
            <Collapsible key={agent} open={!isCollapsed}>
              <Card id={`insight-${agent}`} className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <CardHeader className="bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Bull Researcher
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(agent);
                        }}
                      >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-4">
                    <div className="rounded-lg border bg-green-500/10 dark:bg-green-500/5 border-green-500/20 dark:border-green-500/10 p-4">
                      <MarkdownRenderer content={insightContent} className="text-sm" />
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        }

        if (agent === 'bearResearcher') {
          const isCollapsed = collapsedCards.has(agent);
          return (
            <Collapsible key={agent} open={!isCollapsed}>
              <Card id={`insight-${agent}`} className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <CardHeader className="bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingDown className="w-4 h-4" />
                        Bear Researcher
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(agent);
                        }}
                      >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-4">
                    <div className="rounded-lg border bg-red-500/10 dark:bg-red-500/5 border-red-500/20 dark:border-red-500/10 p-4">
                      <MarkdownRenderer content={insightContent} className="text-sm" />
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        }

        // Special rendering for Market Analyst with data, historical chart, and indicators
        if (agent === 'marketAnalyst') {
          const isCollapsed = collapsedCards.has(agent);
          return <MarketAnalystInsight 
            key={agent} 
            id={`insight-${agent}`} 
            insight={insight} 
            insightContent={insightContent} 
            additionalData={additionalData}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapse(agent)}
          />;
        }

        // Special rendering for Fundamentals Analyst with data
        if (agent === 'fundamentalsAnalyst' && additionalData) {
          const isCollapsed = collapsedCards.has(agent);
          return <FundamentalsAnalystInsight 
            key={agent} 
            id={`insight-${agent}`} 
            insightContent={insightContent} 
            additionalData={additionalData}
            isCollapsed={isCollapsed}
            onToggleCollapse={() => toggleCollapse(agent)}
          />;
        }

        // Special rendering for Portfolio Manager - simple format like RebalanceDetailModal
        if (agent === 'portfolioManager') {
          const isCollapsed = collapsedCards.has(agent);
          return (
            <Collapsible key={agent} open={!isCollapsed}>
              <Card id={`insight-${agent}`} className="overflow-hidden">
                <CollapsibleTrigger asChild>
                  <CardHeader className="bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PieChart className="w-4 h-4" />
                        Portfolio Manager Analysis
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCollapse(agent);
                        }}
                      >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-4">
                    <MarkdownRenderer content={insightContent} />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        }

        // Check if this agent has sources (News, Social Media, Fundamentals, Macro analysts)
        const hasPerplefinaSources = ['newsAnalyst', 'socialMediaAnalyst', 'fundamentalsAnalyst', 'macroAnalyst'].includes(agent);
        const sources = hasPerplefinaSources && insight?.sources ? insight.sources : null;

        // Default rendering for all other agents
        const isCollapsed = collapsedCards.has(agent);
        return (
          <Collapsible key={agent} open={!isCollapsed}>
            <Card id={`insight-${agent}`} className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <CardHeader className="bg-muted/30 cursor-pointer hover:bg-muted/40 transition-colors">
                  <CardTitle className="text-base flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {getAgentIcon(agent)}
                      <span className="shrink-0">{formatAgentName(agent)}</span>
                      
                      {/* Show compact source badges when collapsed */}
                      {isCollapsed && sources && sources.length > 0 && (
                        <CompactSourceBadges 
                          sources={sources} 
                          agentName={formatAgentName(agent)}
                          maxVisible={3}
                          showLabels={false}
                        />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapse(agent);
                      }}
                    >
                      {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </Button>
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-4">
                  <MarkdownRenderer content={insightContent} />
                  
                  {/* Show sources using the new compact component */}
                  {sources && sources.length > 0 && (
                    <SourcesSection 
                      sources={sources} 
                      agentName={formatAgentName(agent)} 
                    />
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}
    </>
  );
}