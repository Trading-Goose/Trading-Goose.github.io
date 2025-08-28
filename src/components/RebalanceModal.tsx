// Re-export the refactored RebalanceModal from the new modular location
// This maintains backward compatibility with existing imports
export { default } from './rebalance/RebalanceModal';
export type { RebalancePosition, RebalanceConfig, RebalanceModalProps } from './rebalance/types';