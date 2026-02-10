import axios from 'axios';
import { MediatorNode } from '../../src/MediatorNode';
import { ConfigLoader } from '../../src/config/ConfigLoader';
import { MediatorConfig } from '../../src/types';
import * as fs from 'fs';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

// Create mock axios instance that will be returned by axios.create
const mockAxiosInstance = {
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

// Mock hnswlib-node (needed for VectorDatabase)
jest.mock('hnswlib-node');

// Mock logger to suppress output
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Challenge Lifecycle Integration', () => {
  let mediatorNode: MediatorNode;
  let config: MediatorConfig;
  let testDbPath: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Wire up axios.create() to return the mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    mockAxiosInstance.get.mockResolvedValue({ data: {} });
    mockAxiosInstance.post.mockResolvedValue({ status: 200, data: {} });

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
    process.env.VECTOR_DB_PATH = './test-challenge-vector-db';
    process.env.ENABLE_CHALLENGE_SUBMISSION = 'true';
    process.env.MIN_CONFIDENCE_TO_CHALLENGE = '0.8';
    process.env.CHALLENGE_CHECK_INTERVAL = '60000';
    process.env.LOG_LEVEL = 'error';

    testDbPath = process.env.VECTOR_DB_PATH!;

    config = ConfigLoader.load();
    mediatorNode = new MediatorNode(config);
  });

  afterEach(async () => {
    try {
      if (mediatorNode) {
        await mediatorNode.stop();
      }
    } catch {
      // Node may not have been created successfully
    }

    // Cleanup test database
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }

    jest.clearAllMocks();
  });

  describe('Challenge Detection and Submission', () => {
    it('should provide access to challenge detector and manager', () => {
      const challengeDetector = mediatorNode.getChallengeDetector();
      const challengeManager = mediatorNode.getChallengeManager();

      expect(challengeDetector).toBeDefined();
      expect(challengeManager).toBeDefined();
    });

    it('should analyze settlement for contradictions', async () => {
      const challengeDetector = mediatorNode.getChallengeDetector();

      const settlement = {
        id: 'settlement-test',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test reasoning',
        proposedTerms: {
          price: 1000,
        },
        facilitationFee: 10,
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

      const intentA = {
        hash: 'intent-a',
        author: 'alice',
        prose: 'I need a service. Budget is $500 maximum.',
        desires: ['service'],
        constraints: ['budget $500 maximum'],
        timestamp: Date.now(),
        status: 'pending' as const,
      };

      const intentB = {
        hash: 'intent-b',
        author: 'bob',
        prose: 'I offer services.',
        desires: ['offer services'],
        constraints: [],
        timestamp: Date.now(),
        status: 'pending' as const,
      };

      // Mock LLM response
      const mockAnalysis = {
        hasContradiction: true,
        confidence: 0.95,
        violatedConstraints: ['budget $500 maximum'],
        contradictionProof: 'Settlement price exceeds budget',
        paraphraseEvidence: 'Evidence of violation',
        affectedParty: 'A',
        severity: 'severe',
      };

      // Mock Anthropic API
      const mockAnthropicCreate = jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockAnalysis),
          },
        ],
      });

      // Access the private anthropic property via type assertion
      (challengeDetector as any).llmProvider.anthropic = {
        messages: {
          create: mockAnthropicCreate,
        },
      };

      const analysis = await challengeDetector.analyzeSettlement(
        settlement,
        intentA,
        intentB
      );

      expect(analysis).not.toBeNull();
      expect(analysis?.hasContradiction).toBe(true);
      expect(analysis?.confidence).toBe(0.95);
      expect(challengeDetector.shouldChallenge(analysis!)).toBe(true);
    });

    it('should submit challenge and track it', async () => {
      const challengeManager = mediatorNode.getChallengeManager();

      const settlement = {
        id: 'settlement-test',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test reasoning',
        proposedTerms: {
          price: 1000,
        },
        facilitationFee: 10,
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

      const analysis = {
        hasContradiction: true,
        confidence: 0.9,
        violatedConstraints: ['budget constraint'],
        contradictionProof: 'Settlement violates budget',
        paraphraseEvidence: 'Evidence',
        affectedParty: 'A' as const,
        severity: 'severe' as const,
      };

      // Mock successful submission via ChainClient → axios instance
      mockAxiosInstance.post.mockResolvedValue({
        status: 201,
        data: { hash: 'entry-hash-123', entry_id: 'entry-123' },
      });

      const result = await challengeManager.submitChallenge(settlement, analysis);

      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();

      const submittedChallenges = challengeManager.getSubmittedChallenges();
      expect(submittedChallenges.length).toBe(1);
      expect(submittedChallenges[0].status).toBe('pending');
    });

    it('should update challenge status via monitoring', async () => {
      const challengeManager = mediatorNode.getChallengeManager();

      const settlement = {
        id: 'settlement-test',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test reasoning',
        proposedTerms: {
          price: 1000,
        },
        facilitationFee: 10,
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

      const analysis = {
        hasContradiction: true,
        confidence: 0.9,
        violatedConstraints: ['test'],
        contradictionProof: 'test',
        paraphraseEvidence: 'test',
        affectedParty: 'A' as const,
        severity: 'moderate' as const,
      };

      // Mock submission
      mockAxiosInstance.post.mockResolvedValue({
        status: 201,
        data: { hash: 'entry-hash', entry_id: 'entry-1' },
      });

      await challengeManager.submitChallenge(settlement, analysis);

      const challenges = challengeManager.getSubmittedChallenges();
      expect(challenges.length).toBe(1);

      // Force update lastChecked to allow immediate monitoring
      const challengeId = challenges[0].challengeId;
      (challenges[0] as any).lastChecked = 0;

      // Mock status check - getChallengeStatus uses POST /search/semantic
      // Must include challenge_id for ChainClient to match the entry
      mockAxiosInstance.post.mockResolvedValue({
        status: 200,
        data: {
          results: [{ metadata: { challenge_id: challengeId, status: 'upheld' } }],
        },
      });

      await challengeManager.monitorChallenges();

      // Challenge should be removed after resolution
      const updatedChallenges = challengeManager.getSubmittedChallenges();
      expect(updatedChallenges.length).toBe(0);
    });

    it('should include challenge stats in node status', async () => {
      const challengeManager = mediatorNode.getChallengeManager();

      const settlement = {
        id: 'settlement-test',
        intentHashA: 'intent-a',
        intentHashB: 'intent-b',
        reasoningTrace: 'Test reasoning',
        proposedTerms: {},
        facilitationFee: 10,
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

      const analysis = {
        hasContradiction: true,
        confidence: 0.9,
        violatedConstraints: ['test'],
        contradictionProof: 'test',
        paraphraseEvidence: 'test',
        affectedParty: 'A' as const,
        severity: 'moderate' as const,
      };

      mockAxiosInstance.post.mockResolvedValue({
        status: 201,
        data: { hash: 'entry-hash', entry_id: 'entry-1' },
      });

      await challengeManager.submitChallenge(settlement, analysis);

      const status = mediatorNode.getStatus();

      expect(status.challengeStats).toBeDefined();
      expect(status.challengeStats?.total).toBe(1);
      expect(status.challengeStats?.pending).toBe(1);
    });
  });

  describe('Challenge Configuration', () => {
    it('should respect minConfidenceToChallenge setting', () => {
      const challengeDetector = mediatorNode.getChallengeDetector();

      const lowConfidenceAnalysis = {
        hasContradiction: true,
        confidence: 0.7, // Below 0.8 threshold
        violatedConstraints: ['test'],
        contradictionProof: 'test',
        paraphraseEvidence: 'test',
        affectedParty: 'A' as const,
        severity: 'moderate' as const,
      };

      expect(challengeDetector.shouldChallenge(lowConfidenceAnalysis)).toBe(false);

      const highConfidenceAnalysis = {
        ...lowConfidenceAnalysis,
        confidence: 0.9, // Above threshold
      };

      expect(challengeDetector.shouldChallenge(highConfidenceAnalysis)).toBe(true);
    });

    it('should not include challenge stats when disabled', () => {
      // Create node with challenges disabled
      const disabledConfig = {
        ...config,
        enableChallengeSubmission: false,
      };

      const disabledNode = new MediatorNode(disabledConfig);
      const status = disabledNode.getStatus();

      expect(status.challengeStats).toBeUndefined();
    });
  });
});
