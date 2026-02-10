import { Signal, SignalModality } from '../../types';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import { logger } from '../../utils/logger';

/**
 * Base class for all signal observers
 * Responsible for capturing raw traces of effort
 */
export abstract class SignalObserver {
  protected observerId: string;
  protected modality: SignalModality;
  protected signals: Signal[] = [];
  protected isObserving: boolean = false;

  constructor(observerId: string, modality: SignalModality) {
    this.observerId = observerId;
    this.modality = modality;
  }

  /**
   * Start observing signals
   */
  public abstract start(): void;

  /**
   * Stop observing signals
   */
  public abstract stop(): void;

  /**
   * Get all captured signals
   */
  public getSignals(): Signal[] {
    return [...this.signals];
  }

  /**
   * Get signals within time range
   */
  public getSignalsInRange(startTime: number, endTime: number): Signal[] {
    return this.signals.filter(
      (signal) => signal.timestamp >= startTime && signal.timestamp <= endTime
    );
  }

  /**
   * Clear all signals
   */
  public clearSignals(): void {
    this.signals = [];
    logger.debug('Signals cleared', {
      observerId: this.observerId,
      modality: this.modality,
    });
  }

  /**
   * Clear signals before a specific timestamp
   */
  public clearSignalsBefore(timestamp: number): void {
    const before = this.signals.length;
    this.signals = this.signals.filter((signal) => signal.timestamp >= timestamp);
    const cleared = before - this.signals.length;

    logger.debug('Signals cleared', {
      observerId: this.observerId,
      modality: this.modality,
      cleared,
      remaining: this.signals.length,
    });
  }

  /**
   * Get observation status
   */
  public isActive(): boolean {
    return this.isObserving;
  }

  /**
   * Get statistics about captured signals
   */
  public getStats(): {
    observerId: string;
    modality: SignalModality;
    totalSignals: number;
    isObserving: boolean;
    oldestSignalTime?: number;
    newestSignalTime?: number;
  } {
    const stats = {
      observerId: this.observerId,
      modality: this.modality,
      totalSignals: this.signals.length,
      isObserving: this.isObserving,
      oldestSignalTime: undefined as number | undefined,
      newestSignalTime: undefined as number | undefined,
    };

    if (this.signals.length > 0) {
      stats.oldestSignalTime = this.signals[0].timestamp;
      stats.newestSignalTime = this.signals[this.signals.length - 1].timestamp;
    }

    return stats;
  }

  /**
   * Create a signal from raw content
   */
  protected createSignal(
    content: string,
    metadata?: Record<string, any>
  ): Signal {
    const signal: Signal = {
      signalId: nanoid(),
      modality: this.modality,
      timestamp: Date.now(),
      content,
      metadata,
      hash: this.hashContent(content),
    };

    this.signals.push(signal);

    logger.debug('Signal captured', {
      signalId: signal.signalId,
      modality: this.modality,
      observerId: this.observerId,
      contentLength: content.length,
    });

    return signal;
  }

  /**
   * Hash signal content using SHA-256
   */
  protected hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
