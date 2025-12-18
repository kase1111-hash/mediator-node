import { HierarchicalNSW } from 'hnswlib-node';
import { Intent, AlignmentCandidate, MediatorConfig } from '../types';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * VectorDatabase manages semantic embeddings of intents
 * and provides similarity search capabilities
 */
export class VectorDatabase {
  private config: MediatorConfig;
  private index: HierarchicalNSW;
  private intentMap: Map<number, Intent> = new Map();
  private nextId: number = 0;
  private isInitialized: boolean = false;

  constructor(config: MediatorConfig) {
    this.config = config;
    this.index = new HierarchicalNSW('cosine', config.vectorDimensions);
  }

  /**
   * Initialize the vector database
   */
  public async initialize(maxElements: number = 10000): Promise<void> {
    try {
      // Try to load existing index
      const indexPath = path.join(this.config.vectorDbPath, 'index.bin');

      if (fs.existsSync(indexPath)) {
        logger.info('Loading existing vector index', { path: indexPath });
        this.index.readIndex(indexPath);

        // Load intent map
        const mapPath = path.join(this.config.vectorDbPath, 'intent-map.json');
        if (fs.existsSync(mapPath)) {
          const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
          this.intentMap = new Map(Object.entries(mapData).map(([k, v]) => [parseInt(k), v as Intent]));
          this.nextId = Math.max(...Array.from(this.intentMap.keys()), 0) + 1;
        }
      } else {
        // Create new index
        logger.info('Creating new vector index', { maxElements });
        this.index.initIndex(maxElements);

        // Ensure directory exists
        if (!fs.existsSync(this.config.vectorDbPath)) {
          fs.mkdirSync(this.config.vectorDbPath, { recursive: true });
        }
      }

      this.isInitialized = true;
      logger.info('Vector database initialized', { intents: this.intentMap.size });
    } catch (error) {
      logger.error('Error initializing vector database', { error });
      throw error;
    }
  }

  /**
   * Add an intent to the vector database
   */
  public async addIntent(intent: Intent, embedding: number[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Vector database not initialized');
    }

    try {
      const id = this.nextId++;

      this.index.addPoint(embedding, id);
      this.intentMap.set(id, intent);

      logger.debug('Added intent to vector database', {
        id,
        hash: intent.hash,
        totalIntents: this.intentMap.size,
      });
    } catch (error) {
      logger.error('Error adding intent to vector database', { error, intent: intent.hash });
      throw error;
    }
  }

  /**
   * Find similar intents using vector search
   */
  public async findSimilarIntents(
    embedding: number[],
    k: number = 10,
    excludeHash?: string
  ): Promise<AlignmentCandidate[]> {
    if (!this.isInitialized) {
      throw new Error('Vector database not initialized');
    }

    try {
      const result = this.index.searchKnn(embedding, k * 2); // Get more to allow filtering

      const candidates: AlignmentCandidate[] = [];

      for (let i = 0; i < result.neighbors.length && candidates.length < k; i++) {
        const id = result.neighbors[i];
        const distance = result.distances[i];
        const intent = this.intentMap.get(id);

        if (!intent || (excludeHash && intent.hash === excludeHash)) {
          continue;
        }

        // Convert distance to similarity score (cosine similarity)
        const similarityScore = 1 - distance;

        // Only include if similarity is above threshold
        if (similarityScore < 0.5) {
          continue;
        }

        // Create placeholder for intentA (will be filled by caller)
        candidates.push({
          intentA: intent, // This will be replaced by the query intent
          intentB: intent,
          similarityScore,
          estimatedValue: intent.offeredFee || 0,
          priority: similarityScore * (intent.offeredFee || 1),
        });
      }

      logger.debug('Found similar intents', {
        queriedEmbedding: embedding.length,
        candidates: candidates.length,
      });

      return candidates;
    } catch (error) {
      logger.error('Error finding similar intents', { error });
      return [];
    }
  }

  /**
   * Find alignment candidates between all cached intents
   */
  public async findTopAlignmentCandidates(
    intents: Intent[],
    embeddings: Map<string, number[]>,
    topK: number = 20
  ): Promise<AlignmentCandidate[]> {
    const candidates: AlignmentCandidate[] = [];

    for (const intent of intents) {
      const embedding = embeddings.get(intent.hash);
      if (!embedding) continue;

      const similar = await this.findSimilarIntents(embedding, 5, intent.hash);

      for (const candidate of similar) {
        candidates.push({
          intentA: intent,
          intentB: candidate.intentB,
          similarityScore: candidate.similarityScore,
          estimatedValue: (intent.offeredFee || 0) + (candidate.intentB.offeredFee || 0),
          priority: candidate.similarityScore * ((intent.offeredFee || 1) + (candidate.intentB.offeredFee || 1)),
        });
      }
    }

    // Sort by priority and return top K
    candidates.sort((a, b) => b.priority - a.priority);

    return candidates.slice(0, topK);
  }

  /**
   * Remove an intent from the database
   */
  public removeIntent(hash: string): void {
    for (const [id, intent] of this.intentMap.entries()) {
      if (intent.hash === hash) {
        this.intentMap.delete(id);
        // Note: HNSW doesn't support deletion, so we just remove from map
        logger.debug('Removed intent from vector database', { hash });
        break;
      }
    }
  }

  /**
   * Save the index to disk
   */
  public async save(): Promise<void> {
    try {
      const indexPath = path.join(this.config.vectorDbPath, 'index.bin');
      const mapPath = path.join(this.config.vectorDbPath, 'intent-map.json');

      // Ensure directory exists
      if (!fs.existsSync(this.config.vectorDbPath)) {
        fs.mkdirSync(this.config.vectorDbPath, { recursive: true });
      }

      this.index.writeIndex(indexPath);

      // Save intent map
      const mapData = Object.fromEntries(this.intentMap.entries());
      fs.writeFileSync(mapPath, JSON.stringify(mapData, null, 2));

      logger.info('Saved vector database', { path: this.config.vectorDbPath });
    } catch (error) {
      logger.error('Error saving vector database', { error });
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  public getStats(): { totalIntents: number; nextId: number } {
    return {
      totalIntents: this.intentMap.size,
      nextId: this.nextId,
    };
  }
}
