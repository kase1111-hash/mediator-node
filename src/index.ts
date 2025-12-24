/**
 * NatLangChain Mediator Node
 *
 * A lightweight, dedicated node that:
 * - Connects to one or more NatLangChain instances
 * - Runs LLM mediation (matching, negotiation, closure proposals)
 * - Performs "mining" by submitting successful mediation blocks
 * - Earns facilitation fees when closures are accepted
 * - Requires no buying/selling logic — pure mediation service
 */

export { MediatorNode } from './MediatorNode';
export { ConfigLoader } from './config/ConfigLoader';
export { IntentIngester } from './ingestion/IntentIngester';
export { VectorDatabase } from './mapping/VectorDatabase';
export { LLMProvider } from './llm/LLMProvider';
export { SettlementManager } from './settlement/SettlementManager';
export { ReputationTracker } from './reputation/ReputationTracker';
export { StakeManager } from './consensus/StakeManager';
export { AuthorityManager } from './consensus/AuthorityManager';
export { ChainClient } from './chain';

export * from './types';
export * from './chain';
