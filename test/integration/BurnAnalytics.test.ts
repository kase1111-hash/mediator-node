/**
 * Integration tests for Burn Analytics
 * Demonstrates analytics and reporting capabilities in the context of MediatorNode
 */

import axios from 'axios';
import { MediatorNode } from '../../src/MediatorNode';
import { MediatorConfig } from '../../src/types';
import { BurnManager } from '../../src/burn/BurnManager';

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

jest.mock('hnswlib-node');

jest.mock('../../src/utils/crypto', () => ({
  generateModelIntegrityHash: (model: string, prompt: string) => `hash_${model}_${prompt.length}`,
  generateSignature: (data: string, key: string) => `sig_${key}_${data.length}`,
  calculateReputationWeight: (sc: number, fc: number, uca: number, ff: number) => {
    return (sc + fc * 2) / (1 + uca + ff);
  },
}));

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

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import * as fs from 'fs';
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Burn Analytics Integration', () => {
  let mediatorNode: MediatorNode;
  let burnManager: BurnManager;
  let config: MediatorConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

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
      baseFilingBurn: 10,
      freeDailySubmissions: 1,
      burnEscalationBase: 2,
      burnEscalationExponent: 1,
      successBurnPercentage: 0.0005,
      loadScalingEnabled: true,
      maxLoadMultiplier: 10,
    };

    mockAxios.get.mockResolvedValue({ data: { intents: [] } });
    mockAxios.post.mockResolvedValue({ status: 200, data: { transactionHash: 'tx123' } });

    mediatorNode = new MediatorNode(config);
    burnManager = mediatorNode.getBurnManager();
  });

  afterEach(async () => {
    jest.useRealTimers();
  });

  describe('Analytics Integration with MediatorNode', () => {
    it('should provide analytics via mediatorNode.getBurnAnalytics()', () => {
      const analytics = mediatorNode.getBurnAnalytics();

      expect(analytics).toBeDefined();
      expect(typeof analytics.getTimeSeriesData).toBe('function');
      expect(typeof analytics.getTrendAnalysis).toBe('function');
      expect(typeof analytics.getDashboardMetrics).toBe('function');
    });

    it('should track burns and provide time series data', async () => {
      // Execute some burns
      await burnManager.executeFilingBurn('alice', 'intent1');
      await burnManager.executeFilingBurn('alice', 'intent2');
      await burnManager.executeFilingBurn('bob', 'intent3');

      const analytics = mediatorNode.getBurnAnalytics();
      const timeSeries = analytics.getTimeSeriesData('day', 7);

      expect(timeSeries.length).toBeGreaterThan(0);
    });

    it('should provide trend analysis after multiple burns', async () => {
      // First submission for each user is free, so we need extra submissions to trigger burns
      // Alice's 1st submission: FREE (no burn)
      await burnManager.executeFilingBurn('alice', 'intent1');
      jest.advanceTimersByTime(1000 * 60 * 60); // 1 hour

      // Alice's 2nd submission: BURN (exceeds free daily limit)
      await burnManager.executeFilingBurn('alice', 'intent2');
      jest.advanceTimersByTime(1000 * 60 * 60); // 1 hour

      // Bob's 1st submission: FREE (no burn)
      await burnManager.executeFilingBurn('bob', 'intent3');

      // Bob's 2nd submission: BURN (exceeds free daily limit)
      await burnManager.executeFilingBurn('bob', 'intent4');

      const analytics = mediatorNode.getBurnAnalytics();
      const trend = analytics.getTrendAnalysis('day');

      // We should have at least 2 actual burns (alice's 2nd, bob's 2nd)
      expect(trend.summary.totalBurns).toBeGreaterThan(0);
      expect(trend.summary.totalAmount).toBeGreaterThan(0);
      expect(trend.summary.activeUsers).toBeGreaterThan(0);
    });
  });

  describe('User Analytics', () => {
    it('should track individual user burn patterns', async () => {
      await burnManager.executeFilingBurn('alice', 'intent1');
      await burnManager.executeFilingBurn('alice', 'intent2');
      await burnManager.executeFilingBurn('alice', 'intent3');

      const analytics = mediatorNode.getBurnAnalytics();
      const userAnalytics = analytics.getUserAnalytics('alice');

      expect(userAnalytics).not.toBeNull();
      expect(userAnalytics?.userId).toBe('alice');
      expect(userAnalytics?.totalBurns).toBeGreaterThan(0);
      expect(userAnalytics?.isActive).toBe(true);
    });

    it('should calculate average burn per user', async () => {
      await burnManager.executeFilingBurn('alice', 'intent1'); // Free
      await burnManager.executeFilingBurn('alice', 'intent2'); // 20
      await burnManager.executeFilingBurn('alice', 'intent3'); // 40

      const analytics = mediatorNode.getBurnAnalytics();
      const userAnalytics = analytics.getUserAnalytics('alice');

      expect(userAnalytics?.totalAmount).toBe(60); // 20 + 40
      expect(userAnalytics?.averageBurn).toBe(30); // Average of paid burns
    });

    it('should get analytics for all users', async () => {
      // First submissions are free, so do second submissions to ensure burns are recorded
      await burnManager.executeFilingBurn('alice', 'intent1'); // Free
      await burnManager.executeFilingBurn('alice', 'intent1a'); // Paid
      await burnManager.executeFilingBurn('bob', 'intent2'); // Free
      await burnManager.executeFilingBurn('bob', 'intent2a'); // Paid
      await burnManager.executeFilingBurn('charlie', 'intent3'); // Free
      await burnManager.executeFilingBurn('charlie', 'intent3a'); // Paid

      const analytics = mediatorNode.getBurnAnalytics();
      const allUsers = analytics.getAllUserAnalytics();

      expect(allUsers.length).toBe(3); // alice, bob, charlie (all have paid burns)
    });
  });

  describe('Leaderboards', () => {
    it('should generate leaderboards from burn data', async () => {
      // Create diverse burn patterns
      await burnManager.executeFilingBurn('alice', 'intent1'); // Free
      await burnManager.executeFilingBurn('alice', 'intent2'); // 20
      await burnManager.executeFilingBurn('alice', 'intent3'); // 40

      await burnManager.executeFilingBurn('bob', 'intent4'); // Free
      await burnManager.executeFilingBurn('bob', 'intent5'); // 20

      const analytics = mediatorNode.getBurnAnalytics();
      const leaderboard = analytics.getLeaderboard(10);

      expect(leaderboard.topBurnersByAmount.length).toBeGreaterThan(0);
      expect(leaderboard.topBurnersByVolume.length).toBeGreaterThan(0);
      expect(leaderboard.mostRecentBurners.length).toBeGreaterThan(0);
    });

    it('should rank users correctly by total amount', async () => {
      await burnManager.executeFilingBurn('alice', 'intent1'); // Free
      await burnManager.executeFilingBurn('alice', 'intent2'); // 20
      await burnManager.executeFilingBurn('alice', 'intent3'); // 40

      await burnManager.executeFilingBurn('bob', 'intent4'); // Free
      await burnManager.executeFilingBurn('bob', 'intent5'); // 20

      const analytics = mediatorNode.getBurnAnalytics();
      const leaderboard = analytics.getLeaderboard(10);

      // Alice should be first (60 total) over Bob (20 total)
      expect(leaderboard.topBurnersByAmount[0].userId).toBe('alice');
      expect(leaderboard.topBurnersByAmount[0].totalAmount).toBe(60);
    });
  });

  describe('Dashboard Metrics', () => {
    it('should generate comprehensive dashboard metrics', async () => {
      // Generate varied burn activity
      await burnManager.executeFilingBurn('alice', 'intent1'); // Free
      await burnManager.executeFilingBurn('alice', 'intent2'); // 20
      await burnManager.executeFilingBurn('bob', 'intent3'); // Free
      await burnManager.executeFilingBurn('charlie', 'intent4'); // Free

      await burnManager.executeSuccessBurn('settlement1', 1000, 'mediator');

      const analytics = mediatorNode.getBurnAnalytics();
      const metrics = analytics.getDashboardMetrics(burnManager.getLoadMultiplier());

      expect(metrics.overview).toBeDefined();
      expect(metrics.today).toBeDefined();
      expect(metrics.distribution).toBeDefined();
      expect(metrics.loadMetrics).toBeDefined();
    });

    it('should show correct burn type distribution', async () => {
      await burnManager.executeFilingBurn('alice', 'intent1'); // Free (not counted)
      await burnManager.executeFilingBurn('alice', 'intent2'); // base_filing: 20
      await burnManager.executeSuccessBurn('settlement1', 1000, 'mediator'); // success: 0.5

      const analytics = mediatorNode.getBurnAnalytics();
      const metrics = analytics.getDashboardMetrics();

      expect(metrics.distribution.byType.base_filing.count).toBe(1);
      expect(metrics.distribution.byType.success.count).toBe(1);
      expect(metrics.distribution.byType.base_filing.amount).toBe(20);
      expect(metrics.distribution.byType.success.amount).toBe(0.5);
    });

    it('should track load multiplier over time', async () => {
      // Create a fresh analytics instance without the initial load multiplier recording
      const burnManager = mediatorNode.getBurnManager();
      const freshAnalytics = burnManager.getBurnAnalytics();

      // Record some load multipliers
      freshAnalytics.recordLoadMultiplier(1.0);
      freshAnalytics.recordLoadMultiplier(2.0);
      freshAnalytics.recordLoadMultiplier(1.5);

      const metrics = freshAnalytics.getDashboardMetrics(1.5);

      expect(metrics.loadMetrics.averageMultiplier).toBeGreaterThan(1.0);
      expect(metrics.loadMetrics.peakMultiplier).toBe(2.0);
      expect(metrics.loadMetrics.multiplierHistory.length).toBe(3);
    });
  });

  describe('Forecasting', () => {
    it('should generate burn forecasts', async () => {
      // Create burn history pattern
      for (let i = 0; i < 10; i++) {
        await burnManager.executeFilingBurn('alice', 'intent1'); // Free (first one)
        await burnManager.executeFilingBurn('alice', `intent${i}`);
        jest.advanceTimersByTime(1000 * 60 * 60 * 24); // Advance 1 day
      }

      const analytics = mediatorNode.getBurnAnalytics();
      const forecast = analytics.getForecast('week');

      expect(forecast).toBeDefined();
      expect(forecast.projectedBurns).toBeGreaterThanOrEqual(0);
      expect(forecast.projectedAmount).toBeGreaterThanOrEqual(0);
      expect(forecast.confidence).toBeGreaterThanOrEqual(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Real-time Analytics Updates', () => {
    it('should reflect new burns immediately in analytics', async () => {
      const analyticsBefore = mediatorNode.getBurnAnalytics();
      const metricsBefore = analyticsBefore.getDashboardMetrics();

      const burnsBefore = metricsBefore.overview.totalBurnsAllTime;

      // Execute new burn
      await burnManager.executeFilingBurn('alice', 'intent1'); // Free
      await burnManager.executeFilingBurn('alice', 'intent2'); // Paid

      const analyticsAfter = mediatorNode.getBurnAnalytics();
      const metricsAfter = analyticsAfter.getDashboardMetrics();

      expect(metricsAfter.overview.totalBurnsAllTime).toBeGreaterThan(burnsBefore);
    });
  });

  describe('Edge Cases', () => {
    it('should handle analytics with no burns', () => {
      const analytics = mediatorNode.getBurnAnalytics();
      const metrics = analytics.getDashboardMetrics();

      expect(metrics.overview.totalBurnsAllTime).toBe(0);
      expect(metrics.overview.totalAmountBurned).toBe(0);
      expect(metrics.today.burns).toBe(0);
    });

    it('should handle analytics with only free burns', async () => {
      await burnManager.executeFilingBurn('alice', 'intent1'); // Free
      await burnManager.executeFilingBurn('bob', 'intent2'); // Free
      await burnManager.executeFilingBurn('charlie', 'intent3'); // Free

      const analytics = mediatorNode.getBurnAnalytics();
      const metrics = analytics.getDashboardMetrics();

      expect(metrics.overview.totalBurnsAllTime).toBe(0); // Free burns aren't recorded
    });

    it('should handle time series with sparse data', async () => {
      await burnManager.executeFilingBurn('alice', 'intent1');
      await burnManager.executeFilingBurn('alice', 'intent2');

      const analytics = mediatorNode.getBurnAnalytics();
      const timeSeries = analytics.getTimeSeriesData('month', 30);

      expect(timeSeries).toBeDefined();
      expect(Array.isArray(timeSeries)).toBe(true);
    });
  });

  describe('Analytics Performance', () => {
    it('should handle large number of burns efficiently', async () => {
      // Generate many burns
      for (let i = 0; i < 100; i++) {
        await burnManager.executeFilingBurn('user1', 'intent_first'); // Free
        await burnManager.executeFilingBurn('user1', `intent${i}`);
      }

      const startTime = Date.now();
      const analytics = mediatorNode.getBurnAnalytics();
      const metrics = analytics.getDashboardMetrics();
      const endTime = Date.now();

      expect(metrics).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
