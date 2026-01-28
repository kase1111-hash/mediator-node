/**
 * Integration tests for Intent Submission with Burn Validation
 * Demonstrates how IntentIngester integrates with BurnManager for intent submission
 */

import axios from 'axios';
import { MediatorNode } from '../../src/MediatorNode';
import { MediatorConfig } from '../../src/types';

// Mock dependencies
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
  generateIntentHash: (prose: string, author: string) =>
    `intent_${author}_${prose.substring(0, 10).replace(/\s/g, '_')}_${Date.now()}`,
}));

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            SUCCESS: true,
            CONFIDENCE: 0.85,
            REASONING: 'Test',
            PROPOSED_TERMS: {},
          }),
        }],
      }),
    },
  }));
});

// Mock fs module for BurnManager
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import * as fs from 'fs';
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Intent Submission Integration', () => {
  let mediatorNode: MediatorNode;
  let config: MediatorConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset fs mocks
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.writeFileSync.mockImplementation(() => undefined);

    config = {
      chainEndpoint: 'http://test-chain:8080',
      chainId: 'test-chain',
      consensusMode: 'permissionless',
      llmProvider: 'anthropic',
      llmApiKey: 'test-key',
      llmModel: 'claude-3-5-sonnet-20241022',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 1.0,
      vectorDbPath: './test-vector-db',
      vectorDimensions: 1536,
      maxIntentsCache: 10000,
      acceptanceWindowHours: 72,
      logLevel: 'info',
      // Burn configuration
      baseFilingBurn: 10,
      freeDailySubmissions: 1,
      burnEscalationBase: 2,
      burnEscalationExponent: 1,
      successBurnPercentage: 0.05,
      loadScalingEnabled: false,
      maxLoadMultiplier: 10,
    };

    mockAxios.get.mockResolvedValue({ data: { intents: [] } });
    mockAxios.post.mockResolvedValue({ status: 200, data: {} });

    mediatorNode = new MediatorNode(config);
  });

  describe('Intent Submission via IntentIngester', () => {
    it('should submit first intent with free burn allowance', async () => {
      const ingester = mediatorNode.getIntentIngester();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { intentHash: 'hash123' },
      });

      const intent = await ingester.submitIntent({
        author: 'alice',
        prose: 'I need a professional web developer to build an e-commerce platform for my business',
        offeredFee: 500,
      });

      expect(intent).not.toBeNull();
      expect(intent?.author).toBe('alice');
      expect(intent?.status).toBe('pending');

      // Verify intent was submitted to chain without burn (free submission)
      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://test-chain:8080/api/v1/intents',
        expect.objectContaining({
          intent: expect.objectContaining({
            author: 'alice',
          }),
          burnTransaction: null,
        })
      );
    });

    it('should execute burn for second intent submission', async () => {
      const ingester = mediatorNode.getIntentIngester();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx123' },
      });

      // First submission (free)
      await ingester.submitIntent({
        author: 'bob',
        prose: 'Looking for a graphic designer with experience in branding and logo design',
      });

      // Reset mocks
      mockAxios.post.mockClear();
      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx456' },
      });

      // Second submission (requires burn)
      const intent = await ingester.submitIntent({
        author: 'bob',
        prose: 'Seeking a mobile app developer with React Native expertise for iOS and Android',
        offeredFee: 750,
      });

      expect(intent).not.toBeNull();

      // Verify burn was executed
      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://test-chain:8080/api/v1/burns',
        expect.objectContaining({
          type: 'base_filing',
          amount: 20, // 10 × 2^1
          author: 'bob',
        })
      );

      // Verify intent was submitted with burn transaction
      expect(mockAxios.post).toHaveBeenCalledWith(
        'http://test-chain:8080/api/v1/intents',
        expect.objectContaining({
          burnTransaction: expect.objectContaining({
            type: 'base_filing',
            amount: 20,
          }),
        })
      );
    });

    it('should handle escalating burns for multiple submissions', async () => {
      const ingester = mediatorNode.getIntentIngester();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: { transactionHash: 'tx123' },
      });

      // First submission (free)
      await ingester.submitIntent({
        author: 'charlie',
        prose: 'Need assistance with data analysis and visualization using Python and Pandas',
      });

      // Second submission (20 tokens)
      await ingester.submitIntent({
        author: 'charlie',
        prose: 'Looking for help with machine learning model development using TensorFlow',
      });

      // Third submission (40 tokens)
      await ingester.submitIntent({
        author: 'charlie',
        prose: 'Seeking expertise in cloud infrastructure setup using AWS and Kubernetes',
      });

      const burnManager = mediatorNode.getBurnManager();
      const stats = burnManager.getBurnStats();

      // Should have 2 burns (second and third submissions)
      expect(stats.totalBurns).toBe(2);
      // Total: 20 + 40 = 60
      expect(stats.totalAmount).toBe(60);
      expect(stats.byType.base_filing.count).toBe(2);
    });

    it('should preview burn before submission', async () => {
      const ingester = mediatorNode.getIntentIngester();

      // Preview first submission
      const preview1 = ingester.previewIntentBurn('diana');
      expect(preview1?.isFree).toBe(true);
      expect(preview1?.amount).toBe(0);

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {},
      });

      // Execute first submission
      await ingester.submitIntent({
        author: 'diana',
        prose: 'Professional photographer needed for product photography and image editing',
      });

      // Preview second submission
      const preview2 = ingester.previewIntentBurn('diana');
      expect(preview2?.isFree).toBe(false);
      expect(preview2?.amount).toBe(20);
      expect(preview2?.breakdown.escalationMultiplier).toBe(2);

      // Execute second submission
      await ingester.submitIntent({
        author: 'diana',
        prose: 'Video editor required for creating marketing content and social media videos',
      });

      // Preview third submission
      const preview3 = ingester.previewIntentBurn('diana');
      expect(preview3?.amount).toBe(40); // 10 × 2^2
    });

    it('should track different users independently', async () => {
      const ingester = mediatorNode.getIntentIngester();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {},
      });

      // User 1: Free submission
      await ingester.submitIntent({
        author: 'user1',
        prose: 'Content writer needed for blog posts about technology and software development',
      });

      // User 2: Free submission
      await ingester.submitIntent({
        author: 'user2',
        prose: 'SEO specialist required to improve website ranking and organic traffic',
      });

      // User 1: Paid submission
      await ingester.submitIntent({
        author: 'user1',
        prose: 'Social media manager to handle Instagram and Twitter marketing campaigns',
      });

      const burnManager = mediatorNode.getBurnManager();

      expect(burnManager.getUserSubmissionCount('user1')).toBe(2);
      expect(burnManager.getUserSubmissionCount('user2')).toBe(1);
      expect(burnManager.getUserTotalBurned('user1')).toBe(20);
      expect(burnManager.getUserTotalBurned('user2')).toBe(0);
    });

    it('should include burn stats in node status', async () => {
      const ingester = mediatorNode.getIntentIngester();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {},
      });

      // Submit multiple intents
      await ingester.submitIntent({
        author: 'eve',
        prose: 'UI/UX designer with Figma experience for mobile application interface design',
      });

      await ingester.submitIntent({
        author: 'eve',
        prose: 'Frontend developer proficient in React and TypeScript for web development',
      });

      const status = mediatorNode.getStatus();

      expect(status.burnStats).toBeDefined();
      expect(status.burnStats.totalBurns).toBe(1);
      expect(status.burnStats.totalAmount).toBe(20);
      expect(status.burnStats.loadMultiplier).toBe(1.0);
    });

    it('should handle load multiplier in burn calculations', async () => {
      const customConfig = { ...config, loadScalingEnabled: true };
      const node = new MediatorNode(customConfig);
      const ingester = node.getIntentIngester();
      const burnManager = node.getBurnManager();

      mockAxios.post.mockResolvedValue({
        status: 200,
        data: {},
      });

      // Update load multiplier
      burnManager.updateLoadMultiplier(3.0);

      // First submission (free)
      await ingester.submitIntent({
        author: 'frank',
        prose: 'Database administrator with PostgreSQL expertise for performance optimization',
      });

      // Second submission should include load multiplier
      const preview = ingester.previewIntentBurn('frank');
      expect(preview?.amount).toBe(60); // 10 × 2 × 3.0
      expect(preview?.breakdown.loadMultiplier).toBe(3.0);
    });

    it('should reject invalid intent submissions', async () => {
      const ingester = mediatorNode.getIntentIngester();

      // Too short
      await expect(ingester.submitIntent({
        author: 'invalid',
        prose: 'short',
      })).rejects.toThrow('Invalid intent data');

      // Empty author
      await expect(ingester.submitIntent({
        author: '',
        prose: 'This is a valid length prose but the author is empty',
      })).rejects.toThrow('Invalid intent data');
    });
  });
});
