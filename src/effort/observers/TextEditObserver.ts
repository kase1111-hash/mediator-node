import { SignalObserver } from './SignalObserver';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { logger } from '../../utils/logger';

/**
 * Observes text edit events (file changes) as signals
 */
export class TextEditObserver extends SignalObserver {
  private watcher?: chokidar.FSWatcher;
  private watchPaths: string[];
  private ignorePatterns: string[];

  constructor(
    observerId: string,
    watchPaths: string[] = [process.cwd()],
    ignorePatterns: string[] = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/*.log',
    ]
  ) {
    super(observerId, 'text_edit');
    this.watchPaths = watchPaths;
    this.ignorePatterns = ignorePatterns;
  }

  /**
   * Start watching for file changes
   */
  public start(): void {
    if (this.isObserving) {
      logger.warn('TextEditObserver already observing');
      return;
    }

    this.watcher = chokidar.watch(this.watchPaths, {
      ignored: this.ignorePatterns,
      persistent: true,
      ignoreInitial: true, // Don't fire events for existing files
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (filePath: string) => this.onFileChange('add', filePath))
      .on('change', (filePath: string) => this.onFileChange('change', filePath))
      .on('unlink', (filePath: string) => this.onFileChange('delete', filePath));

    this.isObserving = true;

    logger.info('TextEditObserver started', {
      observerId: this.observerId,
      watchPaths: this.watchPaths,
    });
  }

  /**
   * Stop watching for file changes
   */
  public stop(): void {
    if (!this.isObserving) {
      return;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }

    this.isObserving = false;

    logger.info('TextEditObserver stopped', {
      observerId: this.observerId,
      signalsCaptured: this.signals.length,
    });
  }

  /**
   * Handle file change events
   */
  private onFileChange(
    eventType: 'add' | 'change' | 'delete',
    filePath: string
  ): void {
    try {
      const relativePath = path.relative(process.cwd(), filePath);
      let content: string;

      if (eventType === 'delete') {
        content = `[FILE DELETED: ${relativePath}]`;
      } else {
        try {
          // Read file content
          const fileContent = fs.readFileSync(filePath, 'utf-8');

          // Limit content size for very large files
          const maxSize = 100000; // 100KB
          if (fileContent.length > maxSize) {
            content = `[FILE ${eventType.toUpperCase()}: ${relativePath}]\n[Content truncated: ${fileContent.length} bytes]\n${fileContent.substring(0, maxSize)}...`;
          } else {
            content = `[FILE ${eventType.toUpperCase()}: ${relativePath}]\n${fileContent}`;
          }
        } catch (readError) {
          content = `[FILE ${eventType.toUpperCase()}: ${relativePath}]\n[Error reading file: ${readError}]`;
        }
      }

      this.createSignal(content, {
        eventType,
        filePath: relativePath,
        absolutePath: filePath,
      });
    } catch (error) {
      logger.error('Error processing file change', {
        observerId: this.observerId,
        eventType,
        filePath,
        error,
      });
    }
  }

  /**
   * Get statistics including file-specific metrics
   */
  public getStats() {
    const baseStats = super.getStats();
    const fileChanges = this.signals.reduce(
      (acc, signal) => {
        const eventType = signal.metadata?.eventType || 'unknown';
        acc[eventType] = (acc[eventType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      ...baseStats,
      fileChanges,
    };
  }
}
