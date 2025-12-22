import { nanoid } from 'nanoid';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
  MediatorConfig,
  DailySubmissionRecord,
  DepositRecord,
  SubmissionLimitResult,
  SpamProof,
} from '../types';
import { logger } from '../utils/logger';
import { generateSignature } from '../utils/crypto';

/**
 * SubmissionTracker manages daily submission limits and deposit tracking
 * for Sybil Resistance (MP-01 Section 8)
 */
export class SubmissionTracker {
  private config: MediatorConfig;
  private submissionRecords: Map<string, DailySubmissionRecord> = new Map(); // key: author:date
  private depositRecords: Map<string, DepositRecord> = new Map(); // key: depositId
  private spamProofs: Map<string, SpamProof> = new Map(); // key: proofId
  private dataPath: string;

  constructor(config: MediatorConfig) {
    this.config = config;
    this.dataPath = path.join(process.cwd(), 'data', 'sybil-resistance');

    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load existing data
    this.loadSubmissionData();
    this.loadDepositData();
  }

  /**
   * Check if an author can submit an intent and what requirements apply
   */
  public checkSubmissionLimit(author: string): SubmissionLimitResult {
    if (!this.config.enableSybilResistance) {
      return {
        allowed: true,
        isFree: true,
        requiresDeposit: false,
        freeSubmissionsRemaining: Infinity,
        dailyCount: 0,
      };
    }

    const today = this.getTodayString();
    const recordKey = `${author}:${today}`;
    const record = this.submissionRecords.get(recordKey);
    const dailyFreeLimit = this.config.dailyFreeLimit || 3;

    if (!record) {
      // First submission of the day
      return {
        allowed: true,
        isFree: true,
        requiresDeposit: false,
        freeSubmissionsRemaining: dailyFreeLimit - 1,
        dailyCount: 0,
      };
    }

    const currentCount = record.submissionCount;

    if (currentCount < dailyFreeLimit) {
      // Still within free limit
      return {
        allowed: true,
        isFree: true,
        requiresDeposit: false,
        freeSubmissionsRemaining: dailyFreeLimit - currentCount - 1,
        dailyCount: currentCount,
      };
    }

    // Exceeded free limit, requires deposit
    const depositAmount = this.config.excessDepositAmount || 100;

    return {
      allowed: true,
      isFree: false,
      requiresDeposit: true,
      depositAmount,
      freeSubmissionsRemaining: 0,
      dailyCount: currentCount,
    };
  }

  /**
   * Record a submission and collect deposit if required
   */
  public async recordSubmission(
    author: string,
    intentHash: string
  ): Promise<{ success: boolean; depositId?: string; error?: string }> {
    const limitCheck = this.checkSubmissionLimit(author);

    if (!limitCheck.allowed) {
      return { success: false, error: limitCheck.reason };
    }

    const today = this.getTodayString();
    const recordKey = `${author}:${today}`;
    let record = this.submissionRecords.get(recordKey);

    if (!record) {
      record = {
        author,
        date: today,
        submissionCount: 0,
        freeSubmissionsRemaining: this.config.dailyFreeLimit || 3,
        depositsPaid: [],
      };
      this.submissionRecords.set(recordKey, record);
    }

    // Handle deposit if required
    let depositId: string | undefined;

    if (limitCheck.requiresDeposit) {
      try {
        depositId = await this.collectDeposit(author, intentHash, limitCheck.depositAmount!);

        // Create deposit record
        const depositRecord: DepositRecord = {
          depositId,
          author,
          intentHash,
          amount: limitCheck.depositAmount!,
          submittedAt: Date.now(),
          refundDeadline: Date.now() + (this.config.depositRefundDays || 30) * 24 * 60 * 60 * 1000,
          status: 'active',
        };

        this.depositRecords.set(depositId, depositRecord);
        record.depositsPaid.push(depositRecord);

        logger.info('Deposit collected for excess submission', {
          author,
          intentHash,
          depositId,
          amount: limitCheck.depositAmount,
        });
      } catch (error) {
        logger.error('Failed to collect deposit', { error, author, intentHash });
        return { success: false, error: 'Deposit collection failed' };
      }
    }

    // Update submission count
    record.submissionCount++;
    record.freeSubmissionsRemaining = Math.max(
      0,
      (this.config.dailyFreeLimit || 3) - record.submissionCount
    );

    // Persist data
    this.saveSubmissionData();
    if (depositId) {
      this.saveDepositData();
    }

    logger.debug('Submission recorded', {
      author,
      intentHash,
      dailyCount: record.submissionCount,
      depositRequired: limitCheck.requiresDeposit,
      depositId,
    });

    return { success: true, depositId };
  }

  /**
   * Collect deposit from author via chain API
   */
  private async collectDeposit(
    author: string,
    intentHash: string,
    amount: number
  ): Promise<string> {
    const depositId = nanoid();
    const depositEntry = {
      type: 'deposit',
      depositId,
      author,
      intentHash,
      amount,
      purpose: 'sybil_resistance',
      refundDeadline: Date.now() + (this.config.depositRefundDays || 30) * 24 * 60 * 60 * 1000,
      timestamp: Date.now(),
    };

    const signature = generateSignature(
      JSON.stringify(depositEntry),
      this.config.mediatorPrivateKey
    );

    await axios.post(`${this.config.chainEndpoint}/api/v1/deposits`, {
      entry: depositEntry,
      signature,
    });

    return depositId;
  }

  /**
   * Process refunds for deposits past their refund deadline
   */
  public async processRefunds(): Promise<void> {
    const now = Date.now();
    const refundableDeposits: DepositRecord[] = [];

    for (const deposit of this.depositRecords.values()) {
      if (
        deposit.status === 'active' &&
        deposit.refundDeadline <= now
      ) {
        refundableDeposits.push(deposit);
      }
    }

    if (refundableDeposits.length === 0) {
      return;
    }

    logger.info('Processing deposit refunds', { count: refundableDeposits.length });

    for (const deposit of refundableDeposits) {
      try {
        await this.refundDeposit(deposit);
      } catch (error) {
        logger.error('Failed to refund deposit', {
          error,
          depositId: deposit.depositId,
        });
      }
    }

    this.saveDepositData();
  }

  /**
   * Refund a single deposit
   */
  private async refundDeposit(deposit: DepositRecord): Promise<void> {
    const refundEntry = {
      type: 'refund',
      depositId: deposit.depositId,
      author: deposit.author,
      amount: deposit.amount,
      timestamp: Date.now(),
    };

    const signature = generateSignature(
      JSON.stringify(refundEntry),
      this.config.mediatorPrivateKey
    );

    await axios.post(`${this.config.chainEndpoint}/api/v1/refunds`, {
      entry: refundEntry,
      signature,
    });

    deposit.status = 'refunded';
    deposit.refundedAt = Date.now();

    logger.info('Deposit refunded', {
      depositId: deposit.depositId,
      author: deposit.author,
      amount: deposit.amount,
    });
  }

  /**
   * Forfeit a deposit due to validated spam proof
   */
  public async forfeitDeposit(depositId: string, spamProofId: string): Promise<boolean> {
    const deposit = this.depositRecords.get(depositId);

    if (!deposit) {
      logger.warn('Attempted to forfeit non-existent deposit', { depositId });
      return false;
    }

    if (deposit.status !== 'active') {
      logger.warn('Attempted to forfeit non-active deposit', {
        depositId,
        status: deposit.status,
      });
      return false;
    }

    try {
      const forfeitureEntry = {
        type: 'forfeiture',
        depositId: deposit.depositId,
        author: deposit.author,
        amount: deposit.amount,
        spamProofId,
        timestamp: Date.now(),
      };

      const signature = generateSignature(
        JSON.stringify(forfeitureEntry),
        this.config.mediatorPrivateKey
      );

      await axios.post(`${this.config.chainEndpoint}/api/v1/forfeitures`, {
        entry: forfeitureEntry,
        signature,
      });

      deposit.status = 'forfeited';
      deposit.forfeitedAt = Date.now();
      deposit.spamProofId = spamProofId;

      this.saveDepositData();

      logger.info('Deposit forfeited due to spam', {
        depositId,
        author: deposit.author,
        amount: deposit.amount,
        spamProofId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to forfeit deposit', { error, depositId });
      return false;
    }
  }

  /**
   * Get deposit record by intent hash
   */
  public getDepositByIntent(intentHash: string): DepositRecord | undefined {
    for (const deposit of this.depositRecords.values()) {
      if (deposit.intentHash === intentHash) {
        return deposit;
      }
    }
    return undefined;
  }

  /**
   * Get all active deposits for an author
   */
  public getAuthorDeposits(author: string): DepositRecord[] {
    return Array.from(this.depositRecords.values()).filter(
      d => d.author === author
    );
  }

  /**
   * Get submission statistics for an author
   */
  public getAuthorStats(author: string): {
    today: { count: number; freeRemaining: number; depositsCount: number };
    totalDeposits: { active: number; refunded: number; forfeited: number };
  } {
    const today = this.getTodayString();
    const recordKey = `${author}:${today}`;
    const record = this.submissionRecords.get(recordKey);

    const deposits = this.getAuthorDeposits(author);

    return {
      today: {
        count: record?.submissionCount || 0,
        freeRemaining: record?.freeSubmissionsRemaining || (this.config.dailyFreeLimit || 3),
        depositsCount: record?.depositsPaid.length || 0,
      },
      totalDeposits: {
        active: deposits.filter(d => d.status === 'active').length,
        refunded: deposits.filter(d => d.status === 'refunded').length,
        forfeited: deposits.filter(d => d.status === 'forfeited').length,
      },
    };
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  private getTodayString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Load submission data from disk
   */
  private loadSubmissionData(): void {
    const filePath = path.join(this.dataPath, 'submissions.json');

    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const records = JSON.parse(data);

        for (const [key, record] of Object.entries(records)) {
          this.submissionRecords.set(key, record as DailySubmissionRecord);
        }

        logger.debug('Loaded submission data', {
          records: this.submissionRecords.size,
        });
      } catch (error) {
        logger.error('Failed to load submission data', { error });
      }
    }
  }

  /**
   * Save submission data to disk
   */
  private saveSubmissionData(): void {
    const filePath = path.join(this.dataPath, 'submissions.json');
    const data = Object.fromEntries(this.submissionRecords.entries());

    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save submission data', { error });
    }
  }

  /**
   * Load deposit data from disk
   */
  private loadDepositData(): void {
    const filePath = path.join(this.dataPath, 'deposits.json');

    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath, 'utf-8');
        const deposits = JSON.parse(data);

        for (const [key, deposit] of Object.entries(deposits)) {
          this.depositRecords.set(key, deposit as DepositRecord);
        }

        logger.debug('Loaded deposit data', {
          deposits: this.depositRecords.size,
        });
      } catch (error) {
        logger.error('Failed to load deposit data', { error });
      }
    }
  }

  /**
   * Save deposit data to disk
   */
  private saveDepositData(): void {
    const filePath = path.join(this.dataPath, 'deposits.json');
    const data = Object.fromEntries(this.depositRecords.entries());

    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save deposit data', { error });
    }
  }

  /**
   * Get overall statistics
   */
  public getStats(): {
    totalSubmissionsToday: number;
    totalDeposits: number;
    activeDeposits: number;
    refundedDeposits: number;
    forfeitedDeposits: number;
    totalDepositValue: number;
  } {
    const today = this.getTodayString();
    let totalSubmissionsToday = 0;

    for (const [key, record] of this.submissionRecords.entries()) {
      if (key.endsWith(`:${today}`)) {
        totalSubmissionsToday += record.submissionCount;
      }
    }

    const deposits = Array.from(this.depositRecords.values());

    return {
      totalSubmissionsToday,
      totalDeposits: deposits.length,
      activeDeposits: deposits.filter(d => d.status === 'active').length,
      refundedDeposits: deposits.filter(d => d.status === 'refunded').length,
      forfeitedDeposits: deposits.filter(d => d.status === 'forfeited').length,
      totalDepositValue: deposits
        .filter(d => d.status === 'active')
        .reduce((sum, d) => sum + d.amount, 0),
    };
  }
}
