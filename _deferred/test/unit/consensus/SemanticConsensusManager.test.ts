import axios from 'axios';
import { SemanticConsensusManager } from '../../../src/consensus/SemanticConsensusManager';
import { LLMProvider } from '../../../src/llm/LLMProvider';
import {
  MediatorConfig,
  ProposedSettlement,
  VerificationRequest,
  VerificationResponse,
} from '../../../src/types';

jest.mock('axios');
jest.mock('../../../src/llm/LLMProvider');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SemanticConsensusManager', () => {
  let consensusManager: SemanticConsensusManager;
  let mockConfig: MediatorConfig;
  let mockLLMProvider: jest.Mocked<LLMProvider>;
  let mockSettlement: ProposedSettlement;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      chainEndpoint: 'https://test-chain.example.com',
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
      logLevel: 'error' as const,
      enableSemanticConsensus: true,
      highValueThreshold: 10000,
      verificationDeadlineHours: 24,
      requiredVerifiers: 5,
      requiredConsensus: 3,
      semanticSimilarityThreshold: 0.85,
      participateInVerification: true,
    };

    mockLLMProvider = new LLMProvider(mockConfig) as jest.Mocked<LLMProvider>;
    consensusManager = new SemanticConsensusManager(mockConfig, mockLLMProvider);

    mockSettlement = {
      id: 'settlement-123',
      intentHashA: 'intent-a-hash',
      intentHashB: 'intent-b-hash',
      reasoningTrace: 'Test reasoning',
      proposedTerms: {
        price: 15000, // High value
      },
      facilitationFee: 150,
      facilitationFeePercent: 1.0,
      modelIntegrityHash: 'model-hash',
      mediatorId: 'test-mediator',
      timestamp: Date.now(),
      status: 'proposed',
      acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
      partyAAccepted: false,
      partyBAccepted: false,
      challenges: [],
    };
  });

  describe('requiresVerification', () => {
    it('should return true for high-value settlements', () => {
      const highValueSettlement = {
        ...mockSettlement,
        facilitationFee: 100,
        facilitationFeePercent: 1.0, // 100 / 0.01 = 10000
      };

      expect(consensusManager.requiresVerification(highValueSettlement)).toBe(true);
    });

    it('should return false for low-value settlements', () => {
      const lowValueSettlement = {
        ...mockSettlement,
        proposedTerms: { price: 5000 }, // Low value
        facilitationFee: 50,
        facilitationFeePercent: 1.0,
      };

      expect(consensusManager.requiresVerification(lowValueSettlement)).toBe(false);
    });

    it('should return false when semantic consensus is disabled', () => {
      const disabledConfig = { ...mockConfig, enableSemanticConsensus: false };
      const manager = new SemanticConsensusManager(disabledConfig, mockLLMProvider);

      expect(manager.requiresVerification(mockSettlement)).toBe(false);
    });

    it('should handle settlements with zero fee percentage', () => {
      const zeroFeeSettlement = {
        ...mockSettlement,
        proposedTerms: {}, // No price
        facilitationFeePercent: 0,
      };

      expect(consensusManager.requiresVerification(zeroFeeSettlement)).toBe(false);
    });
  });

  describe('initiateVerification', () => {
    beforeEach(() => {
      // Mock axios.get for fetching active mediators
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          mediators: [
            { id: 'mediator-1', weight: 1.0 },
            { id: 'mediator-2', weight: 1.2 },
            { id: 'mediator-3', weight: 0.8 },
            { id: 'mediator-4', weight: 1.5 },
            { id: 'mediator-5', weight: 1.1 },
            { id: 'mediator-6', weight: 0.9 },
          ],
        },
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      // Mock axios.post for submitting verification request
      mockedAxios.post.mockResolvedValue({
        status: 201,
        data: {},
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });
    });

    it('should successfully initiate verification', async () => {
      const verification = await consensusManager.initiateVerification(mockSettlement);

      expect(verification).toBeDefined();
      expect(verification.settlementId).toBe(mockSettlement.id);
      expect(verification.status).toBe('pending');
      expect(verification.request.selectedVerifiers).toHaveLength(5);
      expect(verification.request.settlementId).toBe(mockSettlement.id);
      expect(verification.requiredConsensus).toBe(3);
    });

    it('should exclude requester and self from verifier selection', async () => {
      const verification = await consensusManager.initiateVerification(mockSettlement);

      expect(verification.request.selectedVerifiers).not.toContain(
        mockConfig.mediatorPublicKey
      );
      expect(verification.request.selectedVerifiers).not.toContain(
        mockSettlement.mediatorId
      );
    });

    it('should set correct verification deadline', async () => {
      const verification = await consensusManager.initiateVerification(mockSettlement);

      const expectedDeadline =
        verification.request.requestedAt + 24 * 60 * 60 * 1000; // 24 hours

      expect(verification.request.responseDeadline).toBe(expectedDeadline);
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(
        consensusManager.initiateVerification(mockSettlement)
      ).rejects.toThrow('Network error');
    });

    it('should track initiated verification', async () => {
      await consensusManager.initiateVerification(mockSettlement);

      const verification = consensusManager.getVerification(mockSettlement.id);
      expect(verification).toBeDefined();
      expect(verification?.status).toBe('pending');
    });
  });

  describe('checkSemanticEquivalence', () => {
    it('should detect equivalent summaries', () => {
      const embedding1 = [0.5, 0.8, 0.3, 0.9];
      const embedding2 = [0.52, 0.79, 0.31, 0.88]; // Very similar

      const result = consensusManager.checkSemanticEquivalence(
        'Summary 1',
        embedding1,
        'Summary 2',
        embedding2
      );

      expect(result.areEquivalent).toBe(true);
      expect(result.cosineSimilarity).toBeGreaterThan(0.85);
    });

    it('should detect non-equivalent summaries', () => {
      const embedding1 = [1.0, 0.0, 0.0, 0.0];
      const embedding2 = [0.0, 1.0, 0.0, 0.0]; // Orthogonal

      const result = consensusManager.checkSemanticEquivalence(
        'Summary 1',
        embedding1,
        'Summary 2',
        embedding2
      );

      expect(result.areEquivalent).toBe(false);
      expect(result.cosineSimilarity).toBeLessThan(0.85);
    });

    it('should handle identical embeddings', () => {
      const embedding = [0.5, 0.5, 0.5, 0.5];

      const result = consensusManager.checkSemanticEquivalence(
        'Summary',
        embedding,
        'Summary',
        embedding
      );

      expect(result.areEquivalent).toBe(true);
      expect(result.cosineSimilarity).toBeCloseTo(1.0);
    });

    it('should use configured similarity threshold', () => {
      const customConfig = { ...mockConfig, semanticSimilarityThreshold: 0.95 };
      const customManager = new SemanticConsensusManager(
        customConfig,
        mockLLMProvider
      );

      const embedding1 = [0.5, 0.8, 0.3, 0.9];
      const embedding2 = [0.52, 0.79, 0.31, 0.88];

      const result = customManager.checkSemanticEquivalence(
        'Summary 1',
        embedding1,
        'Summary 2',
        embedding2
      );

      expect(result.threshold).toBe(0.95);
    });
  });

  describe('submitVerificationResponse', () => {
    let mockRequest: VerificationRequest;

    beforeEach(() => {
      mockRequest = {
        settlementId: mockSettlement.id,
        requesterId: 'requester-id',
        intentHashA: mockSettlement.intentHashA,
        intentHashB: mockSettlement.intentHashB,
        proposedTerms: mockSettlement.proposedTerms,
        settlementValue: 15000,
        selectedVerifiers: [mockConfig.mediatorPublicKey, 'v2', 'v3', 'v4', 'v5'],
        requestedAt: Date.now(),
        responseDeadline: Date.now() + 24 * 60 * 60 * 1000,
        signature: 'test-signature',
      };

      // Mock LLM response for semantic summary generation
      mockLLMProvider.generateEmbedding = jest.fn().mockResolvedValue([
        0.1, 0.2, 0.3, 0.4,
      ]);

      // Mock axios.get for fetching intents
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          hash: 'intent-hash',
          prose: 'Test intent prose',
          desires: ['test'],
          constraints: [],
          timestamp: Date.now(),
          status: 'pending',
        },
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      // Mock axios.post for submitting response
      mockedAxios.post.mockResolvedValue({
        status: 201,
        data: {},
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });
    });

    it('should generate and submit verification response', async () => {
      // Mock Anthropic API for semantic summary
      const mockAnthropicCreate = jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: 'Test semantic summary',
              approves: true,
              confidence: 0.92,
            }),
          },
        ],
      });

      (mockLLMProvider as any).anthropic = {
        messages: {
          create: mockAnthropicCreate,
        },
      };

      const response = await consensusManager.submitVerificationResponse(
        mockRequest,
        mockSettlement
      );

      expect(response).toBeDefined();
      expect(response.settlementId).toBe(mockSettlement.id);
      expect(response.verifierId).toBe(mockConfig.mediatorPublicKey);
      expect(response.approves).toBe(true);
      expect(response.confidence).toBe(0.92);
      expect(response.summaryEmbedding).toHaveLength(4);
    });

    it('should handle LLM errors gracefully', async () => {
      (mockLLMProvider as any).anthropic = {
        messages: {
          create: jest.fn().mockRejectedValue(new Error('LLM error')),
        },
      };

      const response = await consensusManager.submitVerificationResponse(
        mockRequest,
        mockSettlement
      );

      // Should return a default response when LLM fails
      expect(response).toBeDefined();
      expect(response.approves).toBe(false);
      expect(response.confidence).toBe(0);
      expect(response.semanticSummary).toContain('Summary generation failed');
    });
  });

  describe('getVerificationStats', () => {
    it('should return empty stats when no verifications', () => {
      const stats = consensusManager.getVerificationStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.inProgress).toBe(0);
      expect(stats.consensusReached).toBe(0);
      expect(stats.consensusFailed).toBe(0);
      expect(stats.timedOut).toBe(0);
    });

    it('should count pending verifications', async () => {
      // Mock successful initiation
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          mediators: Array.from({ length: 10 }, (_, i) => ({
            id: `mediator-${i}`,
            weight: 1.0,
          })),
        },
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      mockedAxios.post.mockResolvedValue({
        status: 201,
        data: {},
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });

      await consensusManager.initiateVerification(mockSettlement);

      const stats = consensusManager.getVerificationStats();
      expect(stats.total).toBe(1);
      expect(stats.pending).toBe(1);
    });
  });

  describe('getVerification', () => {
    it('should return verification by settlement ID', async () => {
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          mediators: Array.from({ length: 10 }, (_, i) => ({
            id: `mediator-${i}`,
            weight: 1.0,
          })),
        },
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      mockedAxios.post.mockResolvedValue({
        status: 201,
        data: {},
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });

      await consensusManager.initiateVerification(mockSettlement);

      const verification = consensusManager.getVerification(mockSettlement.id);
      expect(verification).toBeDefined();
      expect(verification?.settlementId).toBe(mockSettlement.id);
    });

    it('should return null for non-existent verification', () => {
      const verification = consensusManager.getVerification('nonexistent');
      expect(verification).toBeNull();
    });
  });

  describe('hasResponded', () => {
    it('should return false when no response submitted', async () => {
      const hasResponded = await consensusManager.hasResponded(mockSettlement.id);
      expect(hasResponded).toBe(false);
    });
  });

  describe('checkVerificationTimeouts', () => {
    it('should mark expired verifications as timed out', async () => {
      // Create a verification with expired deadline
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          mediators: Array.from({ length: 10 }, (_, i) => ({
            id: `mediator-${i}`,
            weight: 1.0,
          })),
        },
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      mockedAxios.post.mockResolvedValue({
        status: 201,
        data: {},
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });

      await consensusManager.initiateVerification(mockSettlement);

      // Manually set deadline to past
      const verification = consensusManager.getVerification(mockSettlement.id);
      if (verification) {
        verification.request.responseDeadline = Date.now() - 1000;
      }

      await consensusManager.checkVerificationTimeouts();

      const updated = consensusManager.getVerification(mockSettlement.id);
      expect(updated?.status).toBe('timeout');
    });
  });
});
