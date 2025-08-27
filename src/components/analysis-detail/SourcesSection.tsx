import React, { useState } from "react";
import { ExternalLink, Globe, FileText, Newspaper, Hash, MessageSquare, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Source {
  pageContent?: string;
  metadata?: {
    title?: string;
    url?: string;
  };
}

interface SourcesSectionProps {
  sources: Source[];
  agentName: string;
}

interface CompactSourceBadgesProps {
  sources: Source[];
  agentName: string;
  maxVisible?: number;
  showLabels?: boolean;
}

export default function SourcesSection({ sources, agentName }: SourcesSectionProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  // Extract domain from URL
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      // Shorten long domains
      if (domain.length > 15) {
        return domain.substring(0, 12) + '...';
      }
      return domain;
    } catch {
      return 'source';
    }
  };

  // Get icon based on domain
  const getSourceIcon = (url: string) => {
    const domain = url?.toLowerCase() || '';
    if (domain.includes('reddit')) return <Hash className="h-3 w-3" />;
    if (domain.includes('twitter') || domain.includes('x.com')) return <MessageSquare className="h-3 w-3" />;
    if (domain.includes('bloomberg') || domain.includes('reuters') || domain.includes('cnbc')) return <Newspaper className="h-3 w-3" />;
    if (domain.includes('yahoo') || domain.includes('seekingalpha') || domain.includes('investing')) return <TrendingUp className="h-3 w-3" />;
    return <Globe className="h-3 w-3" />;
  };

  // Group sources by type for modal tabs
  const categorizedSources = {
    news: sources.filter(s => {
      const url = s.metadata?.url?.toLowerCase() || '';
      return url.includes('bloomberg') || url.includes('reuters') || url.includes('cnbc') || 
             url.includes('wsj') || url.includes('ft.com') || url.includes('marketwatch');
    }),
    social: sources.filter(s => {
      const url = s.metadata?.url?.toLowerCase() || '';
      return url.includes('reddit') || url.includes('twitter') || url.includes('x.com') || 
             url.includes('stocktwits');
    }),
    analysis: sources.filter(s => {
      const url = s.metadata?.url?.toLowerCase() || '';
      return url.includes('seekingalpha') || url.includes('yahoo') || url.includes('fool') || 
             url.includes('investing.com') || url.includes('morningstar');
    }),
    other: [] as Source[]
  };

  // Put uncategorized sources in "other"
  categorizedSources.other = sources.filter(s => 
    !categorizedSources.news.includes(s) && 
    !categorizedSources.social.includes(s) && 
    !categorizedSources.analysis.includes(s)
  );

  // First 5 sources to show as badges
  const visibleSources = sources.slice(0, 5);
  const hiddenCount = sources.length - 5;

  return (
    <div className="border-t pt-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Sources:</span>
        
        {/* Compact badge view for first 5 sources */}
        {visibleSources.map((source, idx) => {
          const url = source.metadata?.url;
          const title = source.metadata?.title || `Source ${idx + 1}`;
          const domain = url ? getDomain(url) : 'source';
          
          return (
            <TooltipProvider key={idx}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Badge 
                      variant="secondary" 
                      className="h-6 px-2 gap-1 hover:bg-muted cursor-pointer transition-colors"
                    >
                      {getSourceIcon(url || '')}
                      <span className="text-xs">{domain}</span>
                    </Badge>
                  </a>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{domain}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
        
        {/* Show more button if there are hidden sources */}
        {hiddenCount > 0 && (
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="secondary" 
                size="sm" 
                className="h-6 px-2 text-xs"
              >
                +{hiddenCount} more
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle>
                  {agentName} Sources ({sources.length} total)
                </DialogTitle>
                <DialogDescription>
                  All referenced sources for this analysis
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="all" className="mt-4">
                <TabsList className="w-full p-1">
                  <div className="flex w-full gap-1">
                    <TabsTrigger value="all" className="flex-1 data-[state=active]:bg-background">
                      <FileText className="h-3 w-3 mr-1.5" />
                      All ({sources.length})
                    </TabsTrigger>
                    {categorizedSources.news.length > 0 && (
                      <TabsTrigger value="news" className="flex-1 data-[state=active]:bg-background">
                        <Newspaper className="h-3 w-3 mr-1.5" />
                        News ({categorizedSources.news.length})
                      </TabsTrigger>
                    )}
                    {categorizedSources.social.length > 0 && (
                      <TabsTrigger value="social" className="flex-1 data-[state=active]:bg-background">
                        <MessageSquare className="h-3 w-3 mr-1.5" />
                        Social ({categorizedSources.social.length})
                      </TabsTrigger>
                    )}
                    {categorizedSources.analysis.length > 0 && (
                      <TabsTrigger value="analysis" className="flex-1 data-[state=active]:bg-background">
                        <TrendingUp className="h-3 w-3 mr-1.5" />
                        Analysis ({categorizedSources.analysis.length})
                      </TabsTrigger>
                    )}
                    {categorizedSources.other.length > 0 && (
                      <TabsTrigger value="other" className="flex-1 data-[state=active]:bg-background">
                        <Globe className="h-3 w-3 mr-1.5" />
                        Other ({categorizedSources.other.length})
                      </TabsTrigger>
                    )}
                  </div>
                </TabsList>
                
                <ScrollArea className="h-[50vh] mt-4">
                  <TabsContent value="all" className="space-y-3">
                    {sources.map((source, idx) => (
                      <SourceCard key={idx} source={source} index={idx} />
                    ))}
                  </TabsContent>
                  
                  <TabsContent value="news" className="space-y-3">
                    {categorizedSources.news.map((source, idx) => (
                      <SourceCard key={idx} source={source} index={sources.indexOf(source)} />
                    ))}
                  </TabsContent>
                  
                  <TabsContent value="social" className="space-y-3">
                    {categorizedSources.social.map((source, idx) => (
                      <SourceCard key={idx} source={source} index={sources.indexOf(source)} />
                    ))}
                  </TabsContent>
                  
                  <TabsContent value="analysis" className="space-y-3">
                    {categorizedSources.analysis.map((source, idx) => (
                      <SourceCard key={idx} source={source} index={sources.indexOf(source)} />
                    ))}
                  </TabsContent>
                  
                  <TabsContent value="other" className="space-y-3">
                    {categorizedSources.other.map((source, idx) => (
                      <SourceCard key={idx} source={source} index={sources.indexOf(source)} />
                    ))}
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

// Compact source badges component that can be used inline
export function CompactSourceBadges({ 
  sources, 
  agentName, 
  maxVisible = 3, 
  showLabels = false
}: CompactSourceBadgesProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  if (!sources || sources.length === 0) return null;

  // Extract domain from URL
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      if (domain.length > 15) {
        return domain.substring(0, 12) + '...';
      }
      return domain;
    } catch {
      return 'source';
    }
  };

  // Get icon based on domain
  const getSourceIcon = (url: string) => {
    const domain = url?.toLowerCase() || '';
    if (domain.includes('reddit')) return <Hash className="h-3 w-3" />;
    if (domain.includes('twitter') || domain.includes('x.com')) return <MessageSquare className="h-3 w-3" />;
    if (domain.includes('bloomberg') || domain.includes('reuters') || domain.includes('cnbc')) return <Newspaper className="h-3 w-3" />;
    if (domain.includes('yahoo') || domain.includes('seekingalpha') || domain.includes('investing')) return <TrendingUp className="h-3 w-3" />;
    return <Globe className="h-3 w-3" />;
  };

  const visibleSources = sources.slice(0, maxVisible);
  const hiddenCount = sources.length - maxVisible;

  return (
    <div className="flex items-center gap-1 ml-2">
      {showLabels && (
        <span className="text-xs text-muted-foreground mr-0.5">Sources:</span>
      )}
      
      {/* Compact badges */}
      {visibleSources.map((source, idx) => {
        const url = source.metadata?.url;
        const title = source.metadata?.title || `Source ${idx + 1}`;
        const domain = url ? getDomain(url) : 'source';
        
        return (
          <TooltipProvider key={idx}>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Badge 
                    variant="secondary" 
                    className="h-5 px-1.5 gap-1 hover:bg-muted cursor-pointer transition-colors text-xs"
                  >
                    {getSourceIcon(url || '')}
                    <span className="hidden sm:inline">{domain}</span>
                  </Badge>
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs font-medium">{title}</p>
                <p className="text-xs text-muted-foreground mt-1">{domain}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
      
      {/* Show modal button if there are hidden sources */}
      {hiddenCount > 0 && (
        <SourcesModal 
          sources={sources}
          agentName={agentName}
          triggerButton={
            <Button 
              variant="secondary" 
              size="sm" 
              className="h-5 px-1.5 text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              +{hiddenCount}
            </Button>
          }
        />
      )}
    </div>
  );
}

// Extracted modal component for reuse
function SourcesModal({ sources, agentName, triggerButton }: {
  sources: Source[];
  agentName: string;
  triggerButton: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Group sources by type for modal tabs
  const categorizedSources = {
    news: sources.filter(s => {
      const url = s.metadata?.url?.toLowerCase() || '';
      return url.includes('bloomberg') || url.includes('reuters') || url.includes('cnbc') || 
             url.includes('wsj') || url.includes('ft.com') || url.includes('marketwatch');
    }),
    social: sources.filter(s => {
      const url = s.metadata?.url?.toLowerCase() || '';
      return url.includes('reddit') || url.includes('twitter') || url.includes('x.com') || 
             url.includes('stocktwits');
    }),
    analysis: sources.filter(s => {
      const url = s.metadata?.url?.toLowerCase() || '';
      return url.includes('seekingalpha') || url.includes('yahoo') || url.includes('fool') || 
             url.includes('investing.com') || url.includes('morningstar');
    }),
    other: [] as Source[]
  };

  categorizedSources.other = sources.filter(s => 
    !categorizedSources.news.includes(s) && 
    !categorizedSources.social.includes(s) && 
    !categorizedSources.analysis.includes(s)
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {triggerButton}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            {agentName} Sources ({sources.length} total)
          </DialogTitle>
          <DialogDescription>
            All referenced sources for this analysis
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="all" className="mt-4">
          <TabsList className="w-full p-1">
            <div className="flex w-full gap-1">
              <TabsTrigger value="all" className="flex-1 data-[state=active]:bg-background">
                <FileText className="h-3 w-3 mr-1.5" />
                All ({sources.length})
              </TabsTrigger>
              {categorizedSources.news.length > 0 && (
                <TabsTrigger value="news" className="flex-1 data-[state=active]:bg-background">
                  <Newspaper className="h-3 w-3 mr-1.5" />
                  News ({categorizedSources.news.length})
                </TabsTrigger>
              )}
              {categorizedSources.social.length > 0 && (
                <TabsTrigger value="social" className="flex-1 data-[state=active]:bg-background">
                  <MessageSquare className="h-3 w-3 mr-1.5" />
                  Social ({categorizedSources.social.length})
                </TabsTrigger>
              )}
              {categorizedSources.analysis.length > 0 && (
                <TabsTrigger value="analysis" className="flex-1 data-[state=active]:bg-background">
                  <TrendingUp className="h-3 w-3 mr-1.5" />
                  Analysis ({categorizedSources.analysis.length})
                </TabsTrigger>
              )}
              {categorizedSources.other.length > 0 && (
                <TabsTrigger value="other" className="flex-1 data-[state=active]:bg-background">
                  <Globe className="h-3 w-3 mr-1.5" />
                  Other ({categorizedSources.other.length})
                </TabsTrigger>
              )}
            </div>
          </TabsList>
          
          <ScrollArea className="h-[50vh] mt-4">
            <TabsContent value="all" className="space-y-3">
              {sources.map((source, idx) => (
                <SourceCard key={idx} source={source} index={idx} />
              ))}
            </TabsContent>
            
            <TabsContent value="news" className="space-y-3">
              {categorizedSources.news.map((source, idx) => (
                <SourceCard key={idx} source={source} index={sources.indexOf(source)} />
              ))}
            </TabsContent>
            
            <TabsContent value="social" className="space-y-3">
              {categorizedSources.social.map((source, idx) => (
                <SourceCard key={idx} source={source} index={sources.indexOf(source)} />
              ))}
            </TabsContent>
            
            <TabsContent value="analysis" className="space-y-3">
              {categorizedSources.analysis.map((source, idx) => (
                <SourceCard key={idx} source={source} index={sources.indexOf(source)} />
              ))}
            </TabsContent>
            
            <TabsContent value="other" className="space-y-3">
              {categorizedSources.other.map((source, idx) => (
                <SourceCard key={idx} source={source} index={sources.indexOf(source)} />
              ))}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Individual source card component for modal view
function SourceCard({ source, index }: { source: Source; index: number }) {
  const url = source.metadata?.url;
  const title = source.metadata?.title || `Source ${index + 1}`;
  const content = source.pageContent;
  
  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return 'Unknown source';
    }
  };
  
  return (
    <div className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium line-clamp-2">
            {index + 1}. {title}
          </h4>
          {url && (
            <p className="text-xs text-muted-foreground mt-1">
              {getDomain(url)}
            </p>
          )}
          {content && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
              {content}
            </p>
          )}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        )}
      </div>
    </div>
  );
}