import { MediatorConfig } from '../types';
import { logger } from '../utils/logger';
import { BurnManager } from './BurnManager';

/**
 * LoadMetrics tracks current network load indicators
 */
export interface LoadMetrics {
  intentSubmissionRate: number; // Intents per minute
  activeIntentCount: number; // Current pending intents
  settlementRate: number; // Settlements per minute
  avgBurnAmount: number; // Average burn per submission
  timestamp: number;
}

/**
 * LoadMonitor dynamically adjusts burn multipliers based on network congestion
 *
 * Core Principles:
 * - Higher network load = higher burn multiplier (congestion pricing)
 * - Smooth transitions to avoid sudden cost spikes
 * - Configurable thresholds and sensitivity
 * - Real-time metrics tracking
 */
export class LoadMonitor {
  private config: MediatorConfig;
  private burnManager: BurnManager;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  // Metrics tracking
  private intentSubmissions: number[] = []; // Timestamps of recent submissions
  private settlementSubmissions: number[] = []; // Timestamps of recent settlements
  private activeIntents: number = 0;
  private burnAmounts: number[] = []; // Recent burn amounts

  // Load calculation
  private currentLoadMultiplier: number = 1.0;
  private targetIntentRate: number; // Target intents/minute (baseline)
  private maxIntentRate: number; // Maximum sustainable rate
  private smoothingFactor: number; // For gradual adjustments (0-1)

  // History for analytics
  private loadHistory: LoadMetrics[] = [];
  private maxHistorySize: number = 1000;

  constructor(config: MediatorConfig, burnManager: BurnManager) {
    this.config = config;
    this.burnManager = burnManager;

    // Load configuration with defaults
    this.targetIntentRate = config.targetIntentRate || 10; // 10 intents/min baseline
    this.maxIntentRate = config.maxIntentRate || 50; // 50 intents/min max
    this.smoothingFactor = config.loadSmoothingFactor || 0.3; // 30% adjustment per interval

    logger.info('LoadMonitor initialized', {
      targetRate: this.targetIntentRate,
      maxRate: this.maxIntentRate,
      smoothing: this.smoothingFactor,
    });
  }

  /**
   * Start monitoring network load
   */
  public startMonitoring(intervalMs: number = 30000): void {
    if (this.isMonitoring) {
      logger.warn('LoadMonitor already running');
      return;
    }

    logger.info('Starting load monitoring', { intervalMs });
    this.isMonitoring = true;

    // Initial calculation
    this.calculateAndUpdateLoadMultiplier();

    // Periodic updates
    this.monitoringInterval = setInterval(() => {
      this.calculateAndUpdateLoadMultiplier();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('Load monitoring stopped');
  }

  /**
   * Record an intent submission
   */
  public recordIntentSubmission(burnAmount: number): void {
    const now = Date.now();
    this.intentSubmissions.push(now);
    this.burnAmounts.push(burnAmount);
    this.activeIntents++;

    // Cleanup old submissions (older than 5 minutes)
    this.cleanupOldRecords();
  }

  /**
   * Record a settlement submission
   */
  public recordSettlement(): void {
    const now = Date.now();
    this.settlementSubmissions.push(now);
    if (this.activeIntents > 0) {
      this.activeIntents--;
    }

    this.cleanupOldRecords();
  }

  /**
   * Calculate current load metrics
   */
  public getCurrentMetrics(): LoadMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Calculate rates (per minute)
    const recentIntents = this.intentSubmissions.filter(t => t > oneMinuteAgo);
    const recentSettlements = this.settlementSubmissions.filter(t => t > oneMinuteAgo);

    const intentRate = recentIntents.length;
    const settlementRate = recentSettlements.length;

    // Calculate average burn
    const recentBurns = this.burnAmounts.slice(-100); // Last 100 burns
    const avgBurn = recentBurns.length > 0
      ? recentBurns.reduce((sum, b) => sum + b, 0) / recentBurns.length
      : 0;

    return {
      intentSubmissionRate: intentRate,
      activeIntentCount: this.activeIntents,
      settlementRate,
      avgBurnAmount: avgBurn,
      timestamp: now,
    };
  }

  /**
   * Calculate and update load multiplier based on current metrics
   */
  private calculateAndUpdateLoadMultiplier(): void {
    const metrics = this.getCurrentMetrics();

    // Calculate load factor (0.0 = no load, 1.0 = at target, >1.0 = overloaded)
    const loadFactor = metrics.intentSubmissionRate / this.targetIntentRate;

    // Calculate target multiplier based on load
    let targetMultiplier = 1.0;

    if (loadFactor <= 1.0) {
      // Under target load - maintain base multiplier
      targetMultiplier = 1.0;
    } else if (loadFactor <= this.maxIntentRate / this.targetIntentRate) {
      // Between target and max - linear scaling
      const overage = loadFactor - 1.0;
      const maxOverage = (this.maxIntentRate / this.targetIntentRate) - 1.0;
      const scalingRange = (this.config.maxLoadMultiplier || 10) - 1.0;

      targetMultiplier = 1.0 + (overage / maxOverage) * scalingRange;
    } else {
      // Above max rate - use max multiplier
      targetMultiplier = this.config.maxLoadMultiplier || 10;
    }

    // Smooth transition using exponential moving average
    const previousMultiplier = this.currentLoadMultiplier;
    this.currentLoadMultiplier =
      previousMultiplier * (1 - this.smoothingFactor) +
      targetMultiplier * this.smoothingFactor;

    // Clamp to valid range
    this.currentLoadMultiplier = Math.max(
      1.0,
      Math.min(this.currentLoadMultiplier, this.config.maxLoadMultiplier || 10)
    );

    // Update BurnManager if load scaling is enabled
    if (this.config.loadScalingEnabled) {
      this.burnManager.updateLoadMultiplier(this.currentLoadMultiplier);
    }

    // Log significant changes
    const multiplierChange = Math.abs(this.currentLoadMultiplier - previousMultiplier);
    if (multiplierChange > 0.1) {
      logger.info('Load multiplier updated', {
        previous: previousMultiplier.toFixed(2),
        current: this.currentLoadMultiplier.toFixed(2),
        loadFactor: loadFactor.toFixed(2),
        intentRate: metrics.intentSubmissionRate,
        targetRate: this.targetIntentRate,
      });
    }

    // Store metrics in history
    this.storeMetrics(metrics);
  }

  /**
   * Store metrics in history
   */
  private storeMetrics(metrics: LoadMetrics): void {
    this.loadHistory.push(metrics);

    // Limit history size
    if (this.loadHistory.length > this.maxHistorySize) {
      this.loadHistory.shift();
    }
  }

  /**
   * Cleanup old records (older than 5 minutes)
   */
  private cleanupOldRecords(): void {
    const fiveMinutesAgo = Date.now() - 300000;

    this.intentSubmissions = this.intentSubmissions.filter(t => t > fiveMinutesAgo);
    this.settlementSubmissions = this.settlementSubmissions.filter(t => t > fiveMinutesAgo);

    // Keep only last 1000 burn amounts
    if (this.burnAmounts.length > 1000) {
      this.burnAmounts = this.burnAmounts.slice(-1000);
    }
  }

  /**
   * Get current load multiplier
   */
  public getLoadMultiplier(): number {
    return this.currentLoadMultiplier;
  }

  /**
   * Get load history for analytics
   */
  public getLoadHistory(limit?: number): LoadMetrics[] {
    if (limit) {
      return this.loadHistory.slice(-limit);
    }
    return [...this.loadHistory];
  }

  /**
   * Get comprehensive load statistics
   */
  public getLoadStats(): {
    currentMetrics: LoadMetrics;
    currentMultiplier: number;
    targetRate: number;
    maxRate: number;
    loadFactor: number;
    historicalAverage: {
      intentRate: number;
      settlementRate: number;
      avgBurn: number;
    };
  } {
    const currentMetrics = this.getCurrentMetrics();
    const loadFactor = currentMetrics.intentSubmissionRate / this.targetIntentRate;

    // Calculate historical averages
    const recentHistory = this.loadHistory.slice(-60); // Last 60 data points
    const historicalAverage = {
      intentRate: 0,
      settlementRate: 0,
      avgBurn: 0,
    };

    if (recentHistory.length > 0) {
      historicalAverage.intentRate =
        recentHistory.reduce((sum, m) => sum + m.intentSubmissionRate, 0) / recentHistory.length;
      historicalAverage.settlementRate =
        recentHistory.reduce((sum, m) => sum + m.settlementRate, 0) / recentHistory.length;
      historicalAverage.avgBurn =
        recentHistory.reduce((sum, m) => sum + m.avgBurnAmount, 0) / recentHistory.length;
    }

    return {
      currentMetrics,
      currentMultiplier: this.currentLoadMultiplier,
      targetRate: this.targetIntentRate,
      maxRate: this.maxIntentRate,
      loadFactor,
      historicalAverage,
    };
  }

  /**
   * Force an immediate load calculation update (for testing)
   */
  public forceUpdate(): void {
    this.calculateAndUpdateLoadMultiplier();
  }

  /**
   * Reset load monitor state (for testing)
   */
  public reset(): void {
    this.intentSubmissions = [];
    this.settlementSubmissions = [];
    this.activeIntents = 0;
    this.burnAmounts = [];
    this.currentLoadMultiplier = 1.0;
    this.loadHistory = [];
    this.burnManager.updateLoadMultiplier(1.0);
  }
}
