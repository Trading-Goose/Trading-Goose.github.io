import { callAIProviderWithRetry } from '../_shared/aiProviders.ts';
import { MarketData, OpportunityEvaluation } from './types.ts';
import { generateOpportunityPrompt, generateExtractionPrompt } from './promptGenerator.ts';
import { parseOpportunityResponse } from './utils/responseParser.ts';
import { categorizeError } from './utils/errorHandler.ts';

/**
 * Main evaluation function that coordinates AI analysis
 */
export async function evaluateOpportunities(
  portfolioData: any,
  watchlistData: MarketData[],
  apiSettings: any,
  marketRange: string
): Promise<OpportunityEvaluation> {
  try {
    // Use opportunity-specific settings or fall back to general settings
    const aiProvider = apiSettings?.opportunity_agent_ai || apiSettings?.ai_provider;
    const aiModel = apiSettings?.opportunity_agent_model || apiSettings?.ai_model;

    // Get the correct API key based on the provider
    let apiKey = '';
    if (aiProvider === apiSettings?.ai_provider && apiSettings?.ai_api_key) {
      // If using the same provider as general settings, use the general API key
      apiKey = apiSettings.ai_api_key;
    } else {
      // Otherwise, look for provider-specific API key
      apiKey = apiSettings[`${aiProvider}_api_key`] || apiSettings?.ai_api_key || '';
    }

    const opportunitySettings = {
      ...apiSettings,
      ai_provider: aiProvider,
      ai_model: aiModel,
      ai_api_key: apiKey
    };

    // Validate API key
    if (!apiKey) {
      console.error(`❌ No API key found for provider: ${aiProvider}`);
      console.error('Available keys in settings:', Object.keys(apiSettings).filter(k => k.includes('_api_key')));
      throw new Error(`No API key configured for AI provider: ${aiProvider}`);
    }

    // Step 1: Get natural language analysis
    const analysisPrompt = generateOpportunityPrompt(portfolioData, watchlistData, marketRange);
    // Use user-defined token limit or default to 3000 for comprehensive analysis
    let maxTokens = apiSettings?.opportunity_max_tokens || apiSettings?.opportunity_agent_max_tokens || 3000;

    console.log('🔍 Step 1: Getting market analysis...');
    console.log(`📝 Using ${maxTokens} max tokens for opportunity analysis`);
    console.log(`🤖 AI Provider: ${opportunitySettings.ai_provider}, Model: ${opportunitySettings.ai_model}`);
    console.log(`🔑 API Key: ${apiKey ? 'Configured' : 'Missing'}`);

    // Use a clear system prompt for natural language analysis
    const naturalLanguageSystemPrompt = `You are an experienced market scanner and opportunity spotter for an automated trading system. Your job is to quickly scan market data and identify which stocks deserve deeper investigation by a team of specialist agents.

You write detailed market commentary in natural language - never JSON or structured data. Your analysis should read like a professional market report with clear reasoning about which stocks look interesting and why.

IMPORTANT: Write a COMPLETE analysis. Do not stop mid-sentence or truncate your response. Ensure you fully explain your reasoning and recommendations.

Focus on identifying genuine opportunities based on unusual patterns, technical signals, fundamental changes, or risk factors that warrant further investigation.`;

    let analysisResponse: string;

    try {
      analysisResponse = await callAIProviderWithRetry(
        opportunitySettings,
        analysisPrompt,
        naturalLanguageSystemPrompt,
        maxTokens,
        3
      );
    } catch (error) {
      // Check if error is due to insufficient credits
      if (error.message.includes('requires more credits') || error.message.includes('can only afford')) {
        console.warn(`⚠️ Insufficient credits for ${maxTokens} tokens, retrying with reduced tokens...`);

        // Extract available tokens from error message if possible
        const match = error.message.match(/can only afford (\d+)/);
        const availableTokens = match ? parseInt(match[1]) : 1500;
        const reducedTokens = Math.min(availableTokens - 100, 1500); // Leave buffer and cap at 1500

        console.log(`🔄 Retrying with ${reducedTokens} tokens...`);

        try {
          analysisResponse = await callAIProviderWithRetry(
            opportunitySettings,
            analysisPrompt,
            naturalLanguageSystemPrompt,
            reducedTokens,
            3
          );
        } catch (retryError) {
          // If retry also fails, throw with proper error type
          const errorMsg = retryError.message || 'Failed to get analysis even with reduced tokens';
          const categorizedError = new Error(`Rate limit/quota error: ${errorMsg}`);
          categorizedError['errorType'] = 'rate_limit';
          throw categorizedError;
        }
      } else {
        throw error; // Re-throw non-credit related errors
      }
    }

    if (!analysisResponse || analysisResponse.trim() === '') {
      console.error('⚠️ Empty response from AI provider');
      throw new Error('AI provider returned empty response');
    }

    console.log(`✅ Analysis received, length: ${analysisResponse.length} chars`);
    console.log(`📝 Analysis preview: ${analysisResponse.substring(0, 500)}...`);

    // Step 2: Extract structured data from analysis with retry logic
    console.log('🔍 Step 2: Extracting structured data with retry logic...');
    const extractionPrompt = generateExtractionPrompt(analysisResponse, watchlistData);

    // Use half of the max tokens for extraction (enough for JSON response with multiple stocks)
    const extractionMaxTokens = Math.floor(maxTokens / 2);
    console.log(`📝 Using ${extractionMaxTokens} max tokens for extraction`);

    // Retry logic for extraction - try up to 3 times
    const maxRetries = 3;
    let extractionResponse = '';
    let parsed: OpportunityEvaluation | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Extraction attempt ${attempt}/${maxRetries}...`);

        // Increase token limit on retries to avoid truncation
        const attemptTokens = extractionMaxTokens + (attempt - 1) * 300;

        // Get more emphatic about completing JSON on retries
        const systemPrompt = attempt === 1
          ? 'You are a JSON extraction specialist. Your ONLY job is to extract stock recommendations into valid JSON format. Look for the "Proceed with full specialist analysis" section and extract the numbered list exactly. ALWAYS return COMPLETE valid JSON - never truncate or cut off mid-response. CRITICAL: Complete the entire JSON structure including closing brackets. Example: {"recommendAnalysis": true, "selectedStocks": [{"ticker": "MU", "priority": "high"}, {"ticker": "PDD", "priority": "medium"}], "marketConditions": {"trend": "neutral", "volatility": "medium"}}'
          : `CRITICAL: Previous attempt failed due to incomplete JSON. You MUST return COMPLETE, VALID JSON. 
DO NOT truncate or stop mid-response. 
COMPLETE all brackets and braces. 
Extract the numbered stock list from "Proceed with full specialist analysis" section.
Return JSON like: {"recommendAnalysis": true, "selectedStocks": [{"ticker": "AAPL", "priority": "high", "reason": "reason here", "signals": []}], "marketConditions": {"trend": "neutral", "volatility": "medium"}}
IMPORTANT: Finish the ENTIRE JSON structure. Do not stop until you've closed all brackets.`;

        extractionResponse = await callAIProviderWithRetry(
          opportunitySettings,
          extractionPrompt,
          systemPrompt,
          attemptTokens,
          3
        );

        console.log(`✅ Extraction response received (attempt ${attempt}), length: ${extractionResponse.length} chars`);
        console.log(`📝 Raw extraction response: ${extractionResponse.substring(0, 1000)}...`);

        // Try to parse the extracted data
        parsed = parseOpportunityResponse(extractionResponse, analysisResponse, watchlistData);

        // If parsing succeeded, break out of retry loop
        console.log(`✅ Successfully parsed extraction on attempt ${attempt}`);
        break;

      } catch (parseError) {
        console.error(`❌ Extraction attempt ${attempt} failed:`, parseError);

        if (attempt === maxRetries) {
          // If all attempts failed, throw the error
          throw new Error(`Extraction failed after ${maxRetries} attempts. Last error: ${parseError.message}`);
        }

        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    if (!parsed) {
      throw new Error('Failed to extract structured data from analysis');
    }

    // Log what we parsed
    console.log(`📊 Parsed opportunity evaluation:`, {
      recommendAnalysis: parsed.recommendAnalysis,
      selectedStocksCount: parsed.selectedStocks.length,
      selectedTickers: parsed.selectedStocks.map(s => s.ticker),
      reasoning: parsed.reasoning.substring(0, 100) + '...',
      marketConditions: parsed.marketConditions
    });

    return parsed;
  } catch (error) {
    console.error('❌ Error in opportunity evaluation:', error);
    // Use the error categorization helper
    throw categorizeError(error);
  }
}