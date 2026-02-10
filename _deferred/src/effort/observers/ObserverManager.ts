import { SignalObserver } from './SignalObserver';
import { TextEditObserver } from './TextEditObserver';
import { CommandObserver } from './CommandObserver';
import { Signal, SignalModality } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Manages multiple signal observers
 * Coordinates observation across different modalities
 */
export class ObserverManager {
  private observers: Map<SignalModality, SignalObserver> = new Map();
  private observerId: string;

  constructor(observerId: string) {
    this.observerId = observerId;
  }

  /**
   * Add an observer for a specific modality
   */
  public addObserver(observer: SignalObserver): void {
    const modality = observer.getStats().modality;

    if (this.observers.has(modality)) {
      logger.warn('Observer for modality already exists, replacing', {
        observerId: this.observerId,
        modality,
      });
      const existing = this.observers.get(modality);
      if (existing?.isActive()) {
        existing.stop();
      }
    }

    this.observers.set(modality, observer);

    logger.info('Observer added', {
      observerId: this.observerId,
      modality,
    });
  }

  /**
   * Remove an observer for a specific modality
   */
  public removeObserver(modality: SignalModality): boolean {
    const observer = this.observers.get(modality);

    if (!observer) {
      return false;
    }

    if (observer.isActive()) {
      observer.stop();
    }

    this.observers.delete(modality);

    logger.info('Observer removed', {
      observerId: this.observerId,
      modality,
    });

    return true;
  }

  /**
   * Start all observers
   */
  public startAll(): void {
    for (const observer of this.observers.values()) {
      if (!observer.isActive()) {
        observer.start();
      }
    }

    logger.info('All observers started', {
      observerId: this.observerId,
      count: this.observers.size,
    });
  }

  /**
   * Stop all observers
   */
  public stopAll(): void {
    for (const observer of this.observers.values()) {
      if (observer.isActive()) {
        observer.stop();
      }
    }

    logger.info('All observers stopped', {
      observerId: this.observerId,
    });
  }

  /**
   * Get all signals from all observers
   */
  public getAllSignals(): Signal[] {
    const allSignals: Signal[] = [];

    for (const observer of this.observers.values()) {
      allSignals.push(...observer.getSignals());
    }

    // Sort by timestamp
    allSignals.sort((a, b) => a.timestamp - b.timestamp);

    return allSignals;
  }

  /**
   * Get signals within time range from all observers
   */
  public getSignalsInRange(startTime: number, endTime: number): Signal[] {
    const allSignals: Signal[] = [];

    for (const observer of this.observers.values()) {
      allSignals.push(...observer.getSignalsInRange(startTime, endTime));
    }

    // Sort by timestamp
    allSignals.sort((a, b) => a.timestamp - b.timestamp);

    return allSignals;
  }

  /**
   * Get signals by modality
   */
  public getSignalsByModality(modality: SignalModality): Signal[] {
    const observer = this.observers.get(modality);
    return observer ? observer.getSignals() : [];
  }

  /**
   * Clear all signals from all observers
   */
  public clearAllSignals(): void {
    for (const observer of this.observers.values()) {
      observer.clearSignals();
    }

    logger.info('All signals cleared', {
      observerId: this.observerId,
    });
  }

  /**
   * Clear signals before a specific timestamp
   */
  public clearSignalsBefore(timestamp: number): void {
    for (const observer of this.observers.values()) {
      observer.clearSignalsBefore(timestamp);
    }

    logger.info('Signals cleared before timestamp', {
      observerId: this.observerId,
      timestamp,
    });
  }

  /**
   * Get comprehensive statistics
   */
  public getStats(): {
    observerId: string;
    totalObservers: number;
    activeObservers: number;
    totalSignals: number;
    signalsByModality: Record<string, number>;
    observerStats: Array<ReturnType<SignalObserver['getStats']>>;
  } {
    const signalsByModality: Record<string, number> = {};
    const observerStats: Array<ReturnType<SignalObserver['getStats']>> = [];

    let totalSignals = 0;
    let activeObservers = 0;

    for (const observer of this.observers.values()) {
      const stats = observer.getStats();
      observerStats.push(stats);

      signalsByModality[stats.modality] = stats.totalSignals;
      totalSignals += stats.totalSignals;

      if (stats.isObserving) {
        activeObservers++;
      }
    }

    return {
      observerId: this.observerId,
      totalObservers: this.observers.size,
      activeObservers,
      totalSignals,
      signalsByModality,
      observerStats,
    };
  }

  /**
   * Create default observers based on configuration
   */
  public static createDefaultObservers(
    observerId: string,
    modalities: string[]
  ): ObserverManager {
    const manager = new ObserverManager(observerId);

    for (const modality of modalities) {
      switch (modality) {
        case 'text_edit':
          manager.addObserver(new TextEditObserver(observerId));
          break;
        case 'command':
          manager.addObserver(new CommandObserver(observerId));
          break;
        default:
          logger.warn('Unknown modality, skipping', { modality });
      }
    }

    return manager;
  }
}
