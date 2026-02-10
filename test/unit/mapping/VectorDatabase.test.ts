/**
 * Unit Tests for VectorDatabase
 *
 * Tests cover:
 * - Index initialization (new and existing)
 * - Intent addition
 * - Vector similarity search
 * - Alignment candidate discovery
 * - Intent removal
 * - Persistence (save/load)
 * - Statistics
 * - Error handling
 */

import { MediatorConfig, Intent, ConsensusMode } from '../../../src/types';
import { VALID_INTENT_1, VALID_INTENT_2, VALID_INTENT_3, ALL_VALID_INTENTS } from '../../fixtures/intents';
import { createMockEmbedding } from '../../utils/testUtils';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock hnswlib-node - must be before VectorDatabase import
jest.mock('hnswlib-node');

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Import VectorDatabase AFTER mocks are set up
import { VectorDatabase } from '../../../src/mapping/VectorDatabase';

// Spy references for HNSW methods
let initIndexSpy: jest.SpyInstance;
let addPointSpy: jest.SpyInstance;
let searchKnnSpy: jest.SpyInstance;
let readIndexSpy: jest.SpyInstance;
let writeIndexSpy: jest.SpyInstance;

describe('VectorDatabase', () => {
  let config: MediatorConfig;
  let vectorDb: VectorDatabase;
  const testDbPath = '/tmp/test-vector-db';

  beforeEach(() => {
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
      vectorDbPath: testDbPath,
      vectorDimensions: 1024,
      maxIntentsCache: 100,
      acceptanceWindowHours: 72,
      logLevel: 'info',
    };

    // Get the mocked HierarchicalNSW class
    const { HierarchicalNSW } = jest.requireMock('hnswlib-node');

    // Set up spies on HierarchicalNSW prototype methods
    initIndexSpy = jest.spyOn(HierarchicalNSW.prototype, 'initIndex').mockImplementation(() => {});
    addPointSpy = jest.spyOn(HierarchicalNSW.prototype, 'addPoint').mockImplementation(() => {});
    searchKnnSpy = jest.spyOn(HierarchicalNSW.prototype, 'searchKnn').mockReturnValue({ neighbors: [], distances: [] });
    readIndexSpy = jest.spyOn(HierarchicalNSW.prototype, 'readIndex').mockResolvedValue(true);
    writeIndexSpy = jest.spyOn(HierarchicalNSW.prototype, 'writeIndex').mockResolvedValue(true);

    // Create VectorDatabase - uses manual mock from __mocks__/hnswlib-node.js
    vectorDb = new VectorDatabase(config);
  });

  afterEach(() => {
    // Restore all spies
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with config', () => {
      expect(vectorDb).toBeDefined();
    });

    it('should create HNSW index with correct dimensions', () => {
      const HierarchicalNSW = require('hnswlib-node').HierarchicalNSW;
      expect(HierarchicalNSW).toHaveBeenCalledWith('cosine', 1024);
    });

    it('should accept custom vector dimensions', () => {
      const customConfig = { ...config, vectorDimensions: 512 };
      const customVectorDb = new VectorDatabase(customConfig);
      const HierarchicalNSW = require('hnswlib-node').HierarchicalNSW;
      expect(HierarchicalNSW).toHaveBeenCalledWith('cosine', 512);
    });
  });

  describe('Initialization - New Index', () => {
    beforeEach(() => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockReturnValue(undefined);
    });

    it('should initialize new index when no existing index found', async () => {
      await vectorDb.initialize(10000);

      expect(initIndexSpy).toHaveBeenCalledWith(10000);
      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(testDbPath, { recursive: true });
    });

    it('should use default maxElements if not provided', async () => {
      await vectorDb.initialize();

      expect(initIndexSpy).toHaveBeenCalledWith(10000);
    });

    it('should accept custom maxElements', async () => {
      await vectorDb.initialize(5000);

      expect(initIndexSpy).toHaveBeenCalledWith(5000);
    });

    it('should create directory if it does not exist', async () => {
      await vectorDb.initialize();

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(testDbPath, { recursive: true });
    });

    it('should mark as initialized after successful init', async () => {
      await vectorDb.initialize();

      const stats = vectorDb.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('Initialization - Load Existing Index', () => {
    const indexPath = path.join(testDbPath, 'index.bin');
    const mapPath = path.join(testDbPath, 'intent-map.json');

    beforeEach(() => {
      // Mock file existence
      mockedFs.existsSync.mockImplementation((path: any) => {
        if (path === indexPath || path === mapPath) return true;
        return false;
      });
    });

    it('should load existing index when available', async () => {
      const mockIntentMap = {
        '0': VALID_INTENT_1,
        '1': VALID_INTENT_2,
      };

      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockIntentMap));

      await vectorDb.initialize();

      expect(readIndexSpy).toHaveBeenCalledWith(indexPath);
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(mapPath, 'utf-8');
    });

    it('should restore intent map from saved data', async () => {
      const mockIntentMap = {
        '0': VALID_INTENT_1,
        '1': VALID_INTENT_2,
      };

      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockIntentMap));

      await vectorDb.initialize();

      const stats = vectorDb.getStats();
      expect(stats.totalIntents).toBe(2);
    });

    it('should set nextId based on loaded intents', async () => {
      const mockIntentMap = {
        '0': VALID_INTENT_1,
        '5': VALID_INTENT_2,
      };

      mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockIntentMap));

      await vectorDb.initialize();

      const stats = vectorDb.getStats();
      expect(stats.nextId).toBe(6); // max(0, 5) + 1
    });

    it('should handle empty intent map', async () => {
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({}));

      await vectorDb.initialize();

      const stats = vectorDb.getStats();
      expect(stats.totalIntents).toBe(0);
    });

    it('should load index even if map file missing', async () => {
      mockedFs.existsSync.mockImplementation((path: any) => {
        if (path === indexPath) return true;
        return false;
      });

      await vectorDb.initialize();

      expect(readIndexSpy).toHaveBeenCalledWith(indexPath);
    });
  });

  describe('Initialization - Error Handling', () => {
    it('should throw error if index creation fails', async () => {
      mockedFs.existsSync.mockReturnValue(false);
      initIndexSpy.mockImplementation(() => {
        throw new Error('Index creation failed');
      });

      await expect(vectorDb.initialize()).rejects.toThrow('Index creation failed');
    });

    it('should throw error if index loading fails', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      readIndexSpy.mockImplementation(() => {
        throw new Error('Index load failed');
      });

      await expect(vectorDb.initialize()).rejects.toThrow('Index load failed');
    });

    it('should handle corrupted intent map file gracefully', async () => {
      const indexPath = path.join(testDbPath, 'index.bin');
      const mapPath = path.join(testDbPath, 'intent-map.json');
      mockedFs.existsSync.mockImplementation((path: any) => {
        return path === indexPath || path === mapPath;
      });
      mockedFs.readFileSync.mockReturnValue('invalid json {]');

      // Implementation gracefully handles corrupted JSON — logs error, starts with empty map
      await expect(vectorDb.initialize()).resolves.not.toThrow();
    });
  });

  describe('Adding Intents', () => {
    beforeEach(async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockReturnValue(undefined);
      await vectorDb.initialize();
    });

    it('should add intent with embedding', async () => {
      const embedding = createMockEmbedding(1024);

      await vectorDb.addIntent(VALID_INTENT_1, embedding);

      expect(addPointSpy).toHaveBeenCalledWith(embedding, 0);
    });

    it('should increment ID for each intent', async () => {
      const embedding1 = createMockEmbedding(1024);
      const embedding2 = createMockEmbedding(1024);

      await vectorDb.addIntent(VALID_INTENT_1, embedding1);
      await vectorDb.addIntent(VALID_INTENT_2, embedding2);

      expect(addPointSpy).toHaveBeenCalledWith(embedding1, 0);
      expect(addPointSpy).toHaveBeenCalledWith(embedding2, 1);
    });

    it('should track intents in map', async () => {
      const embedding = createMockEmbedding(1024);

      await vectorDb.addIntent(VALID_INTENT_1, embedding);

      const stats = vectorDb.getStats();
      expect(stats.totalIntents).toBe(1);
    });

    it('should handle multiple intents', async () => {
      for (const intent of ALL_VALID_INTENTS) {
        const embedding = createMockEmbedding(1024);
        await vectorDb.addIntent(intent, embedding);
      }

      const stats = vectorDb.getStats();
      expect(stats.totalIntents).toBe(ALL_VALID_INTENTS.length);
    });

    it('should throw error if not initialized', async () => {
      const uninitializedDb = new VectorDatabase(config);
      const embedding = createMockEmbedding(1024);

      await expect(uninitializedDb.addIntent(VALID_INTENT_1, embedding))
        .rejects.toThrow('Vector database not initialized');
    });

    it('should handle embedding with different dimensions gracefully', async () => {
      const wrongDimensionEmbedding = createMockEmbedding(512);

      // This should fail at HNSW level
      addPointSpy.mockImplementation(() => {
        throw new Error('Dimension mismatch');
      });

      await expect(vectorDb.addIntent(VALID_INTENT_1, wrongDimensionEmbedding))
        .rejects.toThrow();
    });
  });

  describe('Finding Similar Intents', () => {
    beforeEach(async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockReturnValue(undefined);
      await vectorDb.initialize();

      // Add some test intents
      await vectorDb.addIntent(VALID_INTENT_1, createMockEmbedding(1024));
      await vectorDb.addIntent(VALID_INTENT_2, createMockEmbedding(1024));
      await vectorDb.addIntent(VALID_INTENT_3, createMockEmbedding(1024));
    });

    it('should find similar intents', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [0, 1],
        distances: [0.1, 0.2],
      });

      const queryEmbedding = createMockEmbedding(1024);
      const candidates = await vectorDb.findSimilarIntents(queryEmbedding, 5);

      expect(searchKnnSpy).toHaveBeenCalledWith(queryEmbedding, 10); // k * 2
      expect(candidates.length).toBeGreaterThan(0);
    });

    it('should convert distance to similarity score', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [0],
        distances: [0.3], // distance
      });

      const queryEmbedding = createMockEmbedding(1024);
      const candidates = await vectorDb.findSimilarIntents(queryEmbedding, 5);

      expect(candidates[0].similarityScore).toBe(0.7); // 1 - 0.3
    });

    it('should filter out low similarity results', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [0, 1],
        distances: [0.1, 0.6], // second one is below 0.5 similarity
      });

      const queryEmbedding = createMockEmbedding(1024);
      const candidates = await vectorDb.findSimilarIntents(queryEmbedding, 5);

      expect(candidates.length).toBe(1); // Only first result passes threshold
    });

    it('should exclude specified hash', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [0, 1, 2],
        distances: [0.1, 0.2, 0.3],
      });

      const queryEmbedding = createMockEmbedding(1024);
      const candidates = await vectorDb.findSimilarIntents(
        queryEmbedding,
        5,
        VALID_INTENT_1.hash
      );

      // Intent 0 should be excluded
      expect(candidates.every(c => c.intentB.hash !== VALID_INTENT_1.hash)).toBe(true);
    });

    it('should respect k parameter', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [0, 1, 2],
        distances: [0.1, 0.2, 0.3],
      });

      const queryEmbedding = createMockEmbedding(1024);
      const candidates = await vectorDb.findSimilarIntents(queryEmbedding, 2);

      expect(candidates.length).toBeLessThanOrEqual(2);
    });

    it('should calculate priority based on similarity and fee', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [0],
        distances: [0.2],
      });

      const queryEmbedding = createMockEmbedding(1024);
      const candidates = await vectorDb.findSimilarIntents(queryEmbedding, 5);

      const expectedSimilarity = 0.8; // 1 - 0.2
      const expectedFee = VALID_INTENT_1.offeredFee || 1;
      expect(candidates[0].priority).toBe(expectedSimilarity * expectedFee);
    });

    it('should handle empty search results', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [],
        distances: [],
      });

      const queryEmbedding = createMockEmbedding(1024);
      const candidates = await vectorDb.findSimilarIntents(queryEmbedding, 5);

      expect(candidates).toEqual([]);
    });

    it('should handle search errors gracefully', async () => {
      searchKnnSpy.mockImplementation(() => {
        throw new Error('Search failed');
      });

      const queryEmbedding = createMockEmbedding(1024);
      const candidates = await vectorDb.findSimilarIntents(queryEmbedding, 5);

      expect(candidates).toEqual([]); // Returns empty array instead of throwing
    });

    it('should throw error if not initialized', async () => {
      const uninitializedDb = new VectorDatabase(config);
      const queryEmbedding = createMockEmbedding(1024);

      await expect(uninitializedDb.findSimilarIntents(queryEmbedding, 5))
        .rejects.toThrow('Vector database not initialized');
    });
  });

  describe('Finding Top Alignment Candidates', () => {
    beforeEach(async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockReturnValue(undefined);
      await vectorDb.initialize();

      // Add test intents
      await vectorDb.addIntent(VALID_INTENT_1, createMockEmbedding(1024));
      await vectorDb.addIntent(VALID_INTENT_2, createMockEmbedding(1024));
      await vectorDb.addIntent(VALID_INTENT_3, createMockEmbedding(1024));
    });

    it('should find alignment candidates for multiple intents', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [1],
        distances: [0.2],
      });

      const embeddings = new Map([
        [VALID_INTENT_1.hash, createMockEmbedding(1024)],
        [VALID_INTENT_2.hash, createMockEmbedding(1024)],
      ]);

      const candidates = await vectorDb.findTopAlignmentCandidates(
        [VALID_INTENT_1, VALID_INTENT_2],
        embeddings,
        20
      );

      expect(candidates.length).toBeGreaterThan(0);
    });

    it('should sort candidates by priority', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [1, 2],
        distances: [0.1, 0.3],
      });

      const embeddings = new Map([
        [VALID_INTENT_1.hash, createMockEmbedding(1024)],
      ]);

      const candidates = await vectorDb.findTopAlignmentCandidates(
        [VALID_INTENT_1],
        embeddings,
        20
      );

      // Check that candidates are sorted descending by priority
      for (let i = 0; i < candidates.length - 1; i++) {
        expect(candidates[i].priority).toBeGreaterThanOrEqual(candidates[i + 1].priority);
      }
    });

    it('should respect topK parameter', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [1, 2],
        distances: [0.1, 0.2],
      });

      const embeddings = new Map([
        [VALID_INTENT_1.hash, createMockEmbedding(1024)],
        [VALID_INTENT_2.hash, createMockEmbedding(1024)],
      ]);

      const candidates = await vectorDb.findTopAlignmentCandidates(
        [VALID_INTENT_1, VALID_INTENT_2],
        embeddings,
        2
      );

      expect(candidates.length).toBeLessThanOrEqual(2);
    });

    it('should calculate combined estimated value', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [1],
        distances: [0.2],
      });

      const embeddings = new Map([
        [VALID_INTENT_1.hash, createMockEmbedding(1024)],
      ]);

      const candidates = await vectorDb.findTopAlignmentCandidates(
        [VALID_INTENT_1],
        embeddings,
        20
      );

      expect(candidates[0].estimatedValue).toBeGreaterThan(0);
    });

    it('should skip intents without embeddings', async () => {
      const embeddings = new Map([
        [VALID_INTENT_1.hash, createMockEmbedding(1024)],
        // VALID_INTENT_2 has no embedding
      ]);

      const candidates = await vectorDb.findTopAlignmentCandidates(
        [VALID_INTENT_1, VALID_INTENT_2],
        embeddings,
        20
      );

      // Should only process VALID_INTENT_1
      expect(candidates.every(c => c.intentA.hash === VALID_INTENT_1.hash)).toBe(true);
    });

    it('should handle empty intent list', async () => {
      const embeddings = new Map();
      const candidates = await vectorDb.findTopAlignmentCandidates([], embeddings, 20);

      expect(candidates).toEqual([]);
    });

    it('should handle empty embeddings map', async () => {
      const embeddings = new Map();
      const candidates = await vectorDb.findTopAlignmentCandidates(
        [VALID_INTENT_1],
        embeddings,
        20
      );

      expect(candidates).toEqual([]);
    });
  });

  describe('Removing Intents', () => {
    beforeEach(async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockReturnValue(undefined);
      await vectorDb.initialize();

      await vectorDb.addIntent(VALID_INTENT_1, createMockEmbedding(1024));
      await vectorDb.addIntent(VALID_INTENT_2, createMockEmbedding(1024));
    });

    it('should remove intent from map', () => {
      vectorDb.removeIntent(VALID_INTENT_1.hash);

      const stats = vectorDb.getStats();
      expect(stats.totalIntents).toBe(1);
    });

    it('should handle non-existent hash gracefully', () => {
      const statsBefore = vectorDb.getStats();
      vectorDb.removeIntent('non-existent-hash');
      const statsAfter = vectorDb.getStats();

      expect(statsAfter.totalIntents).toBe(statsBefore.totalIntents);
    });

    it('should remove correct intent when multiple exist', () => {
      vectorDb.removeIntent(VALID_INTENT_1.hash);

      // VALID_INTENT_2 should still be there
      const stats = vectorDb.getStats();
      expect(stats.totalIntents).toBe(1);
    });
  });

  describe('Persistence - Save', () => {
    beforeEach(async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockReturnValue(undefined);
      mockedFs.writeFileSync.mockReturnValue(undefined);
      await vectorDb.initialize();

      await vectorDb.addIntent(VALID_INTENT_1, createMockEmbedding(1024));
      await vectorDb.addIntent(VALID_INTENT_2, createMockEmbedding(1024));
    });

    it('should save index to disk', async () => {
      await vectorDb.save();

      const indexPath = path.join(testDbPath, 'index.bin');
      expect(writeIndexSpy).toHaveBeenCalledWith(indexPath);
    });

    it('should save intent map to JSON', async () => {
      await vectorDb.save();

      const mapPath = path.join(testDbPath, 'intent-map.json');
      expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
        mapPath,
        expect.any(String)
      );
    });

    it('should create directory if it does not exist', async () => {
      mockedFs.existsSync.mockReturnValue(false);

      await vectorDb.save();

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(testDbPath, { recursive: true });
    });

    it('should throw error if save fails', async () => {
      writeIndexSpy.mockImplementation(() => {
        throw new Error('Write failed');
      });

      await expect(vectorDb.save()).rejects.toThrow('Write failed');
    });

    it('should save valid JSON format', async () => {
      await vectorDb.save();

      const writeCall = mockedFs.writeFileSync.mock.calls[0];
      const jsonString = writeCall[1] as string;

      expect(() => JSON.parse(jsonString)).not.toThrow();
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockReturnValue(undefined);
      await vectorDb.initialize();
    });

    it('should return correct total intents', async () => {
      await vectorDb.addIntent(VALID_INTENT_1, createMockEmbedding(1024));
      await vectorDb.addIntent(VALID_INTENT_2, createMockEmbedding(1024));

      const stats = vectorDb.getStats();
      expect(stats.totalIntents).toBe(2);
    });

    it('should return correct nextId', async () => {
      await vectorDb.addIntent(VALID_INTENT_1, createMockEmbedding(1024));

      const stats = vectorDb.getStats();
      expect(stats.nextId).toBe(1);
    });

    it('should update stats after adding intents', async () => {
      const stats1 = vectorDb.getStats();
      await vectorDb.addIntent(VALID_INTENT_1, createMockEmbedding(1024));
      const stats2 = vectorDb.getStats();

      expect(stats2.totalIntents).toBe(stats1.totalIntents + 1);
      expect(stats2.nextId).toBe(stats1.nextId + 1);
    });

    it('should update stats after removing intents', async () => {
      await vectorDb.addIntent(VALID_INTENT_1, createMockEmbedding(1024));
      const stats1 = vectorDb.getStats();

      vectorDb.removeIntent(VALID_INTENT_1.hash);
      const stats2 = vectorDb.getStats();

      expect(stats2.totalIntents).toBe(stats1.totalIntents - 1);
    });

    it('should return stats for empty database', () => {
      const stats = vectorDb.getStats();

      expect(stats.totalIntents).toBe(0);
      expect(stats.nextId).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(async () => {
      mockedFs.existsSync.mockReturnValue(false);
      mockedFs.mkdirSync.mockReturnValue(undefined);
      await vectorDb.initialize();
    });

    it('should handle zero-vector embedding', async () => {
      const zeroEmbedding = new Array(1024).fill(0);
      await expect(vectorDb.addIntent(VALID_INTENT_1, zeroEmbedding))
        .resolves.not.toThrow();
    });

    it('should handle negative values in embedding', async () => {
      const negativeEmbedding = new Array(1024).fill(-0.5);
      await expect(vectorDb.addIntent(VALID_INTENT_1, negativeEmbedding))
        .resolves.not.toThrow();
    });

    it('should handle very large embeddings', async () => {
      const largeEmbedding = createMockEmbedding(4096);
      // This should work if config is set correctly, or fail at HNSW level
      await expect(vectorDb.addIntent(VALID_INTENT_1, largeEmbedding))
        .resolves.not.toThrow();
    });

    it('should handle many intents efficiently', async () => {
      const manyIntents = 100;
      for (let i = 0; i < manyIntents; i++) {
        const intent = { ...VALID_INTENT_1, hash: `intent_${i}` };
        await vectorDb.addIntent(intent, createMockEmbedding(1024));
      }

      const stats = vectorDb.getStats();
      expect(stats.totalIntents).toBe(manyIntents);
    });

    it('should handle search with no intents added', async () => {
      searchKnnSpy.mockReturnValue({
        neighbors: [],
        distances: [],
      });

      const queryEmbedding = createMockEmbedding(1024);
      const candidates = await vectorDb.findSimilarIntents(queryEmbedding, 5);

      expect(candidates).toEqual([]);
    });

    it('should handle intent with undefined offeredFee', async () => {
      const intentNoFee = { ...VALID_INTENT_1 };
      delete (intentNoFee as any).offeredFee;

      await vectorDb.addIntent(intentNoFee, createMockEmbedding(1024));

      searchKnnSpy.mockReturnValue({
        neighbors: [0],
        distances: [0.2],
      });

      const candidates = await vectorDb.findSimilarIntents(createMockEmbedding(1024), 5);
      expect(candidates[0].estimatedValue).toBe(0);
      expect(candidates[0].priority).toBeGreaterThan(0); // Uses 1 as fallback
    });
  });
});
