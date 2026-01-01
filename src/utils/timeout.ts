/**
 * Timeout Utilities
 *
 * Provides utilities for adding timeouts to async operations
 * to prevent hanging requests and improve system resilience.
 */

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly operationName: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap an async operation with a timeout
 *
 * @param operation - The async operation to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name for error messages
 * @returns The result of the operation
 * @throws TimeoutError if the operation exceeds the timeout
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string = 'Operation'
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new TimeoutError(
          `${operationName} timed out after ${timeoutMs}ms`,
          operationName,
          timeoutMs
        )
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([operation(), timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Create a timeout wrapper with default settings
 *
 * @param defaultTimeoutMs - Default timeout for all operations
 * @param defaultOperationName - Default operation name for errors
 * @returns A configured timeout wrapper function
 */
export function createTimeoutWrapper(
  defaultTimeoutMs: number,
  defaultOperationName: string = 'Operation'
) {
  return function <T>(
    operation: () => Promise<T>,
    timeoutMs?: number,
    operationName?: string
  ): Promise<T> {
    return withTimeout(
      operation,
      timeoutMs ?? defaultTimeoutMs,
      operationName ?? defaultOperationName
    );
  };
}

/**
 * Default timeout values for different operation types
 */
export const DEFAULT_TIMEOUTS = {
  /** Quick health check operations */
  healthCheck: 5000,
  /** Standard API requests */
  apiRequest: 10000,
  /** Operations that may take longer (e.g., LLM calls) */
  longRunning: 30000,
  /** Very long operations (e.g., consensus gathering) */
  extended: 60000,
} as const;
