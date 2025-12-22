import { nanoid } from 'nanoid';
import {
  PerformanceSnapshot,
  PerformanceAnalytics as PerformanceAnalyticsType,
  PerformanceAlert,
  MediatorConfig,
} from '../types';
import { logger } from '../utils/logger';

/**
 * Latency measurement tracker
 */
interface LatencyMeasurement {
  value: number;
  timestamp: number;
}

/**
 * Performance counter
 */
interface PerformanceCounter {
  count: number;
  lastReset: number;
}

/**
 * PerformanceAnalytics tracks system performance metrics including
 * throughput, latency, and connection statistics
 */
export class PerformanceAnalytics {
  private config: MediatorConfig;
  private startTime: number;
  private snapshotRetention: number;
  private metricsInterval: number;

  // Snapshots
  private snapshots: PerformanceSnapshot[] = [];
  private currentSnapshot?: PerformanceSnapshot;
  private lastSnapshotTime: number;

  // Counters
  private counters: Map<string, PerformanceCounter> = new Map();

  // Latency tracking
  private eventPublishLatencies: LatencyMeasurement[] = [];
  private llmRequestLatencies: LatencyMeasurement[] = [];
  private latencyRetention: number = 1000; // Keep last 1000 measurements

  // WebSocket metrics
  private websocketMetrics = {
    messagesIn: 0,
    messagesOut: 0,
    bytesIn: 0,
    bytesOut: 0,
    lastReset: Date.now(),
  };

  // Error tracking
  private errors: Map<string, number> = new Map();
  private errorTimestamps: number[] = [];

  // Alerts
  private alerts: PerformanceAlert[] = [];
  private alertRetention: number = 100;

  // Monitoring
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config: MediatorConfig) {
    this.config = config;
    this.startTime = Date.now();
    this.snapshotRetention = config.monitoringSnapshotRetention || 100;
    this.metricsInterval = config.monitoringMetricsInterval || 10000;
    this.lastSnapshotTime = Date.now();
  }

  /**
   * Start performance monitoring
   */
  public start(): void {
    this.monitoringInterval = setInterval(() => {
      this.captureSnapshot();
    }, this.metricsInterval);

    logger.info('Performance analytics started', { interval: this.metricsInterval });

    // Capture initial snapshot
    this.captureSnapshot();
  }

  /**
   * Stop performance monitoring
   */
  public stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    // Capture final snapshot
    this.captureSnapshot();

    logger.info('Performance analytics stopped');
  }

  /**
   * Capture a performance snapshot
   */
  public captureSnapshot(): PerformanceSnapshot {
    const now = Date.now();
    const interval = now - this.lastSnapshotTime;

    // Calculate rates
    const eventRate = this.calculateRate('events', interval);
    const messageRate = (this.websocketMetrics.messagesIn + this.websocketMetrics.messagesOut) / (interval / 1000);
    const bandwidth = (this.websocketMetrics.bytesIn + this.websocketMetrics.bytesOut) / (interval / 1000);
    const errorRate = this.calculateErrorRate();

    // Get event stats
    const eventStats = this.getEventStats();

    // Get WebSocket stats
    const wsStats = this.getWebSocketStats();

    // Calculate latencies
    const eventPublishLatency = this.calculateLatencyStats(this.eventPublishLatencies);
    const llmRequestLatency = this.calculateLatencyStats(this.llmRequestLatencies);

    const snapshot: PerformanceSnapshot = {
      timestamp: now,
      interval,

      events: {
        total: eventStats.total,
        rate: eventRate,
        byType: eventStats.byType,
        published: eventStats.published,
        filtered: eventStats.filtered,
        queueSize: eventStats.queueSize,
      },

      websocket: {
        connections: wsStats.connections,
        authenticated: wsStats.authenticated,
        messagesIn: this.websocketMetrics.messagesIn,
        messagesOut: this.websocketMetrics.messagesOut,
        messageRate,
        bytesIn: this.websocketMetrics.bytesIn,
        bytesOut: this.websocketMetrics.bytesOut,
        bandwidth,
        subscriptions: wsStats.subscriptions,
      },

      operations: {
        intentsIngested: this.getCounter('intentsIngested'),
        settlementsProposed: this.getCounter('settlementsProposed'),
        challengesSubmitted: this.getCounter('challengesSubmitted'),
        burnsExecuted: this.getCounter('burnsExecuted'),
        receiptsGenerated: this.getCounter('receiptsGenerated'),
        disputesInitiated: this.getCounter('disputesInitiated'),
      },

      latency: {
        eventPublish: eventPublishLatency,
        llmRequests: llmRequestLatency,
      },

      errors: {
        total: this.errorTimestamps.length,
        rate: errorRate,
        byType: Object.fromEntries(this.errors),
      },
    };

    // Store snapshot
    this.snapshots.push(snapshot);

    // Trim old snapshots
    if (this.snapshots.length > this.snapshotRetention) {
      this.snapshots = this.snapshots.slice(-this.snapshotRetention);
    }

    // Reset interval counters
    this.resetWebSocketMetrics();
    this.lastSnapshotTime = now;
    this.currentSnapshot = snapshot;

    // Check for alerts
    this.checkAlertThresholds(snapshot);

    return snapshot;
  }

  /**
   * Get current snapshot
   */
  public getCurrentSnapshot(): PerformanceSnapshot | undefined {
    return this.currentSnapshot;
  }

  /**
   * Get all snapshots
   */
  public getSnapshots(): PerformanceSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get performance analytics summary
   */
  public getAnalyticsSummary(): PerformanceAnalyticsType {
    if (this.snapshots.length === 0) {
      this.captureSnapshot();
    }

    const now = Date.now();
    const duration = now - this.startTime;

    // Calculate aggregate statistics
    const totalEvents = this.snapshots.reduce((sum, s) => sum + s.events.total, 0);
    const totalMessages = this.snapshots.reduce(
      (sum, s) => sum + s.websocket.messagesIn + s.websocket.messagesOut,
      0
    );
    const totalErrors = this.snapshots.reduce((sum, s) => sum + s.errors.total, 0);

    const avgEventRate = totalEvents / (duration / 1000);
    const avgMessageRate = totalMessages / (duration / 1000);
    const avgErrorRate = totalErrors / (duration / 60000);

    const peakEventRate = Math.max(...this.snapshots.map((s) => s.events.rate));
    const peakMessageRate = Math.max(...this.snapshots.map((s) => s.websocket.messageRate));

    // Calculate trends
    const trends = this.calculateTrends();

    return {
      period: {
        start: this.startTime,
        end: now,
        duration,
      },

      summary: {
        totalEvents,
        totalMessages,
        totalErrors,
        averageEventRate: avgEventRate,
        averageMessageRate: avgMessageRate,
        averageErrorRate: avgErrorRate,
        peakEventRate,
        peakMessageRate,
        uptimePercentage: 100, // Could track downtime if needed
      },

      snapshots: this.snapshots,

      trends,

      alerts: this.alerts.slice(-this.alertRetention),
    };
  }

  /**
   * Record event publication
   */
  public recordEvent(eventType: string): void {
    this.incrementCounter('events');
    this.incrementCounter(`event_${eventType}`);
  }

  /**
   * Record event publish latency
   */
  public recordEventPublishLatency(latencyMs: number): void {
    this.eventPublishLatencies.push({
      value: latencyMs,
      timestamp: Date.now(),
    });

    // Trim old measurements
    if (this.eventPublishLatencies.length > this.latencyRetention) {
      this.eventPublishLatencies = this.eventPublishLatencies.slice(-this.latencyRetention);
    }
  }

  /**
   * Record LLM request latency
   */
  public recordLLMRequestLatency(latencyMs: number): void {
    this.llmRequestLatencies.push({
      value: latencyMs,
      timestamp: Date.now(),
    });

    // Trim old measurements
    if (this.llmRequestLatencies.length > this.latencyRetention) {
      this.llmRequestLatencies = this.llmRequestLatencies.slice(-this.latencyRetention);
    }
  }

  /**
   * Record WebSocket message
   */
  public recordWebSocketMessage(direction: 'in' | 'out', bytes: number): void {
    if (direction === 'in') {
      this.websocketMetrics.messagesIn++;
      this.websocketMetrics.bytesIn += bytes;
    } else {
      this.websocketMetrics.messagesOut++;
      this.websocketMetrics.bytesOut += bytes;
    }
  }

  /**
   * Record operation
   */
  public recordOperation(operation: string): void {
    this.incrementCounter(operation);
  }

  /**
   * Record error
   */
  public recordError(errorType: string): void {
    this.errorTimestamps.push(Date.now());
    const count = this.errors.get(errorType) || 0;
    this.errors.set(errorType, count + 1);

    // Clean up old timestamps
    this.cleanupErrorTimestamps();
  }

  /**
   * Get recent alerts
   */
  public getAlerts(): PerformanceAlert[] {
    return [...this.alerts];
  }

  /**
   * Clear alerts
   */
  public clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Increment a counter
   */
  private incrementCounter(name: string): void {
    const counter = this.counters.get(name) || { count: 0, lastReset: Date.now() };
    counter.count++;
    this.counters.set(name, counter);
  }

  /**
   * Get counter value
   */
  private getCounter(name: string): number {
    return this.counters.get(name)?.count || 0;
  }

  /**
   * Calculate rate for a counter
   */
  private calculateRate(counterName: string, intervalMs: number): number {
    const count = this.getCounter(counterName);
    return count / (intervalMs / 1000);
  }

  /**
   * Get event statistics
   */
  private getEventStats(): {
    total: number;
    byType: Record<string, number>;
    published: number;
    filtered: number;
    queueSize: number;
  } {
    const byType: Record<string, number> = {};

    for (const [name, counter] of this.counters.entries()) {
      if (name.startsWith('event_')) {
        const eventType = name.substring(6);
        byType[eventType] = counter.count;
      }
    }

    return {
      total: this.getCounter('events'),
      byType,
      published: this.getCounter('eventsPublished'),
      filtered: this.getCounter('eventsFiltered'),
      queueSize: 0, // Would need to query EventPublisher
    };
  }

  /**
   * Get WebSocket statistics
   */
  private getWebSocketStats(): {
    connections: number;
    authenticated: number;
    subscriptions: number;
  } {
    return {
      connections: this.getCounter('wsConnections'),
      authenticated: this.getCounter('wsAuthenticated'),
      subscriptions: this.getCounter('wsSubscriptions'),
    };
  }

  /**
   * Calculate latency statistics
   */
  private calculateLatencyStats(measurements: LatencyMeasurement[]): {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    if (measurements.length === 0) {
      return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const values = measurements.map((m) => m.value).sort((a, b) => a - b);

    const min = values[0];
    const max = values[values.length - 1];
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

    const p50 = this.percentile(values, 50);
    const p95 = this.percentile(values, 95);
    const p99 = this.percentile(values, 99);

    return { min, max, avg, p50, p95, p99 };
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;

    const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
    return sortedValues[Math.max(0, index)];
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
    const cutoff = Date.now() - 60000; // 1 minute
    this.errorTimestamps = this.errorTimestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Reset WebSocket metrics for next interval
   */
  private resetWebSocketMetrics(): void {
    this.websocketMetrics.messagesIn = 0;
    this.websocketMetrics.messagesOut = 0;
    this.websocketMetrics.bytesIn = 0;
    this.websocketMetrics.bytesOut = 0;
    this.websocketMetrics.lastReset = Date.now();
  }

  /**
   * Calculate trends
   */
  private calculateTrends(): {
    eventRate: 'increasing' | 'stable' | 'decreasing';
    connectionCount: 'increasing' | 'stable' | 'decreasing';
    errorRate: 'increasing' | 'stable' | 'decreasing';
  } {
    if (this.snapshots.length < 3) {
      return {
        eventRate: 'stable',
        connectionCount: 'stable',
        errorRate: 'stable',
      };
    }

    const recent = this.snapshots.slice(-10);

    return {
      eventRate: this.analyzeTrend(recent.map((s) => s.events.rate)),
      connectionCount: this.analyzeTrend(recent.map((s) => s.websocket.connections)),
      errorRate: this.analyzeTrend(recent.map((s) => s.errors.rate)),
    };
  }

  /**
   * Analyze trend from values
   */
  private analyzeTrend(values: number[]): 'increasing' | 'stable' | 'decreasing' {
    if (values.length < 2) return 'stable';

    const first = values.slice(0, Math.floor(values.length / 2));
    const second = values.slice(Math.floor(values.length / 2));

    const firstAvg = first.reduce((sum, v) => sum + v, 0) / first.length;
    const secondAvg = second.reduce((sum, v) => sum + v, 0) / second.length;

    const change = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;

    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Check alert thresholds
   */
  private checkAlertThresholds(snapshot: PerformanceSnapshot): void {
    // High latency alert
    const latencyThreshold = this.config.monitoringHighLatencyThreshold || 1000;
    if (snapshot.latency.eventPublish.p95 > latencyThreshold) {
      this.createAlert({
        severity: 'warning',
        type: 'high_latency',
        message: `High event publish latency detected (P95: ${snapshot.latency.eventPublish.p95.toFixed(2)}ms)`,
        value: snapshot.latency.eventPublish.p95,
        threshold: latencyThreshold,
      });
    }

    // High error rate alert
    const errorRateThreshold = this.config.monitoringHighErrorRateThreshold || 10;
    if (snapshot.errors.rate > errorRateThreshold) {
      this.createAlert({
        severity: 'error',
        type: 'high_error_rate',
        message: `High error rate detected (${snapshot.errors.rate.toFixed(1)} errors/min)`,
        value: snapshot.errors.rate,
        threshold: errorRateThreshold,
      });
    }

    // High queue depth alert
    if (snapshot.events.queueSize > 100) {
      this.createAlert({
        severity: 'warning',
        type: 'high_queue_depth',
        message: `High event queue depth (${snapshot.events.queueSize} events)`,
        value: snapshot.events.queueSize,
        threshold: 100,
      });
    }
  }

  /**
   * Create an alert
   */
  private createAlert(alert: Omit<PerformanceAlert, 'id' | 'timestamp'>): void {
    const newAlert: PerformanceAlert = {
      id: nanoid(),
      timestamp: Date.now(),
      ...alert,
    };

    this.alerts.push(newAlert);

    // Trim old alerts
    if (this.alerts.length > this.alertRetention) {
      this.alerts = this.alerts.slice(-this.alertRetention);
    }

    logger.warn('Performance alert', {
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
    });
  }
}
