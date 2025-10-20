import { MarketData, OpportunityEvaluation } from '../types.ts';

/**
 * Parse the AI response into structured OpportunityEvaluation
 */
export function parseOpportunityResponse(
  extractionResponse: string, 
  analysisReasoning: string, 
  watchlistData: MarketData[]
): OpportunityEvaluation {
  // Use the full analysis as the reasoning - it contains all the insights
  const reasoning = analysisReasoning || 'Market evaluation completed';

  try {
    // Clean up common JSON issues more aggressively
    let cleanedResponse = extractionResponse
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .replace(/\t/g, ' ')
      .trim();

    // Extract JSON portion if wrapped in text
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[0];
    }

    // Check for obvious truncation issues
    if (cleanedResponse.endsWith('"ticker":') ||
      cleanedResponse.endsWith('"reason":') ||
      cleanedResponse.endsWith('"priority":') ||
      cleanedResponse.endsWith('"selectedStocks": [') ||
      cleanedResponse.endsWith(', {')) {
      console.error('⚠️ Response appears to be truncated');
      throw new Error('Response truncated - incomplete JSON received');
    }

    console.log(`📝 Cleaned JSON for parsing: ${cleanedResponse.substring(0, 300)}...`);

    // Try to parse the extraction response
    const parsed = JSON.parse(cleanedResponse);

    // Validate required fields
    if (typeof parsed.recommendAnalysis === 'undefined') {
      console.warn('⚠️ Missing recommendAnalysis field, defaulting to false');
      parsed.recommendAnalysis = false;
    }

    if (!Array.isArray(parsed.selectedStocks)) {
      console.warn('⚠️ selectedStocks is not an array, defaulting to empty array');
      parsed.selectedStocks = [];
    }

    // Validate and return the structured data with the natural language reasoning
    return {
      recommendAnalysis: Boolean(parsed.recommendAnalysis),
      selectedStocks: (parsed.selectedStocks || []).map((stock: any) => ({
        ticker: stock.ticker || '',
        reason: stock.reason || 'Selected for analysis',
        priority: stock.priority || 'medium',
        signals: Array.isArray(stock.signals) ? stock.signals : []
      })).filter((stock: any) => stock.ticker), // Filter out any entries without tickers
      reasoning: reasoning,
      estimatedCost: (parsed.selectedStocks?.length || 0) * 10,
      marketConditions: {
        trend: parsed.marketConditions?.trend || 'neutral',
        volatility: parsed.marketConditions?.volatility || 'medium',
        keyEvents: parsed.marketConditions?.keyEvents || []
      }
    };

  } catch (error) {
    console.error('❌ Failed to parse extraction response as JSON:', error);
    console.error('📝 Raw response that failed:', extractionResponse.substring(0, 500));

    // Throw error to trigger retry in the extraction agent
    throw new Error(`Extraction failed to return valid JSON. Response: ${extractionResponse.substring(0, 200)}...`);
  }
}