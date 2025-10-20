# Trading Agent Ecosystem Documentation

## Overview

The TradingGoose system employs a sophisticated multi-agent architecture for comprehensive stock analysis and portfolio management. The system orchestrates multiple AI-powered agents working in phases to deliver thorough investment analysis and trading decisions.

## System Architecture

### Core Workflow Pattern
The agent system operates in a **sequential workflow** with five main phases:

1. **Analysis Phase** - Parallel data collection and market analysis
2. **Research Phase** - Sequential debate-driven investment research  
3. **Trading Phase** - Strategy formulation and execution planning
4. **Risk Phase** - Parallel risk assessment with final synthesis
5. **Portfolio Phase** - Final portfolio decisions and trade execution

### Execution Characteristics

**Phase-Specific Execution Patterns:**
- **Phase 1 (Analysis)**: Agents run in parallel with no execution order requirement
- **Phase 2 (Research)**: Sequential bull-bear debate rounds (user-configurable 1-3 rounds), concluded by research manager
- **Phase 3 (Trading)**: Single trader agent processes all previous analysis
- **Phase 4 (Risk)**: Risk analysts run in parallel, followed by sequential risk manager
- **Phase 5 (Portfolio)**: Single portfolio manager makes final decisions

**Concurrency Features:**
- Atomic database operations prevent race conditions
- Safe handling of multiple simultaneous agent executions
- Phase-aware completion checking with coordinator notifications
- Self-retry mechanisms with configurable timeouts (typically 180 seconds)

## Workflow Orchestration

### Main Coordinators

#### `analysis-coordinator`
**Purpose**: Central orchestration engine for individual stock analysis workflows

**Key Responsibilities:**
- Manages the full analysis pipeline from initial analysis through risk management
- Handles phase transitions and agent coordination
- Routes to appropriate portfolio manager based on context (individual vs rebalance)
- Manages cancellation handling and error recovery

**Routing Logic:**
- Individual analyses → `analysis-portfolio-manager`
- Rebalance context analyses → `rebalance-coordinator` notification

#### `rebalance-coordinator`
**Purpose**: Manages portfolio rebalancing workflows with multiple parallel stock analyses

**Key Responsibilities:**
- Starts parallel `analysis-coordinator` calls for each stock in rebalance
- Tracks completion of individual analyses within the rebalance
- Atomically checks when ALL analyses in a rebalance are complete
- Invokes `rebalance-portfolio-manager` when all analyses are done
- Handles rebalance cancellation and error scenarios

**Concurrent Execution Safety:**
- Atomic completion checking prevents duplicate portfolio manager invocations
- Race condition prevention for simultaneous analysis completions
- Safe state management across parallel executions

### Supporting Functions

- **`opportunity-agent`** - Evaluates market opportunities and filters stocks for analysis
- **`execute-trade`** - Handles actual trade execution through Alpaca API
- **`process-scheduled-rebalances`** - Manages scheduled portfolio rebalancing

## Core Agents by Phase

### Phase 1: Analysis (Data Collection & Market Analysis)

#### `agent-market-analyst`
**Purpose**: Comprehensive technical analysis using market data and indicators

**Data Sources**: 
- Yahoo Finance API (primary)
- Alpaca API (fallback)
- 1-year historical data with 70 downsampled points

**Key Capabilities**:
- Technical indicators: SMA, EMA, MACD, RSI, Bollinger Bands, ATR
- Support/resistance level identification
- Volume pattern analysis and momentum assessment
- Trend analysis with probability assessments

**Output**: 
- Executive summary with trend outlook
- Specific price levels and trading signals
- Comprehensive metrics table with all indicators
- Cached data for performance optimization

#### `agent-news-analyst`
**Purpose**: Real-time news sentiment analysis and event impact assessment

**Data Sources**: 
- Perplefina API with "news" focus mode
- Current date-aware queries
- 10-15 sources based on optimization mode

**Key Capabilities**:
- Recent news analysis with sentiment scoring
- Press release and earnings evaluation
- Market-moving event identification
- Trading implications assessment

**Output**: 
- Overall sentiment score with confidence level
- Key positive/negative developments
- News-based BUY/SELL/HOLD recommendation
- Source URLs and references

#### `agent-social-media-analyst`
**Purpose**: Multi-platform social sentiment and retail investor behavior analysis

**Data Sources**: 
- Perplefina API with "social" focus mode
- Reddit, Twitter/X, StockTwits discussions
- Trading community sentiment

**Key Capabilities**:
- Platform-specific sentiment analysis
- Retail investor consensus tracking
- Social media volume and momentum trends
- Viral trend and influencer opinion detection

**Output**: 
- Overall social sentiment score (1-10)
- Platform consensus breakdown
- Key bullish/bearish social factors
- Social risk level assessment

#### `agent-fundamentals-analyst`
**Purpose**: Financial statement analysis and comprehensive valuation assessment

**Data Sources**: 
- Perplefina API with "fundamentals" focus mode
- SEC filings and financial statements
- Valuation databases

**Key Capabilities**:
- Valuation metrics: P/E, PEG, EV/EBITDA, P/B ratios
- Financial health evaluation (debt, cash flow, margins)
- Growth prospects and earnings analysis
- Sector comparison and peer analysis

**Output**: 
- Valuation status (undervalued/fair/overvalued)
- Financial health grade (A-F)
- Growth outlook assessment
- Fundamental BUY/SELL/HOLD recommendation

#### `agent-macro-analyst`
**Purpose**: Macroeconomic analysis and broader market context

**Data Sources**: 
- Perplefina API with economic data focus
- Real-time Fed policy and economic indicators

**Key Capabilities**:
- Fed policy and interest rate impact analysis
- Inflation and GDP growth assessment
- Global economic conditions evaluation
- Sector-specific macro impacts

**Output**: 
- Economic outlook impact assessment
- Macro risk factors
- Policy implications for the stock
- Structured economic indicators table

### Phase 2: Research (Debate-Driven Analysis)

#### `agent-bull-researcher`
**Purpose**: Builds compelling bullish investment cases through structured debate

**Key Capabilities**:
- Top 5 bullish reasons with evidence
- Growth catalyst identification
- Competitive advantage analysis
- Upside scenario modeling with price targets
- Counter-arguments to bearish concerns

**Debate Features**:
- Multi-round debate capability (1-3 rounds)
- Argument evolution across rounds
- Round-aware prompting to avoid repetition
- Direct response to bear researcher's points

**Output**: 
- Comprehensive bullish thesis
- Specific price targets with timelines
- Risk/reward ratios favoring upside
- Key debate points for each round

#### `agent-bear-researcher`
**Purpose**: Comprehensive risk identification and bearish case development

**Key Capabilities**:
- Top 5 risks and concerns analysis
- Downside catalyst identification
- Competitive disadvantage assessment
- Worst-case scenario modeling
- Financial and management red flag detection

**Debate Features**:
- Direct counter-arguments to bull claims
- Evidence-based rebuttals
- Round-aware debate continuation
- Risk materialization timeline estimates

**Output**: 
- Detailed risk assessment
- Downside price targets
- Key bearish debate points
- Risk monitoring recommendations

#### `agent-research-manager`
**Purpose**: Synthesizes all research and provides final balanced recommendations

**Key Capabilities**:
- Multi-round debate synthesis
- Balanced recommendation formation
- Fair value estimation with methodology
- Conviction level assessment (1-10 scale)
- Position sizing recommendations

**Decision Logic**:
- AI-driven recommendation extraction
- Pattern matching for recommendation parsing
- Fallback logic based on signal counting
- Price target extraction from research

**Output**: 
- Final recommendation (Strong Buy/Buy/Hold/Sell/Strong Sell)
- Conviction level with rationale
- Fair value estimate
- Specific action items for traders

### Phase 3: Trading (Strategy Formulation)

#### `agent-trader`
**Purpose**: Develops specific trading strategies and execution plans

**Key Capabilities**:
- Synthesizes all previous analysis phases
- Calculates entry/exit prices with ranges
- Position sizing based on conviction
- Stop-loss and profit target determination
- Risk/reward ratio calculation

**Trading Logic**:
- Maps research recommendations to trading actions
- Avoids defaulting to HOLD unnecessarily
- Multiple profit targets with scaling strategies
- Comprehensive monitoring criteria

**Output**:
```typescript
tradingPlan: {
  action: 'BUY'|'SELL'|'HOLD',
  entryPrice: number,
  entryRange: {min, max},
  positionSize: "3-5%",
  stopLoss: number,
  targets: [{price, allocation, description}],
  riskRewardRatio: "1:3",
  confidence: 'high'|'medium'|'low',
  timeframe: string,
  monitoringCriteria: string[]
}
```

### Phase 4: Risk (Risk Assessment & Management)

#### `agent-risky-analyst`
**Purpose**: Aggressive, high-risk/high-reward investment perspective

**Key Capabilities**:
- Leveraged position evaluation
- Options and derivatives strategies
- Momentum and growth opportunity focus
- Volatility as profit opportunity

**Recommendations**:
- 7-10% position sizes for high conviction
- Leveraged strategies and options overlay
- Maximum upside potential targeting
- Suitable for risk-tolerant investors

**Output**: 
- Aggressive risk profile assessment
- High-risk opportunity identification
- Growth-oriented strategies

#### `agent-safe-analyst`
**Purpose**: Conservative, capital preservation-focused analysis

**Key Capabilities**:
- Defensive positioning strategies
- Income generation opportunities
- Hedging and protective measures
- Downside risk minimization

**Recommendations**:
- 1-2% maximum position sizes
- Stop-loss and hedging emphasis
- Dividend and covered call strategies
- Capital preservation focus

**Output**: 
- Conservative risk assessment
- Safety-first recommendations
- Income generation strategies

#### `agent-neutral-analyst`
**Purpose**: Balanced, moderate risk-reward analysis

**Key Capabilities**:
- Balanced growth and income strategies
- Portfolio integration assessment
- Rebalancing recommendations
- Sustainable return focus

**Recommendations**:
- 3-5% moderate position sizes
- Combined growth/income approach
- Measured entry/exit strategies
- Risk-adjusted returns focus

**Output**: 
- Balanced risk perspective
- Moderate position recommendations
- Portfolio integration guidance

#### `agent-risk-manager`
**Purpose**: Final risk synthesis and GO/NO-GO decision making

**Key Capabilities**:
- Synthesizes all risk analyst perspectives
- Comprehensive risk scoring (1-10 scale)
- Investor-type specific recommendations
- Final decision extraction with confidence

**Decision Features**:
- Advanced pattern matching for decision extraction
- Confidence calculation from multiple factors
- Watchlist updates with analysis results
- Comprehensive monitoring plans

**Output**:
```typescript
finalAssessment: {
  overallRiskScore: number,
  decision: 'BUY'|'SELL'|'HOLD',
  confidence: "high"|"medium"|"low",
  recommendations: {
    aggressive: {action, positionSize, strategy},
    moderate: {action, positionSize, strategy},
    conservative: {action, positionSize, strategy}
  },
  keyRisks: string[],
  monitoringPlan: {daily, weekly, monthly}
}
```

### Phase 5: Portfolio (Portfolio Management)

#### `analysis-portfolio-manager`
**Purpose**: Portfolio decisions for individual stock analysis

**Key Capabilities**:
- Individual stock position sizing
- Portfolio impact assessment
- Risk-adjusted position management
- Trade order generation for single stocks

**Integration Features**:
- Alpaca portfolio data fetching
- Current position analysis
- Buying power calculation
- Order validation and constraints

**Output**: 
- Specific trade orders with quantities
- Position sizing rationale
- Portfolio allocation recommendations
- Risk management parameters

#### `rebalance-portfolio-manager`
**Purpose**: Portfolio-wide rebalancing and allocation optimization

**Key Capabilities**:
- Multi-stock portfolio optimization
- Allocation algorithm implementation
- Coordinated trade order generation
- Portfolio-wide risk management

**Rebalancing Features**:
- Simultaneous multi-stock position adjustments
- Tax-efficient rebalancing strategies
- Risk parity considerations
- Constraint satisfaction (min/max positions)

**Output**: 
- Complete rebalancing plan
- Coordinated trade orders for all stocks
- New portfolio allocation breakdown
- Expected portfolio metrics post-rebalance

## Shared Infrastructure

### Common Utilities (`_shared/`)

#### Core Services
- **`aiProviders.ts`** - Multi-provider AI abstraction (OpenAI, Anthropic, etc.)
- **`alpacaPortfolio.ts`** - Alpaca API integration for portfolio management
- **`marketData.ts`** - Market data fetching with caching layer
- **`perplefinaClient.ts`** - Perplefina API client for news/social/fundamental data
- **`technicalIndicators.ts`** - Technical analysis calculation engine

#### Workflow Management
- **`agentSelfInvoke.ts`** - Self-retry and timeout management (180s default)
- **`atomicUpdate.ts`** - Database updates with transaction safety
- **`cancellationCheck.ts`** - Analysis cancellation and cleanup
- **`coordinatorNotification.ts`** - Inter-agent communication system
- **`phaseProgressChecker.ts`** - Phase completion verification

#### Trading Infrastructure
- **`tradeOrders.ts`** - Trade order processing and validation
- **`positionManagement.ts`** - Position sizing and risk calculations
- **`autoTradeChecker.ts`** - Automated trading permission verification
- **`timezoneUtils.ts`** - Market timing and timezone handling

#### Status Management
- **`status/`** - Comprehensive status type definitions
  - `analysisStatus.ts` - Analysis workflow states
  - `rebalanceStatus.ts` - Rebalance workflow states
  - `tradeOrderStatus.ts` - Trade execution states
  - `displayHelpers.ts` - Status display utilities

## Agent Communication Flow

### Sequential Execution Pattern
1. **Phase Initiation**: Coordinator starts first agent(s) in phase
2. **Agent Processing**: Agent performs analysis with timeout protection
3. **Completion Notification**: Agent notifies coordinator of completion
4. **Next Agent Trigger**: Coordinator triggers next agent or phase
5. **Phase Completion**: Last agent in phase triggers next phase

### Data Sharing Mechanism
- Each agent reads previous agents' outputs from database
- Atomic updates ensure data consistency
- Full analysis context passed between phases
- Structured data format for cross-agent communication

### Error Handling Strategy
- **Categorized Errors**: rate_limit, api_key, ai_error, data_fetch, other
- **Retry Logic**: Automatic retries with exponential backoff
- **Fallback Analysis**: Simplified analysis when AI providers fail
- **Graceful Degradation**: System continues with available data
- **Comprehensive Logging**: Detailed error tracking and debugging

## Key Features

### Multi-Round Debate System
- Configurable 1-3 debate rounds between bull and bear researchers
- Round-aware prompting prevents repetition
- Progressive argument development
- Research manager synthesizes all rounds

### AI Provider Flexibility
- Support for OpenAI, Anthropic, and other providers
- Model selection per user preference
- Token management and optimization
- Fallback provider support

### Real-Time Data Integration
- Live market data from Alpaca/Yahoo Finance
- Current news and social sentiment via Perplefina
- Cached data layer for performance
- Date-aware queries for timely analysis

### Risk Management Framework
- Multi-perspective risk analysis
- Investor profile-specific recommendations
- Comprehensive risk scoring system
- Detailed monitoring plans

### Portfolio Integration
- Individual stock analysis with portfolio context
- Portfolio-wide rebalancing optimization
- Position sizing based on portfolio constraints
- Risk-adjusted allocation strategies

## Configuration

### Analysis Depth Levels
- **Level 1**: Basic analysis with key insights (minimal tokens)
- **Level 2**: Standard comprehensive analysis (balanced)
- **Level 3**: Detailed analysis with extended context
- **Level 4**: Maximum depth with extensive detail

### Optimization Modes
- **Speed**: Faster processing with fewer data sources
- **Normal**: Standard processing with balanced resources
- **Balanced**: Enhanced processing with more data sources

### Debate Configuration
- **Rounds**: 1-3 configurable debate rounds
- **Token Allocation**: Dynamic based on round count
- **Argument Depth**: Scales with optimization mode

### Timeout Configuration
- **Default**: 180 seconds per agent
- **Retries**: 3 attempts with exponential backoff
- **Self-Invocation**: Automatic retry on timeout

## Error Handling & Resilience

### Retry Mechanisms
- Automatic retries on transient failures
- Exponential backoff with jitter
- Maximum retry limits per agent
- Self-invocation for timeout recovery

### Graceful Degradation
- Fallback analysis when providers fail
- Simplified processing for large datasets
- Partial completion handling
- Error categorization for targeted recovery

### Cancellation Support
- Real-time cancellation checking
- Clean resource cleanup
- State rollback on cancellation
- User notification of cancellation

### Monitoring & Logging
- Comprehensive execution logging
- Performance metrics tracking
- Error rate monitoring
- Agent execution timelines

## Security & Access Control

### API Key Management
- Secure credential storage in environment
- User-specific API key support
- Credential validation before execution
- Error handling for invalid credentials

### Data Isolation
- User-specific data access controls
- Supabase Row Level Security (RLS)
- Atomic transactions for data consistency
- Secure inter-agent communication

### Rate Limiting
- Provider-specific rate limit handling
- Automatic backoff on rate limits
- Token usage optimization
- Concurrent request management

## Performance Optimization

### Caching Strategy
- Market data caching (24-hour TTL)
- Technical indicator caching
- News/social data deduplication
- Provider response caching

### Parallel Processing
- Concurrent agent execution in analysis phase
- Parallel risk analyst processing
- Batch API calls where possible
- Asynchronous coordinator notifications

### Resource Management
- Token budget allocation per agent
- Data downsampling for AI processing
- Selective field extraction
- Response size optimization

### Database Optimization
- Atomic updates for consistency
- Indexed queries for performance
- Batch operations where applicable
- Connection pooling

## System Metrics

### Typical Execution Times
- **Analysis Phase**: 30-60 seconds (parallel)
- **Research Phase**: 60-90 seconds per round
- **Trading Phase**: 20-30 seconds
- **Risk Phase**: 40-60 seconds (parallel + sequential)
- **Portfolio Phase**: 30-45 seconds
- **Total Workflow**: 3-5 minutes typical

### Resource Usage
- **Tokens per Analysis**: 50K-150K depending on depth
- **API Calls**: 20-30 per complete analysis
- **Database Operations**: 50-100 per workflow
- **Memory Usage**: ~256MB per agent execution

---

*This documentation reflects the current production state of the TradingGoose agent ecosystem. The system is designed for scalability, reliability, and comprehensive investment analysis through coordinated multi-agent intelligence.*