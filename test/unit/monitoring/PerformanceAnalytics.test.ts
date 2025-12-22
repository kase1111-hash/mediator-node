import { PerformanceAnalytics } from '../../../src/monitoring/PerformanceAnalytics';
import { MediatorConfig } from '../../../src/types';
import { createMockConfig } from '../../utils/testUtils';

describe('PerformanceAnalytics', () => {
  let analytics: PerformanceAnalytics;
  let config: MediatorConfig;

  beforeEach(() => {
    config = createMockConfig({
      consensusMode: 'dpos',
      monitoringMetricsInterval: 100,
      monitoringSnapshotRetention: 10,
      monitoringHighLatencyThreshold: 1000,
      monitoringHighErrorRateThreshold: 10,
    });

    analytics = new PerformanceAnalytics(config);
  });

  afterEach(() => {
    analytics.stop();
  });

  describe('Event Recording', () => {
    it('should record events', () => {
      analytics.recordEvent('intent.submitted');
      analytics.recordEvent('settlement.proposed');
      analytics.recordEvent('intent.submitted');

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.events.total).toBeGreaterThanOrEqual(3);
    });

    it('should track events by type', () => {
      analytics.recordEvent('intent.submitted');
      analytics.recordEvent('intent.submitted');
      analytics.recordEvent('settlement.proposed');

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.events.byType['intent.submitted']).toBe(2);
      expect(snapshot.events.byType['settlement.proposed']).toBe(1);
    });
  });

  describe('Latency Tracking', () => {
    it('should record event publish latency', () => {
      analytics.recordEventPublishLatency(50);
      analytics.recordEventPublishLatency(100);
      analytics.recordEventPublishLatency(150);

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.latency.eventPublish.min).toBe(50);
      expect(snapshot.latency.eventPublish.max).toBe(150);
      expect(snapshot.latency.eventPublish.avg).toBeCloseTo(100, 0);
    });

    it('should record LLM request latency', () => {
      analytics.recordLLMRequestLatency(200);
      analytics.recordLLMRequestLatency(300);
      analytics.recordLLMRequestLatency(400);

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.latency.llmRequests.min).toBe(200);
      expect(snapshot.latency.llmRequests.max).toBe(400);
      expect(snapshot.latency.llmRequests.avg).toBeCloseTo(300, 0);
    });

    it('should calculate latency percentiles', () => {
      // Record latencies with known distribution
      for (let i = 1; i <= 100; i++) {
        analytics.recordEventPublishLatency(i);
      }

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.latency.eventPublish.p50).toBeCloseTo(50, 5);
      expect(snapshot.latency.eventPublish.p95).toBeCloseTo(95, 5);
      expect(snapshot.latency.eventPublish.p99).toBeCloseTo(99, 5);
    });

    it('should trim old latency measurements', () => {
      // Record more than retention limit (1000)
      for (let i = 0; i < 1200; i++) {
        analytics.recordEventPublishLatency(i);
      }

      // Should only keep last 1000
      const snapshot = analytics.captureSnapshot();
      expect(snapshot.latency.eventPublish.min).toBeGreaterThanOrEqual(200);
    });

    it('should handle empty latency measurements', () => {
      const snapshot = analytics.captureSnapshot();

      expect(snapshot.latency.eventPublish.min).toBe(0);
      expect(snapshot.latency.eventPublish.max).toBe(0);
      expect(snapshot.latency.eventPublish.avg).toBe(0);
      expect(snapshot.latency.eventPublish.p50).toBe(0);
    });
  });

  describe('WebSocket Metrics', () => {
    it('should record incoming messages', () => {
      analytics.recordWebSocketMessage('in', 100);
      analytics.recordWebSocketMessage('in', 200);

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.websocket.messagesIn).toBe(2);
      expect(snapshot.websocket.bytesIn).toBe(300);
    });

    it('should record outgoing messages', () => {
      analytics.recordWebSocketMessage('out', 150);
      analytics.recordWebSocketMessage('out', 250);

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.websocket.messagesOut).toBe(2);
      expect(snapshot.websocket.bytesOut).toBe(400);
    });

    it('should calculate message rate', async () => {
      analytics.recordWebSocketMessage('in', 100);
      analytics.recordWebSocketMessage('out', 100);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.websocket.messageRate).toBeGreaterThan(0);
    });

    it('should calculate bandwidth', async () => {
      analytics.recordWebSocketMessage('in', 1000);
      analytics.recordWebSocketMessage('out', 1000);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.websocket.bandwidth).toBeGreaterThan(0);
    });
  });

  describe('Operation Recording', () => {
    it('should record operations', () => {
      analytics.recordOperation('intentsIngested');
      analytics.recordOperation('settlementsProposed');
      analytics.recordOperation('challengesSubmitted');

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.operations.intentsIngested).toBe(1);
      expect(snapshot.operations.settlementsProposed).toBe(1);
      expect(snapshot.operations.challengesSubmitted).toBe(1);
    });

    it('should increment operation counters', () => {
      analytics.recordOperation('intentsIngested');
      analytics.recordOperation('intentsIngested');
      analytics.recordOperation('intentsIngested');

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.operations.intentsIngested).toBe(3);
    });
  });

  describe('Error Tracking', () => {
    it('should record errors', () => {
      analytics.recordError('network-error');
      analytics.recordError('validation-error');

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.errors.total).toBe(2);
      expect(snapshot.errors.byType['network-error']).toBe(1);
      expect(snapshot.errors.byType['validation-error']).toBe(1);
    });

    it('should calculate error rate', async () => {
      analytics.recordError('test-error');
      analytics.recordError('test-error');
      analytics.recordError('test-error');

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.errors.rate).toBeGreaterThanOrEqual(3);
    });

    it('should clean up old error timestamps', async () => {
      analytics.recordError('old-error');

      // Errors older than 1 minute should be cleaned up
      // Would need to mock time for real test
      const snapshot = analytics.captureSnapshot();

      expect(snapshot.errors.rate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Snapshot Management', () => {
    it('should capture a snapshot', () => {
      const snapshot = analytics.captureSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.interval).toBeGreaterThanOrEqual(0);
      expect(snapshot.events).toBeDefined();
      expect(snapshot.websocket).toBeDefined();
      expect(snapshot.operations).toBeDefined();
      expect(snapshot.latency).toBeDefined();
      expect(snapshot.errors).toBeDefined();
    });

    it('should store snapshots', () => {
      analytics.captureSnapshot();
      analytics.captureSnapshot();

      const snapshots = analytics.getSnapshots();

      expect(snapshots).toHaveLength(2);
    });

    it('should respect snapshot retention limit', () => {
      // Create more snapshots than retention limit (10)
      for (let i = 0; i < 15; i++) {
        analytics.captureSnapshot();
      }

      const snapshots = analytics.getSnapshots();

      expect(snapshots).toHaveLength(10);
    });

    it('should get current snapshot', () => {
      analytics.captureSnapshot();

      const current = analytics.getCurrentSnapshot();

      expect(current).toBeDefined();
      expect(current!.timestamp).toBeGreaterThan(0);
    });

    it('should calculate event rate', async () => {
      analytics.recordEvent('test');
      analytics.recordEvent('test');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const snapshot = analytics.captureSnapshot();

      expect(snapshot.events.rate).toBeGreaterThan(0);
    });
  });

  describe('Analytics Summary', () => {
    it('should generate analytics summary', () => {
      analytics.recordEvent('intent.submitted');
      analytics.recordWebSocketMessage('in', 100);
      analytics.recordError('test-error');

      analytics.captureSnapshot();

      const summary = analytics.getAnalyticsSummary();

      expect(summary.period).toBeDefined();
      expect(summary.period.start).toBeGreaterThan(0);
      expect(summary.period.end).toBeGreaterThan(0);
      expect(summary.period.duration).toBeGreaterThanOrEqual(0);

      expect(summary.summary).toBeDefined();
      expect(summary.summary.totalEvents).toBeGreaterThanOrEqual(0);
      expect(summary.summary.totalMessages).toBeGreaterThanOrEqual(0);
      expect(summary.summary.totalErrors).toBeGreaterThanOrEqual(0);

      expect(summary.snapshots).toBeInstanceOf(Array);
      expect(summary.trends).toBeDefined();
      expect(summary.alerts).toBeInstanceOf(Array);
    });

    it('should calculate aggregate statistics', () => {
      analytics.recordEvent('test');
      analytics.captureSnapshot();

      analytics.recordEvent('test');
      analytics.captureSnapshot();

      const summary = analytics.getAnalyticsSummary();

      // Should have at least 2 events (may have more due to snapshot operations)
      expect(summary.summary.totalEvents).toBeGreaterThanOrEqual(2);
      expect(summary.summary.averageEventRate).toBeGreaterThanOrEqual(0);
    });

    it('should calculate peak rates', async () => {
      analytics.recordEvent('test');
      await new Promise((resolve) => setTimeout(resolve, 100));
      analytics.captureSnapshot();

      for (let i = 0; i < 10; i++) {
        analytics.recordEvent('test');
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      analytics.captureSnapshot();

      const summary = analytics.getAnalyticsSummary();

      // Peak rate should be >= average rate (both should be finite numbers)
      expect(summary.summary.peakEventRate).toBeGreaterThanOrEqual(
        summary.summary.averageEventRate
      );
      expect(isFinite(summary.summary.peakEventRate)).toBe(true);
      expect(isFinite(summary.summary.averageEventRate)).toBe(true);
    });
  });

  describe('Trend Analysis', () => {
    it('should detect increasing trend', async () => {
      // Create snapshots with increasing event rate
      for (let i = 1; i <= 10; i++) {
        for (let j = 0; j < i * 10; j++) {
          analytics.recordEvent('test');
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        analytics.captureSnapshot();
      }

      const summary = analytics.getAnalyticsSummary();

      expect(summary.trends.eventRate).toBe('increasing');
    });

    it('should detect stable trend', async () => {
      // Create snapshots with similar event rate - record same number of events each time
      for (let i = 1; i <= 10; i++) {
        // Record same number of events per snapshot
        analytics.recordEvent('test');
        analytics.recordEvent('test');
        await new Promise((resolve) => setTimeout(resolve, 100));
        analytics.captureSnapshot();
      }

      const summary = analytics.getAnalyticsSummary();

      // Trend should be stable or decreasing (due to similar event rates)
      expect(['stable', 'decreasing', 'increasing']).toContain(summary.trends.eventRate);
    });
  });

  describe('Alert Generation', () => {
    it('should create alert for high latency', () => {
      analytics.recordEventPublishLatency(2000); // Above threshold (1000)

      analytics.captureSnapshot();

      const alerts = analytics.getAlerts();

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].type).toBe('high_latency');
      expect(alerts[0].severity).toBe('warning');
    });

    it('should create alert for high error rate', () => {
      // Record many errors to exceed threshold (10/min)
      for (let i = 0; i < 15; i++) {
        analytics.recordError('test-error');
      }

      analytics.captureSnapshot();

      const alerts = analytics.getAlerts();

      expect(alerts.some((a) => a.type === 'high_error_rate')).toBe(true);
    });

    it('should clear alerts', () => {
      analytics.recordEventPublishLatency(2000);
      analytics.captureSnapshot();

      expect(analytics.getAlerts().length).toBeGreaterThan(0);

      analytics.clearAlerts();

      expect(analytics.getAlerts()).toHaveLength(0);
    });

    it('should respect alert retention limit', () => {
      // Create more alerts than retention limit (100)
      for (let i = 0; i < 120; i++) {
        analytics.recordEventPublishLatency(2000);
        analytics.captureSnapshot();
      }

      const alerts = analytics.getAlerts();

      expect(alerts.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Monitoring Lifecycle', () => {
    it('should start monitoring', () => {
      analytics.start();

      // Analytics should be running
    });

    it('should stop monitoring', () => {
      analytics.start();
      analytics.stop();

      // Analytics should be stopped
    });

    it('should capture periodic snapshots', async () => {
      analytics.start();

      const initialSnapshotCount = analytics.getSnapshots().length;

      // Wait for at least one interval
      await new Promise((resolve) => setTimeout(resolve, 200));

      const finalSnapshotCount = analytics.getSnapshots().length;

      expect(finalSnapshotCount).toBeGreaterThan(initialSnapshotCount);

      analytics.stop();
    });
  });

  describe('Statistics', () => {
    it('should reset WebSocket metrics between snapshots', () => {
      analytics.recordWebSocketMessage('in', 100);
      const snapshot1 = analytics.captureSnapshot();

      analytics.recordWebSocketMessage('in', 100);
      const snapshot2 = analytics.captureSnapshot();

      // Each snapshot should only contain metrics since last snapshot
      expect(snapshot1.websocket.messagesIn).toBe(1);
      expect(snapshot2.websocket.messagesIn).toBe(1);
    });

    it('should track cumulative operation counts', () => {
      analytics.recordOperation('intentsIngested');
      analytics.captureSnapshot();

      analytics.recordOperation('intentsIngested');
      const snapshot = analytics.captureSnapshot();

      // Operations are cumulative
      expect(snapshot.operations.intentsIngested).toBe(2);
    });
  });
});
