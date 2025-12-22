/**
 * Unit tests for BurnAnalytics
 * Tests analytics, reporting, and forecasting functionality
 */

import { BurnAnalytics } from '../../../src/burn/BurnAnalytics';
import { BurnTransaction, BurnType, UserSubmissionRecord } from '../../../src/types';

describe('BurnAnalytics', () => {
  let analytics: BurnAnalytics;
  let mockBurnHistory: BurnTransaction[];
  let mockUserSubmissions: Map<string, UserSubmissionRecord>;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2024-01-15T12:00:00Z') });
    const now = Date.now();

    // Create mock burn history with various patterns
    mockBurnHistory = [
      // Today's burns
      {
        id: 'burn_1',
        type: 'base_filing',
        author: 'user1',
        amount: 10,
        intentHash: 'intent1',
        timestamp: now - 1000 * 60 * 30, // 30 min ago
      },
      {
        id: 'burn_2',
        type: 'escalated',
        author: 'user1',
        amount: 20,
        intentHash: 'intent2',
        timestamp: now - 1000 * 60 * 60, // 1 hour ago
      },
      {
        id: 'burn_3',
        type: 'success',
        author: 'user2',
        amount: 0.5,
        settlementId: 'settlement1',
        timestamp: now - 1000 * 60 * 120, // 2 hours ago
      },
      // Yesterday's burns
      {
        id: 'burn_4',
        type: 'base_filing',
        author: 'user2',
        amount: 10,
        intentHash: 'intent3',
        timestamp: now - 1000 * 60 * 60 * 25, // 25 hours ago
      },
      {
        id: 'burn_5',
        type: 'load_scaled',
        author: 'user3',
        amount: 30,
        intentHash: 'intent4',
        timestamp: now - 1000 * 60 * 60 * 26, // 26 hours ago
      },
      // Last week
      {
        id: 'burn_6',
        type: 'success',
        author: 'user3',
        amount: 1.0,
        settlementId: 'settlement2',
        timestamp: now - 1000 * 60 * 60 * 24 * 8, // 8 days ago
      },
    ];

    mockUserSubmissions = new Map([
      [
        'user1:2024-01-01',
        {
          userId: 'user1',
          date: '2024-01-01',
          submissionCount: 2,
          lastSubmissionTime: now - 1000 * 60 * 30,
          totalBurned: 30,
          burns: [],
        },
      ],
      [
        'user2:2024-01-01',
        {
          userId: 'user2',
          date: '2024-01-01',
          submissionCount: 1,
          lastSubmissionTime: now - 1000 * 60 * 60 * 25,
          totalBurned: 10.5,
          burns: [],
        },
      ],
    ]);

    analytics = new BurnAnalytics(mockBurnHistory, mockUserSubmissions);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Time Series Aggregation', () => {
    it('should aggregate burns by hour', () => {
      const timeSeries = analytics.getTimeSeriesData('hour', 24);

      expect(timeSeries.length).toBeGreaterThan(0);
      expect(timeSeries[0]).toHaveProperty('timestamp');
      expect(timeSeries[0]).toHaveProperty('totalBurns');
      expect(timeSeries[0]).toHaveProperty('totalAmount');
      expect(timeSeries[0]).toHaveProperty('uniqueUsers');
      expect(timeSeries[0]).toHaveProperty('byType');
    });

    it('should aggregate burns by day', () => {
      const timeSeries = analytics.getTimeSeriesData('day', 7);

      expect(timeSeries.length).toBeGreaterThan(0);
      const todayData = timeSeries.find(d => d.timestamp > Date.now() - 24 * 60 * 60 * 1000);

      if (todayData) {
        expect(todayData.totalBurns).toBe(3); // 3 burns today
        expect(todayData.totalAmount).toBe(30.5); // 10 + 20 + 0.5
        expect(todayData.uniqueUsers).toBe(2); // user1 and user2
      }
    });

    it('should calculate correct averages', () => {
      const timeSeries = analytics.getTimeSeriesData('day', 7);
      const todayData = timeSeries.find(d => d.timestamp > Date.now() - 24 * 60 * 60 * 1000);

      if (todayData) {
        expect(todayData.averageBurn).toBeCloseTo(30.5 / 3, 2);
      }
    });

    it('should separate burns by type', () => {
      const timeSeries = analytics.getTimeSeriesData('day', 7);
      const todayData = timeSeries.find(d => d.timestamp > Date.now() - 24 * 60 * 60 * 1000);

      if (todayData) {
        expect(todayData.byType.base_filing).toBe(10);
        expect(todayData.byType.escalated).toBe(20);
        expect(todayData.byType.success).toBe(0.5);
      }
    });
  });

  describe('Trend Analysis', () => {
    it('should calculate trend metrics for day period', () => {
      const trend = analytics.getTrendAnalysis('day');

      expect(trend.period).toBe('day');
      expect(trend.dataPoints).toBeDefined();
      expect(trend.summary).toBeDefined();
      expect(trend.summary.totalBurns).toBeGreaterThan(0);
      expect(trend.summary.totalAmount).toBeGreaterThan(0);
    });

    it('should calculate growth rate', () => {
      const trend = analytics.getTrendAnalysis('week');

      expect(trend.summary.growthRate).toBeDefined();
      expect(typeof trend.summary.growthRate).toBe('number');
    });

    it('should identify peak burn time', () => {
      const trend = analytics.getTrendAnalysis('week');

      expect(trend.summary.peakBurnTime).toBeDefined();
      expect(trend.summary.peakBurnTime).toBeGreaterThan(0);
    });

    it('should count active users correctly', () => {
      const trend = analytics.getTrendAnalysis('day');

      expect(trend.summary.activeUsers).toBeGreaterThan(0);
    });
  });

  describe('User Analytics', () => {
    it('should get analytics for a specific user', () => {
      const userAnalytics = analytics.getUserAnalytics('user1');

      expect(userAnalytics).not.toBeNull();
      expect(userAnalytics?.userId).toBe('user1');
      expect(userAnalytics?.totalBurns).toBe(2);
      expect(userAnalytics?.totalAmount).toBe(30);
      expect(userAnalytics?.averageBurn).toBe(15);
    });

    it('should return null for non-existent user', () => {
      const userAnalytics = analytics.getUserAnalytics('nonexistent');

      expect(userAnalytics).toBeNull();
    });

    it('should track first and last burn timestamps', () => {
      const userAnalytics = analytics.getUserAnalytics('user1');

      expect(userAnalytics?.firstBurn).toBeDefined();
      expect(userAnalytics?.lastBurn).toBeDefined();
      expect(userAnalytics?.lastBurn).toBeGreaterThanOrEqual(userAnalytics?.firstBurn || 0);
    });

    it('should categorize burns by type', () => {
      const userAnalytics = analytics.getUserAnalytics('user1');

      expect(userAnalytics?.burnsByType).toBeDefined();
      expect(userAnalytics?.burnsByType.base_filing).toBe(1);
      expect(userAnalytics?.burnsByType.escalated).toBe(1);
    });

    it('should calculate days since first burn', () => {
      const userAnalytics = analytics.getUserAnalytics('user1');

      expect(userAnalytics?.daysSinceFirstBurn).toBeDefined();
      expect(userAnalytics?.daysSinceFirstBurn).toBeGreaterThanOrEqual(0);
    });

    it('should determine if user is active (burned in last 7 days)', () => {
      const user1Analytics = analytics.getUserAnalytics('user1');
      const user2Analytics = analytics.getUserAnalytics('user2');
      const user3Analytics = analytics.getUserAnalytics('user3');

      expect(user1Analytics?.isActive).toBe(true); // Recent burn (30 min ago)
      expect(user2Analytics?.isActive).toBe(true); // Recent burn (25 hours ago)
      expect(user3Analytics?.isActive).toBe(true); // Last burn was 26 hours ago (within 7 days)

      // To test inactive users, add a burn older than 7 days
      const oldBurnHistory = [
        {
          id: 'burn_old',
          type: 'base_filing' as const,
          author: 'olduser',
          amount: 10,
          intentHash: 'intent_old',
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago
        },
      ];
      const analyticsWithOldUser = new BurnAnalytics(oldBurnHistory, new Map());
      const oldUserAnalytics = analyticsWithOldUser.getUserAnalytics('olduser');

      expect(oldUserAnalytics?.isActive).toBe(false); // Last burn was 10 days ago
    });
  });

  describe('Leaderboards', () => {
    it('should generate leaderboard with top burners by amount', () => {
      const leaderboard = analytics.getLeaderboard(5);

      expect(leaderboard.topBurnersByAmount).toBeDefined();
      expect(leaderboard.topBurnersByAmount.length).toBeGreaterThan(0);
      expect(leaderboard.topBurnersByAmount[0].totalAmount).toBeGreaterThanOrEqual(
        leaderboard.topBurnersByAmount[1]?.totalAmount || 0
      );
    });

    it('should generate leaderboard with top burners by volume', () => {
      const leaderboard = analytics.getLeaderboard(5);

      expect(leaderboard.topBurnersByVolume).toBeDefined();
      expect(leaderboard.topBurnersByVolume.length).toBeGreaterThan(0);
      expect(leaderboard.topBurnersByVolume[0].burnCount).toBeGreaterThanOrEqual(
        leaderboard.topBurnersByVolume[1]?.burnCount || 0
      );
    });

    it('should list most recent burners', () => {
      const leaderboard = analytics.getLeaderboard(5);

      expect(leaderboard.mostRecentBurners).toBeDefined();
      expect(leaderboard.mostRecentBurners.length).toBeGreaterThan(0);
      expect(leaderboard.mostRecentBurners[0].lastBurnTime).toBeGreaterThanOrEqual(
        leaderboard.mostRecentBurners[1]?.lastBurnTime || 0
      );
    });

    it('should respect limit parameter', () => {
      const leaderboard = analytics.getLeaderboard(2);

      expect(leaderboard.topBurnersByAmount.length).toBeLessThanOrEqual(2);
      expect(leaderboard.topBurnersByVolume.length).toBeLessThanOrEqual(2);
      expect(leaderboard.mostRecentBurners.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Dashboard Metrics', () => {
    it('should generate comprehensive dashboard metrics', () => {
      const metrics = analytics.getDashboardMetrics(1.5);

      expect(metrics.overview).toBeDefined();
      expect(metrics.today).toBeDefined();
      expect(metrics.thisWeek).toBeDefined();
      expect(metrics.thisMonth).toBeDefined();
      expect(metrics.distribution).toBeDefined();
      expect(metrics.loadMetrics).toBeDefined();
    });

    it('should calculate overview metrics correctly', () => {
      const metrics = analytics.getDashboardMetrics();

      expect(metrics.overview.totalBurnsAllTime).toBe(mockBurnHistory.length);
      expect(metrics.overview.totalAmountBurned).toBe(71.5); // Sum of all burns
      expect(metrics.overview.totalActiveUsers).toBe(3); // user1, user2, user3
    });

    it('should calculate today metrics', () => {
      const metrics = analytics.getDashboardMetrics();

      expect(metrics.today.burns).toBe(3); // 3 burns today
      expect(metrics.today.amount).toBe(30.5);
      expect(metrics.today.uniqueUsers).toBe(2);
    });

    it('should calculate growth rates', () => {
      const metrics = analytics.getDashboardMetrics();

      expect(metrics.thisWeek.growthVsLastWeek).toBeDefined();
      expect(metrics.thisMonth.growthVsLastMonth).toBeDefined();
    });

    it('should show distribution by burn type', () => {
      const metrics = analytics.getDashboardMetrics();

      expect(metrics.distribution.byType.base_filing).toBeDefined();
      expect(metrics.distribution.byType.escalated).toBeDefined();
      expect(metrics.distribution.byType.success).toBeDefined();
      expect(metrics.distribution.byType.load_scaled).toBeDefined();

      const totalPercentage =
        metrics.distribution.byType.base_filing.percentage +
        metrics.distribution.byType.escalated.percentage +
        metrics.distribution.byType.success.percentage +
        metrics.distribution.byType.load_scaled.percentage;

      expect(totalPercentage).toBeCloseTo(100, 1);
    });

    it('should show distribution by time of day', () => {
      const metrics = analytics.getDashboardMetrics();

      expect(metrics.distribution.byTimeOfDay).toHaveLength(24);
      metrics.distribution.byTimeOfDay.forEach((hourData, index) => {
        expect(hourData.hour).toBe(index);
        expect(hourData.burns).toBeGreaterThanOrEqual(0);
        expect(hourData.amount).toBeGreaterThanOrEqual(0);
      });
    });

    it('should track load multiplier metrics', () => {
      // Record some load multipliers
      analytics.recordLoadMultiplier(1.0);
      analytics.recordLoadMultiplier(2.0);
      analytics.recordLoadMultiplier(1.5);

      const metrics = analytics.getDashboardMetrics(1.5);

      expect(metrics.loadMetrics.currentMultiplier).toBe(1.5);
      expect(metrics.loadMetrics.averageMultiplier).toBeCloseTo(1.5, 1);
      expect(metrics.loadMetrics.peakMultiplier).toBe(2.0);
      expect(metrics.loadMetrics.multiplierHistory.length).toBe(3);
    });
  });

  describe('Forecasting', () => {
    it('should generate forecast based on historical data', () => {
      const forecast = analytics.getForecast('day');

      expect(forecast.period).toBe('day');
      expect(forecast.projectedBurns).toBeGreaterThanOrEqual(0);
      expect(forecast.projectedAmount).toBeGreaterThanOrEqual(0);
      expect(forecast.confidence).toBeGreaterThanOrEqual(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
      expect(forecast.basedOnDataPoints).toBeGreaterThan(0);
    });

    it('should return zero forecast when insufficient data', () => {
      const emptyAnalytics = new BurnAnalytics([], new Map());
      const forecast = emptyAnalytics.getForecast('week');

      expect(forecast.projectedBurns).toBe(0);
      expect(forecast.projectedAmount).toBe(0);
      expect(forecast.confidence).toBe(0);
    });

    it('should calculate confidence based on data quality', () => {
      const forecast = analytics.getForecast('week');

      expect(forecast.confidence).toBeGreaterThanOrEqual(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Data Updates', () => {
    it('should allow updating analytics data', () => {
      const newBurn: BurnTransaction = {
        id: 'burn_new',
        type: 'base_filing',
        author: 'user4',
        amount: 15,
        intentHash: 'intent_new',
        timestamp: Date.now(),
      };

      const newHistory = [...mockBurnHistory, newBurn];
      analytics.updateData(newHistory, mockUserSubmissions);

      const userAnalytics = analytics.getUserAnalytics('user4');
      expect(userAnalytics).not.toBeNull();
      expect(userAnalytics?.totalAmount).toBe(15);
    });
  });

  describe('All User Analytics', () => {
    it('should get analytics for all users', () => {
      const allUsers = analytics.getAllUserAnalytics();

      expect(allUsers.length).toBe(3); // user1, user2, user3
      expect(allUsers[0].userId).toBeDefined();
    });

    it('should sort users by total amount burned', () => {
      const allUsers = analytics.getAllUserAnalytics();

      for (let i = 0; i < allUsers.length - 1; i++) {
        expect(allUsers[i].totalAmount).toBeGreaterThanOrEqual(allUsers[i + 1].totalAmount);
      }
    });
  });
});
