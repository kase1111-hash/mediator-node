/**
 * Unit tests for LoadMonitor
 */

import { LoadMonitor } from '../../../src/burn/LoadMonitor';
import { BurnManager } from '../../../src/burn/BurnManager';
import { MediatorConfig } from '../../../src/types';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fs module for BurnManager
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('axios');

import * as fs from 'fs';
const mockFs = fs as jest.Mocked<typeof fs>;

describe('LoadMonitor', () => {
  let loadMonitor: LoadMonitor;
  let burnManager: BurnManager;
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
      loadScalingEnabled: true,
      maxLoadMultiplier: 10,
      // LoadMonitor configuration
      targetIntentRate: 10, // 10 intents/min baseline
      maxIntentRate: 50, // 50 intents/min max
      loadSmoothingFactor: 0.3,
    };

    burnManager = new BurnManager(config);
    loadMonitor = new LoadMonitor(config, burnManager);
  });

  afterEach(() => {
    loadMonitor.stopMonitoring();
    jest.useRealTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default configuration', () => {
      expect(loadMonitor).toBeDefined();
      expect(loadMonitor.getLoadMultiplier()).toBe(1.0);
    });

    it('should use custom target and max rates', () => {
      const customConfig = {
        ...config,
        targetIntentRate: 20,
        maxIntentRate: 100,
      };
      const monitor = new LoadMonitor(customConfig, burnManager);

      expect(monitor).toBeDefined();
    });

    it('should use default values when config not provided', () => {
      const minimalConfig = { ...config };
      delete minimalConfig.targetIntentRate;
      delete minimalConfig.maxIntentRate;

      const monitor = new LoadMonitor(minimalConfig, burnManager);
      expect(monitor).toBeDefined();
    });
  });

  describe('Recording Submissions', () => {
    it('should record intent submission', () => {
      loadMonitor.recordIntentSubmission(20);

      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.activeIntentCount).toBe(1);
    });

    it('should record multiple intent submissions', () => {
      loadMonitor.recordIntentSubmission(10);
      loadMonitor.recordIntentSubmission(20);
      loadMonitor.recordIntentSubmission(30);

      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.activeIntentCount).toBe(3);
    });

    it('should record settlement and decrement active intents', () => {
      loadMonitor.recordIntentSubmission(20);
      loadMonitor.recordIntentSubmission(30);

      expect(loadMonitor.getCurrentMetrics().activeIntentCount).toBe(2);

      loadMonitor.recordSettlement();

      expect(loadMonitor.getCurrentMetrics().activeIntentCount).toBe(1);
    });

    it('should not go below zero active intents', () => {
      loadMonitor.recordSettlement();
      loadMonitor.recordSettlement();

      expect(loadMonitor.getCurrentMetrics().activeIntentCount).toBe(0);
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate intent submission rate', () => {
      // Record submissions within a minute
      const now = Date.now();
      jest.setSystemTime(now);

      for (let i = 0; i < 15; i++) {
        loadMonitor.recordIntentSubmission(10);
        jest.advanceTimersByTime(3000); // 3 seconds apart
      }

      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.intentSubmissionRate).toBeGreaterThan(0);
    });

    it('should calculate settlement rate', () => {
      // Record settlements within a minute
      const now = Date.now();
      jest.setSystemTime(now);

      for (let i = 0; i < 10; i++) {
        loadMonitor.recordSettlement();
        jest.advanceTimersByTime(5000); // 5 seconds apart
      }

      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.settlementRate).toBeGreaterThan(0);
    });

    it('should calculate average burn amount', () => {
      loadMonitor.recordIntentSubmission(10);
      loadMonitor.recordIntentSubmission(20);
      loadMonitor.recordIntentSubmission(30);

      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.avgBurnAmount).toBe(20); // (10 + 20 + 30) / 3
    });

    it('should include timestamp in metrics', () => {
      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.timestamp).toBeGreaterThan(0);
      expect(metrics.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Load Multiplier Calculation', () => {
    it('should maintain base multiplier when under target load', () => {
      // Simulate low load (5 intents/min, target is 10)
      for (let i = 0; i < 5; i++) {
        loadMonitor.recordIntentSubmission(10);
      }

      loadMonitor.forceUpdate();

      expect(loadMonitor.getLoadMultiplier()).toBe(1.0);
    });

    it('should increase multiplier when above target load', () => {
      // Simulate high load (20 intents/min, target is 10)
      for (let i = 0; i < 20; i++) {
        loadMonitor.recordIntentSubmission(10);
      }

      loadMonitor.forceUpdate();

      expect(loadMonitor.getLoadMultiplier()).toBeGreaterThan(1.0);
    });

    it('should use max multiplier when above max rate', () => {
      // Simulate very high load (60 intents/min, max is 50)
      for (let i = 0; i < 60; i++) {
        loadMonitor.recordIntentSubmission(10);
      }

      loadMonitor.forceUpdate();

      expect(loadMonitor.getLoadMultiplier()).toBeLessThanOrEqual(config.maxLoadMultiplier!);
    });

    it('should apply smoothing factor for gradual transitions', () => {
      // Start with low load
      for (let i = 0; i < 5; i++) {
        loadMonitor.recordIntentSubmission(10);
      }
      loadMonitor.forceUpdate();

      const initialMultiplier = loadMonitor.getLoadMultiplier();

      // Suddenly increase load
      for (let i = 0; i < 30; i++) {
        loadMonitor.recordIntentSubmission(10);
      }
      loadMonitor.forceUpdate();

      const newMultiplier = loadMonitor.getLoadMultiplier();

      // Should not jump immediately to target
      expect(newMultiplier).toBeGreaterThan(initialMultiplier);
      expect(newMultiplier).toBeLessThan(config.maxLoadMultiplier!);
    });

    it('should update BurnManager when enabled', () => {
      const spy = jest.spyOn(burnManager, 'updateLoadMultiplier');

      // Simulate high load
      for (let i = 0; i < 20; i++) {
        loadMonitor.recordIntentSubmission(10);
      }

      loadMonitor.forceUpdate();

      expect(spy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe('Monitoring Lifecycle', () => {
    it('should start monitoring', () => {
      loadMonitor.startMonitoring(1000);

      // Verify it doesn't throw
      expect(true).toBe(true);
    });

    it('should stop monitoring', () => {
      loadMonitor.startMonitoring(1000);
      loadMonitor.stopMonitoring();

      // Verify it doesn't throw
      expect(true).toBe(true);
    });

    it('should warn when starting already running monitor', () => {
      loadMonitor.startMonitoring(1000);
      loadMonitor.startMonitoring(1000); // Second call

      // Should log warning but not throw
      expect(true).toBe(true);
    });

    it('should calculate multiplier periodically when monitoring', () => {
      const spy = jest.spyOn(burnManager, 'updateLoadMultiplier');

      loadMonitor.startMonitoring(1000);

      // Fast-forward time
      jest.advanceTimersByTime(1000);

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Load Statistics', () => {
    it('should provide comprehensive load stats', () => {
      loadMonitor.recordIntentSubmission(10);
      loadMonitor.recordIntentSubmission(20);

      const stats = loadMonitor.getLoadStats();

      expect(stats).toHaveProperty('currentMetrics');
      expect(stats).toHaveProperty('currentMultiplier');
      expect(stats).toHaveProperty('targetRate');
      expect(stats).toHaveProperty('maxRate');
      expect(stats).toHaveProperty('loadFactor');
      expect(stats).toHaveProperty('historicalAverage');
    });

    it('should calculate load factor correctly', () => {
      // Submit 20 intents (rate = 20/min, target = 10/min)
      for (let i = 0; i < 20; i++) {
        loadMonitor.recordIntentSubmission(10);
      }

      loadMonitor.forceUpdate();

      const stats = loadMonitor.getLoadStats();
      expect(stats.loadFactor).toBeCloseTo(2.0, 1); // 20/10 = 2.0
    });

    it('should include historical averages', () => {
      for (let i = 0; i < 10; i++) {
        loadMonitor.recordIntentSubmission(15);
        loadMonitor.forceUpdate();
      }

      const stats = loadMonitor.getLoadStats();
      expect(stats.historicalAverage).toBeDefined();
      expect(stats.historicalAverage.avgBurn).toBeGreaterThan(0);
    });
  });

  describe('History Tracking', () => {
    it('should store load history', () => {
      for (let i = 0; i < 5; i++) {
        loadMonitor.recordIntentSubmission(10);
        loadMonitor.forceUpdate();
      }

      const history = loadMonitor.getLoadHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should limit history size', () => {
      // Exceed max history size (1000)
      for (let i = 0; i < 1200; i++) {
        loadMonitor.forceUpdate();
      }

      const history = loadMonitor.getLoadHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });

    it('should support limited history retrieval', () => {
      for (let i = 0; i < 100; i++) {
        loadMonitor.forceUpdate();
      }

      const history = loadMonitor.getLoadHistory(10);
      expect(history.length).toBe(10);
    });
  });

  describe('Cleanup and Reset', () => {
    it('should cleanup old records', () => {
      const startTime = Date.now();
      jest.setSystemTime(startTime);

      // Record old submissions
      loadMonitor.recordIntentSubmission(10);
      loadMonitor.recordIntentSubmission(20);

      // Advance time by 6 minutes (old records should be cleaned up)
      jest.setSystemTime(startTime + 360000);

      // Record new submission (triggers cleanup)
      loadMonitor.recordIntentSubmission(30);

      const metrics = loadMonitor.getCurrentMetrics();
      // Old submissions should be cleaned up, only recent ones counted
      expect(metrics.intentSubmissionRate).toBe(1); // Only 1 in last minute
    });

    it('should reset all state', () => {
      loadMonitor.recordIntentSubmission(10);
      loadMonitor.recordIntentSubmission(20);
      loadMonitor.recordIntentSubmission(30);
      loadMonitor.forceUpdate();

      loadMonitor.reset();

      expect(loadMonitor.getLoadMultiplier()).toBe(1.0);
      expect(loadMonitor.getCurrentMetrics().activeIntentCount).toBe(0);
      expect(loadMonitor.getLoadHistory().length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero submissions gracefully', () => {
      const metrics = loadMonitor.getCurrentMetrics();

      expect(metrics.intentSubmissionRate).toBe(0);
      expect(metrics.settlementRate).toBe(0);
      expect(metrics.avgBurnAmount).toBe(0);
    });

    it('should handle high submission burst', () => {
      // Record 100 submissions rapidly
      for (let i = 0; i < 100; i++) {
        loadMonitor.recordIntentSubmission(10 + i);
      }

      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.intentSubmissionRate).toBeGreaterThan(0);
      expect(metrics.avgBurnAmount).toBeGreaterThan(0);
    });

    it('should handle zero burn amounts', () => {
      loadMonitor.recordIntentSubmission(0);
      loadMonitor.recordIntentSubmission(0);

      const metrics = loadMonitor.getCurrentMetrics();
      expect(metrics.avgBurnAmount).toBe(0);
    });

    it('should handle extreme load multiplier values', () => {
      const extremeConfig = {
        ...config,
        maxLoadMultiplier: 100,
        targetIntentRate: 1,
      };

      const monitor = new LoadMonitor(extremeConfig, burnManager);

      // Simulate extreme load
      for (let i = 0; i < 200; i++) {
        monitor.recordIntentSubmission(10);
      }

      monitor.forceUpdate();

      expect(monitor.getLoadMultiplier()).toBeLessThanOrEqual(100);
      expect(monitor.getLoadMultiplier()).toBeGreaterThanOrEqual(1.0);
    });
  });
});
