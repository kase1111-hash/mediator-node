import { MonitoringPublisher } from '../../../src/monitoring/MonitoringPublisher';
import { HealthMonitor } from '../../../src/monitoring/HealthMonitor';
import { PerformanceAnalytics } from '../../../src/monitoring/PerformanceAnalytics';
import { EventPublisher } from '../../../src/websocket/EventPublisher';
import { WebSocketServer } from '../../../src/websocket/WebSocketServer';
import { MediatorConfig } from '../../../src/types';
import { createMockConfig } from '../../utils/testUtils';

describe('MonitoringPublisher', () => {
  let monitoringPublisher: MonitoringPublisher;
  let healthMonitor: HealthMonitor;
  let performanceAnalytics: PerformanceAnalytics;
  let eventPublisher: EventPublisher;
  let wsServer: WebSocketServer;
  let config: MediatorConfig;

  beforeEach(() => {
    config = createMockConfig({
      consensusMode: 'dpos',
      monitoringHealthCheckInterval: 100,
      monitoringMetricsInterval: 100,
    });

    // Create WebSocket server
    wsServer = new WebSocketServer({
      port: 8081,
      authRequired: false,
    });

    // Create monitoring components
    healthMonitor = new HealthMonitor(config);
    performanceAnalytics = new PerformanceAnalytics(config);
    eventPublisher = new EventPublisher(wsServer);

    // Create monitoring publisher
    monitoringPublisher = new MonitoringPublisher(
      config,
      eventPublisher,
      healthMonitor,
      performanceAnalytics
    );
  });

  afterEach(async () => {
    monitoringPublisher.stop();
    performanceAnalytics.stop();
    healthMonitor.stop();
    await wsServer.stop();
  });

  describe('Initialization', () => {
    it('should create monitoring publisher', () => {
      expect(monitoringPublisher).toBeDefined();
    });

    it('should use config intervals', () => {
      const customConfig = {
        ...config,
        monitoringHealthCheckInterval: 5000,
        monitoringMetricsInterval: 3000,
      };

      const publisher = new MonitoringPublisher(
        customConfig,
        eventPublisher,
        healthMonitor,
        performanceAnalytics
      );

      expect(publisher).toBeDefined();
      publisher.stop();
    });
  });

  describe('Publishing Health Updates', () => {
    it('should publish health update', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      await healthMonitor.performHealthCheck();
      monitoringPublisher.publishHealthUpdate();

      expect(publishSpy).toHaveBeenCalledWith(
        'system.health_update',
        expect.objectContaining({
          health: expect.objectContaining({
            status: expect.any(String),
            timestamp: expect.any(Number),
          }),
        })
      );
    });

    it('should not publish if no health report available', () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      monitoringPublisher.publishHealthUpdate();

      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('should include snapshot in health update', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      await healthMonitor.performHealthCheck();
      performanceAnalytics.captureSnapshot();
      monitoringPublisher.publishHealthUpdate();

      expect(publishSpy).toHaveBeenCalledWith(
        'system.health_update',
        expect.objectContaining({
          health: expect.any(Object),
          snapshot: expect.objectContaining({
            timestamp: expect.any(Number),
          }),
        })
      );
    });
  });

  describe('Publishing Metrics Snapshots', () => {
    it('should publish metrics snapshot', () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      performanceAnalytics.captureSnapshot();
      monitoringPublisher.publishMetricsSnapshot();

      expect(publishSpy).toHaveBeenCalledWith(
        'system.metrics_snapshot',
        expect.objectContaining({
          snapshot: expect.objectContaining({
            timestamp: expect.any(Number),
            events: expect.any(Object),
            websocket: expect.any(Object),
          }),
        })
      );
    });

    it('should not publish if no snapshot available', () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      monitoringPublisher.publishMetricsSnapshot();

      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('should include health in metrics snapshot', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      await healthMonitor.performHealthCheck();
      performanceAnalytics.captureSnapshot();
      monitoringPublisher.publishMetricsSnapshot();

      expect(publishSpy).toHaveBeenCalledWith(
        'system.metrics_snapshot',
        expect.objectContaining({
          snapshot: expect.any(Object),
          health: expect.objectContaining({
            status: expect.any(String),
          }),
        })
      );
    });
  });

  describe('Periodic Publishing', () => {
    it('should publish updates on start', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      await healthMonitor.performHealthCheck();
      performanceAnalytics.captureSnapshot();

      monitoringPublisher.start();

      // Should publish initial updates
      expect(publishSpy).toHaveBeenCalled();

      monitoringPublisher.stop();
    });

    it('should publish periodically', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      await healthMonitor.performHealthCheck();
      performanceAnalytics.captureSnapshot();

      monitoringPublisher.start();

      const initialCallCount = publishSpy.mock.calls.length;

      // Wait for at least one interval
      await new Promise((resolve) => setTimeout(resolve, 250));

      const finalCallCount = publishSpy.mock.calls.length;

      expect(finalCallCount).toBeGreaterThan(initialCallCount);

      monitoringPublisher.stop();
    });

    it('should stop publishing when stopped', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      await healthMonitor.performHealthCheck();
      performanceAnalytics.captureSnapshot();

      monitoringPublisher.start();
      monitoringPublisher.stop();

      publishSpy.mockClear();

      // Wait for would-be interval
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  describe('On-Demand Publishing', () => {
    it('should publish both health and metrics on demand', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      await healthMonitor.performHealthCheck();
      performanceAnalytics.captureSnapshot();

      monitoringPublisher.publishMonitoringUpdate();

      expect(publishSpy).toHaveBeenCalledWith(
        'system.health_update',
        expect.any(Object)
      );
      expect(publishSpy).toHaveBeenCalledWith(
        'system.metrics_snapshot',
        expect.any(Object)
      );
    });
  });

  describe('Empty Data Handling', () => {
    it('should create empty snapshot when none available', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      await healthMonitor.performHealthCheck();

      monitoringPublisher.publishHealthUpdate();

      expect(publishSpy).toHaveBeenCalledWith(
        'system.health_update',
        expect.objectContaining({
          snapshot: expect.objectContaining({
            timestamp: expect.any(Number),
            events: expect.objectContaining({
              total: 0,
            }),
          }),
        })
      );
    });

    it('should create empty health report when none available', () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      performanceAnalytics.captureSnapshot();

      monitoringPublisher.publishMetricsSnapshot();

      expect(publishSpy).toHaveBeenCalledWith(
        'system.metrics_snapshot',
        expect.objectContaining({
          health: expect.objectContaining({
            status: 'healthy',
            components: expect.arrayContaining([]),
          }),
        })
      );
    });
  });

  describe('Lifecycle Management', () => {
    it('should start publishing', () => {
      monitoringPublisher.start();

      // Should be running
    });

    it('should stop publishing', () => {
      monitoringPublisher.start();
      monitoringPublisher.stop();

      // Should be stopped
    });

    it('should handle multiple start calls', () => {
      monitoringPublisher.start();
      monitoringPublisher.start();

      // Should still work
      monitoringPublisher.stop();
    });

    it('should handle multiple stop calls', () => {
      monitoringPublisher.start();
      monitoringPublisher.stop();
      monitoringPublisher.stop();

      // Should not error
    });
  });

  describe('Integration', () => {
    it('should publish real monitoring data', async () => {
      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      // Setup monitoring data
      healthMonitor.registerComponent(
        'test-component',
        async () => ({
          name: 'test-component',
          status: 'healthy',
          message: 'OK',
          lastCheck: Date.now(),
        })
      );

      await healthMonitor.performHealthCheck();

      performanceAnalytics.recordEvent('intent.submitted');
      performanceAnalytics.recordWebSocketMessage('in', 100);
      performanceAnalytics.captureSnapshot();

      monitoringPublisher.publishMonitoringUpdate();

      // Verify health data
      const healthCall = publishSpy.mock.calls.find(
        (call) => call[0] === 'system.health_update'
      );
      expect(healthCall).toBeDefined();
      expect(healthCall![1]).toMatchObject({
        health: expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              name: 'test-component',
              status: 'healthy',
            }),
          ]),
        }),
      });

      // Verify metrics data
      const metricsCall = publishSpy.mock.calls.find(
        (call) => call[0] === 'system.metrics_snapshot'
      );
      expect(metricsCall).toBeDefined();
      expect(metricsCall![1]).toMatchObject({
        snapshot: expect.objectContaining({
          events: expect.objectContaining({
            total: expect.any(Number),
          }),
          websocket: expect.objectContaining({
            messagesIn: expect.any(Number),
          }),
        }),
      });
    });

    it('should respect configured intervals', async () => {
      const customConfig = {
        ...config,
        monitoringHealthCheckInterval: 200,
        monitoringMetricsInterval: 100,
      };

      const customPublisher = new MonitoringPublisher(
        customConfig,
        eventPublisher,
        healthMonitor,
        performanceAnalytics
      );

      const publishSpy = jest.spyOn(eventPublisher, 'publish');

      await healthMonitor.performHealthCheck();
      performanceAnalytics.captureSnapshot();

      customPublisher.start();

      const initialCalls = publishSpy.mock.calls.length;

      // Wait for metrics interval but not health interval
      await new Promise((resolve) => setTimeout(resolve, 150));

      const calls = publishSpy.mock.calls.filter(
        (call) => call[0] === 'system.metrics_snapshot'
      );

      expect(calls.length).toBeGreaterThan(0);

      customPublisher.stop();
    });
  });
});
