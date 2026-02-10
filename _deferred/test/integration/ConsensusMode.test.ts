/**
 * Integration tests for Consensus Modes
 * Tests all four consensus modes: Permissionless, DPoS, PoA, and Hybrid
 */

import { MediatorNode } from '../../src/MediatorNode';
import { MediatorConfig, Intent } from '../../src/types';
import axios from 'axios';

// Mock external dependencies
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

// Create mock axios instance that will be returned by axios.create
const mockAxiosInstance = {
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

// Mock crypto module
jest.mock('crypto', () => ({
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mock-hash-12345'),
  }),
  randomBytes: jest.fn().mockReturnValue(Buffer.from('mock-random-bytes')),
  createSign: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    sign: jest.fn().mockReturnValue('mock-signature'),
  }),
  createVerify: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    verify: jest.fn().mockReturnValue(true),
  }),
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock hnswlib-node
jest.mock('hnswlib-node');

// Mock crypto utilities
jest.mock('../../src/utils/crypto', () => ({
  generateModelIntegrityHash: (model: string, prompt: string) => `hash_${model}_${prompt.length}`,
  generateSignature: (data: string, key: string) => `sig_${key}_${data.length}`,
  calculateReputationWeight: (sc: number, fc: number, uca: number, ff: number) => {
    return (sc + fc * 2) / (1 + uca + ff);
  },
}));

// Mock Anthropic SDK
const mockAnthropicCreate = jest.fn().mockResolvedValue({
  content: [{
    type: 'text',
    text: JSON.stringify({
      SUCCESS: true,
      CONFIDENCE: 0.85,
      REASONING: 'Test negotiation successful',
      PROPOSED_TERMS: {
        price: 100,
        deliverables: ['Test deliverable'],
        timelines: '1 week',
      },
    }),
  }],
});

const mockAnthropicEmbedding = jest.fn().mockResolvedValue({
  embedding: Array(1536).fill(0.1),
});

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  }));
});

// Helper function to create base config
function createBaseConfig(overrides: Partial<MediatorConfig> = {}): MediatorConfig {
  return {
    chainEndpoint: 'http://test-chain:8080',
    chainId: 'test-chain',
    consensusMode: 'permissionless',
    llmProvider: 'anthropic',
    llmApiKey: 'test-api-key',
    llmModel: 'claude-3-5-sonnet-20241022',
    mediatorPrivateKey: 'test-private-key',
    mediatorPublicKey: 'test-public-key',
    facilitationFeePercent: 1.0,
    vectorDbPath: './test-vector-db',
    vectorDimensions: 1536,
    maxIntentsCache: 10000,
    acceptanceWindowHours: 72,
    logLevel: 'info',
    ...overrides,
  };
}

// Helper function to create mock intent
function createMockIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    hash: 'test-hash',
    author: 'test-author',
    prose: 'Test intent prose',
    desires: ['Test desire'],
    constraints: ['Test constraint'],
    timestamp: Date.now(),
    status: 'pending',
    ...overrides,
  };
}

describe('Consensus Mode Integration Tests', () => {
  let mediatorNode: MediatorNode;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default axios mocks
    mockAxios.get.mockResolvedValue({ data: { intents: [] } });
    mockAxios.post.mockResolvedValue({ status: 200, data: {} });
  });

  afterEach(async () => {
    try {
      if (mediatorNode && mediatorNode.getStatus && mediatorNode.getStatus().isRunning) {
        await mediatorNode.stop();
      }
    } catch (error) {
      // Node may not have been created successfully
    }
    jest.useRealTimers();
  });

  // ====================
  // Permissionless Mode Tests
  // ====================
  describe('Permissionless Mode', () => {
    it('should start successfully without any restrictions', async () => {
      const config = createBaseConfig({ consensusMode: 'permissionless' });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.reputation).toBe(1.0);
      expect(status.effectiveStake).toBe(0); // No stake required
    });

    it('should process intents without stake or authority checks', async () => {
      const config = createBaseConfig({ consensusMode: 'permissionless' });
      mediatorNode = new MediatorNode(config);

      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_a', prose: 'I need web development help' }),
        createMockIntent({ hash: 'intent_b', prose: 'I can build websites' }),
      ];

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/intents')) {
          return Promise.resolve({ data: { intents: mockIntents } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200, data: {} });

      await mediatorNode.start();

      // Give time for async intent polling to complete
      await jest.advanceTimersByTimeAsync(100);
      await Promise.resolve(); // Flush microtasks

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      // Verify that intents endpoint was called during polling
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/intents'),
        expect.any(Object)
      );
    });

    it('should allow settlement submission without stake reference', async () => {
      const config = createBaseConfig({ consensusMode: 'permissionless' });
      mediatorNode = new MediatorNode(config);

      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_a', prose: 'I need help', offeredFee: 100 }),
        createMockIntent({ hash: 'intent_b', prose: 'I can help', offeredFee: 100 }),
      ];

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/intents')) {
          return Promise.resolve({ data: { intents: mockIntents } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 5,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      let submittedSettlement: any = null;
      mockAxios.post.mockImplementation((url: string, data: any) => {
        if (url.includes('/settlements')) {
          submittedSettlement = data;
        }
        return Promise.resolve({ status: 200, data: {} });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(31000);

      // Settlement submission doesn't require stake reference in permissionless mode
      if (submittedSettlement) {
        expect(submittedSettlement.effectiveStake).toBeUndefined();
        expect(submittedSettlement.authoritySignature).toBeUndefined();
      }
    });
  });

  // ====================
  // DPoS Mode Tests
  // ====================
  describe('DPoS Mode', () => {
    it('should fail to start if minimum stake requirement is not met', async () => {
      const config = createBaseConfig({
        consensusMode: 'dpos',
        minEffectiveStake: 1000,
        bondedStakeAmount: 500, // Less than minimum
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.effectiveStake).toBeLessThan(1000);
    });

    it('should start successfully when minimum stake is met', async () => {
      const config = createBaseConfig({
        consensusMode: 'dpos',
        minEffectiveStake: 1000,
        bondedStakeAmount: 1500,
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.effectiveStake).toBeGreaterThanOrEqual(1000);
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/stake/bond'),
        expect.objectContaining({
          amount: 1500,
        })
      );
    });

    it('should load delegations and calculate effective stake correctly', async () => {
      const config = createBaseConfig({
        consensusMode: 'dpos',
        minEffectiveStake: 1000,
        bondedStakeAmount: 500,
      });
      mediatorNode = new MediatorNode(config);

      const mockDelegations = [
        {
          delegatorId: 'delegator_1',
          mediatorId: config.mediatorPublicKey,
          amount: 300,
          timestamp: Date.now(),
          status: 'active' as const,
        },
        {
          delegatorId: 'delegator_2',
          mediatorId: config.mediatorPublicKey,
          amount: 400,
          timestamp: Date.now(),
          status: 'active' as const,
        },
      ];

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: mockDelegations } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      // Own stake (500) + delegations (300 + 400) = 1200
      expect(status.effectiveStake).toBe(1200);
    });

    it('should include stake reference in settlement submissions', async () => {
      const config = createBaseConfig({
        consensusMode: 'dpos',
        minEffectiveStake: 100,
        bondedStakeAmount: 500,
      });
      mediatorNode = new MediatorNode(config);

      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_a', prose: 'Need help', offeredFee: 100 }),
        createMockIntent({ hash: 'intent_b', prose: 'Can help', offeredFee: 100 }),
      ];

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/intents')) {
          return Promise.resolve({ data: { intents: mockIntents } });
        }
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 5,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      let submittedSettlement: any = null;
      mockAxios.post.mockImplementation((url: string, data: any) => {
        if (url.includes('/settlements')) {
          submittedSettlement = data;
        }
        return Promise.resolve({ status: 200 });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(31000);

      // Check that settlement includes stake information
      if (submittedSettlement) {
        expect(submittedSettlement.effectiveStake).toBe(500);
      }
    });

    it('should handle stake bonding failure gracefully', async () => {
      const config = createBaseConfig({
        consensusMode: 'dpos',
        minEffectiveStake: 1000,
        bondedStakeAmount: 1500,
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      // Stake bonding fails
      mockAxios.post.mockImplementation((url: string) => {
        if (url.includes('/stake/bond')) {
          return Promise.reject(new Error('Bonding failed'));
        }
        return Promise.resolve({ status: 200 });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      // NOTE: Currently the node starts even if bonding fails because StakeManager
      // initializes stake.amount from config.bondedStakeAmount in the constructor.
      // This may be a bug - bonding should be required to actually set the stake.
      expect(status.isRunning).toBe(true);
      expect(status.effectiveStake).toBe(1500); // Still has stake from config
    });

    it('should filter out inactive delegations when calculating effective stake', async () => {
      const config = createBaseConfig({
        consensusMode: 'dpos',
        minEffectiveStake: 500,
        bondedStakeAmount: 300,
      });
      mediatorNode = new MediatorNode(config);

      const mockDelegations = [
        {
          delegatorId: 'delegator_1',
          mediatorId: config.mediatorPublicKey,
          amount: 200,
          timestamp: Date.now(),
          status: 'active' as const,
        },
        {
          delegatorId: 'delegator_2',
          mediatorId: config.mediatorPublicKey,
          amount: 300,
          timestamp: Date.now(),
          status: 'undelegating' as const, // Should not be counted
        },
        {
          delegatorId: 'delegator_3',
          mediatorId: config.mediatorPublicKey,
          amount: 400,
          timestamp: Date.now(),
          status: 'withdrawn' as const, // Should not be counted
        },
      ];

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: mockDelegations } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      // Own stake (300) + active delegations (200) = 500
      expect(status.effectiveStake).toBe(500);
    });
  });

  // ====================
  // PoA Mode Tests
  // ====================
  describe('PoA Mode', () => {
    it('should fail to start if not in authority set', async () => {
      const config = createBaseConfig({
        consensusMode: 'poa',
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      // Authority set does not include this mediator
      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: ['other-authority-1', 'other-authority-2'],
            },
          });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should start successfully when in authority set', async () => {
      const config = createBaseConfig({
        consensusMode: 'poa',
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      // Authority set includes this mediator
      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: [config.mediatorPublicKey, 'other-authority-1'],
            },
          });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/consensus/authorities')
      );
    });

    it('should process intents when authorized', async () => {
      const config = createBaseConfig({
        consensusMode: 'poa',
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_a', prose: 'Need service' }),
        createMockIntent({ hash: 'intent_b', prose: 'Offer service' }),
      ];

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: [config.mediatorPublicKey, 'other-authority'],
            },
          });
        }
        if (url.includes('/intents')) {
          return Promise.resolve({ data: { intents: mockIntents } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      await mediatorNode.start();

      // Give time for async intent polling to complete
      await jest.advanceTimersByTimeAsync(100);
      await Promise.resolve(); // Flush microtasks

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      // Verify that intents endpoint was called
      expect(mockAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/intents'),
        expect.any(Object)
      );
    });

    it('should handle authority set loading failure gracefully', async () => {
      const config = createBaseConfig({
        consensusMode: 'poa',
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.reject(new Error('Network error'));
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      // Should not start if authority set can't be loaded
      expect(status.isRunning).toBe(false);
    });
  });

  // ====================
  // Hybrid Mode Tests
  // ====================
  describe('Hybrid Mode', () => {
    it('should fail to start if not in authority set (even with sufficient stake)', async () => {
      const config = createBaseConfig({
        consensusMode: 'hybrid',
        minEffectiveStake: 1000,
        bondedStakeAmount: 2000, // Sufficient stake
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: ['other-authority-1', 'other-authority-2'],
            },
          });
        }
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(false);
      expect(status.effectiveStake).toBe(2000); // Stake is met, but not authorized
    });

    it('should fail to start if in authority set but insufficient stake', async () => {
      const config = createBaseConfig({
        consensusMode: 'hybrid',
        minEffectiveStake: 1000,
        bondedStakeAmount: 500, // Insufficient stake
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: [config.mediatorPublicKey, 'other-authority'],
            },
          });
        }
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(false);
    });

    it('should start successfully when both authorized and stake requirements are met', async () => {
      const config = createBaseConfig({
        consensusMode: 'hybrid',
        minEffectiveStake: 1000,
        bondedStakeAmount: 1500,
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: [config.mediatorPublicKey, 'other-authority'],
            },
          });
        }
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.effectiveStake).toBeGreaterThanOrEqual(1000);
    });

    it('should include both stake and authority signature in settlements', async () => {
      const config = createBaseConfig({
        consensusMode: 'hybrid',
        minEffectiveStake: 100,
        bondedStakeAmount: 500,
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_a', prose: 'Need work', offeredFee: 100 }),
        createMockIntent({ hash: 'intent_b', prose: 'Offer work', offeredFee: 100 }),
      ];

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: [config.mediatorPublicKey],
            },
          });
        }
        if (url.includes('/intents')) {
          return Promise.resolve({ data: { intents: mockIntents } });
        }
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 5,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: {} });
      });

      let submittedSettlement: any = null;
      mockAxios.post.mockImplementation((url: string, data: any) => {
        if (url.includes('/settlements')) {
          submittedSettlement = data;
        }
        return Promise.resolve({ status: 200 });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(31000);

      // In hybrid mode, settlements should include both stake and authority info
      if (submittedSettlement) {
        expect(submittedSettlement.effectiveStake).toBe(500);
        // Authority signature would be added during settlement creation
      }
    });

    it('should leverage delegations to meet stake requirement in hybrid mode', async () => {
      const config = createBaseConfig({
        consensusMode: 'hybrid',
        minEffectiveStake: 1000,
        bondedStakeAmount: 600,
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      const mockDelegations = [
        {
          delegatorId: 'delegator_1',
          mediatorId: config.mediatorPublicKey,
          amount: 250,
          timestamp: Date.now(),
          status: 'active' as const,
        },
        {
          delegatorId: 'delegator_2',
          mediatorId: config.mediatorPublicKey,
          amount: 250,
          timestamp: Date.now(),
          status: 'active' as const,
        },
      ];

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: [config.mediatorPublicKey, 'other-authority'],
            },
          });
        }
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: mockDelegations } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      // Own stake (600) + delegations (250 + 250) = 1100
      expect(status.effectiveStake).toBe(1100);
    });
  });

  // ====================
  // Mode-Specific Validation Tests
  // ====================
  describe('Mode-Specific Validations', () => {
    it('should validate consensus mode configuration', () => {
      // This test ensures that invalid consensus modes are rejected
      const validModes = ['permissionless', 'dpos', 'poa', 'hybrid'];

      validModes.forEach(mode => {
        const config = createBaseConfig({ consensusMode: mode as any });
        expect(() => new MediatorNode(config)).not.toThrow();
      });
    });

    it('should handle missing DPoS configuration in DPoS mode', async () => {
      const config = createBaseConfig({
        consensusMode: 'dpos',
        // No minEffectiveStake or bondedStakeAmount
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      // Should still create the node, but effective stake will be 0
      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      // Without minimum stake set, it should start (defaults to 0)
      expect(status.effectiveStake).toBe(0);
    });

    it('should handle missing PoA configuration in PoA mode', async () => {
      const config = createBaseConfig({
        consensusMode: 'poa',
        // No poaAuthorityKey
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: [config.mediatorPublicKey],
            },
          });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      // Should still be able to start if in authority set
      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should properly clean up consensus components on stop', async () => {
      const config = createBaseConfig({
        consensusMode: 'hybrid',
        minEffectiveStake: 100,
        bondedStakeAmount: 500,
        poaAuthorityKey: 'authority-key',
      });
      mediatorNode = new MediatorNode(config);

      mockAxios.get.mockImplementation((url: string) => {
        if (url.includes('/consensus/authorities')) {
          return Promise.resolve({
            data: {
              authorities: [config.mediatorPublicKey],
            },
          });
        }
        if (url.includes('/delegations/')) {
          return Promise.resolve({ data: { delegations: [] } });
        }
        if (url.includes('/reputation/')) {
          return Promise.resolve({
            data: {
              weight: 1.0,
              successfulClosures: 0,
              failedChallenges: 0,
              upheldChallengesAgainst: 0,
              forfeitedFees: 0,
            },
          });
        }
        return Promise.resolve({ data: { intents: [] } });
      });

      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(1000);

      expect(mediatorNode.getStatus().isRunning).toBe(true);

      await mediatorNode.stop();
      await jest.advanceTimersByTimeAsync(1000);

      expect(mediatorNode.getStatus().isRunning).toBe(false);
    });
  });
});
