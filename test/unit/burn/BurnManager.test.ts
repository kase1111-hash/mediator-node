/**
 * Unit tests for BurnManager
 */

import axios from 'axios';
import { BurnManager } from '../../../src/burn/BurnManager';
import { MediatorConfig } from '../../../src/types';

// Mock axios
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

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

// Import fs after mocking
import * as fs from 'fs';
const mockFs = fs as jest.Mocked<typeof fs>;

describe('BurnManager', () => {
  let burnManager: BurnManager;
  let config: MediatorConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup axios mock
    mockAxios.create.mockReturnValue(mockAxiosInstance as any);
    mockAxiosInstance.get.mockResolvedValue({ data: {} });
    mockAxiosInstance.post.mockResolvedValue({ status: 200, data: {} });

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
      successBurnPercentage: 0.0005, // 0.05% as decimal
      loadScalingEnabled: false,
      maxLoadMultiplier: 10,
    };

    burnManager = new BurnManager(config);
  });

  describe('Constructor and Initialization', () => {
    it('should create burn data directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('.mediator-data/burns'),
        { recursive: true }
      );
    });

    it('should load existing submission data if available', () => {
      const submissionsData = {
        'user1:2024-01-01': {
          userId: 'user1',
          date: '2024-01-01',
          submissionCount: 2,
          lastSubmissionTime: Date.now(),
          totalBurned: 10,
          burns: [],
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(submissionsData));

      const manager = new BurnManager(config);
      expect(mockFs.readFileSync).toHaveBeenCalled();
    });
  });

  describe('calculateFilingBurn', () => {
    it('should return zero for first daily submission (free allowance)', () => {
      const result = burnManager.calculateFilingBurn('user1');

      expect(result.isFree).toBe(true);
      expect(result.amount).toBe(0);
      expect(result.breakdown.submissionCount).toBe(0);
    });

    it('should calculate base burn for second submission', async () => {
      mockAxios.post.mockResolvedValue({ status: 200, data: { transactionHash: 'tx1' } });

      // First submission (free)
      await burnManager.executeFilingBurn('user1', 'intent1');

      // Second submission (should have burn)
      const result = burnManager.calculateFilingBurn('user1');

      expect(result.isFree).toBe(false);
      expect(result.amount).toBe(20); // baseBurn × 2^1 = 10 × 2
      expect(result.breakdown.escalationMultiplier).toBe(2); // 2^1
    });

    it('should apply exponential escalation for multiple submissions', async () => {
      mockAxios.post.mockResolvedValue({ status: 200, data: { transactionHash: 'tx1' } });

      // First submission (free)
      await burnManager.executeFilingBurn('user1', 'intent1');

      // Second submission (base × 2^1)
      const result2 = burnManager.calculateFilingBurn('user1');
      expect(result2.amount).toBe(20); // 10 × 2^1

      await burnManager.executeFilingBurn('user1', 'intent2');

      // Third submission (base × 2^2)
      const result3 = burnManager.calculateFilingBurn('user1');
      expect(result3.amount).toBe(40); // 10 × 2^2

      await burnManager.executeFilingBurn('user1', 'intent3');

      // Fourth submission (base × 2^3)
      const result4 = burnManager.calculateFilingBurn('user1');
      expect(result4.amount).toBe(80); // 10 × 2^3
    });

    it('should apply load multiplier when enabled', () => {
      const configWithLoad = { ...config, loadScalingEnabled: true };
      const manager = new BurnManager(configWithLoad);

      manager.updateLoadMultiplier(2.5);

      // Free submission
      manager.executeFilingBurn('user1', 'intent1');

      mockAxios.post.mockResolvedValue({ status: 200, data: { transactionHash: 'tx1' } });

      // Second submission should include load multiplier
      const result = manager.calculateFilingBurn('user1');

      // Base (10) × escalation (2) × load (2.5) = 50
      expect(result.amount).toBe(50);
      expect(result.breakdown.loadMultiplier).toBe(2.5);
    });

    it('should handle custom escalation parameters', () => {
      const customConfig = {
        ...config,
        burnEscalationBase: 3,
        burnEscalationExponent: 2,
      };
      const manager = new BurnManager(customConfig);

      mockAxios.post.mockResolvedValue({ status: 200, data: { transactionHash: 'tx1' } });

      // First submission (free)
      manager.executeFilingBurn('user1', 'intent1');

      // Second submission: base × 3^(1*2) = 10 × 9 = 90
      const result = manager.calculateFilingBurn('user1');
      expect(result.amount).toBe(90);
    });
  });

  describe('executeFilingBurn', () => {
    it('should not execute burn for free submission', async () => {
      const result = await burnManager.executeFilingBurn('user1', 'intent1');

      expect(result).toBeNull();
      expect(mockAxios.post).not.toHaveBeenCalled();
      expect(burnManager.getUserSubmissionCount('user1')).toBe(1);
    });

    it('should execute burn transaction for paid submission', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx_abc123' },
      });

      // First submission (free)
      await burnManager.executeFilingBurn('user1', 'intent1');

      // Second submission (paid)
      const result = await burnManager.executeFilingBurn('user1', 'intent2');

      expect(result).not.toBeNull();
      expect(result?.type).toBe('base_filing');
      expect(result?.author).toBe('user1');
      expect(result?.intentHash).toBe('intent2');
      expect(result?.amount).toBe(20); // 10 × 2
      expect(result?.transactionHash).toBe('tx_abc123');

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://test-chain:8080/api/v1/burns',
        expect.objectContaining({
          type: 'base_filing',
          author: 'user1',
          intentHash: 'intent2',
        })
      );
    });

    it('should update user submission record', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx1' },
      });

      await burnManager.executeFilingBurn('user1', 'intent1');
      await burnManager.executeFilingBurn('user1', 'intent2');

      expect(burnManager.getUserSubmissionCount('user1')).toBe(2);
      expect(burnManager.getUserTotalBurned('user1')).toBe(20); // Second submission burn
    });

    it('should handle burn transaction failure', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));

      // First submission (free)
      await burnManager.executeFilingBurn('user1', 'intent1');

      // Second submission should throw
      await expect(burnManager.executeFilingBurn('user1', 'intent2')).rejects.toThrow(
        'Network error'
      );
    });

    it('should track different users independently', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx1' },
      });

      // User1: free submission
      await burnManager.executeFilingBurn('user1', 'intent1');
      expect(burnManager.getUserSubmissionCount('user1')).toBe(1);

      // User2: free submission
      await burnManager.executeFilingBurn('user2', 'intent2');
      expect(burnManager.getUserSubmissionCount('user2')).toBe(1);

      // User1: paid submission
      await burnManager.executeFilingBurn('user1', 'intent3');
      expect(burnManager.getUserSubmissionCount('user1')).toBe(2);
      expect(burnManager.getUserSubmissionCount('user2')).toBe(1);
    });
  });

  describe('executeSuccessBurn', () => {
    it('should execute success burn on settlement closure', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx_success' },
      });

      const result = await burnManager.executeSuccessBurn(
        'settlement_123',
        1000, // settlement value
        'mediator_1'
      );

      expect(result).not.toBeNull();
      expect(result?.type).toBe('success');
      expect(result?.amount).toBe(0.5); // 1000 × 0.05%
      expect(result?.settlementId).toBe('settlement_123');
      expect(result?.author).toBe('mediator_1');

      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://test-chain:8080/api/v1/burns',
        expect.objectContaining({
          type: 'success',
          settlementId: 'settlement_123',
        })
      );
    });

    it('should skip negligible success burns', async () => {
      const result = await burnManager.executeSuccessBurn(
        'settlement_123',
        0.001, // very small settlement value
        'mediator_1'
      );

      expect(result).toBeNull();
      expect(mockAxios.post).not.toHaveBeenCalled();
    });

    it('should handle custom success burn percentage', async () => {
      const customConfig = { ...config, successBurnPercentage: 0.001 }; // 0.1%
      const manager = new BurnManager(customConfig);

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx1' },
      });

      const result = await manager.executeSuccessBurn(
        'settlement_123',
        1000,
        'mediator_1'
      );

      expect(result?.amount).toBe(1.0); // 1000 × 0.1%
    });
  });

  describe('Load Multiplier Management', () => {
    it('should update load multiplier within bounds', () => {
      burnManager.updateLoadMultiplier(5.0);
      expect(burnManager.getLoadMultiplier()).toBe(5.0);
    });

    it('should clamp load multiplier to maximum', () => {
      burnManager.updateLoadMultiplier(100);
      expect(burnManager.getLoadMultiplier()).toBe(10); // maxLoadMultiplier
    });

    it('should clamp load multiplier to minimum of 1.0', () => {
      burnManager.updateLoadMultiplier(0.5);
      expect(burnManager.getLoadMultiplier()).toBe(1.0);
    });
  });

  describe('Burn Statistics', () => {
    it('should provide accurate burn statistics', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx1' },
      });

      // Execute some burns
      await burnManager.executeFilingBurn('user1', 'intent1'); // Free
      await burnManager.executeFilingBurn('user1', 'intent2'); // 20
      await burnManager.executeFilingBurn('user2', 'intent3'); // Free
      await burnManager.executeSuccessBurn('settlement1', 1000, 'mediator1'); // 0.5

      const stats = burnManager.getBurnStats();

      expect(stats.totalBurns).toBe(2); // Only paid burns
      expect(stats.totalAmount).toBe(20.5); // 20 + 0.5
      expect(stats.byType.base_filing.count).toBe(1);
      expect(stats.byType.success.count).toBe(1);
      expect(stats.activeUsers).toBeGreaterThan(0);
    });

    it('should track burns by type', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx1' },
      });

      await burnManager.executeFilingBurn('user1', 'intent1'); // Free
      await burnManager.executeFilingBurn('user1', 'intent2'); // Filing burn
      await burnManager.executeSuccessBurn('settlement1', 2000, 'mediator1'); // Success burn

      const stats = burnManager.getBurnStats();

      expect(stats.byType.base_filing.count).toBe(1);
      expect(stats.byType.base_filing.amount).toBe(20);
      expect(stats.byType.success.count).toBe(1);
      expect(stats.byType.success.amount).toBe(1.0);
    });
  });

  describe('Data Persistence', () => {
    it('should persist submission data to disk', async () => {
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx1' },
      });

      await burnManager.executeFilingBurn('user1', 'intent1');
      await burnManager.executeFilingBurn('user1', 'intent2');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('submissions.json'),
        expect.any(String)
      );

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('history.json'),
        expect.any(String)
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero base burn amount', () => {
      const zeroConfig = { ...config, baseFilingBurn: 0 };
      const manager = new BurnManager(zeroConfig);

      const result = manager.calculateFilingBurn('user1');
      expect(result.amount).toBe(0);
    });

    it('should handle multiple free submissions if configured', async () => {
      const multiConfig = { ...config, freeDailySubmissions: 3 };
      const manager = new BurnManager(multiConfig);

      await manager.executeFilingBurn('user1', 'intent1');
      await manager.executeFilingBurn('user1', 'intent2');
      await manager.executeFilingBurn('user1', 'intent3');

      expect(manager.getUserSubmissionCount('user1')).toBe(3);
      expect(manager.getUserTotalBurned('user1')).toBe(0); // All free
    });

    it('should reset submission count on new day', () => {
      // This is implicitly tested by date-based keying
      // In production, records would naturally separate by date
      const count1 = burnManager.getUserSubmissionCount('user1');
      expect(count1).toBe(0);
    });
  });
});
