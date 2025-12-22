/**
 * Integration tests for Settlement Success Burns
 * Demonstrates automatic burn execution when settlements close successfully
 */

import axios from 'axios';
import { MediatorNode } from '../../src/MediatorNode';
import { MediatorConfig, ProposedSettlement, NegotiationResult } from '../../src/types';
import { VALID_INTENT_1, VALID_INTENT_2 } from '../fixtures/intents';

// Mock dependencies
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock hnswlib-node
jest.mock('hnswlib-node');

// Mock crypto utilities
jest.mock('../../src/utils/crypto', () => ({
  generateModelIntegrityHash: (model: string, prompt: string) => `hash_${model}_${prompt.length}`,
  generateSignature: (data: string, key: string) => `sig_${key}_${data.length}`,
  calculateReputationWeight: (sc: number, fc: number, uca: number, ff: number) => {
    return (sc + fc * 2) / (1 + uca + ff);
  },
  generateIntentHash: (prose: string, author: string, timestamp: number) =>
    `intent_${author}_${prose.substring(0, 10).replace(/\s/g, '_')}_${timestamp}`,
}));

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            SUCCESS: true,
            CONFIDENCE: 0.85,
            REASONING: 'Test alignment',
            PROPOSED_TERMS: { price: 500 },
          }),
        }],
      }),
    },
  }));
});

// Mock fs module for BurnManager
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import * as fs from 'fs';
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock nanoid for settlement IDs
let settlementIdCounter = { count: 0 };
jest.mock('nanoid', () => ({
  nanoid: () => `settlement_${settlementIdCounter.count++}`,
}));

describe('Settlement Burns Integration', () => {
  let mediatorNode: MediatorNode;
  let config: MediatorConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    settlementIdCounter.count = 0;

    // Reset fs mocks
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.writeFileSync.mockImplementation(() => undefined);

    config = {
      chainEndpoint: 'http://test-chain:8080',
      chainId: 'test-chain',
      consensusMode: 'permissionless',
      llmProvider: 'anthropic',
      llmApiKey: 'test-key',
      llmModel: 'claude-3-5-sonnet-20241022',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 2.0,
      vectorDbPath: './test-vector-db',
      vectorDimensions: 1536,
      maxIntentsCache: 10000,
      acceptanceWindowHours: 72,
      logLevel: 'info',
      // Burn configuration
      baseFilingBurn: 10,
      freeDailySubmissions: 1,
      burnEscalationBase: 2,
      burnEscalationExponent: 1,
      successBurnPercentage: 0.0005, // 0.05% as decimal
    };

    mockAxios.get.mockResolvedValue({ data: { intents: [] } });
    mockAxios.post.mockResolvedValue({ status: 200, data: {} });

    mediatorNode = new MediatorNode(config);
  });

  afterEach(async () => {
    try {
      if (mediatorNode && mediatorNode.getStatus && mediatorNode.getStatus().isRunning) {
        await mediatorNode.stop();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Success Burn Execution', () => {
    it('should execute success burn when settlement closes', async () => {
      const settlementManager = mediatorNode.getSettlementManager();
      const burnManager = mediatorNode.getBurnManager();

      // Create mock negotiation result
      const negotiationResult: NegotiationResult = {
        success: true,
        reasoning: 'These intents align for logo design services',
        proposedTerms: {
          price: 500,
          deliverables: ['Logo design', 'Vector files'],
          timelines: '1 week',
        },
        confidenceScore: 0.85,
        modelUsed: 'claude-3-5-sonnet-20241022',
        promptHash: 'test_hash_123',
      };

      // Create and submit settlement
      const settlement = settlementManager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        negotiationResult
      );

      await settlementManager.submitSettlement(settlement);

      // Calculate expected burn
      const totalFees = (VALID_INTENT_1.offeredFee || 0) + (VALID_INTENT_2.offeredFee || 0);
      const expectedBurnAmount = totalFees * (config.successBurnPercentage || 0.0005);

      // Mock both parties accepting
      mockAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      // Monitor to trigger closure
      await settlementManager.monitorSettlements();

      // Verify burn was executed
      // Should have: 1) settlement submission, 2) burn, 3) payout
      expect(mockAxios.post).toHaveBeenCalledTimes(3);

      const burnCall = mockAxios.post.mock.calls[1];
      expect(burnCall[0]).toContain('/burns');
      const burnData = burnCall[1] as any;
      expect(burnData.type).toBe('success');
      expect(burnData.amount).toBeCloseTo(expectedBurnAmount, 2);
      expect(burnData.settlementId).toBe(settlement.id);

      // Verify burn stats updated
      const stats = burnManager.getBurnStats();
      expect(stats.totalBurns).toBe(1);
      expect(stats.totalAmount).toBeCloseTo(expectedBurnAmount, 2);
    });

    it('should track success burns separately in burn stats', async () => {
      const settlementManager = mediatorNode.getSettlementManager();
      const burnManager = mediatorNode.getBurnManager();

      const negotiationResult: NegotiationResult = {
        success: true,
        reasoning: 'Alignment successful',
        proposedTerms: { price: 1000 },
        confidenceScore: 0.9,
        modelUsed: 'claude-3-5-sonnet-20241022',
        promptHash: 'hash_456',
      };

      // Create multiple settlements
      const settlement1 = settlementManager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        negotiationResult
      );

      await settlementManager.submitSettlement(settlement1);

      // Close settlement
      mockAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await settlementManager.monitorSettlements();

      // Check burn history
      const history = burnManager.getBurnHistory();
      const successBurns = history.filter(b => b.type === 'success');

      expect(successBurns.length).toBe(1);
      expect(successBurns[0].settlementId).toBe(settlement1.id);
    });

    it('should calculate burn from settlement value correctly', async () => {
      // Use specific fee percentage for clear calculation
      config.facilitationFeePercent = 10.0; // 10%
      config.successBurnPercentage = 0.0005; // 0.05%

      const node = new MediatorNode(config);
      const settlementManager = node.getSettlementManager();

      const negotiationResult: NegotiationResult = {
        success: true,
        reasoning: 'Test',
        proposedTerms: { price: 1000 },
        confidenceScore: 0.85,
        modelUsed: 'test-model',
        promptHash: 'hash',
      };

      // Total fees: 100 + 150 = 250
      // Facilitation fee: 250 × 0.1 = 25
      // Settlement value: 25 / 0.1 = 250
      // Success burn: 250 × 0.0005 = 0.125

      const settlement = settlementManager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        negotiationResult
      );

      await settlementManager.submitSettlement(settlement);

      mockAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await settlementManager.monitorSettlements();

      const burnCall = mockAxios.post.mock.calls[1];
      const burnData = burnCall[1] as any;

      const totalFees = (VALID_INTENT_1.offeredFee || 0) + (VALID_INTENT_2.offeredFee || 0);
      const expectedBurn = totalFees * 0.0005;

      expect(burnData.amount).toBeCloseTo(expectedBurn, 2);
    });
  });

  describe('Burn Skipping Scenarios', () => {
    it('should not execute burn when settlement has upheld challenges', async () => {
      const settlementManager = mediatorNode.getSettlementManager();
      const burnManager = mediatorNode.getBurnManager();

      const negotiationResult: NegotiationResult = {
        success: true,
        reasoning: 'Test',
        proposedTerms: { price: 500 },
        confidenceScore: 0.85,
        modelUsed: 'test-model',
        promptHash: 'hash',
      };

      const settlement = settlementManager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        negotiationResult
      );

      await settlementManager.submitSettlement(settlement);

      // Mock settlement with upheld challenge
      mockAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [{
            id: 'challenge_1',
            status: 'upheld',
            reason: 'Invalid terms',
          }],
        },
      });

      await settlementManager.monitorSettlements();

      // Should only submit settlement (no burn, no payout)
      expect(mockAxios.post).toHaveBeenCalledTimes(1);

      // No burns recorded
      const stats = burnManager.getBurnStats();
      expect(stats.totalBurns).toBe(0);
    });

    it('should not execute burn when settlement value is zero', async () => {
      const settlementManager = mediatorNode.getSettlementManager();
      const burnManager = mediatorNode.getBurnManager();

      // Use zero-fee intents
      const zeroIntent1 = { ...VALID_INTENT_1, offeredFee: 0 };
      const zeroIntent2 = { ...VALID_INTENT_2, offeredFee: 0 };

      const negotiationResult: NegotiationResult = {
        success: true,
        reasoning: 'Test',
        proposedTerms: { price: 0 },
        confidenceScore: 0.85,
        modelUsed: 'test-model',
        promptHash: 'hash',
      };

      const settlement = settlementManager.createSettlement(
        zeroIntent1,
        zeroIntent2,
        negotiationResult
      );

      await settlementManager.submitSettlement(settlement);

      mockAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await settlementManager.monitorSettlements();

      // Should submit + payout (no burn for zero value)
      expect(mockAxios.post).toHaveBeenCalledTimes(2);

      const stats = burnManager.getBurnStats();
      expect(stats.totalBurns).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should not fail settlement closure if burn execution fails', async () => {
      const settlementManager = mediatorNode.getSettlementManager();

      const negotiationResult: NegotiationResult = {
        success: true,
        reasoning: 'Test',
        proposedTerms: { price: 500 },
        confidenceScore: 0.85,
        modelUsed: 'test-model',
        promptHash: 'hash',
      };

      const settlement = settlementManager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        negotiationResult
      );

      // Mock responses: submit success, burn fails, payout success
      mockAxios.post
        .mockResolvedValueOnce({ status: 200, data: {} })  // Submit
        .mockRejectedValueOnce(new Error('Burn failed'))    // Burn fails
        .mockResolvedValueOnce({ status: 200, data: {} });  // Payout

      await settlementManager.submitSettlement(settlement);

      mockAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      // Should not throw
      await expect(settlementManager.monitorSettlements()).resolves.not.toThrow();

      // Payout should still be attempted
      expect(mockAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should log burn errors without affecting settlement status', async () => {
      const settlementManager = mediatorNode.getSettlementManager();

      const negotiationResult: NegotiationResult = {
        success: true,
        reasoning: 'Test',
        proposedTerms: { price: 500 },
        confidenceScore: 0.85,
        modelUsed: 'test-model',
        promptHash: 'hash',
      };

      const settlement = settlementManager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        negotiationResult
      );

      mockAxios.post
        .mockResolvedValueOnce({ status: 200, data: {} })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 200, data: {} });

      await settlementManager.submitSettlement(settlement);

      mockAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await settlementManager.monitorSettlements();

      // Settlement should close successfully despite burn error
      const active = settlementManager.getActiveSettlements();
      expect(active).toHaveLength(0);
    });
  });

  describe('End-to-End Settlement Lifecycle', () => {
    it('should demonstrate complete settlement with success burn', async () => {
      const settlementManager = mediatorNode.getSettlementManager();
      const burnManager = mediatorNode.getBurnManager();

      // Create negotiation result
      const negotiationResult: NegotiationResult = {
        success: true,
        reasoning: 'Alice needs a logo, Bob offers design services',
        proposedTerms: {
          price: 500,
          deliverables: ['Modern logo', '3 revisions', 'Source files'],
          timelines: '2 weeks',
        },
        confidenceScore: 0.92,
        modelUsed: 'claude-3-5-sonnet-20241022',
        promptHash: 'integrity_hash_xyz',
      };

      // Phase 1: Create settlement
      const settlement = settlementManager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        negotiationResult
      );

      expect(settlement.status).toBe('proposed');
      expect(settlement.partyAAccepted).toBe(false);
      expect(settlement.partyBAccepted).toBe(false);

      // Phase 2: Submit to chain
      const submitted = await settlementManager.submitSettlement(settlement);
      expect(submitted).toBe(true);
      expect(settlementManager.getActiveSettlements()).toHaveLength(1);

      // Phase 3: Both parties accept
      mockAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      // Phase 4: Monitor triggers closure
      await settlementManager.monitorSettlements();

      // Phase 5: Verify outcomes
      // Settlement should be closed and removed from active
      expect(settlementManager.getActiveSettlements()).toHaveLength(0);

      // Success burn should be recorded
      const stats = burnManager.getBurnStats();
      expect(stats.totalBurns).toBe(1);

      const history = burnManager.getBurnHistory();
      const successBurn = history.find(b => b.type === 'success');
      expect(successBurn).toBeDefined();
      expect(successBurn?.settlementId).toBe(settlement.id);

      // Verify all chain interactions
      const postCalls = mockAxios.post.mock.calls;
      expect(postCalls.length).toBe(3);
      expect(postCalls[0][1]).toMatchObject({ type: 'settlement' });
      expect(postCalls[1][0]).toContain('/burns');
      expect(postCalls[2][1]).toMatchObject({ type: 'payout' });
    });
  });
});
