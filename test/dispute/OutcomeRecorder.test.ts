import {
  OutcomeRecorder,
  AuthorityDecision,
  SettlementDetails,
  OutcomeRecordingOptions,
} from '../../src/dispute/OutcomeRecorder';
import { MediatorConfig } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OutcomeRecorder', () => {
  let outcomeRecorder: OutcomeRecorder;
  let config: MediatorConfig;
  const testDataPath = './test-data/outcomes';

  beforeEach(() => {
    // Clean up test data directory
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }

    config = {
      chainEndpoint: 'http://localhost:3000',
      chainId: 'test-chain',
      consensusMode: 'permissionless',
      llmProvider: 'openai',
      llmApiKey: 'test-key',
      llmModel: 'gpt-4',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 0.01,
      vectorDbPath: './test-vector-db',
      vectorDimensions: 384,
      maxIntentsCache: 1000,
      acceptanceWindowHours: 24,
      logLevel: 'error',
    } as MediatorConfig;

    outcomeRecorder = new OutcomeRecorder(config, testDataPath);

    // Mock axios responses
    mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
  });

  afterEach(() => {
    // Clean up test data
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }

    jest.clearAllMocks();
  });

  describe('Authority Decision Recording', () => {
    it('should record authority decision successfully', async () => {
      const authorityDecision: AuthorityDecision = {
        authorityId: 'auth-123',
        authorityName: 'Test Arbitrator',
        ruling: 'The claimant\'s request is granted',
        reasoningDocument: 'https://example.com/ruling.pdf',
        appealable: true,
        appealDeadline: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      };

      const result = await outcomeRecorder.recordAuthorityDecision({
        disputeId: 'dispute-1',
        authorityDecision,
        outcome: 'claimant_favored',
        outcomeDescription: 'Claimant wins the dispute',
      });

      expect(result.success).toBe(true);
      expect(result.resolutionId).toBeDefined();

      const resolution = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(resolution).toBeDefined();
      expect(resolution?.disputeId).toBe('dispute-1');
      expect(resolution?.outcome).toBe('claimant_favored');
      expect(resolution?.isImmutable).toBe(true);
      expect(resolution?.outcomeDescription).toContain('AUTHORITY DECISION');
      expect(resolution?.outcomeDescription).toContain('Test Arbitrator');
    });

    it('should prevent duplicate resolutions for same dispute', async () => {
      const authorityDecision: AuthorityDecision = {
        authorityId: 'auth-123',
        authorityName: 'Test Arbitrator',
        ruling: 'First ruling',
        appealable: false,
      };

      await outcomeRecorder.recordAuthorityDecision({
        disputeId: 'dispute-2',
        authorityDecision,
        outcome: 'claimant_favored',
        outcomeDescription: 'First decision',
      });

      const result = await outcomeRecorder.recordAuthorityDecision({
        disputeId: 'dispute-2',
        authorityDecision,
        outcome: 'respondent_favored',
        outcomeDescription: 'Second decision',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already has an immutable resolution');
    });

    it('should include external references in resolution', async () => {
      const authorityDecision: AuthorityDecision = {
        authorityId: 'auth-123',
        authorityName: 'Test Arbitrator',
        ruling: 'Ruling',
        appealable: false,
      };

      const options: OutcomeRecordingOptions = {
        externalReferences: ['https://example.com/doc1.pdf', 'https://example.com/doc2.pdf'],
      };

      const result = await outcomeRecorder.recordAuthorityDecision({
        disputeId: 'dispute-3',
        authorityDecision,
        outcome: 'other',
        outcomeDescription: 'Test outcome',
        options,
      });

      const resolution = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(resolution?.externalReferences).toHaveLength(2);
    });

    it('should publish to chain by default', async () => {
      const authorityDecision: AuthorityDecision = {
        authorityId: 'auth-123',
        authorityName: 'Test Arbitrator',
        ruling: 'Ruling',
        appealable: false,
      };

      await outcomeRecorder.recordAuthorityDecision({
        disputeId: 'dispute-4',
        authorityDecision,
        outcome: 'claimant_favored',
        outcomeDescription: 'Test',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/outcomes',
        expect.objectContaining({
          type: 'dispute_resolution',
        })
      );
    });

    it('should skip chain publishing when requested', async () => {
      const authorityDecision: AuthorityDecision = {
        authorityId: 'auth-123',
        authorityName: 'Test Arbitrator',
        ruling: 'Ruling',
        appealable: false,
      };

      await outcomeRecorder.recordAuthorityDecision({
        disputeId: 'dispute-5',
        authorityDecision,
        outcome: 'claimant_favored',
        outcomeDescription: 'Test',
        options: { publishToChain: false },
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('Settlement Recording', () => {
    it('should record settlement successfully', async () => {
      const settlement: SettlementDetails = {
        terms: [
          'Respondent pays $1000 to claimant',
          'Both parties waive future claims',
        ],
        agreedBy: ['party-1', 'party-2'],
        mediatorId: 'mediator-123',
        enforcementMechanism: 'Smart contract escrow',
      };

      const result = await outcomeRecorder.recordSettlement({
        disputeId: 'dispute-6',
        settlement,
      });

      expect(result.success).toBe(true);
      expect(result.resolutionId).toBeDefined();

      const resolution = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(resolution).toBeDefined();
      expect(resolution?.disputeId).toBe('dispute-6');
      expect(resolution?.outcome).toBe('compromise');
      expect(resolution?.isImmutable).toBe(true);
      expect(resolution?.outcomeDescription).toContain('SETTLEMENT AGREEMENT');
      expect(resolution?.outcomeDescription).toContain('$1000');
    });

    it('should fail settlement with insufficient parties', async () => {
      const settlement: SettlementDetails = {
        terms: ['Some terms'],
        agreedBy: ['party-1'], // Only one party
      };

      const result = await outcomeRecorder.recordSettlement({
        disputeId: 'dispute-7',
        settlement,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least two parties');
    });

    it('should record settlement without mediator', async () => {
      const settlement: SettlementDetails = {
        terms: ['Direct settlement terms'],
        agreedBy: ['party-1', 'party-2'],
      };

      const result = await outcomeRecorder.recordSettlement({
        disputeId: 'dispute-8',
        settlement,
      });

      expect(result.success).toBe(true);

      const resolution = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(resolution?.resolvedBy).toContain('direct agreement');
    });

    it('should include reputation impact if provided', async () => {
      const settlement: SettlementDetails = {
        terms: ['Settlement terms'],
        agreedBy: ['party-1', 'party-2'],
      };

      const options: OutcomeRecordingOptions = {
        reputationImpact: {
          claimant: 5,
          respondent: 5,
        },
      };

      const result = await outcomeRecorder.recordSettlement({
        disputeId: 'dispute-9',
        settlement,
        options,
      });

      const resolution = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(resolution?.reputationImpact).toBeDefined();
      expect(resolution?.reputationImpact?.claimant).toBe(5);
      expect(resolution?.reputationImpact?.respondent).toBe(5);
    });
  });

  describe('Dismissal Recording', () => {
    it('should record dismissal successfully', async () => {
      const result = await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-10',
        dismissedBy: 'mediator-456',
        reason: 'Lack of evidence',
      });

      expect(result.success).toBe(true);
      expect(result.resolutionId).toBeDefined();

      const resolution = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(resolution).toBeDefined();
      expect(resolution?.disputeId).toBe('dispute-10');
      expect(resolution?.outcome).toBe('dismissed');
      expect(resolution?.isImmutable).toBe(true);
      expect(resolution?.outcomeDescription).toContain('Lack of evidence');
    });

    it('should prevent dismissal of already resolved dispute', async () => {
      await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-11',
        dismissedBy: 'mediator-1',
        reason: 'First dismissal',
      });

      const result = await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-11',
        dismissedBy: 'mediator-2',
        reason: 'Second dismissal',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already has an immutable resolution');
    });

    it('should include annotations if provided', async () => {
      const options: OutcomeRecordingOptions = {
        annotations: ['Note 1', 'Note 2'],
      };

      const result = await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-12',
        dismissedBy: 'mediator-789',
        reason: 'Test reason',
        options,
      });

      const resolution = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(resolution?.annotations).toHaveLength(2);
      expect(resolution?.annotations).toContain('Note 1');
    });
  });

  describe('Withdrawal Recording', () => {
    it('should record withdrawal successfully', async () => {
      const result = await outcomeRecorder.recordWithdrawal({
        disputeId: 'dispute-13',
        withdrawnBy: 'party-1',
        reason: 'Resolved outside system',
      });

      expect(result.success).toBe(true);
      expect(result.resolutionId).toBeDefined();

      const resolution = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(resolution).toBeDefined();
      expect(resolution?.disputeId).toBe('dispute-13');
      expect(resolution?.outcome).toBe('dismissed');
      expect(resolution?.isImmutable).toBe(true);
      expect(resolution?.outcomeDescription).toContain('withdrawn by party-1');
      expect(resolution?.outcomeDescription).toContain('Resolved outside system');
    });

    it('should record withdrawal without reason', async () => {
      const result = await outcomeRecorder.recordWithdrawal({
        disputeId: 'dispute-14',
        withdrawnBy: 'party-2',
      });

      expect(result.success).toBe(true);

      const resolution = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(resolution?.outcomeDescription).toContain('withdrawn by party-2');
      expect(resolution?.outcomeDescription).not.toContain('Reason:');
    });
  });

  describe('Outcome Retrieval', () => {
    it('should get outcome by resolution ID', async () => {
      const result = await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-15',
        dismissedBy: 'mediator-1',
        reason: 'Test',
      });

      const outcome = outcomeRecorder.getOutcome(result.resolutionId!);
      expect(outcome).toBeDefined();
      expect(outcome?.resolutionId).toBe(result.resolutionId);
    });

    it('should get outcome for dispute', async () => {
      await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-16',
        dismissedBy: 'mediator-1',
        reason: 'Test',
      });

      const outcome = outcomeRecorder.getOutcomeForDispute('dispute-16');
      expect(outcome).toBeDefined();
      expect(outcome?.disputeId).toBe('dispute-16');
    });

    it('should return undefined for non-existent outcome', () => {
      const outcome = outcomeRecorder.getOutcome('non-existent-id');
      expect(outcome).toBeUndefined();
    });

    it('should get all outcomes', async () => {
      await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-17',
        dismissedBy: 'mediator-1',
        reason: 'Test 1',
      });

      await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-18',
        dismissedBy: 'mediator-1',
        reason: 'Test 2',
      });

      const outcomes = outcomeRecorder.getAllOutcomes();
      expect(outcomes).toHaveLength(2);
    });

    it('should get outcomes by type', async () => {
      const authorityDecision: AuthorityDecision = {
        authorityId: 'auth-1',
        authorityName: 'Arbitrator',
        ruling: 'Ruling',
        appealable: false,
      };

      await outcomeRecorder.recordAuthorityDecision({
        disputeId: 'dispute-19',
        authorityDecision,
        outcome: 'claimant_favored',
        outcomeDescription: 'Test',
      });

      await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-20',
        dismissedBy: 'mediator-1',
        reason: 'Test',
      });

      const claimantFavoredOutcomes = outcomeRecorder.getOutcomesByType('claimant_favored');
      expect(claimantFavoredOutcomes).toHaveLength(1);

      const dismissedOutcomes = outcomeRecorder.getOutcomesByType('dismissed');
      expect(dismissedOutcomes).toHaveLength(1);
    });
  });

  describe('Immutability Verification', () => {
    it('should verify outcome is immutable', async () => {
      const result = await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-21',
        dismissedBy: 'mediator-1',
        reason: 'Test',
      });

      const verification = outcomeRecorder.verifyImmutability(result.resolutionId!);
      expect(verification.isImmutable).toBe(true);
      expect(verification.canModify).toBe(false);
      expect(verification.reason).toContain('immutable');
    });

    it('should handle non-existent outcome', () => {
      const verification = outcomeRecorder.verifyImmutability('non-existent-id');
      expect(verification.isImmutable).toBe(false);
      expect(verification.canModify).toBe(false);
      expect(verification.reason).toContain('not found');
    });
  });

  describe('Statistics', () => {
    it('should return accurate statistics', async () => {
      const authorityDecision: AuthorityDecision = {
        authorityId: 'auth-1',
        authorityName: 'Arbitrator',
        ruling: 'Ruling',
        appealable: false,
      };

      await outcomeRecorder.recordAuthorityDecision({
        disputeId: 'dispute-22',
        authorityDecision,
        outcome: 'claimant_favored',
        outcomeDescription: 'Test',
      });

      await outcomeRecorder.recordAuthorityDecision({
        disputeId: 'dispute-23',
        authorityDecision,
        outcome: 'respondent_favored',
        outcomeDescription: 'Test',
      });

      const settlement: SettlementDetails = {
        terms: ['Terms'],
        agreedBy: ['party-1', 'party-2'],
      };

      await outcomeRecorder.recordSettlement({
        disputeId: 'dispute-24',
        settlement,
      });

      await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-25',
        dismissedBy: 'mediator-1',
        reason: 'Test',
      });

      const stats = outcomeRecorder.getStats();

      expect(stats.totalOutcomes).toBe(4);
      expect(stats.outcomesByType.claimant_favored).toBe(1);
      expect(stats.outcomesByType.respondent_favored).toBe(1);
      expect(stats.outcomesByType.compromise).toBe(1);
      expect(stats.outcomesByType.dismissed).toBe(1);
      expect(stats.immutableOutcomes).toBe(4);
    });
  });

  describe('Persistence and Loading', () => {
    it('should persist outcomes to disk', async () => {
      const result = await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-26',
        dismissedBy: 'mediator-1',
        reason: 'Test',
      });

      const filePath = path.join(testDataPath, `${result.resolutionId}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      const savedOutcome = JSON.parse(content);
      expect(savedOutcome.resolutionId).toBe(result.resolutionId);
    });

    it('should load existing outcomes on initialization', async () => {
      await outcomeRecorder.recordDismissal({
        disputeId: 'dispute-27',
        dismissedBy: 'mediator-1',
        reason: 'Test',
      });

      // Create new instance with same data path
      const newRecorder = new OutcomeRecorder(config, testDataPath);

      const outcomes = newRecorder.getAllOutcomes();
      expect(outcomes.length).toBeGreaterThan(0);
      expect(outcomes.some((o) => o.disputeId === 'dispute-27')).toBe(true);
    });
  });
});
