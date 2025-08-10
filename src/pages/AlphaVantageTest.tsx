import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, TrendingUp, Newspaper, BarChart3, AlertCircle } from 'lucide-react';
import { AlphaVantageAPI } from '@/lib/alphaVantage';
import { useAuth } from '@/lib/auth-supabase';

export default function AlphaVantageTest() {
  const { apiSettings, isAuthenticated, isLoading: authLoading, loadUserData, user, forceReload } = useAuth();
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newsData, setNewsData] = useState<any>(null);
  const [fundamentalsData, setFundamentalsData] = useState<any>(null);
  const [earningsData, setEarningsData] = useState<any>(null);
  const [incomeData, setIncomeData] = useState<any>(null);
  const [balanceData, setBalanceData] = useState<any>(null);

  // Force reload if authenticated but no user data
  useEffect(() => {
    console.log('AlphaVantageTest - Auth state:', {
      isAuthenticated,
      authLoading,
      user: user?.id,
      hasApiSettings: !!apiSettings,
      alphaVantageKey: apiSettings?.alpha_vantage_api_key ? 'Present' : 'Missing'
    });
    
    // If authenticated but no user data or apiSettings, force reload
    if (isAuthenticated && (!user || !apiSettings)) {
      console.log('Authenticated but missing user data or apiSettings, forcing reload...');
      forceReload();
    }
  }, [isAuthenticated, user?.id, apiSettings?.id]);

  const hasApiKey = !!apiSettings?.alpha_vantage_api_key;
  const alphaVantageAPI = hasApiKey ? new AlphaVantageAPI(apiSettings.alpha_vantage_api_key) : null;

  const fetchNews = async () => {
    if (!hasApiKey || !alphaVantageAPI) {
      setError('Please configure your Alpha Vantage API key in Settings');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await alphaVantageAPI.getNewsAndSentiment(ticker);
      setNewsData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch news data');
    } finally {
      setLoading(false);
    }
  };

  const fetchFundamentals = async () => {
    if (!hasApiKey || !alphaVantageAPI) {
      setError('Please configure your Alpha Vantage API key in Settings');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await alphaVantageAPI.getCompanyOverview(ticker);
      setFundamentalsData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch fundamentals data');
    } finally {
      setLoading(false);
    }
  };

  const fetchEarnings = async () => {
    if (!hasApiKey || !alphaVantageAPI) {
      setError('Please configure your Alpha Vantage API key in Settings');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await alphaVantageAPI.getEarnings(ticker);
      setEarningsData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch earnings data');
    } finally {
      setLoading(false);
    }
  };

  const fetchIncomeStatement = async () => {
    if (!hasApiKey || !alphaVantageAPI) {
      setError('Please configure your Alpha Vantage API key in Settings');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await alphaVantageAPI.getIncomeStatement(ticker);
      setIncomeData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch income statement');
    } finally {
      setLoading(false);
    }
  };

  const fetchBalanceSheet = async () => {
    if (!hasApiKey || !alphaVantageAPI) {
      setError('Please configure your Alpha Vantage API key in Settings');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await alphaVantageAPI.getBalanceSheet(ticker);
      setBalanceData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch balance sheet');
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'bullish': return 'text-green-600 bg-green-50';
      case 'somewhat-bullish': return 'text-green-500 bg-green-50';
      case 'neutral': return 'text-gray-600 bg-gray-50';
      case 'somewhat-bearish': return 'text-orange-500 bg-orange-50';
      case 'bearish': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const formatNumber = (num: number | string) => {
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return 'N/A';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(2);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Alpha Vantage API Test</h1>
          <p className="text-muted-foreground mt-2">Test Alpha Vantage API endpoints for news, sentiment, and fundamental data</p>
        </div>

        {authLoading ? (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Loading authentication settings...
            </AlertDescription>
          </Alert>
        ) : !isAuthenticated ? (
          <Alert className="border-yellow-500 bg-yellow-50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please log in to use the Alpha Vantage test page.
            </AlertDescription>
          </Alert>
        ) : !hasApiKey ? (
          <Alert className="border-yellow-500 bg-yellow-50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                Please configure your Alpha Vantage API key in the Settings page to use this test page.
                Get a free API key at <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" className="underline">Alpha Vantage</a>.
              </span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => forceReload()}
                className="ml-4"
              >
                Refresh Auth
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Test Configuration</CardTitle>
            <CardDescription>Enter a stock ticker to test Alpha Vantage API endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="ticker">Stock Ticker</Label>
                <Input
                  id="ticker"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g., AAPL, MSFT, GOOGL"
                  className="mt-1"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={fetchNews} disabled={loading || !hasApiKey}>
                  <Newspaper className="h-4 w-4 mr-2" />
                  News
                </Button>
                <Button onClick={fetchFundamentals} disabled={loading || !hasApiKey}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Overview
                </Button>
                <Button onClick={fetchEarnings} disabled={loading || !hasApiKey}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Earnings
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading data...</span>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="news" className="space-y-4">
          <TabsList>
            <TabsTrigger value="news">News & Sentiment</TabsTrigger>
            <TabsTrigger value="fundamentals">Company Overview</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="financials">Financial Statements</TabsTrigger>
          </TabsList>

          <TabsContent value="news" className="space-y-4">
            {newsData && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Overall Sentiment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Sentiment Score</p>
                        <p className="text-2xl font-bold">{newsData.sentiment_score_definition || 'N/A'}</p>
                        <Badge className={getSentimentColor(newsData.sentiment_score_definition)}>
                          {newsData.sentiment_score_definition}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Relevance Score</p>
                        <p className="text-2xl font-bold">{newsData.relevance_score_definition || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Articles Analyzed</p>
                        <p className="text-2xl font-bold">{newsData.items || '0'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Ticker Mentions</p>
                        <p className="text-2xl font-bold">
                          {newsData.feed?.filter((item: any) => 
                            item.ticker_sentiment?.find((t: any) => t.ticker === ticker)
                          ).length || 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent News</CardTitle>
                    <CardDescription>Latest news articles mentioning {ticker}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {newsData.feed?.slice(0, 10).map((article: any, index: number) => {
                        const tickerSentiment = article.ticker_sentiment?.find((t: any) => t.ticker === ticker);
                        return (
                          <div key={index} className="border-b pb-4 last:border-0">
                            <div className="flex justify-between items-start gap-4">
                              <div className="flex-1">
                                <h4 className="font-medium">{article.title}</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {article.summary?.substring(0, 200)}...
                                </p>
                                <div className="flex gap-2 mt-2">
                                  <Badge variant="outline" className="text-xs">
                                    {article.source}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {new Date(article.time_published).toLocaleDateString()}
                                  </Badge>
                                  {tickerSentiment && (
                                    <Badge className={`text-xs ${getSentimentColor(tickerSentiment.ticker_sentiment_label)}`}>
                                      {tickerSentiment.ticker_sentiment_label} ({tickerSentiment.ticker_sentiment_score})
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <a 
                                href={article.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline text-sm"
                              >
                                Read →
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="fundamentals" className="space-y-4">
            {fundamentalsData && (
              <Card>
                <CardHeader>
                  <CardTitle>{fundamentalsData.Name || ticker}</CardTitle>
                  <CardDescription>{fundamentalsData.Description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Market Cap</p>
                      <p className="text-xl font-semibold">${formatNumber(fundamentalsData.MarketCapitalization)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">P/E Ratio</p>
                      <p className="text-xl font-semibold">{fundamentalsData.PERatio || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">EPS</p>
                      <p className="text-xl font-semibold">${fundamentalsData.EPS || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">52 Week High</p>
                      <p className="text-xl font-semibold">${fundamentalsData['52WeekHigh']}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">52 Week Low</p>
                      <p className="text-xl font-semibold">${fundamentalsData['52WeekLow']}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Dividend Yield</p>
                      <p className="text-xl font-semibold">{fundamentalsData.DividendYield || '0'}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Beta</p>
                      <p className="text-xl font-semibold">{fundamentalsData.Beta || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Profit Margin</p>
                      <p className="text-xl font-semibold">{(parseFloat(fundamentalsData.ProfitMargin) * 100).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Revenue TTM</p>
                      <p className="text-xl font-semibold">${formatNumber(fundamentalsData.RevenueTTM)}</p>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Sector</p>
                        <p className="font-medium">{fundamentalsData.Sector}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Industry</p>
                        <p className="font-medium">{fundamentalsData.Industry}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Exchange</p>
                        <p className="font-medium">{fundamentalsData.Exchange}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Currency</p>
                        <p className="font-medium">{fundamentalsData.Currency}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-2">
              <Button onClick={fetchIncomeStatement} disabled={loading || !hasApiKey} variant="outline">
                Fetch Income Statement
              </Button>
              <Button onClick={fetchBalanceSheet} disabled={loading || !hasApiKey} variant="outline">
                Fetch Balance Sheet
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="earnings" className="space-y-4">
            {earningsData && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Quarterly Earnings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {earningsData.quarterlyEarnings?.slice(0, 8).map((earning: any, index: number) => (
                        <div key={index} className="flex justify-between items-center border-b pb-2">
                          <div>
                            <p className="font-medium">{earning.fiscalDateEnding}</p>
                            <p className="text-sm text-muted-foreground">Q{earning.fiscalDateEnding.substring(5, 7) === '03' ? '1' : 
                              earning.fiscalDateEnding.substring(5, 7) === '06' ? '2' :
                              earning.fiscalDateEnding.substring(5, 7) === '09' ? '3' : '4'} {earning.fiscalDateEnding.substring(0, 4)}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">EPS: ${earning.reportedEPS}</p>
                            <p className="text-sm text-muted-foreground">
                              Est: ${earning.estimatedEPS} 
                              {earning.surprise && (
                                <span className={earning.surprise > 0 ? 'text-green-600' : 'text-red-600'}>
                                  {' '}({earning.surprise > 0 ? '+' : ''}{earning.surprise})
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Annual Earnings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {earningsData.annualEarnings?.slice(0, 5).map((earning: any, index: number) => (
                        <div key={index} className="flex justify-between items-center border-b pb-2">
                          <p className="font-medium">{earning.fiscalDateEnding}</p>
                          <p className="font-medium">${earning.reportedEPS}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="financials" className="space-y-4">
            {incomeData && (
              <Card>
                <CardHeader>
                  <CardTitle>Income Statement (Latest Quarter)</CardTitle>
                </CardHeader>
                <CardContent>
                  {incomeData.quarterlyReports?.[0] && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Revenue</p>
                        <p className="text-xl font-semibold">${formatNumber(incomeData.quarterlyReports[0].totalRevenue)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Gross Profit</p>
                        <p className="text-xl font-semibold">${formatNumber(incomeData.quarterlyReports[0].grossProfit)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Operating Income</p>
                        <p className="text-xl font-semibold">${formatNumber(incomeData.quarterlyReports[0].operatingIncome)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Net Income</p>
                        <p className="text-xl font-semibold">${formatNumber(incomeData.quarterlyReports[0].netIncome)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">EBITDA</p>
                        <p className="text-xl font-semibold">${formatNumber(incomeData.quarterlyReports[0].ebitda)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Period</p>
                        <p className="text-xl font-semibold">{incomeData.quarterlyReports[0].fiscalDateEnding}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {balanceData && (
              <Card>
                <CardHeader>
                  <CardTitle>Balance Sheet (Latest Quarter)</CardTitle>
                </CardHeader>
                <CardContent>
                  {balanceData.quarterlyReports?.[0] && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Assets</p>
                        <p className="text-xl font-semibold">${formatNumber(balanceData.quarterlyReports[0].totalAssets)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Liabilities</p>
                        <p className="text-xl font-semibold">${formatNumber(balanceData.quarterlyReports[0].totalLiabilities)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Equity</p>
                        <p className="text-xl font-semibold">${formatNumber(balanceData.quarterlyReports[0].totalShareholderEquity)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Cash & Equivalents</p>
                        <p className="text-xl font-semibold">${formatNumber(balanceData.quarterlyReports[0].cashAndCashEquivalentsAtCarryingValue)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Current Assets</p>
                        <p className="text-xl font-semibold">${formatNumber(balanceData.quarterlyReports[0].totalCurrentAssets)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Current Liabilities</p>
                        <p className="text-xl font-semibold">${formatNumber(balanceData.quarterlyReports[0].totalCurrentLiabilities)}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}