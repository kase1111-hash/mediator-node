import axios from 'axios';
import { StakeManager } from '../../../src/consensus/StakeManager';
import { MediatorConfig, Delegation } from '../../../src/types';
import { createMockConfig } from '../../utils/testUtils';

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('StakeManager', () => {
  let config: MediatorConfig;
  let stakeManager: StakeManager;

  beforeEach(() => {
    jest.clearAllMocks();
    config = createMockConfig({
      mediatorPublicKey: 'mediator_pub_key_123',
      chainEndpoint: 'https://chain.example.com',
      bondedStakeAmount: 1000,
      minEffectiveStake: 500,
    });
    stakeManager = new StakeManager(config);
  });

  describe('constructor', () => {
    it('should initialize with default stake values', () => {
      const stake = stakeManager.getStake();

      expect(stake.mediatorId).toBe('mediator_pub_key_123');
      expect(stake.amount).toBe(1000);
      expect(stake.delegatedAmount).toBe(0);
      expect(stake.effectiveStake).toBe(1000);
      expect(stake.delegators).toEqual([]);
      expect(stake.unbondingPeriod).toBe(30 * 24 * 60 * 60 * 1000); // 30 days
      expect(stake.status).toBe('unbonded');
    });

    it('should handle missing bondedStakeAmount in config', () => {
      const customConfig = createMockConfig({
        bondedStakeAmount: undefined,
      });
      const customManager = new StakeManager(customConfig);

      const stake = customManager.getStake();
      expect(stake.amount).toBe(0);
      expect(stake.effectiveStake).toBe(0);
    });

    it('should use mediator public key from config', () => {
      const customConfig = createMockConfig({
        mediatorPublicKey: 'custom_key_789',
      });
      const customManager = new StakeManager(customConfig);

      expect(customManager.getStake().mediatorId).toBe('custom_key_789');
    });
  });

  describe('bondStake', () => {
    it('should bond stake successfully', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      const result = await stakeManager.bondStake(5000);

      expect(result).toBe(true);
      expect(mockAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/stake/bond`,
        {
          mediatorId: config.mediatorPublicKey,
          amount: 5000,
          timestamp: expect.any(Number),
        }
      );
    });

    it('should update stake amount after bonding', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await stakeManager.bondStake(5000);

      const stake = stakeManager.getStake();
      expect(stake.amount).toBe(5000);
      expect(stake.status).toBe('bonded');
    });

    it('should update effective stake after bonding', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await stakeManager.bondStake(5000);

      const stake = stakeManager.getStake();
      expect(stake.effectiveStake).toBe(5000);
    });

    it('should handle bonding with delegations already present', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      mockAxios.get.mockResolvedValue({
        data: {
          delegations: [
            {
              delegatorId: 'delegator_1',
              mediatorId: config.mediatorPublicKey,
              amount: 2000,
              timestamp: Date.now(),
              status: 'active' as const,
            },
          ],
        },
      });

      await stakeManager.loadDelegations();
      await stakeManager.bondStake(5000);

      const stake = stakeManager.getStake();
      expect(stake.amount).toBe(5000);
      expect(stake.delegatedAmount).toBe(2000);
      expect(stake.effectiveStake).toBe(7000);
    });

    it('should return false on non-200 response', async () => {
      mockAxios.post.mockResolvedValue({ status: 400 });

      const result = await stakeManager.bondStake(5000);

      expect(result).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await stakeManager.bondStake(5000);

      expect(result).toBe(false);
    });

    it('should handle 500 server errors', async () => {
      mockAxios.post.mockRejectedValue({
        response: { status: 500 },
        message: 'Internal Server Error',
      });

      const result = await stakeManager.bondStake(5000);

      expect(result).toBe(false);
    });
  });

  describe('unbondStake', () => {
    it('should initiate unbonding successfully', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      const result = await stakeManager.unbondStake();

      expect(result).toBe(true);
      expect(mockAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/stake/unbond`,
        {
          mediatorId: config.mediatorPublicKey,
          timestamp: expect.any(Number),
        }
      );
    });

    it('should set status to unbonding', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await stakeManager.unbondStake();

      const stake = stakeManager.getStake();
      expect(stake.status).toBe('unbonding');
    });

    it('should return false on non-200 response', async () => {
      mockAxios.post.mockResolvedValue({ status: 400 });

      const result = await stakeManager.unbondStake();

      expect(result).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      mockAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await stakeManager.unbondStake();

      expect(result).toBe(false);
    });
  });

  describe('loadDelegations', () => {
    it('should load delegations from chain successfully', async () => {
      const mockDelegations: Delegation[] = [
        {
          delegatorId: 'delegator_1',
          mediatorId: config.mediatorPublicKey,
          amount: 1000,
          timestamp: Date.now(),
          status: 'active',
        },
        {
          delegatorId: 'delegator_2',
          mediatorId: config.mediatorPublicKey,
          amount: 2000,
          timestamp: Date.now(),
          status: 'active',
        },
      ];

      mockAxios.get.mockResolvedValue({
        data: { delegations: mockDelegations },
      });

      await stakeManager.loadDelegations();

      expect(mockAxios.get).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/delegations/${config.mediatorPublicKey}`
      );

      const stake = stakeManager.getStake();
      expect(stake.delegators).toEqual(mockDelegations);
      expect(stake.delegatedAmount).toBe(3000);
    });

    it('should update effective stake with delegations', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          delegations: [
            {
              delegatorId: 'delegator_1',
              mediatorId: config.mediatorPublicKey,
              amount: 2000,
              timestamp: Date.now(),
              status: 'active' as const,
            },
          ],
        },
      });

      // Bond stake first
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(5000);

      // Load delegations
      await stakeManager.loadDelegations();

      const stake = stakeManager.getStake();
      expect(stake.effectiveStake).toBe(7000); // 5000 + 2000
    });

    it('should filter out non-active delegations', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          delegations: [
            {
              delegatorId: 'delegator_1',
              mediatorId: config.mediatorPublicKey,
              amount: 1000,
              timestamp: Date.now(),
              status: 'active' as const,
            },
            {
              delegatorId: 'delegator_2',
              mediatorId: config.mediatorPublicKey,
              amount: 2000,
              timestamp: Date.now(),
              status: 'undelegating' as const,
            },
            {
              delegatorId: 'delegator_3',
              mediatorId: config.mediatorPublicKey,
              amount: 3000,
              timestamp: Date.now(),
              status: 'withdrawn' as const,
            },
          ],
        },
      });

      await stakeManager.loadDelegations();

      const stake = stakeManager.getStake();
      expect(stake.delegators).toHaveLength(3); // All delegators stored
      expect(stake.delegatedAmount).toBe(1000); // Only active count
    });

    it('should handle missing delegations data', async () => {
      mockAxios.get.mockResolvedValue({});

      await stakeManager.loadDelegations();

      const stake = stakeManager.getStake();
      expect(stake.delegators).toEqual([]);
      expect(stake.delegatedAmount).toBe(0);
    });

    it('should handle network errors gracefully', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'));

      await stakeManager.loadDelegations();

      const stake = stakeManager.getStake();
      expect(stake.delegators).toEqual([]);
    });

    it('should handle empty delegations array', async () => {
      mockAxios.get.mockResolvedValue({
        data: { delegations: [] },
      });

      await stakeManager.loadDelegations();

      const stake = stakeManager.getStake();
      expect(stake.delegators).toEqual([]);
      expect(stake.delegatedAmount).toBe(0);
    });
  });

  describe('meetsMinimumStake', () => {
    it('should return true when effective stake meets minimum', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(1000);

      expect(stakeManager.meetsMinimumStake()).toBe(true);
    });

    it('should return false when effective stake is below minimum', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(100);

      expect(stakeManager.meetsMinimumStake()).toBe(false);
    });

    it('should return true when effective stake exactly equals minimum', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(500);

      expect(stakeManager.meetsMinimumStake()).toBe(true);
    });

    it('should consider delegations in minimum stake calculation', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      mockAxios.get.mockResolvedValue({
        data: {
          delegations: [
            {
              delegatorId: 'delegator_1',
              mediatorId: config.mediatorPublicKey,
              amount: 400,
              timestamp: Date.now(),
              status: 'active' as const,
            },
          ],
        },
      });

      await stakeManager.bondStake(200); // Total will be 600
      await stakeManager.loadDelegations();

      expect(stakeManager.meetsMinimumStake()).toBe(true);
    });

    it('should return true when minEffectiveStake is not set', () => {
      const customConfig = createMockConfig({
        minEffectiveStake: undefined,
      });
      const customManager = new StakeManager(customConfig);

      expect(customManager.meetsMinimumStake()).toBe(true);
    });

    it('should return true when minEffectiveStake is 0', () => {
      const customConfig = createMockConfig({
        minEffectiveStake: 0,
      });
      const customManager = new StakeManager(customConfig);

      expect(customManager.meetsMinimumStake()).toBe(true);
    });
  });

  describe('getStake', () => {
    it('should return a copy of stake', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      const stake1 = stakeManager.getStake();
      stake1.amount = 999999; // Try to mutate

      const stake2 = stakeManager.getStake();
      expect(stake2.amount).toBe(1000); // Should still be original
    });

    it('should return current stake state', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(5000);

      const stake = stakeManager.getStake();
      expect(stake.amount).toBe(5000);
      expect(stake.status).toBe('bonded');
    });
  });

  describe('getEffectiveStake', () => {
    it('should return current effective stake', () => {
      expect(stakeManager.getEffectiveStake()).toBe(1000);
    });

    it('should return updated effective stake after bonding', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(5000);

      expect(stakeManager.getEffectiveStake()).toBe(5000);
    });

    it('should include delegations in effective stake', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      mockAxios.get.mockResolvedValue({
        data: {
          delegations: [
            {
              delegatorId: 'delegator_1',
              mediatorId: config.mediatorPublicKey,
              amount: 2000,
              timestamp: Date.now(),
              status: 'active' as const,
            },
          ],
        },
      });

      await stakeManager.bondStake(5000);
      await stakeManager.loadDelegations();

      expect(stakeManager.getEffectiveStake()).toBe(7000);
    });
  });

  describe('handleSlashing', () => {
    it('should reduce stake amount by slashing amount', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(5000);

      await stakeManager.handleSlashing(1000, 'Upheld challenge');

      const stake = stakeManager.getStake();
      expect(stake.amount).toBe(4000);
    });

    it('should update effective stake after slashing', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(5000);

      await stakeManager.handleSlashing(1000, 'Upheld challenge');

      expect(stakeManager.getEffectiveStake()).toBe(4000);
    });

    it('should not reduce stake below zero', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(100);

      await stakeManager.handleSlashing(500, 'Major violation');

      const stake = stakeManager.getStake();
      expect(stake.amount).toBe(0);
    });

    it('should notify chain of slashing event', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(5000);

      await stakeManager.handleSlashing(1000, 'Upheld challenge');

      // First call is bondStake, second is slashing notification
      expect(mockAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/stake/slash`,
        {
          mediatorId: config.mediatorPublicKey,
          amount: 1000,
          reason: 'Upheld challenge',
          timestamp: expect.any(Number),
        }
      );
    });

    it('should handle slashing notification errors gracefully', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ status: 200 }) // bondStake
        .mockRejectedValueOnce(new Error('Network error')); // slash notification

      await stakeManager.bondStake(5000);
      await stakeManager.handleSlashing(1000, 'Upheld challenge');

      // Should still update local state even if notification fails
      const stake = stakeManager.getStake();
      expect(stake.amount).toBe(4000);
    });

    it('should preserve delegations during slashing', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      mockAxios.get.mockResolvedValue({
        data: {
          delegations: [
            {
              delegatorId: 'delegator_1',
              mediatorId: config.mediatorPublicKey,
              amount: 2000,
              timestamp: Date.now(),
              status: 'active' as const,
            },
          ],
        },
      });

      await stakeManager.bondStake(5000);
      await stakeManager.loadDelegations();

      expect(stakeManager.getEffectiveStake()).toBe(7000);

      await stakeManager.handleSlashing(1000, 'Upheld challenge');

      const stake = stakeManager.getStake();
      expect(stake.amount).toBe(4000);
      expect(stake.delegatedAmount).toBe(2000);
      expect(stake.effectiveStake).toBe(6000);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple bond operations', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await stakeManager.bondStake(1000);
      await stakeManager.bondStake(2000);
      await stakeManager.bondStake(3000);

      const stake = stakeManager.getStake();
      expect(stake.amount).toBe(3000); // Last bond amount
    });

    it('should handle bond after unbond', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });

      await stakeManager.bondStake(5000);
      await stakeManager.unbondStake();

      expect(stakeManager.getStake().status).toBe('unbonding');

      await stakeManager.bondStake(6000);

      const stake = stakeManager.getStake();
      expect(stake.status).toBe('bonded');
      expect(stake.amount).toBe(6000);
    });

    it('should handle delegations loading multiple times', async () => {
      mockAxios.get
        .mockResolvedValueOnce({
          data: {
            delegations: [
              {
                delegatorId: 'delegator_1',
                mediatorId: config.mediatorPublicKey,
                amount: 1000,
                timestamp: Date.now(),
                status: 'active' as const,
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            delegations: [
              {
                delegatorId: 'delegator_1',
                mediatorId: config.mediatorPublicKey,
                amount: 1000,
                timestamp: Date.now(),
                status: 'active' as const,
              },
              {
                delegatorId: 'delegator_2',
                mediatorId: config.mediatorPublicKey,
                amount: 2000,
                timestamp: Date.now(),
                status: 'active' as const,
              },
            ],
          },
        });

      await stakeManager.loadDelegations();
      expect(stakeManager.getStake().delegatedAmount).toBe(1000);

      await stakeManager.loadDelegations();
      expect(stakeManager.getStake().delegatedAmount).toBe(3000);
    });

    it('should handle slashing entire stake', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      await stakeManager.bondStake(1000);

      await stakeManager.handleSlashing(1000, 'Complete slash');

      const stake = stakeManager.getStake();
      expect(stake.amount).toBe(0);
      expect(stake.effectiveStake).toBe(0);
    });

    it('should preserve state across multiple operations', async () => {
      mockAxios.post.mockResolvedValue({ status: 200 });
      mockAxios.get.mockResolvedValue({
        data: {
          delegations: [
            {
              delegatorId: 'delegator_1',
              mediatorId: config.mediatorPublicKey,
              amount: 1000,
              timestamp: Date.now(),
              status: 'active' as const,
            },
          ],
        },
      });

      await stakeManager.bondStake(5000);
      expect(stakeManager.getEffectiveStake()).toBe(5000);

      await stakeManager.loadDelegations();
      expect(stakeManager.getEffectiveStake()).toBe(6000);

      await stakeManager.handleSlashing(500, 'Minor violation');
      expect(stakeManager.getEffectiveStake()).toBe(5500);

      await stakeManager.unbondStake();
      expect(stakeManager.getStake().status).toBe('unbonding');
    });
  });
});
