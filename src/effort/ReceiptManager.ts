import { EffortSegment, EffortReceipt, ValidationAssessment, ReceiptStatus } from '../types';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Constructs and manages effort receipts
 */
export class ReceiptManager {
  private observerId: string;
  private receipts: Map<string, EffortReceipt> = new Map();
  private dataPath: string;

  constructor(observerId: string, dataPath: string = './data/effort-receipts') {
    this.observerId = observerId;
    this.dataPath = dataPath;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load existing receipts
    this.loadReceipts();

    logger.info('ReceiptManager initialized', {
      observerId,
      dataPath,
      receiptsLoaded: this.receipts.size,
    });
  }

  /**
   * Create a receipt from a validated segment
   */
  public createReceipt(
    segment: EffortSegment,
    validation: ValidationAssessment,
    priorReceipts?: string[],
    externalArtifacts?: string[]
  ): EffortReceipt {
    // Extract signal hashes
    const signalHashes = segment.signals.map((signal) => signal.hash);

    // Generate receipt ID (UUID + first 8 chars of hash)
    const uuid = nanoid();
    const preHash = this.computeReceiptHash({
      segmentId: segment.segmentId,
      startTime: segment.startTime,
      endTime: segment.endTime,
      signalHashes,
      validation,
      observerId: this.observerId,
      validatorId: validation.validatorId,
    });
    const receiptId = `${uuid}-${preHash.substring(0, 8)}`;

    // Create receipt
    const receipt: EffortReceipt = {
      receiptId,
      segmentId: segment.segmentId,
      startTime: segment.startTime,
      endTime: segment.endTime,
      signalHashes,
      validation,
      observerId: this.observerId,
      validatorId: validation.validatorId,
      receiptHash: preHash,
      status: 'validated',
      priorReceipts,
      externalArtifacts,
      metadata: {
        segmentationRule: segment.segmentationRule,
        humanMarker: segment.humanMarker,
        signalCount: segment.signals.length,
        durationMinutes: Math.round(
          (segment.endTime - segment.startTime) / 1000 / 60
        ),
      },
    };

    // Recompute final hash with receipt ID
    receipt.receiptHash = this.computeReceiptHash(receipt);

    // Store receipt
    this.receipts.set(receipt.receiptId, receipt);
    this.saveReceipt(receipt);

    logger.info('Receipt created', {
      receiptId: receipt.receiptId,
      segmentId: segment.segmentId,
      durationMinutes: receipt.metadata?.durationMinutes,
      signalCount: receipt.metadata?.signalCount,
    });

    return receipt;
  }

  /**
   * Compute SHA-256 hash of receipt contents
   */
  private computeReceiptHash(receipt: Partial<EffortReceipt>): string {
    const hashInput = JSON.stringify({
      segmentId: receipt.segmentId,
      startTime: receipt.startTime,
      endTime: receipt.endTime,
      signalHashes: receipt.signalHashes,
      validation: {
        coherenceScore: receipt.validation?.coherenceScore,
        progressionScore: receipt.validation?.progressionScore,
        consistencyScore: receipt.validation?.consistencyScore,
        synthesisScore: receipt.validation?.synthesisScore,
        summary: receipt.validation?.summary,
      },
      observerId: receipt.observerId || this.observerId,
      validatorId: receipt.validatorId || receipt.validation?.validatorId,
    });

    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Get receipt by ID
   */
  public getReceipt(receiptId: string): EffortReceipt | undefined {
    return this.receipts.get(receiptId);
  }

  /**
   * Get all receipts
   */
  public getAllReceipts(): EffortReceipt[] {
    return Array.from(this.receipts.values());
  }

  /**
   * Get receipts by status
   */
  public getReceiptsByStatus(status: ReceiptStatus): EffortReceipt[] {
    return Array.from(this.receipts.values()).filter((r) => r.status === status);
  }

  /**
   * Get receipts in time range
   */
  public getReceiptsInRange(startTime: number, endTime: number): EffortReceipt[] {
    return Array.from(this.receipts.values()).filter(
      (receipt) =>
        receipt.startTime >= startTime && receipt.endTime <= endTime
    );
  }

  /**
   * Update receipt status
   */
  public updateReceiptStatus(receiptId: string, status: ReceiptStatus): boolean {
    const receipt = this.receipts.get(receiptId);

    if (!receipt) {
      logger.warn('Receipt not found for status update', { receiptId });
      return false;
    }

    receipt.status = status;
    this.saveReceipt(receipt);

    logger.info('Receipt status updated', { receiptId, status });

    return true;
  }

  /**
   * Mark receipt as anchored
   */
  public markAsAnchored(
    receiptId: string,
    ledgerReference: string
  ): boolean {
    const receipt = this.receipts.get(receiptId);

    if (!receipt) {
      logger.warn('Receipt not found for anchoring', { receiptId });
      return false;
    }

    receipt.status = 'anchored';
    receipt.anchoredAt = Date.now();
    receipt.ledgerReference = ledgerReference;

    this.saveReceipt(receipt);

    logger.info('Receipt anchored', {
      receiptId,
      ledgerReference,
    });

    return true;
  }

  /**
   * Save receipt to disk
   */
  private saveReceipt(receipt: EffortReceipt): void {
    const filePath = path.join(this.dataPath, `${receipt.receiptId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(receipt, null, 2));
    } catch (error) {
      logger.error('Error saving receipt', {
        receiptId: receipt.receiptId,
        error,
      });
    }
  }

  /**
   * Load all receipts from disk
   */
  private loadReceipts(): void {
    if (!fs.existsSync(this.dataPath)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.dataPath);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.dataPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const receipt: EffortReceipt = JSON.parse(content);

        this.receipts.set(receipt.receiptId, receipt);
      }

      logger.info('Receipts loaded from disk', {
        count: this.receipts.size,
      });
    } catch (error) {
      logger.error('Error loading receipts', { error });
    }
  }

  /**
   * Verify receipt hash integrity
   */
  public verifyReceiptHash(receiptId: string): boolean {
    const receipt = this.receipts.get(receiptId);

    if (!receipt) {
      return false;
    }

    const recomputedHash = this.computeReceiptHash(receipt);
    return receipt.receiptHash === recomputedHash;
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalReceipts: number;
    receiptsByStatus: Record<ReceiptStatus, number>;
    totalDurationMinutes: number;
    totalSignals: number;
    oldestReceipt?: number;
    newestReceipt?: number;
  } {
    const receiptsByStatus: Record<ReceiptStatus, number> = {
      draft: 0,
      validated: 0,
      anchored: 0,
      verified: 0,
    };

    let totalDurationMinutes = 0;
    let totalSignals = 0;
    let oldestReceipt: number | undefined;
    let newestReceipt: number | undefined;

    for (const receipt of this.receipts.values()) {
      receiptsByStatus[receipt.status]++;

      const duration = (receipt.endTime - receipt.startTime) / 1000 / 60;
      totalDurationMinutes += duration;
      totalSignals += receipt.signalHashes.length;

      if (!oldestReceipt || receipt.startTime < oldestReceipt) {
        oldestReceipt = receipt.startTime;
      }

      if (!newestReceipt || receipt.endTime > newestReceipt) {
        newestReceipt = receipt.endTime;
      }
    }

    return {
      totalReceipts: this.receipts.size,
      receiptsByStatus,
      totalDurationMinutes: Math.round(totalDurationMinutes),
      totalSignals,
      oldestReceipt,
      newestReceipt,
    };
  }

  /**
   * Delete receipt
   */
  public deleteReceipt(receiptId: string): boolean {
    const receipt = this.receipts.get(receiptId);

    if (!receipt) {
      return false;
    }

    // Remove from memory
    this.receipts.delete(receiptId);

    // Remove from disk
    const filePath = path.join(this.dataPath, `${receiptId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    logger.info('Receipt deleted', { receiptId });

    return true;
  }

  /**
   * Clear all receipts before a specific timestamp
   */
  public clearReceiptsBefore(timestamp: number): number {
    const toDelete: string[] = [];

    for (const [receiptId, receipt] of this.receipts.entries()) {
      if (receipt.endTime < timestamp) {
        toDelete.push(receiptId);
      }
    }

    for (const receiptId of toDelete) {
      this.deleteReceipt(receiptId);
    }

    logger.info('Receipts cleared', {
      count: toDelete.length,
      beforeTimestamp: timestamp,
    });

    return toDelete.length;
  }
}
