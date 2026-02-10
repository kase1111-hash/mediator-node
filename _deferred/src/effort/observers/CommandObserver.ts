import { SignalObserver } from './SignalObserver';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../../utils/logger';

/**
 * Observes shell command execution as signals
 * Watches shell history file for new commands
 */
export class CommandObserver extends SignalObserver {
  private historyPath: string;
  private lastPosition: number = 0;
  private intervalId?: NodeJS.Timeout;
  private checkIntervalMs: number;

  constructor(
    observerId: string,
    historyPath?: string,
    checkIntervalMs: number = 1000
  ) {
    super(observerId, 'command');

    // Auto-detect shell history file if not provided
    if (!historyPath) {
      const shell = process.env.SHELL || '';
      const homeDir = os.homedir();

      if (shell.includes('bash')) {
        this.historyPath = path.join(homeDir, '.bash_history');
      } else if (shell.includes('zsh')) {
        this.historyPath = path.join(homeDir, '.zsh_history');
      } else {
        this.historyPath = path.join(homeDir, '.bash_history'); // Default fallback
      }
    } else {
      this.historyPath = historyPath;
    }

    this.checkIntervalMs = checkIntervalMs;
  }

  /**
   * Start observing shell commands
   */
  public start(): void {
    if (this.isObserving) {
      logger.warn('CommandObserver already observing');
      return;
    }

    // Check if history file exists
    if (!fs.existsSync(this.historyPath)) {
      logger.warn('Shell history file not found', {
        observerId: this.observerId,
        historyPath: this.historyPath,
      });
      // Don't fail, just won't capture anything
    } else {
      // Initialize last position to end of file
      try {
        const stats = fs.statSync(this.historyPath);
        this.lastPosition = stats.size;
      } catch (error) {
        logger.error('Error reading history file stats', {
          observerId: this.observerId,
          error,
        });
      }
    }

    // Start polling for new commands
    this.intervalId = setInterval(() => {
      this.checkForNewCommands();
    }, this.checkIntervalMs);

    this.isObserving = true;

    logger.info('CommandObserver started', {
      observerId: this.observerId,
      historyPath: this.historyPath,
      checkIntervalMs: this.checkIntervalMs,
    });
  }

  /**
   * Stop observing shell commands
   */
  public stop(): void {
    if (!this.isObserving) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.isObserving = false;

    logger.info('CommandObserver stopped', {
      observerId: this.observerId,
      signalsCaptured: this.signals.length,
    });
  }

  /**
   * Check for new commands in history file
   */
  private checkForNewCommands(): void {
    try {
      if (!fs.existsSync(this.historyPath)) {
        return;
      }

      const stats = fs.statSync(this.historyPath);
      const currentSize = stats.size;

      // Check if file has grown
      if (currentSize > this.lastPosition) {
        // Read new content
        const fd = fs.openSync(this.historyPath, 'r');
        const buffer = Buffer.alloc(currentSize - this.lastPosition);
        fs.readSync(fd, buffer, 0, buffer.length, this.lastPosition);
        fs.closeSync(fd);

        const newContent = buffer.toString('utf-8');
        const newCommands = newContent
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        // Create signals for each new command
        for (const command of newCommands) {
          // Skip zsh metadata lines
          if (command.startsWith(':')) {
            continue;
          }

          this.captureCommand(command);
        }

        this.lastPosition = currentSize;
      } else if (currentSize < this.lastPosition) {
        // History file was truncated or rotated
        logger.info('History file was truncated, resetting position', {
          observerId: this.observerId,
        });
        this.lastPosition = currentSize;
      }
    } catch (error) {
      logger.error('Error checking for new commands', {
        observerId: this.observerId,
        error,
      });
    }
  }

  /**
   * Capture a command as a signal
   */
  public captureCommand(command: string, metadata?: Record<string, any>): void {
    const content = `[COMMAND]\n${command}`;

    this.createSignal(content, {
      command,
      cwd: process.cwd(),
      ...metadata,
    });
  }

  /**
   * Get statistics including command-specific metrics
   */
  public getStats() {
    const baseStats = super.getStats();

    return {
      ...baseStats,
      historyPath: this.historyPath,
      totalCommands: this.signals.length,
    };
  }
}
