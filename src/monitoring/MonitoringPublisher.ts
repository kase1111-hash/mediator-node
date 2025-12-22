import { EventPublisher } from '../websocket/EventPublisher';
import { HealthMonitor } from './HealthMonitor';
import { PerformanceAnalytics } from './PerformanceAnalytics';
import { MediatorConfig, MetricsEventPayload } from '../types';
import { logger } from '../utils/logger';

/**
 * MonitoringPublisher broadcasts real-time health and performance metrics
 * via WebSocket to subscribed clients
 */
export class MonitoringPublisher {
  private config: MediatorConfig;
  private eventPublisher: EventPublisher;
  private healthMonitor: HealthMonitor;
  private performanceAnalytics: PerformanceAnalytics;
  private publishInterval?: NodeJS.Timeout;
  private healthPublishInterval: number;
  private metricsPublishInterval: number;

  constructor(
    config: MediatorConfig,
    eventPublisher: EventPublisher,
    healthMonitor: HealthMonitor,
    performanceAnalytics: PerformanceAnalytics
  ) {
    this.config = config;
    this.eventPublisher = eventPublisher;
    this.healthMonitor = healthMonitor;
    this.performanceAnalytics = performanceAnalytics;

    // Default to publishing health every 30s and metrics every 10s
    this.healthPublishInterval = config.monitoringHealthCheckInterval || 30000;
    this.metricsPublishInterval = config.monitoringMetricsInterval || 10000;
  }

  /**
   * Start broadcasting monitoring events
   */
  public start(): void {
    // Use the shorter interval for the main loop
    const publishInterval = Math.min(
      this.healthPublishInterval,
      this.metricsPublishInterval
    );

    let healthCounter = 0;
    let metricsCounter = 0;

    this.publishInterval = setInterval(() => {
      healthCounter += publishInterval;
      metricsCounter += publishInterval;

      // Publish metrics snapshot
      if (metricsCounter >= this.metricsPublishInterval) {
        this.publishMetricsSnapshot();
        metricsCounter = 0;
      }

      // Publish health update
      if (healthCounter >= this.healthPublishInterval) {
        this.publishHealthUpdate();
        healthCounter = 0;
      }
    }, publishInterval);

    logger.info('Monitoring publisher started', {
      healthInterval: this.healthPublishInterval,
      metricsInterval: this.metricsPublishInterval,
    });

    // Publish initial updates
    this.publishHealthUpdate();
    this.publishMetricsSnapshot();
  }

  /**
   * Stop broadcasting monitoring events
   */
  public stop(): void {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = undefined;
    }

    logger.info('Monitoring publisher stopped');
  }

  /**
   * Publish current health status
   */
  public publishHealthUpdate(): void {
    const healthReport = this.healthMonitor.getLastHealthReport();
    const snapshot = this.performanceAnalytics.getCurrentSnapshot();

    if (!healthReport) {
      logger.debug('No health report available to publish');
      return;
    }

    const payload: MetricsEventPayload = {
      health: healthReport,
      snapshot: snapshot || this.createEmptySnapshot(),
    };

    this.eventPublisher.publish('system.health_update', payload);

    logger.debug('Health update published', {
      status: healthReport.status,
      components: healthReport.components.length,
    });
  }

  /**
   * Publish current performance metrics snapshot
   */
  public publishMetricsSnapshot(): void {
    const snapshot = this.performanceAnalytics.getCurrentSnapshot();
    const healthReport = this.healthMonitor.getLastHealthReport();

    if (!snapshot) {
      logger.debug('No metrics snapshot available to publish');
      return;
    }

    const payload: MetricsEventPayload = {
      snapshot,
      health: healthReport || this.createEmptyHealthReport(),
    };

    this.eventPublisher.publish('system.metrics_snapshot', payload);

    logger.debug('Metrics snapshot published', {
      eventRate: snapshot.events.rate.toFixed(2),
      connections: snapshot.websocket.connections,
      errorRate: snapshot.errors.rate,
    });
  }

  /**
   * Publish on-demand monitoring update with latest data
   */
  public publishMonitoringUpdate(): void {
    this.publishHealthUpdate();
    this.publishMetricsSnapshot();
  }

  /**
   * Create an empty snapshot for cases where no snapshot is available
   */
  private createEmptySnapshot(): any {
    return {
      timestamp: Date.now(),
      interval: 0,
      events: {
        total: 0,
        rate: 0,
        byType: {},
        published: 0,
        filtered: 0,
        queueSize: 0,
      },
      websocket: {
        connections: 0,
        authenticated: 0,
        messagesIn: 0,
        messagesOut: 0,
        messageRate: 0,
        bytesIn: 0,
        bytesOut: 0,
        bandwidth: 0,
        subscriptions: 0,
      },
      operations: {
        intentsIngested: 0,
        settlementsProposed: 0,
        challengesSubmitted: 0,
        burnsExecuted: 0,
        receiptsGenerated: 0,
        disputesInitiated: 0,
      },
      latency: {
        eventPublish: {
          min: 0,
          max: 0,
          avg: 0,
          p50: 0,
          p95: 0,
          p99: 0,
        },
        llmRequests: {
          min: 0,
          max: 0,
          avg: 0,
          p50: 0,
          p95: 0,
          p99: 0,
        },
      },
      errors: {
        total: 0,
        rate: 0,
        byType: {},
      },
    };
  }

  /**
   * Create an empty health report for cases where no report is available
   */
  private createEmptyHealthReport(): any {
    return {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: 0,
      version: '1.0.0',
      components: [],
      resources: {
        cpu: {
          usage: 0,
          loadAverage: [0, 0, 0],
        },
        memory: {
          used: 0,
          total: 0,
          percentage: 0,
          heapUsed: 0,
          heapTotal: 0,
        },
        uptime: 0,
        timestamp: Date.now(),
      },
      metrics: {
        totalIntents: 0,
        totalSettlements: 0,
        activeConnections: 0,
        queueDepth: 0,
        errorRate: 0,
      },
    };
  }
}
