import { MediatorConfig, AlignmentCandidate, ProposedSettlement } from './types';
import { IntentIngester } from './ingestion/IntentIngester';
import { VectorDatabase } from './mapping/VectorDatabase';
import { LLMProvider } from './llm/LLMProvider';
import { SettlementManager } from './settlement/SettlementManager';
import { ReputationTracker } from './reputation/ReputationTracker';
import { ChallengeDetector } from './challenge/ChallengeDetector';
import { ChallengeManager } from './challenge/ChallengeManager';
import { HealthServer, HealthStatusProvider } from './monitoring/HealthServer';
import { ChainClient } from './chain';
import { logger } from './utils/logger';

/**
 * MediatorNode - Main orchestrator for the NatLangChain mediator
 * Implements the four-stage alignment cycle:
 * 1. Ingestion
 * 2. Mapping
 * 3. Negotiation
 * 4. Submission
 */
export class MediatorNode {
  private config: MediatorConfig;
  private ingester: IntentIngester;
  private vectorDb: VectorDatabase;
  private llmProvider: LLMProvider;
  private settlementManager: SettlementManager;
  private reputationTracker: ReputationTracker;
  private challengeDetector: ChallengeDetector;
  private challengeManager: ChallengeManager;
  private healthServer?: HealthServer;
  private chainClient: ChainClient;

  private isRunning: boolean = false;
  private cycleInterval: NodeJS.Timeout | null = null;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(config: MediatorConfig) {
    this.config = config;

    // Initialize chain client
    this.chainClient = ChainClient.fromConfig(config);

    // Initialize core components
    this.ingester = new IntentIngester(config);
    this.vectorDb = new VectorDatabase(config);
    this.llmProvider = new LLMProvider(config);
    this.reputationTracker = new ReputationTracker(config);

    // Initialize settlement manager
    this.settlementManager = new SettlementManager(config);

    // Initialize challenge system
    this.challengeDetector = new ChallengeDetector(config, this.llmProvider);
    this.challengeManager = new ChallengeManager(config, this.reputationTracker);

    logger.info('Mediator node created', {
      mediatorId: config.mediatorPublicKey,
      consensusMode: config.consensusMode,
      challengeSubmissionEnabled: config.enableChallengeSubmission || false,
    });
  }

  /**
   * Initialize and start the mediator node
   */
  public async start(): Promise<void> {
    logger.info('Starting mediator node...');

    try {
      // Initialize vector database
      await this.vectorDb.initialize();

      // Load reputation
      await this.reputationTracker.loadReputation();

      // Start intent ingestion
      const intentPollingInterval = this.config.intentPollingIntervalMs || 10000;
      this.ingester.startPolling(intentPollingInterval);

      // Start alignment cycle
      this.isRunning = true;
      this.runAlignmentCycle();

      // Start settlement monitoring
      this.startSettlementMonitoring();

      // Start challenge monitoring if enabled
      if (this.config.enableChallengeSubmission) {
        this.startChallengeMonitoring();
      }

      // Start health server
      if (this.config.healthServerPort) {
        this.healthServer = new HealthServer({ port: this.config.healthServerPort });
        this.healthServer.setStatusProvider(this.getHealthStatus());
        await this.healthServer.start();
      }

      logger.info('Mediator node started successfully', {
        reputation: this.reputationTracker.getWeight(),
        challengeSubmission: this.config.enableChallengeSubmission || false,
      });
    } catch (error) {
      logger.error('Error starting mediator node', { error });
      throw error;
    }
  }

  /**
   * Stop the mediator node
   */
  public async stop(): Promise<void> {
    logger.info('Stopping mediator node...');

    this.isRunning = false;

    if (this.cycleInterval) {
      clearInterval(this.cycleInterval);
      this.cycleInterval = null;
    }

    this.ingester.stopPolling();

    // Perform async cleanup
    const cleanupOperations: Promise<void>[] = [];

    cleanupOperations.push(
      this.vectorDb.save().then(() => {
        logger.debug('Vector database saved');
      })
    );

    if (this.healthServer) {
      cleanupOperations.push(
        this.healthServer.stop().then(() => {
          logger.debug('Health server stopped');
        })
      );
    }

    const results = await Promise.allSettled(cleanupOperations);
    results.forEach((result) => {
      if (result.status === 'rejected') {
        logger.error('Cleanup operation failed', {
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        });
      }
    });

    logger.info('Mediator node stopped');
  }

  /**
   * Run the alignment cycle
   */
  private async runAlignmentCycle(): Promise<void> {
    const alignmentCycleInterval = this.config.alignmentCycleIntervalMs || 30000;
    logger.info('Starting alignment cycle', { intervalMs: alignmentCycleInterval });

    this.cycleInterval = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.executeAlignmentCycle();
      } catch (error) {
        logger.error('Unhandled error in alignment cycle interval', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, alignmentCycleInterval);

    // Run initial cycle
    await this.executeAlignmentCycle();
  }

  /**
   * Execute a single alignment cycle iteration
   */
  private async executeAlignmentCycle(): Promise<void> {
    try {
      logger.debug('Starting alignment cycle');

      // Phase 1: Ingestion (already running in background via IntentIngester)
      const intents = this.ingester.getPrioritizedIntents();

      if (intents.length === 0) {
        logger.debug('No intents to process');
        return;
      }

      logger.info('Alignment cycle: Processing intents', { count: intents.length });

      // Phase 2: Mapping - Generate embeddings and find candidates
      for (const intent of intents) {
        if (!this.embeddingCache.has(intent.hash)) {
          const embedding = await this.llmProvider.generateEmbedding(intent.prose);
          this.embeddingCache.set(intent.hash, embedding);
          await this.vectorDb.addIntent(intent, embedding);
        }
      }

      // Find top alignment candidates
      const candidates = await this.vectorDb.findTopAlignmentCandidates(
        intents,
        this.embeddingCache,
        10
      );

      logger.info('Found alignment candidates', { count: candidates.length });

      // Phase 3: Negotiation - Simulate alignment for top candidates
      for (const candidate of candidates.slice(0, 3)) {
        await this.processAlignmentCandidate(candidate);
      }

      // Cleanup old embeddings
      this.cleanupEmbeddingCache();

      logger.debug('Alignment cycle completed');
    } catch (error) {
      logger.error('Error in alignment cycle', { error });
    }
  }

  /**
   * Process a single alignment candidate
   */
  private async processAlignmentCandidate(candidate: AlignmentCandidate): Promise<void> {
    try {
      logger.info('Processing alignment candidate', {
        intentA: candidate.intentA.hash,
        intentB: candidate.intentB.hash,
        similarity: candidate.similarityScore,
      });

      // Phase 3: Negotiation
      const negotiationResult = await this.llmProvider.negotiateAlignment(
        candidate.intentA,
        candidate.intentB
      );

      if (!negotiationResult.success) {
        logger.info('Negotiation failed', {
          intentA: candidate.intentA.hash,
          intentB: candidate.intentB.hash,
          reason: negotiationResult.reasoning,
        });
        return;
      }

      // Phase 4: Submission
      const settlement = this.settlementManager.createSettlement(
        candidate.intentA,
        candidate.intentB,
        negotiationResult
      );

      const submitted = await this.settlementManager.submitSettlement(settlement);

      if (submitted) {
        logger.info('Settlement submitted successfully', {
          settlementId: settlement.id,
          intentA: candidate.intentA.hash,
          intentB: candidate.intentB.hash,
        });
      }
    } catch (error) {
      logger.error('Error processing alignment candidate', { error });
    }
  }

  /**
   * Start monitoring settlements for acceptance/closure
   */
  private startSettlementMonitoring(): void {
    const settlementMonitoringInterval = this.config.settlementMonitoringIntervalMs || 60000;
    logger.info('Starting settlement monitoring', { intervalMs: settlementMonitoringInterval });

    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.settlementManager.monitorSettlements();
      } catch (error) {
        logger.error('Error in settlement monitoring interval', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, settlementMonitoringInterval);
  }

  /**
   * Start challenge monitoring
   */
  private startChallengeMonitoring(): void {
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.challengeManager.monitorChallenges();
      } catch (error) {
        logger.error('Error in challenge monitoring interval', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, 60000);

    const checkInterval = this.config.challengeCheckInterval || 60000;
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.scanForChallengeableSettlements();
      } catch (error) {
        logger.error('Error in challengeable settlements scan interval', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, checkInterval);
  }

  /**
   * Scan for settlements from other mediators that may contain contradictions
   */
  private async scanForChallengeableSettlements(): Promise<void> {
    try {
      const settlements = await this.chainClient.getRecentSettlements(20);

      const otherSettlements = settlements.filter(
        (settlement: ProposedSettlement) =>
          settlement.mediatorId !== this.config.mediatorPublicKey &&
          settlement.status === 'proposed'
      );

      logger.debug('Scanning settlements for contradictions', {
        count: otherSettlements.length,
      });

      for (const settlement of otherSettlements) {
        const existingChallenges =
          this.challengeManager.getChallengesForSettlement(settlement.id);

        if (existingChallenges.length > 0) {
          continue;
        }

        const [intentA, intentB] = await Promise.all([
          this.chainClient.getIntent(settlement.intentHashA),
          this.chainClient.getIntent(settlement.intentHashB),
        ]);

        if (!intentA || !intentB) {
          continue;
        }

        const analysis = await this.challengeDetector.analyzeSettlement(
          settlement,
          intentA,
          intentB
        );

        if (!analysis) {
          continue;
        }

        if (this.challengeDetector.shouldChallenge(analysis)) {
          logger.info('Detected contradiction, submitting challenge', {
            settlementId: settlement.id,
            confidence: analysis.confidence,
            severity: analysis.severity,
          });

          const result = await this.challengeManager.submitChallenge(
            settlement,
            analysis
          );

          if (result.success) {
            logger.info('Challenge submitted successfully', {
              challengeId: result.challengeId,
              settlementId: settlement.id,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error scanning for challengeable settlements', { error });
    }
  }

  /**
   * Cleanup old embeddings from cache
   */
  private cleanupEmbeddingCache(): void {
    const currentIntentHashes = new Set(
      this.ingester.getCachedIntents().map(i => i.hash)
    );

    for (const hash of this.embeddingCache.keys()) {
      if (!currentIntentHashes.has(hash)) {
        this.embeddingCache.delete(hash);
      }
    }
  }

  /**
   * Get health status provider for the health server
   */
  private getHealthStatus(): HealthStatusProvider {
    return Object.defineProperties({} as HealthStatusProvider, {
      isRunning: { get: () => this.isRunning, enumerable: true },
      cachedIntents: { get: () => this.ingester.getCachedIntents().length, enumerable: true },
      activeSettlements: { get: () => this.settlementManager.getActiveSettlements().length, enumerable: true },
      reputation: { get: () => this.reputationTracker.getWeight(), enumerable: true },
    });
  }

  /**
   * Get node status
   */
  public getStatus(): {
    isRunning: boolean;
    cachedIntents: number;
    activeSettlements: number;
    reputation: number;
    challengeStats?: {
      total: number;
      pending: number;
      upheld: number;
      rejected: number;
      successRate: number;
    };
  } {
    const status: any = {
      isRunning: this.isRunning,
      cachedIntents: this.ingester.getCachedIntents().length,
      activeSettlements: this.settlementManager.getActiveSettlements().length,
      reputation: this.reputationTracker.getWeight(),
    };

    if (this.config.enableChallengeSubmission) {
      status.challengeStats = this.challengeManager.getChallengeStats();
    }

    return status;
  }

  /**
   * Get IntentIngester instance
   */
  public getIntentIngester(): IntentIngester {
    return this.ingester;
  }

  /**
   * Get SettlementManager instance
   */
  public getSettlementManager(): SettlementManager {
    return this.settlementManager;
  }

  /**
   * Get ChallengeDetector instance
   */
  public getChallengeDetector(): ChallengeDetector {
    return this.challengeDetector;
  }

  /**
   * Get ChallengeManager instance
   */
  public getChallengeManager(): ChallengeManager {
    return this.challengeManager;
  }
}
