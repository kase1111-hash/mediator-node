import { EffortReceipt, ReceiptVerification, MediatorConfig } from '../types';
import { ReceiptManager } from './ReceiptManager';
import axios from 'axios';
import * as crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * Anchors receipts to the ledger and provides verification
 */
export class AnchoringService {
  private config: MediatorConfig;
  private receiptManager: ReceiptManager;
  private pendingAnchors: Map<string, EffortReceipt> = new Map();

  constructor(config: MediatorConfig, receiptManager: ReceiptManager) {
    this.config = config;
    this.receiptManager = receiptManager;

    logger.info('AnchoringService initialized', {
      chainEndpoint: config.chainEndpoint,
    });
  }

  /**
   * Anchor a receipt to the ledger
   */
  public async anchorReceipt(receiptId: string): Promise<{
    success: boolean;
    ledgerReference?: string;
    error?: string;
  }> {
    const receipt = this.receiptManager.getReceipt(receiptId);

    if (!receipt) {
      return {
        success: false,
        error: 'Receipt not found',
      };
    }

    if (receipt.status === 'anchored') {
      return {
        success: true,
        ledgerReference: receipt.ledgerReference,
      };
    }

    try {
      // Add to pending
      this.pendingAnchors.set(receiptId, receipt);

      // Format receipt as prose entry for chain
      const proseEntry = this.formatReceiptAsProse(receipt);

      // Submit to chain
      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/effort-receipts`,
        {
          type: 'effort_receipt',
          receipt: {
            receiptId: receipt.receiptId,
            receiptHash: receipt.receiptHash,
            observerId: receipt.observerId,
            validatorId: receipt.validatorId,
            startTime: receipt.startTime,
            endTime: receipt.endTime,
            signalCount: receipt.signalHashes.length,
            validationSummary: receipt.validation.summary,
            coherenceScore: receipt.validation.coherenceScore,
            progressionScore: receipt.validation.progressionScore,
            consistencyScore: receipt.validation.consistencyScore,
            synthesisScore: receipt.validation.synthesisScore,
          },
          prose: proseEntry,
        }
      );

      if (response.status === 200 || response.status === 201) {
        // Mark as anchored
        const ledgerRef = response.data.ledgerReference || receipt.receiptId;
        this.receiptManager.markAsAnchored(receiptId, ledgerRef);

        // Remove from pending
        this.pendingAnchors.delete(receiptId);

        logger.info('Receipt anchored successfully', {
          receiptId,
          ledgerReference: ledgerRef,
        });

        return {
          success: true,
          ledgerReference: ledgerRef,
        };
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      logger.error('Error anchoring receipt', {
        receiptId,
        error,
      });

      // Remove from pending
      this.pendingAnchors.delete(receiptId);

      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Format receipt as prose entry
   */
  private formatReceiptAsProse(receipt: EffortReceipt): string {
    const duration = Math.round(
      (receipt.endTime - receipt.startTime) / 1000 / 60
    );
    const startDate = new Date(receipt.startTime).toISOString();
    const endDate = new Date(receipt.endTime).toISOString();

    return `[EFFORT RECEIPT]

Receipt ID: ${receipt.receiptId}
Receipt Hash: ${receipt.receiptHash}

**Time Period:**
Start: ${startDate}
End: ${endDate}
Duration: ${duration} minutes

**Effort Characteristics:**
Signal Count: ${receipt.signalHashes.length}
Observer ID: ${receipt.observerId}
Validator ID: ${receipt.validatorId}

**Validation Scores:**
Linguistic Coherence: ${(receipt.validation.coherenceScore * 100).toFixed(1)}%
Conceptual Progression: ${(receipt.validation.progressionScore * 100).toFixed(1)}%
Internal Consistency: ${(receipt.validation.consistencyScore * 100).toFixed(1)}%
Synthesis (vs Duplication): ${(receipt.validation.synthesisScore * 100).toFixed(1)}%

**Effort Summary:**
${receipt.validation.summary}

${receipt.validation.uncertaintyFlags.length > 0 ? `**Uncertainty Flags:**\n${receipt.validation.uncertaintyFlags.map(f => `- ${f}`).join('\n')}` : ''}

**Verification:**
This receipt attests that intellectual effort occurred during the specified time period.
The validation assessment is reproducible using the disclosed model (${receipt.validatorId}).
Signal hashes are available for independent verification.

${receipt.priorReceipts && receipt.priorReceipts.length > 0 ? `**Prior Receipts:**\n${receipt.priorReceipts.map(r => `- ${r}`).join('\n')}` : ''}

${receipt.externalArtifacts && receipt.externalArtifacts.length > 0 ? `**External Artifacts:**\n${receipt.externalArtifacts.map(a => `- ${a}`).join('\n')}` : ''}
`;
  }

  /**
   * Batch anchor multiple receipts
   */
  public async anchorReceipts(receiptIds: string[]): Promise<{
    successful: number;
    failed: number;
    results: Array<{
      receiptId: string;
      success: boolean;
      ledgerReference?: string;
      error?: string;
    }>;
  }> {
    const results: Array<{
      receiptId: string;
      success: boolean;
      ledgerReference?: string;
      error?: string;
    }> = [];

    let successful = 0;
    let failed = 0;

    for (const receiptId of receiptIds) {
      const result = await this.anchorReceipt(receiptId);
      results.push({
        receiptId,
        ...result,
      });

      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    }

    logger.info('Batch anchoring complete', {
      total: receiptIds.length,
      successful,
      failed,
    });

    return {
      successful,
      failed,
      results,
    };
  }

  /**
   * Verify a receipt
   */
  public async verifyReceipt(receiptId: string): Promise<ReceiptVerification> {
    const receipt = this.receiptManager.getReceipt(receiptId);

    if (!receipt) {
      return {
        receiptId,
        isValid: false,
        hashMatches: false,
        ledgerConfirmed: false,
        validationReproducible: false,
        issues: ['Receipt not found'],
        verifiedAt: Date.now(),
      };
    }

    const issues: string[] = [];

    // 1. Verify hash
    const hashMatches = this.receiptManager.verifyReceiptHash(receiptId);
    if (!hashMatches) {
      issues.push('Receipt hash does not match recomputed hash');
    }

    // 2. Verify ledger inclusion (if anchored)
    let ledgerConfirmed = false;
    if (receipt.status === 'anchored' && receipt.ledgerReference) {
      ledgerConfirmed = await this.verifyLedgerInclusion(
        receipt.ledgerReference
      );
      if (!ledgerConfirmed) {
        issues.push('Receipt not found on ledger');
      }
    } else {
      issues.push('Receipt not yet anchored');
    }

    // 3. Check validation reproducibility
    const validationReproducible = this.checkValidationReproducibility(receipt);
    if (!validationReproducible) {
      issues.push('Validation metadata incomplete or inconsistent');
    }

    const isValid =
      hashMatches && (ledgerConfirmed || receipt.status !== 'anchored') && validationReproducible;

    logger.info('Receipt verification complete', {
      receiptId,
      isValid,
      issues: issues.length,
    });

    return {
      receiptId,
      isValid,
      hashMatches,
      ledgerConfirmed,
      validationReproducible,
      issues,
      verifiedAt: Date.now(),
    };
  }

  /**
   * Verify receipt inclusion on ledger
   */
  private async verifyLedgerInclusion(ledgerReference: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.config.chainEndpoint}/api/v1/effort-receipts/${ledgerReference}/status`
      );

      return response.status === 200 && response.data.exists === true;
    } catch (error) {
      logger.warn('Error verifying ledger inclusion', {
        ledgerReference,
        error,
      });
      return false;
    }
  }

  /**
   * Check if validation is reproducible
   */
  private checkValidationReproducibility(receipt: EffortReceipt): boolean {
    // Check that all required validation fields are present
    const validation = receipt.validation;

    if (!validation) {
      return false;
    }

    // Must have validator ID and model version
    if (!validation.validatorId || !validation.modelVersion) {
      return false;
    }

    // Must have all scores
    if (
      validation.coherenceScore === undefined ||
      validation.progressionScore === undefined ||
      validation.consistencyScore === undefined ||
      validation.synthesisScore === undefined
    ) {
      return false;
    }

    // Must have summary and evidence
    if (!validation.summary || !validation.evidence) {
      return false;
    }

    return true;
  }

  /**
   * Get anchoring statistics
   */
  public getStats(): {
    pendingAnchors: number;
    totalAnchored: number;
    totalVerified: number;
  } {
    const receipts = this.receiptManager.getAllReceipts();

    return {
      pendingAnchors: this.pendingAnchors.size,
      totalAnchored: receipts.filter((r) => r.status === 'anchored').length,
      totalVerified: receipts.filter((r) => r.status === 'verified').length,
    };
  }

  /**
   * Auto-anchor validated receipts
   */
  public async autoAnchorValidatedReceipts(): Promise<void> {
    const validatedReceipts = this.receiptManager.getReceiptsByStatus('validated');

    if (validatedReceipts.length === 0) {
      return;
    }

    logger.info('Auto-anchoring validated receipts', {
      count: validatedReceipts.length,
    });

    const receiptIds = validatedReceipts.map((r) => r.receiptId);
    await this.anchorReceipts(receiptIds);
  }
}
