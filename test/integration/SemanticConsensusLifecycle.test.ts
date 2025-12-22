import axios from 'axios';
import { MediatorNode } from '../../src/MediatorNode';
import { ConfigLoader } from '../../src/config/ConfigLoader';
import { MediatorConfig } from '../../src/types';
import * as fs from 'fs';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Semantic Consensus Verification Lifecycle Integration', () => {
  let mediatorNode: MediatorNode;
  let config: MediatorConfig;
  let testDbPath: string;

  beforeEach(() => {
    // Set up test environment
    process.env.CHAIN_ENDPOINT = 'https://test-chain.example.com';
    process.env.CHAIN_ID = 'test-chain';
    process.env.CONSENSUS_MODE = 'permissionless';
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'claude-3-5-sonnet-20241022';
    process.env.MEDIATOR_PRIVATE_KEY = 'test-private-key';
    process.env.MEDIATOR_PUBLIC_KEY = 'test-mediator-public-key';
    process.env.FACILITATION_FEE_PERCENT = '1.0';
    process.env.VECTOR_DB_PATH = './test-semantic-vector-db';
    process.env.ENABLE_SEMANTIC_CONSENSUS = 'true';
    process.env.HIGH_VALUE_THRESHOLD = '10000';
    process.env.VERIFICATION_DEADLINE_HOURS = '24';
    process.env.REQUIRED_VERIFIERS = '5';
    process.env.REQUIRED_CONSENSUS = '3';
    process.env.SEMANTIC_SIMILARITY_THRESHOLD = '0.85';
    process.env.PARTICIPATE_IN_VERIFICATION = 'true';
    process.env.LOG_LEVEL = 'error';

    testDbPath = process.env.VECTOR_DB_PATH!;

    config = ConfigLoader.load();
    mediatorNode = new MediatorNode(config);
  });

  afterEach(async () => {
    await mediatorNode.stop();

    // Cleanup test database
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }

    jest.clearAllMocks();
  });

  describe('High-Value Settlement Detection', () => {
    it('should detect high-value settlements requiring verification', () => {
      const settlementManager = mediatorNode.getSettlementManager();
      const consensusManager = mediatorNode.getSemanticConsensusManager();

      expect(consensusManager).toBeDefined();

      const highValueSettlement = {
        id: 'settlement-high',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test',
        proposedTerms: { price: 15000 },
        facilitationFee: 150,
        facilitationFeePercent: 1.0,
        modelIntegrityHash: 'hash',
        mediatorId: 'test-mediator',
        timestamp: Date.now(),
        status: 'proposed' as const,
        acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
      };

      expect(consensusManager.requiresVerification(highValueSettlement)).toBe(true);
    });

    it('should not require verification for low-value settlements', () => {
      const consensusManager = mediatorNode.getSemanticConsensusManager();

      const lowValueSettlement = {
        id: 'settlement-low',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test',
        proposedTerms: { price: 5000 },
        facilitationFee: 50,
        facilitationFeePercent: 1.0,
        modelIntegrityHash: 'hash',
        mediatorId: 'test-mediator',
        timestamp: Date.now(),
        status: 'proposed' as const,
        acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
      };

      expect(consensusManager.requiresVerification(lowValueSettlement)).toBe(false);
    });
  });

  describe('Verification Request Initiation', () => {
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
            { id: 'mediator-7', weight: 1.3 },
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

    it('should initiate verification for high-value settlement', async () => {
      const consensusManager = mediatorNode.getSemanticConsensusManager();

      const settlement = {
        id: 'settlement-verify',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test reasoning',
        proposedTerms: { price: 20000 },
        facilitationFee: 200,
        facilitationFeePercent: 1.0,
        modelIntegrityHash: 'hash',
        mediatorId: 'other-mediator',
        timestamp: Date.now(),
        status: 'proposed' as const,
        acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
      };

      const verification = await consensusManager.initiateVerification(settlement);

      expect(verification).toBeDefined();
      expect(verification.settlementId).toBe(settlement.id);
      expect(verification.status).toBe('pending');
      expect(verification.request.selectedVerifiers).toHaveLength(5);
      expect(verification.requiredConsensus).toBe(3);

      // Verify API was called
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/verifications`,
        expect.objectContaining({
          request: expect.objectContaining({
            settlementId: settlement.id,
            selectedVerifiers: expect.arrayContaining([expect.any(String)]),
          }),
        })
      );
    });

    it('should exclude requester and self from verifier selection', async () => {
      const consensusManager = mediatorNode.getSemanticConsensusManager();

      const settlement = {
        id: 'settlement-exclude',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test',
        proposedTerms: { price: 15000 },
        facilitationFee: 150,
        facilitationFeePercent: 1.0,
        modelIntegrityHash: 'hash',
        mediatorId: 'original-mediator',
        timestamp: Date.now(),
        status: 'proposed' as const,
        acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
      };

      const verification = await consensusManager.initiateVerification(settlement);

      expect(verification.request.selectedVerifiers).not.toContain(
        config.mediatorPublicKey
      );
      expect(verification.request.selectedVerifiers).not.toContain(
        settlement.mediatorId
      );
    });
  });

  describe('Verification Response Submission', () => {
    let mockRequest: any;

    beforeEach(() => {
      mockRequest = {
        settlementId: 'settlement-response',
        requesterId: 'requester-id',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        proposedTerms: { price: 15000 },
        settlementValue: 15000,
        selectedVerifiers: [config.mediatorPublicKey, 'v2', 'v3', 'v4', 'v5'],
        requestedAt: Date.now(),
        responseDeadline: Date.now() + 24 * 60 * 60 * 1000,
        signature: 'test-signature',
      };

      // Mock axios.get for fetching intents
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('/intents/')) {
          return Promise.resolve({
            status: 200,
            data: {
              hash: url.includes('intent-a') ? 'intent-a' : 'intent-b',
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
        }
        return Promise.reject(new Error('Not found'));
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
      const consensusManager = mediatorNode.getSemanticConsensusManager();
      const llmProvider = (consensusManager as any).llmProvider;

      // Mock LLM embedding generation
      llmProvider.generateEmbedding = jest
        .fn()
        .mockResolvedValue([0.1, 0.2, 0.3, 0.4]);

      // Mock Anthropic API for semantic summary
      (llmProvider as any).anthropic = {
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'Agreement on service delivery for $15000',
                  approves: true,
                  confidence: 0.95,
                }),
              },
            ],
          }),
        },
      };

      const settlement = {
        id: 'settlement-response',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test',
        proposedTerms: { price: 15000 },
        facilitationFee: 150,
        facilitationFeePercent: 1.0,
        modelIntegrityHash: 'hash',
        mediatorId: 'requester-id',
        timestamp: Date.now(),
        status: 'proposed' as const,
        acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
      };

      const response = await consensusManager.submitVerificationResponse(
        mockRequest,
        settlement
      );

      expect(response).toBeDefined();
      expect(response.settlementId).toBe(settlement.id);
      expect(response.verifierId).toBe(config.mediatorPublicKey);
      expect(response.approves).toBe(true);
      expect(response.confidence).toBe(0.95);
      expect(response.semanticSummary).toContain('service delivery');

      // Verify API was called
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/verifications/${settlement.id}/responses`,
        expect.objectContaining({
          response: expect.objectContaining({
            settlementId: settlement.id,
            verifierId: config.mediatorPublicKey,
          }),
        })
      );
    });
  });

  describe('Node Status Integration', () => {
    it('should include verification stats in node status', async () => {
      const status = mediatorNode.getStatus();

      expect(status.verificationStats).toBeDefined();
      expect(status.verificationStats?.total).toBe(0);
      expect(status.verificationStats?.pending).toBe(0);
      expect(status.verificationStats?.consensusReached).toBe(0);
    });

    it('should update stats after initiating verification', async () => {
      const consensusManager = mediatorNode.getSemanticConsensusManager();

      // Mock necessary API calls
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

      const settlement = {
        id: 'settlement-stats',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test',
        proposedTerms: { price: 15000 },
        facilitationFee: 150,
        facilitationFeePercent: 1.0,
        modelIntegrityHash: 'hash',
        mediatorId: 'other-mediator',
        timestamp: Date.now(),
        status: 'proposed' as const,
        acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
      };

      await consensusManager.initiateVerification(settlement);

      const status = mediatorNode.getStatus();
      expect(status.verificationStats?.total).toBe(1);
      expect(status.verificationStats?.pending).toBe(1);
    });

    it('should not include stats when semantic consensus disabled', () => {
      const disabledConfig = { ...config, enableSemanticConsensus: false };
      const disabledNode = new MediatorNode(disabledConfig);

      const status = disabledNode.getStatus();
      expect(status.verificationStats).toBeUndefined();
    });
  });

  describe('Semantic Equivalence', () => {
    it('should correctly identify equivalent semantic summaries', () => {
      const consensusManager = mediatorNode.getSemanticConsensusManager();

      // Very similar embeddings
      const embedding1 = [0.5, 0.8, 0.3, 0.9, 0.2];
      const embedding2 = [0.52, 0.79, 0.31, 0.88, 0.21];

      const result = consensusManager.checkSemanticEquivalence(
        'Agreement on price of $15000',
        embedding1,
        'Contract for $15000 agreed upon',
        embedding2
      );

      expect(result.areEquivalent).toBe(true);
      expect(result.cosineSimilarity).toBeGreaterThan(0.85);
    });

    it('should correctly identify non-equivalent semantic summaries', () => {
      const consensusManager = mediatorNode.getSemanticConsensusManager();

      // Very different embeddings
      const embedding1 = [1.0, 0.0, 0.0, 0.0, 0.0];
      const embedding2 = [0.0, 0.0, 0.0, 0.0, 1.0];

      const result = consensusManager.checkSemanticEquivalence(
        'Agreement on service delivery',
        embedding1,
        'Disagreement on payment terms',
        embedding2
      );

      expect(result.areEquivalent).toBe(false);
      expect(result.cosineSimilarity).toBeLessThan(0.85);
    });
  });

  describe('Configuration', () => {
    it('should respect HIGH_VALUE_THRESHOLD setting', () => {
      const consensusManager = mediatorNode.getSemanticConsensusManager();

      const settlement = {
        id: 'settlement-threshold',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test',
        proposedTerms: { price: 9999 }, // Just below threshold
        facilitationFee: 99.99,
        facilitationFeePercent: 1.0,
        modelIntegrityHash: 'hash',
        mediatorId: 'test-mediator',
        timestamp: Date.now(),
        status: 'proposed' as const,
        acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
      };

      expect(consensusManager.requiresVerification(settlement)).toBe(false);

      // Just at threshold
      settlement.proposedTerms.price = 10000;
      settlement.facilitationFee = 100;
      expect(consensusManager.requiresVerification(settlement)).toBe(true);
    });
  });
});
