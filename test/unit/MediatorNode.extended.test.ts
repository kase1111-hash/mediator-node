/**
 * MediatorNode - interval lifecycle, health server wiring, alignment cycle
 * branches, monitoring error paths and challengeable-settlement scanning.
 *
 * All collaborators are auto-mocked (same approach as MediatorNode.test.ts);
 * behaviour is configured in beforeEach because jest.config.js resets mocks
 * before every test.
 */

import { MediatorNode } from '../../src/MediatorNode';
import {
  AlignmentCandidate,
  ChallengeHistory,
  ContradictionAnalysis,
  Intent,
  MediatorConfig,
  NegotiationResult,
  ProposedSettlement,
} from '../../src/types';
import { createMockConfig, createMockIntent, createMockProposedSettlement } from '../utils/testUtils';

jest.mock('axios');

jest.mock('../../src/chain', () => ({
  ChainClient: {
    fromConfig: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/ingestion/IntentIngester');
jest.mock('../../src/mapping/VectorDatabase');
jest.mock('../../src/llm/LLMProvider');
jest.mock('../../src/settlement/SettlementManager');
jest.mock('../../src/reputation/ReputationTracker');
jest.mock('../../src/challenge/ChallengeDetector');
jest.mock('../../src/challenge/ChallengeManager');
jest.mock('../../src/monitoring/HealthServer');

import { ChainClient } from '../../src/chain';
import { IntentIngester } from '../../src/ingestion/IntentIngester';
import { VectorDatabase } from '../../src/mapping/VectorDatabase';
import { LLMProvider } from '../../src/llm/LLMProvider';
import { SettlementManager } from '../../src/settlement/SettlementManager';
import { ReputationTracker } from '../../src/reputation/ReputationTracker';
import { ChallengeDetector } from '../../src/challenge/ChallengeDetector';
import { ChallengeManager } from '../../src/challenge/ChallengeManager';
import { HealthServer, HealthStatusProvider } from '../../src/monitoring/HealthServer';
import { logger } from '../../src/utils/logger';

const ingester = jest.mocked(IntentIngester.prototype);
const vectorDb = jest.mocked(VectorDatabase.prototype);
const llm = jest.mocked(LLMProvider.prototype);
const settlements = jest.mocked(SettlementManager.prototype);
const reputation = jest.mocked(ReputationTracker.prototype);
const detector = jest.mocked(ChallengeDetector.prototype);
const challenges = jest.mocked(ChallengeManager.prototype);
const MockHealthServer = jest.mocked(HealthServer);
const healthServer = jest.mocked(HealthServer.prototype);

const MINUTE = 60000;

describe('MediatorNode (extended)', () => {
  let node: MediatorNode | undefined;
  let chain: {
    isAvailable: jest.Mock;
    getMatchCandidates: jest.Mock;
    getRecentSettlements: jest.Mock;
    getIntent: jest.Mock;
  };

  const A = createMockIntent({ hash: 'hash_a', author: 'alice', prose: 'Alice needs a logo', offeredFee: 2 });
  const B = createMockIntent({ hash: 'hash_b', author: 'bob', prose: 'Bob designs logos', offeredFee: 2 });
  const C = createMockIntent({ hash: 'hash_c', author: 'carol', prose: 'Carol needs an API', offeredFee: 3 });
  const D = createMockIntent({ hash: 'hash_d', author: 'dave', prose: 'Dave builds APIs', offeredFee: 3 });
  const E = createMockIntent({ hash: 'hash_e', author: 'erin', prose: 'Erin writes docs', offeredFee: 1 });

  const pair = (intentA: Intent, intentB: Intent, priority = 1): AlignmentCandidate => ({
    intentA,
    intentB,
    similarityScore: 0.9,
    estimatedValue: (intentA.offeredFee || 0) + (intentB.offeredFee || 0),
    priority,
  });

  const negotiation = (success: boolean, reasoning = 'reasoning'): NegotiationResult => ({
    success,
    reasoning,
    proposedTerms: { price: 100 },
    confidenceScore: success ? 0.9 : 0.2,
    modelUsed: 'test-model',
    promptHash: 'prompt-hash',
  });

  /** Pairs passed to negotiateAlignment, as "hashA>hashB" */
  const negotiatedPairs = () =>
    llm.negotiateAlignment.mock.calls.map(([a, b]) => `${a.hash}>${b.hash}`);

  const logCalls = (level: 'info' | 'warn' | 'error' | 'debug', message: string) =>
    (logger[level] as jest.Mock).mock.calls.filter(([msg]) => msg === message);

  const makeConfig = (overrides: Partial<MediatorConfig> = {}): MediatorConfig =>
    createMockConfig({
      mediatorPublicKey: 'our-mediator',
      // Long default intervals so only the initial cycle runs unless a test advances time
      alignmentCycleIntervalMs: 10 * MINUTE,
      settlementMonitoringIntervalMs: 10 * MINUTE,
      ...overrides,
    });

  /** Start a node and let its (un-awaited) initial alignment cycle finish */
  const startNode = async (overrides: Partial<MediatorConfig> = {}): Promise<MediatorNode> => {
    node = new MediatorNode(makeConfig(overrides));
    await node.start();
    await jest.advanceTimersByTimeAsync(0);
    return node;
  };

  beforeEach(() => {
    jest.useFakeTimers();

    chain = {
      isAvailable: jest.fn().mockReturnValue(true),
      getMatchCandidates: jest.fn().mockResolvedValue([]),
      getRecentSettlements: jest.fn().mockResolvedValue([]),
      getIntent: jest.fn().mockResolvedValue(null),
    };
    (ChainClient.fromConfig as jest.Mock).mockReturnValue(chain);

    ingester.getPrioritizedIntents.mockReturnValue([]);
    ingester.getCachedIntents.mockReturnValue([]);

    vectorDb.initialize.mockResolvedValue(undefined);
    vectorDb.save.mockResolvedValue(undefined);
    vectorDb.addIntent.mockResolvedValue(undefined);
    vectorDb.findTopAlignmentCandidates.mockResolvedValue([]);

    llm.generateEmbedding.mockImplementation(async (text: string) => [text.length, 0.5]);
    llm.negotiateAlignment.mockResolvedValue(negotiation(false, 'no overlap'));

    reputation.loadReputation.mockResolvedValue(undefined);
    reputation.getWeight.mockReturnValue(1);

    settlements.monitorSettlements.mockResolvedValue(undefined);
    settlements.getActiveSettlements.mockReturnValue([]);
    settlements.createSettlement.mockImplementation(
      (a: Intent, b: Intent) => ({ id: `settlement_${a.hash}_${b.hash}` }) as ProposedSettlement
    );
    settlements.submitSettlement.mockResolvedValue(true);

    challenges.monitorChallenges.mockResolvedValue(undefined);
    challenges.getChallengesForSettlement.mockReturnValue([]);
    challenges.submitChallenge.mockResolvedValue({ success: true, challengeId: 'challenge-1', timestamp: 0 });
    challenges.getChallengeStats.mockReturnValue({ total: 0, pending: 0, upheld: 0, rejected: 0, successRate: 0 });

    detector.analyzeSettlement.mockResolvedValue(null);
    detector.shouldChallenge.mockReturnValue(false);

    healthServer.start.mockResolvedValue(undefined);
    healthServer.stop.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (node) {
      await node.stop();
      node = undefined;
    }
    jest.useRealTimers();
  });

  describe('interval lifecycle', () => {
    it('stop() clears the alignment, settlement, challenge-monitoring and scan intervals', async () => {
      const timersBefore = jest.getTimerCount();
      const n = await startNode({
        enableChallengeSubmission: true,
        alignmentCycleIntervalMs: 1000,
        settlementMonitoringIntervalMs: 2000,
        challengeCheckInterval: 3000,
      });

      // alignment cycle + settlement monitoring + challenge monitoring + challenge scan
      expect(jest.getTimerCount()).toBe(timersBefore + 4);

      // Positive control: every interval fires while running
      await jest.advanceTimersByTimeAsync(MINUTE);
      expect(ingester.getPrioritizedIntents.mock.calls.length).toBeGreaterThan(1);
      expect(settlements.monitorSettlements).toHaveBeenCalled();
      expect(challenges.monitorChallenges).toHaveBeenCalled();
      expect(chain.getRecentSettlements).toHaveBeenCalled();

      await n.stop();
      expect(jest.getTimerCount()).toBe(timersBefore);

      const callsAtStop = {
        cycle: ingester.getPrioritizedIntents.mock.calls.length,
        settlements: settlements.monitorSettlements.mock.calls.length,
        challenges: challenges.monitorChallenges.mock.calls.length,
        scan: chain.getRecentSettlements.mock.calls.length,
      };

      await jest.advanceTimersByTimeAsync(30 * MINUTE);

      expect({
        cycle: ingester.getPrioritizedIntents.mock.calls.length,
        settlements: settlements.monitorSettlements.mock.calls.length,
        challenges: challenges.monitorChallenges.mock.calls.length,
        scan: chain.getRecentSettlements.mock.calls.length,
      }).toEqual(callsAtStop);
    });

    it('stop() clears the default-interval timers too', async () => {
      const timersBefore = jest.getTimerCount();
      node = new MediatorNode(createMockConfig({ enableChallengeSubmission: true }));
      await node.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(jest.getTimerCount()).toBe(timersBefore + 4);

      await node.stop();

      expect(jest.getTimerCount()).toBe(timersBefore);
      await jest.advanceTimersByTimeAsync(30 * MINUTE);
      expect(settlements.monitorSettlements).not.toHaveBeenCalled();
      expect(challenges.monitorChallenges).not.toHaveBeenCalled();
      expect(chain.getRecentSettlements).not.toHaveBeenCalled();
      expect(ingester.getPrioritizedIntents).toHaveBeenCalledTimes(1); // the initial cycle only
    });

    it('does not start challenge intervals when challenge submission is disabled', async () => {
      const timersBefore = jest.getTimerCount();
      await startNode({ enableChallengeSubmission: false, challengeCheckInterval: 1000 });

      expect(jest.getTimerCount()).toBe(timersBefore + 2);

      await jest.advanceTimersByTimeAsync(10 * MINUTE);
      expect(challenges.monitorChallenges).not.toHaveBeenCalled();
      expect(chain.getRecentSettlements).not.toHaveBeenCalled();

      await node!.stop();
      expect(jest.getTimerCount()).toBe(timersBefore);
    });

    it('can be restarted after stop() without leaking intervals', async () => {
      const timersBefore = jest.getTimerCount();
      const n = await startNode({ enableChallengeSubmission: true, settlementMonitoringIntervalMs: 5000 });
      await n.stop();
      expect(jest.getTimerCount()).toBe(timersBefore);

      await n.start();
      await jest.advanceTimersByTimeAsync(0);
      expect(jest.getTimerCount()).toBe(timersBefore + 4);
      expect(n.getStatus().isRunning).toBe(true);

      await jest.advanceTimersByTimeAsync(5000);
      expect(settlements.monitorSettlements).toHaveBeenCalledTimes(1);

      await n.stop();
      expect(jest.getTimerCount()).toBe(timersBefore);
      expect(n.getStatus().isRunning).toBe(false);
    });

    it('uses the configured intent polling and alignment intervals', async () => {
      await startNode({ intentPollingIntervalMs: 2500, alignmentCycleIntervalMs: 7000 });

      expect(ingester.startPolling).toHaveBeenCalledWith(2500);
      expect(ingester.getPrioritizedIntents).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(6999);
      expect(ingester.getPrioritizedIntents).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      expect(ingester.getPrioritizedIntents).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(7000);
      expect(ingester.getPrioritizedIntents).toHaveBeenCalledTimes(3);
    });

    it('stop() stops intent polling', async () => {
      const n = await startNode();
      await n.stop();

      expect(ingester.stopPolling).toHaveBeenCalledTimes(1);
      expect(vectorDb.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('health server', () => {
    it('is not created when healthServerPort is not configured', async () => {
      const n = await startNode();
      await n.stop();

      expect(MockHealthServer).not.toHaveBeenCalled();
      expect(healthServer.start).not.toHaveBeenCalled();
      expect(healthServer.stop).not.toHaveBeenCalled();
    });

    it('is started on the configured port with a status provider, and stopped by stop()', async () => {
      const n = await startNode({ healthServerPort: 9123 });

      expect(MockHealthServer).toHaveBeenCalledWith({ port: 9123 });
      expect(healthServer.setStatusProvider).toHaveBeenCalledTimes(1);
      expect(healthServer.start).toHaveBeenCalledTimes(1);
      expect(healthServer.setStatusProvider.mock.invocationCallOrder[0]).toBeLessThan(
        healthServer.start.mock.invocationCallOrder[0]
      );

      await n.stop();

      expect(healthServer.stop).toHaveBeenCalledTimes(1);
    });

    it('status provider reports live node values', async () => {
      const n = await startNode({ healthServerPort: 9124 });
      const provider: HealthStatusProvider = healthServer.setStatusProvider.mock.calls[0][0];

      ingester.getCachedIntents.mockReturnValue([A, B, C]);
      settlements.getActiveSettlements.mockReturnValue([{ id: 's1' } as ProposedSettlement]);
      reputation.getWeight.mockReturnValue(2.5);

      expect({ ...provider }).toEqual({
        isRunning: true,
        cachedIntents: 3,
        activeSettlements: 1,
        reputation: 2.5,
      });

      ingester.getCachedIntents.mockReturnValue([A]);
      reputation.getWeight.mockReturnValue(0.75);
      expect(provider.cachedIntents).toBe(1);
      expect(provider.reputation).toBe(0.75);

      await n.stop();
      expect(provider.isRunning).toBe(false);
    });

    it('propagates a health server start failure from start()', async () => {
      healthServer.start.mockRejectedValue(new Error('EADDRINUSE'));
      node = new MediatorNode(makeConfig({ healthServerPort: 9125 }));

      await expect(node.start()).rejects.toThrow('EADDRINUSE');
      expect(logger.error).toHaveBeenCalledWith('Error starting mediator node', expect.any(Object));
    });

    it('still finishes stopping when the health server fails to stop', async () => {
      healthServer.stop.mockRejectedValue(new Error('close failed'));
      const n = await startNode({ healthServerPort: 9126 });

      await n.stop();
      node = undefined;

      expect(logger.error).toHaveBeenCalledWith('Cleanup operation failed', { error: 'close failed' });
      expect(vectorDb.save).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Mediator node stopped');
    });

    it('reports "Unknown error" when a cleanup step rejects with a non-Error', async () => {
      vectorDb.save.mockRejectedValue('disk full');
      const n = await startNode();

      await n.stop();
      node = undefined;

      expect(logger.error).toHaveBeenCalledWith('Cleanup operation failed', { error: 'Unknown error' });
      expect(logger.info).toHaveBeenCalledWith('Mediator node stopped');
    });
  });

  describe('alignment cycle', () => {
    it('skips the cycle while the chain is unavailable and resumes when it recovers', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      chain.isAvailable.mockReturnValue(false);

      await startNode({ alignmentCycleIntervalMs: 5000 });

      expect(logger.warn).toHaveBeenCalledWith('Chain unavailable (circuit breaker open), skipping cycle');
      expect(ingester.getPrioritizedIntents).not.toHaveBeenCalled();
      expect(llm.generateEmbedding).not.toHaveBeenCalled();
      expect(vectorDb.findTopAlignmentCandidates).not.toHaveBeenCalled();
      expect(logCalls('info', 'Alignment cycle completed')).toHaveLength(0);

      chain.isAvailable.mockReturnValue(true);
      await jest.advanceTimersByTimeAsync(5000);

      expect(ingester.getPrioritizedIntents).toHaveBeenCalledTimes(1);
      expect(llm.generateEmbedding).toHaveBeenCalledTimes(2);
    });

    it('skips an intent whose embedding fails and maps the rest', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B, C]);
      ingester.getCachedIntents.mockReturnValue([A, B, C]);
      llm.generateEmbedding.mockImplementation(async (text: string) => {
        if (text === B.prose) throw new Error('embedding quota exceeded');
        return [text.length];
      });

      await startNode();

      expect(vectorDb.addIntent.mock.calls.map(([i]) => i.hash)).toEqual(['hash_a', 'hash_c']);
      expect(logger.warn).toHaveBeenCalledWith('Failed to generate embedding, skipping intent', {
        intentHash: 'hash_b',
        error: 'embedding quota exceeded',
      });

      const [intentsArg, embeddingsArg, topK] = vectorDb.findTopAlignmentCandidates.mock.calls[0];
      expect(intentsArg).toEqual([A, B, C]);
      expect(Array.from(embeddingsArg.keys()).sort()).toEqual(['hash_a', 'hash_c']);
      expect(topK).toBe(10);
    });

    it('logs "Unknown" for a non-Error embedding failure and retries that intent next cycle', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      ingester.getCachedIntents.mockReturnValue([A, B]);
      llm.generateEmbedding.mockImplementationOnce(async () => [1]).mockImplementationOnce(async () => {
        throw 'provider down';
      });

      await startNode({ alignmentCycleIntervalMs: 5000 });

      expect(logger.warn).toHaveBeenCalledWith('Failed to generate embedding, skipping intent', {
        intentHash: 'hash_b',
        error: 'Unknown',
      });

      llm.generateEmbedding.mockImplementation(async () => [2]);
      await jest.advanceTimersByTimeAsync(5000);

      // A was cached; only B is embedded again
      expect(llm.generateEmbedding).toHaveBeenCalledTimes(3);
      expect(llm.generateEmbedding).toHaveBeenLastCalledWith(B.prose);
      expect(vectorDb.addIntent.mock.calls.map(([i]) => i.hash)).toEqual(['hash_a', 'hash_b']);
    });

    it('reuses cached embeddings and evicts those for intents no longer cached', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      ingester.getCachedIntents.mockReturnValue([A]); // B dropped out of the ingester cache

      await startNode({ alignmentCycleIntervalMs: 5000 });
      expect(llm.generateEmbedding.mock.calls.map(([t]) => t)).toEqual([A.prose, B.prose]);

      await jest.advanceTimersByTimeAsync(5000);

      // A's embedding was kept; B's was evicted and is regenerated
      expect(llm.generateEmbedding.mock.calls.map(([t]) => t)).toEqual([A.prose, B.prose, B.prose]);
    });

    it('queries chain match candidates with the prose of the top 3 intents', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B, C, D]);

      await startNode();

      expect(chain.getMatchCandidates).toHaveBeenCalledWith(
        `${A.prose} ${B.prose} ${C.prose}`,
        10
      );
    });

    it('merges chain candidates, dropping (A,B)/(B,A) duplicates of local candidates', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B, C, D]);
      vectorDb.findTopAlignmentCandidates.mockResolvedValue([pair(A, B, 5)]);
      chain.getMatchCandidates.mockResolvedValue([
        pair(B, A), // reversed duplicate
        pair(A, B), // exact duplicate
        pair(A, C), // shares intentA only
        pair(D, A), // shares one intent, other orientation
      ]);

      await startNode();

      expect(negotiatedPairs()).toEqual(['hash_a>hash_b', 'hash_a>hash_c', 'hash_d>hash_a']);
      expect(logger.info).toHaveBeenCalledWith('Merged chain-sourced candidates', {
        chainCandidates: 4,
        totalCandidates: 3,
      });
    });

    it('does not log a merge when the chain returns no candidates', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      vectorDb.findTopAlignmentCandidates.mockResolvedValue([pair(A, B)]);

      await startNode();

      expect(logCalls('info', 'Merged chain-sourced candidates')).toHaveLength(0);
      expect(negotiatedPairs()).toEqual(['hash_a>hash_b']);
    });

    it('falls back to local candidates when getMatchCandidates throws', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B, C, D]);
      vectorDb.findTopAlignmentCandidates.mockResolvedValue([pair(A, B, 2), pair(C, D, 1)]);
      chain.getMatchCandidates.mockRejectedValue(new Error('match endpoint 404'));

      await startNode();

      expect(logger.debug).toHaveBeenCalledWith('Chain match candidates unavailable, using local only');
      expect(negotiatedPairs()).toEqual(['hash_a>hash_b', 'hash_c>hash_d']);
      expect(logger.error).not.toHaveBeenCalledWith('Error in alignment cycle', expect.anything());
    });

    it('negotiates only the top 3 candidates', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B, C, D, E]);
      vectorDb.findTopAlignmentCandidates.mockResolvedValue([
        pair(A, B, 5),
        pair(C, D, 4),
        pair(A, E, 3),
        pair(B, C, 2),
        pair(D, E, 1),
      ]);

      await startNode();

      expect(negotiatedPairs()).toEqual(['hash_a>hash_b', 'hash_c>hash_d', 'hash_a>hash_e']);
      expect(logger.info).toHaveBeenCalledWith(
        'Alignment cycle completed',
        expect.objectContaining({
          intentsProcessed: 5,
          candidatesFound: 5,
          negotiationsAttempted: 3,
          settlementsSubmitted: 0,
        })
      );
    });

    it('does not create a settlement when negotiation fails', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      vectorDb.findTopAlignmentCandidates.mockResolvedValue([pair(A, B)]);
      llm.negotiateAlignment.mockResolvedValue(negotiation(false, 'price gap too large'));

      await startNode();

      expect(llm.negotiateAlignment).toHaveBeenCalledWith(A, B);
      expect(settlements.createSettlement).not.toHaveBeenCalled();
      expect(settlements.submitSettlement).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Negotiation failed', {
        intentA: 'hash_a',
        intentB: 'hash_b',
        reason: 'price gap too large',
      });
    });

    it('creates and submits a settlement when negotiation succeeds', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      vectorDb.findTopAlignmentCandidates.mockResolvedValue([pair(A, B)]);
      const result = negotiation(true, 'aligned on price');
      llm.negotiateAlignment.mockResolvedValue(result);

      await startNode();

      expect(settlements.createSettlement).toHaveBeenCalledWith(A, B, result);
      expect(settlements.submitSettlement).toHaveBeenCalledWith({ id: 'settlement_hash_a_hash_b' });
      expect(logger.info).toHaveBeenCalledWith('Settlement submitted successfully', {
        settlementId: 'settlement_hash_a_hash_b',
        intentA: 'hash_a',
        intentB: 'hash_b',
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Alignment cycle completed',
        expect.objectContaining({ negotiationsAttempted: 1, settlementsSubmitted: 1 })
      );
    });

    it('does not count a settlement the chain refused', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      vectorDb.findTopAlignmentCandidates.mockResolvedValue([pair(A, B)]);
      llm.negotiateAlignment.mockResolvedValue(negotiation(true));
      settlements.submitSettlement.mockResolvedValue(false);

      await startNode();

      expect(settlements.submitSettlement).toHaveBeenCalledTimes(1);
      expect(logCalls('info', 'Settlement submitted successfully')).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        'Alignment cycle completed',
        expect.objectContaining({ negotiationsAttempted: 1, settlementsSubmitted: 0 })
      );
    });

    it('isolates errors per candidate so later candidates are still processed', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B, C, D, E]);
      vectorDb.findTopAlignmentCandidates.mockResolvedValue([pair(A, B, 3), pair(C, D, 2), pair(A, E, 1)]);
      llm.negotiateAlignment
        .mockRejectedValueOnce(new Error('LLM timeout'))
        .mockRejectedValueOnce('malformed completion')
        .mockResolvedValueOnce(negotiation(true));

      await startNode();

      expect(logger.error).toHaveBeenCalledWith('Error processing alignment candidate', {
        error: 'LLM timeout',
        intentA: 'hash_a',
        intentB: 'hash_b',
      });
      expect(logger.error).toHaveBeenCalledWith('Error processing alignment candidate', {
        error: 'Unknown',
        intentA: 'hash_c',
        intentB: 'hash_d',
      });
      expect(settlements.createSettlement).toHaveBeenCalledTimes(1);
      expect(settlements.createSettlement).toHaveBeenCalledWith(A, E, expect.any(Object));
      expect(logger.info).toHaveBeenCalledWith(
        'Alignment cycle completed',
        expect.objectContaining({ negotiationsAttempted: 3, settlementsSubmitted: 1 })
      );
    });

    it('treats a settlement submission that throws as not submitted', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      vectorDb.findTopAlignmentCandidates.mockResolvedValue([pair(A, B)]);
      llm.negotiateAlignment.mockResolvedValue(negotiation(true));
      settlements.submitSettlement.mockRejectedValue(new Error('chain write failed'));

      await startNode();

      expect(logger.error).toHaveBeenCalledWith(
        'Error processing alignment candidate',
        expect.objectContaining({ error: 'chain write failed' })
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Alignment cycle completed',
        expect.objectContaining({ settlementsSubmitted: 0 })
      );
    });

    it('logs and survives a non-Error thrown from the cycle, then runs again on the next tick', async () => {
      ingester.getPrioritizedIntents.mockImplementationOnce(() => {
        throw 'ingester exploded';
      });

      await startNode({ alignmentCycleIntervalMs: 5000 });

      expect(logger.error).toHaveBeenCalledWith('Error in alignment cycle', {
        error: 'Unknown',
        stack: undefined,
      });

      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      await jest.advanceTimersByTimeAsync(5000);

      expect(vectorDb.findTopAlignmentCandidates).toHaveBeenCalledTimes(1);
    });

    it('logs the message and stack of an Error thrown from the mapping phase', async () => {
      ingester.getPrioritizedIntents.mockReturnValue([A, B]);
      vectorDb.findTopAlignmentCandidates.mockRejectedValue(new Error('index corrupted'));

      await startNode();

      expect(logger.error).toHaveBeenCalledWith('Error in alignment cycle', {
        error: 'index corrupted',
        stack: expect.stringContaining('index corrupted'),
      });
      expect(llm.negotiateAlignment).not.toHaveBeenCalled();
      // The cycle summary is still emitted for the intents that were picked up
      expect(logger.info).toHaveBeenCalledWith(
        'Alignment cycle completed',
        expect.objectContaining({ intentsProcessed: 2, candidatesFound: 0 })
      );
    });
  });

  describe('monitoring interval error handling', () => {
    it('logs settlement-monitoring failures and keeps the interval running', async () => {
      settlements.monitorSettlements
        .mockRejectedValueOnce('rpc down')
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue(undefined);

      await startNode({ settlementMonitoringIntervalMs: 5000 });

      await jest.advanceTimersByTimeAsync(4999);
      expect(settlements.monitorSettlements).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(logger.error).toHaveBeenCalledWith('Error in settlement monitoring interval', {
        error: 'Unknown error',
        stack: undefined,
      });

      await jest.advanceTimersByTimeAsync(5000);
      expect(logger.error).toHaveBeenCalledWith('Error in settlement monitoring interval', {
        error: 'timeout',
        stack: expect.any(String),
      });

      await jest.advanceTimersByTimeAsync(5000);
      expect(settlements.monitorSettlements).toHaveBeenCalledTimes(3);
      expect(logCalls('error', 'Error in settlement monitoring interval')).toHaveLength(2);
    });

    it('defaults settlement monitoring to every 60s', async () => {
      node = new MediatorNode(createMockConfig({ alignmentCycleIntervalMs: 10 * MINUTE }));
      await node.start();

      await jest.advanceTimersByTimeAsync(MINUTE - 1);
      expect(settlements.monitorSettlements).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(settlements.monitorSettlements).toHaveBeenCalledTimes(1);
    });

    it('logs challenge-monitoring failures (Error and non-Error) every 60s and keeps going', async () => {
      challenges.monitorChallenges
        .mockRejectedValueOnce(new Error('status lookup failed'))
        .mockRejectedValueOnce(42)
        .mockResolvedValue(undefined);

      await startNode({ enableChallengeSubmission: true, challengeCheckInterval: 10 * MINUTE });

      await jest.advanceTimersByTimeAsync(MINUTE);
      expect(logger.error).toHaveBeenCalledWith('Error in challenge monitoring interval', {
        error: 'status lookup failed',
        stack: expect.stringContaining('status lookup failed'),
      });

      await jest.advanceTimersByTimeAsync(MINUTE);
      expect(logger.error).toHaveBeenCalledWith('Error in challenge monitoring interval', {
        error: 'Unknown error',
        stack: undefined,
      });

      await jest.advanceTimersByTimeAsync(MINUTE);
      expect(challenges.monitorChallenges).toHaveBeenCalledTimes(3);
    });
  });

  describe('challengeable settlement scanning', () => {
    const SCAN_MS = 5000;

    const analysis = (overrides: Partial<ContradictionAnalysis> = {}): ContradictionAnalysis => ({
      hasContradiction: true,
      confidence: 0.95,
      violatedConstraints: ['budget'],
      contradictionProof: 'proof',
      paraphraseEvidence: 'evidence',
      affectedParty: 'A',
      severity: 'severe',
      ...overrides,
    });

    const settlementFor = (
      id: string,
      intentA: Intent,
      intentB: Intent,
      overrides: Partial<ProposedSettlement> = {}
    ): ProposedSettlement =>
      createMockProposedSettlement({
        id,
        intentHashA: intentA.hash,
        intentHashB: intentB.hash,
        mediatorId: 'other-mediator',
        status: 'proposed',
        ...overrides,
      });

    const knownIntents = new Map([A, B, C, D, E].map(i => [i.hash, i]));

    const startScanning = () =>
      startNode({ enableChallengeSubmission: true, challengeCheckInterval: SCAN_MS });

    const runScan = () => jest.advanceTimersByTimeAsync(SCAN_MS);

    beforeEach(() => {
      chain.getIntent.mockImplementation(async (hash: string) => knownIntents.get(hash) ?? null);
    });

    it('analyses only proposed settlements from other mediators', async () => {
      const other = settlementFor('s_other', A, B);
      chain.getRecentSettlements.mockResolvedValue([
        settlementFor('s_own', C, D, { mediatorId: 'our-mediator' }),
        other,
        settlementFor('s_accepted', C, D, { status: 'accepted' }),
        settlementFor('s_closed', D, E, { status: 'closed' }),
      ]);

      await startScanning();
      expect(chain.getRecentSettlements).not.toHaveBeenCalled();

      await runScan();

      expect(chain.getRecentSettlements).toHaveBeenCalledWith(20);
      expect(chain.getIntent.mock.calls.map(([h]) => h)).toEqual(['hash_a', 'hash_b']);
      expect(detector.analyzeSettlement).toHaveBeenCalledTimes(1);
      expect(detector.analyzeSettlement).toHaveBeenCalledWith(other, A, B);
      expect(logger.debug).toHaveBeenCalledWith('Scanning settlements for contradictions', { count: 1 });
    });

    it('skips settlements this node has already challenged', async () => {
      chain.getRecentSettlements.mockResolvedValue([settlementFor('s1', A, B), settlementFor('s2', C, D)]);
      challenges.getChallengesForSettlement.mockImplementation((id: string) =>
        id === 's1' ? [{ challengeId: 'c1', settlementId: 's1' } as ChallengeHistory] : []
      );

      await startScanning();
      await runScan();

      expect(challenges.getChallengesForSettlement).toHaveBeenCalledWith('s1');
      expect(detector.analyzeSettlement).toHaveBeenCalledTimes(1);
      expect(detector.analyzeSettlement).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }), C, D);
    });

    it('skips settlements whose intents cannot be found on chain', async () => {
      const missing = createMockIntent({ hash: 'hash_missing' });
      chain.getRecentSettlements.mockResolvedValue([
        settlementFor('s_missing_b', A, missing),
        settlementFor('s_missing_a', missing, B),
        settlementFor('s_ok', C, D),
      ]);

      await startScanning();
      await runScan();

      expect(detector.analyzeSettlement).toHaveBeenCalledTimes(1);
      expect(detector.analyzeSettlement).toHaveBeenCalledWith(expect.objectContaining({ id: 's_ok' }), C, D);
    });

    it('does not challenge when analysis is unavailable', async () => {
      chain.getRecentSettlements.mockResolvedValue([settlementFor('s1', A, B)]);
      detector.analyzeSettlement.mockResolvedValue(null);

      await startScanning();
      await runScan();

      expect(detector.shouldChallenge).not.toHaveBeenCalled();
      expect(challenges.submitChallenge).not.toHaveBeenCalled();
    });

    it('does not challenge when the analysis does not meet the challenge threshold', async () => {
      chain.getRecentSettlements.mockResolvedValue([settlementFor('s1', A, B)]);
      const weak = analysis({ confidence: 0.4 });
      detector.analyzeSettlement.mockResolvedValue(weak);
      detector.shouldChallenge.mockReturnValue(false);

      await startScanning();
      await runScan();

      expect(detector.shouldChallenge).toHaveBeenCalledWith(weak);
      expect(challenges.submitChallenge).not.toHaveBeenCalled();
    });

    it('submits a challenge only for settlements that should be challenged', async () => {
      const bad = settlementFor('s_bad', A, B);
      const fine = settlementFor('s_fine', C, D);
      chain.getRecentSettlements.mockResolvedValue([bad, fine]);
      const strong = analysis();
      const weak = analysis({ hasContradiction: false, confidence: 0.1, violatedConstraints: [] });
      detector.analyzeSettlement.mockImplementation(async (s: ProposedSettlement) =>
        s.id === 's_bad' ? strong : weak
      );
      detector.shouldChallenge.mockImplementation((a: ContradictionAnalysis) => a === strong);

      await startScanning();
      await runScan();

      expect(challenges.submitChallenge).toHaveBeenCalledTimes(1);
      expect(challenges.submitChallenge).toHaveBeenCalledWith(bad, strong);
      expect(logger.info).toHaveBeenCalledWith('Challenge submitted successfully', {
        challengeId: 'challenge-1',
        settlementId: 's_bad',
      });
    });

    it('does not report success when the challenge submission fails', async () => {
      chain.getRecentSettlements.mockResolvedValue([settlementFor('s1', A, B)]);
      detector.analyzeSettlement.mockResolvedValue(analysis());
      detector.shouldChallenge.mockReturnValue(true);
      challenges.submitChallenge.mockResolvedValue({ success: false, error: 'rejected', timestamp: 0 });

      await startScanning();
      await runScan();

      expect(challenges.submitChallenge).toHaveBeenCalledTimes(1);
      expect(logCalls('info', 'Challenge submitted successfully')).toHaveLength(0);
    });

    it('logs scan failures and scans again on the next interval', async () => {
      chain.getRecentSettlements
        .mockRejectedValueOnce(new Error('chain offline'))
        .mockResolvedValue([settlementFor('s1', A, B)]);

      await startScanning();
      await runScan();

      expect(logger.error).toHaveBeenCalledWith('Error scanning for challengeable settlements', {
        error: expect.any(Error),
      });
      expect(detector.analyzeSettlement).not.toHaveBeenCalled();

      await runScan();

      expect(chain.getRecentSettlements).toHaveBeenCalledTimes(2);
      expect(detector.analyzeSettlement).toHaveBeenCalledTimes(1);
    });

    it('logs a failure part-way through a scan without crashing the interval', async () => {
      chain.getRecentSettlements.mockResolvedValue([settlementFor('s1', A, B)]);
      detector.analyzeSettlement.mockRejectedValue(new Error('detector crashed'));

      await startScanning();
      await runScan();
      await runScan();

      expect(logCalls('error', 'Error scanning for challengeable settlements')).toHaveLength(2);
      expect(logCalls('error', 'Error in challengeable settlements scan interval')).toHaveLength(0);
    });

    it('defaults the scan interval to 60s', async () => {
      await startNode({ enableChallengeSubmission: true });

      await jest.advanceTimersByTimeAsync(MINUTE - 1);
      expect(chain.getRecentSettlements).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(chain.getRecentSettlements).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatus', () => {
    it('includes challenge stats only when challenge submission is enabled', async () => {
      challenges.getChallengeStats.mockReturnValue({ total: 4, pending: 1, upheld: 2, rejected: 1, successRate: 66.7 });

      const disabled = new MediatorNode(makeConfig({ enableChallengeSubmission: false }));
      expect(disabled.getStatus().challengeStats).toBeUndefined();

      const enabled = new MediatorNode(makeConfig({ enableChallengeSubmission: true }));
      expect(enabled.getStatus()).toEqual({
        isRunning: false,
        cachedIntents: 0,
        activeSettlements: 0,
        reputation: 1,
        challengeStats: { total: 4, pending: 1, upheld: 2, rejected: 1, successRate: 66.7 },
      });
    });
  });
});
