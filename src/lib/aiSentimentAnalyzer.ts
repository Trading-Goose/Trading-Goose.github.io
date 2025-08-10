/**
 * AI-based sentiment analysis for news and social media
 * Uses OpenRouter or other AI providers to analyze sentiment
 */

import { aiProvider } from './aiProvider';

export interface SentimentResult {
  buzz: {
    buzz: number; // Number of articles/mentions
    articlesInLastWeek?: number;
  };
  sentiment: {
    bullishPercent: number;
    bearishPercent: number;
  };
  symbol: string;
  companyNewsScore: number;
  analysis?: string; // AI's explanation
}

export interface NewsItem {
  headline: string;
  summary?: string;
  datetime: string | number;
  source?: string;
  url?: string;
}

/**
 * Analyze sentiment from news articles using AI
 */
export async function analyzeSentimentWithAI(
  ticker: string,
  news: NewsItem[]
): Promise<SentimentResult> {
  if (!news || news.length === 0) {
    return {
      buzz: { buzz: 0, articlesInLastWeek: 0 },
      sentiment: { bullishPercent: 0.5, bearishPercent: 0.5 },
      symbol: ticker,
      companyNewsScore: 0,
      analysis: 'No news articles found for sentiment analysis'
    };
  }

  // Prepare news summary for AI analysis
  const newsText = news.slice(0, 10).map(article => {
    const date = new Date(article.datetime).toLocaleDateString();
    return `[${date}] ${article.headline}${article.summary ? '\n' + article.summary.substring(0, 200) : ''}`;
  }).join('\n\n');

  const prompt = `You are a financial sentiment analyst. Analyze the following news articles about ${ticker} and determine the overall market sentiment.

News Articles:
${newsText}

Based on these articles, provide a sentiment analysis with the following:
1. Overall sentiment: bullish, bearish, or neutral
2. Confidence level (0-100%)
3. Key factors influencing the sentiment
4. Estimated bullish percentage (0-100%)
5. Estimated bearish percentage (0-100%)

Respond in JSON format:
{
  "overallSentiment": "bullish/bearish/neutral",
  "confidence": 85,
  "bullishPercent": 65,
  "bearishPercent": 35,
  "keyFactors": ["factor1", "factor2"],
  "analysis": "Brief explanation of the sentiment"
}`;

  try {
    const response = await aiProvider.chat({
      messages: [
        {
          role: 'system',
          content: 'You are a financial sentiment analyst. Analyze news articles and provide market sentiment scores.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    // Parse AI response
    let sentimentData;
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        sentimentData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.warn('Failed to parse AI sentiment response:', parseError);
      // Fallback to neutral sentiment
      sentimentData = {
        bullishPercent: 50,
        bearishPercent: 50,
        analysis: 'Failed to parse AI response'
      };
    }

    // Calculate buzz score based on article count and recency
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const articlesInLastWeek = news.filter(article => {
      const articleTime = new Date(article.datetime).getTime();
      return articleTime > oneWeekAgo;
    }).length;

    return {
      buzz: {
        buzz: news.length,
        articlesInLastWeek
      },
      sentiment: {
        bullishPercent: (sentimentData.bullishPercent || 50) / 100,
        bearishPercent: (sentimentData.bearishPercent || 50) / 100
      },
      symbol: ticker,
      companyNewsScore: Math.min(100, news.length * 10), // Simple scoring
      analysis: sentimentData.analysis || sentimentData.overallSentiment || 'Neutral sentiment'
    };
  } catch (error) {
    console.error('AI sentiment analysis error:', error);
    // Return neutral sentiment on error
    return {
      buzz: { buzz: news.length, articlesInLastWeek: news.length },
      sentiment: { bullishPercent: 0.5, bearishPercent: 0.5 },
      symbol: ticker,
      companyNewsScore: news.length,
      analysis: 'Error analyzing sentiment'
    };
  }
}

/**
 * Get sentiment score from -1 to 1
 */
export function getSentimentScore(result: SentimentResult): number {
  return result.sentiment.bullishPercent - result.sentiment.bearishPercent;
}

/**
 * Get sentiment label
 */
export function getSentimentLabel(result: SentimentResult): string {
  const score = getSentimentScore(result);
  if (score > 0.2) return 'Bullish';
  if (score < -0.2) return 'Bearish';
  return 'Neutral';
}