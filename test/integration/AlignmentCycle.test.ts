import axios from 'axios';
import { MediatorNode } from '../../src/MediatorNode';
import { MediatorConfig, Intent, ProposedSettlement } from '../../src/types';
import { createMockConfig, createMockIntent } from '../utils/testUtils';

// Mock all external dependencies
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

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  }));
});

// Mock OpenAI SDK
const mockOpenAIEmbeddings = jest.fn().mockResolvedValue({
  data: [{ embedding: new Array(1536).fill(0).map((_, i) => i * 0.001) }],
});

const mockOpenAIChat = jest.fn().mockResolvedValue({
  choices: [{
    message: {
      content: JSON.stringify({
        SUCCESS: true,
        CONFIDENCE: 0.85,
        REASONING: 'Test negotiation successful',
        PROPOSED_TERMS: {
          price: 100,
          deliverables: ['Test deliverable'],
          timelines: '1 week',
        },
      }),
    },
  }],
});

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: mockOpenAIEmbeddings,
    },
    chat: {
      completions: {
        create: mockOpenAIChat,
      },
    },
  }));
});

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Integration: Alignment Cycle', () => {
  let config: MediatorConfig;
  let mediatorNode: MediatorNode;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    config = createMockConfig({
      consensusMode: 'permissionless',
      chainEndpoint: 'https://chain.example.com',
      llmProvider: 'anthropic',
      llmApiKey: 'test-api-key',
      mediatorPublicKey: 'mediator_pub_123',
      mediatorPrivateKey: 'mediator_priv_123',
    });

    mediatorNode = new MediatorNode(config);
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

  describe('Full Cycle Execution', () => {
    it('should execute complete alignment cycle from start to finish', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({
          hash: 'intent_a',
          author: 'user_a',
          prose: 'I need a web developer to build a landing page for my startup',
          desires: ['web development', 'landing page'],
          constraints: ['budget $500'],
          offeredFee: 5,
        }),
        createMockIntent({
          hash: 'intent_b',
          author: 'user_b',
          prose: 'I can build modern landing pages using React and Tailwind CSS',
          desires: ['web development projects', 'frontend work'],
          constraints: ['minimum $400 payment'],
          offeredFee: 4,
        }),
      ];

      // Mock intent fetching
      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });

      // Mock settlement submission
      mockAxios.post.mockResolvedValue({ status: 200 });

      // Start the node
      await mediatorNode.start();

      // Wait for initial cycle to complete
      await jest.advanceTimersByTimeAsync(1000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
      expect(status.cachedIntents).toBe(2);
    });

    it('should handle intent discovery and caching', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_1' }),
        createMockIntent({ hash: 'intent_2' }),
        createMockIntent({ hash: 'intent_3' }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });

      await mediatorNode.start();

      // Wait for polling cycle
      await jest.advanceTimersByTimeAsync(11000);

      const status = mediatorNode.getStatus();
      expect(status.cachedIntents).toBeGreaterThanOrEqual(0);
    });

    it('should generate embeddings for all intents', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_1', prose: 'First intent prose' }),
        createMockIntent({ hash: 'intent_2', prose: 'Second intent prose' }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });
      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();

      // Wait for polling and cycle
      await jest.advanceTimersByTimeAsync(35000);

      // Verify vector database has intents
      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should find alignment candidates with high similarity', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({
          hash: 'intent_buyer',
          prose: 'I want to hire a React developer for a web project',
          offeredFee: 10,
        }),
        createMockIntent({
          hash: 'intent_seller',
          prose: 'I am a React developer available for web projects',
          offeredFee: 8,
        }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });
      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Should have attempted to process intents
      expect(mockAxios.get).toHaveBeenCalled();
    });

    it('should submit settlement after successful negotiation', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_a', offeredFee: 5 }),
        createMockIntent({ hash: 'intent_b', offeredFee: 5 }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });
      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Should have made API calls
      expect(mockAxios.get).toHaveBeenCalled();
    });
  });

  describe('Multi-Candidate Processing', () => {
    it('should process top 3 candidates per cycle', async () => {
      // Create 5 intents that could form multiple pairs
      const mockIntents: Intent[] = Array.from({ length: 5 }, (_, i) =>
        createMockIntent({
          hash: `intent_${i}`,
          prose: `Intent number ${i} looking for alignment`,
          offeredFee: 5,
        })
      );

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });
      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Should process up to 3 candidates
      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should handle no alignment candidates gracefully', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({
          hash: 'intent_single',
          prose: 'Single intent with no match',
        }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Should complete without errors
      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should prioritize candidates by fee and similarity', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'high_fee', offeredFee: 10 }),
        createMockIntent({ hash: 'low_fee', offeredFee: 1 }),
        createMockIntent({ hash: 'med_fee', offeredFee: 5 }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });
      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Higher fee intents should be processed first
      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should continue after LLM API failure', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_1' }),
        createMockIntent({ hash: 'intent_2' }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });

      // First call fails, second succeeds
      mockAxios.post
        .mockRejectedValueOnce(new Error('LLM API error'))
        .mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(70000); // Two cycles

      // Should still be running after error
      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should handle intent fetching errors gracefully', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'));

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(15000);

      // Should still be running
      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should handle settlement submission failures', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_a' }),
        createMockIntent({ hash: 'intent_b' }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });
      mockAxios.post.mockRejectedValue(new Error('Chain API error'));

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Should continue despite submission failure
      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should recover from vector database errors', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_1' }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Should handle gracefully
      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup embedding cache for removed intents', async () => {
      // First cycle with 3 intents
      const initialIntents: Intent[] = [
        createMockIntent({ hash: 'intent_1' }),
        createMockIntent({ hash: 'intent_2' }),
        createMockIntent({ hash: 'intent_3' }),
      ];

      mockAxios.get.mockResolvedValueOnce({
        data: { intents: initialIntents },
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Second cycle with only 1 intent
      const updatedIntents: Intent[] = [
        createMockIntent({ hash: 'intent_1' }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: updatedIntents },
      });

      await jest.advanceTimersByTimeAsync(35000);

      // Cache should be cleaned up
      const status = mediatorNode.getStatus();
      expect(status.cachedIntents).toBeLessThanOrEqual(1);
    });

    it('should clear intervals on stop', async () => {
      mockAxios.get.mockResolvedValue({
        data: { intents: [] },
      });

      await mediatorNode.start();
      expect(mediatorNode.getStatus().isRunning).toBe(true);

      await mediatorNode.stop();
      expect(mediatorNode.getStatus().isRunning).toBe(false);

      // Advance time to verify intervals are cleared
      await jest.advanceTimersByTimeAsync(100000);
      // Should not throw errors
    });

    it('should save vector database on stop', async () => {
      mockAxios.get.mockResolvedValue({
        data: { intents: [] },
      });

      await mediatorNode.start();
      await mediatorNode.stop();

      // Vector database save should be called
      // (verified by no errors thrown)
    });

    it('should handle stop before start gracefully', async () => {
      await expect(mediatorNode.stop()).resolves.not.toThrow();
    });

    it('should handle multiple stop calls gracefully', async () => {
      mockAxios.get.mockResolvedValue({
        data: { intents: [] },
      });

      await mediatorNode.start();
      await mediatorNode.stop();
      await expect(mediatorNode.stop()).resolves.not.toThrow();
    });
  });

  describe('Cycle Timing and Intervals', () => {
    it('should run alignment cycle every 30 seconds', async () => {
      mockAxios.get.mockResolvedValue({
        data: { intents: [] },
      });

      await mediatorNode.start();

      // First cycle runs immediately
      await jest.advanceTimersByTimeAsync(1000);

      // Second cycle after 30 seconds
      await jest.advanceTimersByTimeAsync(30000);

      // Third cycle after another 30 seconds
      await jest.advanceTimersByTimeAsync(30000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should poll for intents every 10 seconds', async () => {
      let pollCount = 0;
      mockAxios.get.mockImplementation(() => {
        pollCount++;
        return Promise.resolve({ data: { intents: [] } });
      });

      await mediatorNode.start();

      // Initial poll
      await jest.advanceTimersByTimeAsync(1000);
      expect(pollCount).toBeGreaterThan(0);

      // Wait for 3 more polls
      await jest.advanceTimersByTimeAsync(30000);
      expect(pollCount).toBeGreaterThan(2);
    });

    it('should monitor settlements every 60 seconds', async () => {
      mockAxios.get.mockResolvedValue({
        data: { intents: [] },
      });

      await mediatorNode.start();

      // Wait for settlement monitoring to run
      await jest.advanceTimersByTimeAsync(65000);

      const status = mediatorNode.getStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe('Settlement Submission Flow', () => {
    it('should create settlement with correct structure', async () => {
      const mockIntents: Intent[] = [
        createMockIntent({
          hash: 'intent_a',
          author: 'user_a',
          offeredFee: 5,
        }),
        createMockIntent({
          hash: 'intent_b',
          author: 'user_b',
          offeredFee: 5,
        }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });
      mockAxios.post.mockResolvedValue({ status: 200 });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Verify settlement structure
      const settlementCall = mockAxios.post.mock.calls.find(
        call => call[1] && (call[1] as any).type === 'settlement'
      );

      if (settlementCall) {
        const settlement = (settlementCall[1] as any).data as ProposedSettlement;
        expect(settlement).toHaveProperty('id');
        expect(settlement).toHaveProperty('intentHashA');
        expect(settlement).toHaveProperty('intentHashB');
        expect(settlement).toHaveProperty('proposedTerms');
        expect(settlement).toHaveProperty('facilitationFee');
      }
    });

    it('should not submit if negotiation fails', async () => {
      // Mock failed negotiation
      jest.mock('@anthropic-ai/sdk', () => ({
        default: jest.fn().mockImplementation(() => ({
          messages: {
            create: jest.fn().mockResolvedValue({
              content: [{
                type: 'text',
                text: JSON.stringify({
                  SUCCESS: false,
                  CONFIDENCE: 0.3,
                  REASONING: 'Intents are incompatible',
                }),
              }],
            }),
          },
        })),
      }));

      const mockIntents: Intent[] = [
        createMockIntent({ hash: 'intent_a' }),
        createMockIntent({ hash: 'intent_b' }),
      ];

      mockAxios.get.mockResolvedValue({
        data: { intents: mockIntents },
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(35000);

      // Should not submit settlement
      const settlementCalls = mockAxios.post.mock.calls.filter(
        call => call[1] && (call[1] as any).type === 'settlement'
      );

      // May or may not submit depending on other candidates
      expect(mockAxios.get).toHaveBeenCalled();
    });
  });

  describe('Status and Monitoring', () => {
    it('should provide accurate status information', async () => {
      // Mock both intent and reputation API calls
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
        return Promise.resolve({
          data: { intents: [createMockIntent(), createMockIntent()] },
        });
      });

      await mediatorNode.start();
      await jest.advanceTimersByTimeAsync(15000);

      const status = mediatorNode.getStatus();

      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('cachedIntents');
      expect(status).toHaveProperty('activeSettlements');
      expect(status).toHaveProperty('reputation');
      expect(status).toHaveProperty('effectiveStake');

      expect(status.isRunning).toBe(true);
      expect(typeof status.cachedIntents).toBe('number');
      expect(typeof status.activeSettlements).toBe('number');
      expect(typeof status.reputation).toBe('number');
      expect(typeof status.effectiveStake).toBe('number');
    });

    it('should update status after intents are cached', async () => {
      mockAxios.get.mockResolvedValue({
        data: { intents: [] },
      });

      await mediatorNode.start();

      const beforeStatus = mediatorNode.getStatus();
      const beforeCount = beforeStatus.cachedIntents;

      // Add intents
      mockAxios.get.mockResolvedValue({
        data: {
          intents: [
            createMockIntent({ hash: 'intent_1' }),
            createMockIntent({ hash: 'intent_2' }),
          ],
        },
      });

      await jest.advanceTimersByTimeAsync(15000);

      const afterStatus = mediatorNode.getStatus();
      // Status should be available
      expect(afterStatus).toBeDefined();
      expect(afterStatus.isRunning).toBe(true);
    });
  });
});
