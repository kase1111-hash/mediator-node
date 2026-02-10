import { MediatorConfig, EffortReceipt, ReceiptVerification } from '../types';
import { ObserverManager } from './observers/ObserverManager';
import { SegmentationEngine } from './SegmentationEngine';
import { EffortValidator } from './EffortValidator';
import { ReceiptManager } from './ReceiptManager';
import { AnchoringService } from './AnchoringService';
import { LLMProvider } from '../llm/LLMProvider';
import { logger } from '../utils/logger';

/**
 * Main orchestrator for MP-02 Proof-of-Effort Receipt Protocol
 * Coordinates observation, segmentation, validation, and anchoring
 */
export class EffortCaptureSystem {
  private config: MediatorConfig;
  private observerManager: ObserverManager;
  private segmentationEngine: SegmentationEngine;
  private effortValidator: EffortValidator;
  private receiptManager: ReceiptManager;
  private anchoringService: AnchoringService;
  private isRunning: boolean = false;
  private segmentationIntervalId?: NodeJS.Timeout;
  private anchoringIntervalId?: NodeJS.Timeout;

  constructor(config: MediatorConfig, llmProvider: LLMProvider) {
    this.config = config;

    // Initialize observer manager
    const observerId = config.effortObserverId || `observer-${Date.now()}`;
    const modalities = config.effortCaptureModalities || ['text_edit', 'command'];

    this.observerManager = ObserverManager.createDefaultObservers(
      observerId,
      modalities
    );

    // Initialize segmentation engine
    this.segmentationEngine = new SegmentationEngine({
      strategy: config.effortSegmentationStrategy || 'time_window',
      timeWindowMinutes: config.effortTimeWindowMinutes || 30,
      activityGapMinutes: config.effortActivityGapMinutes || 10,
    });

    // Initialize effort validator
    this.effortValidator = new EffortValidator(config, llmProvider);

    // Initialize receipt manager
    this.receiptManager = new ReceiptManager(observerId);

    // Initialize anchoring service
    this.anchoringService = new AnchoringService(config, this.receiptManager);

    logger.info('EffortCaptureSystem initialized', {
      observerId,
      modalities,
      segmentationStrategy: config.effortSegmentationStrategy,
    });
  }

  /**
   * Start effort capture
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('EffortCaptureSystem already running');
      return;
    }

    // Start all observers
    this.observerManager.startAll();

    // Start periodic segmentation (every 5 minutes)
    this.segmentationIntervalId = setInterval(async () => {
      try {
        await this.processSegments();
      } catch (error) {
        logger.error('Error in segmentation processing interval', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, 5 * 60 * 1000);

    // Start auto-anchoring if enabled (every 10 minutes)
    if (this.config.effortAutoAnchor !== false) {
      this.anchoringIntervalId = setInterval(async () => {
        try {
          await this.anchoringService.autoAnchorValidatedReceipts();
        } catch (error) {
          logger.error('Error in auto-anchoring interval', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          });
        }
      }, 10 * 60 * 1000);
    }

    this.isRunning = true;

    logger.info('EffortCaptureSystem started');
  }

  /**
   * Stop effort capture
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    // Stop all observers
    this.observerManager.stopAll();

    // Stop periodic tasks
    if (this.segmentationIntervalId) {
      clearInterval(this.segmentationIntervalId);
      this.segmentationIntervalId = undefined;
    }

    if (this.anchoringIntervalId) {
      clearInterval(this.anchoringIntervalId);
      this.anchoringIntervalId = undefined;
    }

    // Process any remaining segments
    this.processSegments();

    this.isRunning = false;

    logger.info('EffortCaptureSystem stopped');
  }

  /**
   * Process signals into segments, validate, and create receipts
   */
  private async processSegments(): Promise<void> {
    try {
      // Get all signals from observers
      const signals = this.observerManager.getAllSignals();

      if (signals.length === 0) {
        return;
      }

      logger.info('Processing signals into segments', {
        signalCount: signals.length,
      });

      // Segment the signals
      const segments = this.segmentationEngine.processSignals(signals);

      if (segments.length === 0) {
        return;
      }

      logger.info('Segments created', {
        segmentCount: segments.length,
      });

      // Validate each segment and create receipts
      for (const segment of segments) {
        try {
          // Validate the segment
          const validation = await this.effortValidator.validateSegment(segment);

          // Create receipt
          const receipt = this.receiptManager.createReceipt(segment, validation);

          logger.info('Receipt created from segment', {
            segmentId: segment.segmentId,
            receiptId: receipt.receiptId,
          });

          // Auto-anchor if enabled
          if (this.config.effortAutoAnchor !== false) {
            await this.anchoringService.anchorReceipt(receipt.receiptId);
          }
        } catch (error) {
          logger.error('Error processing segment', {
            segmentId: segment.segmentId,
            error,
          });
        }
      }

      // Clear processed signals from observers
      const oldestSegmentTime = Math.min(...segments.map((s) => s.startTime));
      this.observerManager.clearSignalsBefore(oldestSegmentTime);

      logger.info('Segment processing complete', {
        segmentsProcessed: segments.length,
      });
    } catch (error) {
      logger.error('Error in processSegments', { error });
    }
  }

  /**
   * Manually create a segment with a human marker
   */
  public async createMarkedSegment(marker: string): Promise<EffortReceipt | null> {
    try {
      // Get recent signals (last hour)
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const signals = this.observerManager.getSignalsInRange(
        oneHourAgo,
        Date.now()
      );

      if (signals.length === 0) {
        logger.warn('No signals to create marked segment');
        return null;
      }

      // Create segment with marker
      this.segmentationEngine.startSegment(marker);

      for (const signal of signals) {
        this.segmentationEngine.addToActiveSegment(signal);
      }

      const segment = this.segmentationEngine.completeActiveSegment();

      if (!segment) {
        logger.warn('Failed to create marked segment');
        return null;
      }

      // Validate and create receipt
      const validation = await this.effortValidator.validateSegment(segment);
      const receipt = this.receiptManager.createReceipt(segment, validation);

      // Auto-anchor if enabled
      if (this.config.effortAutoAnchor !== false) {
        await this.anchoringService.anchorReceipt(receipt.receiptId);
      }

      logger.info('Marked segment created', {
        marker,
        receiptId: receipt.receiptId,
      });

      return receipt;
    } catch (error) {
      logger.error('Error creating marked segment', { marker, error });
      return null;
    }
  }

  /**
   * Get all receipts
   */
  public getReceipts(): EffortReceipt[] {
    return this.receiptManager.getAllReceipts();
  }

  /**
   * Get receipt by ID
   */
  public getReceipt(receiptId: string): EffortReceipt | undefined {
    return this.receiptManager.getReceipt(receiptId);
  }

  /**
   * Verify a receipt
   */
  public async verifyReceipt(receiptId: string): Promise<ReceiptVerification> {
    return this.anchoringService.verifyReceipt(receiptId);
  }

  /**
   * Get comprehensive status
   */
  public getStatus(): {
    isRunning: boolean;
    observers: ReturnType<ObserverManager['getStats']>;
    segmentation: ReturnType<SegmentationEngine['getStats']>;
    receipts: ReturnType<ReceiptManager['getStats']>;
    anchoring: ReturnType<AnchoringService['getStats']>;
  } {
    return {
      isRunning: this.isRunning,
      observers: this.observerManager.getStats(),
      segmentation: this.segmentationEngine.getStats(),
      receipts: this.receiptManager.getStats(),
      anchoring: this.anchoringService.getStats(),
    };
  }

  /**
   * Cleanup old data based on retention policy
   */
  public async cleanup(): Promise<void> {
    const retentionDays = this.config.effortRetentionDays;

    if (!retentionDays || retentionDays === 0) {
      logger.info('No retention policy set, skipping cleanup');
      return;
    }

    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    // Clear old signals
    this.observerManager.clearSignalsBefore(cutoffTime);

    // Clear old receipts (only unanchored ones)
    const oldReceipts = this.receiptManager.getAllReceipts().filter(
      (r) => r.status !== 'anchored' && r.endTime < cutoffTime
    );

    for (const receipt of oldReceipts) {
      this.receiptManager.deleteReceipt(receipt.receiptId);
    }

    logger.info('Cleanup complete', {
      retentionDays,
      receiptsDeleted: oldReceipts.length,
    });
  }
}
