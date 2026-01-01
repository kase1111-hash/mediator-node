/**
 * Chain Client Module
 *
 * Provides a unified interface for mediator-node to communicate with NatLangChain.
 */

export { ChainClient, ChainClientConfig, SubmitEntryOptions, SearchOptions } from './ChainClient';
export {
  NatLangChainEntry,
  NatLangChainContract,
  NatLangChainBlock,
  entryToIntent,
  intentToEntry,
  settlementToEntry,
  settlementToContractProposal,
  contractToSettlement,
  challengeToEntry,
  burnToEntry,
  parseIntentsFromResponse,
} from './transformers';

// Re-export circuit breaker types for monitoring
export {
  CircuitBreaker,
  CircuitBreakerStats,
  CircuitOpenError,
  CircuitState,
} from '../utils/circuit-breaker';
