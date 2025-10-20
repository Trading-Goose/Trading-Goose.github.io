import { createSuccessResponse, createErrorResponse } from '../utils/response-helpers.ts';
import { ANALYSIS_STATUS, REBALANCE_STATUS } from '../../_shared/statusTypes.ts';
import { REBALANCE_DEFAULTS } from '../utils/constants.ts';
import { fetchAlpacaPortfolio } from '../../_shared/portfolio/alpacaClient.ts';
import { invokeWithRetry } from '../../_shared/invokeWithRetry.ts';
import { updateRebalanceWorkflowStep } from '../../_shared/atomicUpdate.ts';
import { getUserRoleLimits } from '../utils/role-limits.ts';
// Simple logger utility
const log = {
  info: (msg, data) => data ? console.log(msg, data) : console.log(msg),
  error: (msg, error) => error ? console.error(msg, error) : console.error(msg),
  debug: (msg, data) => data ? console.log(msg, data) : console.log(msg)
};
// Helper to update database with standard error handling
async function updateRebalanceRequest(supabase, id, updates) {
  const { error } = await supabase.from('rebalance_requests').update({
    ...updates,
    updated_at: new Date().toISOString()
  }).eq('id', id);
  if (error) {
    log.error('Failed to update rebalance request:', error);
    return false;
  }
  return true;
}
// Helper to update workflow step with error handling
async function updateWorkflowStep(supabase, rebalanceId, step, status, data) {
  const result = await updateRebalanceWorkflowStep(supabase, rebalanceId, step, status, data);
  if (!result.success) {
    log.error(`Failed to update ${step} workflow step:`, result.error);
  }
  return result.success;
}
// Helper to create opportunity evaluation insights
function createOpportunityInsights(tickers, reason, triggeredBy, maxPriceChange, threshold) {
  return {
    recommendAnalysis: true,
    selectedStocks: tickers.map((t) => ({
      ticker: t,
      reason: triggeredBy === 'threshold_check' ? `Portfolio threshold exceeded - max drift ${maxPriceChange?.toFixed(2)}%` : reason,
      priority: 'high',
      signals: [
        triggeredBy === 'threshold_check' ? 'threshold_exceeded' : triggeredBy
      ]
    })),
    reasoning: triggeredBy === 'threshold_check' ? `Automatic full analysis triggered: Portfolio drift (${maxPriceChange?.toFixed(2)}%) exceeded ${threshold}% threshold. Analyzing selected stocks: ${tickers.join(', ')}` : reason,
    estimatedCost: tickers.length * 10,
    evaluatedStocksCount: tickers.length,
    selectedStocksCount: tickers.length,
    triggeredBy,
    timestamp: new Date().toISOString(),
    ...triggeredBy === 'threshold_check' && {
      marketConditions: {
        trend: 'neutral',
        volatility: (maxPriceChange || 0) > 20 ? 'high' : 'medium',
        keyEvents: [
          'threshold_trigger'
        ]
      }
    }
  };
}
// Analyze portfolio drift and return max change and details
function analyzePortfolioDrift(portfolioData, threshold) {
  let maxPriceChange = 0;
  const driftDetails = [];
  if (!portfolioData?.positions?.length) {
    log.debug('No portfolio positions to analyze');
    return {
      maxPriceChange: 0,
      driftDetails
    };
  }
  log.debug(`Analyzing ${portfolioData.positions.length} positions for drift`);
  for (const position of portfolioData.positions) {
    // Calculate price change using unrealized P/L percentage
    const priceChange = position.unrealized_plpc ? position.unrealized_plpc * 100 : 0;
    const absPriceChange = Math.abs(priceChange);
    const positionDetail = {
      ticker: position.symbol,
      currentValue: position.market_value,
      costBasis: position.avg_entry_price * position.qty,
      currentPrice: position.current_price,
      avgPrice: position.avg_entry_price,
      shares: position.qty,
      priceChangePercent: priceChange,
      calculationMethod: 'unrealized_pl',
      exceedsThreshold: absPriceChange >= threshold,
      unrealizedPL: position.unrealized_pl,
      unrealizedPLPercent: priceChange
    };
    driftDetails.push(positionDetail);
    maxPriceChange = Math.max(maxPriceChange, absPriceChange);
    if (positionDetail.exceedsThreshold) {
      log.debug(`${position.symbol}: ${priceChange.toFixed(2)}% (exceeds ${threshold}%)`);
    }
  }
  return {
    maxPriceChange,
    driftDetails
  };
}
/**
 * Handle the start of a rebalance workflow with intelligent threshold checking and opportunity agent integration
 */ export async function handleRebalanceStart(supabase, userId, rebalanceRequestId, tickers, apiSettings, portfolioData, skipOpportunityAgent, skipThresholdCheck, rebalanceThreshold, constraints) {
  // Ensure tickers is always an array
  tickers = tickers || [];
  log.info(`🔄 Starting rebalance workflow for ${tickers.length} stocks`);
  // If rebalanceRequestId is provided, verify it belongs to the user and load its settings
  if (rebalanceRequestId) {
    const { data: existingRequest, error: verifyError } = await supabase.from('rebalance_requests').select('user_id, skip_threshold_check, skip_opportunity_agent, rebalance_threshold, constraints, metadata').eq('id', rebalanceRequestId).single();
    if (verifyError || !existingRequest) {
      log.error(`Rebalance request ${rebalanceRequestId} not found:`, verifyError);
      return createErrorResponse(`Rebalance request not found: ${rebalanceRequestId}`);
    }
    if (existingRequest.user_id !== userId) {
      log.error(`User ${userId} attempted to access rebalance ${rebalanceRequestId} belonging to user ${existingRequest.user_id}`);
      return createErrorResponse('Unauthorized: This rebalance request belongs to another user');
    }
    log.info(`✅ Verified rebalance request ${rebalanceRequestId} belongs to user ${userId}`);
    // Use settings from the existing rebalance request if not provided in the call
    // This is important for scheduled rebalances where settings are stored in the database
    skipThresholdCheck = skipThresholdCheck ?? existingRequest.skip_threshold_check;
    skipOpportunityAgent = skipOpportunityAgent ?? existingRequest.skip_opportunity_agent;
    rebalanceThreshold = rebalanceThreshold ?? existingRequest.rebalance_threshold;
    // Merge constraints from database with any passed constraints
    if (existingRequest.constraints && Object.keys(existingRequest.constraints).length > 0) {
      constraints = {
        ...existingRequest.constraints,
        ...constraints
      };
    }
    log.info(`📋 Loaded settings from rebalance request: skipThreshold=${skipThresholdCheck}, skipOpportunity=${skipOpportunityAgent}, threshold=${rebalanceThreshold}`);
  }
  // Create rebalance request if not provided
  if (!rebalanceRequestId) {
    const { data: rebalanceReq, error } = await supabase.from('rebalance_requests').insert({
      user_id: userId,
      status: REBALANCE_STATUS.RUNNING,
      target_allocations: {},
      rebalance_threshold: rebalanceThreshold || REBALANCE_DEFAULTS.THRESHOLD,
      total_portfolio_value: portfolioData?.totalValue || 0,
      portfolio_snapshot: portfolioData || {},
      constraints: constraints || {},
      created_at: new Date().toISOString()
    }).select().single();
    if (error) {
      log.error('Failed to create rebalance request:', error);
      return createErrorResponse(error.message);
    }
    rebalanceRequestId = rebalanceReq.id;
    log.info(`✅ Created rebalance request: ${rebalanceRequestId}`);
  }
  if (!rebalanceRequestId) {
    return createErrorResponse('Failed to create or get rebalance request ID');
  }
  // Log final configuration after loading from database
  log.debug('Final Config:', {
    skipOpportunityAgent,
    skipThresholdCheck,
    rebalanceThreshold
  });
  // ALWAYS fetch portfolio data from Alpaca directly - don't trust frontend
  log.info('📊 Fetching portfolio data from Alpaca');
  portfolioData = await fetchAlpacaPortfolio(apiSettings);
  if (portfolioData?.positions?.length > 0) {
    log.info(`✅ Portfolio data: $${portfolioData.account.portfolio_value} value, ${portfolioData.positions.length} positions`);
  }
  // Check if we should skip threshold check entirely
  if (skipThresholdCheck) {
    log.info('⏭️ Skipping threshold check - analyzing all selected stocks');
    // Mark threshold check as skipped
    await updateWorkflowStep(supabase, rebalanceRequestId, 'threshold_check', 'completed', {
      skipped: true,
      reason: 'User requested to skip threshold check',
      timestamp: new Date().toISOString()
    });
    // Also skip opportunity agent when threshold check is skipped
    await updateWorkflowStep(supabase, rebalanceRequestId, 'opportunity_analysis', 'completed', {
      skipped: true,
      reason: 'Skipped due to threshold check bypass',
      timestamp: new Date().toISOString()
    });
    // Create opportunity insights for skipped threshold
    const insights = createOpportunityInsights(tickers, 'Threshold check skipped by user configuration', 'skip_threshold');
    await updateRebalanceRequest(supabase, rebalanceRequestId, {
      opportunity_evaluation: insights
    });
    // Start analyses directly
    return await startAnalysesForStocks(supabase, userId, rebalanceRequestId, tickers, apiSettings, portfolioData);
  }
  // If NOT skipping threshold check, always run it first
  log.info('🔍 Running threshold check');
  // Analyze portfolio drift
  const { maxPriceChange, driftDetails } = analyzePortfolioDrift(portfolioData, rebalanceThreshold || REBALANCE_DEFAULTS.THRESHOLD);
  const hasSignificantChange = maxPriceChange >= (rebalanceThreshold || REBALANCE_DEFAULTS.THRESHOLD);
  log.info(`📊 Maximum drift: ${maxPriceChange.toFixed(2)}%, Threshold: ${rebalanceThreshold || REBALANCE_DEFAULTS.THRESHOLD}%`);
  // Save detailed threshold check insights
  const thresholdInsights = {
    threshold: rebalanceThreshold || REBALANCE_DEFAULTS.THRESHOLD,
    maxPriceChange,
    exceededThreshold: hasSignificantChange,
    positionDrifts: driftDetails,
    totalPositions: driftDetails.length,
    positionsExceedingThreshold: driftDetails.filter((d) => d.exceedsThreshold).length,
    reasoning: driftDetails.length === 0 ? `No positions found. ${hasSignificantChange ? 'Will analyze' : skipOpportunityAgent ? 'No stocks to analyze' : 'Proceeding to opportunity analysis'} for ${tickers.join(', ')}.` : hasSignificantChange ? `Threshold ${rebalanceThreshold || REBALANCE_DEFAULTS.THRESHOLD}% exceeded (max: ${maxPriceChange.toFixed(2)}%). Will analyze: ${tickers.join(', ')}` : skipOpportunityAgent ? `Drift ${maxPriceChange.toFixed(2)}% within threshold. Opportunity agent skipped - no stocks will be analyzed.` : `Drift ${maxPriceChange.toFixed(2)}% within threshold. Proceeding to opportunity analysis.`,
    timestamp: new Date().toISOString()
  };
  await updateWorkflowStep(supabase, rebalanceRequestId, 'threshold_check', 'completed', thresholdInsights);
  if (hasSignificantChange) {
    // Threshold exceeded - proceed with analysis regardless of skipOpportunityAgent
    log.info(`⚠️ Threshold exceeded (${maxPriceChange.toFixed(2)}%), analyzing ${tickers.length} stocks`);
    // Store threshold-triggered analysis decision
    const insights = createOpportunityInsights(tickers, '', 'threshold_check', maxPriceChange, rebalanceThreshold || REBALANCE_DEFAULTS.THRESHOLD);
    await updateRebalanceRequest(supabase, rebalanceRequestId, {
      opportunity_evaluation: insights
    });
    // Mark opportunity analysis as skipped since threshold exceeded
    await updateWorkflowStep(supabase, rebalanceRequestId, 'opportunity_analysis', 'completed', {
      reason: 'Threshold exceeded - direct analysis',
      skipped: true,
      maxPriceChange,
      threshold: rebalanceThreshold || REBALANCE_DEFAULTS.THRESHOLD,
      timestamp: new Date().toISOString()
    });
    return await startAnalysesForStocks(supabase, userId, rebalanceRequestId, tickers, apiSettings, portfolioData);
  } else {
    // Threshold NOT exceeded
    if (skipOpportunityAgent) {
      // Threshold not exceeded AND opportunity agent skipped - no analysis needed
      log.info('✅ Threshold not exceeded and opportunity agent skipped - completing rebalance without analysis');
      // Mark opportunity analysis as skipped
      await updateWorkflowStep(supabase, rebalanceRequestId, 'opportunity_analysis', 'completed', {
        reason: 'Opportunity agent skipped by user configuration',
        skipped: true,
        timestamp: new Date().toISOString()
      });
      // Mark rebalance as completed since no analysis is needed
      await updateRebalanceRequest(supabase, rebalanceRequestId, {
        status: REBALANCE_STATUS.COMPLETED,
        completed_at: new Date().toISOString(),
        opportunity_evaluation: {
          recommendAnalysis: false,
          selectedStocks: [],
          reasoning: 'Threshold not exceeded and opportunity agent skipped - no rebalancing needed',
          timestamp: new Date().toISOString()
        }
      });
      return createSuccessResponse({
        message: 'Rebalance completed - No action needed (threshold not exceeded, opportunity agent skipped)',
        rebalanceRequestId,
        status: REBALANCE_STATUS.COMPLETED,
        tickersAnalyzed: 0,
        tickers: []
      });
    } else {
      // Threshold NOT exceeded and opportunity agent NOT skipped - run opportunity agent
      log.info('✅ Threshold not exceeded - using Opportunity Agent');
      // Prepare watchlist data
      const watchlistData = tickers.map((ticker) => ({
        ticker,
        currentPrice: 0,
        dayChange: 0,
        dayChangePercent: 0,
        volume: 0,
        avgVolume: 0,
        weekHigh: 0,
        weekLow: 0
      }));
      await updateRebalanceRequest(supabase, rebalanceRequestId, {
        status: REBALANCE_STATUS.RUNNING
      });
      await updateWorkflowStep(supabase, rebalanceRequestId, 'opportunity_analysis', 'running', {
        started: new Date().toISOString(),
        watchlistStocks: tickers.length,
        reason: 'Threshold not exceeded - analyzing opportunities'
      });
      // Get opportunity agent settings
      const { getOpportunityAgentSettings } = await import('../utils/api-settings.ts');
      const opportunityAgentSettings = getOpportunityAgentSettings(apiSettings);
      // Invoke opportunity agent (fire and forget)
      log.info('🔍 Invoking Opportunity Agent');
      invokeWithRetry(supabase, 'opportunity-agent', {
        userId,
        portfolioData,
        watchlistData,
        apiSettings: opportunityAgentSettings,
        rebalanceRequestId,
        tickers
      }).catch(async (error) => {
        log.error('Failed to invoke Opportunity Agent:', error);
        await updateWorkflowStep(supabase, rebalanceRequestId, 'opportunity_analysis', 'error', {
          error: error.message || 'Failed to invoke opportunity agent',
          timestamp: new Date().toISOString()
        });
        await updateRebalanceRequest(supabase, rebalanceRequestId, {
          status: REBALANCE_STATUS.ERROR,
          completed_at: new Date().toISOString(),
          error_message: 'Failed to invoke opportunity agent: ' + (error.message || 'Unknown error')
        });
      });
      return createSuccessResponse({
        message: 'Rebalance initiated - Opportunity Agent evaluating market conditions',
        rebalanceRequestId,
        status: REBALANCE_STATUS.RUNNING,
        tickersToEvaluate: tickers.length,
        tickers: tickers
      });
    }
  }
}
/**
 * Start analyses for selected stocks (respecting role-based parallel limits and max stocks limit)
 */ export async function startAnalysesForStocks(supabase, userId, rebalanceRequestId, tickers, apiSettings, portfolioData) {
  log.info(`🚀 Starting analyses for ${tickers.length} stocks`);
  // Fetch user's role limits
  const roleLimits = await getUserRoleLimits(supabase, userId);
  const maxParallelAnalyses = roleLimits.max_parallel_analysis ?? 1;
  const maxRebalanceStocks = roleLimits.max_rebalance_stocks ?? 5;
  log.info(`📊 Role limits fetched - Parallel: ${maxParallelAnalyses}, Max stocks: ${maxRebalanceStocks}`);
  log.debug(`Full role limits:`, roleLimits);
  // Apply role limits if needed
  let tickersToAnalyze = tickers;
  // Log detailed ticker information
  log.info(`📈 Ticker Analysis:`);
  log.info(`   Requested tickers (${tickers.length}): ${tickers.join(', ')}`);
  log.info(`   Max allowed by role: ${maxRebalanceStocks}`);
  if (tickers.length > maxRebalanceStocks) {
    log.info(`⚠️ Applying role limit: ${tickers.length} requested, but only ${maxRebalanceStocks} allowed`);
    tickersToAnalyze = tickers.slice(0, maxRebalanceStocks);
    log.info(`   Limited to: ${tickersToAnalyze.join(', ')}`);
    // Get existing metadata to merge with new data
    const { data: existingReq } = await supabase.from('rebalance_requests').select('metadata').eq('id', rebalanceRequestId).single();
    const existingMetadata = existingReq?.metadata || {};
    // Store role limit data in the metadata JSONB column (merging with existing)
    await updateRebalanceRequest(supabase, rebalanceRequestId, {
      metadata: {
        ...existingMetadata,
        role_limit_applied: true,
        requested_stocks: tickers,
        analyzed_stocks: tickersToAnalyze,
        excluded_stocks: tickers.slice(maxRebalanceStocks),
        max_stocks_limit: maxRebalanceStocks,
        limit_reason: `Role limit: Maximum ${maxRebalanceStocks} stocks allowed`
      }
    });
  }
  // Create analysis records sequentially to prevent duplicates
  log.info(`Creating ${tickersToAnalyze.length} analysis records`);
  const analyses = [];
  for (const ticker of tickersToAnalyze) {
    try {
      // ALWAYS create a NEW analysis - never reuse!
      // Each analysis needs its own unique ID and fresh workflow steps
      const { data: analysis, error } = await supabase.from('analysis_history').insert({
        user_id: userId,
        ticker,
        analysis_date: new Date().toISOString().split('T')[0],
        rebalance_request_id: rebalanceRequestId,
        analysis_status: ANALYSIS_STATUS.PENDING,
        decision: 'PENDING',
        confidence: 0,
        agent_insights: {},
        created_at: new Date().toISOString(),
        full_analysis: createInitialWorkflowSteps()
      }).select().single();
      if (error) {
        log.error(`Failed to create analysis for ${ticker}:`, error);
        continue;
      }
      if (analysis) {
        log.debug(`Created new analysis for ${ticker}: ${analysis.id}`);
        analyses.push({
          ticker,
          analysisId: analysis.id
        });
      }
    } catch (err) {
      log.error(`Exception creating analysis for ${ticker}:`, err);
    }
  }
  if (analyses.length === 0) {
    return createErrorResponse('Failed to create any analysis records');
  }
  // Determine which analyses to start immediately based on role limit
  const analysesToStart = analyses.slice(0, maxParallelAnalyses);
  const analysesToQueue = analyses.slice(maxParallelAnalyses);
  log.info(`Analysis: ${analysesToStart.length} starting, ${analysesToQueue.length} queued`);
  // Mark opportunity agent step as complete
  await updateWorkflowStep(supabase, rebalanceRequestId, 'opportunity_analysis', 'completed', {
    completedAt: new Date().toISOString(),
    selectedStocks: analyses.map((a) => a.ticker)
  });
  // Update rebalance request with analysis tracking info
  await updateRebalanceRequest(supabase, rebalanceRequestId, {
    status: REBALANCE_STATUS.RUNNING,
    total_stocks: analyses.length,
    stocks_analyzed: 0,
    selected_stocks: analyses.map((a) => a.ticker),
    analysis_ids: analyses.map((a) => a.analysisId)
  });
  // Update status of analyses we're going to start to RUNNING (only if not cancelled)
  await Promise.all(analysesToStart.map(async ({ analysisId }) => {
    // First check if analysis has been cancelled
    const { data: currentStatus, error: checkError } = await supabase.from('analysis_history').select('analysis_status').eq('id', analysisId).single();
    if (checkError || !currentStatus) {
      console.error(`❌ Failed to check status for analysis ${analysisId}:`, checkError);
      return;
    }
    // Skip if analysis has been cancelled
    if (currentStatus.analysis_status === ANALYSIS_STATUS.CANCELLED) {
      console.log(`⏩ Skipping cancelled analysis ${analysisId}`);
      return;
    }
    return supabase.from('analysis_history').update({
      analysis_status: ANALYSIS_STATUS.RUNNING,
      updated_at: new Date().toISOString()
    }).eq('id', analysisId).neq('analysis_status', ANALYSIS_STATUS.CANCELLED); // Double-check with condition
  }));
  // Launch analysis-coordinator calls for analyses to start
  const launchResults = await Promise.all(analysesToStart.map(async ({ ticker, analysisId }) => {
    try {
      const result = await invokeWithRetry(supabase, 'analysis-coordinator', {
        analysisId,
        ticker,
        userId,
        phase: 'analysis',
        apiSettings,
        analysisContext: {
          type: 'rebalance',
          rebalanceRequestId,
          portfolioData
        }
      });
      if (!result.success) {
        await supabase.from('analysis_history').update({
          analysis_status: ANALYSIS_STATUS.ERROR,
          decision: 'ERROR',
          full_analysis: {
            error: `Failed to start: ${result.error}`,
            completedAt: new Date().toISOString()
          }
        }).eq('id', analysisId);
        return {
          ticker,
          success: false,
          error: result.error
        };
      }
      return {
        ticker,
        success: true
      };
    } catch (error) {
      await supabase.from('analysis_history').update({
        analysis_status: ANALYSIS_STATUS.ERROR,
        decision: 'ERROR',
        full_analysis: {
          error: `Exception: ${error.message}`,
          completedAt: new Date().toISOString()
        }
      }).eq('id', analysisId);
      return {
        ticker,
        success: false,
        error: error.message
      };
    }
  }));
  const successfulLaunches = launchResults.filter((r) => r.success);
  const failedLaunches = launchResults.filter((r) => !r.success);
  log.info(`Launch results: ${successfulLaunches.length} successful, ${failedLaunches.length} failed`);
  if (analysesToQueue.length > 0) {
    log.info(`${analysesToQueue.length} analyses queued as pending`);
  }
  if (successfulLaunches.length === 0 && analysesToQueue.length === 0) {
    await updateRebalanceRequest(supabase, rebalanceRequestId, {
      status: REBALANCE_STATUS.ERROR,
      error_message: 'Failed to start any analyses',
      completed_at: new Date().toISOString()
    });
    return createErrorResponse('Failed to start any analyses for rebalance');
  }
  // Update workflow step for parallel analysis
  await updateWorkflowStep(supabase, rebalanceRequestId, 'parallel_analysis', 'running', {
    startedAt: new Date().toISOString(),
    totalAnalyses: analyses.length,
    successfulLaunches: successfulLaunches.length,
    failedLaunches: failedLaunches.length,
    pendingAnalyses: analysesToQueue.length,
    maxParallelAnalyses,
    parallelExecution: true,
    analysisDetails: launchResults
  });
  return createSuccessResponse({
    message: `Started ${successfulLaunches.length} analyses (${analysesToQueue.length} pending)`,
    rebalanceRequestId,
    totalAnalyses: analyses.length,
    runningAnalyses: successfulLaunches.length,
    pendingAnalyses: analysesToQueue.length,
    failedLaunches: failedLaunches.length,
    selectedTickers: tickersToAnalyze,
    maxParallelAllowed: maxParallelAnalyses,
    maxRebalanceStocks,
    roleLimitApplied: tickers.length > maxRebalanceStocks,
    originalRequestedStocks: tickers.length,
    analyzedStocksCount: tickersToAnalyze.length,
    launchedTickers: successfulLaunches.map((r) => r.ticker),
    pendingTickers: analysesToQueue.map((a) => a.ticker),
    failedTickers: failedLaunches.map((r) => r.ticker),
    excludedTickers: tickers.length > maxRebalanceStocks ? tickers.slice(maxRebalanceStocks) : [],
    executionMode: 'role-limited-parallel'
  });
}
/**
 * Create initial workflow steps structure for new analysis
 */ function createInitialWorkflowSteps() {
  const pa = {
    status: 'pending',
    progress: 0
  };
  const createStep = (id, name, agents) => ({
    id,
    name,
    status: 'pending',
    agents: agents.map((a) => ({
      name: a,
      ...pa
    }))
  });
  return {
    startedAt: new Date().toISOString(),
    messages: [],
    workflowSteps: [
      createStep('analysis', 'Market Analysis', [
        'Macro Analyst',
        'Market Analyst',
        'News Analyst',
        'Social Media Analyst',
        'Fundamentals Analyst'
      ]),
      createStep('research', 'Research Team', [
        'Bull Researcher',
        'Bear Researcher',
        'Research Manager'
      ]),
      createStep('trading', 'Trading Decision', [
        'Trader'
      ]),
      createStep('risk', 'Risk Management', [
        'Risky Analyst',
        'Safe Analyst',
        'Neutral Analyst',
        'Risk Manager'
      ])
    ]
  };
}
