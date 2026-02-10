import { ChallengeManager } from '../../../src/challenge/ChallengeManager';
import { ReputationTracker } from '../../../src/reputation/ReputationTracker';
import {
  MediatorConfig,
  ProposedSettlement,
  ContradictionAnalysis,
} from '../../../src/types';

// Mock ChainClient - factory must not reference external consts (ts-jest hoisting)
jest.mock('../../../src/chain', () => ({
  ChainClient: {
    fromConfig: jest.fn(),
  },
}));

jest.mock('../../../src/reputation/ReputationTracker');

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { ChainClient } from '../../../src/chain';

const mockSubmitChallenge = jest.fn();
const mockGetChallengeStatus = jest.fn();

describe('ChallengeManager', () => {
  let challengeManager: ChallengeManager;
  let mockConfig: MediatorConfig;
  let mockReputationTracker: jest.Mocked<ReputationTracker>;
  let mockSettlement: ProposedSettlement;
  let mockAnalysis: ContradictionAnalysis;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup ChainClient mock
    mockSubmitChallenge.mockResolvedValue({ success: true, challengeId: 'test-challenge' });
    mockGetChallengeStatus.mockResolvedValue(null);
    (ChainClient.fromConfig as jest.Mock).mockReturnValue({
      submitChallenge: mockSubmitChallenge,
      getChallengeStatus: mockGetChallengeStatus,
    });

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
    it('should submit challenge successfully', async () => {
      const result = await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.error).toBeUndefined();

      // Verify ChainClient was called with a Challenge object
      expect(mockSubmitChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          settlementId: mockSettlement.id,
          challengerId: mockConfig.mediatorPublicKey,
          contradictionProof: mockAnalysis.contradictionProof,
          paraphraseEvidence: mockAnalysis.paraphraseEvidence,
          status: 'pending',
        })
      );
    });

    it('should handle chain client returning failure', async () => {
      mockSubmitChallenge.mockResolvedValue({
        success: false,
        error: 'Chain rejected challenge',
      });

      const result = await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Chain rejected challenge');
      expect(result.challengeId).toBeUndefined();
    });

    it('should handle API errors gracefully', async () => {
      mockSubmitChallenge.mockRejectedValue(new Error('Network error'));

      const result = await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.challengeId).toBeUndefined();
    });

    it('should track submitted challenges', async () => {
      await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      const challenges = challengeManager.getSubmittedChallenges();
      expect(challenges.length).toBe(1);
      expect(challenges[0].settlementId).toBe(mockSettlement.id);
      expect(challenges[0].targetMediatorId).toBe(mockSettlement.mediatorId);
      expect(challenges[0].status).toBe('pending');
    });

    it('should not track challenges when submission fails', async () => {
      mockSubmitChallenge.mockResolvedValue({ success: false, error: 'rejected' });

      await challengeManager.submitChallenge(mockSettlement, mockAnalysis);

      const challenges = challengeManager.getSubmittedChallenges();
      expect(challenges.length).toBe(0);
    });
  });

  describe('monitorChallenges', () => {
    beforeEach(async () => {
      // Submit a challenge first
      await challengeManager.submitChallenge(mockSettlement, mockAnalysis);
    });

    it('should update challenge status when upheld', async () => {
      const challenges = challengeManager.getSubmittedChallenges();

      // Force lastChecked to allow immediate monitoring
      (challenges[0] as any).lastChecked = 0;

      mockGetChallengeStatus.mockResolvedValue({ status: 'upheld' });

      await challengeManager.monitorChallenges();

      // Challenge should be removed from active tracking after resolution
      const updatedChallenges = challengeManager.getSubmittedChallenges();
      expect(updatedChallenges.length).toBe(0);
    });

    it('should update reputation when challenge rejected', async () => {
      const challenges = challengeManager.getSubmittedChallenges();

      // Force lastChecked to allow immediate monitoring
      (challenges[0] as any).lastChecked = 0;

      mockGetChallengeStatus.mockResolvedValue({ status: 'rejected' });

      await challengeManager.monitorChallenges();

      expect(mockReputationTracker.recordFailedChallenge).toHaveBeenCalled();

      // Challenge should be removed after resolution
      const updatedChallenges = challengeManager.getSubmittedChallenges();
      expect(updatedChallenges.length).toBe(0);
    });

    it('should handle API errors during monitoring', async () => {
      mockGetChallengeStatus.mockRejectedValue(new Error('Network error'));

      await expect(challengeManager.monitorChallenges()).resolves.not.toThrow();

      // Challenge should still be in tracking
      const challenges = challengeManager.getSubmittedChallenges();
      expect(challenges.length).toBe(1);
    });

    it('should not update reputation when no ReputationTracker provided', async () => {
      const managerWithoutReputation = new ChallengeManager(mockConfig);

      // Submit a challenge
      await managerWithoutReputation.submitChallenge(mockSettlement, mockAnalysis);

      const challenges = managerWithoutReputation.getSubmittedChallenges();
      (challenges[0] as any).lastChecked = 0;

      // Mock rejection
      mockGetChallengeStatus.mockResolvedValue({ status: 'rejected' });

      await expect(managerWithoutReputation.monitorChallenges()).resolves.not.toThrow();
    });
  });

  describe('getChallengesForSettlement', () => {
    it('should return challenges for specific settlement', async () => {
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
