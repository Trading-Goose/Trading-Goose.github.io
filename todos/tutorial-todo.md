# TradingGoose Tutorial System Plan

## Overview
Create an inline help system using tooltips to guide users through all features of TradingGoose directly within the application interface.

## Tutorial Approach

### Core Strategy: Inline Help with Tooltips
Instead of separate tutorial pages, we will integrate help directly into the application using:
- **Help Buttons [?]**: Small, unobtrusive help icons next to every input field and setting
- **Rich Tooltips**: Detailed explanations that appear on hover using the existing tooltip component
- **Progressive Disclosure**: Basic info on hover, with links to more detailed documentation if needed
- **Context-Aware Help**: Tooltips provide information relevant to the user's current task

## Implementation Components

### 1. HelpButton Component (`/src/components/ui/help-button.tsx`)
A reusable component that provides:
- Consistent [?] icon styling
- Tooltip integration
- Support for simple text or rich content
- Configurable positioning and appearance
- Accessibility features (ARIA labels, keyboard navigation)

### 2. LabelWithHelp Component
Combines form labels with integrated help buttons:
- Automatic layout of label + help button
- Required field indicators
- Consistent spacing and alignment

### 3. HelpContent Component
For more complex help content:
- Title and description
- Examples with code formatting
- Tips and best practices
- Warnings for important considerations
- Related fields/settings references

## Settings Help Integration

### 2.1 Providers Tab Help Content (`/src/pages/settings/ProvidersTab.tsx`)

#### Default AI Provider Section
- **Section Title Help**: Explain what the default provider is and how it's used

##### Nickname Field (Line 70-77)
- **Help Content**: 
  - A friendly name to identify this provider configuration
  - Example: "Production API", "Fast Model", "Development"
  - Used for easy identification in agent assignments

##### Provider Selection (Line 83-98)
- **Help Content**:
  - Choose your AI provider (OpenAI, Anthropic, Google, DeepSeek, OpenRouter)
  - Each provider has different models, pricing, and capabilities
  - Provider comparison and links to pricing pages

##### API Key Field (Line 107-116)
- **Help Content**:
  - Your secret key to authenticate with the AI provider
  - How to obtain keys from each provider's dashboard
  - Security best practices (never share, rotate regularly)
  - Example format for each provider

##### Default Model Selection (Line 142-154)
- **Help Content**:
  - The AI model to use for analysis
  - Trade-offs between cost, speed, and quality
  - Recommended models for trading analysis
  - Custom model option for advanced users

##### Custom Model Name Input (Line 156-162)
- **Help Content**:
  - Enter exact model name from provider's documentation
  - Examples: "gpt-4-turbo-preview", "claude-3-opus"
  - Used for newer models not yet in dropdown

#### Additional AI Providers Section
- **Section Title Help**: Configure multiple API keys from the same or different providers

##### Additional Provider Fields (Same as above, Lines 209-278)
- Each additional provider has the same fields as default provider
- Use cases:
  - Multiple API keys from same provider (rate limit distribution)
  - Different API keys for different purposes (dev vs production)
  - Backup API keys for failover
  - Different billing accounts or organizations
- Assign these to specific agent teams in the Agents tab

### 2.2 Agents Tab Help Content (`/src/pages/settings/AgentsTab.tsx`)

#### Analysis Agent Section (Lines 129-291)

##### AI Provider Selection (Line 137-149)
- **Help Content**:
  - Select which API key configuration to use for analysis agents
  - Defaults to "Default AI" if not changed
  - Choose different providers for cost/performance optimization

##### Model Selection (Line 152-199)
- **Help Content**:
  - Choose the AI model for analysis tasks
  - Inherits from Default AI or select custom
  - Balance between cost, speed, and quality
  - Recommended: GPT-4 or Claude for best analysis

##### Analysis Optimization (Line 203-228)
- **Help Content**:
  - Speed: Faster analysis, may skip some data sources
  - Balanced: Thorough analysis with all available data
  - Choose based on your trading frequency and needs

##### Historical Data Range (Line 231-250)
- **Help Content**:
  - How far back to analyze price and volume data
  - Longer periods provide more context but take longer
  - 1M: Day trading | 3M: Swing trading | 6M+: Long-term investing

##### Number of Search Sources (Line 252-268)
- **Help Content**:
  - How many web sources to search for each analysis
  - More sources = better coverage but higher cost
  - Recommended: 3-5 for balanced analysis

##### Max Tokens (Line 270-290)
- **Help Content**:
  - Maximum length of agent responses
  - Higher = more detailed analysis
  - Cost increases with token count
  - Recommended: 2000-4000 for thorough analysis

#### Research Agent Section (Lines 293-405)

##### Number of Debate Rounds (Line 367-383)
- **Help Content**:
  - How many rounds of bull vs bear debate
  - More rounds = deeper analysis but higher cost
  - Each round refines arguments with counterpoints
  - Recommended: 2-3 for balanced perspective

#### Trading Decision Agent Section (Lines 407-501)
- **Help Content**: Similar to Analysis Agent but optimized for trading decisions

#### Risk Management Agent Section (Lines 503-597)
- **Help Content**: Similar to Analysis Agent but focused on risk assessment

#### Portfolio Manager Section (Lines 599-696)

##### Portfolio Manager Role (Line 605-607)
- **Help Content**:
  - Analyzes current portfolio positions
  - Generates optimal allocation strategy
  - Creates specific trade orders
  - Considers position sizing and risk limits

### 2.3 Rebalance Tab Help Content (`/src/pages/settings/RebalanceTab.tsx`)

#### Rebalance Settings Section (Lines 83-176)

##### Rebalance Threshold Slider (Line 90-110)
- **Help Content**:
  - Triggers rebalance when portfolio drifts from target by this percentage
  - Lower threshold (1-5%): More frequent rebalancing, tighter control
  - Higher threshold (10-20%): Less frequent, lower transaction costs
  - Recommended: 5-10% for most investors

##### Min Position Size Input (Line 114-127)
- **Help Content**:
  - Minimum dollar amount for any single position
  - Prevents creating too many small positions
  - Consider your total portfolio size
  - Example: $500 minimum for $10,000 portfolio

##### Max Position Size Input (Line 128-141)
- **Help Content**:
  - Maximum dollar amount for any single position
  - Ensures diversification and risk management
  - Typically 10-20% of total portfolio
  - Example: $5,000 maximum for $25,000 portfolio

##### Portfolio Allocation Sliders (Line 144-175)
- **Stock Allocation Help**:
  - Percentage of portfolio to invest in stocks
  - Higher allocation = more growth potential, more risk
  - Age-based rule: 100 minus your age = stock percentage
  - Adjust based on risk tolerance
- **Cash Allocation Help**:
  - Percentage to keep in cash for opportunities
  - Provides stability and buying power
  - Higher cash = more defensive, lower returns
  - Automatically calculated as 100% minus stock allocation

#### Opportunity Agent Section (Lines 187-314)

##### Opportunity Agent Role (Line 195-197)
- **Help Content**:
  - Scans market for new investment opportunities
  - Only activates when portfolio is balanced (within threshold)
  - Identifies high-potential stocks not in your portfolio
  - Uses AI to find market inefficiencies

##### AI Provider Selection (Line 203-218)
- **Help Content**:
  - Choose which API configuration to use
  - Can use different provider for opportunity scanning
  - Consider cost vs quality for this specialized task

##### Market Data Time Range (Line 272-291)
- **Help Content**:
  - Historical data range for opportunity analysis
  - 1D: Very short-term momentum plays
  - 1W: Short-term technical opportunities
  - 1M: Swing trading opportunities
  - 3M-1Y: Longer-term value opportunities

### 2.4 Trading Tab Help Content (`/src/pages/settings/TradingTab.tsx`)

#### Getting Started Section (Line 76-95)
- **Help Content**: Step-by-step guide for Alpaca setup (already inline)

#### Trading Mode Toggle (Line 97-141)
- **Help Content**:
  - Paper Trading: Safe testing with simulated money
  - Live Trading: Real money at risk (requires subscription)
  - Always start with paper trading to test strategies
  - Switch to live only when consistently profitable

#### Trade Execution Settings Section (Lines 144-254)

##### Auto-Execute Trade Orders Switch (Line 152-189)
- **Help Content**:
  - When enabled, approved trades execute automatically
  - When disabled, you manually review each trade
  - Requires higher subscription tier
  - Recommended: Start with manual, switch to auto when comfortable

##### Risk Tolerance Level Dropdown (Line 194-232)
- **Help Content**:
  - Conservative: Smaller positions, preservation focus
  - Moderate: Balanced risk/reward (recommended for most)
  - Aggressive: Larger positions, growth focus
  - Affects position sizing and trade recommendations

##### Default Position Size Input (Line 235-252)
- **Help Content**:
  - Base dollar amount for each new position
  - Adjust based on account size and risk tolerance
  - Example: $1,000 for $25,000 account (4%)
  - Can be overridden for individual trades

#### Position Management Preferences Section (Lines 256-312)

##### Profit Target Slider (Line 267-284)
- **Help Content**:
  - AI considers selling when position gains this percentage
  - Not a hard rule - AI evaluates market conditions
  - Conservative: 10-15% | Moderate: 20-30% | Aggressive: 40%+
  - Adjust based on market volatility and strategy

##### Stop Loss Slider (Line 286-303)
- **Help Content**:
  - AI considers exiting when position loses this percentage
  - Protects capital from large losses
  - Conservative: 5-8% | Moderate: 10-12% | Aggressive: 15-20%
  - Balance with profit target for good risk/reward ratio

#### Paper Trading Credentials Section (Lines 314-393)

##### Paper API Key Input (Line 332-363)
- **Help Content**:
  - Get from Alpaca dashboard → Paper Trading → API Keys
  - Starts with "PK" for paper keys
  - Safe to test - no real money involved
  - Keep secure even though it's paper trading

##### Paper Secret Key Input (Line 366-390)
- **Help Content**:
  - Paired with API key for authentication
  - Get from same location as API key
  - Required for API access
  - Never share or expose in code

#### Live Trading Credentials Section (Lines 395-487)

##### Live API Key Input (Line 422-455)
- **Help Content**:
  - ⚠️ REAL MONEY - Use extreme caution
  - Get from Alpaca dashboard → Live Trading → API Keys
  - Different from paper trading keys
  - Store securely, rotate regularly

##### Live Secret Key Input (Line 458-484)
- **Help Content**:
  - ⚠️ Enables real money transactions
  - Critical security - never share
  - Use environment variables in production
  - Consider using separate account for automated trading

## Feature Help Integration

### 3.1 Rebalance Modal (`/src/components/rebalance/`)
**Note**: Components are shared between RebalanceModal and ScheduleRebalanceModal
**Reference**: Use same help content as RebalanceTab.tsx (lines 86-345)

#### Configuration Tab (`tabs/ConfigurationTab.tsx`)
- **Use Default Settings Checkbox** (Line 49-60)
  - Help: "Automatically uses settings from Settings > Rebalance tab"
  - When checked, all fields below become read-only
  
- **Min/Max Position Size** (Lines 65-99)
  - **Min Position Help** (from RebalanceTab line 121): 
    - "Minimum dollar amount per position. Prevents too many small positions. Example: $500 for a $10,000 portfolio"
  - **Max Position Help** (from RebalanceTab line 138):
    - "Maximum dollar amount per position. Ensures diversification by limiting exposure to any single stock. Typically 10-20% of portfolio. Example: $5,000 for a $25,000 portfolio"
  
- **Rebalance Threshold Slider** (Lines 102-146)
  - **Help** (from RebalanceTab line 97):
    - "Triggers rebalance when portfolio drifts by this percentage. Lower values (1-5%) result in frequent rebalancing, higher values (10-20%) result in less frequent rebalancing. Recommended: 5-10%"
  - **Skip Threshold Check option**:
    - "When enabled, all selected stocks will be analyzed for rebalance agent regardless of rebalance threshold"
  
- **Skip Opportunity Agent Checkbox** (Lines 149-178)
  - **Help** (from RebalanceTab line 215):
    - "Scans market for new investment opportunities when portfolio is balanced. Only activates when within rebalance threshold"
  - Note subscription requirements when disabled
  
- **Portfolio Allocation Sliders** (Lines 181-206)
  - **Stock Allocation** (from RebalanceTab line 165):
    - "Percentage to invest in stocks. Higher = more growth potential, more risk. Age-based rule: 100 minus your age = stock percentage"
  - **Cash Allocation** (from RebalanceTab line 184):
    - "Percentage to keep in cash for opportunities and stability. Higher cash = more defensive, lower returns"

#### Stock Selection Tab (`tabs/StockSelectionTab.tsx`)
**Shared by both RebalanceModal and ScheduleRebalanceModal**

- **Stock Selection Limit Alert** (Lines 48-66)
  - Already has informative text about subscription limits
  - No additional help needed (self-explanatory)
  
- **Portfolio Composition Visualization** (Lines 82-87)
  - Help: "Visual representation of your current portfolio allocation. Shows the percentage of each holding and cash position."
  
- **Include Watchlist Toggle** (Lines 89-150)
  - Label: "Include Watchlist Stocks"
  - Help: "Add stocks from your watchlist to the rebalancing analysis. These stocks will be considered for potential new positions even though you don't currently own them."
  - Shows available watchlist stocks as clickable badges
  
- **Stock Position Cards** (Lines 152-193)
  - Help: "Select which stocks to include in the rebalancing analysis. Click on a stock to toggle selection. Selected stocks will be analyzed for optimal allocation."
  - Shows current value and allocation percentage

### 3.2 Schedule Rebalance Modal (`/src/components/schedule-rebalance/`)
**Reuses components from RebalanceModal for consistency**

#### Schedule Tab (`tabs/ScheduleTab.tsx`)
- **Rebalance Frequency** (Lines 45-109)
  - Label: "Rebalance Frequency"
  - Help: "How often to automatically rebalance your portfolio. Daily for active management, Weekly for regular adjustments, Monthly for long-term investing. Your subscription determines available frequencies."
  - Shows "Every [X] [Day/Week/Month]" format
  
- **Day Selection for Weekly** (Lines 112-169)
  - Label: "On Which Day(s)"
  - Help: "Select which day(s) of the week to run the rebalance. With higher tier subscriptions, you can select multiple days for more frequent rebalancing."
  - Multi-select checkboxes with Day access, single dropdown without
  
- **Day of Month for Monthly** (Lines 172-222)
  - Label: "On Which Day(s) of the Month"
  - Help: "Select the day of the month for rebalancing. Day 31 will automatically adjust for shorter months (e.g., will run on Feb 28/29)."
  - Dropdown with 1st through 31st options
  
- **Time of Day Selection** (Line 224-228)
  - Help: "The time when the rebalance will execute. Choose a time when markets are closed to avoid mid-day volatility. Recommended: Before market open (9:30 AM ET) or after market close (4:00 PM ET)."
  
- **Timezone Selection** (Lines 230-234)
  - Help: "Your local timezone for scheduling. The rebalance will execute at the specified time in this timezone. Market hours are in Eastern Time (ET)."
  
- **Next Run Preview** (Lines 236-247)
  - Automatically shows next scheduled execution time
  - No help needed (informational display)

#### Configuration Tab
- Reuses `/src/components/rebalance/tabs/ConfigurationTab.tsx`

#### Stock Selection Tab  
- Reuses components from `/src/components/rebalance/`
- Same help content applies

### 3.3 Watchlist
- Adding stocks help
- Alert configuration
- Sorting and filtering options
- Export/import guidance

### 3.4 Performance Dashboard
- Metric definitions
- Chart interaction help
- Export options explanation
- Benchmark comparison guide

## UI/UX Design Principles

### Help Button Design
1. **Unobtrusive**: Small, subtle [?] icons that don't clutter the interface
2. **Consistent Placement**: Always positioned to the right of labels or titles
3. **Clear Affordance**: Users instantly recognize [?] as help
4. **Responsive**: Works on all screen sizes and devices
5. **Accessible**: Keyboard navigable, screen reader friendly

### Tooltip Content Guidelines
1. **Concise**: Primary message in 1-2 sentences
2. **Actionable**: Include specific steps or examples
3. **Progressive**: Link to detailed docs for complex topics
4. **Contextual**: Adapt content based on user's current state
5. **Visual**: Use icons, formatting, and structure for clarity

### Content Structure for Tooltips

#### Basic Tooltip
- Single line explanation (max 100 characters)
- Used for simple, self-explanatory fields

#### Standard Tooltip
- 2-3 sentence description
- One example or tip
- Used for most input fields

#### Rich Tooltip
- Title + description
- Example with code formatting
- 2-3 tips or best practices
- Warning if applicable
- Used for complex or critical settings

## Implementation Example

### Adding Help to Existing Components

#### Example: ProvidersTab.tsx Enhancement
```typescript
import { LabelWithHelp, HelpContent } from '@/components/ui/help-button';

// In the component:
<div className="space-y-4">
  <div>
    <LabelWithHelp
      label="Alpaca API Key"
      htmlFor="alpaca_api_key"
      required
      helpContent={
        <HelpContent
          title="Alpaca API Key"
          description="A unique key that allows TradingGoose to connect to your Alpaca trading account."
          example="PK1A2B3C4D5E6F7G8H9I0J"
          tips={[
            "Get your API key from the Alpaca dashboard",
            "Use paper trading keys for testing",
            "Keep your keys secure and never share them"
          ]}
          warning="Never commit API keys to version control"
        />
      }
    />
    <Input
      id="alpaca_api_key"
      type="password"
      value={apiKey}
      onChange={(e) => setApiKey(e.target.value)}
    />
  </div>
</div>
```

#### Example: TradingTab.tsx Enhancement
```typescript
<div className="space-y-4">
  <div>
    <LabelWithHelp
      label="Profit Target"
      htmlFor="profit_target"
      helpContent="Automatically consider selling when a position reaches this profit percentage. Default: 25%"
    />
    <Input
      id="profit_target"
      type="number"
      min="5"
      max="100"
      value={profitTarget}
      onChange={(e) => setProfitTarget(e.target.value)}
    />
  </div>
  
  <div>
    <LabelWithHelp
      label="Stop Loss"
      htmlFor="stop_loss"
      helpContent={
        <HelpContent
          description="Consider exiting positions that fall below this loss percentage to protect capital."
          example="10% means sell if position drops 10% from entry"
          tips={[
            "Start with 10-15% for volatile stocks",
            "Use tighter stops (5-8%) for stable stocks",
            "Consider market conditions when setting"
          ]}
          warning="Stop losses don't guarantee execution at the exact price"
        />
      }
    />
    <Input
      id="stop_loss"
      type="number"
      min="1"
      max="50"
      value={stopLoss}
      onChange={(e) => setStopLoss(e.target.value)}
    />
  </div>
</div>
```

### Help Content Library

Create a centralized library of help content:

```typescript
// src/lib/help-content.ts
export const helpContent = {
  providers: {
    alpacaApiKey: {
      title: "Alpaca API Key",
      description: "Connects TradingGoose to your Alpaca account",
      // ... full content
    },
    alpacaSecretKey: {
      // ...
    }
  },
  trading: {
    profitTarget: {
      // ...
    },
    stopLoss: {
      // ...
    }
  },
  // ... more categories
};
```

## Benefits of Tooltip Approach

### Advantages Over Separate Tutorial Pages
1. **Contextual Learning**: Help is available exactly where users need it
2. **No Context Switching**: Users stay in their workflow
3. **Always Current**: Help content updates with the interface
4. **Lower Maintenance**: No separate tutorial pages to maintain
5. **Better Discovery**: Users see help options immediately
6. **Progressive Disclosure**: Basic info on hover, detailed on click
7. **Reduced Cognitive Load**: Learn as you go, not all at once

### User Experience Benefits
- Immediate help without leaving the page
- Consistent help patterns across the app
- Mobile-friendly (tap to show tooltips)
- Accessibility built-in (keyboard navigation)
- No tutorial pages to get out of sync

## Implementation Priority

### Phase 1: Core Components (Day 1)
1. ✅ Create `HelpButton` component
2. ✅ Create `LabelWithHelp` component  
3. ✅ Create `HelpContent` component
4. [ ] Create help content library structure

### Phase 2: Settings Integration (Days 2-3)
1. [ ] Add help buttons to ProvidersTab
2. [ ] Add help buttons to AgentsTab
3. [ ] Add help buttons to RebalanceTab
4. [ ] Add help buttons to TradingTab
5. [ ] Test tooltip positioning and content

### Phase 3: Feature Integration (Days 4-5)
1. [ ] Add help to RebalanceModal
2. [ ] Add help to ScheduleModal
3. [ ] Add help to Watchlist
4. [ ] Add help to Performance charts
5. [ ] Add help to navigation elements

### Phase 4: Content Creation (Days 6-7)
1. [ ] Write all help content
2. [ ] Add examples and tips
3. [ ] Include warnings where needed
4. [ ] Review for consistency
5. [ ] User testing and feedback

### Phase 5: Enhancement (Week 2)
1. [ ] Add tutorial mode toggle
2. [ ] Track which helps were viewed
3. [ ] Add "first time user" guided flow
4. [ ] Create onboarding checklist
5. [ ] Add keyboard shortcuts for help

## Components to Update - Detailed Field List

### ProvidersTab.tsx Fields Requiring Help Buttons
1. **Default AI Provider Section**
   - [ ] Section header (explain default provider concept)
   - [ ] Nickname field
   - [ ] Provider dropdown
   - [ ] API Key field
   - [ ] Default Model dropdown
   - [ ] Custom Model input (when "custom" selected)

2. **Additional AI Providers Section**
   - [ ] Section header (explain multiple API keys)
   - [ ] Each provider card:
     - [ ] Nickname field
     - [ ] Provider dropdown
     - [ ] API Key field
   - [ ] "Add Additional Provider" button

### AgentsTab.tsx Fields Requiring Help Buttons
1. **Analysis Agent Section**
   - [ ] Section header
   - [ ] AI Provider dropdown
   - [ ] Model dropdown
   - [ ] Analysis Optimization dropdown
   - [ ] Historical Data Range dropdown
   - [ ] Number of Search Sources slider
   - [ ] Max Tokens slider

2. **Research Agent Section**
   - [ ] Section header
   - [ ] AI Provider dropdown
   - [ ] Model dropdown
   - [ ] Number of Debate Rounds slider
   - [ ] Max Tokens slider

3. **Trading Decision Agent Section**
   - [ ] Section header
   - [ ] AI Provider dropdown
   - [ ] Model dropdown
   - [ ] Max Tokens slider

4. **Risk Management Agent Section**
   - [ ] Section header
   - [ ] AI Provider dropdown
   - [ ] Model dropdown
   - [ ] Max Tokens slider

5. **Portfolio Manager Section**
   - [ ] Section header
   - [ ] AI Provider dropdown
   - [ ] Model dropdown
   - [ ] Max Tokens slider

### RebalanceTab.tsx Fields Requiring Help Buttons
1. **Rebalance Settings Section**
   - [ ] Section header
   - [ ] Rebalance Threshold slider
   - [ ] Min Position Size input
   - [ ] Max Position Size input
   - [ ] Stock Allocation slider
   - [ ] Cash Allocation display

2. **Opportunity Agent Section**
   - [ ] Section header (with role explanation)
   - [ ] AI Provider dropdown
   - [ ] Model dropdown
   - [ ] Custom Model input (when "custom" selected)
   - [ ] Market Data Time Range dropdown
   - [ ] Max Tokens slider

### TradingTab.tsx Fields Requiring Help Buttons
1. **Trading Mode Section**
   - [ ] Trading Mode toggle (Paper vs Live)
   
2. **Trade Execution Settings Section**
   - [ ] Section header
   - [ ] Auto-Execute Trade Orders switch
   - [ ] Risk Tolerance Level dropdown
   - [ ] Default Position Size input

3. **Position Management Preferences Section**
   - [ ] Section header
   - [ ] Profit Target slider
   - [ ] Stop Loss slider

4. **Paper Trading Credentials Section**
   - [ ] Section header
   - [ ] Paper API Key input
   - [ ] Paper Secret Key input

5. **Live Trading Credentials Section**
   - [ ] Section header
   - [ ] Live API Key input
   - [ ] Live Secret Key input

### Feature Components - Rebalance Modal Family
**Shared Components (update once, used by both modals):**
- [ ] `/src/components/rebalance/tabs/ConfigurationTab.tsx`
  - [ ] Use Default Settings checkbox help
  - [ ] Min/Max Position Size inputs help
  - [ ] Rebalance Threshold slider help
  - [ ] Skip Threshold Check checkbox help
  - [ ] Skip Opportunity Agent checkbox help
  - [ ] Portfolio Allocation sliders help
- [ ] `/src/components/rebalance/tabs/StockSelectionTab.tsx`
  - [ ] Include Watchlist toggle help
  - [ ] Stock selection limit alert (already has info)
  - [ ] Portfolio composition visualization help
- [ ] `/src/components/rebalance/components/StockPositionCard.tsx`
  - [ ] Individual stock card selection help
- [ ] `/src/components/rebalance/components/PortfolioComposition.tsx`
  - [ ] Portfolio visualization help

**Schedule-Specific Components:**
- [ ] `/src/components/schedule-rebalance/tabs/ScheduleTab.tsx`
  - [ ] Rebalance Frequency inputs help
  - [ ] Day Selection (weekly) help
  - [ ] Day of Month (monthly) help
  - [ ] Time of Day selector help
  - [ ] Timezone selector help

**Other Feature Components:**
- [ ] `/src/components/StandaloneWatchlist.tsx`
- [ ] `/src/components/PerformanceChart.tsx`

### Form Components
- [ ] `/src/components/ui/input.tsx` (optional enhancement)
- [ ] `/src/components/ui/select.tsx` (optional enhancement)
- [ ] `/src/components/ui/switch.tsx` (optional enhancement)

## Help Content Structure

```typescript
// src/lib/help-content/index.ts
export * from './providers';
export * from './agents';
export * from './trading';
export * from './rebalance';
export * from './watchlist';
export * from './performance';

// src/lib/help-content/providers.ts
export const providersHelp = {
  alpacaApiKey: {
    title: "Alpaca API Key",
    description: "Your unique key to connect to Alpaca Markets",
    example: "PK1A2B3C4D5E6F7G8H9I0J",
    tips: [
      "Get from Alpaca dashboard → API Keys",
      "Use paper keys for testing",
      "Regenerate if compromised"
    ],
    warning: "Keep secret, never share publicly"
  },
  // ... more fields
};
```

## Next Steps

### Immediate Actions
1. ✅ Created HelpButton component with tooltip integration
2. [ ] Create help content library files
3. [ ] Add help buttons to ProvidersTab
4. [ ] Add help buttons to TradingTab (with profit/stop loss)
5. [ ] Test and refine tooltip positioning

### Follow-up Tasks
1. [ ] Integrate help buttons into remaining settings tabs
2. [ ] Add help to modal components
3. [ ] Create onboarding flow for new users
4. [ ] Add analytics to track help usage
5. [ ] Gather user feedback on help content

## Success Metrics
- Reduced support tickets for basic questions
- Increased feature adoption rate
- Improved time-to-first-trade for new users
- Higher user satisfaction scores
- Fewer configuration errors

## Technical Notes

### Tooltip Behavior
- Delay: 200ms default (configurable)
- Position: Auto-adjust to stay in viewport
- Mobile: Tap to show, tap outside to dismiss
- Keyboard: Tab to focus, Enter/Space to show
- Screen readers: Full ARIA support

### Content Management
- Centralized in `/src/lib/help-content/`
- Modular by feature area
- TypeScript typed for consistency
- Easy to update without touching components
- Supports i18n for future localization

### Performance Considerations
- Lazy load help content
- No impact on initial bundle size
- Tooltips render on-demand
- Minimal DOM overhead
- CSS-based animations

## Summary

This updated tutorial system uses inline help tooltips instead of separate tutorial pages, providing:
- **Better UX**: Help exactly where needed
- **Lower maintenance**: No separate pages to update
- **Consistent patterns**: Same help component everywhere
- **Progressive disclosure**: From basic to detailed
- **Accessibility**: Full keyboard and screen reader support

The implementation focuses on adding [?] help buttons next to all input fields and settings, with rich tooltips that provide context-sensitive help without disrupting the user's workflow.