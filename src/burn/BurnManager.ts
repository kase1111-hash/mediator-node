import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { BurnTransaction, BurnType, MediatorConfig, UserSubmissionRecord } from '../types';
import { logger } from '../utils/logger';
import { BurnAnalytics } from './BurnAnalytics';
import { ChainClient } from '../chain';

/**
 * BurnManager handles all burn-related operations including:
 * - Base filing burns
 * - Escalated burns (exponential per-user)
 * - Success burns (on settlement closure)
 * - Load-scaled burns
 * - User submission tracking
 * Uses ChainClient for NatLangChain API compatibility
 */
export class BurnManager {
  private config: MediatorConfig;
  private userSubmissions: Map<string, UserSubmissionRecord> = new Map();
  private burnHistory: BurnTransaction[] = [];
  private currentLoadMultiplier: number = 1.0;
  private dataPath: string;
  private chainClient: ChainClient;

  constructor(config: MediatorConfig, chainClient?: ChainClient) {
    this.config = config;
    this.chainClient = chainClient || ChainClient.fromConfig(config);
    this.dataPath = path.join(process.cwd(), '.mediator-data', 'burns');
    this.ensureDataDirectory();
    this.loadSubmissionData();
  }

  /**
   * Ensure the data directory exists
   */
  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
      logger.debug('Created burn data directory', { path: this.dataPath });
    }
  }

  /**
   * Load submission data from disk
   */
  private loadSubmissionData(): void {
    const submissionsFile = path.join(this.dataPath, 'submissions.json');
    const historyFile = path.join(this.dataPath, 'history.json');

    try {
      if (fs.existsSync(submissionsFile)) {
        const data = JSON.parse(fs.readFileSync(submissionsFile, 'utf-8'));
        this.userSubmissions = new Map(Object.entries(data));
        logger.info('Loaded user submission data', {
          users: this.userSubmissions.size,
        });
      }

      if (fs.existsSync(historyFile)) {
        this.burnHistory = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
        logger.info('Loaded burn history', {
          transactions: this.burnHistory.length,
        });
      }
    } catch (error) {
      logger.warn('Could not load burn data from disk', { error });
    }
  }

  /**
   * Persist submission data to disk
   */
  private persistSubmissionData(): void {
    const submissionsFile = path.join(this.dataPath, 'submissions.json');
    const historyFile = path.join(this.dataPath, 'history.json');

    try {
      const submissionsData = Object.fromEntries(this.userSubmissions.entries());
      fs.writeFileSync(submissionsFile, JSON.stringify(submissionsData, null, 2));

      // Keep only last 10000 burn transactions in history
      const recentHistory = this.burnHistory.slice(-10000);
      fs.writeFileSync(historyFile, JSON.stringify(recentHistory, null, 2));

      logger.debug('Persisted burn data to disk');
    } catch (error) {
      logger.error('Error persisting burn data', { error });
    }
  }

  /**
   * Get current date in YYYY-MM-DD format
   */
  private getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get or create user submission record for today
   */
  private getUserRecord(userId: string): UserSubmissionRecord {
    const today = this.getCurrentDate();
    const key = `${userId}:${today}`;

    let record = this.userSubmissions.get(key);

    if (!record) {
      record = {
        userId,
        date: today,
        submissionCount: 0,
        lastSubmissionTime: 0,
        totalBurned: 0,
        burns: [],
      };
      this.userSubmissions.set(key, record);
    }

    return record;
  }

  /**
   * Calculate burn amount for an intent filing
   * Takes into account:
   * - Daily free allowance
   * - Per-user exponential escalation
   * - Global load multiplier
   */
  public calculateFilingBurn(userId: string): {
    amount: number;
    isFree: boolean;
    multiplier: number;
    breakdown: {
      baseBurn: number;
      escalationMultiplier: number;
      loadMultiplier: number;
      submissionCount: number;
    };
  } {
    const record = this.getUserRecord(userId);
    const freeDailySubmissions = this.config.freeDailySubmissions ?? 1;
    const baseBurn = this.config.baseFilingBurn ?? 0;

    // Check if this submission is free
    const isFree = record.submissionCount < freeDailySubmissions;

    if (isFree) {
      return {
        amount: 0,
        isFree: true,
        multiplier: 0,
        breakdown: {
          baseBurn: 0,
          escalationMultiplier: 0,
          loadMultiplier: this.currentLoadMultiplier,
          submissionCount: record.submissionCount,
        },
      };
    }

    // Calculate escalation multiplier
    const escalationBase = this.config.burnEscalationBase ?? 2;
    const escalationExponent = this.config.burnEscalationExponent ?? 1;
    const submissionsOverFree = record.submissionCount - freeDailySubmissions + 1;
    const escalationMultiplier = Math.pow(
      escalationBase,
      submissionsOverFree * escalationExponent
    );

    // Apply load multiplier if enabled
    const loadMultiplier = this.config.loadScalingEnabled
      ? this.currentLoadMultiplier
      : 1.0;

    // Calculate final burn amount
    const totalMultiplier = escalationMultiplier * loadMultiplier;
    const amount = baseBurn * totalMultiplier;

    return {
      amount,
      isFree: false,
      multiplier: totalMultiplier,
      breakdown: {
        baseBurn,
        escalationMultiplier,
        loadMultiplier,
        submissionCount: record.submissionCount,
      },
    };
  }

  /**
   * Execute a filing burn transaction
   */
  public async executeFilingBurn(
    userId: string,
    intentHash: string
  ): Promise<BurnTransaction | null> {
    const calculation = this.calculateFilingBurn(userId);

    // No burn needed for free submissions
    if (calculation.isFree) {
      logger.info('Free submission allowance used', {
        userId,
        intentHash,
        submissionCount: calculation.breakdown.submissionCount,
      });

      const record = this.getUserRecord(userId);
      record.submissionCount++;
      record.lastSubmissionTime = Date.now();
      this.persistSubmissionData();

      return null;
    }

    // Create burn transaction
    const burnTx: BurnTransaction = {
      id: this.generateBurnId(),
      type: 'base_filing',
      author: userId,
      amount: calculation.amount,
      intentHash,
      multiplier: calculation.multiplier,
      timestamp: Date.now(),
    };

    // Submit burn to chain using ChainClient
    try {
      const result = await this.chainClient.submitBurn({
        type: burnTx.type,
        author: burnTx.author,
        amount: burnTx.amount,
        intentHash: burnTx.intentHash,
        multiplier: burnTx.multiplier,
      });

      if (result.success) {
        burnTx.transactionHash = result.transactionId;

        // Update user record
        const record = this.getUserRecord(userId);
        record.submissionCount++;
        record.lastSubmissionTime = Date.now();
        record.totalBurned += calculation.amount;
        record.burns.push(burnTx);

        // Add to history
        this.burnHistory.push(burnTx);

        this.persistSubmissionData();

        logger.info('Filing burn executed successfully', {
          userId,
          intentHash,
          amount: calculation.amount,
          multiplier: calculation.multiplier,
          submissionCount: record.submissionCount,
        });

        return burnTx;
      }

      logger.error('Burn transaction failed', {
        error: result.error,
        userId,
        intentHash,
      });
      return null;
    } catch (error) {
      logger.error('Error executing burn transaction', { error, userId, intentHash });
      throw error;
    }
  }

  /**
   * Execute a success burn on settlement closure
   */
  public async executeSuccessBurn(
    settlementId: string,
    settlementValue: number,
    mediatorId: string
  ): Promise<BurnTransaction | null> {
    const successBurnPercentage = this.config.successBurnPercentage ?? 0.0005; // Default 0.05%
    const burnAmount = settlementValue * successBurnPercentage;

    // Skip if burn amount is negligible
    if (burnAmount < 0.0001) {
      logger.debug('Success burn amount negligible, skipping', {
        settlementId,
        amount: burnAmount,
      });
      return null;
    }

    const burnTx: BurnTransaction = {
      id: this.generateBurnId(),
      type: 'success',
      author: mediatorId,
      amount: burnAmount,
      settlementId,
      timestamp: Date.now(),
    };

    try {
      const result = await this.chainClient.submitBurn({
        type: burnTx.type,
        author: burnTx.author,
        amount: burnTx.amount,
        settlementId: burnTx.settlementId,
      });

      if (result.success) {
        burnTx.transactionHash = result.transactionId;
        this.burnHistory.push(burnTx);
        this.persistSubmissionData();

        logger.info('Success burn executed', {
          settlementId,
          amount: burnAmount,
          percentage: successBurnPercentage,
        });

        return burnTx;
      }

      return null;
    } catch (error) {
      logger.error('Error executing success burn', { error, settlementId });
      return null;
    }
  }

  /**
   * Update the current load multiplier
   * This should be called by a separate LoadMonitor component
   */
  public updateLoadMultiplier(multiplier: number): void {
    const maxMultiplier = this.config.maxLoadMultiplier ?? 10;
    const clampedMultiplier = Math.min(Math.max(multiplier, 1.0), maxMultiplier);

    if (clampedMultiplier !== this.currentLoadMultiplier) {
      logger.info('Load multiplier updated', {
        previous: this.currentLoadMultiplier,
        new: clampedMultiplier,
      });

      this.currentLoadMultiplier = clampedMultiplier;
    }
  }

  /**
   * Get current load multiplier
   */
  public getLoadMultiplier(): number {
    return this.currentLoadMultiplier;
  }

  /**
   * Get user's submission count for today
   */
  public getUserSubmissionCount(userId: string): number {
    const record = this.getUserRecord(userId);
    return record.submissionCount;
  }

  /**
   * Get user's total burned for today
   */
  public getUserTotalBurned(userId: string): number {
    const record = this.getUserRecord(userId);
    return record.totalBurned;
  }

  /**
   * Get burn statistics
   */
  public getBurnStats(): {
    totalBurns: number;
    totalAmount: number;
    byType: Record<BurnType, { count: number; amount: number }>;
    activeUsers: number;
  } {
    const stats = {
      totalBurns: this.burnHistory.length,
      totalAmount: 0,
      byType: {
        base_filing: { count: 0, amount: 0 },
        escalated: { count: 0, amount: 0 },
        success: { count: 0, amount: 0 },
        load_scaled: { count: 0, amount: 0 },
      },
      activeUsers: this.userSubmissions.size,
    };

    for (const burn of this.burnHistory) {
      stats.totalAmount += burn.amount;
      stats.byType[burn.type].count++;
      stats.byType[burn.type].amount += burn.amount;
    }

    return stats;
  }

  /**
   * Get burn transaction history
   */
  public getBurnHistory(): BurnTransaction[] {
    return [...this.burnHistory];
  }

  /**
   * Generate a unique burn transaction ID
   */
  private generateBurnId(): string {
    const timestamp = Date.now();
    const random = randomBytes(8).toString('hex');
    return `burn_${timestamp}_${random}`;
  }

  /**
   * Clean up old submission records (older than 30 days)
   */
  public cleanupOldRecords(): void {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

    let removed = 0;
    for (const [key, record] of this.userSubmissions.entries()) {
      if (record.date < cutoffDate) {
        this.userSubmissions.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Cleaned up old submission records', { removed });
      this.persistSubmissionData();
    }
  }

  /**
   * Get BurnAnalytics instance for analytics and reporting
   */
  public getBurnAnalytics(): BurnAnalytics {
    return new BurnAnalytics(this.burnHistory, this.userSubmissions);
  }
}
