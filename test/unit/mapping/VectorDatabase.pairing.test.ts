/**
 * VectorDatabase - candidate pairing rules and remaining load/search branches.
 *
 * findTopAlignmentCandidates must:
 * - never pair two intents written by the same author
 * - emit each unordered pair only once ((A,B) and (B,A) are the same pair)
 * - sort by priority and cap at topK (after de-duplication)
 */

import { MediatorConfig, Intent, ConsensusMode } from '../../../src/types';
import { VALID_INTENT_1, VALID_INTENT_2, VALID_INTENT_3, VALID_INTENT_4 } from '../../fixtures/intents';
import * as fs from 'fs';

jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

jest.mock('hnswlib-node');

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { VectorDatabase } from '../../../src/mapping/VectorDatabase';
import { logger } from '../../../src/utils/logger';

type SearchResult = { neighbors: number[]; distances: number[] };

describe('VectorDatabase pairing rules', () => {
  let config: MediatorConfig;
  let vectorDb: VectorDatabase;
  let searchKnnSpy: jest.SpyInstance;

  /** Label assigned by addIntent (sequential from 0 on a fresh index) */
  let labels: Map<string, number>;
  /** Embedding object for each intent hash; searchKnn is keyed on the object identity */
  let embeddings: Map<string, number[]>;
  /** What searchKnn returns for each query embedding */
  let searchResults: Map<number[], SearchResult>;

  const intent = (hash: string, author: string, offeredFee?: number): Intent => ({
    hash,
    author,
    prose: `Prose for ${hash}`,
    desires: [],
    constraints: [],
    timestamp: 1700000000000,
    status: 'pending',
    offeredFee,
  });

  const addAll = async (intents: Intent[]): Promise<void> => {
    for (const i of intents) {
      const embedding = [labels.size, 0.5, 0.25];
      labels.set(i.hash, labels.size);
      embeddings.set(i.hash, embedding);
      await vectorDb.addIntent(i, embedding);
    }
  };

  /** Configure searchKnn for `queryHash` to return [hash, distance] pairs (by label) */
  const whenSearching = (queryHash: string, results: Array<[string, number]>): void => {
    searchResults.set(embeddings.get(queryHash)!, {
      neighbors: results.map(([hash]) => labels.get(hash)!),
      distances: results.map(([, distance]) => distance),
    });
  };

  const pairKey = (a: Intent, b: Intent) => [a.hash, b.hash].sort().join(':');

  beforeEach(async () => {
    config = {
      chainEndpoint: 'http://localhost:3000',
      chainId: 'test-chain',
      consensusMode: 'permissionless' as ConsensusMode,
      llmProvider: 'anthropic',
      llmApiKey: 'test-key',
      llmModel: 'claude-3-5-sonnet-20241022',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 1.0,
      vectorDbPath: '/tmp/test-vector-db-pairing',
      vectorDimensions: 3,
      maxIntentsCache: 100,
      acceptanceWindowHours: 72,
      logLevel: 'info',
    };

    labels = new Map();
    embeddings = new Map();
    searchResults = new Map();

    const { HierarchicalNSW } = jest.requireMock('hnswlib-node');
    searchKnnSpy = jest
      .spyOn(HierarchicalNSW.prototype, 'searchKnn')
      .mockImplementation((query: unknown) => searchResults.get(query as number[]) ?? { neighbors: [], distances: [] });

    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.mkdirSync.mockReturnValue(undefined);

    vectorDb = new VectorDatabase(config);
    await vectorDb.initialize();
  });

  describe('findTopAlignmentCandidates', () => {
    it('never pairs two intents by the same author', async () => {
      const aliceLogo = intent('alice_logo', 'alice', 2);
      const aliceSite = intent('alice_site', 'alice', 2);
      const bobDesign = intent('bob_design', 'bob', 2);
      await addAll([aliceLogo, aliceSite, bobDesign]);

      // Alice's two intents are each other's nearest neighbour
      whenSearching('alice_logo', [['alice_site', 0.01], ['bob_design', 0.2]]);
      whenSearching('alice_site', [['alice_logo', 0.01]]);

      const candidates = await vectorDb.findTopAlignmentCandidates(
        [aliceLogo, aliceSite],
        embeddings,
        10
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0].intentA.hash).toBe('alice_logo');
      expect(candidates[0].intentB.hash).toBe('bob_design');
      for (const c of candidates) {
        expect(c.intentA.author).not.toBe(c.intentB.author);
      }
    });

    it('returns nothing when every neighbour shares the query author', async () => {
      const a1 = intent('carol_1', 'carol', 1);
      const a2 = intent('carol_2', 'carol', 1);
      const a3 = intent('carol_3', 'carol', 1);
      await addAll([a1, a2, a3]);

      whenSearching('carol_1', [['carol_2', 0.05], ['carol_3', 0.1]]);
      whenSearching('carol_2', [['carol_1', 0.05], ['carol_3', 0.1]]);
      whenSearching('carol_3', [['carol_1', 0.1], ['carol_2', 0.1]]);

      const candidates = await vectorDb.findTopAlignmentCandidates([a1, a2, a3], embeddings, 10);

      expect(candidates).toEqual([]);
    });

    it('emits an unordered pair only once when both sides find each other', async () => {
      await addAll([VALID_INTENT_1, VALID_INTENT_2]);

      whenSearching(VALID_INTENT_1.hash, [[VALID_INTENT_2.hash, 0.1]]);
      whenSearching(VALID_INTENT_2.hash, [[VALID_INTENT_1.hash, 0.1]]);

      const candidates = await vectorDb.findTopAlignmentCandidates(
        [VALID_INTENT_1, VALID_INTENT_2],
        embeddings,
        10
      );

      expect(candidates).toHaveLength(1);
      // The first intent processed owns the pair
      expect(candidates[0].intentA.hash).toBe(VALID_INTENT_1.hash);
      expect(candidates[0].intentB.hash).toBe(VALID_INTENT_2.hash);
    });

    it('emits a pair once even if the counterpart was indexed twice', async () => {
      await addAll([VALID_INTENT_1, VALID_INTENT_2]);
      // Re-index VALID_INTENT_2 under a new label (e.g. after an embedding cache eviction)
      const duplicateEmbedding = [99, 0.5, 0.25];
      const duplicateLabel = labels.size;
      await vectorDb.addIntent(VALID_INTENT_2, duplicateEmbedding);

      searchResults.set(embeddings.get(VALID_INTENT_1.hash)!, {
        neighbors: [labels.get(VALID_INTENT_2.hash)!, duplicateLabel],
        distances: [0.1, 0.1],
      });

      const candidates = await vectorDb.findTopAlignmentCandidates([VALID_INTENT_1], embeddings, 10);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].intentB.hash).toBe(VALID_INTENT_2.hash);
    });

    it('de-duplicates before sorting by priority and capping at topK', async () => {
      const a = intent('a', 'author_a', 1);
      const b = intent('b', 'author_b', 1);
      const c = intent('c', 'author_c', 1);
      const d = intent('d', 'author_d', 1);
      await addAll([a, b, c, d]);

      // (A,B) is the best pair and is found from both sides.
      whenSearching('a', [['b', 0.05]]); // sim 0.95 -> priority 1.9
      whenSearching('b', [['a', 0.05], ['c', 0.4]]); // (B,A) duplicate; (B,C) sim 0.6 -> 1.2
      whenSearching('c', [['d', 0.2]]); // (C,D) sim 0.8 -> 1.6

      const capped = await vectorDb.findTopAlignmentCandidates([a, b, c, d], embeddings, 2);

      expect(capped.map(x => pairKey(x.intentA, x.intentB))).toEqual(['a:b', 'c:d']);
      expect(capped[0].priority).toBeCloseTo(1.9);
      expect(capped[1].priority).toBeCloseTo(1.6);

      const all = await vectorDb.findTopAlignmentCandidates([a, b, c, d], embeddings, 10);
      expect(all.map(x => pairKey(x.intentA, x.intentB))).toEqual(['a:b', 'c:d', 'b:c']);
      const keys = all.map(x => pairKey(x.intentA, x.intentB));
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('combines both fees into estimatedValue and priority', async () => {
      await addAll([VALID_INTENT_3, VALID_INTENT_4]);
      whenSearching(VALID_INTENT_3.hash, [[VALID_INTENT_4.hash, 0.2]]);

      const [candidate] = await vectorDb.findTopAlignmentCandidates([VALID_INTENT_3], embeddings, 5);

      // fees 2.0 + 1.5
      expect(candidate.estimatedValue).toBeCloseTo(3.5);
      expect(candidate.similarityScore).toBeCloseTo(0.8);
      expect(candidate.priority).toBeCloseTo(0.8 * 3.5);
    });

    it('treats a missing offeredFee as 0 value and weight 1 in priority', async () => {
      const a = intent('nofee_a', 'author_a');
      const b = intent('nofee_b', 'author_b');
      await addAll([a, b]);
      whenSearching('nofee_a', [['nofee_b', 0.25]]);

      const [candidate] = await vectorDb.findTopAlignmentCandidates([a], embeddings, 5);

      expect(candidate.estimatedValue).toBe(0);
      expect(candidate.priority).toBeCloseTo(0.75 * 2);
    });

    it('defaults topK to 20 and never repeats a pair across a dense neighbourhood', async () => {
      const intents = Array.from({ length: 10 }, (_, i) => intent(`dense_${i}`, `author_${i}`, 1));
      await addAll(intents);

      // Each intent's 5 nearest neighbours are the next 5 intents (wrapping around),
      // which yields 45 unique unordered pairs (many found from both sides).
      intents.forEach((q, i) => {
        whenSearching(
          q.hash,
          [1, 2, 3, 4, 5].map(d => [intents[(i + d) % 10].hash, 0.01 * d] as [string, number])
        );
      });

      const candidates = await vectorDb.findTopAlignmentCandidates(intents, embeddings);

      expect(candidates).toHaveLength(20);
      const keys = candidates.map(c => pairKey(c.intentA, c.intentB));
      expect(new Set(keys).size).toBe(20);
      for (let i = 1; i < candidates.length; i++) {
        expect(candidates[i - 1].priority).toBeGreaterThanOrEqual(candidates[i].priority);
      }
      for (const c of candidates) {
        expect(c.intentA.hash).not.toBe(c.intentB.hash);
      }
    });
  });

  describe('findSimilarIntents', () => {
    it('defaults to k=10 (searching 2k neighbours) and does not exclude anything without excludeHash', async () => {
      await addAll([VALID_INTENT_1, VALID_INTENT_2]);
      whenSearching(VALID_INTENT_1.hash, [[VALID_INTENT_1.hash, 0], [VALID_INTENT_2.hash, 0.1]]);

      const results = await vectorDb.findSimilarIntents(embeddings.get(VALID_INTENT_1.hash)!);

      expect(searchKnnSpy).toHaveBeenCalledWith(embeddings.get(VALID_INTENT_1.hash), 20);
      expect(results.map(r => r.intentB.hash)).toEqual([VALID_INTENT_1.hash, VALID_INTENT_2.hash]);
    });

    it('stops collecting once k candidates are found', async () => {
      await addAll([VALID_INTENT_1, VALID_INTENT_2, VALID_INTENT_3, VALID_INTENT_4]);
      whenSearching(VALID_INTENT_1.hash, [
        [VALID_INTENT_2.hash, 0.1],
        [VALID_INTENT_3.hash, 0.2],
        [VALID_INTENT_4.hash, 0.3],
      ]);

      const results = await vectorDb.findSimilarIntents(embeddings.get(VALID_INTENT_1.hash)!, 2);

      expect(searchKnnSpy).toHaveBeenCalledWith(embeddings.get(VALID_INTENT_1.hash), 4);
      expect(results.map(r => r.intentB.hash)).toEqual([VALID_INTENT_2.hash, VALID_INTENT_3.hash]);
    });
  });

  describe('initialize with an invalid intent map', () => {
    const freshDb = () => new VectorDatabase(config);

    beforeEach(() => {
      mockedFs.existsSync.mockReturnValue(true);
    });

    it.each([
      ['null', 'null'],
      ['a number', '42'],
      ['a string', '"not a map"'],
    ])('starts with an empty map when the file contains %s', async (_label, content) => {
      mockedFs.readFileSync.mockReturnValue(content);
      const db = freshDb();

      await db.initialize();

      expect(db.getStats()).toEqual({ totalIntents: 0, nextId: 0 });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to parse intent map file, starting with empty map',
        expect.objectContaining({ error: 'Intent map data is not a valid object' })
      );
    });

    it('reports an unknown parse error when reading throws a non-Error value', async () => {
      mockedFs.readFileSync.mockImplementation(() => {
        throw 'EACCES';
      });
      const db = freshDb();

      await db.initialize();

      expect(db.getStats()).toEqual({ totalIntents: 0, nextId: 0 });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to parse intent map file, starting with empty map',
        expect.objectContaining({ error: 'Unknown parse error' })
      );
    });

    it('continues numbering after the highest loaded id', async () => {
      mockedFs.readFileSync.mockReturnValue(
        JSON.stringify({ '3': VALID_INTENT_1, '7': VALID_INTENT_2 })
      );
      const db = freshDb();

      await db.initialize();

      expect(db.getStats()).toEqual({ totalIntents: 2, nextId: 8 });
    });
  });
});
