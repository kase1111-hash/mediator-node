/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by tracking operation failures and
 * temporarily blocking requests when failure threshold is exceeded.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit broken, requests fail fast without attempting operation
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */

import { logger } from './logger';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms before attempting recovery (default: 30000) */
  resetTimeoutMs: number;
  /** Number of successful calls in half-open to close circuit (default: 2) */
  successThreshold: number;
  /** Name for logging purposes */
  name: string;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  totalFailures: number;
  totalSuccesses: number;
  consecutiveFailures: number;
}

/**
 * Circuit breaker error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public readonly circuitName: string,
    public readonly remainingTimeMs: number
  ) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private halfOpenSuccesses = 0;

  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeoutMs: config.resetTimeoutMs ?? 30000,
      successThreshold: config.successThreshold ?? 2,
      name: config.name,
    };
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we should attempt the operation
    if (!this.canExecute()) {
      const remainingTime = this.getRemainingResetTime();
      throw new CircuitOpenError(
        `Circuit breaker '${this.config.name}' is open. Retry after ${remainingTime}ms`,
        this.config.name,
        remainingTime
      );
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Check if operation can be executed
   */
  private canExecute(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      // Check if reset timeout has passed
      if (this.shouldAttemptReset()) {
        this.transitionTo('half_open');
        return true;
      }
      return false;
    }

    // half_open state - allow request to test recovery
    return true;
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    return Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs;
  }

  /**
   * Get remaining time before reset attempt
   */
  private getRemainingResetTime(): number {
    if (!this.lastFailureTime) return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.resetTimeoutMs - elapsed);
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.totalSuccesses++;
    this.consecutiveFailures = 0;

    if (this.state === 'half_open') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      this.failures = 0;
    }

    this.successes++;
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: unknown): void {
    this.lastFailureTime = Date.now();
    this.totalFailures++;
    this.consecutiveFailures++;
    this.failures++;

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (this.state === 'half_open') {
      // Any failure in half-open immediately opens circuit
      logger.warn(`Circuit breaker '${this.config.name}' reopening after half-open failure`, {
        error: errorMessage,
      });
      this.transitionTo('open');
    } else if (this.state === 'closed') {
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        logger.warn(`Circuit breaker '${this.config.name}' opening after ${this.consecutiveFailures} failures`, {
          error: errorMessage,
          threshold: this.config.failureThreshold,
        });
        this.transitionTo('open');
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'closed') {
      this.failures = 0;
      this.halfOpenSuccesses = 0;
      logger.info(`Circuit breaker '${this.config.name}' closed - service recovered`, {
        previousState: oldState,
      });
    } else if (newState === 'half_open') {
      this.halfOpenSuccesses = 0;
      logger.info(`Circuit breaker '${this.config.name}' half-open - testing recovery`, {
        previousState: oldState,
      });
    } else if (newState === 'open') {
      logger.warn(`Circuit breaker '${this.config.name}' opened - blocking requests`, {
        previousState: oldState,
        resetTimeoutMs: this.config.resetTimeoutMs,
      });
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Check if circuit is allowing requests
   */
  isAvailable(): boolean {
    return this.state === 'closed' || (this.state === 'open' && this.shouldAttemptReset());
  }

  /**
   * Manually reset the circuit breaker (for testing or manual intervention)
   */
  reset(): void {
    logger.info(`Circuit breaker '${this.config.name}' manually reset`);
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
  }

  /**
   * Force open the circuit (for maintenance or known outages)
   */
  forceOpen(): void {
    logger.warn(`Circuit breaker '${this.config.name}' force opened`);
    this.transitionTo('open');
    this.lastFailureTime = Date.now();
  }
}
