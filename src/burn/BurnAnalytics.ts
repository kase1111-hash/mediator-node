import {
  BurnTransaction,
  BurnType,
  TimeWindow,
  BurnTimeSeriesData,
  BurnTrendAnalysis,
  UserBurnAnalytics,
  BurnLeaderboard,
  DashboardMetrics,
  BurnForecast,
  UserSubmissionRecord,
} from '../types';
import { logger } from '../utils/logger';

/**
 * BurnAnalytics provides comprehensive analytics and reporting for burn data
 * Supports time-series aggregation, trend analysis, user analytics, and dashboard metrics
 */
export class BurnAnalytics {
  private burnHistory: BurnTransaction[];
  private userSubmissions: Map<string, UserSubmissionRecord>;
  private loadMultiplierHistory: Array<{ timestamp: number; multiplier: number }> = [];

  constructor(
    burnHistory: BurnTransaction[],
    userSubmissions: Map<string, UserSubmissionRecord>
  ) {
    this.burnHistory = burnHistory;
    this.userSubmissions = userSubmissions;
  }

  /**
   * Update analytics with new data
   */
  public updateData(
    burnHistory: BurnTransaction[],
    userSubmissions: Map<string, UserSubmissionRecord>
  ): void {
    this.burnHistory = burnHistory;
    this.userSubmissions = userSubmissions;
  }

  /**
   * Record load multiplier for historical tracking
   */
  public recordLoadMultiplier(multiplier: number): void {
    this.loadMultiplierHistory.push({
      timestamp: Date.now(),
      multiplier,
    });

    // Keep only last 1000 data points
    if (this.loadMultiplierHistory.length > 1000) {
      this.loadMultiplierHistory = this.loadMultiplierHistory.slice(-1000);
    }
  }

  /**
   * Get burn data aggregated by time window
   */
  public getTimeSeriesData(window: TimeWindow, limit: number = 100): BurnTimeSeriesData[] {
    const now = Date.now();
    const windowMs = this.getWindowDuration(window);
    const startTime = now - windowMs * limit;

    // Group burns by time buckets
    const buckets = new Map<number, BurnTransaction[]>();

    for (const burn of this.burnHistory) {
      if (burn.timestamp >= startTime) {
        const bucketTime = this.getBucketTimestamp(burn.timestamp, window);
        if (!buckets.has(bucketTime)) {
          buckets.set(bucketTime, []);
        }
        buckets.get(bucketTime)!.push(burn);
      }
    }

    // Convert to time series data
    const timeSeries: BurnTimeSeriesData[] = [];
    const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);

    for (const [timestamp, burns] of sortedBuckets) {
      const uniqueUsers = new Set(burns.map(b => b.author)).size;
      const totalAmount = burns.reduce((sum, b) => sum + b.amount, 0);

      const byType = {
        base_filing: burns.filter(b => b.type === 'base_filing').reduce((sum, b) => sum + b.amount, 0),
        escalated: burns.filter(b => b.type === 'escalated').reduce((sum, b) => sum + b.amount, 0),
        success: burns.filter(b => b.type === 'success').reduce((sum, b) => sum + b.amount, 0),
        load_scaled: burns.filter(b => b.type === 'load_scaled').reduce((sum, b) => sum + b.amount, 0),
      };

      timeSeries.push({
        timestamp,
        totalBurns: burns.length,
        totalAmount,
        averageBurn: burns.length > 0 ? totalAmount / burns.length : 0,
        uniqueUsers,
        byType,
      });
    }

    return timeSeries.slice(-limit);
  }

  /**
   * Get trend analysis for a specific time period
   */
  public getTrendAnalysis(period: TimeWindow): BurnTrendAnalysis {
    const timeSeries = this.getTimeSeriesData(period, 100);
    const now = Date.now();
    const periodMs = this.getWindowDuration(period);

    // Current period burns
    const currentPeriodBurns = this.burnHistory.filter(
      b => b.timestamp >= now - periodMs
    );

    // Previous period burns (for growth calculation)
    const previousPeriodBurns = this.burnHistory.filter(
      b => b.timestamp >= now - periodMs * 2 && b.timestamp < now - periodMs
    );

    // Calculate summary metrics
    const totalBurns = currentPeriodBurns.length;
    const totalAmount = currentPeriodBurns.reduce((sum, b) => sum + b.amount, 0);
    const uniqueUsers = new Set(currentPeriodBurns.map(b => b.author)).size;

    const previousAmount = previousPeriodBurns.reduce((sum, b) => sum + b.amount, 0);
    const growthRate = previousAmount > 0
      ? ((totalAmount - previousAmount) / previousAmount) * 100
      : 0;

    // Find peak burn time
    const peakBucket = timeSeries.reduce(
      (max, current) => (current.totalAmount > max.totalAmount ? current : max),
      timeSeries[0] || { timestamp: now, totalAmount: 0 } as BurnTimeSeriesData
    );

    return {
      period,
      dataPoints: timeSeries,
      summary: {
        totalBurns,
        totalAmount,
        averageBurnPerTransaction: totalBurns > 0 ? totalAmount / totalBurns : 0,
        averageBurnPerUser: uniqueUsers > 0 ? totalAmount / uniqueUsers : 0,
        growthRate,
        peakBurnTime: peakBucket.timestamp,
        activeUsers: uniqueUsers,
      },
    };
  }

  /**
   * Get user-specific burn analytics
   */
  public getUserAnalytics(userId: string): UserBurnAnalytics | null {
    const userBurns = this.burnHistory.filter(b => b.author === userId);

    if (userBurns.length === 0) {
      return null;
    }

    const totalAmount = userBurns.reduce((sum, b) => sum + b.amount, 0);
    const firstBurn = Math.min(...userBurns.map(b => b.timestamp));
    const lastBurn = Math.max(...userBurns.map(b => b.timestamp));

    const burnsByType: Record<BurnType, number> = {
      base_filing: userBurns.filter(b => b.type === 'base_filing').length,
      escalated: userBurns.filter(b => b.type === 'escalated').length,
      success: userBurns.filter(b => b.type === 'success').length,
      load_scaled: userBurns.filter(b => b.type === 'load_scaled').length,
    };

    const daysSinceFirstBurn = (Date.now() - firstBurn) / (1000 * 60 * 60 * 24);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const isActive = lastBurn >= sevenDaysAgo;

    return {
      userId,
      totalBurns: userBurns.length,
      totalAmount,
      averageBurn: totalAmount / userBurns.length,
      firstBurn,
      lastBurn,
      burnsByType,
      daysSinceFirstBurn,
      isActive,
    };
  }

  /**
   * Get all active users' analytics
   */
  public getAllUserAnalytics(): UserBurnAnalytics[] {
    const uniqueUsers = new Set(this.burnHistory.map(b => b.author));
    const analytics: UserBurnAnalytics[] = [];

    for (const userId of uniqueUsers) {
      const userAnalytics = this.getUserAnalytics(userId);
      if (userAnalytics) {
        analytics.push(userAnalytics);
      }
    }

    return analytics.sort((a, b) => b.totalAmount - a.totalAmount);
  }

  /**
   * Generate leaderboards
   */
  public getLeaderboard(limit: number = 10): BurnLeaderboard {
    const userAnalytics = this.getAllUserAnalytics();

    const topBurnersByAmount = userAnalytics
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, limit)
      .map(u => ({
        userId: u.userId,
        totalAmount: u.totalAmount,
        burnCount: u.totalBurns,
      }));

    const topBurnersByVolume = userAnalytics
      .sort((a, b) => b.totalBurns - a.totalBurns)
      .slice(0, limit)
      .map(u => ({
        userId: u.userId,
        burnCount: u.totalBurns,
        totalAmount: u.totalAmount,
      }));

    const mostRecentBurners = userAnalytics
      .sort((a, b) => b.lastBurn - a.lastBurn)
      .slice(0, limit)
      .map(u => ({
        userId: u.userId,
        lastBurnTime: u.lastBurn,
        lastBurnAmount: this.burnHistory
          .filter(b => b.author === u.userId)
          .sort((a, b) => b.timestamp - a.timestamp)[0]?.amount || 0,
      }));

    return {
      topBurnersByAmount,
      topBurnersByVolume,
      mostRecentBurners,
    };
  }

  /**
   * Get comprehensive dashboard metrics
   */
  public getDashboardMetrics(currentLoadMultiplier: number = 1.0): DashboardMetrics {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const oneWeekMs = 7 * oneDayMs;
    const oneMonthMs = 30 * oneDayMs;

    // Overall metrics
    const totalAmountBurned = this.burnHistory.reduce((sum, b) => sum + b.amount, 0);
    const totalActiveUsers = new Set(this.burnHistory.map(b => b.author)).size;

    // Today's metrics
    const todayBurns = this.burnHistory.filter(b => b.timestamp >= now - oneDayMs);
    const todayAmount = todayBurns.reduce((sum, b) => sum + b.amount, 0);
    const todayUsers = new Set(todayBurns.map(b => b.author)).size;

    // This week's metrics
    const thisWeekBurns = this.burnHistory.filter(b => b.timestamp >= now - oneWeekMs);
    const thisWeekAmount = thisWeekBurns.reduce((sum, b) => sum + b.amount, 0);
    const thisWeekUsers = new Set(thisWeekBurns.map(b => b.author)).size;

    const lastWeekBurns = this.burnHistory.filter(
      b => b.timestamp >= now - oneWeekMs * 2 && b.timestamp < now - oneWeekMs
    );
    const lastWeekAmount = lastWeekBurns.reduce((sum, b) => sum + b.amount, 0);
    const weekGrowth = lastWeekAmount > 0
      ? ((thisWeekAmount - lastWeekAmount) / lastWeekAmount) * 100
      : 0;

    // This month's metrics
    const thisMonthBurns = this.burnHistory.filter(b => b.timestamp >= now - oneMonthMs);
    const thisMonthAmount = thisMonthBurns.reduce((sum, b) => sum + b.amount, 0);
    const thisMonthUsers = new Set(thisMonthBurns.map(b => b.author)).size;

    const lastMonthBurns = this.burnHistory.filter(
      b => b.timestamp >= now - oneMonthMs * 2 && b.timestamp < now - oneMonthMs
    );
    const lastMonthAmount = lastMonthBurns.reduce((sum, b) => sum + b.amount, 0);
    const monthGrowth = lastMonthAmount > 0
      ? ((thisMonthAmount - lastMonthAmount) / lastMonthAmount) * 100
      : 0;

    // Distribution by type
    const burnTypes: BurnType[] = ['base_filing', 'escalated', 'success', 'load_scaled'];
    const byType: Record<BurnType, { count: number; amount: number; percentage: number }> = {} as any;

    for (const type of burnTypes) {
      const typeBurns = this.burnHistory.filter(b => b.type === type);
      const typeAmount = typeBurns.reduce((sum, b) => sum + b.amount, 0);
      byType[type] = {
        count: typeBurns.length,
        amount: typeAmount,
        percentage: totalAmountBurned > 0 ? (typeAmount / totalAmountBurned) * 100 : 0,
      };
    }

    // Distribution by time of day
    const byTimeOfDay: Array<{ hour: number; burns: number; amount: number }> = [];
    for (let hour = 0; hour < 24; hour++) {
      const hourBurns = this.burnHistory.filter(b => {
        const burnHour = new Date(b.timestamp).getHours();
        return burnHour === hour;
      });
      byTimeOfDay.push({
        hour,
        burns: hourBurns.length,
        amount: hourBurns.reduce((sum, b) => sum + b.amount, 0),
      });
    }

    // Load metrics
    const multiplierHistory = this.loadMultiplierHistory.slice(-100);
    const avgMultiplier = multiplierHistory.length > 0
      ? multiplierHistory.reduce((sum, m) => sum + m.multiplier, 0) / multiplierHistory.length
      : 1.0;
    const peakMultiplier = multiplierHistory.length > 0
      ? Math.max(...multiplierHistory.map(m => m.multiplier))
      : 1.0;

    return {
      overview: {
        totalBurnsAllTime: this.burnHistory.length,
        totalAmountBurned,
        totalActiveUsers,
        averageBurnPerUser: totalActiveUsers > 0 ? totalAmountBurned / totalActiveUsers : 0,
      },
      today: {
        burns: todayBurns.length,
        amount: todayAmount,
        uniqueUsers: todayUsers,
        averageBurn: todayBurns.length > 0 ? todayAmount / todayBurns.length : 0,
      },
      thisWeek: {
        burns: thisWeekBurns.length,
        amount: thisWeekAmount,
        uniqueUsers: thisWeekUsers,
        growthVsLastWeek: weekGrowth,
      },
      thisMonth: {
        burns: thisMonthBurns.length,
        amount: thisMonthAmount,
        uniqueUsers: thisMonthUsers,
        growthVsLastMonth: monthGrowth,
      },
      distribution: {
        byType,
        byTimeOfDay,
      },
      loadMetrics: {
        averageMultiplier: avgMultiplier,
        peakMultiplier,
        currentMultiplier: currentLoadMultiplier,
        multiplierHistory,
      },
    };
  }

  /**
   * Generate simple forecast based on linear regression
   */
  public getForecast(period: TimeWindow): BurnForecast {
    const trendAnalysis = this.getTrendAnalysis(period);
    const dataPoints = trendAnalysis.dataPoints;

    if (dataPoints.length < 2) {
      return {
        period,
        projectedBurns: 0,
        projectedAmount: 0,
        confidence: 0,
        basedOnDataPoints: dataPoints.length,
      };
    }

    // Simple linear regression for forecasting
    const n = dataPoints.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    dataPoints.forEach((point, i) => {
      sumX += i;
      sumY += point.totalAmount;
      sumXY += i * point.totalAmount;
      sumX2 += i * i;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Project next period
    const nextX = n;
    const projectedAmount = slope * nextX + intercept;

    // Calculate confidence based on R-squared
    const yMean = sumY / n;
    let ssTotal = 0;
    let ssResidual = 0;

    dataPoints.forEach((point, i) => {
      const predicted = slope * i + intercept;
      ssTotal += Math.pow(point.totalAmount - yMean, 2);
      ssResidual += Math.pow(point.totalAmount - predicted, 2);
    });

    const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;
    const confidence = Math.max(0, Math.min(1, rSquared));

    // Estimate burn count based on average burns per amount
    const avgBurnsPerAmount = trendAnalysis.summary.totalBurns / trendAnalysis.summary.totalAmount;
    const projectedBurns = Math.round(projectedAmount * avgBurnsPerAmount);

    return {
      period,
      projectedBurns: Math.max(0, projectedBurns),
      projectedAmount: Math.max(0, projectedAmount),
      confidence,
      basedOnDataPoints: n,
    };
  }

  /**
   * Get window duration in milliseconds
   */
  private getWindowDuration(window: TimeWindow): number {
    switch (window) {
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
      case 'week':
        return 7 * 24 * 60 * 60 * 1000;
      case 'month':
        return 30 * 24 * 60 * 60 * 1000;
      case 'all':
        return Date.now(); // From epoch
    }
  }

  /**
   * Get bucket timestamp based on window
   */
  private getBucketTimestamp(timestamp: number, window: TimeWindow): number {
    const date = new Date(timestamp);

    switch (window) {
      case 'hour':
        date.setMinutes(0, 0, 0);
        break;
      case 'day':
        date.setHours(0, 0, 0, 0);
        break;
      case 'week':
        const dayOfWeek = date.getDay();
        date.setDate(date.getDate() - dayOfWeek);
        date.setHours(0, 0, 0, 0);
        break;
      case 'month':
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        break;
      case 'all':
        return 0;
    }

    return date.getTime();
  }
}
