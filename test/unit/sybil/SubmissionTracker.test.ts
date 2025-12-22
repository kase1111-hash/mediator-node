import { SubmissionTracker } from '../../../src/sybil/SubmissionTracker';
import { MediatorConfig } from '../../../src/types';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('axios');
jest.mock('fs');

describe('SubmissionTracker', () => {
  let tracker: SubmissionTracker;
  let mockConfig: MediatorConfig;
  const testDataPath = path.join(process.cwd(), 'data', 'sybil-resistance');

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock file system
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    (fs.readFileSync as jest.Mock).mockReturnValue('{}');

    mockConfig = {
      chainEndpoint: 'http://localhost:8080',
      chainId: 'test-chain',
      consensusMode: 'permissionless',
      llmProvider: 'anthropic',
      llmApiKey: 'test-key',
      llmModel: 'claude-3-5-sonnet-20241022',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 1.0,
      vectorDbPath: './vector-db',
      vectorDimensions: 1536,
      maxIntentsCache: 10000,
      acceptanceWindowHours: 72,
      logLevel: 'info',
      enableSybilResistance: true,
      dailyFreeLimit: 3,
      excessDepositAmount: 100,
      depositRefundDays: 30,
    };

    tracker = new SubmissionTracker(mockConfig);
  });

  describe('checkSubmissionLimit', () => {
    it('should allow first submission as free', () => {
      const result = tracker.checkSubmissionLimit('author1');

      expect(result.allowed).toBe(true);
      expect(result.isFree).toBe(true);
      expect(result.requiresDeposit).toBe(false);
      expect(result.freeSubmissionsRemaining).toBe(2);
      expect(result.dailyCount).toBe(0);
    });

    it('should allow submissions within free limit', async () => {
      // Record first submission
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });
      await tracker.recordSubmission('author1', 'intent-hash-1');

      // Check second submission
      const result = tracker.checkSubmissionLimit('author1');

      expect(result.allowed).toBe(true);
      expect(result.isFree).toBe(true);
      expect(result.requiresDeposit).toBe(false);
      expect(result.freeSubmissionsRemaining).toBe(1);
      expect(result.dailyCount).toBe(1);
    });

    it('should require deposit for 4th submission', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Record 3 free submissions
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');

      // Check 4th submission
      const result = tracker.checkSubmissionLimit('author1');

      expect(result.allowed).toBe(true);
      expect(result.isFree).toBe(false);
      expect(result.requiresDeposit).toBe(true);
      expect(result.depositAmount).toBe(100);
      expect(result.freeSubmissionsRemaining).toBe(0);
      expect(result.dailyCount).toBe(3);
    });

    it('should return unlimited for disabled Sybil Resistance', () => {
      const config = { ...mockConfig, enableSybilResistance: false };
      const disabledTracker = new SubmissionTracker(config);

      const result = disabledTracker.checkSubmissionLimit('author1');

      expect(result.allowed).toBe(true);
      expect(result.isFree).toBe(true);
      expect(result.requiresDeposit).toBe(false);
      expect(result.freeSubmissionsRemaining).toBe(Infinity);
      expect(result.dailyCount).toBe(0);
    });
  });

  describe('recordSubmission', () => {
    it('should record free submission successfully', async () => {
      const result = await tracker.recordSubmission('author1', 'intent-hash-1');

      expect(result.success).toBe(true);
      expect(result.depositId).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should collect deposit for 4th submission', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Record 3 free submissions
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');

      // 4th submission should collect deposit
      const result = await tracker.recordSubmission('author1', 'intent-hash-4');

      expect(result.success).toBe(true);
      expect(result.depositId).toBeDefined();
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/deposits'),
        expect.objectContaining({
          entry: expect.objectContaining({
            type: 'deposit',
            author: 'author1',
            intentHash: 'intent-hash-4',
            amount: 100,
            purpose: 'sybil_resistance',
          }),
        })
      );
    });

    it('should handle deposit collection failure', async () => {
      // First 3 submissions are free (no axios.post calls)
      // 4th submission will try to collect deposit and fail
      (axios.post as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Record 3 free submissions
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');

      // Verify no axios calls yet (free submissions)
      expect(axios.post).not.toHaveBeenCalled();

      // 4th submission should fail due to deposit error
      const result = await tracker.recordSubmission('author1', 'intent-hash-4');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Deposit collection failed');
    });

    it('should track multiple authors separately', async () => {
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author2', 'intent-hash-2');

      const stats1 = tracker.getAuthorStats('author1');
      const stats2 = tracker.getAuthorStats('author2');

      expect(stats1.today.count).toBe(1);
      expect(stats2.today.count).toBe(1);
      expect(stats1.today.freeRemaining).toBe(2);
      expect(stats2.today.freeRemaining).toBe(2);
    });
  });

  describe('processRefunds', () => {
    it('should refund deposits past deadline', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Record submission with deposit
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      const depositResult = await tracker.recordSubmission('author1', 'intent-hash-4');

      expect(depositResult.depositId).toBeDefined();

      // Get deposit and manually set old deadline
      const deposit = tracker.getDepositByIntent('intent-hash-4');
      expect(deposit).toBeDefined();
      if (deposit) {
        deposit.refundDeadline = Date.now() - 1000; // Past deadline
      }

      // Process refunds
      await tracker.processRefunds();

      // Verify refund was submitted
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/refunds'),
        expect.objectContaining({
          entry: expect.objectContaining({
            type: 'refund',
            depositId: depositResult.depositId,
          }),
        })
      );
    });

    it('should not refund deposits before deadline', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Record submission with deposit
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      await tracker.recordSubmission('author1', 'intent-hash-4');

      // Clear mock calls
      (axios.post as jest.Mock).mockClear();

      // Process refunds (deposit deadline is 30 days in future)
      await tracker.processRefunds();

      // No refunds should be submitted
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should skip already refunded deposits', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Record submission with deposit
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      const depositResult = await tracker.recordSubmission('author1', 'intent-hash-4');

      // Set past deadline and process refund
      const deposit = tracker.getDepositByIntent('intent-hash-4');
      if (deposit) {
        deposit.refundDeadline = Date.now() - 1000;
      }
      await tracker.processRefunds();

      // Clear mock
      (axios.post as jest.Mock).mockClear();

      // Process refunds again
      await tracker.processRefunds();

      // No additional refunds should be submitted
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('forfeitDeposit', () => {
    it('should forfeit active deposit with spam proof', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Record submission with deposit
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      const depositResult = await tracker.recordSubmission('author1', 'intent-hash-4');

      expect(depositResult.depositId).toBeDefined();

      // Clear previous calls
      (axios.post as jest.Mock).mockClear();

      // Forfeit deposit
      const success = await tracker.forfeitDeposit(depositResult.depositId!, 'spam-proof-123');

      expect(success).toBe(true);
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/forfeitures'),
        expect.objectContaining({
          entry: expect.objectContaining({
            type: 'forfeiture',
            depositId: depositResult.depositId,
            spamProofId: 'spam-proof-123',
          }),
        })
      );

      // Verify deposit status updated
      const deposit = tracker.getDepositByIntent('intent-hash-4');
      expect(deposit?.status).toBe('forfeited');
      expect(deposit?.spamProofId).toBe('spam-proof-123');
    });

    it('should not forfeit non-existent deposit', async () => {
      const success = await tracker.forfeitDeposit('non-existent-id', 'spam-proof-123');

      expect(success).toBe(false);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should not forfeit already forfeited deposit', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Record submission with deposit and forfeit it
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      const depositResult = await tracker.recordSubmission('author1', 'intent-hash-4');
      await tracker.forfeitDeposit(depositResult.depositId!, 'spam-proof-123');

      // Clear mock
      (axios.post as jest.Mock).mockClear();

      // Try to forfeit again
      const success = await tracker.forfeitDeposit(depositResult.depositId!, 'spam-proof-456');

      expect(success).toBe(false);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });

  describe('getAuthorStats', () => {
    it('should return correct stats for author with submissions', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');

      const stats = tracker.getAuthorStats('author1');

      expect(stats.today.count).toBe(2);
      expect(stats.today.freeRemaining).toBe(1);
      expect(stats.today.depositsCount).toBe(0);
      expect(stats.totalDeposits.active).toBe(0);
    });

    it('should return default stats for new author', () => {
      const stats = tracker.getAuthorStats('new-author');

      expect(stats.today.count).toBe(0);
      expect(stats.today.freeRemaining).toBe(3);
      expect(stats.today.depositsCount).toBe(0);
    });

    it('should include deposit stats', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Record submissions with deposit
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      await tracker.recordSubmission('author1', 'intent-hash-4');

      const stats = tracker.getAuthorStats('author1');

      expect(stats.today.depositsCount).toBe(1);
      expect(stats.totalDeposits.active).toBe(1);
      expect(stats.totalDeposits.refunded).toBe(0);
      expect(stats.totalDeposits.forfeited).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return overall statistics', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Author 1: 4 submissions (1 deposit)
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      await tracker.recordSubmission('author1', 'intent-hash-4');

      // Author 2: 2 submissions (no deposit)
      await tracker.recordSubmission('author2', 'intent-hash-5');
      await tracker.recordSubmission('author2', 'intent-hash-6');

      const stats = tracker.getStats();

      expect(stats.totalSubmissionsToday).toBe(6);
      expect(stats.totalDeposits).toBe(1);
      expect(stats.activeDeposits).toBe(1);
      expect(stats.totalDepositValue).toBe(100);
    });

    it('should track deposit status changes', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Create deposit
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      const depositResult = await tracker.recordSubmission('author1', 'intent-hash-4');

      // Forfeit it
      await tracker.forfeitDeposit(depositResult.depositId!, 'spam-proof-123');

      const stats = tracker.getStats();

      expect(stats.activeDeposits).toBe(0);
      expect(stats.forfeitedDeposits).toBe(1);
      expect(stats.totalDepositValue).toBe(0);
    });
  });

  describe('getDepositByIntent', () => {
    it('should find deposit by intent hash', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      const depositResult = await tracker.recordSubmission('author1', 'intent-hash-4');

      const deposit = tracker.getDepositByIntent('intent-hash-4');

      expect(deposit).toBeDefined();
      expect(deposit?.depositId).toBe(depositResult.depositId);
      expect(deposit?.intentHash).toBe('intent-hash-4');
      expect(deposit?.amount).toBe(100);
    });

    it('should return undefined for non-deposit intent', async () => {
      await tracker.recordSubmission('author1', 'intent-hash-1');

      const deposit = tracker.getDepositByIntent('intent-hash-1');

      expect(deposit).toBeUndefined();
    });
  });

  describe('getAuthorDeposits', () => {
    it('should return all deposits for author', async () => {
      (axios.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      // Author 1: 2 deposits
      await tracker.recordSubmission('author1', 'intent-hash-1');
      await tracker.recordSubmission('author1', 'intent-hash-2');
      await tracker.recordSubmission('author1', 'intent-hash-3');
      await tracker.recordSubmission('author1', 'intent-hash-4');
      await tracker.recordSubmission('author1', 'intent-hash-5');

      // Author 2: 1 deposit
      await tracker.recordSubmission('author2', 'intent-hash-6');
      await tracker.recordSubmission('author2', 'intent-hash-7');
      await tracker.recordSubmission('author2', 'intent-hash-8');
      await tracker.recordSubmission('author2', 'intent-hash-9');

      const author1Deposits = tracker.getAuthorDeposits('author1');
      const author2Deposits = tracker.getAuthorDeposits('author2');

      expect(author1Deposits.length).toBe(2);
      expect(author2Deposits.length).toBe(1);
    });
  });
});
