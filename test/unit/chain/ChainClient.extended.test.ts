/**
 * Extended ChainClient tests.
 *
 * Covers fallback paths, non-success responses, error handling, retry/backoff,
 * circuit-breaker integration and outbound secret protection. The HTTP layer
 * is the mocked axios instance returned by axios.create().
 */

import axios from 'axios';
import { ChainClient, ChainClientConfig } from '../../../src/chain/ChainClient';
import * as transformers from '../../../src/chain/transformers';
import {
  NatLangChainEntry,
  NatLangChainContract,
  challengeToEntry,
  settlementToContractProposal,
  settlementToEntry,
} from '../../../src/chain/transformers';
import { BurnTransaction, Challenge, Intent, ProposedSettlement } from '../../../src/types';
import { CircuitBreaker, CircuitOpenError } from '../../../src/utils/circuit-breaker';
import { generateSignature } from '../../../src/utils/crypto';
import { logger } from '../../../src/utils/logger';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

interface MockHttp {
  get: jest.Mock;
  post: jest.Mock;
  interceptors: { response: { use: jest.Mock } };
}

const PUBLIC_KEY = 'mediator-pub';
const PRIVATE_KEY = 'mediator-priv';
const BASE_CONFIG: ChainClientConfig = {
  chainEndpoint: 'http://chain.test:5000',
  mediatorPublicKey: PUBLIC_KEY,
  mediatorPrivateKey: PRIVATE_KEY,
};

// Secrets are assembled at runtime so the source file itself holds no
// credential-shaped literals.
const API_KEY_SECRET = 'sk-' + 'a1B2c3D4'.repeat(3); // sk- + 24 alphanumerics
const AWS_KEY_SECRET = 'AKIA' + 'ABCDEFGHIJKLMNOP'; // AKIA + 16 chars
const PEM_SECRET =
  '-----BEGIN ' + 'PRIVATE KEY-----\nMIIBVQIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7\n-----END ' + 'PRIVATE KEY-----';

// Fake timers that leave Node's internal queues alone so logger/stream
// internals keep working.
const FAKE_TIMER_OPTS = { doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] as const };

let http: MockHttp;

function createClient(overrides: Partial<ChainClientConfig> = {}): ChainClient {
  // A single attempt by default keeps failure-path tests free of backoff waits.
  return new ChainClient({ ...BASE_CONFIG, retryAttempts: 1, ...overrides });
}

/** Route mocked requests by URL. Unrouted URLs reject like a 404. */
function routeGet(routes: Record<string, (url: string) => any>): void {
  http.get.mockImplementation(async (url: string) => {
    const key = Object.keys(routes).find(prefix => url.startsWith(prefix));
    if (!key) throw new Error(`Request failed with status code 404 (${url})`);
    return routes[key](url);
  });
}

function routePost(routes: Record<string, (body: any) => any>): void {
  http.post.mockImplementation(async (url: string, body: any) => {
    const handler = routes[url];
    if (!handler) throw new Error(`Request failed with status code 404 (${url})`);
    return handler(body);
  });
}

const rejectWith = (message: string) => () => {
  throw new Error(message);
};

function entry(
  hash: string,
  overrides: Partial<NatLangChainEntry> = {},
  metadata: NatLangChainEntry['metadata'] = { is_contract: true }
): NatLangChainEntry {
  return {
    content: `Entry ${hash}: I am offering design services.`,
    author: `author-${hash}`,
    intent: 'offer design',
    timestamp: 1_000,
    ...overrides,
    metadata: { hash, ...metadata },
  };
}

const SETTLEMENT: ProposedSettlement = {
  id: 'settlement-42',
  intentHashA: 'hash-offer',
  intentHashB: 'hash-seek',
  reasoningTrace: 'Party A offers logo design that Party B is seeking.',
  proposedTerms: { price: 500, deliverables: ['Logo'], timelines: '1 week' },
  facilitationFee: 25,
  facilitationFeePercent: 5,
  modelIntegrityHash: 'model-hash',
  mediatorId: PUBLIC_KEY,
  timestamp: 1_700_000_000_000,
  status: 'proposed',
  acceptanceDeadline: 1_700_259_200_000,
  partyAAccepted: false,
  partyBAccepted: false,
};

const CHALLENGE: Challenge = {
  id: 'challenge-7',
  settlementId: 'settlement-42',
  challengerId: 'challenger-1',
  contradictionProof: 'The settlement requires weekend work, which Party A excluded.',
  paraphraseEvidence: 'Party A: "I cannot work weekends."',
  timestamp: 1_700_000_100_000,
  status: 'pending',
};

const INTENT: Intent = {
  hash: 'intent-hash-1',
  author: 'alice',
  prose: 'I need a logo for my bakery.',
  desires: ['logo design'],
  constraints: ['must be vector'],
  timestamp: 1_700_000_000_000,
  status: 'pending',
};

const BURN = {
  type: 'base_filing',
  author: 'alice',
  amount: 10,
  intentHash: 'intent-hash-1',
};

function lastPostBody(): any {
  const calls = http.post.mock.calls;
  return calls[calls.length - 1][1];
}

function loggedText(spy: jest.SpyInstance): string {
  return JSON.stringify(spy.mock.calls);
}

describe('ChainClient (extended)', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    http = {
      get: jest.fn(),
      post: jest.fn(),
      interceptors: { response: { use: jest.fn() } },
    };
    mockedAxios.create.mockReturnValue(http as any);

    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);
    debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => logger);
    jest.spyOn(logger, 'info').mockImplementation(() => logger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==========================================================================
  // Construction
  // ==========================================================================

  describe('construction', () => {
    it('creates the HTTP client with the endpoint, JSON headers and a 30s default timeout', () => {
      createClient();

      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'http://chain.test:5000',
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('uses a configured request timeout', () => {
      createClient({ timeout: 5000 });

      expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 5000 }));
    });

    it('registers a response interceptor that passes responses through untouched', () => {
      createClient();
      const [onFulfilled] = http.interceptors.response.use.mock.calls[0];
      const response = { status: 200, data: { ok: true } };

      expect(onFulfilled(response)).toBe(response);
    });

    it('logs failed responses with request details and re-rejects the original error', async () => {
      createClient();
      const [, onRejected] = http.interceptors.response.use.mock.calls[0];
      const error = Object.assign(new Error('Request failed with status code 503'), {
        config: { url: '/health', method: 'get' },
        response: { status: 503 },
      });

      await expect(onRejected(error)).rejects.toBe(error);
      expect(errorSpy).toHaveBeenCalledWith('Chain API error', {
        url: '/health',
        method: 'get',
        status: 503,
        message: 'Request failed with status code 503',
      });
    });

    it('logs network errors that carry no config or response', async () => {
      createClient();
      const [, onRejected] = http.interceptors.response.use.mock.calls[0];
      const error = new Error('socket hang up');

      await expect(onRejected(error)).rejects.toBe(error);
      expect(errorSpy).toHaveBeenCalledWith('Chain API error', {
        url: undefined,
        method: undefined,
        status: undefined,
        message: 'socket hang up',
      });
    });

    it('starts with a closed, available circuit', () => {
      const client = createClient();

      expect(client.isAvailable()).toBe(true);
      expect(client.getCircuitBreakerStats()).toMatchObject({
        state: 'closed',
        failures: 0,
        totalFailures: 0,
        totalSuccesses: 0,
        consecutiveFailures: 0,
      });
    });
  });

  // ==========================================================================
  // Retry / backoff
  // ==========================================================================

  describe('retry with exponential backoff', () => {
    it('retries up to 3 times by default, waiting 1000ms then 2000ms', async () => {
      jest.useFakeTimers(FAKE_TIMER_OPTS as any);
      const client = new ChainClient(BASE_CONFIG); // library defaults
      http.get
        .mockRejectedValueOnce(new Error('attempt 1 failed'))
        .mockRejectedValueOnce(new Error('attempt 2 failed'))
        .mockResolvedValueOnce({ status: 200, data: { blocks: 3 } });

      const result = client.getStats();
      await jest.advanceTimersByTimeAsync(0);
      expect(http.get).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(999);
      expect(http.get).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(http.get).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(1999);
      expect(http.get).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1);
      expect(http.get).toHaveBeenCalledTimes(3);

      await expect(result).resolves.toEqual({ blocks: 3 });
      expect(http.get).toHaveBeenCalledWith('/stats');
    });

    it('honours configured attempts/delay and rethrows the last error once attempts are exhausted', async () => {
      jest.useFakeTimers(FAKE_TIMER_OPTS as any);
      const client = createClient({ retryAttempts: 2, retryDelay: 50 });
      http.get
        .mockRejectedValueOnce(new Error('first failure'))
        .mockRejectedValueOnce(new Error('second failure'));

      const assertion = expect(client.getStats()).rejects.toThrow('second failure');
      await jest.advanceTimersByTimeAsync(49);
      expect(http.get).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      await assertion;

      expect(http.get).toHaveBeenCalledTimes(2);
      // No wait is scheduled after the final attempt.
      expect(jest.getTimerCount()).toBe(0);
    });

    it('does not retry when the first attempt succeeds', async () => {
      const client = createClient({ retryAttempts: 3 });
      http.get.mockResolvedValueOnce({ status: 200, data: { blocks: 1 } });

      await expect(client.getStats()).resolves.toEqual({ blocks: 1 });
      expect(http.get).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Circuit breaker
  // ==========================================================================

  describe('circuit breaker integration', () => {
    async function tripCircuit(client: ChainClient): Promise<void> {
      http.get.mockRejectedValue(new Error('chain down'));
      for (let i = 0; i < 5; i++) {
        await expect(client.getStats()).rejects.toThrow('chain down');
      }
    }

    it('counts one failure per operation, not per retry attempt', async () => {
      const client = createClient({ retryAttempts: 3, retryDelay: 1 });
      http.get.mockRejectedValue(new Error('chain down'));

      await expect(client.getStats()).rejects.toThrow('chain down');

      expect(http.get).toHaveBeenCalledTimes(3);
      expect(client.getCircuitBreakerStats()).toMatchObject({
        state: 'closed',
        totalFailures: 1,
        consecutiveFailures: 1,
      });
      expect(client.isAvailable()).toBe(true);
    });

    it('opens after 5 consecutive failed operations and then fails fast without calling the chain', async () => {
      const client = createClient();
      await tripCircuit(client);
      expect(http.get).toHaveBeenCalledTimes(5);

      expect(client.isAvailable()).toBe(false);
      expect(client.getCircuitBreakerStats()).toMatchObject({ state: 'open', consecutiveFailures: 5 });

      await expect(client.getStats()).rejects.toBeInstanceOf(CircuitOpenError);
      expect(http.get).toHaveBeenCalledTimes(5);
    });

    it('reports unhealthy from checkHealth without a request while the circuit is open', async () => {
      const client = createClient();
      await tripCircuit(client);
      http.get.mockClear();

      const health = await client.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.status).toEqual({ error: 'Circuit breaker open - chain unavailable' });
      expect(health.circuitBreaker.state).toBe('open');
      expect(http.get).not.toHaveBeenCalled();
    });

    it('resetCircuitBreaker closes the circuit so requests flow again', async () => {
      const client = createClient();
      await tripCircuit(client);

      client.resetCircuitBreaker();

      expect(client.isAvailable()).toBe(true);
      expect(client.getCircuitBreakerStats().state).toBe('closed');
      http.get.mockResolvedValueOnce({ status: 200, data: { blocks: 2 } });
      await expect(client.getStats()).resolves.toEqual({ blocks: 2 });
    });

    it('allows a trial request after the 30s reset timeout and closes after two successes', async () => {
      jest.useFakeTimers(FAKE_TIMER_OPTS as any);
      jest.setSystemTime(1_000_000);
      const client = createClient();
      await tripCircuit(client);

      jest.setSystemTime(1_000_000 + 29_999);
      expect(client.isAvailable()).toBe(false);

      jest.setSystemTime(1_000_000 + 30_000);
      expect(client.isAvailable()).toBe(true);

      http.get.mockReset();
      http.get.mockResolvedValue({ status: 200, data: { blocks: 9 } });

      await expect(client.getStats()).resolves.toEqual({ blocks: 9 });
      expect(client.getCircuitBreakerStats().state).toBe('half_open');

      await expect(client.getStats()).resolves.toEqual({ blocks: 9 });
      expect(client.getCircuitBreakerStats().state).toBe('closed');
    });
  });

  // ==========================================================================
  // Health & stats
  // ==========================================================================

  describe('checkHealth', () => {
    it('returns the /health payload and fresh circuit stats on success', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: { status: 'healthy', blocks: 4 } });

      const health = await client.checkHealth();

      expect(http.get).toHaveBeenCalledWith('/health');
      expect(health).toEqual({
        healthy: true,
        status: { status: 'healthy', blocks: 4 },
        circuitBreaker: expect.objectContaining({ state: 'closed', totalSuccesses: 1 }),
      });
    });

    it('reports the error message when the health request fails', async () => {
      const client = createClient();
      http.get.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      const health = await client.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.status).toEqual({ error: 'connect ECONNREFUSED' });
      expect(health.circuitBreaker).toMatchObject({ totalFailures: 1, consecutiveFailures: 1 });
    });

    it('reports "Unknown error" when the failure is not an Error instance', async () => {
      const client = createClient();
      http.get.mockRejectedValueOnce('plain string failure');

      const health = await client.checkHealth();

      expect(health).toMatchObject({ healthy: false, status: { error: 'Unknown error' } });
    });

    it('reports "Circuit breaker open" when the breaker rejects the health probe', async () => {
      const client = createClient();
      jest
        .spyOn(CircuitBreaker.prototype, 'execute')
        .mockRejectedValueOnce(new CircuitOpenError('open', 'chain-test', 1000));

      const health = await client.checkHealth();

      expect(health).toMatchObject({ healthy: false, status: { error: 'Circuit breaker open' } });
      expect(http.get).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Intent discovery
  // ==========================================================================

  describe('getPendingIntents', () => {
    it('reads an { entries } envelope from /pending without hitting search when entries exist', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({
        status: 200,
        data: { entries: [entry('h-offer'), entry('h-seek')] },
      });

      const intents = await client.getPendingIntents();

      expect(intents.map(i => i.hash)).toEqual(['h-offer', 'h-seek']);
      expect(http.get).toHaveBeenCalledTimes(1);
      expect(http.get).toHaveBeenCalledWith('/pending');
    });

    it('keeps only contract entries: is_contract, or contract_type offer/seek', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({
        status: 200,
        data: [
          entry('h-contract', {}, { is_contract: true }),
          entry('h-offer', {}, { contract_type: 'offer' }),
          entry('h-seek', {}, { contract_type: 'seek' }),
          entry('h-plain', {}, { validation_status: 'valid' }),
          { content: 'A note without metadata', author: 'carol', intent: 'note', timestamp: 5 },
        ],
      });

      const intents = await client.getPendingIntents();

      expect(intents.map(i => i.hash)).toEqual(['h-contract', 'h-offer', 'h-seek']);
    });

    it('does not return settlement proposals, responses or closures as pending intents', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({
        status: 200,
        data: [
          entry('h-offer', {}, { is_contract: true, contract_type: 'offer' }),
          entry('h-proposal', {}, { is_contract: true, contract_type: 'proposal' }),
          entry('h-response', {}, { is_contract: true, contract_type: 'response' }),
          entry('h-closure', {}, { is_contract: true, contract_type: 'closure' }),
        ],
      });

      const intents = await client.getPendingIntents();

      expect(intents.map(i => i.hash)).toEqual(['h-offer']);
    });

    it('skips a malformed entry without dropping the valid intents in the batch', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({
        status: 200,
        data: [
          entry('h-offer'),
          { author: 'x', intent: 'y', metadata: { is_contract: true } },
          entry('h-seek', {}, { contract_type: 'seek' }),
        ],
      });

      const intents = await client.getPendingIntents();

      expect(intents.map(i => i.hash)).toEqual(['h-offer', 'h-seek']);
    });

    it('falls back to /entries/search when /pending fails', async () => {
      const client = createClient();
      routeGet({
        '/pending': rejectWith('Request failed with status code 404'),
        '/entries/search': () => ({ status: 200, data: { results: [entry('h-found')] } }),
      });

      const intents = await client.getPendingIntents();

      expect(intents.map(i => i.hash)).toEqual(['h-found']);
      expect(http.get).toHaveBeenNthCalledWith(2, '/entries/search?');
    });

    it('falls back to /entries/search when /pending returns no entries', async () => {
      const client = createClient();
      routeGet({
        '/pending': () => ({ status: 200, data: {} }),
        '/entries/search': () => ({ status: 200, data: [entry('h-search')] }),
      });

      const intents = await client.getPendingIntents();

      expect(intents.map(i => i.hash)).toEqual(['h-search']);
    });

    it('falls back to /entries/search when /pending returns an empty body', async () => {
      const client = createClient();
      routeGet({
        '/pending': () => ({ status: 200, data: null }),
        '/entries/search': () => ({ status: 200, data: { entries: [entry('h-entries')] } }),
      });

      const intents = await client.getPendingIntents();

      expect(intents.map(i => i.hash)).toEqual(['h-entries']);
    });

    it('also searches with intent and status params when a keyword is given, merging results', async () => {
      const client = createClient();
      routeGet({
        '/pending': () => ({ status: 200, data: [entry('h-pending')] }),
        '/entries/search': () => ({ status: 200, data: { entries: [entry('h-keyword')] } }),
      });

      const intents = await client.getPendingIntents({ intent: 'logo design', status: 'open' });

      expect(intents.map(i => i.hash)).toEqual(['h-pending', 'h-keyword']);
      expect(http.get).toHaveBeenNthCalledWith(2, '/entries/search?intent=logo+design&status=open');
    });

    it('returns pending entries when the keyword search is unavailable', async () => {
      const client = createClient();
      routeGet({
        '/pending': () => ({ status: 200, data: [entry('h-pending')] }),
        '/entries/search': rejectWith('Request failed with status code 500'),
      });

      const intents = await client.getPendingIntents({ intent: 'logo' });

      expect(intents.map(i => i.hash)).toEqual(['h-pending']);
    });

    it('ignores search responses that carry no entry list', async () => {
      const client = createClient();
      routeGet({
        '/pending': () => ({ status: 200, data: [] }),
        '/entries/search': () => ({ status: 200, data: { total: 0 } }),
      });

      await expect(client.getPendingIntents()).resolves.toEqual([]);
    });

    it('ignores an empty search body', async () => {
      const client = createClient();
      routeGet({
        '/pending': () => ({ status: 200, data: [] }),
        '/entries/search': () => ({ status: 200, data: undefined }),
      });

      await expect(client.getPendingIntents()).resolves.toEqual([]);
    });

    it('returns [] when both /pending and search fail', async () => {
      const client = createClient();
      http.get.mockRejectedValue(new Error('chain down'));

      await expect(client.getPendingIntents()).resolves.toEqual([]);
      expect(http.get).toHaveBeenCalledTimes(2);
    });

    it('drops intents at or before `since`', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({
        status: 200,
        data: [
          entry('h-old', { timestamp: 1_000 }),
          entry('h-edge', { timestamp: 1_500 }),
          entry('h-new', { timestamp: 2_000 }),
        ],
      });

      const intents = await client.getPendingIntents({ since: 1_500 });

      expect(intents.map(i => i.hash)).toEqual(['h-new']);
    });

    it('caps the number of intents with `limit`', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({
        status: 200,
        data: [entry('h-1'), entry('h-2'), entry('h-3')],
      });

      const intents = await client.getPendingIntents({ limit: 2 });

      expect(intents.map(i => i.hash)).toEqual(['h-1', 'h-2']);
    });

    it('skips (with a warning) an entry whose transform fails unexpectedly instead of rejecting', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: [entry('h-1')] });
      jest.spyOn(transformers, 'entryToIntent').mockImplementation(() => {
        throw new Error('transform failed');
      });

      await expect(client.getPendingIntents()).resolves.toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        'Skipping chain entry that could not be converted to an intent',
        expect.objectContaining({ error: 'transform failed' })
      );
      expect(errorSpy).not.toHaveBeenCalledWith('Error fetching pending intents', expect.any(Object));
    });
  });

  describe('getIntent', () => {
    it('returns the semantic-search hit when its hash matches exactly', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: { results: [entry('h-target')] } });

      const intent = await client.getIntent('h-target');

      expect(http.post).toHaveBeenCalledWith('/search/semantic', {
        query: 'h-target',
        top_k: 1,
        field: 'both',
      });
      expect(intent?.hash).toBe('h-target');
      expect(intent?.author).toBe('author-h-target');
      expect(http.get).not.toHaveBeenCalled();
    });

    it('scans /chain blocks when the semantic hit has a different hash', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: { results: [entry('h-other')] } });
      http.get.mockResolvedValueOnce({
        status: 200,
        data: {
          blocks: [
            { index: 0, entries: [entry('h-genesis')] },
            { index: 1 }, // block without an entries list
            { index: 2, entries: [entry('h-unrelated'), entry('h-target')] },
          ],
        },
      });

      const intent = await client.getIntent('h-target');

      expect(http.get).toHaveBeenCalledWith('/chain');
      expect(intent?.hash).toBe('h-target');
    });

    it('scans /chain blocks when semantic search returns no results', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: {} });
      http.get.mockResolvedValueOnce({
        status: 200,
        data: { blocks: [{ index: 0, entries: [entry('h-target')] }] },
      });

      await expect(client.getIntent('h-target')).resolves.toMatchObject({ hash: 'h-target' });
    });

    it('returns null when the hash is not on the chain', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: { results: [] } });
      http.get.mockResolvedValueOnce({
        status: 200,
        data: { blocks: [{ index: 0, entries: [entry('h-a'), { content: 'x', author: 'y', intent: '' }] }] },
      });

      await expect(client.getIntent('h-missing')).resolves.toBeNull();
    });

    it('returns null when the chain response has no blocks', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: { results: [] } });
      http.get.mockResolvedValueOnce({ status: 200, data: {} });

      await expect(client.getIntent('h-missing')).resolves.toBeNull();
    });

    it('returns null and logs when the chain scan fails', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: { results: [] } });
      http.get.mockRejectedValueOnce(new Error('chain down'));

      await expect(client.getIntent('h-target')).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        'Error fetching intent by hash',
        expect.objectContaining({ hash: 'h-target' })
      );
    });
  });

  describe('submitIntent', () => {
    it('posts the intent as a validated, un-mined contract entry', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 201 });

      const result = await client.submitIntent(INTENT);

      expect(result).toEqual({ success: true, hash: 'intent-hash-1' });
      expect(http.post).toHaveBeenCalledWith(
        '/entry',
        expect.objectContaining({
          content: INTENT.prose,
          author: 'alice',
          intent: 'logo design',
          timestamp: INTENT.timestamp,
          validate: true,
          auto_mine: false,
          metadata: expect.objectContaining({
            hash: 'intent-hash-1',
            desires: ['logo design'],
            constraints: ['must be vector'],
            is_contract: true,
          }),
        })
      );
      expect(lastPostBody().metadata).not.toHaveProperty('burn_transaction');
    });

    it('attaches the burn transaction to the entry metadata', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200 });
      const burn: BurnTransaction = {
        id: 'burn-1',
        type: 'base_filing',
        author: 'alice',
        amount: 2,
        intentHash: 'intent-hash-1',
        timestamp: 1_700_000_000_000,
      };

      const result = await client.submitIntent(INTENT, burn);

      expect(result.success).toBe(true);
      expect(lastPostBody().metadata).toEqual(
        expect.objectContaining({ hash: 'intent-hash-1', burn_transaction: burn })
      );
    });

    it('reports an unexpected (non 200/201) status as a failure', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 202 });

      await expect(client.submitIntent(INTENT)).resolves.toEqual({
        success: false,
        error: 'Unexpected response status',
      });
    });

    it('uses a generic error message when the failure has none', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce({});

      await expect(client.submitIntent(INTENT)).resolves.toEqual({
        success: false,
        error: 'Failed to submit intent',
      });
    });
  });

  describe('getIntentsByAuthor', () => {
    it('URL-encodes the author and returns only contract entries', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({
        status: 200,
        data: {
          entries: [
            entry('h-contract'),
            { content: 'Just chatting', author: 'did:key/alice smith', intent: 'note' },
          ],
        },
      });

      const intents = await client.getIntentsByAuthor('did:key/alice smith');

      expect(http.get).toHaveBeenCalledWith('/entries/author/did%3Akey%2Falice%20smith');
      expect(intents.map(i => i.hash)).toEqual(['h-contract']);
    });

    it('accepts a bare array response', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: [entry('h-1'), entry('h-2')] });

      const intents = await client.getIntentsByAuthor('alice');

      expect(intents.map(i => i.hash)).toEqual(['h-1', 'h-2']);
    });

    it('returns [] when the response has no entries list', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: {} });

      await expect(client.getIntentsByAuthor('alice')).resolves.toEqual([]);
    });

    it('returns [] and logs when the request fails', async () => {
      const client = createClient();
      http.get.mockRejectedValueOnce(new Error('chain down'));

      await expect(client.getIntentsByAuthor('alice')).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(
        'Error fetching intents by author',
        expect.objectContaining({ author: 'alice' })
      );
    });
  });

  // ==========================================================================
  // Settlement / contract operations
  // ==========================================================================

  const OPEN_CONTRACT: NatLangChainContract = {
    contract_id: 'contract-1',
    offer_ref: 'hash-offer',
    seek_ref: 'hash-seek',
    proposal_content: 'Logo design for the bakery',
    facilitation_fee: 3,
    status: 'open',
    mediator_id: 'other-mediator',
    timestamp: 1_700_000_000_000,
    acceptance_deadline: 1_700_259_200_000,
  };

  describe('getOpenContracts', () => {
    it('requests open contracts and converts them to settlements', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: { contracts: [OPEN_CONTRACT] } });

      const settlements = await client.getOpenContracts();

      expect(http.get).toHaveBeenCalledWith('/contract/list', { params: { status: 'open' } });
      expect(settlements).toHaveLength(1);
      expect(settlements[0]).toMatchObject({
        id: 'contract-1',
        intentHashA: 'hash-offer',
        intentHashB: 'hash-seek',
        reasoningTrace: 'Logo design for the bakery',
        facilitationFee: 3,
        mediatorId: 'other-mediator',
        status: 'proposed',
      });
    });

    it('accepts a bare array response', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: [OPEN_CONTRACT, { ...OPEN_CONTRACT, contract_id: 'contract-2' }] });

      const settlements = await client.getOpenContracts();

      expect(settlements.map(s => s.id)).toEqual(['contract-1', 'contract-2']);
    });

    it('returns [] when the response has no contracts list', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: {} });

      await expect(client.getOpenContracts()).resolves.toEqual([]);
    });

    it('returns [] when the request fails', async () => {
      const client = createClient();
      http.get.mockRejectedValueOnce(new Error('chain down'));

      await expect(client.getOpenContracts()).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith('Error fetching open contracts', expect.any(Object));
    });
  });

  describe('getMatchCandidates', () => {
    const knownEntries: Record<string, NatLangChainEntry> = {
      'hash-offer': entry('hash-offer'),
      'hash-seek': entry('hash-seek', { content: 'I need a logo for my bakery.' }),
    };

    function routeChainLookups(matchResponse: any): void {
      routePost({
        '/contract/match': () => matchResponse,
        '/search/semantic': body => ({
          status: 200,
          data: { results: knownEntries[body.query] ? [knownEntries[body.query]] : [] },
        }),
      });
      http.get.mockResolvedValue({ status: 200, data: { blocks: [] } });
    }

    it('resolves both sides of each chain match into an alignment candidate', async () => {
      const client = createClient();
      routeChainLookups({
        status: 200,
        data: {
          matches: [
            { contract_id: 'c1', offer_ref: 'hash-offer', seek_ref: 'hash-seek', match_score: 0.9, facilitation_fee: 2.5 },
          ],
        },
      });

      const candidates = await client.getMatchCandidates('logo design', 3);

      expect(http.post).toHaveBeenCalledWith('/contract/match', { content: 'logo design', top_k: 3 });
      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        intentA: { hash: 'hash-offer' },
        intentB: { hash: 'hash-seek', prose: 'I need a logo for my bakery.' },
        similarityScore: 0.9,
        estimatedValue: 2.5,
        priority: 0.9,
        reason: 'chain-sourced match',
      });
    });

    it('defaults top_k to 5 and score/value to 0 when the match omits them', async () => {
      const client = createClient();
      routeChainLookups({
        status: 200,
        data: { matches: [{ offer_ref: 'hash-offer', seek_ref: 'hash-seek' }] },
      });

      const candidates = await client.getMatchCandidates('logo');

      expect(http.post).toHaveBeenCalledWith('/contract/match', { content: 'logo', top_k: 5 });
      expect(candidates[0]).toMatchObject({ similarityScore: 0, estimatedValue: 0, priority: 0 });
    });

    it('skips matches that lack a reference or whose intents cannot be found', async () => {
      const client = createClient();
      routeChainLookups({
        status: 200,
        data: {
          matches: [
            { contract_id: 'no-seek', offer_ref: 'hash-offer', match_score: 0.8 },
            { contract_id: 'no-offer', seek_ref: 'hash-seek', match_score: 0.8 },
            { contract_id: 'unknown-seek', offer_ref: 'hash-offer', seek_ref: 'hash-unknown', match_score: 0.8 },
            { contract_id: 'good', offer_ref: 'hash-offer', seek_ref: 'hash-seek', match_score: 0.7 },
          ],
        },
      });

      const candidates = await client.getMatchCandidates('logo');

      expect(candidates).toHaveLength(1);
      expect(candidates[0].similarityScore).toBe(0.7);
    });

    it('returns [] when the response carries no matches', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: {} });

      await expect(client.getMatchCandidates('logo')).resolves.toEqual([]);
    });

    it('returns [] when the match endpoint fails', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce(new Error('Request failed with status code 404'));

      await expect(client.getMatchCandidates('logo')).resolves.toEqual([]);
      expect(debugSpy).toHaveBeenCalledWith('Chain match candidates not available', {
        error: 'Request failed with status code 404',
      });
    });

    it('returns [] when the match endpoint fails with a non-Error value', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce('offline');

      await expect(client.getMatchCandidates('logo')).resolves.toEqual([]);
      expect(debugSpy).toHaveBeenCalledWith('Chain match candidates not available', { error: 'Unknown' });
    });
  });

  describe('submitSettlement', () => {
    describe('secret protection', () => {
      const cases: Array<[string, ProposedSettlement, string]> = [
        [
          'an API key in the reasoning trace',
          { ...SETTLEMENT, reasoningTrace: `Use ${API_KEY_SECRET} to call the escrow API.` },
          API_KEY_SECRET,
        ],
        [
          'a PEM private key in the proposed terms',
          { ...SETTLEMENT, proposedTerms: { ...SETTLEMENT.proposedTerms, customTerms: { signingKey: PEM_SECRET } } },
          'MIIBVQIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7',
        ],
        [
          'an AWS access key in the proposed terms',
          { ...SETTLEMENT, proposedTerms: { ...SETTLEMENT.proposedTerms, escrowReference: AWS_KEY_SECRET } },
          AWS_KEY_SECRET,
        ],
      ];

      it.each(cases)('blocks submission when the settlement contains %s', async (_label, settlement, secret) => {
        const client = createClient();

        const result = await client.submitSettlement(settlement);

        expect(result).toEqual({
          success: false,
          error: 'Settlement contains potential secrets — submission blocked',
        });
        expect(http.post).not.toHaveBeenCalled();
        expect(http.get).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
          'Secrets detected in settlement data — blocking submission',
          expect.objectContaining({ settlementId: 'settlement-42', security: true })
        );
        expect(loggedText(warnSpy)).not.toContain(secret);
      });
    });

    it('submits through /contract/propose when the endpoint accepts it', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 201 });

      await expect(client.submitSettlement(SETTLEMENT)).resolves.toEqual({ success: true });

      expect(http.post).toHaveBeenCalledTimes(1);
      expect(http.post).toHaveBeenCalledWith('/contract/propose', settlementToContractProposal(SETTLEMENT));
    });

    it('treats a 200 from /contract/propose as success', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200 });

      await expect(client.submitSettlement(SETTLEMENT)).resolves.toEqual({ success: true });
      expect(http.post).toHaveBeenCalledTimes(1);
    });

    it('falls back to a signed, validated /entry when /contract/propose fails', async () => {
      const client = createClient();
      routePost({
        '/contract/propose': rejectWith('Request failed with status code 404'),
        '/entry': () => ({ status: 201 }),
      });

      await expect(client.submitSettlement(SETTLEMENT)).resolves.toEqual({ success: true });

      const expectedEntry = settlementToEntry(SETTLEMENT, PUBLIC_KEY);
      expect(http.post).toHaveBeenNthCalledWith(2, '/entry', {
        ...expectedEntry,
        signature: generateSignature(expectedEntry.content, PRIVATE_KEY),
        validate: true,
      });
    });

    it('retries the /entry fallback before giving up', async () => {
      const client = createClient({ retryAttempts: 2, retryDelay: 1 });
      http.post
        .mockRejectedValueOnce(new Error('propose unavailable'))
        .mockRejectedValueOnce(new Error('transient entry failure'))
        .mockResolvedValueOnce({ status: 201 });

      await expect(client.submitSettlement(SETTLEMENT)).resolves.toEqual({ success: true });

      expect(http.post.mock.calls.map(c => c[0])).toEqual(['/contract/propose', '/entry', '/entry']);
    });

    it('reports an unexpected status from the /entry fallback', async () => {
      const client = createClient();
      routePost({
        '/contract/propose': rejectWith('Request failed with status code 404'),
        '/entry': () => ({ status: 202 }),
      });

      await expect(client.submitSettlement(SETTLEMENT)).resolves.toEqual({
        success: false,
        error: 'Unexpected response status',
      });
    });

    it('returns the fallback error when both endpoints fail', async () => {
      const client = createClient();
      routePost({
        '/contract/propose': rejectWith('Request failed with status code 404'),
        '/entry': rejectWith('entry rejected'),
      });

      await expect(client.submitSettlement(SETTLEMENT)).resolves.toEqual({
        success: false,
        error: 'entry rejected',
      });
    });

    it('uses a generic error message when the failure has none', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce(new Error('propose unavailable')).mockRejectedValueOnce({});

      await expect(client.submitSettlement(SETTLEMENT)).resolves.toEqual({
        success: false,
        error: 'Failed to submit settlement',
      });
    });
  });

  describe('getSettlementStatus', () => {
    it('searches for acceptance entries of the settlement', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: { results: [] } });

      await client.getSettlementStatus('S1');

      expect(http.post).toHaveBeenCalledWith('/search/semantic', {
        query: 'settlement S1 accept',
        top_k: 20,
        field: 'both',
      });
    });

    it('is accepted when both parties have accepted', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({
        status: 200,
        data: {
          results: [
            { content: 'A accepts', author: 'pa', metadata: { settlement_id: 'S1', party: 'A', accepted: true } },
            { content: 'B accepts', author: 'pb', metadata: { settlement_id: 'S1', party: 'B', accepted: true } },
          ],
        },
      });

      await expect(client.getSettlementStatus('S1')).resolves.toEqual({
        partyAAccepted: true,
        partyBAccepted: true,
        challenges: [],
        status: 'accepted',
      });
    });

    it('ignores other settlements, non-accepting entries and entries without metadata', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({
        status: 200,
        data: {
          results: [
            { content: 'other', author: 'pa', metadata: { settlement_id: 'S2', party: 'A', accepted: true } },
            { content: 'declined', author: 'pb', metadata: { settlement_id: 'S1', party: 'B', accepted: false } },
            { content: 'no metadata', author: 'x' },
            { content: 'other challenge', author: 'c', metadata: { settlement_id: 'S2', challenge_id: 'ch-x', status: 'upheld' } },
          ],
        },
      });

      await expect(client.getSettlementStatus('S1')).resolves.toEqual({
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
        status: 'proposed',
      });
    });

    it('collects challenges for the settlement, using the entry author and timestamp as defaults', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({
        status: 200,
        data: {
          results: [
            {
              content: '[CHALLENGE] minimal',
              author: 'entry-author',
              timestamp: 1234,
              metadata: { settlement_id: 'S1', challenge_id: 'ch-1' },
            },
            {
              content: '[CHALLENGE] full',
              author: 'entry-author',
              timestamp: 5678,
              metadata: {
                settlement_id: 'S1',
                challenge_id: 'ch-2',
                challenger_id: 'challenger-9',
                contradiction_proof: 'violates constraint',
                paraphrase_evidence: 'party said no weekends',
                status: 'rejected',
              },
            },
          ],
        },
      });

      const status = await client.getSettlementStatus('S1');

      expect(status?.challenges).toEqual([
        {
          id: 'ch-1',
          settlementId: 'S1',
          challengerId: 'entry-author',
          contradictionProof: '',
          paraphraseEvidence: '',
          timestamp: 1234,
          status: 'pending',
        },
        {
          id: 'ch-2',
          settlementId: 'S1',
          challengerId: 'challenger-9',
          contradictionProof: 'violates constraint',
          paraphraseEvidence: 'party said no weekends',
          timestamp: 5678,
          status: 'rejected',
        },
      ]);
      expect(status?.status).toBe('proposed');
    });

    it('timestamps a challenge with the current time when the entry has none', async () => {
      const client = createClient();
      jest.spyOn(Date, 'now').mockReturnValue(424242);
      http.post.mockResolvedValueOnce({
        status: 200,
        data: { results: [{ content: 'c', author: 'a', metadata: { settlement_id: 'S1', challenge_id: 'ch-1' } }] },
      });

      const status = await client.getSettlementStatus('S1');

      expect(status?.challenges[0].timestamp).toBe(424242);
    });

    it('is challenged when any challenge is upheld, even if both parties accepted', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({
        status: 200,
        data: {
          results: [
            { content: 'A', author: 'pa', metadata: { settlement_id: 'S1', party: 'A', accepted: true } },
            { content: 'B', author: 'pb', metadata: { settlement_id: 'S1', party: 'B', accepted: true } },
            { content: 'C', author: 'c', metadata: { settlement_id: 'S1', challenge_id: 'ch-1', status: 'upheld' } },
          ],
        },
      });

      const status = await client.getSettlementStatus('S1');

      expect(status).toMatchObject({ partyAAccepted: true, partyBAccepted: true, status: 'challenged' });
    });

    it('stays accepted when challenges exist but none is upheld', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({
        status: 200,
        data: {
          results: [
            { content: 'A', author: 'pa', metadata: { settlement_id: 'S1', party: 'A', accepted: true } },
            { content: 'B', author: 'pb', metadata: { settlement_id: 'S1', party: 'B', accepted: true } },
            { content: 'C', author: 'c', metadata: { settlement_id: 'S1', challenge_id: 'ch-1', status: 'pending' } },
          ],
        },
      });

      const status = await client.getSettlementStatus('S1');

      expect(status?.status).toBe('accepted');
      expect(status?.challenges).toHaveLength(1);
    });

    it('returns the proposed defaults when the search response has no results', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: {} });

      await expect(client.getSettlementStatus('S1')).resolves.toEqual({
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
        status: 'proposed',
      });
    });

    it('returns null when the search fails', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce(new Error('chain down'));

      await expect(client.getSettlementStatus('S1')).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        'Error fetching settlement status',
        expect.objectContaining({ settlementId: 'S1' })
      );
    });
  });

  describe('getRecentSettlements', () => {
    it('returns open contracts from /contract/list using the requested limit', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({
        status: 200,
        data: { contracts: [OPEN_CONTRACT, { ...OPEN_CONTRACT, contract_id: 'contract-2' }] },
      });

      const settlements = await client.getRecentSettlements(5);

      expect(http.get).toHaveBeenCalledWith('/contract/list?status=open&limit=5');
      expect(settlements.map(s => s.id)).toEqual(['contract-1', 'contract-2']);
      expect(http.post).not.toHaveBeenCalled();
    });

    it('accepts a bare array of contracts and defaults the limit to 20', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: [OPEN_CONTRACT] });

      const settlements = await client.getRecentSettlements();

      expect(http.get).toHaveBeenCalledWith('/contract/list?status=open&limit=20');
      expect(settlements).toHaveLength(1);
      expect(settlements[0]).toMatchObject({ id: 'contract-1', mediatorId: 'other-mediator', status: 'proposed' });
    });

    it('falls back to semantic search when no open contracts are listed', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: { contracts: [] } });
      http.post.mockResolvedValueOnce({
        status: 200,
        data: {
          results: [
            { content: 'unrelated note', author: 'x', metadata: { type: 'note' } },
            { content: 'no metadata', author: 'y' },
          ],
        },
      });

      const settlements = await client.getRecentSettlements(7);

      expect(http.post).toHaveBeenCalledWith('/search/semantic', {
        query: 'settlement proposed',
        top_k: 7,
        field: 'both',
      });
      expect(settlements).toEqual([]);
    });

    it('falls back to semantic search when /contract/list returns an empty body', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: null });
      http.post.mockResolvedValueOnce({ status: 200, data: { results: [] } });

      await expect(client.getRecentSettlements(3)).resolves.toEqual([]);
      expect(http.post).toHaveBeenCalledWith('/search/semantic', expect.objectContaining({ top_k: 3 }));
    });

    it('falls back to semantic search when /contract/list fails', async () => {
      const client = createClient();
      http.get.mockRejectedValueOnce(new Error('Request failed with status code 404'));
      http.post.mockResolvedValueOnce({ status: 200, data: {} });

      await expect(client.getRecentSettlements()).resolves.toEqual([]);
      expect(http.post).toHaveBeenCalledWith('/search/semantic', expect.objectContaining({ top_k: 20 }));
    });

    it('returns [] when both sources fail', async () => {
      const client = createClient();
      http.get.mockRejectedValueOnce(new Error('list down'));
      http.post.mockRejectedValueOnce(new Error('search down'));

      await expect(client.getRecentSettlements()).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith('Error fetching recent settlements', expect.any(Object));
    });
  });

  describe('submitPayout', () => {
    it('claims the fee through /contract/payout', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: { success: true } });

      await expect(client.submitPayout('S1', 12.5)).resolves.toEqual({ success: true });

      expect(http.post).toHaveBeenCalledTimes(1);
      expect(http.post).toHaveBeenCalledWith('/contract/payout', {
        settlement_ref: 'S1',
        mediator_id: PUBLIC_KEY,
        fee_amount: 12.5,
      });
    });

    it('falls back to a signed payout_claim entry when /contract/payout fails', async () => {
      const client = createClient();
      routePost({
        '/contract/payout': rejectWith('Request failed with status code 404'),
        '/entry': () => ({ status: 201 }),
      });

      await expect(client.submitPayout('S1', 12.5)).resolves.toEqual({ success: true });

      const content = '[PAYOUT] Settlement S1 closed. Claiming fee: 12.5 NLC';
      expect(http.post).toHaveBeenNthCalledWith(2, '/entry', {
        content,
        author: PUBLIC_KEY,
        intent: 'payout_claim',
        metadata: {
          settlement_id: 'S1',
          mediator_id: PUBLIC_KEY,
          amount: 12.5,
          timestamp: expect.any(Number),
        },
        signature: generateSignature(content, PRIVATE_KEY),
        validate: true,
      });
    });

    it('reports failure when the fallback entry is not accepted', async () => {
      const client = createClient();
      routePost({
        '/contract/payout': rejectWith('Request failed with status code 404'),
        '/entry': () => ({ status: 202 }),
      });

      await expect(client.submitPayout('S1', 1)).resolves.toEqual({ success: false });
    });

    it('returns the error when both endpoints fail', async () => {
      const client = createClient();
      routePost({
        '/contract/payout': rejectWith('Request failed with status code 404'),
        '/entry': rejectWith('entry rejected'),
      });

      await expect(client.submitPayout('S1', 1)).resolves.toEqual({ success: false, error: 'entry rejected' });
    });

    it('uses a generic error message when the failure has none', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce(new Error('payout unavailable')).mockRejectedValueOnce({});

      await expect(client.submitPayout('S1', 1)).resolves.toEqual({
        success: false,
        error: 'Failed to submit payout',
      });
    });
  });

  // ==========================================================================
  // Challenge operations
  // ==========================================================================

  describe('submitChallenge', () => {
    it.each<[string, Challenge, string]>([
      [
        'an AWS key in the contradiction proof',
        { ...CHALLENGE, contradictionProof: `Leaked config shows ${AWS_KEY_SECRET} in the escrow.` },
        AWS_KEY_SECRET,
      ],
      [
        'an API key in the paraphrase evidence',
        { ...CHALLENGE, paraphraseEvidence: `Party A pasted ${API_KEY_SECRET} into the thread.` },
        API_KEY_SECRET,
      ],
      [
        'a PEM private key in the paraphrase evidence',
        { ...CHALLENGE, paraphraseEvidence: `Attached: ${PEM_SECRET}` },
        'MIIBVQIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7',
      ],
    ])('blocks submission when the challenge contains %s', async (_label, challenge, secret) => {
      const client = createClient();

      const result = await client.submitChallenge(challenge);

      expect(result).toEqual({
        success: false,
        error: 'Challenge contains potential secrets — submission blocked',
      });
      expect(http.post).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        'Secrets detected in challenge data — blocking submission',
        expect.objectContaining({ challengeId: 'challenge-7', security: true })
      );
      expect(loggedText(warnSpy)).not.toContain(secret);
    });

    it('posts a signed, validated challenge entry', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200 });

      await expect(client.submitChallenge(CHALLENGE)).resolves.toEqual({
        success: true,
        challengeId: 'challenge-7',
      });

      const expectedEntry = challengeToEntry(CHALLENGE, PUBLIC_KEY);
      expect(http.post).toHaveBeenCalledWith('/entry', {
        ...expectedEntry,
        signature: generateSignature(expectedEntry.content, PRIVATE_KEY),
        validate: true,
      });
    });

    it('reports an unexpected status as a failure', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 202 });

      await expect(client.submitChallenge(CHALLENGE)).resolves.toEqual({
        success: false,
        error: 'Unexpected response status',
      });
    });

    it('returns the request error', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce(new Error('Request failed with status code 400'));

      await expect(client.submitChallenge(CHALLENGE)).resolves.toEqual({
        success: false,
        error: 'Request failed with status code 400',
      });
    });

    it('uses a generic error message when the failure has none', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce({});

      await expect(client.submitChallenge(CHALLENGE)).resolves.toEqual({
        success: false,
        error: 'Failed to submit challenge',
      });
    });
  });

  describe('getChallengeStatus', () => {
    it('returns the status recorded on the matching challenge entry', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({
        status: 200,
        data: {
          results: [
            { content: 'other', author: 'x', metadata: { challenge_id: 'ch-other', status: 'rejected' } },
            { content: 'no metadata', author: 'y' },
            { content: 'match', author: 'z', metadata: { challenge_id: 'ch-1', status: 'upheld' } },
          ],
        },
      });

      await expect(client.getChallengeStatus('ch-1')).resolves.toEqual({ status: 'upheld' });
      expect(http.post).toHaveBeenCalledWith('/search/semantic', { query: 'challenge ch-1', top_k: 10 });
    });

    it('defaults to pending when the matching entry has no status', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({
        status: 200,
        data: { results: [{ content: 'match', author: 'z', metadata: { challenge_id: 'ch-1' } }] },
      });

      await expect(client.getChallengeStatus('ch-1')).resolves.toEqual({ status: 'pending' });
    });

    it('returns null when no entry matches', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({
        status: 200,
        data: { results: [{ content: 'other', author: 'x', metadata: { challenge_id: 'ch-2' } }] },
      });

      await expect(client.getChallengeStatus('ch-1')).resolves.toBeNull();
    });

    it('returns null when the response has no results', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: {} });

      await expect(client.getChallengeStatus('ch-1')).resolves.toBeNull();
    });

    it('returns null when the search fails', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce(new Error('chain down'));

      await expect(client.getChallengeStatus('ch-1')).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        'Error fetching challenge status',
        expect.objectContaining({ challengeId: 'ch-1' })
      );
    });
  });

  // ==========================================================================
  // Burn operations
  // ==========================================================================

  describe('submitBurn', () => {
    it('uses /burn/execute and returns its transaction_id', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 201, data: { transaction_id: 'tx-1' } });

      await expect(client.submitBurn(BURN)).resolves.toEqual({ success: true, transactionId: 'tx-1' });
      expect(http.post).toHaveBeenCalledTimes(1);
      expect(http.post).toHaveBeenCalledWith('/burn/execute', BURN);
    });

    it('falls back to the response id when there is no transaction_id', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: { id: 'tx-2' } });

      await expect(client.submitBurn(BURN)).resolves.toEqual({ success: true, transactionId: 'tx-2' });
    });

    it('succeeds without a transaction id when the response has no body', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 201 });

      await expect(client.submitBurn(BURN)).resolves.toEqual({ success: true, transactionId: undefined });
    });

    it('falls back to a signed burn entry when /burn/execute fails', async () => {
      const client = createClient();
      routePost({
        '/burn/execute': rejectWith('Request failed with status code 404'),
        '/entry': () => ({ status: 201 }),
      });

      await expect(client.submitBurn({ ...BURN, multiplier: 2 })).resolves.toEqual({ success: true });

      const body = lastPostBody();
      expect(http.post).toHaveBeenLastCalledWith('/entry', expect.any(Object));
      expect(body).toMatchObject({
        author: PUBLIC_KEY,
        intent: 'burn_transaction',
        validate: true,
        metadata: {
          burn_type: 'base_filing',
          burn_author: 'alice',
          burn_amount: 10,
          intent_hash: 'intent-hash-1',
          multiplier: 2,
        },
      });
      expect(body.content).toContain('[BURN TRANSACTION]');
      expect(body.content).toContain('Amount: 10 NLC');
      expect(body.signature).toBe(generateSignature(body.content, PRIVATE_KEY));
    });

    it('reports failure when the fallback entry is not accepted', async () => {
      const client = createClient();
      routePost({
        '/burn/execute': rejectWith('Request failed with status code 404'),
        '/entry': () => ({ status: 202 }),
      });

      await expect(client.submitBurn(BURN)).resolves.toEqual({ success: false });
    });

    it('returns the error when both endpoints fail', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce(new Error('burn unavailable')).mockRejectedValueOnce(new Error('entry rejected'));

      await expect(client.submitBurn(BURN)).resolves.toEqual({ success: false, error: 'entry rejected' });
    });

    it('uses a generic error message when the failure has none', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce(new Error('burn unavailable')).mockRejectedValueOnce({});

      await expect(client.submitBurn(BURN)).resolves.toEqual({ success: false, error: 'Failed to submit burn' });
    });
  });

  // ==========================================================================
  // Generic entries
  // ==========================================================================

  describe('submitEntry', () => {
    it('signs the content and posts it with default options', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 201 });
      const content = 'Mediator heartbeat: 3 intents processed.';

      await expect(client.submitEntry(content, 'status_update', { cycle: 7 })).resolves.toEqual({ success: true });

      expect(http.post).toHaveBeenCalledWith('/entry', {
        content,
        author: PUBLIC_KEY,
        intent: 'status_update',
        metadata: { cycle: 7, entry_type: undefined },
        signature: generateSignature(content, PRIVATE_KEY),
        validate: true,
        auto_mine: false,
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('honours entry type, a pre-computed signature, validate=false and autoMine', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200 });

      await client.submitEntry('Reputation snapshot', 'reputation', undefined, {
        type: 'reputation_update',
        signature: 'pre-signed',
        validate: false,
        autoMine: true,
      });

      expect(http.post).toHaveBeenCalledWith('/entry', {
        content: 'Reputation snapshot',
        author: PUBLIC_KEY,
        intent: 'reputation',
        metadata: { entry_type: 'reputation_update' },
        signature: 'pre-signed',
        validate: false,
        auto_mine: true,
      });
    });

    it('redacts an API key from the content before signing and sending', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 201 });
      const content = `Integration notes: call the LLM with ${API_KEY_SECRET} for scoring.`;
      const redacted = 'Integration notes: call the LLM with [REDACTED] for scoring.';

      await expect(client.submitEntry(content, 'notes')).resolves.toEqual({ success: true });

      const body = lastPostBody();
      expect(body.content).toBe(redacted);
      expect(JSON.stringify(body)).not.toContain(API_KEY_SECRET);
      // The signature covers what was actually sent, not the original text.
      expect(body.signature).toBe(generateSignature(redacted, PRIVATE_KEY));
      expect(body.signature).not.toBe(generateSignature(content, PRIVATE_KEY));

      expect(warnSpy).toHaveBeenCalledWith(
        'Secrets detected in chain submission content — redacting',
        expect.objectContaining({ security: true, matchLabels: ['OpenAI/Anthropic API key'] })
      );
      expect(loggedText(warnSpy)).not.toContain(API_KEY_SECRET);
    });

    it('redacts PEM private keys and AWS keys from the content', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 201 });
      const content = `Key material:\n${PEM_SECRET}\nAccess: ${AWS_KEY_SECRET}`;

      await client.submitEntry(content, 'notes');

      const body = lastPostBody();
      expect(body.content).toBe('Key material:\n[REDACTED]\nAccess: [REDACTED]');
      expect(body.content).not.toContain('PRIVATE KEY');
      expect(body.content).not.toContain(AWS_KEY_SECRET);
    });

    it('reports failure on an unexpected status', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 202 });

      await expect(client.submitEntry('hello', 'note')).resolves.toEqual({ success: false });
    });

    it('returns the request error', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce(new Error('Request failed with status code 413'));

      await expect(client.submitEntry('hello', 'note')).resolves.toEqual({
        success: false,
        error: 'Request failed with status code 413',
      });
    });

    it('uses a generic error message when the failure has none', async () => {
      const client = createClient();
      http.post.mockRejectedValueOnce({});

      await expect(client.submitEntry('hello', 'note')).resolves.toEqual({
        success: false,
        error: 'Failed to submit entry',
      });
    });
  });

  describe('searchSemantic', () => {
    it('sends defaults of top_k 10 and field "both"', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: { results: [] } });

      await client.searchSemantic('logo');

      expect(http.post).toHaveBeenCalledWith('/search/semantic', {
        query: 'logo',
        top_k: 10,
        min_score: undefined,
        field: 'both',
      });
    });

    it('passes topK, minScore and field through', async () => {
      const client = createClient();
      const results = [{ content: 'Logo work', author: 'a', intent: 'offer' }];
      http.post.mockResolvedValueOnce({ status: 200, data: { results } });

      await expect(client.searchSemantic('logo', { topK: 3, minScore: 0.4, field: 'content' })).resolves.toEqual(results);

      expect(http.post).toHaveBeenCalledWith('/search/semantic', {
        query: 'logo',
        top_k: 3,
        min_score: 0.4,
        field: 'content',
      });
    });

    it('returns [] when the response has no results', async () => {
      const client = createClient();
      http.post.mockResolvedValueOnce({ status: 200, data: {} });

      await expect(client.searchSemantic('logo')).resolves.toEqual([]);
    });
  });

  describe('getChain / validateChain', () => {
    it('getChain returns null when the request fails', async () => {
      const client = createClient();
      http.get.mockRejectedValueOnce(new Error('chain down'));

      await expect(client.getChain()).resolves.toBeNull();
      expect(errorSpy).toHaveBeenCalledWith('Error fetching chain', expect.any(Object));
    });

    it('validateChain queries /validate/chain', async () => {
      const client = createClient();
      http.get.mockResolvedValueOnce({ status: 200, data: { valid: true, blocks: 3 } });

      await expect(client.validateChain()).resolves.toEqual({ valid: true, issues: undefined });
      expect(http.get).toHaveBeenCalledWith('/validate/chain');
    });

    it('validateChain reports invalid when the request fails', async () => {
      const client = createClient();
      http.get.mockRejectedValueOnce(new Error('chain down'));

      await expect(client.validateChain()).resolves.toEqual({
        valid: false,
        issues: ['Failed to validate chain'],
      });
    });
  });
});
