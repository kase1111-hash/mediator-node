import axios from 'axios';
import { MediatorConfig, AlignmentCandidate, ProposedSettlement } from './types';
import { IntentIngester } from './ingestion/IntentIngester';
import { VectorDatabase } from './mapping/VectorDatabase';
import { LLMProvider } from './llm/LLMProvider';
import { SettlementManager } from './settlement/SettlementManager';
import { ReputationTracker } from './reputation/ReputationTracker';
import { StakeManager } from './consensus/StakeManager';
import { AuthorityManager } from './consensus/AuthorityManager';
import { ValidatorRotationManager } from './consensus/ValidatorRotationManager';
import { BurnManager } from './burn/BurnManager';
import { LoadMonitor } from './burn/LoadMonitor';
import { ChallengeDetector } from './challenge/ChallengeDetector';
import { ChallengeManager } from './challenge/ChallengeManager';
import { SemanticConsensusManager } from './consensus/SemanticConsensusManager';
import { SubmissionTracker } from './sybil/SubmissionTracker';
import { SpamProofDetector } from './sybil/SpamProofDetector';
import { EffortCaptureSystem } from './effort/EffortCaptureSystem';
import { DisputeManager } from './dispute/DisputeManager';
import { LicensingManager } from './licensing/LicensingManager';
import { MP05SettlementCoordinator } from './settlement/MP05SettlementCoordinator';
import { WebSocketServer } from './websocket/WebSocketServer';
import { EventPublisher } from './websocket/EventPublisher';
import { HealthMonitor } from './monitoring/HealthMonitor';
import { PerformanceAnalytics } from './monitoring/PerformanceAnalytics';
import { MonitoringPublisher } from './monitoring/MonitoringPublisher';
import { GovernanceManager } from './governance/GovernanceManager';
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
  private validatorRotationManager?: ValidatorRotationManager;
  private burnManager: BurnManager;
  private loadMonitor: LoadMonitor;
  private challengeDetector: ChallengeDetector;
  private challengeManager: ChallengeManager;
  private semanticConsensusManager: SemanticConsensusManager;
  private submissionTracker: SubmissionTracker;
  private spamProofDetector: SpamProofDetector;
  private effortCaptureSystem?: EffortCaptureSystem;
  private disputeManager?: DisputeManager;
  private licensingManager?: LicensingManager;
  private mp05Coordinator?: MP05SettlementCoordinator;
  private webSocketServer?: WebSocketServer;
  private eventPublisher?: EventPublisher;
  private healthMonitor?: HealthMonitor;
  private performanceAnalytics?: PerformanceAnalytics;
  private monitoringPublisher?: MonitoringPublisher;
  private governanceManager?: GovernanceManager;

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
    this.reputationTracker = new ReputationTracker(config);
    this.stakeManager = new StakeManager(config);
    this.authorityManager = new AuthorityManager(config);

    // Initialize semantic consensus system (MP-01)
    this.semanticConsensusManager = new SemanticConsensusManager(
      config,
      this.llmProvider
    );

    // Initialize settlement manager with semantic consensus support
    this.settlementManager = new SettlementManager(
      config,
      this.burnManager,
      this.semanticConsensusManager
    );

    // Initialize challenge system
    this.challengeDetector = new ChallengeDetector(config, this.llmProvider);
    this.challengeManager = new ChallengeManager(config, this.reputationTracker);

    // Initialize Sybil Resistance system
    this.submissionTracker = new SubmissionTracker(config);
    this.spamProofDetector = new SpamProofDetector(config, this.llmProvider);

    // Initialize Effort Capture system (MP-02)
    if (config.enableEffortCapture) {
      this.effortCaptureSystem = new EffortCaptureSystem(config, this.llmProvider);
    }

    // Initialize Dispute & Escalation system (MP-03)
    if (config.enableDisputeSystem) {
      this.disputeManager = new DisputeManager(config, this.llmProvider);
    }

    // Initialize Licensing & Delegation system (MP-04)
    if (config.enableLicensingSystem) {
      this.licensingManager = new LicensingManager(config);
    }

    // Initialize Settlement & Capitalization system (MP-05)
    if (config.enableSettlementSystem) {
      this.mp05Coordinator = new MP05SettlementCoordinator(
        config,
        './data/mp05',
        this.effortCaptureSystem,
        this.disputeManager,
        this.licensingManager
      );
    }

    // Initialize WebSocket Real-Time Updates system
    if (config.enableWebSocket) {
      this.webSocketServer = new WebSocketServer({
        port: config.webSocketPort || 8080,
        host: config.webSocketHost || '0.0.0.0',
        authRequired: config.webSocketAuthRequired ?? true,
        maxConnections: config.webSocketMaxConnections || 1000,
        heartbeatInterval: config.webSocketHeartbeatInterval || 30000,
      });

      this.eventPublisher = new EventPublisher(this.webSocketServer);
    }

    // Initialize monitoring system
    if (config.enableMonitoring !== false) {
      this.healthMonitor = new HealthMonitor(config);
      this.performanceAnalytics = new PerformanceAnalytics(config);

      // Initialize monitoring publisher if WebSocket is enabled
      if (this.eventPublisher) {
        this.monitoringPublisher = new MonitoringPublisher(
          config,
          this.eventPublisher,
          this.healthMonitor,
          this.performanceAnalytics
        );
      }
    }

    // Initialize governance system
    if (config.enableGovernance) {
      this.governanceManager = new GovernanceManager(config, this.stakeManager);
    }

    // Initialize Validator Rotation system for DPoS mode
    if (config.consensusMode === 'dpos' || config.consensusMode === 'hybrid') {
      this.validatorRotationManager = new ValidatorRotationManager(config);
    }

    logger.info('Mediator node created', {
      mediatorId: config.mediatorPublicKey,
      consensusMode: config.consensusMode,
      challengeSubmissionEnabled: config.enableChallengeSubmission || false,
      semanticConsensusEnabled: config.enableSemanticConsensus || false,
      sybilResistanceEnabled: config.enableSybilResistance || false,
      effortCaptureEnabled: config.enableEffortCapture || false,
      disputeSystemEnabled: config.enableDisputeSystem || false,
      licensingSystemEnabled: config.enableLicensingSystem || false,
      settlementSystemEnabled: config.enableSettlementSystem || false,
      webSocketEnabled: config.enableWebSocket || false,
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

        // Start validator rotation manager
        if (this.validatorRotationManager) {
          await this.validatorRotationManager.start();

          // Register this mediator as a validator
          const stake = this.stakeManager.getStake();
          await this.validatorRotationManager.registerValidator(
            this.config.mediatorPublicKey,
            stake.effectiveStake
          );

          logger.info('Validator rotation started', {
            isCurrentValidator: this.validatorRotationManager.isCurrentValidator(),
            currentEpoch: this.validatorRotationManager.getCurrentEpoch()?.epochNumber,
          });
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

      // Start challenge monitoring if enabled
      if (this.config.enableChallengeSubmission) {
        this.startChallengeMonitoring();
      }

      // Start semantic consensus monitoring if enabled
      if (this.config.enableSemanticConsensus) {
        this.startSemanticConsensusMonitoring();
      }

      // Start Sybil Resistance monitoring if enabled
      if (this.config.enableSybilResistance || this.config.enableSpamProofSubmission) {
        this.startSybilResistanceMonitoring();
      }

      // Start Effort Capture system if enabled (MP-02)
      if (this.effortCaptureSystem) {
        this.effortCaptureSystem.start();
      }

      // Start load monitoring if enabled
      if (this.config.loadScalingEnabled) {
        const interval = this.config.loadMonitoringInterval || 30000;
        this.loadMonitor.startMonitoring(interval);
      }

      // Start WebSocket server if enabled
      if (this.webSocketServer) {
        await this.webSocketServer.start();
        logger.info('WebSocket server started', {
          port: this.config.webSocketPort || 8080,
          authRequired: this.config.webSocketAuthRequired ?? true,
        });
      }

      // Start monitoring system if enabled
      if (this.healthMonitor) {
        // Register component health checkers
        this.registerHealthCheckers();
        this.healthMonitor.start();
      }

      if (this.performanceAnalytics) {
        this.performanceAnalytics.start();
      }

      if (this.monitoringPublisher) {
        this.monitoringPublisher.start();
        logger.info('Monitoring publisher started', {
          healthInterval: this.config.monitoringHealthCheckInterval || 30000,
          metricsInterval: this.config.monitoringMetricsInterval || 10000,
        });
      }

      // Start governance system if enabled
      if (this.governanceManager) {
        this.governanceManager.start();
        logger.info('Governance system started', {
          votingPeriodDays: this.config.governanceVotingPeriodDays || 7,
          quorumPercentage: this.config.governanceQuorumPercentage || 30,
        });
      }

      logger.info('Mediator node started successfully', {
        reputation: this.reputationTracker.getWeight(),
        effectiveStake: this.stakeManager.getEffectiveStake(),
        loadScaling: this.config.loadScalingEnabled || false,
        challengeSubmission: this.config.enableChallengeSubmission || false,
        semanticConsensus: this.config.enableSemanticConsensus || false,
        sybilResistance: this.config.enableSybilResistance || false,
        spamProofSubmission: this.config.enableSpamProofSubmission || false,
        effortCapture: this.config.enableEffortCapture || false,
        disputeSystem: this.config.enableDisputeSystem || false,
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

    // Stop Validator Rotation manager if running
    if (this.validatorRotationManager) {
      this.validatorRotationManager.stop();
    }

    // Stop Effort Capture system if running (MP-02)
    if (this.effortCaptureSystem) {
      this.effortCaptureSystem.stop();
    }

    // Stop monitoring system if running
    if (this.monitoringPublisher) {
      this.monitoringPublisher.stop();
    }

    if (this.performanceAnalytics) {
      this.performanceAnalytics.stop();
    }

    if (this.healthMonitor) {
      this.healthMonitor.stop();
    }

    // Stop governance system if running
    if (this.governanceManager) {
      this.governanceManager.stop();
    }

    // Stop WebSocket server if running
    if (this.webSocketServer) {
      await this.webSocketServer.stop();
      logger.info('WebSocket server stopped');
    }

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
      // DPoS slot-based gating: only mediate during our assigned slot
      if (this.validatorRotationManager && !this.validatorRotationManager.shouldMediate()) {
        const nextSlot = this.validatorRotationManager.getNextSlotForMediator();
        const timeUntilSlot = this.validatorRotationManager.getTimeUntilNextSlot();

        logger.debug('Not our slot, skipping alignment cycle', {
          currentSlot: this.validatorRotationManager.getCurrentSlot()?.validatorId,
          nextSlotAt: nextSlot?.startTime ? new Date(nextSlot.startTime).toISOString() : 'N/A',
          timeUntilSlotMs: timeUntilSlot,
        });
        return;
      }

      // Record slot activity if we're mediating
      if (this.validatorRotationManager) {
        this.validatorRotationManager.recordSlotActivity(this.config.mediatorPublicKey);
      }

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
   * Start challenge monitoring
   * Monitors submitted challenges for status updates and updates reputation accordingly
   */
  private startChallengeMonitoring(): void {
    // Monitor our submitted challenges for status updates
    setInterval(async () => {
      if (!this.isRunning) return;

      await this.challengeManager.monitorChallenges();
    }, 60000); // Check every minute

    // Scan for challengeable settlements from other mediators
    const checkInterval = this.config.challengeCheckInterval || 60000;
    setInterval(async () => {
      if (!this.isRunning) return;

      await this.scanForChallengeableSettlements();
    }, checkInterval);
  }

  /**
   * Scan for settlements from other mediators that may contain contradictions
   */
  private async scanForChallengeableSettlements(): Promise<void> {
    try {
      // Fetch recent settlements from the chain (not created by us)
      const response = await axios.get(
        `${this.config.chainEndpoint}/api/v1/settlements/recent?limit=20`
      );

      if (!response.data || !Array.isArray(response.data.settlements)) {
        return;
      }

      const settlements = response.data.settlements.filter(
        (settlement: ProposedSettlement) =>
          settlement.mediatorId !== this.config.mediatorPublicKey &&
          settlement.status === 'proposed'
      );

      logger.debug('Scanning settlements for contradictions', {
        count: settlements.length,
      });

      for (const settlement of settlements) {
        // Check if we've already challenged this settlement
        const existingChallenges =
          this.challengeManager.getChallengesForSettlement(settlement.id);

        if (existingChallenges.length > 0) {
          continue; // Already challenged
        }

        // Fetch the original intents
        const [intentAResponse, intentBResponse] = await Promise.all([
          axios.get(
            `${this.config.chainEndpoint}/api/v1/intents/${settlement.intentHashA}`
          ),
          axios.get(
            `${this.config.chainEndpoint}/api/v1/intents/${settlement.intentHashB}`
          ),
        ]);

        if (!intentAResponse.data || !intentBResponse.data) {
          continue;
        }

        const intentA = intentAResponse.data;
        const intentB = intentBResponse.data;

        // Analyze for contradictions
        const analysis = await this.challengeDetector.analyzeSettlement(
          settlement,
          intentA,
          intentB
        );

        if (!analysis) {
          continue;
        }

        // Check if we should submit a challenge
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
          } else {
            logger.warn('Failed to submit challenge', {
              settlementId: settlement.id,
              error: result.error,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error scanning for challengeable settlements', { error });
    }
  }

  /**
   * Start semantic consensus verification monitoring
   * Monitors for incoming verification requests and processes them
   */
  private startSemanticConsensusMonitoring(): void {
    // Monitor for incoming verification requests
    setInterval(async () => {
      if (!this.isRunning) return;

      await this.checkForVerificationRequests();
    }, 60000); // Check every minute

    // Monitor ongoing verifications for timeout/completion
    setInterval(async () => {
      if (!this.isRunning) return;

      await this.semanticConsensusManager.checkVerificationTimeouts();
    }, 60000); // Check every minute
  }

  /**
   * Check for incoming verification requests and respond if configured
   */
  private async checkForVerificationRequests(): Promise<void> {
    if (!this.config.participateInVerification) {
      return; // Not participating as a verifier
    }

    try {
      // Fetch pending verification requests from the chain
      const response = await axios.get(
        `${this.config.chainEndpoint}/api/v1/verification-requests/pending`
      );

      if (!response.data || !Array.isArray(response.data.requests)) {
        return;
      }

      const requests = response.data.requests.filter(
        (req: any) =>
          req.selectedVerifiers.includes(this.config.mediatorPublicKey) &&
          req.requesterId !== this.config.mediatorPublicKey
      );

      logger.debug('Checking verification requests', { count: requests.length });

      for (const request of requests) {
        // Check if we've already responded
        const existingResponse = await this.semanticConsensusManager.hasResponded(
          request.settlementId
        );

        if (existingResponse) {
          continue; // Already responded
        }

        // Fetch the settlement details
        const settlementResponse = await axios.get(
          `${this.config.chainEndpoint}/api/v1/settlements/${request.settlementId}`
        );

        if (!settlementResponse.data) {
          continue;
        }

        const settlement = settlementResponse.data;

        // Submit our verification response
        try {
          await this.semanticConsensusManager.submitVerificationResponse(
            request,
            settlement
          );

          logger.info('Submitted verification response', {
            settlementId: request.settlementId,
            requesterId: request.requesterId,
          });
        } catch (error) {
          logger.error('Failed to submit verification response', {
            error,
            settlementId: request.settlementId,
          });
        }
      }
    } catch (error) {
      logger.error('Error checking for verification requests', { error });
    }
  }

  /**
   * Start Sybil Resistance monitoring
   * Processes refunds and monitors spam proofs
   */
  private startSybilResistanceMonitoring(): void {
    // Process deposit refunds daily
    if (this.config.enableSybilResistance) {
      setInterval(async () => {
        if (!this.isRunning) return;

        await this.submissionTracker.processRefunds();
      }, 24 * 60 * 60 * 1000); // Check daily

      // Initial refund check
      this.submissionTracker.processRefunds();
    }

    // Monitor spam proofs if enabled
    if (this.config.enableSpamProofSubmission) {
      setInterval(async () => {
        if (!this.isRunning) return;

        await this.spamProofDetector.monitorSpamProofs();
      }, 60000); // Check every minute

      // Scan for spam intents periodically
      setInterval(async () => {
        if (!this.isRunning) return;

        await this.scanForSpamIntents();
      }, 5 * 60 * 1000); // Check every 5 minutes
    }
  }

  /**
   * Scan for potential spam intents and submit proofs
   */
  private async scanForSpamIntents(): Promise<void> {
    try {
      // Get recent intents from cache
      const intents = this.ingester.getCachedIntents();

      logger.debug('Scanning intents for spam', { count: intents.length });

      for (const intent of intents) {
        // Skip if we've already submitted a proof for this intent
        const existingProofs = this.spamProofDetector.getSubmittedProofs();
        if (existingProofs.some(p => p.targetIntentHash === intent.hash)) {
          continue;
        }

        // Analyze intent for spam
        const analysis = await this.spamProofDetector.analyzeIntent(intent);

        if (!analysis) {
          continue;
        }

        // Submit proof if confidence is high enough
        if (this.spamProofDetector.shouldSubmitProof(analysis)) {
          logger.info('Detected spam intent, submitting proof', {
            intentHash: intent.hash,
            confidence: analysis.confidence,
          });

          const result = await this.spamProofDetector.submitSpamProof(intent, analysis);

          if (result.success) {
            logger.info('Spam proof submitted successfully', {
              proofId: result.proofId,
              intentHash: intent.hash,
            });
          } else {
            logger.warn('Failed to submit spam proof', {
              intentHash: intent.hash,
              error: result.error,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Error scanning for spam intents', { error });
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
    challengeStats?: {
      total: number;
      pending: number;
      upheld: number;
      rejected: number;
      successRate: number;
    };
    verificationStats?: {
      total: number;
      pending: number;
      inProgress: number;
      consensusReached: number;
      consensusFailed: number;
      timedOut: number;
    };
    sybilResistanceStats?: {
      totalSubmissionsToday: number;
      totalDeposits: number;
      activeDeposits: number;
      refundedDeposits: number;
      forfeitedDeposits: number;
      totalDepositValue: number;
    };
    spamProofStats?: {
      total: number;
      pending: number;
      validated: number;
      rejected: number;
      totalForfeited: number;
    };
    effortCaptureStats?: {
      isRunning: boolean;
      totalReceipts: number;
      totalSignals: number;
      totalDurationMinutes: number;
      receiptsByStatus: Record<string, number>;
      anchoredReceipts: number;
    };
    disputeStats?: ReturnType<DisputeManager['getStats']>;
    licensingStats?: ReturnType<LicensingManager['getStats']>;
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

    // Include challenge stats if submission is enabled
    if (this.config.enableChallengeSubmission) {
      status.challengeStats = this.challengeManager.getChallengeStats();
    }

    // Include verification stats if semantic consensus is enabled
    if (this.config.enableSemanticConsensus) {
      status.verificationStats = this.semanticConsensusManager.getVerificationStats();
    }

    // Include Sybil Resistance stats if enabled
    if (this.config.enableSybilResistance) {
      status.sybilResistanceStats = this.submissionTracker.getStats();
    }

    // Include spam proof stats if enabled
    if (this.config.enableSpamProofSubmission) {
      status.spamProofStats = this.spamProofDetector.getSpamProofStats();
    }

    // Include effort capture stats if enabled (MP-02)
    if (this.effortCaptureSystem) {
      const effortStatus = this.effortCaptureSystem.getStatus();
      status.effortCaptureStats = {
        isRunning: effortStatus.isRunning,
        totalReceipts: effortStatus.receipts.totalReceipts,
        totalSignals: effortStatus.receipts.totalSignals,
        totalDurationMinutes: effortStatus.receipts.totalDurationMinutes,
        receiptsByStatus: effortStatus.receipts.receiptsByStatus,
        anchoredReceipts: effortStatus.anchoring.totalAnchored,
      };
    }

    // Include dispute stats if enabled (MP-03)
    if (this.disputeManager) {
      status.disputeStats = this.disputeManager.getStats();
    }

    // Include licensing stats if enabled (MP-04)
    if (this.licensingManager) {
      status.licensingStats = this.licensingManager.getStats();
    }

    // Include validator rotation stats if enabled
    if (this.validatorRotationManager) {
      status.validatorRotationStats = this.validatorRotationManager.getStatus();
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

  /**
   * Get SettlementManager instance for direct access
   */
  public getSettlementManager(): SettlementManager {
    return this.settlementManager;
  }

  /**
   * Get BurnAnalytics instance for analytics and reporting
   */
  public getBurnAnalytics() {
    const analytics = this.burnManager.getBurnAnalytics();

    // Record current load multiplier for load metrics
    if (this.config.loadScalingEnabled) {
      analytics.recordLoadMultiplier(this.burnManager.getLoadMultiplier());
    }

    return analytics;
  }

  /**
   * Get ChallengeDetector instance for direct access
   */
  public getChallengeDetector(): ChallengeDetector {
    return this.challengeDetector;
  }

  /**
   * Register component health checkers with the HealthMonitor
   */
  private registerHealthCheckers(): void {
    if (!this.healthMonitor) {
      return;
    }

    // Vector database health checker
    this.healthMonitor.registerComponent(
      'vector-database',
      HealthMonitor.createSimpleChecker(
        'vector-database',
        () => {
          // Check if vector database is initialized
          return this.vectorDb !== null;
        },
        'Vector database not initialized'
      )
    );

    // LLM provider health checker
    this.healthMonitor.registerComponent(
      'llm-provider',
      HealthMonitor.createSimpleChecker(
        'llm-provider',
        () => {
          // Check if LLM provider is configured
          return this.llmProvider !== null;
        },
        'LLM provider not initialized'
      )
    );

    // WebSocket server health checker
    if (this.webSocketServer) {
      this.healthMonitor.registerComponent(
        'websocket-server',
        async () => {
          const connections = this.webSocketServer?.getConnections().length || 0;
          const maxConnections = this.config.webSocketMaxConnections || 1000;
          const utilization = (connections / maxConnections) * 100;

          let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
          if (utilization >= 90) {
            status = 'unhealthy';
          } else if (utilization >= 70) {
            status = 'degraded';
          }

          return {
            name: 'websocket-server',
            status,
            message: `WebSocket server running with ${connections}/${maxConnections} connections`,
            lastCheck: Date.now(),
            metadata: {
              connections,
              maxConnections,
              utilization,
            },
          };
        }
      );
    }

    // Reputation tracker health checker
    this.healthMonitor.registerComponent(
      'reputation-tracker',
      async () => {
        const weight = this.reputationTracker.getWeight();

        return {
          name: 'reputation-tracker',
          status: weight > 0 ? 'healthy' : 'degraded',
          message: `Reputation weight: ${weight.toFixed(2)}`,
          lastCheck: Date.now(),
          metadata: {
            weight,
          },
        };
      }
    );

    // Stake manager health checker (if using DPoS)
    if (this.config.consensusMode === 'dpos' || this.config.consensusMode === 'hybrid') {
      this.healthMonitor.registerComponent(
        'stake-manager',
        async () => {
          const effectiveStake = this.stakeManager.getEffectiveStake();
          const meetsMinimum = this.stakeManager.meetsMinimumStake();

          return {
            name: 'stake-manager',
            status: meetsMinimum ? 'healthy' : 'critical',
            message: meetsMinimum
              ? `Effective stake: ${effectiveStake}`
              : 'Stake below minimum requirement',
            lastCheck: Date.now(),
            metadata: {
              effectiveStake,
              meetsMinimum,
            },
          };
        }
      );
    }

    // Load monitor health checker
    this.healthMonitor.registerComponent(
      'load-monitor',
      async () => {
        const metrics = this.loadMonitor.getCurrentMetrics();
        const loadMultiplier = this.loadMonitor.getLoadMultiplier();

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        if (loadMultiplier >= 2.0) {
          status = 'unhealthy';
        } else if (loadMultiplier >= 1.5) {
          status = 'degraded';
        }

        return {
          name: 'load-monitor',
          status,
          message: `Load multiplier: ${loadMultiplier.toFixed(2)}x, Intent rate: ${metrics.intentSubmissionRate.toFixed(1)}/min`,
          lastCheck: Date.now(),
          metadata: {
            loadMultiplier,
            intentSubmissionRate: metrics.intentSubmissionRate,
            activeIntentCount: metrics.activeIntentCount,
            settlementRate: metrics.settlementRate,
          },
        };
      }
    );

    logger.debug('Component health checkers registered', {
      count: 5 + (this.webSocketServer ? 1 : 0),
    });
  }

  /**
   * Get ChallengeManager instance for direct access
   */
  public getChallengeManager(): ChallengeManager {
    return this.challengeManager;
  }

  /**
   * Get SemanticConsensusManager instance for direct access
   */
  public getSemanticConsensusManager(): SemanticConsensusManager {
    return this.semanticConsensusManager;
  }

  /**
   * Get DisputeManager instance for direct access
   */
  public getDisputeManager(): DisputeManager | undefined {
    return this.disputeManager;
  }

  /**
   * Get LicensingManager instance for direct access
   */
  public getLicensingManager(): LicensingManager | undefined {
    return this.licensingManager;
  }

  /**
   * Get MP05SettlementCoordinator instance for direct access
   */
  public getMP05Coordinator(): MP05SettlementCoordinator | undefined {
    return this.mp05Coordinator;
  }

  /**
   * Get WebSocketServer instance for direct access
   */
  public getWebSocketServer(): WebSocketServer | undefined {
    return this.webSocketServer;
  }

  /**
   * Get EventPublisher instance for publishing real-time events
   */
  public getEventPublisher(): EventPublisher | undefined {
    return this.eventPublisher;
  }

  /**
   * Get HealthMonitor instance for direct access
   */
  public getHealthMonitor(): HealthMonitor | undefined {
    return this.healthMonitor;
  }

  /**
   * Get PerformanceAnalytics instance for direct access
   */
  public getPerformanceAnalytics(): PerformanceAnalytics | undefined {
    return this.performanceAnalytics;
  }

  /**
   * Get MonitoringPublisher instance for direct access
   */
  public getMonitoringPublisher(): MonitoringPublisher | undefined {
    return this.monitoringPublisher;
  }

  /**
   * Get GovernanceManager instance for direct access
   */
  public getGovernanceManager(): GovernanceManager | undefined {
    return this.governanceManager;
  }
}
