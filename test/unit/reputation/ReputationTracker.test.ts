import axios from 'axios';
import { ReputationTracker } from '../../../src/reputation/ReputationTracker';
import { MediatorConfig } from '../../../src/types';
import { createMockConfig } from '../../utils/testUtils';

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

// Mock crypto utilities
jest.mock('../../../src/utils/crypto', () => ({
  calculateReputationWeight: (
    successfulClosures: number,
    failedChallenges: number,
    upheldChallengesAgainst: number,
    forfeitedFees: number
  ) => {
    const numerator = successfulClosures + (failedChallenges * 2);
    const denominator = 1 + upheldChallengesAgainst + forfeitedFees;
    return numerator / denominator;
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ReputationTracker', () => {
  let config: MediatorConfig;
  let tracker: ReputationTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    config = createMockConfig({
      mediatorPublicKey: 'mediator_public_key_123',
      chainEndpoint: 'https://chain.example.com',
    });
    tracker = new ReputationTracker(config);
  });

  describe('constructor', () => {
    it('should initialize with default reputation values', () => {
      const reputation = tracker.getReputation();

      expect(reputation.mediatorId).toBe('mediator_public_key_123');
      expect(reputation.successfulClosures).toBe(0);
      expect(reputation.failedChallenges).toBe(0);
      expect(reputation.upheldChallengesAgainst).toBe(0);
      expect(reputation.forfeitedFees).toBe(0);
      expect(reputation.weight).toBe(1.0);
      expect(reputation.lastUpdated).toBeDefined();
    });

    it('should use mediator public key from config', () => {
      const customConfig = createMockConfig({
        mediatorPublicKey: 'custom_key_789',
      });
      const customTracker = new ReputationTracker(customConfig);

      expect(customTracker.getReputation().mediatorId).toBe('custom_key_789');
    });
  });

  describe('loadReputation', () => {
    it('should load reputation from chain successfully', async () => {
      const mockReputationData = {
        successfulClosures: 50,
        failedChallenges: 5,
        upheldChallengesAgainst: 2,
        forfeitedFees: 1,
        weight: 12.5,
        lastUpdated: Date.now() - 10000,
      };

      mockAxios.get.mockResolvedValue({
        data: mockReputationData,
      });

      await tracker.loadReputation();

      expect(mockAxios.get).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/reputation/${config.mediatorPublicKey}`
      );

      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(50);
      expect(reputation.failedChallenges).toBe(5);
      expect(reputation.upheldChallengesAgainst).toBe(2);
      expect(reputation.forfeitedFees).toBe(1);
      expect(reputation.weight).toBe(12.5);
    });

    it('should use reputationChainEndpoint if provided', async () => {
      const customConfig = createMockConfig({
        chainEndpoint: 'https://chain.example.com',
        reputationChainEndpoint: 'https://reputation.example.com',
      });
      const customTracker = new ReputationTracker(customConfig);

      mockAxios.get.mockResolvedValue({ data: {} });

      await customTracker.loadReputation();

      expect(mockAxios.get).toHaveBeenCalledWith(
        `https://reputation.example.com/api/v1/reputation/${customConfig.mediatorPublicKey}`
      );
    });

    it('should preserve mediatorId from config even if chain data has different value', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          mediatorId: 'different_id',
          successfulClosures: 10,
          weight: 5.0,
        },
      });

      await tracker.loadReputation();

      const reputation = tracker.getReputation();
      expect(reputation.mediatorId).toBe(config.mediatorPublicKey);
    });

    it('should handle missing chain data gracefully', async () => {
      mockAxios.get.mockResolvedValue({});

      await tracker.loadReputation();

      // Should keep default values
      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(0);
    });

    it('should handle network errors gracefully', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'));

      await tracker.loadReputation();

      // Should keep default values
      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(0);
      expect(reputation.weight).toBe(1.0);
    });

    it('should handle 404 errors gracefully', async () => {
      mockAxios.get.mockRejectedValue({
        response: { status: 404 },
        message: 'Not Found',
      });

      await tracker.loadReputation();

      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(0);
    });
  });

  describe('recordSuccessfulClosure', () => {
    it('should increment successful closures counter', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordSuccessfulClosure('settlement_123');

      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(1);
    });

    it('should recalculate weight after recording closure', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordSuccessfulClosure('settlement_123');

      const reputation = tracker.getReputation();
      expect(reputation.weight).toBe(1 / 1); // (1 + 0*2) / (1 + 0 + 0)
    });

    it('should update lastUpdated timestamp', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      const beforeTime = Date.now();
      await tracker.recordSuccessfulClosure('settlement_123');
      const afterTime = Date.now();

      const reputation = tracker.getReputation();
      expect(reputation.lastUpdated).toBeGreaterThanOrEqual(beforeTime);
      expect(reputation.lastUpdated).toBeLessThanOrEqual(afterTime);
    });

    it('should publish reputation update to chain', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordSuccessfulClosure('settlement_123');

      expect(mockAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/reputation`,
        expect.objectContaining({
          mediatorId: config.mediatorPublicKey,
          reputation: expect.objectContaining({
            successfulClosures: 1,
          }),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should handle multiple successful closures', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordSuccessfulClosure('settlement_1');
      await tracker.recordSuccessfulClosure('settlement_2');
      await tracker.recordSuccessfulClosure('settlement_3');

      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(3);
    });

    it('should handle publish errors gracefully', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));

      await tracker.recordSuccessfulClosure('settlement_123');

      // Should still update local state
      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(1);
    });
  });

  describe('recordFailedChallenge', () => {
    it('should increment failed challenges counter', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordFailedChallenge('challenge_123');

      const reputation = tracker.getReputation();
      expect(reputation.failedChallenges).toBe(1);
    });

    it('should recalculate weight after recording failed challenge', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordFailedChallenge('challenge_123');

      const reputation = tracker.getReputation();
      expect(reputation.weight).toBe(2 / 1); // (0 + 1*2) / (1 + 0 + 0)
    });

    it('should publish reputation update to chain', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordFailedChallenge('challenge_123');

      expect(mockAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/reputation`,
        expect.objectContaining({
          mediatorId: config.mediatorPublicKey,
          reputation: expect.objectContaining({
            failedChallenges: 1,
          }),
        })
      );
    });

    it('should handle multiple failed challenges', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordFailedChallenge('challenge_1');
      await tracker.recordFailedChallenge('challenge_2');

      const reputation = tracker.getReputation();
      expect(reputation.failedChallenges).toBe(2);
    });
  });

  describe('recordUpheldChallengeAgainst', () => {
    it('should increment upheld challenges against counter', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordUpheldChallengeAgainst('challenge_123');

      const reputation = tracker.getReputation();
      expect(reputation.upheldChallengesAgainst).toBe(1);
    });

    it('should recalculate weight after recording upheld challenge', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordUpheldChallengeAgainst('challenge_123');

      const reputation = tracker.getReputation();
      expect(reputation.weight).toBe(0 / 2); // (0 + 0*2) / (1 + 1 + 0) = 0
    });

    it('should decrease weight when challenge is upheld', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      // First have some successful closures
      await tracker.recordSuccessfulClosure('settlement_1');
      await tracker.recordSuccessfulClosure('settlement_2');

      const beforeReputation = tracker.getReputation();
      const weightBefore = beforeReputation.weight;

      // Now record an upheld challenge
      await tracker.recordUpheldChallengeAgainst('challenge_123');

      const afterReputation = tracker.getReputation();
      expect(afterReputation.weight).toBeLessThan(weightBefore);
    });

    it('should publish reputation update to chain', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordUpheldChallengeAgainst('challenge_123');

      expect(mockAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/reputation`,
        expect.objectContaining({
          mediatorId: config.mediatorPublicKey,
          reputation: expect.objectContaining({
            upheldChallengesAgainst: 1,
          }),
        })
      );
    });
  });

  describe('recordForfeitedFee', () => {
    it('should increment forfeited fees counter', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordForfeitedFee('settlement_123');

      const reputation = tracker.getReputation();
      expect(reputation.forfeitedFees).toBe(1);
    });

    it('should recalculate weight after recording forfeited fee', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordForfeitedFee('settlement_123');

      const reputation = tracker.getReputation();
      expect(reputation.weight).toBe(0 / 2); // (0 + 0*2) / (1 + 0 + 1) = 0
    });

    it('should decrease weight when fee is forfeited', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      // First have some successful closures
      await tracker.recordSuccessfulClosure('settlement_1');
      await tracker.recordSuccessfulClosure('settlement_2');

      const beforeReputation = tracker.getReputation();
      const weightBefore = beforeReputation.weight;

      // Now record a forfeited fee
      await tracker.recordForfeitedFee('settlement_123');

      const afterReputation = tracker.getReputation();
      expect(afterReputation.weight).toBeLessThan(weightBefore);
    });

    it('should publish reputation update to chain', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordForfeitedFee('settlement_123');

      expect(mockAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/reputation`,
        expect.objectContaining({
          mediatorId: config.mediatorPublicKey,
          reputation: expect.objectContaining({
            forfeitedFees: 1,
          }),
        })
      );
    });
  });

  describe('getReputation', () => {
    it('should return a copy of reputation', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      const reputation1 = tracker.getReputation();
      reputation1.successfulClosures = 999; // Try to mutate

      const reputation2 = tracker.getReputation();
      expect(reputation2.successfulClosures).toBe(0); // Should still be 0
    });

    it('should return current reputation state', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordSuccessfulClosure('settlement_1');
      await tracker.recordFailedChallenge('challenge_1');

      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(1);
      expect(reputation.failedChallenges).toBe(1);
    });
  });

  describe('getWeight', () => {
    it('should return current weight', () => {
      expect(tracker.getWeight()).toBe(1.0);
    });

    it('should return updated weight after changes', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordSuccessfulClosure('settlement_1');
      await tracker.recordSuccessfulClosure('settlement_2');

      const weight = tracker.getWeight();
      expect(weight).toBe(2); // (2 + 0*2) / (1 + 0 + 0) = 2
    });
  });

  describe('reputation weight calculations', () => {
    it('should calculate weight with mixed metrics', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordSuccessfulClosure('settlement_1');
      await tracker.recordSuccessfulClosure('settlement_2');
      await tracker.recordSuccessfulClosure('settlement_3');
      await tracker.recordFailedChallenge('challenge_1');
      await tracker.recordUpheldChallengeAgainst('challenge_2');

      const reputation = tracker.getReputation();
      // (3 + 1*2) / (1 + 1 + 0) = 5/2 = 2.5
      expect(reputation.weight).toBe(2.5);
    });

    it('should calculate weight with all metrics', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordSuccessfulClosure('settlement_1');
      await tracker.recordSuccessfulClosure('settlement_2');
      await tracker.recordFailedChallenge('challenge_1');
      await tracker.recordUpheldChallengeAgainst('challenge_2');
      await tracker.recordForfeitedFee('settlement_3');

      const reputation = tracker.getReputation();
      // (2 + 1*2) / (1 + 1 + 1) = 4/3 ≈ 1.33
      expect(reputation.weight).toBeCloseTo(4 / 3, 5);
    });

    it('should handle zero successful closures', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordUpheldChallengeAgainst('challenge_1');

      const reputation = tracker.getReputation();
      // (0 + 0*2) / (1 + 1 + 0) = 0/2 = 0
      expect(reputation.weight).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive updates', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      const promises = [
        tracker.recordSuccessfulClosure('s1'),
        tracker.recordSuccessfulClosure('s2'),
        tracker.recordSuccessfulClosure('s3'),
        tracker.recordFailedChallenge('c1'),
        tracker.recordFailedChallenge('c2'),
      ];

      await Promise.all(promises);

      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(3);
      expect(reputation.failedChallenges).toBe(2);
    });

    it('should handle chain endpoint changes', async () => {
      const customConfig = createMockConfig({
        chainEndpoint: 'https://chain1.example.com',
      });
      const customTracker = new ReputationTracker(customConfig);

      mockAxios.post.mockResolvedValue({ status: 200 });

      await customTracker.recordSuccessfulClosure('settlement_1');

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://chain1.example.com/api/v1/reputation',
        expect.any(Object)
      );
    });

    it('should preserve state across multiple operations', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await tracker.recordSuccessfulClosure('s1');
      expect(tracker.getReputation().successfulClosures).toBe(1);

      await tracker.recordFailedChallenge('c1');
      expect(tracker.getReputation().successfulClosures).toBe(1);
      expect(tracker.getReputation().failedChallenges).toBe(1);

      await tracker.recordUpheldChallengeAgainst('c2');
      expect(tracker.getReputation().successfulClosures).toBe(1);
      expect(tracker.getReputation().failedChallenges).toBe(1);
      expect(tracker.getReputation().upheldChallengesAgainst).toBe(1);
    });

    it('should handle publish failures without affecting local state', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ status: 200 })
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ status: 200 });

      await tracker.recordSuccessfulClosure('s1');
      await tracker.recordSuccessfulClosure('s2'); // This will fail to publish
      await tracker.recordSuccessfulClosure('s3');

      const reputation = tracker.getReputation();
      expect(reputation.successfulClosures).toBe(3);
    });
  });
});
