import axios from 'axios';
import { ChallengeManager } from '../../../src/challenge/ChallengeManager';
import { ReputationTracker } from '../../../src/reputation/ReputationTracker';
import {
  MediatorConfig,
  ProposedSettlement,
  ContradictionAnalysis,
  Challenge,
} from '../../../src/types';

jest.mock('axios');
jest.mock('../../../src/reputation/ReputationTracker');

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

describe('ChallengeManager', () => {
  let challengeManager: ChallengeManager;
  let mockConfig: MediatorConfig;
  let mockReputationTracker: jest.Mocked<ReputationTracker>;
  let mockSettlement: ProposedSettlement;
  let mockAnalysis: ContradictionAnalysis;

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup axios mock
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    mockAxiosInstance.get.mockResolvedValue({ data: {} });
    mockAxiosInstance.post.mockResolvedValue({ status: 200, data: {} });

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
      challengeCheckInterval: 60000,
    };

    mockReputationTracker = new ReputationTracker(
      mockConfig
    ) as jest.Mocked<ReputationTracker>;
    challengeManager = new ChallengeManager(mockConfig, mockReputationTracker);

    mockSettlement = {
      id: 'settlement-123',
      intentHashA: 'intent-a-hash',
      intentHashB: 'intent-b-hash',
      reasoningTrace: 'Test reasoning',
      proposedTerms: {
        price: 500,
      },
      facilitationFee: 5,
      facilitationFeePercent: 1.0,
      modelIntegrityHash: 'model-hash',
      mediatorId: 'other-mediator',
      timestamp: Date.now(),
      status: 'proposed',
      acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
      partyAAccepted: false,
      partyBAccepted: false,
      challenges: [],
    };

    mockAnalysis = {
      hasContradiction: true,
      confidence: 0.9,
      violatedConstraints: ['budget constraint'],
      contradictionProof: 'The settlement violates the budget constraint',
      paraphraseEvidence: 'Evidence of violation',
      affectedParty: 'A',
      severity: 'severe',
    };
  });

  describe('submitChallenge', () => {
    it('should submit challenge successfully with 200 status', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {},
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      const result = await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify the API call
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${mockConfig.chainEndpoint}/api/v1/challenges`,
        expect.objectContaining({
          challenge: expect.objectContaining({
            settlementId: mockSettlement.id,
            challengerId: mockConfig.mediatorPublicKey,
            contradictionProof: mockAnalysis.contradictionProof,
            paraphraseEvidence: mockAnalysis.paraphraseEvidence,
          }),
          prose: expect.stringContaining('[CHALLENGE SUBMISSION]'),
          signature: expect.any(String),
        }),
        expect.any(Object)
      );
    });

    it('should submit challenge successfully with 201 status', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 201,
        data: {},
        statusText: 'Created',
        headers: {},
        config: {} as any,
      });

      const result = await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();
    });

    it('should handle non-success status codes', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 400,
        data: {},
        statusText: 'Bad Request',
        headers: {},
        config: {} as any,
      });

      const result = await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 400');
      expect(result.challengeId).toBeUndefined();
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.challengeId).toBeUndefined();
    });

    it('should track submitted challenges', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {},
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      const challenges = challengeManager.getSubmittedChallenges();
      expect(challenges.length).toBe(1);
      expect(challenges[0].settlementId).toBe(mockSettlement.id);
      expect(challenges[0].targetMediatorId).toBe(mockSettlement.mediatorId);
      expect(challenges[0].status).toBe('pending');
    });

    it('should format challenge prose correctly', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {},
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      const callArgs = mockedAxios.post.mock.calls[0][1] as any;
      const prose = callArgs.prose;

      expect(prose).toContain('[CHALLENGE SUBMISSION]');
      expect(prose).toContain(`Settlement ID: ${mockSettlement.id}`);
      expect(prose).toContain('SEVERITY: SEVERE');
      expect(prose).toContain('AFFECTED PARTY: Party A');
      expect(prose).toContain('CONFIDENCE: 90.0%');
      expect(prose).toContain('VIOLATED CONSTRAINTS');
      expect(prose).toContain('budget constraint');
      expect(prose).toContain('CONTRADICTION PROOF');
      expect(prose).toContain('PARAPHRASE EVIDENCE');
    });
  });

  describe('monitorChallenges', () => {
    beforeEach(async () => {
      // Submit a challenge first
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {},
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await challengeManager.submitChallenge(mockSettlement, mockAnalysis);
    });

    it('should update challenge status when upheld', async () => {
      const challenges = challengeManager.getSubmittedChallenges();
      const challengeId = challenges[0].challengeId;

      // Force lastChecked to allow immediate monitoring
      (challenges[0] as any).lastChecked = 0;

      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          status: 'upheld',
        },
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await challengeManager.monitorChallenges();

      // Challenge should be removed from active tracking after resolution
      const updatedChallenges = challengeManager.getSubmittedChallenges();
      expect(updatedChallenges.length).toBe(0);
    });

    it('should update reputation when challenge rejected', async () => {
      const challenges = challengeManager.getSubmittedChallenges();
      const challengeId = challenges[0].challengeId;

      // Force lastChecked to allow immediate monitoring
      (challenges[0] as any).lastChecked = 0;

      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          status: 'rejected',
        },
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await challengeManager.monitorChallenges();

      expect(mockReputationTracker.recordFailedChallenge).toHaveBeenCalled();

      // Challenge should be removed after resolution
      const updatedChallenges = challengeManager.getSubmittedChallenges();
      expect(updatedChallenges.length).toBe(0);
    });

    it('should handle API errors during monitoring', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(challengeManager.monitorChallenges()).resolves.not.toThrow();

      // Challenge should still be in tracking
      const challenges = challengeManager.getSubmittedChallenges();
      expect(challenges.length).toBe(1);
    });

    it('should not update reputation when no ReputationTracker provided', async () => {
      const managerWithoutReputation = new ChallengeManager(mockConfig);

      // Submit a challenge
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {},
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await managerWithoutReputation.submitChallenge(mockSettlement, mockAnalysis);

      // Mock rejection
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: {
          status: 'rejected',
        },
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await expect(managerWithoutReputation.monitorChallenges()).resolves.not.toThrow();
    });
  });

  describe('getChallengesForSettlement', () => {
    it('should return challenges for specific settlement', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {},
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      const challenges = challengeManager.getChallengesForSettlement(mockSettlement.id);
      expect(challenges.length).toBe(1);
      expect(challenges[0].settlementId).toBe(mockSettlement.id);
    });

    it('should return empty array for settlement with no challenges', () => {
      const challenges = challengeManager.getChallengesForSettlement('nonexistent-id');
      expect(challenges.length).toBe(0);
    });
  });

  describe('getChallengeStats', () => {
    it('should return correct statistics', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {},
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      // Submit 3 challenges
      await challengeManager.submitChallenge(mockSettlement, mockAnalysis);
      await challengeManager.submitChallenge(
        { ...mockSettlement, id: 'settlement-2' },
        mockAnalysis
      );
      await challengeManager.submitChallenge(
        { ...mockSettlement, id: 'settlement-3' },
        mockAnalysis
      );

      const stats = challengeManager.getChallengeStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(3);
      expect(stats.upheld).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('should calculate success rate correctly', async () => {
      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: {},
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });

      // Submit 2 challenges
      await challengeManager.submitChallenge(mockSettlement, mockAnalysis);
      await challengeManager.submitChallenge(
        { ...mockSettlement, id: 'settlement-2' },
        mockAnalysis
      );

      const challenges = challengeManager.getSubmittedChallenges();

      // Manually update statuses for testing
      (challenges[0] as any).status = 'upheld';
      (challenges[1] as any).status = 'rejected';

      const stats = challengeManager.getChallengeStats();

      expect(stats.total).toBe(2);
      expect(stats.upheld).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.successRate).toBe(50); // 1/2 = 50%
    });

    it('should handle empty challenge list', () => {
      const stats = challengeManager.getChallengeStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.upheld).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.successRate).toBe(0);
    });
  });
});
