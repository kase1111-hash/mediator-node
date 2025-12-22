/**
 * Integration tests for Burn Workflow
 * Demonstrates how BurnManager integrates with the MediatorNode
 */

import axios from 'axios';
import { MediatorNode } from '../../src/MediatorNode';
import { MediatorConfig } from '../../src/types';

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
            REASONING: 'Test',
            PROPOSED_TERMS: {},
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

describe('Burn Workflow Integration', () => {
  let mediatorNode: MediatorNode;
  let config: MediatorConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

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
      facilitationFeePercent: 1.0,
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
      successBurnPercentage: 0.05,
      loadScalingEnabled: false,
      maxLoadMultiplier: 10,
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
      // Node may not have been created successfully
    }
    jest.useRealTimers();
  });

  describe('BurnManager Integration', () => {
    it('should initialize BurnManager with MediatorNode', async () => {
      const burnManager = mediatorNode.getBurnManager();
      expect(burnManager).toBeDefined();

      const stats = burnManager.getBurnStats();
      expect(stats.totalBurns).toBe(0);
      expect(stats.totalAmount).toBe(0);
    });

    it('should include burn statistics in node status', async () => {
      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(100);

      const status = mediatorNode.getStatus();
      expect(status.burnStats).toBeDefined();
      expect(status.burnStats.totalBurns).toBe(0);
      expect(status.burnStats.totalAmount).toBe(0);
      expect(status.burnStats.loadMultiplier).toBe(1.0);
    });

    it('should execute filing burns via BurnManager', async () => {
      const burnManager = mediatorNode.getBurnManager();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx_123' },
      });

      // First submission (free)
      await burnManager.executeFilingBurn('user1', 'intent_hash_1');

      // Second submission (should have burn)
      const result = await burnManager.executeFilingBurn('user1', 'intent_hash_2');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('base_filing');
      expect(result?.amount).toBe(20); // 10 × 2^1

      // Verify burn transaction was submitted to chain
      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://test-chain:8080/api/v1/burns',
        expect.objectContaining({
          type: 'base_filing',
          author: 'user1',
          intentHash: 'intent_hash_2',
        })
      );
    });

    it('should track multiple users independently', async () => {
      const burnManager = mediatorNode.getBurnManager();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx_123' },
      });

      // User1: Free submission
      await burnManager.executeFilingBurn('user1', 'intent1');
      expect(burnManager.getUserSubmissionCount('user1')).toBe(1);

      // User2: Free submission
      await burnManager.executeFilingBurn('user2', 'intent2');
      expect(burnManager.getUserSubmissionCount('user2')).toBe(1);

      // User1: Paid submission
      await burnManager.executeFilingBurn('user1', 'intent3');
      expect(burnManager.getUserSubmissionCount('user1')).toBe(2);
      expect(burnManager.getUserSubmissionCount('user2')).toBe(1);

      // Verify burns are tracked
      const stats = burnManager.getBurnStats();
      expect(stats.totalBurns).toBe(1); // Only one paid burn
      expect(stats.byType.base_filing.count).toBe(1);
    });

    it('should calculate burn preview before execution', async () => {
      const burnManager = mediatorNode.getBurnManager();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx_123' },
      });

      // First submission (free)
      const preview1 = burnManager.calculateFilingBurn('user1');
      expect(preview1.isFree).toBe(true);
      expect(preview1.amount).toBe(0);

      // Simulate first submission (would be done by chain, but for testing)
      await burnManager.executeFilingBurn('user1', 'intent1');

      // Second submission (paid)
      const preview2 = burnManager.calculateFilingBurn('user1');
      expect(preview2.isFree).toBe(false);
      expect(preview2.amount).toBe(20);
      expect(preview2.breakdown.escalationMultiplier).toBe(2);

      // Third submission (higher escalation)
      await burnManager.executeFilingBurn('user1', 'intent2');
      const preview3 = burnManager.calculateFilingBurn('user1');
      expect(preview3.amount).toBe(40); // 10 × 2^2
    });

    it('should handle success burns on settlement closure', async () => {
      const burnManager = mediatorNode.getBurnManager();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx_success' },
      });

      // Execute success burn
      const result = await burnManager.executeSuccessBurn(
        'settlement_123',
        10000, // settlement value
        'mediator_1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('success');
      expect(result?.amount).toBe(5.0); // 10000 × 0.05%
      expect(result?.settlementId).toBe('settlement_123');

      // Verify status includes success burn
      const stats = burnManager.getBurnStats();
      expect(stats.byType.success.count).toBe(1);
      expect(stats.byType.success.amount).toBe(5.0);
    });

    it('should update load multiplier and reflect in calculations', async () => {
      const customConfig = { ...config, loadScalingEnabled: true };
      const node = new MediatorNode(customConfig);
      const burnManager = node.getBurnManager();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx_123' },
      });

      // Update load multiplier
      burnManager.updateLoadMultiplier(3.0);

      expect(burnManager.getLoadMultiplier()).toBe(3.0);

      // Execute free submission first
      await burnManager.executeFilingBurn('user1', 'intent1');

      // Calculate burn with load multiplier
      const calculation = burnManager.calculateFilingBurn('user1');

      // Base (10) × escalation (2) × load (3.0) = 60
      expect(calculation.amount).toBe(60);
      expect(calculation.breakdown.loadMultiplier).toBe(3.0);
    });

    it('should expose comprehensive burn statistics', async () => {
      const burnManager = mediatorNode.getBurnManager();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx_123' },
      });

      // Execute various burns
      await burnManager.executeFilingBurn('user1', 'intent1'); // Free
      await burnManager.executeFilingBurn('user1', 'intent2'); // 20
      await burnManager.executeFilingBurn('user2', 'intent3'); // Free
      await burnManager.executeSuccessBurn('settlement1', 1000, 'mediator1'); // 0.5

      const stats = burnManager.getBurnStats();

      expect(stats.totalBurns).toBe(2);
      expect(stats.totalAmount).toBe(20.5);
      expect(stats.byType.base_filing.count).toBe(1);
      expect(stats.byType.base_filing.amount).toBe(20);
      expect(stats.byType.success.count).toBe(1);
      expect(stats.byType.success.amount).toBe(0.5);
      expect(stats.activeUsers).toBeGreaterThan(0);
    });
  });
});
