/**
 * Test Utilities for Mediator Node
 *
 * This file provides common utilities, helpers, and factory functions
 * for use across all test files.
 */

import { Intent, ProposedSettlement, MediatorConfig } from '../../src/types';
import { nanoid } from 'nanoid';

/**
 * Generate a random intent ID
 */
export function generateIntentId(): string {
  return `intent_${nanoid(10)}`;
}

/**
 * Generate a random settlement ID
 */
export function generateSettlementId(): string {
  return `settlement_${nanoid(10)}`;
}

/**
 * Create a mock Intent object with sensible defaults
 */
export function createMockIntent(overrides: Partial<Intent> = {}): Intent {
  const id = generateIntentId();
  return {
    hash: overrides.hash || id,
    author: overrides.author || `author_${nanoid(6)}`,
    prose: overrides.prose || 'I need help with a task',
    timestamp: overrides.timestamp || Date.now(),
    status: overrides.status || 'pending',
    offeredFee: overrides.offeredFee || 1,
    constraints: overrides.constraints || [],
    desires: overrides.desires || [],
    ...overrides,
  };
}

/**
 * Create a mock ProposedSettlement object
 */
export function createMockProposedSettlement(
  overrides: Partial<ProposedSettlement> = {}
): ProposedSettlement {
  const defaultTerms = {
    price: 100,
    deliverables: ['Mock deliverable'],
    timelines: '1 week',
  };

  return {
    id: overrides.id || generateSettlementId(),
    intentHashA: overrides.intentHashA || generateIntentId(),
    intentHashB: overrides.intentHashB || generateIntentId(),
    reasoningTrace: overrides.reasoningTrace || 'These intents align well',
    proposedTerms: overrides.proposedTerms || defaultTerms,
    facilitationFee: overrides.facilitationFee || 1,
    facilitationFeePercent: overrides.facilitationFeePercent || 1.0,
    mediatorId: overrides.mediatorId || `mediator_${nanoid(6)}`,
    modelIntegrityHash: overrides.modelIntegrityHash || `hash_${nanoid(10)}`,
    timestamp: overrides.timestamp || Date.now(),
    acceptanceDeadline: overrides.acceptanceDeadline || Date.now() + 72 * 60 * 60 * 1000,
    status: overrides.status || 'proposed',
    stakeReference: overrides.stakeReference,
    authoritySignature: overrides.authoritySignature,
    ...overrides,
  };
}

/**
 * Create a mock MediatorConfig object
 */
export function createMockConfig(overrides: Partial<MediatorConfig> = {}): MediatorConfig {
  return {
    chainEndpoint: overrides.chainEndpoint || 'http://localhost:3000',
    chainId: overrides.chainId || 'test-chain',
    consensusMode: overrides.consensusMode || 'permissionless',
    llmProvider: overrides.llmProvider || 'anthropic',
    llmApiKey: overrides.llmApiKey || 'test-api-key',
    llmModel: overrides.llmModel || 'claude-3-5-sonnet-20241022',
    mediatorPrivateKey: overrides.mediatorPrivateKey || 'test-private-key',
    mediatorPublicKey: overrides.mediatorPublicKey || 'test-public-key',
    facilitationFeePercent: overrides.facilitationFeePercent || 1.0,
    vectorDbPath: overrides.vectorDbPath || '/tmp/test-vector-db',
    vectorDimensions: overrides.vectorDimensions || 1024,
    maxIntentsCache: overrides.maxIntentsCache || 100,
    acceptanceWindowHours: overrides.acceptanceWindowHours || 72,
    logLevel: overrides.logLevel || 'info',
    ...overrides,
  };
}

/**
 * Create an array of mock intents
 */
export function createMockIntents(count: number, overrides: Partial<Intent> = {}): Intent[] {
  return Array.from({ length: count }, (_, i) =>
    createMockIntent({
      prose: `Intent ${i}: ${overrides.prose || 'default prose'}`,
      ...overrides
    })
  );
}

/**
 * Sleep helper for async tests
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock embedding vector
 */
export function createMockEmbedding(dimension: number = 1024): number[] {
  return Array.from({ length: dimension }, () => Math.random());
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || 'Value is null or undefined');
  }
}

/**
 * Mock logger for tests (suppresses output)
 */
export const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

/**
 * Mock chain API client for testing
 */
export class MockChainApiClient {
  private intents: Intent[] = [];
  private settlements: ProposedSettlement[] = [];
  private entries: any[] = [];

  async getPendingIntents(): Promise<Intent[]> {
    return this.intents.filter(i => i.status === 'pending');
  }

  async getOpenIntents(): Promise<Intent[]> {
    return this.intents.filter(i => i.status === 'pending');
  }

  async submitEntry(entry: any): Promise<{ success: boolean; entryId: string }> {
    this.entries.push(entry);
    return { success: true, entryId: `entry_${nanoid(10)}` };
  }

  async getSettlementStatus(settlementId: string): Promise<any> {
    const settlement = this.settlements.find(s => s.id === settlementId);
    return settlement ? { status: settlement.status } : null;
  }

  // Test helpers
  addIntent(intent: Intent): void {
    this.intents.push(intent);
  }

  addIntents(intents: Intent[]): void {
    this.intents.push(...intents);
  }

  addSettlement(settlement: ProposedSettlement): void {
    this.settlements.push(settlement);
  }

  clearAll(): void {
    this.intents = [];
    this.settlements = [];
    this.entries = [];
  }

  getSubmittedEntries(): any[] {
    return this.entries;
  }
}

/**
 * Mock LLM provider for testing
 */
export class MockLLMProvider {
  private mockEmbeddings: Map<string, number[]> = new Map();
  private mockResponses: string[] = [];
  private responseIndex = 0;

  async generateEmbedding(text: string): Promise<number[]> {
    if (this.mockEmbeddings.has(text)) {
      return this.mockEmbeddings.get(text)!;
    }
    return createMockEmbedding();
  }

  async generateCompletion(prompt: string): Promise<string> {
    if (this.responseIndex < this.mockResponses.length) {
      return this.mockResponses[this.responseIndex++];
    }
    return 'Mock LLM response';
  }

  // Test helpers
  setEmbedding(text: string, embedding: number[]): void {
    this.mockEmbeddings.set(text, embedding);
  }

  setResponses(responses: string[]): void {
    this.mockResponses = responses;
    this.responseIndex = 0;
  }

  resetResponses(): void {
    this.mockResponses = [];
    this.responseIndex = 0;
  }
}
