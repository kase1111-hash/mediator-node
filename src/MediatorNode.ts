import { MediatorConfig, AlignmentCandidate, ProposedSettlement } from './types';
import { IntentIngester } from './ingestion/IntentIngester';
import { VectorDatabase } from './mapping/VectorDatabase';
import { LLMProvider } from './llm/LLMProvider';
import { SettlementManager } from './settlement/SettlementManager';
import { ReputationTracker } from './reputation/ReputationTracker';
import { StakeManager } from './consensus/StakeManager';
import { AuthorityManager } from './consensus/AuthorityManager';
import { BurnManager } from './burn/BurnManager';
import { LoadMonitor } from './burn/LoadMonitor';
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
  private stakeManager: StakeManager;
  private authorityManager: AuthorityManager;
  private burnManager: BurnManager;
  private loadMonitor: LoadMonitor;

  private isRunning: boolean = false;
  private cycleInterval: NodeJS.Timeout | null = null;
  private embeddingCache: Map<string, number[]> = new Map();

  constructor(config: MediatorConfig) {
    this.config = config;

    // Initialize burn manager first (needed by other components)
    this.burnManager = new BurnManager(config);

    // Initialize load monitor
    this.loadMonitor = new LoadMonitor(config, this.burnManager);

    // Initialize components
    this.ingester = new IntentIngester(config, this.burnManager);
    this.vectorDb = new VectorDatabase(config);
    this.llmProvider = new LLMProvider(config);
    this.settlementManager = new SettlementManager(config);
    this.reputationTracker = new ReputationTracker(config);
    this.stakeManager = new StakeManager(config);
    this.authorityManager = new AuthorityManager(config);

    logger.info('Mediator node created', {
      mediatorId: config.mediatorPublicKey,
      consensusMode: config.consensusMode,
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

      // Initialize consensus components based on mode
      if (this.config.consensusMode === 'dpos' || this.config.consensusMode === 'hybrid') {
        await this.stakeManager.loadDelegations();

        // Bond stake if configured
        if (this.config.bondedStakeAmount && this.config.bondedStakeAmount > 0) {
          await this.stakeManager.bondStake(this.config.bondedStakeAmount);
        }

        // Check minimum stake requirement
        if (!this.stakeManager.meetsMinimumStake()) {
          logger.error('Cannot start: Minimum stake requirement not met');
          return;
        }
      }

      if (this.config.consensusMode === 'poa' || this.config.consensusMode === 'hybrid') {
        await this.authorityManager.loadAuthoritySet();

        if (!this.authorityManager.checkAuthorization()) {
          logger.error('Cannot start: Not authorized in PoA mode');
          return;
        }
      }

      // Start intent ingestion
      this.ingester.startPolling(10000); // Poll every 10 seconds

      // Start alignment cycle
      this.isRunning = true;
      this.runAlignmentCycle();

      // Start settlement monitoring
      this.startSettlementMonitoring();

      // Start load monitoring if enabled
      if (this.config.loadScalingEnabled) {
        const interval = this.config.loadMonitoringInterval || 30000;
        this.loadMonitor.startMonitoring(interval);
      }

      logger.info('Mediator node started successfully', {
        reputation: this.reputationTracker.getWeight(),
        effectiveStake: this.stakeManager.getEffectiveStake(),
        loadScaling: this.config.loadScalingEnabled || false,
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
    this.loadMonitor.stopMonitoring();

    // Save vector database
    await this.vectorDb.save();

    logger.info('Mediator node stopped');
  }

  /**
   * Run the alignment cycle
   */
  private async runAlignmentCycle(): Promise<void> {
    // Run cycle every 30 seconds
    this.cycleInterval = setInterval(async () => {
      if (!this.isRunning) return;

      await this.executeAlignmentCycle();
    }, 30000);

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
        10 // Top 10 candidates
      );

      logger.info('Found alignment candidates', { count: candidates.length });

      // Phase 3: Negotiation - Simulate alignment for top candidates
      for (const candidate of candidates.slice(0, 3)) {
        // Process top 3 per cycle
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
        negotiationResult,
        this.stakeManager.getEffectiveStake()
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
    setInterval(async () => {
      if (!this.isRunning) return;

      await this.settlementManager.monitorSettlements();
    }, 60000); // Check every minute
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
   * Get node status
   */
  public getStatus(): {
    isRunning: boolean;
    cachedIntents: number;
    activeSettlements: number;
    reputation: number;
    effectiveStake: number;
    burnStats: {
      totalBurns: number;
      totalAmount: number;
      loadMultiplier: number;
    };
    loadStats?: {
      intentSubmissionRate: number;
      activeIntentCount: number;
      settlementRate: number;
      currentMultiplier: number;
      loadFactor: number;
    };
  } {
    const burnStats = this.burnManager.getBurnStats();
    const status: any = {
      isRunning: this.isRunning,
      cachedIntents: this.ingester.getCachedIntents().length,
      activeSettlements: this.settlementManager.getActiveSettlements().length,
      reputation: this.reputationTracker.getWeight(),
      effectiveStake: this.stakeManager.getEffectiveStake(),
      burnStats: {
        totalBurns: burnStats.totalBurns,
        totalAmount: burnStats.totalAmount,
        loadMultiplier: this.burnManager.getLoadMultiplier(),
      },
    };

    // Include load stats if monitoring is enabled
    if (this.config.loadScalingEnabled) {
      const loadStats = this.loadMonitor.getLoadStats();
      status.loadStats = {
        intentSubmissionRate: loadStats.currentMetrics.intentSubmissionRate,
        activeIntentCount: loadStats.currentMetrics.activeIntentCount,
        settlementRate: loadStats.currentMetrics.settlementRate,
        currentMultiplier: loadStats.currentMultiplier,
        loadFactor: loadStats.loadFactor,
      };
    }

    return status;
  }

  /**
   * Get BurnManager instance for direct access
   */
  public getBurnManager(): BurnManager {
    return this.burnManager;
  }

  /**
   * Get IntentIngester instance for direct access
   */
  public getIntentIngester(): IntentIngester {
    return this.ingester;
  }

  /**
   * Get LoadMonitor instance for direct access
   */
  public getLoadMonitor(): LoadMonitor {
    return this.loadMonitor;
  }
}
