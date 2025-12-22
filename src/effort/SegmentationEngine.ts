import { Signal, EffortSegment, SegmentStatus } from '../types';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger';

/**
 * Strategy for segmentation
 */
export type SegmentationStrategy = 'time_window' | 'activity_boundary' | 'hybrid';

/**
 * Segmentation configuration
 */
export interface SegmentationConfig {
  strategy: SegmentationStrategy;
  timeWindowMinutes?: number; // For time_window and hybrid strategies
  activityGapMinutes?: number; // For activity_boundary and hybrid strategies
}

/**
 * Groups signals into effort segments
 * Implements deterministic segmentation rules
 */
export class SegmentationEngine {
  private config: SegmentationConfig;
  private activeSegment?: EffortSegment;
  private completedSegments: EffortSegment[] = [];

  constructor(config: SegmentationConfig) {
    this.config = {
      timeWindowMinutes: 30,
      activityGapMinutes: 10,
      ...config,
    };

    logger.info('SegmentationEngine initialized', {
      strategy: this.config.strategy,
      timeWindowMinutes: this.config.timeWindowMinutes,
      activityGapMinutes: this.config.activityGapMinutes,
    });
  }

  /**
   * Process signals and create segments
   */
  public processSignals(signals: Signal[]): EffortSegment[] {
    if (signals.length === 0) {
      return [];
    }

    // Sort signals by timestamp
    const sortedSignals = [...signals].sort((a, b) => a.timestamp - b.timestamp);

    const segments: EffortSegment[] = [];

    switch (this.config.strategy) {
      case 'time_window':
        return this.segmentByTimeWindow(sortedSignals);
      case 'activity_boundary':
        return this.segmentByActivityBoundary(sortedSignals);
      case 'hybrid':
        return this.segmentByHybrid(sortedSignals);
      default:
        logger.error('Unknown segmentation strategy', {
          strategy: this.config.strategy,
        });
        return segments;
    }
  }

  /**
   * Segment by fixed time windows
   */
  private segmentByTimeWindow(signals: Signal[]): EffortSegment[] {
    const windowMs = (this.config.timeWindowMinutes || 30) * 60 * 1000;
    const segments: EffortSegment[] = [];

    let currentWindowStart = signals[0].timestamp;
    let currentWindowSignals: Signal[] = [];

    for (const signal of signals) {
      // Check if signal is within current window
      if (signal.timestamp < currentWindowStart + windowMs) {
        currentWindowSignals.push(signal);
      } else {
        // Create segment for completed window
        if (currentWindowSignals.length > 0) {
          segments.push(this.createSegment(
            currentWindowSignals,
            'time_window'
          ));
        }

        // Start new window
        currentWindowStart = signal.timestamp;
        currentWindowSignals = [signal];
      }
    }

    // Add remaining signals as final segment
    if (currentWindowSignals.length > 0) {
      segments.push(this.createSegment(currentWindowSignals, 'time_window'));
    }

    logger.debug('Segmentation by time window complete', {
      totalSignals: signals.length,
      totalSegments: segments.length,
      windowMinutes: this.config.timeWindowMinutes,
    });

    return segments;
  }

  /**
   * Segment by activity boundaries (gaps in activity)
   */
  private segmentByActivityBoundary(signals: Signal[]): EffortSegment[] {
    const gapMs = (this.config.activityGapMinutes || 10) * 60 * 1000;
    const segments: EffortSegment[] = [];

    let currentSegmentSignals: Signal[] = [signals[0]];
    let lastSignalTime = signals[0].timestamp;

    for (let i = 1; i < signals.length; i++) {
      const signal = signals[i];
      const gap = signal.timestamp - lastSignalTime;

      if (gap > gapMs) {
        // Gap detected, create segment
        segments.push(this.createSegment(
          currentSegmentSignals,
          'activity_boundary'
        ));

        // Start new segment
        currentSegmentSignals = [signal];
      } else {
        currentSegmentSignals.push(signal);
      }

      lastSignalTime = signal.timestamp;
    }

    // Add remaining signals as final segment
    if (currentSegmentSignals.length > 0) {
      segments.push(this.createSegment(
        currentSegmentSignals,
        'activity_boundary'
      ));
    }

    logger.debug('Segmentation by activity boundary complete', {
      totalSignals: signals.length,
      totalSegments: segments.length,
      gapMinutes: this.config.activityGapMinutes,
    });

    return segments;
  }

  /**
   * Hybrid segmentation: use both time windows and activity boundaries
   * Segments are split when either condition is met
   */
  private segmentByHybrid(signals: Signal[]): EffortSegment[] {
    const windowMs = (this.config.timeWindowMinutes || 30) * 60 * 1000;
    const gapMs = (this.config.activityGapMinutes || 10) * 60 * 1000;
    const segments: EffortSegment[] = [];

    let currentWindowStart = signals[0].timestamp;
    let currentSegmentSignals: Signal[] = [signals[0]];
    let lastSignalTime = signals[0].timestamp;

    for (let i = 1; i < signals.length; i++) {
      const signal = signals[i];
      const gap = signal.timestamp - lastSignalTime;
      const timeInWindow = signal.timestamp - currentWindowStart;

      // Split if either condition is met
      if (gap > gapMs || timeInWindow >= windowMs) {
        // Create segment
        segments.push(this.createSegment(currentSegmentSignals, 'hybrid'));

        // Start new segment
        currentWindowStart = signal.timestamp;
        currentSegmentSignals = [signal];
      } else {
        currentSegmentSignals.push(signal);
      }

      lastSignalTime = signal.timestamp;
    }

    // Add remaining signals as final segment
    if (currentSegmentSignals.length > 0) {
      segments.push(this.createSegment(currentSegmentSignals, 'hybrid'));
    }

    logger.debug('Segmentation by hybrid strategy complete', {
      totalSignals: signals.length,
      totalSegments: segments.length,
      windowMinutes: this.config.timeWindowMinutes,
      gapMinutes: this.config.activityGapMinutes,
    });

    return segments;
  }

  /**
   * Create a segment from signals
   */
  private createSegment(
    signals: Signal[],
    segmentationRule: string
  ): EffortSegment {
    if (signals.length === 0) {
      throw new Error('Cannot create segment with no signals');
    }

    const segment: EffortSegment = {
      segmentId: nanoid(),
      startTime: signals[0].timestamp,
      endTime: signals[signals.length - 1].timestamp,
      signals: [...signals],
      status: 'complete',
      segmentationRule,
    };

    logger.debug('Segment created', {
      segmentId: segment.segmentId,
      signalCount: signals.length,
      duration: segment.endTime - segment.startTime,
      segmentationRule,
    });

    return segment;
  }

  /**
   * Start a new active segment
   */
  public startSegment(humanMarker?: string): void {
    if (this.activeSegment) {
      logger.warn('Active segment already exists, completing it first');
      this.completeActiveSegment();
    }

    this.activeSegment = {
      segmentId: nanoid(),
      startTime: Date.now(),
      endTime: Date.now(),
      signals: [],
      status: 'active',
      humanMarker,
      segmentationRule: humanMarker ? 'human_marker' : this.config.strategy,
    };

    logger.info('New segment started', {
      segmentId: this.activeSegment.segmentId,
      humanMarker,
    });
  }

  /**
   * Add signal to active segment
   */
  public addToActiveSegment(signal: Signal): void {
    if (!this.activeSegment) {
      this.startSegment();
    }

    this.activeSegment!.signals.push(signal);
    this.activeSegment!.endTime = signal.timestamp;

    logger.debug('Signal added to active segment', {
      segmentId: this.activeSegment!.segmentId,
      signalCount: this.activeSegment!.signals.length,
    });
  }

  /**
   * Complete the active segment
   */
  public completeActiveSegment(): EffortSegment | null {
    if (!this.activeSegment) {
      logger.warn('No active segment to complete');
      return null;
    }

    if (this.activeSegment.signals.length === 0) {
      logger.warn('Active segment has no signals, discarding');
      this.activeSegment = undefined;
      return null;
    }

    this.activeSegment.status = 'complete';
    this.completedSegments.push(this.activeSegment);

    const completed = this.activeSegment;
    this.activeSegment = undefined;

    logger.info('Segment completed', {
      segmentId: completed.segmentId,
      signalCount: completed.signals.length,
      duration: completed.endTime - completed.startTime,
    });

    return completed;
  }

  /**
   * Get the active segment
   */
  public getActiveSegment(): EffortSegment | undefined {
    return this.activeSegment ? { ...this.activeSegment } : undefined;
  }

  /**
   * Get all completed segments
   */
  public getCompletedSegments(): EffortSegment[] {
    return [...this.completedSegments];
  }

  /**
   * Clear all segments
   */
  public clearSegments(): void {
    this.activeSegment = undefined;
    this.completedSegments = [];

    logger.info('All segments cleared');
  }

  /**
   * Get statistics
   */
  public getStats(): {
    strategy: SegmentationStrategy;
    activeSegment: boolean;
    completedSegments: number;
    totalSignalsProcessed: number;
  } {
    const totalSignals = this.completedSegments.reduce(
      (sum, segment) => sum + segment.signals.length,
      0
    );

    return {
      strategy: this.config.strategy,
      activeSegment: this.activeSegment !== undefined,
      completedSegments: this.completedSegments.length,
      totalSignalsProcessed: totalSignals,
    };
  }
}
