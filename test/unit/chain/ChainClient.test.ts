import axios from 'axios';
import { ChainClient } from '../../../src/chain/ChainClient';
import { Intent, ProposedSettlement, Challenge, MediatorConfig } from '../../../src/types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ChainClient', () => {
  let chainClient: ChainClient;
  const mockConfig = {
    chainEndpoint: 'http://localhost:5000',
    mediatorPublicKey: 'mediator-pub-key',
    mediatorPrivateKey: 'mediator-priv-key',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock axios instance
    const mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      interceptors: {
        response: {
          use: jest.fn(),
        },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    chainClient = new ChainClient(mockConfig);
  });

  describe('constructor', () => {
    it('should create ChainClient with config', () => {
      expect(chainClient).toBeDefined();
      expect(chainClient.getBaseUrl()).toBe('http://localhost:5000');
    });

    it('should create ChainClient from MediatorConfig', () => {
      const mediatorConfig: MediatorConfig = {
        chainEndpoint: 'http://test:5000',
        chainId: 'test-chain',
        consensusMode: 'permissionless',
        llmProvider: 'anthropic',
        llmApiKey: 'test-key',
        llmModel: 'claude-3-sonnet',
        mediatorPrivateKey: 'priv-key',
        mediatorPublicKey: 'pub-key',
        facilitationFeePercent: 5,
        vectorDbPath: './test-db',
        vectorDimensions: 768,
        maxIntentsCache: 1000,
        acceptanceWindowHours: 72,
        logLevel: 'info',
      };

      const client = ChainClient.fromConfig(mediatorConfig);
      expect(client).toBeDefined();
      expect(client.getBaseUrl()).toBe('http://test:5000');
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status when API responds', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.get.mockResolvedValueOnce({ data: { status: 'ok' } });

      const result = await chainClient.checkHealth();

      expect(result.healthy).toBe(true);
      expect(result.status).toEqual({ status: 'ok' });
    });

    it('should return unhealthy status when API fails', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.get.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await chainClient.checkHealth();

      expect(result.healthy).toBe(false);
    });
  });

  describe('getPendingIntents', () => {
    it('should fetch and transform pending intents', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.get.mockResolvedValueOnce({
        data: [
          {
            content: 'I am looking for a developer',
            author: 'user1',
            intent: 'hire',
            metadata: { is_contract: true, contract_type: 'offer' },
          },
        ],
      });

      const intents = await chainClient.getPendingIntents();

      expect(intents.length).toBe(1);
      expect(intents[0].prose).toBe('I am looking for a developer');
      expect(intents[0].author).toBe('user1');
    });

    it('should handle empty response', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.get.mockResolvedValueOnce({ data: [] });

      const intents = await chainClient.getPendingIntents();

      expect(intents).toEqual([]);
    });

    it('should filter by timestamp when since option provided', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      const now = Date.now();
      mockInstance.get.mockResolvedValueOnce({
        data: [
          {
            content: 'Old intent',
            author: 'user1',
            intent: 'test',
            timestamp: now - 100000,
            metadata: { is_contract: true },
          },
          {
            content: 'New intent',
            author: 'user2',
            intent: 'test',
            timestamp: now,
            metadata: { is_contract: true },
          },
        ],
      });

      const intents = await chainClient.getPendingIntents({ since: now - 50000 });

      expect(intents.length).toBe(1);
      expect(intents[0].prose).toBe('New intent');
    });
  });

  describe('submitIntent', () => {
    it('should submit intent and return success', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.post.mockResolvedValueOnce({ status: 201 });

      const intent: Intent = {
        hash: 'test-hash',
        author: 'user1',
        prose: 'I need a TypeScript developer',
        desires: ['hire developer'],
        constraints: ['must know TypeScript'],
        timestamp: Date.now(),
        status: 'pending',
      };

      const result = await chainClient.submitIntent(intent);

      expect(result.success).toBe(true);
      expect(result.hash).toBe('test-hash');
    });

    it('should return error on failed submission', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.post.mockRejectedValueOnce(new Error('Network error'));

      const intent: Intent = {
        hash: 'test-hash',
        author: 'user1',
        prose: 'Test intent',
        desires: [],
        constraints: [],
        timestamp: Date.now(),
        status: 'pending',
      };

      const result = await chainClient.submitIntent(intent);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('submitSettlement', () => {
    it('should submit settlement successfully', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.post.mockResolvedValueOnce({ status: 201 });

      const settlement: ProposedSettlement = {
        id: 'settlement123',
        intentHashA: 'intentA',
        intentHashB: 'intentB',
        reasoningTrace: 'Both parties agree',
        proposedTerms: { price: 1000 },
        facilitationFee: 50,
        facilitationFeePercent: 5,
        modelIntegrityHash: 'hash123',
        mediatorId: 'mediator1',
        timestamp: Date.now(),
        status: 'proposed',
        acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
        partyAAccepted: false,
        partyBAccepted: false,
      };

      const result = await chainClient.submitSettlement(settlement);

      expect(result.success).toBe(true);
    });
  });

  describe('getSettlementStatus', () => {
    it('should fetch settlement status via semantic search', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.post.mockResolvedValueOnce({
        data: {
          results: [
            {
              content: 'Acceptance of settlement123',
              author: 'partyA',
              metadata: {
                settlement_id: 'settlement123',
                party: 'A',
                accepted: true,
              },
            },
          ],
        },
      });

      const status = await chainClient.getSettlementStatus('settlement123');

      expect(status).toBeDefined();
      expect(status?.partyAAccepted).toBe(true);
      expect(status?.partyBAccepted).toBe(false);
    });
  });

  describe('submitChallenge', () => {
    it('should submit challenge and return success', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.post.mockResolvedValueOnce({ status: 201 });

      const challenge: Challenge = {
        id: 'challenge123',
        settlementId: 'settlement123',
        challengerId: 'challenger1',
        contradictionProof: 'Settlement violates constraint',
        paraphraseEvidence: 'Original intent stated...',
        timestamp: Date.now(),
        status: 'pending',
      };

      const result = await chainClient.submitChallenge(challenge);

      expect(result.success).toBe(true);
      expect(result.challengeId).toBe('challenge123');
    });
  });

  describe('submitBurn', () => {
    it('should submit burn transaction', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      // First call for /burn/execute fails, second for /entry succeeds
      mockInstance.post
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce({ status: 201 });

      const result = await chainClient.submitBurn({
        type: 'base_filing',
        author: 'user1',
        amount: 10,
        intentHash: 'intent123',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('submitPayout', () => {
    it('should submit payout claim', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.post.mockResolvedValueOnce({ status: 201 });

      const result = await chainClient.submitPayout('settlement123', 50);

      expect(result.success).toBe(true);
    });
  });

  describe('searchSemantic', () => {
    it('should perform semantic search', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.post.mockResolvedValueOnce({
        data: {
          results: [
            { content: 'Matching entry', author: 'user1', intent: 'test' },
          ],
        },
      });

      const results = await chainClient.searchSemantic('find developer');

      expect(results.length).toBe(1);
      expect(results[0].content).toBe('Matching entry');
    });

    it('should return empty array on search failure', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.post.mockRejectedValueOnce(new Error('Search failed'));

      const results = await chainClient.searchSemantic('test query');

      expect(results).toEqual([]);
    });
  });

  describe('getChain', () => {
    it('should fetch full chain data', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.get.mockResolvedValueOnce({
        data: {
          blocks: [
            { index: 0, entries: [], hash: 'genesis' },
          ],
        },
      });

      const chain = await chainClient.getChain();

      expect(chain).toBeDefined();
      expect(chain.blocks.length).toBe(1);
    });
  });

  describe('validateChain', () => {
    it('should return valid chain status', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.get.mockResolvedValueOnce({
        data: { valid: true },
      });

      const result = await chainClient.validateChain();

      expect(result.valid).toBe(true);
    });

    it('should return invalid status with issues', async () => {
      const mockInstance = mockedAxios.create.mock.results[0].value;
      mockInstance.get.mockResolvedValueOnce({
        data: { valid: false, issues: ['Hash mismatch at block 5'] },
      });

      const result = await chainClient.validateChain();

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Hash mismatch at block 5');
    });
  });
});
