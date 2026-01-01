/**
 * Promise.allSettled Result Utilities
 *
 * Helper functions for processing Promise.allSettled results
 * to provide better parallel error handling patterns.
 */

import { logger } from './logger';

/**
 * Extract fulfilled values from settled results, logging any rejections
 *
 * @param results - Array of settled results from Promise.allSettled
 * @param operationName - Name for logging context
 * @returns Array of fulfilled values (rejected results are filtered out)
 */
export function extractFulfilled<T>(
  results: PromiseSettledResult<T>[],
  operationName: string = 'Operation'
): T[] {
  const fulfilled: T[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      fulfilled.push(result.value);
    } else {
      logger.warn(`${operationName} at index ${index} rejected`, {
        reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  return fulfilled;
}

/**
 * Check if any results were rejected
 */
export function hasRejections<T>(results: PromiseSettledResult<T>[]): boolean {
  return results.some((result) => result.status === 'rejected');
}

/**
 * Get all rejection reasons from settled results
 */
export function getRejections<T>(
  results: PromiseSettledResult<T>[]
): { index: number; reason: unknown }[] {
  return results
    .map((result, index) => ({ result, index }))
    .filter(({ result }) => result.status === 'rejected')
    .map(({ result, index }) => ({
      index,
      reason: (result as PromiseRejectedResult).reason,
    }));
}

/**
 * Log all rejections from settled results
 */
export function logRejections<T>(
  results: PromiseSettledResult<T>[],
  operationName: string,
  logLevel: 'warn' | 'error' = 'warn'
): void {
  const rejections = getRejections(results);

  rejections.forEach(({ index, reason }) => {
    const message = `${operationName} at index ${index} failed`;
    const context = {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    };

    if (logLevel === 'error') {
      logger.error(message, context);
    } else {
      logger.warn(message, context);
    }
  });
}

/**
 * Process settled results with callbacks for fulfilled and rejected
 */
export function processSettledResults<T, R>(
  results: PromiseSettledResult<T>[],
  options: {
    onFulfilled: (value: T, index: number) => R;
    onRejected?: (reason: unknown, index: number) => R | undefined;
  }
): R[] {
  const processed: R[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      processed.push(options.onFulfilled(result.value, index));
    } else if (options.onRejected) {
      const handled = options.onRejected(result.reason, index);
      if (handled !== undefined) {
        processed.push(handled);
      }
    }
  });

  return processed;
}
