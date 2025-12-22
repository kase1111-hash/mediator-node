import * as os from 'os';
import {
  HealthReport,
  HealthStatus,
  ComponentHealth,
  ResourceMetrics,
  MediatorConfig,
} from '../types';
import { logger } from '../utils/logger';

/**
 * Component health checker function
 */
export type HealthChecker = () => Promise<ComponentHealth>;

/**
 * HealthMonitor tracks system health including resources, components,
 * and overall system status
 */
export class HealthMonitor {
  private config: MediatorConfig;
  private startTime: number;
  private componentCheckers: Map<string, HealthChecker> = new Map();
  private lastHealthReport?: HealthReport;
  private monitoringInterval?: NodeJS.Timeout;
  private errorCounts: Map<string, number> = new Map();
  private errorWindow: number = 60000; // 1 minute
  private errorTimestamps: number[] = [];

  constructor(config: MediatorConfig) {
    this.config = config;
    this.startTime = Date.now();
  }

  /**
   * Register a component health checker
   */
  public registerComponent(name: string, checker: HealthChecker): void {
    this.componentCheckers.set(name, checker);
    logger.debug('Health checker registered', { component: name });
  }

  /**
   * Unregister a component health checker
   */
  public unregisterComponent(name: string): void {
    this.componentCheckers.delete(name);
    logger.debug('Health checker unregistered', { component: name });
  }

  /**
   * Start health monitoring
   */
  public start(): void {
    const interval = this.config.monitoringHealthCheckInterval || 30000;

    this.monitoringInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, interval);

    logger.info('Health monitoring started', { interval });

    // Perform initial health check
    this.performHealthCheck();
  }

  /**
   * Stop health monitoring
   */
  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    logger.info('Health monitoring stopped');
  }

  /**
   * Perform a health check
   */
  public async performHealthCheck(): Promise<HealthReport> {
    const timestamp = Date.now();

    // Collect resource metrics
    const resources = this.collectResourceMetrics();

    // Check all registered components
    const components = await this.checkComponents();

    // Calculate overall status
    const status = this.calculateOverallStatus(components, resources);

    // Collect operational metrics
    const metrics = {
      totalIntents: 0, // Will be populated by integration
      totalSettlements: 0,
      activeConnections: 0,
      queueDepth: 0,
      errorRate: this.calculateErrorRate(),
    };

    const report: HealthReport = {
      status,
      timestamp,
      uptime: this.getUptime(),
      version: this.getVersion(),
      components,
      resources,
      metrics,
    };

    this.lastHealthReport = report;

    // Log health status changes
    if (status !== 'healthy') {
      logger.warn('System health degraded', {
        status,
        unhealthyComponents: components
          .filter((c) => c.status !== 'healthy')
          .map((c) => c.name),
      });
    }

    return report;
  }

  /**
   * Get the last health report
   */
  public getLastHealthReport(): HealthReport | undefined {
    return this.lastHealthReport;
  }

  /**
   * Record an error for error rate tracking
   */
  public recordError(errorType: string): void {
    const now = Date.now();

    // Track error count by type
    const count = this.errorCounts.get(errorType) || 0;
    this.errorCounts.set(errorType, count + 1);

    // Track timestamps for rate calculation
    this.errorTimestamps.push(now);

    // Clean up old timestamps
    this.cleanupErrorTimestamps();
  }

  /**
   * Update operational metrics
   */
  public updateMetrics(metrics: {
    totalIntents?: number;
    totalSettlements?: number;
    activeConnections?: number;
    queueDepth?: number;
  }): void {
    if (this.lastHealthReport) {
      if (metrics.totalIntents !== undefined) {
        this.lastHealthReport.metrics.totalIntents = metrics.totalIntents;
      }
      if (metrics.totalSettlements !== undefined) {
        this.lastHealthReport.metrics.totalSettlements = metrics.totalSettlements;
      }
      if (metrics.activeConnections !== undefined) {
        this.lastHealthReport.metrics.activeConnections = metrics.activeConnections;
      }
      if (metrics.queueDepth !== undefined) {
        this.lastHealthReport.metrics.queueDepth = metrics.queueDepth;
      }
    }
  }

  /**
   * Collect system resource metrics
   */
  private collectResourceMetrics(): ResourceMetrics {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      cpu: {
        usage: this.getCPUUsage(),
        loadAverage: os.loadavg(),
      },
      memory: {
        used: usedMem,
        total: totalMem,
        percentage: (usedMem / totalMem) * 100,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
      },
      uptime: this.getUptime(),
      timestamp: Date.now(),
    };
  }

  /**
   * Get approximate CPU usage
   * Note: This is a simplified version. For production, consider using a library like 'pidusage'
   */
  private getCPUUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;

    // Handle edge case where total is 0 (can happen in test environments)
    if (total === 0) {
      return 0;
    }

    const usage = 100 - (100 * idle) / total;

    return Math.max(0, Math.min(100, usage));
  }

  /**
   * Check all registered components
   */
  private async checkComponents(): Promise<ComponentHealth[]> {
    const results: ComponentHealth[] = [];

    for (const [name, checker] of this.componentCheckers.entries()) {
      try {
        const startTime = Date.now();
        const health = await checker();
        const responseTime = Date.now() - startTime;

        results.push({
          ...health,
          responseTime,
        });
      } catch (error) {
        logger.error('Component health check failed', {
          component: name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        results.push({
          name,
          status: 'unhealthy',
          message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          lastCheck: Date.now(),
          errorCount: (this.errorCounts.get(name) || 0) + 1,
        });
      }
    }

    return results;
  }

  /**
   * Calculate overall system health status
   */
  private calculateOverallStatus(
    components: ComponentHealth[],
    resources: ResourceMetrics
  ): HealthStatus {
    // Check for critical components
    const criticalComponents = components.filter((c) => c.status === 'critical');
    if (criticalComponents.length > 0) {
      return 'critical';
    }

    // Check for unhealthy components
    const unhealthyComponents = components.filter((c) => c.status === 'unhealthy');
    if (unhealthyComponents.length > 0) {
      return 'unhealthy';
    }

    // Check resource thresholds
    const highMemoryThreshold = this.config.monitoringHighMemoryThreshold || 90;
    if (resources.memory.percentage > highMemoryThreshold) {
      return 'degraded';
    }

    // Check CPU usage (warning threshold)
    if (resources.cpu.usage > 80) {
      return 'degraded';
    }

    // Check for degraded components
    const degradedComponents = components.filter((c) => c.status === 'degraded');
    if (degradedComponents.length > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Calculate error rate (errors per minute)
   */
  private calculateErrorRate(): number {
    this.cleanupErrorTimestamps();
    return this.errorTimestamps.length;
  }

  /**
   * Clean up old error timestamps
   */
  private cleanupErrorTimestamps(): void {
    const cutoff = Date.now() - this.errorWindow;
    this.errorTimestamps = this.errorTimestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Get system uptime in seconds
   */
  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get application version
   */
  private getVersion(): string {
    try {
      // Try to read from package.json
      const pkg = require('../../package.json');
      return pkg.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  /**
   * Create a simple component health checker
   */
  public static createSimpleChecker(
    name: string,
    checkFn: () => boolean | Promise<boolean>,
    errorMessage?: string
  ): HealthChecker {
    return async (): Promise<ComponentHealth> => {
      try {
        const isHealthy = await checkFn();

        return {
          name,
          status: isHealthy ? 'healthy' : 'unhealthy',
          message: isHealthy ? 'Component is healthy' : (errorMessage || 'Component check failed'),
          lastCheck: Date.now(),
        };
      } catch (error) {
        return {
          name,
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Unknown error',
          lastCheck: Date.now(),
        };
      }
    };
  }
}
