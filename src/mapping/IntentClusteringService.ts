/**
 * Intent Clustering & Batch Mediation Service
 *
 * Groups similar intents together for efficient batch processing,
 * reducing redundant LLM calls and improving throughput.
 */

import { Intent, AlignmentCandidate, MediatorConfig } from '../types';
import { VectorDatabase } from './VectorDatabase';
import { logger } from '../utils/logger';

/**
 * Intent cluster containing similar intents
 */
export interface IntentCluster {
  clusterId: string;
  centroid: number[]; // Average embedding vector
  intents: Intent[];
  category?: string; // Semantic category (e.g., "engineering_services", "creative_work")
  createdAt: number;
  lastUpdated: number;
}

/**
 * Batch mediation result
 */
export interface BatchMediationResult {
  totalIntents: number;
  clusters: number;
  pairsEvaluated: number;
  candidatesFound: number;
  processingTimeMs: number;
  efficiency: number; // Pairs evaluated per second
}

/**
 * IntentClusteringService groups similar intents for batch processing
 *
 * Performance benefits:
 * - Reduces redundant embedding generation
 * - Enables parallel batch processing
 * - Improves cache hit rates
 * - Optimizes LLM API usage
 */
export class IntentClusteringService {
  private config: MediatorConfig;
  private vectorDb: VectorDatabase;
  private clusters: Map<string, IntentCluster> = new Map();
  private intentToCluster: Map<string, string> = new Map(); // intentHash -> clusterId

  // Clustering parameters
  private readonly SIMILARITY_THRESHOLD = 0.75; // Cosine similarity threshold for clustering
  private readonly MAX_CLUSTER_SIZE = 50; // Maximum intents per cluster
  private readonly MIN_BATCH_SIZE = 5; // Minimum intents to form a batch
  private readonly CLUSTER_TTL = 3600000; // 1 hour TTL for clusters

  constructor(config: MediatorConfig, vectorDb: VectorDatabase) {
    this.config = config;
    this.vectorDb = vectorDb;

    // Start cleanup interval
    setInterval(() => this.cleanupStaleClusters(), this.CLUSTER_TTL / 2);
  }

  /**
   * Add intent to clustering system
   *
   * @param intent - Intent to cluster
   * @param embedding - Intent embedding vector
   * @returns Cluster ID the intent was assigned to
   */
  public async addIntent(intent: Intent, embedding: number[]): Promise<string> {
    try {
      // Find nearest cluster
      const nearestCluster = this.findNearestCluster(embedding);

      if (nearestCluster && this.clusters.get(nearestCluster)!.intents.length < this.MAX_CLUSTER_SIZE) {
        // Add to existing cluster
        const cluster = this.clusters.get(nearestCluster)!;
        cluster.intents.push(intent);
        cluster.lastUpdated = Date.now();

        // Update centroid
        this.updateCentroid(cluster, embedding);

        this.intentToCluster.set(intent.hash, nearestCluster);

        logger.debug('Added intent to existing cluster', {
          intentHash: intent.hash,
          clusterId: nearestCluster,
          clusterSize: cluster.intents.length,
        });

        return nearestCluster;
      } else {
        // Create new cluster
        const clusterId = `cluster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const cluster: IntentCluster = {
          clusterId,
          centroid: [...embedding],
          intents: [intent],
          category: this.categorizeIntent(intent),
          createdAt: Date.now(),
          lastUpdated: Date.now(),
        };

        this.clusters.set(clusterId, cluster);
        this.intentToCluster.set(intent.hash, clusterId);

        logger.debug('Created new cluster', {
          clusterId,
          intentHash: intent.hash,
          category: cluster.category,
        });

        return clusterId;
      }
    } catch (error: any) {
      logger.error('Error adding intent to cluster', {
        error: error.message,
        intentHash: intent.hash,
      });
      throw error;
    }
  }

  /**
   * Get all clusters ready for batch mediation
   *
   * @returns Array of clusters with sufficient intents
   */
  public getBatchableClusters(): IntentCluster[] {
    return Array.from(this.clusters.values()).filter(
      (cluster) => cluster.intents.length >= this.MIN_BATCH_SIZE
    );
  }

  /**
   * Find cross-cluster alignment candidates
   *
   * Efficient algorithm that only compares clusters with complementary semantics
   *
   * @param maxPairs - Maximum candidate pairs to return
   * @returns Array of high-probability alignment candidates
   */
  public async findCrossClusterCandidates(maxPairs: number = 100): Promise<AlignmentCandidate[]> {
    const startTime = Date.now();
    const candidates: AlignmentCandidate[] = [];
    const clusters = Array.from(this.clusters.values());

    // Compare clusters pairwise
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const clusterA = clusters[i];
        const clusterB = clusters[j];

        // Check if clusters are complementary (not too similar, not too different)
        const clusterSimilarity = this.cosineSimilarity(clusterA.centroid, clusterB.centroid);

        if (clusterSimilarity > 0.3 && clusterSimilarity < 0.7) {
          // Promising complementary clusters - evaluate top pairs
          const pairCandidates = this.evaluateClusterPairs(clusterA, clusterB);
          candidates.push(...pairCandidates);

          if (candidates.length >= maxPairs) {
            break;
          }
        }
      }

      if (candidates.length >= maxPairs) {
        break;
      }
    }

    // Sort by similarity score and limit
    candidates.sort((a, b) => b.similarityScore - a.similarityScore);
    const topCandidates = candidates.slice(0, maxPairs);

    const duration = Date.now() - startTime;
    logger.info('Cross-cluster candidate search completed', {
      clusters: clusters.length,
      candidatesFound: topCandidates.length,
      durationMs: duration,
      efficiency: (candidates.length / (duration / 1000)).toFixed(2) + ' pairs/sec',
    });

    return topCandidates;
  }

  /**
   * Process a batch of intents from a single cluster
   *
   * @param clusterId - Cluster to process
   * @returns Mediation result statistics
   */
  public async processBatch(clusterId: string): Promise<BatchMediationResult> {
    const startTime = Date.now();
    const cluster = this.clusters.get(clusterId);

    if (!cluster) {
      throw new Error(`Cluster ${clusterId} not found`);
    }

    const intents = cluster.intents;
    const candidates: AlignmentCandidate[] = [];
    let pairsEvaluated = 0;

    // Evaluate all pairs within cluster
    for (let i = 0; i < intents.length; i++) {
      for (let j = i + 1; j < intents.length; j++) {
        pairsEvaluated++;

        // Get embeddings from cache or vector DB
        const similarity = await this.calculateIntentSimilarity(intents[i], intents[j]);

        if (similarity > 0.5) {
          candidates.push({
            intentA: intents[i],
            intentB: intents[j],
            similarityScore: similarity,
            estimatedValue: 0,
            priority: 1,
            reason: `Cluster ${clusterId}: ${cluster.category || 'unknown'}`,
          });
        }
      }
    }

    const duration = Date.now() - startTime;

    return {
      totalIntents: intents.length,
      clusters: 1,
      pairsEvaluated,
      candidatesFound: candidates.length,
      processingTimeMs: duration,
      efficiency: pairsEvaluated / (duration / 1000),
    };
  }

  /**
   * Get clustering statistics
   */
  public getStats(): {
    totalClusters: number;
    totalIntents: number;
    averageClusterSize: number;
    largestCluster: number;
    batchableClusters: number;
  } {
    const clusters = Array.from(this.clusters.values());
    const totalIntents = clusters.reduce((sum, c) => sum + c.intents.length, 0);
    const clusterSizes = clusters.map((c) => c.intents.length);

    return {
      totalClusters: clusters.length,
      totalIntents,
      averageClusterSize: totalIntents / (clusters.length || 1),
      largestCluster: Math.max(...clusterSizes, 0),
      batchableClusters: this.getBatchableClusters().length,
    };
  }

  /**
   * Find nearest cluster for an embedding
   */
  private findNearestCluster(embedding: number[]): string | null {
    let bestCluster: string | null = null;
    let bestSimilarity = this.SIMILARITY_THRESHOLD;

    for (const [clusterId, cluster] of this.clusters.entries()) {
      const similarity = this.cosineSimilarity(embedding, cluster.centroid);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestCluster = clusterId;
      }
    }

    return bestCluster;
  }

  /**
   * Update cluster centroid with new embedding
   */
  private updateCentroid(cluster: IntentCluster, newEmbedding: number[]): void {
    const n = cluster.intents.length;

    for (let i = 0; i < cluster.centroid.length; i++) {
      cluster.centroid[i] = ((cluster.centroid[i] * (n - 1)) + newEmbedding[i]) / n;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
  }

  /**
   * Evaluate pairs between two clusters
   */
  private evaluateClusterPairs(clusterA: IntentCluster, clusterB: IntentCluster): AlignmentCandidate[] {
    const candidates: AlignmentCandidate[] = [];

    // Sample intents from each cluster (limit for performance)
    const sampleSize = Math.min(10, Math.max(clusterA.intents.length, clusterB.intents.length));

    for (let i = 0; i < Math.min(sampleSize, clusterA.intents.length); i++) {
      for (let j = 0; j < Math.min(sampleSize, clusterB.intents.length); j++) {
        candidates.push({
          intentA: clusterA.intents[i],
          intentB: clusterB.intents[j],
          similarityScore: 0.6, // Placeholder - actual scoring done during mediation
          estimatedValue: 0,
          priority: 1,
          reason: `Cross-cluster: ${clusterA.category} <-> ${clusterB.category}`,
        });
      }
    }

    return candidates;
  }

  /**
   * Calculate similarity between two intents
   */
  private async calculateIntentSimilarity(intentA: Intent, intentB: Intent): Promise<number> {
    // Simplified similarity calculation
    // In production, use cached embeddings from vector DB
    const proseOverlap = this.calculateTextOverlap(intentA.prose, intentB.prose);
    const desireOverlap = this.calculateArrayOverlap(intentA.desires, intentB.desires);

    return (proseOverlap + desireOverlap) / 2;
  }

  /**
   * Calculate text overlap score
   */
  private calculateTextOverlap(textA: string, textB: string): number {
    const wordsA = new Set(textA.toLowerCase().split(/\s+/));
    const wordsB = new Set(textB.toLowerCase().split(/\s+/));

    let overlap = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) overlap++;
    }

    return overlap / Math.max(wordsA.size, wordsB.size);
  }

  /**
   * Calculate array overlap score
   */
  private calculateArrayOverlap(arrA: string[], arrB: string[]): number {
    if (arrA.length === 0 && arrB.length === 0) return 0.5;

    const setA = new Set(arrA.map((s) => s.toLowerCase()));
    const setB = new Set(arrB.map((s) => s.toLowerCase()));

    let overlap = 0;
    for (const item of setA) {
      if (setB.has(item)) overlap++;
    }

    return overlap / Math.max(setA.size, setB.size);
  }

  /**
   * Categorize intent based on content
   */
  private categorizeIntent(intent: Intent): string {
    const text = `${intent.prose} ${intent.desires.join(' ')}`.toLowerCase();

    // Simple keyword-based categorization
    const categories = {
      engineering: ['engineer', 'software', 'develop', 'code', 'api', 'system'],
      creative: ['design', 'art', 'creative', 'graphic', 'ui', 'ux'],
      writing: ['write', 'content', 'blog', 'article', 'copy'],
      consulting: ['consult', 'advise', 'strategy', 'analysis'],
      service: ['service', 'help', 'assist', 'support'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some((keyword) => text.includes(keyword))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Clean up stale clusters
   */
  private cleanupStaleClusters(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [clusterId, cluster] of this.clusters.entries()) {
      if (now - cluster.lastUpdated > this.CLUSTER_TTL) {
        // Remove cluster and intent mappings
        for (const intent of cluster.intents) {
          this.intentToCluster.delete(intent.hash);
        }

        this.clusters.delete(clusterId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up stale clusters', {
        cleaned,
        remaining: this.clusters.size,
      });
    }
  }
}
