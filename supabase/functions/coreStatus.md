# Core Status Documentation

This document defines the standardized status values used throughout the TradingGoose system.

## Analysis Core States
`'pending'`, `'running'`, `'completed'`, `'error'`, `'cancelled'`

- **pending** - Analysis created but not yet started
- **running** - Analysis agents are actively executing
- **completed** - Analysis finished successfully (may have created trade orders with pending status)
- **error** - Analysis failed due to technical error
- **cancelled** - Analysis cancelled by user

## Rebalance Core States
`'pending'`, `'running'`, `'completed'`, `'error'`, `'cancelled'`

- **pending** - Rebalance request created but not yet started
- **running** - Rebalance workflow is actively executing (consolidates: initializing, opportunity_evaluation, analyzing, executing)
- **completed** - Rebalance finished successfully (may have created trade orders with pending status)
- **error** - Rebalance failed due to technical error
- **cancelled** - Rebalance cancelled by user

## Agent Core States
`'pending'`, `'running'`, `'completed'`, `'error'`

- **pending** - Agent task assigned but not yet started
- **running** - Agent is actively processing
- **completed** - Agent finished successfully
- **error** - Agent failed to complete task

## Trade Order Core States (System Status)
`'pending'`, `'approved'`, `'rejected'`

- **pending** - Trade order created by portfolio manager, awaiting user decision
- **approved** - User approved the trade order, will be sent to broker
- **rejected** - User rejected the trade order

### Alpaca Order Status (Stored in Metadata Only)
Alpaca broker maintains its own status values stored in `metadata.alpaca_order.status`:
`'filled'`, `'partial_filled'`, `'canceled'`, `'placed'`, `'failed'`, `'rejected'`, `'expired'`, etc.

**Important**: The main trade order status field only uses the 3 system states above. Alpaca status is stored separately in metadata and fetched real-time by the frontend.

## Implementation Files
- **Unified Interface**: `_shared/statusTypes.ts` (re-exports all status types and utilities)
- **Analysis Status**: `_shared/status/analysisStatus.ts`
- **Rebalance Status**: `_shared/status/rebalanceStatus.ts`
- **Trade Order Status**: `_shared/status/tradeOrderStatus.ts`
- **Display Helpers**: `_shared/status/displayHelpers.ts`

**Note**: Always import from `_shared/statusTypes.ts` for the unified interface. Individual modules are for internal organization only.