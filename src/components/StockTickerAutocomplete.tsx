import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { alpacaAPI } from "@/lib/alpaca";
import { cn } from "@/lib/utils";

interface StockSuggestion {
  symbol: string;
  description: string;
  type?: string;
  displaySymbol?: string;
}

interface StockTickerAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: StockSuggestion) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}

export default function StockTickerAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Enter stock symbol...",
  className,
  disabled = false,
  required = false,
  id
}: StockTickerAutocompleteProps) {
  const { apiSettings } = useAuth();
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Search for stock symbols using Alpaca API
  const searchSymbols = async (query: string) => {
    if (query.length < 1) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    
    try {
      // Use Alpaca API to search for assets via edge function
      // The edge function will handle checking if Alpaca is configured
      const assets = await alpacaAPI.getAssets(query).catch(err => {
        // If it's a configuration error, silently return empty
        if (err.message?.includes('API settings not found') || err.message?.includes('not configured')) {
          console.log("Alpaca API not configured for symbol search");
          return [];
        }
        throw err;
      });
      
      // Format Alpaca suggestions
      const suggestions: StockSuggestion[] = assets
        ?.filter((asset: any) => asset.tradable && asset.status === 'active')
        ?.map((asset: any) => ({
          symbol: asset.symbol,
          description: asset.name || '',
          type: asset.class === 'us_equity' ? 'Common Stock' : asset.class,
          displaySymbol: asset.symbol
        })) || [];
      
      setSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } catch (error) {
      console.error('Error searching symbols:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.length >= 1) {
      searchTimeoutRef.current = setTimeout(() => {
        searchSymbols(value);
      }, 300);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [value]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (suggestion: StockSuggestion) => {
    onChange(suggestion.symbol);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    if (onSelect) {
      onSelect(suggestion);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        if (showSuggestions && suggestions.length > 0) {
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < suggestions.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case 'ArrowUp':
        if (showSuggestions && suggestions.length > 0) {
          e.preventDefault();
          setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        }
        break;
      case 'Enter':
        if (showSuggestions && suggestions.length > 0 && selectedIndex >= 0) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[selectedIndex]);
        } else if (value.trim() && onSelect) {
          // Allow Enter to trigger onSelect even without suggestions
          onSelect({ symbol: value.trim(), description: '' });
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder}
          className="w-full"
          disabled={disabled}
          required={required}
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      
      {showSuggestions && suggestions.length > 0 && (
        <Card className="absolute z-50 w-full mt-1 p-0 overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.symbol}
                type="button"
                className={cn(
                  "w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors",
                  "flex flex-col border-b last:border-b-0",
                  selectedIndex === index && "bg-muted"
                )}
                onClick={() => handleSelectSuggestion(suggestion)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{suggestion.symbol}</span>
                  {suggestion.type && (
                    <span className="text-xs text-muted-foreground">{suggestion.type}</span>
                  )}
                </div>
                <span className="text-sm text-muted-foreground truncate">
                  {suggestion.description}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}