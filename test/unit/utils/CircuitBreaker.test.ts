import { CircuitBreaker, CircuitOpenError } from '../../../src/utils/circuit-breaker';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

const succeed = <T>(value: T) => () => Promise.resolve(value);
const fail = (message = 'boom') => () => Promise.reject(new Error(message));

/** Run a failing operation through the breaker, swallowing the expected rejection. */
async function recordFailure(breaker: CircuitBreaker, message = 'boom'): Promise<void> {
  await expect(breaker.execute(fail(message))).rejects.toThrow(message);
}

async function recordFailures(breaker: CircuitBreaker, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await recordFailure(breaker);
  }
}

describe('CircuitBreaker', () => {
  const START = new Date('2026-01-01T00:00:00Z').getTime();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(START);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('closed state', () => {
    it('starts closed with empty stats', () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      expect(breaker.getState()).toBe('closed');
      expect(breaker.isAvailable()).toBe(true);
      expect(breaker.getStats()).toEqual({
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailureTime: null,
        lastSuccessTime: null,
        totalFailures: 0,
        totalSuccesses: 0,
        consecutiveFailures: 0,
      });
    });

    it('passes the operation result through and records the success', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      await expect(breaker.execute(succeed({ ok: 1 }))).resolves.toEqual({ ok: 1 });

      expect(breaker.getStats()).toMatchObject({
        state: 'closed',
        successes: 1,
        totalSuccesses: 1,
        lastSuccessTime: START,
      });
    });

    it('rethrows the original error and records the failure', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });
      const error = new Error('upstream down');

      await expect(breaker.execute(() => Promise.reject(error))).rejects.toBe(error);

      expect(breaker.getStats()).toMatchObject({
        state: 'closed',
        failures: 1,
        consecutiveFailures: 1,
        totalFailures: 1,
        lastFailureTime: START,
      });
    });

    it('rethrows non-Error rejection values unchanged', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1 });

      await expect(breaker.execute(() => Promise.reject('plain string'))).rejects.toBe('plain string');

      expect(breaker.getState()).toBe('open');
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("'test' opening after 1 failures"),
        expect.objectContaining({ error: 'Unknown error', threshold: 1 })
      );
    });

    it('stays closed below the failure threshold', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3 });

      await recordFailures(breaker, 2);

      expect(breaker.getState()).toBe('closed');
      expect(breaker.isAvailable()).toBe(true);
    });

    it('opens once consecutive failures reach the threshold', async () => {
      const breaker = new CircuitBreaker({ name: 'chain', failureThreshold: 3 });

      await recordFailures(breaker, 3);

      expect(breaker.getState()).toBe('open');
      expect(breaker.isAvailable()).toBe(false);
      expect(breaker.getStats()).toMatchObject({ consecutiveFailures: 3, totalFailures: 3 });
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("'chain' opening after 3 failures"),
        expect.objectContaining({ error: 'boom', threshold: 3 })
      );
    });

    it('defaults to a threshold of 5 failures', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      await recordFailures(breaker, 4);
      expect(breaker.getState()).toBe('closed');

      await recordFailure(breaker);
      expect(breaker.getState()).toBe('open');
    });

    it('resets the failure count on success so non-consecutive failures do not open', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3 });

      await recordFailures(breaker, 2);
      await breaker.execute(succeed('ok'));

      expect(breaker.getStats()).toMatchObject({ failures: 0, consecutiveFailures: 0 });

      await recordFailures(breaker, 2);
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getStats().totalFailures).toBe(4);
    });
  });

  describe('open state', () => {
    it('fails fast with CircuitOpenError without invoking the operation', async () => {
      const breaker = new CircuitBreaker({ name: 'chain', failureThreshold: 1, resetTimeoutMs: 10_000 });
      await recordFailure(breaker);
      const operation = jest.fn().mockResolvedValue('should not run');

      const error = await breaker.execute(operation).catch((e: unknown) => e);

      expect(operation).not.toHaveBeenCalled();
      expect(error).toBeInstanceOf(CircuitOpenError);
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        name: 'CircuitOpenError',
        circuitName: 'chain',
        remainingTimeMs: 10_000,
        message: "Circuit breaker 'chain' is open. Retry after 10000ms",
      });
    });

    it('does not count fast-failed calls as operation failures', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1 });
      await recordFailure(breaker);

      await expect(breaker.execute(succeed('x'))).rejects.toBeInstanceOf(CircuitOpenError);
      await expect(breaker.execute(succeed('x'))).rejects.toBeInstanceOf(CircuitOpenError);

      expect(breaker.getStats()).toMatchObject({ totalFailures: 1, totalSuccesses: 0 });
    });

    it('reports a decreasing remaining time as the reset timeout elapses', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 10_000 });
      await recordFailure(breaker);

      jest.advanceTimersByTime(4_000);

      await expect(breaker.execute(succeed('x'))).rejects.toMatchObject({ remainingTimeMs: 6_000 });
    });

    it('stays open until the reset timeout has fully elapsed', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 10_000 });
      await recordFailure(breaker);

      jest.advanceTimersByTime(9_999);

      expect(breaker.isAvailable()).toBe(false);
      await expect(breaker.execute(succeed('x'))).rejects.toMatchObject({ remainingTimeMs: 1 });
      expect(breaker.getState()).toBe('open');
    });

    it('becomes available once the reset timeout elapses', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 10_000 });
      await recordFailure(breaker);

      jest.advanceTimersByTime(10_000);

      expect(breaker.isAvailable()).toBe(true);
    });

    it('defaults to a 30 second reset timeout', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1 });
      await recordFailure(breaker);

      jest.advanceTimersByTime(29_999);
      expect(breaker.isAvailable()).toBe(false);

      jest.advanceTimersByTime(1);
      expect(breaker.isAvailable()).toBe(true);
    });

    it('keeps the circuit open when in-flight calls fail after it has opened', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1 });

      const results = await Promise.allSettled([
        breaker.execute(fail('first')),
        breaker.execute(fail('second')),
      ]);

      expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
      expect(breaker.getState()).toBe('open');
      expect(breaker.getStats()).toMatchObject({ totalFailures: 2, consecutiveFailures: 2 });
    });
  });

  describe('half-open state', () => {
    async function openAndWait(breaker: CircuitBreaker, resetTimeoutMs: number): Promise<void> {
      await recordFailure(breaker);
      expect(breaker.getState()).toBe('open');
      jest.advanceTimersByTime(resetTimeoutMs);
    }

    it('lets a trial request through after the reset timeout', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 1_000 });
      await openAndWait(breaker, 1_000);
      const operation = jest.fn().mockResolvedValue('recovered');

      await expect(breaker.execute(operation)).resolves.toBe('recovered');

      expect(operation).toHaveBeenCalledTimes(1);
      expect(mockedLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('half-open - testing recovery'),
        { previousState: 'open' }
      );
    });

    it('requires successThreshold successes (default 2) before closing', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 1_000 });
      await openAndWait(breaker, 1_000);

      await breaker.execute(succeed('one'));
      expect(breaker.getState()).toBe('half_open');
      // half_open admits trial requests, so callers gating on isAvailable() must not skip work
      expect(breaker.isAvailable()).toBe(true);

      await breaker.execute(succeed('two'));
      expect(breaker.getState()).toBe('closed');
      expect(breaker.isAvailable()).toBe(true);
      expect(breaker.getStats()).toMatchObject({ failures: 0, consecutiveFailures: 0 });
      expect(mockedLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('closed - service recovered'),
        { previousState: 'half_open' }
      );
    });

    it('closes after a single success when successThreshold is 1', async () => {
      const breaker = new CircuitBreaker({
        name: 'test',
        failureThreshold: 1,
        resetTimeoutMs: 1_000,
        successThreshold: 1,
      });
      await openAndWait(breaker, 1_000);

      await breaker.execute(succeed('ok'));

      expect(breaker.getState()).toBe('closed');
    });

    it('reopens immediately on a failure, regardless of the failure threshold', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 3, resetTimeoutMs: 1_000 });
      await recordFailures(breaker, 3);
      jest.advanceTimersByTime(1_000);

      await breaker.execute(succeed('one'));
      expect(breaker.getState()).toBe('half_open');

      await recordFailure(breaker, 'still broken');

      expect(breaker.getState()).toBe('open');
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('reopening after half-open failure'),
        { error: 'still broken' }
      );
    });

    it('starts a fresh reset window after reopening', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 1_000 });
      await openAndWait(breaker, 1_000);
      await recordFailure(breaker);

      await expect(breaker.execute(succeed('x'))).rejects.toMatchObject({ remainingTimeMs: 1_000 });

      jest.advanceTimersByTime(1_000);
      await expect(breaker.execute(succeed('x'))).resolves.toBe('x');
    });

    it('does not carry half-open successes over into the next recovery attempt', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 1, resetTimeoutMs: 1_000 });
      await openAndWait(breaker, 1_000);
      await breaker.execute(succeed('one'));
      await recordFailure(breaker);
      jest.advanceTimersByTime(1_000);

      await breaker.execute(succeed('one again'));

      expect(breaker.getState()).toBe('half_open');
    });
  });

  describe('getStats', () => {
    it('returns a snapshot that is not affected by later activity', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });
      const before = breaker.getStats();

      await breaker.execute(succeed('ok'));

      expect(before.totalSuccesses).toBe(0);
      expect(breaker.getStats().totalSuccesses).toBe(1);
    });

    it('tracks last success and failure times', async () => {
      const breaker = new CircuitBreaker({ name: 'test' });

      await breaker.execute(succeed('ok'));
      jest.advanceTimersByTime(500);
      await recordFailure(breaker);

      expect(breaker.getStats()).toMatchObject({
        lastSuccessTime: START,
        lastFailureTime: START + 500,
      });
    });
  });

  describe('reset', () => {
    it('closes an open circuit and clears the failure counters', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 2 });
      await breaker.execute(succeed('ok'));
      await recordFailures(breaker, 2);
      expect(breaker.getState()).toBe('open');

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.isAvailable()).toBe(true);
      expect(breaker.getStats()).toMatchObject({
        state: 'closed',
        failures: 0,
        successes: 0,
        consecutiveFailures: 0,
      });
      expect(mockedLogger.info).toHaveBeenCalledWith("Circuit breaker 'test' manually reset");
      await expect(breaker.execute(succeed('works'))).resolves.toBe('works');
    });

    it('requires a full threshold of new failures to reopen after a reset', async () => {
      const breaker = new CircuitBreaker({ name: 'test', failureThreshold: 2 });
      await recordFailures(breaker, 2);
      breaker.reset();

      await recordFailure(breaker);

      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('forceOpen', () => {
    it('blocks requests immediately for a full reset timeout', async () => {
      const breaker = new CircuitBreaker({ name: 'maint', resetTimeoutMs: 5_000 });

      breaker.forceOpen();

      expect(breaker.getState()).toBe('open');
      expect(breaker.isAvailable()).toBe(false);
      await expect(breaker.execute(succeed('x'))).rejects.toMatchObject({
        circuitName: 'maint',
        remainingTimeMs: 5_000,
      });
      expect(mockedLogger.warn).toHaveBeenCalledWith("Circuit breaker 'maint' force opened");
    });

    it('allows a recovery trial once the reset timeout elapses', async () => {
      const breaker = new CircuitBreaker({ name: 'maint', resetTimeoutMs: 5_000, successThreshold: 1 });
      breaker.forceOpen();

      jest.advanceTimersByTime(5_000);

      await expect(breaker.execute(succeed('back'))).resolves.toBe('back');
      expect(breaker.getState()).toBe('closed');
    });

    it('is not closed by a straggling success from a call started before it was forced open', async () => {
      const breaker = new CircuitBreaker({ name: 'maint', successThreshold: 1 });
      let resolveOperation!: (value: string) => void;
      const inFlight = breaker.execute(
        () => new Promise<string>((resolve) => { resolveOperation = resolve; })
      );

      breaker.forceOpen();
      resolveOperation('late');

      await expect(inFlight).resolves.toBe('late');
      expect(breaker.getState()).toBe('open');
    });
  });
});
