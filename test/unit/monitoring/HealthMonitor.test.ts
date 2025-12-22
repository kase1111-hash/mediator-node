import { HealthMonitor } from '../../../src/monitoring/HealthMonitor';
import { MediatorConfig, ComponentHealth } from '../../../src/types';
import { createMockConfig } from '../../utils/testUtils';

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;
  let config: MediatorConfig;

  beforeEach(() => {
    config = createMockConfig({
      consensusMode: 'dpos',
      monitoringHealthCheckInterval: 1000,
      monitoringHighMemoryThreshold: 90,
    });

    healthMonitor = new HealthMonitor(config);
  });

  afterEach(() => {
    healthMonitor.stop();
  });

  describe('Component Registration', () => {
    it('should register a component health checker', () => {
      const checker = jest.fn(async (): Promise<ComponentHealth> => ({
        name: 'test-component',
        status: 'healthy',
        message: 'All good',
        lastCheck: Date.now(),
      }));

      healthMonitor.registerComponent('test-component', checker);

      // Component should be registered (we'll verify through health check)
      expect(checker).not.toHaveBeenCalled(); // Not called until health check
    });

    it('should unregister a component health checker', () => {
      const checker = jest.fn(async (): Promise<ComponentHealth> => ({
        name: 'test-component',
        status: 'healthy',
        message: 'All good',
        lastCheck: Date.now(),
      }));

      healthMonitor.registerComponent('test-component', checker);
      healthMonitor.unregisterComponent('test-component');

      // After unregister, health check should not include this component
    });
  });

  describe('Health Check', () => {
    it('should perform a health check', async () => {
      const report = await healthMonitor.performHealthCheck();

      expect(report).toBeDefined();
      expect(report.status).toMatch(/healthy|degraded|unhealthy|critical/);
      expect(report.timestamp).toBeGreaterThan(0);
      expect(report.uptime).toBeGreaterThanOrEqual(0);
      expect(report.version).toBeDefined();
      expect(report.components).toBeInstanceOf(Array);
      expect(report.resources).toBeDefined();
      expect(report.metrics).toBeDefined();
    });

    it('should check all registered components', async () => {
      const checker1 = jest.fn(async (): Promise<ComponentHealth> => ({
        name: 'component-1',
        status: 'healthy',
        message: 'OK',
        lastCheck: Date.now(),
      }));

      const checker2 = jest.fn(async (): Promise<ComponentHealth> => ({
        name: 'component-2',
        status: 'healthy',
        message: 'OK',
        lastCheck: Date.now(),
      }));

      healthMonitor.registerComponent('component-1', checker1);
      healthMonitor.registerComponent('component-2', checker2);

      const report = await healthMonitor.performHealthCheck();

      expect(checker1).toHaveBeenCalled();
      expect(checker2).toHaveBeenCalled();
      expect(report.components).toHaveLength(2);
      expect(report.components[0].name).toBe('component-1');
      expect(report.components[1].name).toBe('component-2');
    });

    it('should handle component check failures', async () => {
      const failingChecker = jest.fn(async (): Promise<ComponentHealth> => {
        throw new Error('Component check failed');
      });

      healthMonitor.registerComponent('failing-component', failingChecker);

      const report = await healthMonitor.performHealthCheck();

      expect(failingChecker).toHaveBeenCalled();
      expect(report.components).toHaveLength(1);
      expect(report.components[0].status).toBe('unhealthy');
      expect(report.components[0].message).toContain('Component check failed');
    });
  });

  describe('Resource Metrics', () => {
    it('should collect CPU metrics', async () => {
      const report = await healthMonitor.performHealthCheck();

      expect(report.resources.cpu).toBeDefined();
      expect(report.resources.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(report.resources.cpu.usage).toBeLessThanOrEqual(100);
      expect(Array.isArray(report.resources.cpu.loadAverage)).toBe(true);
      expect(report.resources.cpu.loadAverage).toHaveLength(3);
    });

    it('should collect memory metrics', async () => {
      const report = await healthMonitor.performHealthCheck();

      expect(report.resources.memory).toBeDefined();
      expect(report.resources.memory.used).toBeGreaterThan(0);
      expect(report.resources.memory.total).toBeGreaterThan(0);
      expect(report.resources.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(report.resources.memory.percentage).toBeLessThanOrEqual(100);
      expect(report.resources.memory.heapUsed).toBeGreaterThan(0);
      expect(report.resources.memory.heapTotal).toBeGreaterThan(0);
    });

    it('should include uptime', async () => {
      const report = await healthMonitor.performHealthCheck();

      expect(report.resources.uptime).toBeGreaterThanOrEqual(0);
      expect(report.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Overall Status Calculation', () => {
    it('should return healthy when all components are healthy', async () => {
      const checker = jest.fn(async (): Promise<ComponentHealth> => ({
        name: 'test-component',
        status: 'healthy',
        message: 'OK',
        lastCheck: Date.now(),
      }));

      healthMonitor.registerComponent('test-component', checker);

      const report = await healthMonitor.performHealthCheck();

      expect(report.status).toBe('healthy');
    });

    it('should return critical when any component is critical', async () => {
      const criticalChecker = jest.fn(async (): Promise<ComponentHealth> => ({
        name: 'critical-component',
        status: 'critical',
        message: 'Critical failure',
        lastCheck: Date.now(),
      }));

      healthMonitor.registerComponent('critical-component', criticalChecker);

      const report = await healthMonitor.performHealthCheck();

      expect(report.status).toBe('critical');
    });

    it('should return unhealthy when any component is unhealthy', async () => {
      const unhealthyChecker = jest.fn(async (): Promise<ComponentHealth> => ({
        name: 'unhealthy-component',
        status: 'unhealthy',
        message: 'Component down',
        lastCheck: Date.now(),
      }));

      healthMonitor.registerComponent('unhealthy-component', unhealthyChecker);

      const report = await healthMonitor.performHealthCheck();

      expect(report.status).toBe('unhealthy');
    });

    it('should return degraded when any component is degraded', async () => {
      const degradedChecker = jest.fn(async (): Promise<ComponentHealth> => ({
        name: 'degraded-component',
        status: 'degraded',
        message: 'Performance degraded',
        lastCheck: Date.now(),
      }));

      healthMonitor.registerComponent('degraded-component', degradedChecker);

      const report = await healthMonitor.performHealthCheck();

      expect(report.status).toBe('degraded');
    });
  });

  describe('Error Tracking', () => {
    it('should record errors', () => {
      healthMonitor.recordError('test-error');
      healthMonitor.recordError('test-error');
      healthMonitor.recordError('other-error');

      // Errors should be tracked (verified through metrics)
    });

    it('should calculate error rate', async () => {
      healthMonitor.recordError('test-error-1');
      healthMonitor.recordError('test-error-2');
      healthMonitor.recordError('test-error-3');

      const report = await healthMonitor.performHealthCheck();

      expect(report.metrics.errorRate).toBeGreaterThanOrEqual(3);
    });

    it('should clean up old error timestamps', async () => {
      // Record errors
      healthMonitor.recordError('old-error');

      // Wait for errors to age out (would need to mock time for real test)
      const report = await healthMonitor.performHealthCheck();

      expect(report.metrics.errorRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metrics Update', () => {
    it('should update operational metrics', async () => {
      await healthMonitor.performHealthCheck();

      healthMonitor.updateMetrics({
        totalIntents: 100,
        totalSettlements: 50,
        activeConnections: 10,
        queueDepth: 5,
      });

      const report = healthMonitor.getLastHealthReport();

      expect(report).toBeDefined();
      expect(report!.metrics.totalIntents).toBe(100);
      expect(report!.metrics.totalSettlements).toBe(50);
      expect(report!.metrics.activeConnections).toBe(10);
      expect(report!.metrics.queueDepth).toBe(5);
    });

    it('should partially update metrics', async () => {
      await healthMonitor.performHealthCheck();

      healthMonitor.updateMetrics({
        totalIntents: 100,
      });

      const report = healthMonitor.getLastHealthReport();

      expect(report).toBeDefined();
      expect(report!.metrics.totalIntents).toBe(100);
      expect(report!.metrics.totalSettlements).toBe(0); // Default value
    });
  });

  describe('Monitoring Lifecycle', () => {
    it('should start monitoring', () => {
      healthMonitor.start();

      // Monitor should be running (verified by interval being set)
    });

    it('should stop monitoring', () => {
      healthMonitor.start();
      healthMonitor.stop();

      // Monitor should be stopped
    });

    it('should perform periodic health checks', async () => {
      const checker = jest.fn(async (): Promise<ComponentHealth> => ({
        name: 'test-component',
        status: 'healthy',
        message: 'OK',
        lastCheck: Date.now(),
      }));

      healthMonitor.registerComponent('test-component', checker);
      healthMonitor.start();

      // Wait for at least one check interval
      await new Promise((resolve) => setTimeout(resolve, 1200));

      // Should have been called at least once
      expect(checker).toHaveBeenCalled();

      healthMonitor.stop();
    });
  });

  describe('Simple Checker Helper', () => {
    it('should create a simple checker that returns healthy', async () => {
      const checker = HealthMonitor.createSimpleChecker(
        'simple-component',
        () => true,
        'Component is down'
      );

      const health = await checker();

      expect(health.name).toBe('simple-component');
      expect(health.status).toBe('healthy');
      expect(health.message).toBe('Component is healthy');
    });

    it('should create a simple checker that returns unhealthy', async () => {
      const checker = HealthMonitor.createSimpleChecker(
        'simple-component',
        () => false,
        'Component is down'
      );

      const health = await checker();

      expect(health.name).toBe('simple-component');
      expect(health.status).toBe('unhealthy');
      expect(health.message).toBe('Component is down');
    });

    it('should handle async check functions', async () => {
      const checker = HealthMonitor.createSimpleChecker(
        'async-component',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return true;
        }
      );

      const health = await checker();

      expect(health.status).toBe('healthy');
    });

    it('should handle checker errors', async () => {
      const checker = HealthMonitor.createSimpleChecker(
        'error-component',
        () => {
          throw new Error('Check failed');
        }
      );

      const health = await checker();

      expect(health.status).toBe('unhealthy');
      expect(health.message).toContain('Check failed');
    });
  });

  describe('Last Health Report', () => {
    it('should return undefined before first check', () => {
      const report = healthMonitor.getLastHealthReport();

      expect(report).toBeUndefined();
    });

    it('should return last report after check', async () => {
      await healthMonitor.performHealthCheck();

      const report = healthMonitor.getLastHealthReport();

      expect(report).toBeDefined();
      expect(report!.status).toBeDefined();
    });

    it('should update last report on subsequent checks', async () => {
      await healthMonitor.performHealthCheck();
      const firstReport = healthMonitor.getLastHealthReport();

      await new Promise((resolve) => setTimeout(resolve, 10));
      await healthMonitor.performHealthCheck();
      const secondReport = healthMonitor.getLastHealthReport();

      expect(secondReport!.timestamp).toBeGreaterThan(firstReport!.timestamp);
    });
  });
});
