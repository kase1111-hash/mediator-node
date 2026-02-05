import * as dotenv from 'dotenv';
import { MediatorConfig, ConsensusMode } from '../types';
import { logger } from '../utils/logger';

/**
 * ConfigLoader loads and validates configuration from environment
 */
export class ConfigLoader {
  /**
   * Load configuration from environment variables
   */
  public static load(envPath?: string): MediatorConfig {
    // Load .env file
    if (envPath) {
      dotenv.config({ path: envPath });
    } else {
      dotenv.config();
    }

    const config: MediatorConfig = {
      // Chain configuration
      chainEndpoint: this.getRequired('CHAIN_ENDPOINT'),
      chainId: this.getRequired('CHAIN_ID'),
      consensusMode: this.getConsensusMode(),

      // LLM configuration
      llmProvider: this.getLLMProvider(),
      llmApiKey: this.getRequired(
        this.getLLMProvider() === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'
      ),
      llmModel: this.getOptional('LLM_MODEL', 'claude-3-5-sonnet-20241022'),

      // Mediator identity
      mediatorPrivateKey: this.getRequired('MEDIATOR_PRIVATE_KEY'),
      mediatorPublicKey: this.getRequired('MEDIATOR_PUBLIC_KEY'),
      facilitationFeePercent: parseFloat(this.getOptional('FACILITATION_FEE_PERCENT', '1.0')),

      // DPoS configuration
      bondedStakeAmount: this.getOptionalNumber('BONDED_STAKE_AMOUNT'),
      minEffectiveStake: this.getOptionalNumber('MIN_EFFECTIVE_STAKE'),

      // PoA configuration
      poaAuthorityKey: this.getOptional('POA_AUTHORITY_KEY'),

      // Vector database
      vectorDbPath: this.getOptional('VECTOR_DB_PATH', './vector-db'),
      vectorDimensions: parseInt(this.getOptional('VECTOR_DIMENSIONS', '1536')),
      maxIntentsCache: parseInt(this.getOptional('MAX_INTENTS_CACHE', '10000')),

      // Reputation
      reputationChainEndpoint: this.getOptional('REPUTATION_CHAIN_ENDPOINT'),

      // Acceptance window
      acceptanceWindowHours: parseInt(this.getOptional('ACCEPTANCE_WINDOW_HOURS', '72')),

      // Burn configuration (MP-06)
      baseFilingBurn: this.getOptionalNumber('BASE_FILING_BURN'),
      freeDailySubmissions: this.getOptionalNumber('FREE_DAILY_SUBMISSIONS'),
      burnEscalationBase: this.getOptionalNumber('BURN_ESCALATION_BASE'),
      burnEscalationExponent: this.getOptionalNumber('BURN_ESCALATION_EXPONENT'),
      successBurnPercentage: this.getOptionalNumber('SUCCESS_BURN_PERCENTAGE'),
      loadScalingEnabled: this.getOptional('LOAD_SCALING_ENABLED') === 'true',
      maxLoadMultiplier: this.getOptionalNumber('MAX_LOAD_MULTIPLIER'),
      enableBurnPreview: this.getOptional('ENABLE_BURN_PREVIEW', 'true') === 'true',

      // Core timing intervals (alignment cycle)
      alignmentCycleIntervalMs: this.getOptionalNumber('ALIGNMENT_CYCLE_INTERVAL_MS'),
      intentPollingIntervalMs: this.getOptionalNumber('INTENT_POLLING_INTERVAL_MS'),
      settlementMonitoringIntervalMs: this.getOptionalNumber('SETTLEMENT_MONITORING_INTERVAL_MS'),

      // Embedding configuration (for Anthropic users or custom embedding providers)
      embeddingProvider: this.getEmbeddingProvider(),
      embeddingApiKey: this.getOptional('EMBEDDING_API_KEY'),
      embeddingModel: this.getOptional('EMBEDDING_MODEL'),

      // Negotiation thresholds
      minNegotiationConfidence: this.getOptionalNumber('MIN_NEGOTIATION_CONFIDENCE'),

      // Intent validation thresholds
      maxIntentFlags: this.getOptionalNumber('MAX_INTENT_FLAGS'),
      minIntentProseLength: this.getOptionalNumber('MIN_INTENT_PROSE_LENGTH'),

      // LoadMonitor configuration
      targetIntentRate: this.getOptionalNumber('TARGET_INTENT_RATE'),
      maxIntentRate: this.getOptionalNumber('MAX_INTENT_RATE'),
      loadSmoothingFactor: this.getOptionalNumber('LOAD_SMOOTHING_FACTOR'),
      loadMonitoringInterval: this.getOptionalNumber('LOAD_MONITORING_INTERVAL'),

      // Challenge submission configuration
      enableChallengeSubmission: this.getOptional('ENABLE_CHALLENGE_SUBMISSION') === 'true',
      minConfidenceToChallenge: this.getOptionalNumber('MIN_CONFIDENCE_TO_CHALLENGE'),
      challengeCheckInterval: this.getOptionalNumber('CHALLENGE_CHECK_INTERVAL'),

      // Semantic Consensus Verification configuration
      enableSemanticConsensus: this.getOptional('ENABLE_SEMANTIC_CONSENSUS') === 'true',
      highValueThreshold: this.getOptionalNumber('HIGH_VALUE_THRESHOLD'),
      verificationDeadlineHours: this.getOptionalNumber('VERIFICATION_DEADLINE_HOURS'),
      requiredVerifiers: this.getOptionalNumber('REQUIRED_VERIFIERS'),
      requiredConsensus: this.getOptionalNumber('REQUIRED_CONSENSUS'),
      semanticSimilarityThreshold: this.getOptionalNumber('SEMANTIC_SIMILARITY_THRESHOLD'),
      participateInVerification: this.getOptional('PARTICIPATE_IN_VERIFICATION', 'true') === 'true',

      // Sybil Resistance configuration
      enableSybilResistance: this.getOptional('ENABLE_SYBIL_RESISTANCE') === 'true',
      dailyFreeLimit: this.getOptionalNumber('DAILY_FREE_LIMIT'),
      excessDepositAmount: this.getOptionalNumber('EXCESS_DEPOSIT_AMOUNT'),
      depositRefundDays: this.getOptionalNumber('DEPOSIT_REFUND_DAYS'),
      enableSpamProofSubmission: this.getOptional('ENABLE_SPAM_PROOF_SUBMISSION') === 'true',
      minSpamConfidence: this.getOptionalNumber('MIN_SPAM_CONFIDENCE'),

      // MP-02: Proof-of-Effort Receipt Protocol configuration
      enableEffortCapture: this.getOptional('ENABLE_EFFORT_CAPTURE') === 'true',
      effortObserverId: this.getOptional('EFFORT_OBSERVER_ID'),
      effortCaptureModalities: this.getOptional('EFFORT_CAPTURE_MODALITIES')?.split(','),
      effortSegmentationStrategy: this.getOptional('EFFORT_SEGMENTATION_STRATEGY') as 'time_window' | 'activity_boundary' | 'hybrid' | undefined,
      effortTimeWindowMinutes: this.getOptionalNumber('EFFORT_TIME_WINDOW_MINUTES'),
      effortActivityGapMinutes: this.getOptionalNumber('EFFORT_ACTIVITY_GAP_MINUTES'),
      effortAutoAnchor: this.getOptional('EFFORT_AUTO_ANCHOR') === 'true' || this.getOptional('EFFORT_AUTO_ANCHOR') === undefined,
      effortEncryptSignals: this.getOptional('EFFORT_ENCRYPT_SIGNALS') === 'true' || this.getOptional('EFFORT_ENCRYPT_SIGNALS') === undefined,
      effortRetentionDays: this.getOptionalNumber('EFFORT_RETENTION_DAYS'),

      // MP-03: Dispute & Escalation Protocol configuration
      enableDisputeSystem: this.getOptional('ENABLE_DISPUTE_SYSTEM') === 'true',
      allowDisputeClarification: this.getOptional('ALLOW_DISPUTE_CLARIFICATION') !== 'false', // Default true
      autoFreezeEvidence: this.getOptional('AUTO_FREEZE_EVIDENCE') !== 'false', // Default true
      maxClarificationDays: this.getOptionalNumber('MAX_CLARIFICATION_DAYS'),
      requireHumanEscalation: this.getOptional('REQUIRE_HUMAN_ESCALATION') !== 'false', // Default true

      // NCIP Hover Tips configuration
      enableNCIPHoverTips: this.getOptional('ENABLE_NCIP_HOVER_TIPS', 'true') === 'true',
      ncipHoverTipsShortOnly: this.getOptional('NCIP_HOVER_TIPS_SHORT_ONLY') === 'true',
      ncipHoverTipsShowReferences: this.getOptional('NCIP_HOVER_TIPS_SHOW_REFERENCES', 'true') === 'true',
      ncipHoverTipsShowRelated: this.getOptional('NCIP_HOVER_TIPS_SHOW_RELATED', 'true') === 'true',
      ncipHoverTipsDelayMs: this.getOptionalNumber('NCIP_HOVER_TIPS_DELAY_MS'),

      // Logging
      logLevel: this.getLogLevel(),
    };

    this.validateConfig(config);

    logger.info('Configuration loaded', {
      chainId: config.chainId,
      consensusMode: config.consensusMode,
      llmProvider: config.llmProvider,
    });

    return config;
  }

  /**
   * Get required environment variable
   */
  private static getRequired(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * Get optional environment variable with default
   */
  private static getOptional(key: string, defaultValue: string): string;
  private static getOptional(key: string): string | undefined;
  private static getOptional(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  }

  /**
   * Get optional number environment variable
   */
  private static getOptionalNumber(key: string): number | undefined {
    const value = process.env[key];
    return value ? parseFloat(value) : undefined;
  }

  /**
   * Get consensus mode
   */
  private static getConsensusMode(): ConsensusMode {
    const mode = this.getOptional('CONSENSUS_MODE', 'permissionless');

    if (!['permissionless', 'dpos', 'poa', 'hybrid'].includes(mode || '')) {
      throw new Error(`Invalid consensus mode: ${mode}`);
    }

    return mode as ConsensusMode;
  }

  /**
   * Get LLM provider
   */
  private static getLLMProvider(): 'anthropic' | 'openai' | 'custom' {
    const provider = this.getOptional('LLM_PROVIDER', 'anthropic');

    if (!['anthropic', 'openai', 'custom'].includes(provider || '')) {
      throw new Error(`Invalid LLM provider: ${provider}`);
    }

    return provider as 'anthropic' | 'openai' | 'custom';
  }

  /**
   * Get log level
   */
  private static getLogLevel(): 'debug' | 'info' | 'warn' | 'error' {
    const level = this.getOptional('LOG_LEVEL', 'info');

    if (!['debug', 'info', 'warn', 'error'].includes(level || '')) {
      return 'info';
    }

    return level as 'debug' | 'info' | 'warn' | 'error';
  }

  /**
   * Get embedding provider
   *
   * For Anthropic LLM users, a separate embedding provider is required since
   * Anthropic does not provide embeddings. Options:
   * - 'openai': Use OpenAI's text-embedding-3-small (recommended)
   * - 'voyage': Use Voyage AI embeddings (optimized for semantic search)
   * - 'cohere': Use Cohere embeddings
   * - 'fallback': Character-based fallback (DEVELOPMENT ONLY - not suitable for production)
   */
  private static getEmbeddingProvider(): 'openai' | 'voyage' | 'cohere' | 'fallback' | undefined {
    const provider = this.getOptional('EMBEDDING_PROVIDER');

    if (!provider) {
      return undefined; // Will use LLM provider's default or fallback
    }

    if (!['openai', 'voyage', 'cohere', 'fallback'].includes(provider)) {
      throw new Error(`Invalid embedding provider: ${provider}. Valid options: openai, voyage, cohere, fallback`);
    }

    return provider as 'openai' | 'voyage' | 'cohere' | 'fallback';
  }

  /**
   * Validate configuration
   */
  private static validateConfig(config: MediatorConfig): void {
    // Validate DPoS requirements
    if (config.consensusMode === 'dpos' || config.consensusMode === 'hybrid') {
      if (!config.minEffectiveStake) {
        logger.warn('DPoS mode enabled but MIN_EFFECTIVE_STAKE not set');
      }
    }

    // Validate PoA requirements
    if (config.consensusMode === 'poa' || config.consensusMode === 'hybrid') {
      if (!config.poaAuthorityKey) {
        logger.warn('PoA mode enabled but POA_AUTHORITY_KEY not set');
      }
    }

    // Validate fee percentage
    if (config.facilitationFeePercent < 0 || config.facilitationFeePercent > 100) {
      throw new Error('Facilitation fee must be between 0 and 100');
    }

    // Validate embedding configuration for Anthropic users
    if (config.llmProvider === 'anthropic') {
      const embeddingProvider = config.embeddingProvider;
      if (!embeddingProvider || embeddingProvider === 'fallback') {
        logger.warn(
          '⚠️  PRODUCTION WARNING: Anthropic does not provide embeddings. ' +
          'Using character-based fallback which is NOT suitable for production semantic matching. ' +
          'Configure EMBEDDING_PROVIDER (openai, voyage, or cohere) and EMBEDDING_API_KEY for production use.'
        );
      } else if (!config.embeddingApiKey) {
        // embeddingProvider is set to openai, voyage, or cohere - may need API key
        logger.warn(
          `EMBEDDING_PROVIDER=${embeddingProvider} but EMBEDDING_API_KEY not set. ` +
          'Embedding provider may fail if it requires a separate API key.'
        );
      }
    }

    // Validate vector dimensions
    if (config.vectorDimensions <= 0) {
      throw new Error('Vector dimensions must be positive');
    }

    // Validate optional feature configurations
    this.validateOptionalFeatures(config);
  }

  /**
   * Validate optional feature configurations
   */
  private static validateOptionalFeatures(config: MediatorConfig): void {
    // Validate Sybil Resistance configuration
    if (config.enableSybilResistance) {
      if (!config.dailyFreeLimit || config.dailyFreeLimit <= 0) {
        logger.warn('ENABLE_SYBIL_RESISTANCE=true but DAILY_FREE_LIMIT not properly set, using default');
      }
      if (!config.excessDepositAmount || config.excessDepositAmount <= 0) {
        logger.warn('ENABLE_SYBIL_RESISTANCE=true but EXCESS_DEPOSIT_AMOUNT not properly set, using default');
      }
    }

    // Validate Dispute System configuration
    if (config.enableDisputeSystem) {
      if (!config.maxClarificationDays || config.maxClarificationDays <= 0) {
        logger.warn('ENABLE_DISPUTE_SYSTEM=true but MAX_CLARIFICATION_DAYS not properly set, using default');
      }
    }

    // Validate WebSocket configuration
    if (config.enableWebSocket) {
      if (!config.webSocketPort) {
        logger.warn('ENABLE_WEBSOCKET=true but WEBSOCKET_PORT not set, using default 8080');
      }
      if (config.webSocketAllowedOrigins?.includes('*')) {
        logger.warn('WEBSOCKET_ALLOWED_ORIGINS contains wildcard (*). Not recommended for production.');
      }
    }

    // Validate Burn Economics configuration
    if (config.baseFilingBurn !== undefined && config.baseFilingBurn <= 0) {
      logger.warn('BASE_FILING_BURN is set but value is not positive');
    }

    // Validate Security Apps configuration
    const boundaryDaemonEnabled = process.env.BOUNDARY_DAEMON_ENABLED === 'true';
    const boundarySIEMEnabled = process.env.BOUNDARY_SIEM_ENABLED === 'true';

    if (boundaryDaemonEnabled && !process.env.BOUNDARY_DAEMON_TOKEN) {
      logger.warn('BOUNDARY_DAEMON_ENABLED=true but BOUNDARY_DAEMON_TOKEN not set');
    }

    if (boundarySIEMEnabled && !process.env.BOUNDARY_SIEM_TOKEN) {
      logger.warn('BOUNDARY_SIEM_ENABLED=true but BOUNDARY_SIEM_TOKEN not set');
    }

    // Validate Semantic Consensus configuration
    if (config.enableSemanticConsensus) {
      if (!config.requiredVerifiers || config.requiredVerifiers <= 0) {
        logger.warn('ENABLE_SEMANTIC_CONSENSUS=true but REQUIRED_VERIFIERS not set, using default');
      }
      if (!config.highValueThreshold || config.highValueThreshold <= 0) {
        logger.warn('ENABLE_SEMANTIC_CONSENSUS=true but HIGH_VALUE_THRESHOLD not set, using default');
      }
    }

    // Validate Governance configuration
    if (config.enableGovernance) {
      if (!config.governanceVotingPeriodDays || config.governanceVotingPeriodDays <= 0) {
        logger.warn('ENABLE_GOVERNANCE=true but GOVERNANCE_VOTING_PERIOD_DAYS not set, using default');
      }
      if (!config.governanceQuorumPercentage || config.governanceQuorumPercentage <= 0) {
        logger.warn('ENABLE_GOVERNANCE=true but GOVERNANCE_QUORUM_PERCENTAGE not set, using default');
      }
    }
  }
}
