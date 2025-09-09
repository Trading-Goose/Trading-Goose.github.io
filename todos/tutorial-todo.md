# TradingGoose Tutorial System Plan

## Overview
Create a comprehensive tutorial system to guide users through all features of TradingGoose, from initial setup to advanced trading strategies.

## Tutorial Structure

### 1. Main Tutorial Hub (`/tutorial`)
- **Purpose**: Central navigation for all tutorials
- **Features**:
  - Tutorial categories with icons
  - Progress tracking
  - Quick start guide
  - Search functionality
  - Recommended learning path

### 2. Settings Tutorials

#### 2.1 Providers Tutorial (`/tutorial/settings/providers`)
- **Content**:
  - Alpaca API setup guide
  - API key generation walkthrough
  - Paper trading vs live trading
  - Connection testing
  - Security best practices
  - Troubleshooting common issues
- **Interactive Elements**:
  - Step-by-step screenshots
  - Copy-paste code blocks
  - Video walkthrough (optional)
  - Connection status checker

#### 2.2 Agents Tutorial (`/tutorial/settings/agents`)
- **Content**:
  - Understanding AI agents
  - Agent types and roles
  - Configuring agent parameters
  - Model selection (GPT-4, Claude, etc.)
  - Cost optimization tips
  - Agent performance metrics
- **Interactive Elements**:
  - Agent comparison table
  - Interactive agent workflow diagram
  - Sample agent outputs
  - Cost calculator

#### 2.3 Rebalance Settings Tutorial (`/tutorial/settings/rebalance`)
- **Content**:
  - Portfolio rebalancing concepts
  - Setting rebalance thresholds
  - Time-based vs threshold-based rebalancing
  - Risk parameters
  - Asset allocation strategies
  - Tax considerations
- **Interactive Elements**:
  - Rebalance simulator
  - Before/after portfolio visualizations
  - Strategy comparison tool

#### 2.4 Trading Settings Tutorial (`/tutorial/settings/trading`)
- **Content**:
  - Order types (market, limit, stop)
  - Position sizing
  - Risk management settings
  - Profit targets and stop losses
  - Trading hours configuration
  - Slippage and fees
- **Interactive Elements**:
  - Risk calculator
  - Order type examples
  - P&L simulator

### 3. Feature Tutorials

#### 3.1 Rebalance Tutorial (`/tutorial/rebalance`)
- **Content**:
  - Initiating a rebalance
  - Understanding the analysis workflow
  - Reading rebalance recommendations
  - Approving and executing trades
  - Monitoring rebalance progress
  - Historical rebalance review
- **Interactive Elements**:
  - Live demo mode
  - Sample rebalance walkthrough
  - Decision tree diagram
  - Video tutorial

#### 3.2 Schedule Tutorial (`/tutorial/schedule`)
- **Content**:
  - Creating scheduled rebalances
  - Cron expressions explained
  - Time zone considerations
  - Managing multiple schedules
  - Pause/resume schedules
  - Schedule history and logs
- **Interactive Elements**:
  - Cron builder tool
  - Calendar view
  - Schedule simulator
  - Notification settings

#### 3.3 Watchlist Tutorial (`/tutorial/watchlist`)
- **Content**:
  - Creating and managing watchlists
  - Adding/removing stocks
  - Watchlist categories
  - Real-time price updates
  - Setting alerts
  - Bulk operations
  - Import/export watchlists
- **Interactive Elements**:
  - Drag-and-drop interface demo
  - Stock screener integration
  - Alert configuration wizard
  - Sample watchlists

#### 3.4 Performance Tutorial (`/tutorial/performance`)
- **Content**:
  - Understanding performance metrics
  - ROI calculation
  - Sharpe ratio explained
  - Drawdown analysis
  - Benchmark comparisons
  - Tax reporting features
  - Exporting reports
- **Interactive Elements**:
  - Interactive charts
  - Metric calculators
  - Report customization tool
  - Performance attribution analysis

## Implementation Details

### Component Reuse Strategy
**Core Principle**: Reuse existing components from the actual application with tutorial overlays and annotations.

#### Architecture
1. **Live Component Display**: Show the actual working component at the top
2. **Field Highlighting**: Frame important fields with colored borders
3. **Learn More Buttons**: Add small info buttons next to each field
4. **Smooth Scrolling**: Click to jump to detailed explanations below
5. **Field Descriptions**: Card-based detailed explanations for each field

### UI/UX Design Principles
1. **Progressive Disclosure**: Start simple, reveal complexity gradually
2. **Interactive Learning**: Learn by using the actual interface
3. **Visual Aids**: Highlight fields, arrows, and annotations
4. **Mobile Responsive**: Full functionality on all devices
5. **Accessibility**: WCAG 2.1 AA compliance

### Common Components

#### Tutorial Wrapper Component
```typescript
interface TutorialWrapperProps {
  component: React.ComponentType; // The actual component to display
  fields: FieldAnnotation[];      // Field annotations
  title: string;
  description: string;
  children?: React.ReactNode;     // Additional tutorial content
}

interface FieldAnnotation {
  id: string;                     // Field identifier
  selector: string;                // CSS selector or element ID
  title: string;                   // Field name
  description: string;             // Short description
  detailedContent: React.ReactNode; // Full explanation
  highlightColor?: string;         // Border color for highlighting
  position?: 'top' | 'bottom' | 'left' | 'right'; // Tooltip position
}
```

#### Field Highlighter Component
```typescript
interface FieldHighlighterProps {
  fieldId: string;
  isActive: boolean;
  color: string;
  children: React.ReactNode;
  onLearnMore: () => void;
}
```

#### Tutorial Layout Component
```typescript
interface TutorialLayoutProps {
  title: string;
  description: string;
  estimatedTime: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites?: string[];
  liveComponent: React.ReactNode;  // The actual component with annotations
  fieldDescriptions: FieldDescription[]; // Detailed field explanations
}
```

#### Field Description Card
```typescript
interface FieldDescriptionProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  example?: string;
  tips?: string[];
  warnings?: string[];
  relatedFields?: string[];
}
```

### Visual Design System

#### Highlighting System
```css
/* Field highlighting classes */
.tutorial-field-highlight {
  position: relative;
  border: 2px dashed var(--highlight-color);
  border-radius: 4px;
  transition: all 0.3s ease;
}

.tutorial-field-highlight:hover {
  border-style: solid;
  box-shadow: 0 0 10px rgba(var(--highlight-color-rgb), 0.3);
}

.tutorial-learn-more-btn {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
}
```

#### Color Coding
- **Required Fields**: Red border (#ef4444)
- **Optional Fields**: Blue border (#3b82f6)
- **Advanced Fields**: Purple border (#8b5cf6)
- **Security Fields**: Orange border (#f97316)
- **Recommended Fields**: Green border (#10b981)

### Implementation Example

#### Provider Tutorial Page Structure
```typescript
// /tutorial/settings/providers
<TutorialLayout>
  {/* Top Section: Live Component with Annotations */}
  <div className="tutorial-live-section">
    <TutorialWrapper
      component={ProvidersTab}
      fields={[
        {
          id: 'alpaca-api-key',
          selector: '#alpaca_api_key',
          title: 'Alpaca API Key',
          highlightColor: '#ef4444', // Red for required
          description: 'Your unique Alpaca API key',
          detailedContent: <AlpacaKeyExplanation />
        },
        {
          id: 'paper-trading',
          selector: '#paper_trading_toggle',
          title: 'Paper Trading Mode',
          highlightColor: '#10b981', // Green for recommended
          description: 'Test strategies without real money',
          detailedContent: <PaperTradingExplanation />
        }
      ]}
    />
  </div>

  {/* Bottom Section: Detailed Field Descriptions */}
  <div className="tutorial-details-section">
    <h2>Field Guide</h2>
    
    <FieldDescriptionCard
      id="alpaca-api-key"
      icon={<KeyIcon />}
      title="Alpaca API Key"
      description="Your Alpaca API key is a unique identifier that allows TradingGoose to connect to your Alpaca account."
      example="PK1A2B3C4D5E6F7G8H9I0J"
      tips={[
        "Never share your API key publicly",
        "Use paper trading keys for testing",
        "Regenerate if compromised"
      ]}
      warnings={[
        "Keep your API key secure",
        "Don't commit to version control"
      ]}
      relatedFields={["alpaca-secret-key", "paper-trading"]
    />

    <FieldDescriptionCard
      id="paper-trading"
      // ... more field descriptions
    />
  </div>
</TutorialLayout>
```

### Interactive Features

#### Learn More Flow
1. User hovers over highlighted field → Border becomes solid
2. User clicks "i" button → Smooth scroll to detailed description
3. Related field highlights when description is viewed
4. Progress tracked as fields are explored

#### Tutorial Mode Toggle
```typescript
interface TutorialModeProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  completedFields: string[];
  totalFields: number;
}
```

#### Progress Tracking
- Track which fields user has viewed
- Show completion percentage
- Suggest unexplored fields
- Save progress in localStorage

### Benefits of This Approach
1. **No Duplication**: Reuses actual components
2. **Always Up-to-Date**: Changes to components automatically reflected
3. **Interactive Learning**: Users learn with real interface
4. **Context-Aware**: See how fields work together
5. **Progressive**: Start with basic fields, reveal advanced options

### Navigation Structure
```
/tutorial
  ├── index (Hub)
  ├── getting-started
  ├── settings/
  │   ├── providers
  │   ├── agents
  │   ├── rebalance
  │   └── trading
  ├── features/
  │   ├── rebalance
  │   ├── schedule
  │   ├── watchlist
  │   └── performance
  └── advanced/
      ├── strategies
      ├── automation
      └── api-integration
```

### Content Guidelines

#### Each Tutorial Should Include:
1. **Overview** (What you'll learn)
2. **Prerequisites** (What you need to know)
3. **Step-by-Step Instructions**
4. **Visual Aids** (Screenshots, diagrams)
5. **Pro Tips** (Best practices)
6. **Common Pitfalls** (What to avoid)
7. **Troubleshooting** (FAQs)
8. **Next Steps** (Related tutorials)

#### Writing Style:
- Clear and concise
- Active voice
- Numbered steps
- Highlight important warnings
- Include real-world examples
- Avoid jargon (or explain it)

### Technical Implementation

#### State Management
- Tutorial progress tracking
- User preferences (playback speed, theme)
- Bookmark system
- Notes/annotations

#### Analytics
- Track tutorial completion rates
- Identify drop-off points
- Measure time spent
- Collect feedback scores
- A/B test different approaches

#### Search Functionality
- Full-text search across tutorials
- Filter by category, difficulty, duration
- Smart suggestions
- Recently viewed
- Popular tutorials

### Phase 1 MVP Features
1. Basic tutorial pages with static content
2. Simple navigation between tutorials
3. Mobile-responsive design
4. Basic progress tracking
5. Essential screenshots and diagrams

### Phase 2 Enhancements
1. Interactive demos
2. Video tutorials
3. Progress badges
4. Search functionality
5. User feedback system

### Phase 3 Advanced Features
1. AI-powered tutorial assistant
2. Personalized learning paths
3. Community contributions
4. Multi-language support
5. Offline mode

## Success Metrics
- Tutorial completion rate > 70%
- Average user rating > 4.5/5
- Support ticket reduction by 40%
- Time to first trade reduced by 50%
- User retention improvement by 30%

## Content Creation Timeline
- Week 1: Create tutorial hub and navigation
- Week 2: Settings tutorials (all 4)
- Week 3: Feature tutorials (rebalance, schedule)
- Week 4: Feature tutorials (watchlist, performance)
- Week 5: Testing and refinement
- Week 6: Launch and gather feedback

## Resources Needed
- Technical writer
- UI/UX designer
- Frontend developer
- Video creator (optional)
- QA tester
- User feedback group

## Open Questions
1. Should we include video tutorials in MVP?
2. How to handle updates when features change?
3. Should tutorials be gated or fully open?
4. Integration with in-app help system?
5. Gamification elements (badges, points)?
6. Community-contributed tutorials?

## Specific Page Implementations

### Tutorial Settings Pages

#### `/tutorial/settings/providers`
- **Component**: `ProvidersTab` from `/src/pages/settings/ProvidersTab.tsx`
- **Fields to Highlight**:
  - Alpaca API Key (required)
  - Alpaca Secret Key (required)
  - Paper Trading Toggle (recommended)
  - OpenAI API Key (optional)
  - Anthropic API Key (optional)

#### `/tutorial/settings/agents`
- **Component**: `AgentsTab` from `/src/pages/settings/AgentsTab.tsx`
- **Fields to Highlight**:
  - Model Selection Dropdowns
  - Temperature Settings
  - Max Tokens Settings
  - Agent Enable/Disable Toggles
  - Cost Estimation Display

#### `/tutorial/settings/rebalance`
- **Component**: `RebalanceTab` from `/src/pages/settings/RebalanceTab.tsx`
- **Fields to Highlight**:
  - Rebalance Threshold
  - Minimum Trade Amount
  - Maximum Position Size
  - Risk Tolerance Slider
  - Asset Allocation Settings

#### `/tutorial/settings/trading`
- **Component**: `TradingTab` from `/src/pages/settings/TradingTab.tsx`
- **Fields to Highlight**:
  - Order Type Selection
  - Profit Target Percentage
  - Stop Loss Percentage
  - Trading Hours Settings
  - Slippage Tolerance

### Tutorial Feature Pages

#### `/tutorial/rebalance`
- **Component**: `RebalanceModal` from `/src/components/rebalance/RebalanceModal.tsx`
- **Interactive Elements**:
  - Stock Selection Interface
  - Portfolio Composition View
  - Workflow Explanation
  - Configuration Summary
  - Execute Button

#### `/tutorial/schedule`
- **Component**: `ScheduleRebalanceModal` from `/src/components/schedule-rebalance/ScheduleRebalanceModal.tsx`
- **Interactive Elements**:
  - Schedule Tab (cron expression)
  - Time Selector
  - Timezone Selector
  - Stock Selection Tab
  - Settings Tab

#### `/tutorial/watchlist`
- **Component**: `StandaloneWatchlist` from `/src/components/StandaloneWatchlist.tsx`
- **Interactive Elements**:
  - Add Stock Button
  - Stock Ticker Autocomplete
  - Remove Stock Actions
  - Price Display
  - Change Percentage

#### `/tutorial/performance`
- **Component**: `PerformanceChart` from `/src/components/PerformanceChart.tsx`
- **Interactive Elements**:
  - Time Period Selector
  - Chart Type Toggle
  - Benchmark Comparison
  - Export Options
  - Metric Cards

## Implementation Order

### Phase 1: Core Components (Week 1)
1. [ ] Create `TutorialWrapper` component
2. [ ] Create `FieldHighlighter` component
3. [ ] Create `FieldDescriptionCard` component
4. [ ] Create `TutorialLayout` component
5. [ ] Set up routing for tutorial pages

### Phase 2: Settings Tutorials (Week 2)
1. [ ] Implement `/tutorial/settings/providers`
2. [ ] Implement `/tutorial/settings/agents`
3. [ ] Implement `/tutorial/settings/rebalance`
4. [ ] Implement `/tutorial/settings/trading`
5. [ ] Add field descriptions and examples

### Phase 3: Feature Tutorials (Week 3)
1. [ ] Implement `/tutorial/rebalance`
2. [ ] Implement `/tutorial/schedule`
3. [ ] Implement `/tutorial/watchlist`
4. [ ] Implement `/tutorial/performance`
5. [ ] Add interactive demos

### Phase 4: Polish & Testing (Week 4)
1. [ ] Add progress tracking
2. [ ] Implement search functionality
3. [ ] Mobile responsiveness testing
4. [ ] User testing with beta group
5. [ ] Documentation and help text

## Next Steps
1. [ ] Review and approve tutorial plan with component reuse strategy
2. [ ] Create TutorialWrapper component
3. [ ] Create FieldHighlighter component
4. [ ] Implement first tutorial page (providers)
5. [ ] Test highlighting and annotation system
6. [ ] Get user feedback on approach
7. [ ] Iterate and improve
8. [ ] Roll out remaining tutorials
9. [ ] Add progress tracking
10. [ ] Launch tutorial system

## Notes
- Consider using a CMS for easier content updates
- Ensure tutorials work offline where possible
- Add breadcrumbs for easy navigation
- Include estimated reading time
- Make tutorials printable/downloadable as PDF
- Consider adding interactive quizzes
- Link to relevant documentation
- Include troubleshooting sections
- Add "Was this helpful?" feedback
- Consider tutorial versioning for different app versions