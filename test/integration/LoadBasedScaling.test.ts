/**
 * Integration tests for Load-Based Burn Scaling
 * Demonstrates how LoadMonitor dynamically adjusts burns based on network congestion
 */

import axios from 'axios';
import { MediatorNode } from '../../src/MediatorNode';
import { MediatorConfig } from '../../src/types';

// Mock dependencies
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

// Create mock axios instance that will be returned by axios.create
const mockAxiosInstance = {
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

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

describe('Load-Based Burn Scaling Integration', () => {
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
      // Burn configuration with load scaling enabled
      baseFilingBurn: 10,
      freeDailySubmissions: 1,
      burnEscalationBase: 2,
      burnEscalationExponent: 1,
      successBurnPercentage: 0.05,
      loadScalingEnabled: true, // Enable load scaling
      maxLoadMultiplier: 10,
      // LoadMonitor configuration
      targetIntentRate: 10,
      maxIntentRate: 50,
      loadSmoothingFactor: 0.5, // Higher for faster testing
      loadMonitoringInterval: 1000, // 1 second for testing
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
    jest.useRealTimers();
  });

  describe('LoadMonitor Initialization', () => {
    it('should initialize LoadMonitor with MediatorNode', () => {
      const loadMonitor = mediatorNode.getLoadMonitor();
      expect(loadMonitor).toBeDefined();
      expect(loadMonitor.getLoadMultiplier()).toBe(1.0);
    });

    it('should start load monitoring when node starts (if enabled)', async () => {
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
      expect(status.loadStats).toBeDefined();
      expect(status.loadStats?.currentMultiplier).toBe(1.0);
    });
  });

  describe('Dynamic Load Adjustment', () => {
    it('should increase burn multiplier under high load', async () => {
      const loadMonitor = mediatorNode.getLoadMonitor();
      const ingester = mediatorNode.getIntentIngester();

      mockAxios.post.mockResolvedValue({ status: 200, data: { transactionHash: 'tx1' } });

      // Simulate high load by submitting many intents rapidly
      for (let i = 0; i < 25; i++) {
        await ingester.submitIntent({
          author: `user${i}`,
          prose: `Intent number ${i} for high load testing to trigger congestion pricing mechanism`,
        });
        // Also record in load monitor
        loadMonitor.recordIntentSubmission(0); // Free submissions
      }

      // Force load recalculation
      loadMonitor.forceUpdate();

      // Load factor = 25/10 = 2.5, should increase multiplier
      expect(loadMonitor.getLoadMultiplier()).toBeGreaterThan(1.0);
    });

    it('should maintain base multiplier under low load', async () => {
      const loadMonitor = mediatorNode.getLoadMonitor();

      // Simulate low load (5 intents, target is 10)
      for (let i = 0; i < 5; i++) {
        loadMonitor.recordIntentSubmission(10);
      }

      loadMonitor.forceUpdate();

      expect(loadMonitor.getLoadMultiplier()).toBe(1.0);
    });

    it('should apply load multiplier to burn calculations', async () => {
      const loadMonitor = mediatorNode.getLoadMonitor();
      const burnManager = mediatorNode.getBurnManager();
      const ingester = mediatorNode.getIntentIngester();

      mockAxios.post.mockResolvedValue({ status: 200, data: {} });

      // Create high load
      for (let i = 0; i < 30; i++) {
        loadMonitor.recordIntentSubmission(10);
      }

      loadMonitor.forceUpdate();

      // Use up free allowance first
      await ingester.submitIntent({
        author: 'alice',
        prose: 'First submission to use up free allowance for load scaling test case',
      });

      // Second submission should have elevated burn due to load
      const preview = ingester.previewIntentBurn('alice');

      expect(preview).not.toBeNull();
      expect(preview!.breakdown.loadMultiplier).toBeGreaterThan(1.0);
      // Base (10) × escalation (2) × load (>1.0) > 20
      expect(preview!.amount).toBeGreaterThan(20);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track intent submission rate', async () => {
      const loadMonitor = mediatorNode.getLoadMonitor();

      // Submit intents over time
      for (let i = 0; i < 15; i++) {
        loadMonitor.recordIntentSubmission(10);
      }

      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.intentSubmissionRate).toBe(15);
    });

    it('should track active intent count', () => {
      const loadMonitor = mediatorNode.getLoadMonitor();

      loadMonitor.recordIntentSubmission(10);
      loadMonitor.recordIntentSubmission(20);
      loadMonitor.recordIntentSubmission(30);

      expect(loadMonitor.getCurrentMetrics().activeIntentCount).toBe(3);

      loadMonitor.recordSettlement();

      expect(loadMonitor.getCurrentMetrics().activeIntentCount).toBe(2);
    });

    it('should calculate average burn amount', () => {
      const loadMonitor = mediatorNode.getLoadMonitor();

      loadMonitor.recordIntentSubmission(10);
      loadMonitor.recordIntentSubmission(20);
      loadMonitor.recordIntentSubmission(40);

      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.avgBurnAmount).toBeCloseTo(23.33, 1);
    });
  });

  describe('Node Status Integration', () => {
    it('should include load stats in node status', async () => {
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

      const loadMonitor = mediatorNode.getLoadMonitor();

      // Record some activity
      loadMonitor.recordIntentSubmission(10);
      loadMonitor.recordIntentSubmission(20);
      loadMonitor.forceUpdate();

      const status = mediatorNode.getStatus();

      expect(status.loadStats).toBeDefined();
      expect(status.loadStats?.intentSubmissionRate).toBeGreaterThanOrEqual(0);
      expect(status.loadStats?.currentMultiplier).toBeGreaterThanOrEqual(1.0);
      expect(status.loadStats?.loadFactor).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Smooth Transitions', () => {
    it('should gradually adjust multiplier (not instant)', () => {
      const loadMonitor = mediatorNode.getLoadMonitor();

      // Start with low load
      for (let i = 0; i < 5; i++) {
        loadMonitor.recordIntentSubmission(10);
      }
      loadMonitor.forceUpdate();

      const initialMultiplier = loadMonitor.getLoadMultiplier();

      // Sudden spike in load
      for (let i = 0; i < 40; i++) {
        loadMonitor.recordIntentSubmission(10);
      }
      loadMonitor.forceUpdate();

      const firstUpdateMultiplier = loadMonitor.getLoadMultiplier();

      // Should increase but not reach maximum immediately
      expect(firstUpdateMultiplier).toBeGreaterThan(initialMultiplier);
      expect(firstUpdateMultiplier).toBeLessThan(config.maxLoadMultiplier!);

      // Another update with sustained load
      loadMonitor.forceUpdate();

      const secondUpdateMultiplier = loadMonitor.getLoadMultiplier();

      // Should continue increasing
      expect(secondUpdateMultiplier).toBeGreaterThanOrEqual(firstUpdateMultiplier);
    });
  });

  describe('Periodic Monitoring', () => {
    it('should update load multiplier periodically', async () => {
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

      const loadMonitor = mediatorNode.getLoadMonitor();

      // Record high load
      for (let i = 0; i < 30; i++) {
        loadMonitor.recordIntentSubmission(10);
      }

      const initialMultiplier = loadMonitor.getLoadMultiplier();

      // Advance time to trigger periodic update
      await jest.advanceTimersByTimeAsync(1000);

      const updatedMultiplier = loadMonitor.getLoadMultiplier();

      // Multiplier should have been recalculated
      expect(updatedMultiplier).toBeGreaterThanOrEqual(initialMultiplier);
    });
  });

  describe('Load-Disabled Mode', () => {
    it('should not include load stats when disabled', async () => {
      const disabledConfig = { ...config, loadScalingEnabled: false };
      const node = new MediatorNode(disabledConfig);

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

      await node.start();
      await jest.advanceTimersByTimeAsync(100);

      const status = node.getStatus();

      expect(status.loadStats).toBeUndefined();

      await node.stop();
    });
  });

  describe('End-to-End Load Scaling', () => {
    it('should demonstrate full congestion pricing workflow', async () => {
      const loadMonitor = mediatorNode.getLoadMonitor();
      const ingester = mediatorNode.getIntentIngester();

      mockAxios.post.mockResolvedValue({ status: 200, data: { transactionHash: 'tx1' } });

      // Phase 1: Low load - base prices
      await ingester.submitIntent({
        author: 'alice',
        prose: 'First submission during low load period for baseline pricing demonstration',
      });

      const lowLoadPreview = ingester.previewIntentBurn('alice');
      expect(lowLoadPreview?.breakdown.loadMultiplier).toBe(1.0);

      // Phase 2: Simulate network congestion
      for (let i = 0; i < 40; i++) {
        loadMonitor.recordIntentSubmission(10);
      }
      loadMonitor.forceUpdate();

      // Phase 3: High load - elevated prices
      const highLoadPreview = ingester.previewIntentBurn('bob');

      // Bob's first submission is free, but let's check second
      await ingester.submitIntent({
        author: 'bob',
        prose: 'First submission for bob during high load to use up free allowance',
      });

      const bobSecondPreview = ingester.previewIntentBurn('bob');

      // Should have higher burn due to load multiplier
      expect(bobSecondPreview?.breakdown.loadMultiplier).toBeGreaterThan(1.0);
      expect(bobSecondPreview?.amount).toBeGreaterThan(20); // Base 10 × escalation 2 × load > 1

      // Verify load stats
      const stats = loadMonitor.getLoadStats();
      expect(stats.loadFactor).toBeGreaterThan(1.0);
      expect(stats.currentMultiplier).toBeGreaterThan(1.0);
    });
  });
});
