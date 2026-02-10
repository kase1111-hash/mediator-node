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

      // DPoS/PoA configuration
      bondedStakeAmount: this.getOptionalNumber('BONDED_STAKE_AMOUNT'),
      minEffectiveStake: this.getOptionalNumber('MIN_EFFECTIVE_STAKE'),
      poaAuthorityKey: this.getOptional('POA_AUTHORITY_KEY'),

      // Vector database
      vectorDbPath: this.getOptional('VECTOR_DB_PATH', './vector-db'),
      vectorDimensions: parseInt(this.getOptional('VECTOR_DIMENSIONS', '1536')),
      maxIntentsCache: parseInt(this.getOptional('MAX_INTENTS_CACHE', '10000')),

      // Reputation
      reputationChainEndpoint: this.getOptional('REPUTATION_CHAIN_ENDPOINT'),

      // Acceptance window
      acceptanceWindowHours: parseInt(this.getOptional('ACCEPTANCE_WINDOW_HOURS', '72')),

      // Embedding configuration
      embeddingProvider: this.getEmbeddingProvider(),
      embeddingApiKey: this.getOptional('EMBEDDING_API_KEY'),
      embeddingModel: this.getOptional('EMBEDDING_MODEL'),

      // Negotiation thresholds
      minNegotiationConfidence: this.getOptionalNumber('MIN_NEGOTIATION_CONFIDENCE'),

      // Intent validation thresholds
      maxIntentFlags: this.getOptionalNumber('MAX_INTENT_FLAGS'),
      minIntentProseLength: this.getOptionalNumber('MIN_INTENT_PROSE_LENGTH'),

      // Challenge submission configuration
      enableChallengeSubmission: this.getOptional('ENABLE_CHALLENGE_SUBMISSION') === 'true',
      minConfidenceToChallenge: this.getOptionalNumber('MIN_CONFIDENCE_TO_CHALLENGE'),
      challengeCheckInterval: this.getOptionalNumber('CHALLENGE_CHECK_INTERVAL'),

      // Core timing intervals
      alignmentCycleIntervalMs: this.getOptionalNumber('ALIGNMENT_CYCLE_INTERVAL_MS'),
      intentPollingIntervalMs: this.getOptionalNumber('INTENT_POLLING_INTERVAL_MS'),
      settlementMonitoringIntervalMs: this.getOptionalNumber('SETTLEMENT_MONITORING_INTERVAL_MS'),

      // Health server
      healthServerPort: this.getOptionalNumber('HEALTH_SERVER_PORT'),

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
   */
  private static getEmbeddingProvider(): 'openai' | 'voyage' | 'cohere' | 'fallback' | undefined {
    const provider = this.getOptional('EMBEDDING_PROVIDER');

    if (!provider) {
      return undefined;
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
          'Anthropic does not provide embeddings. ' +
          'Using character-based fallback which is NOT suitable for production. ' +
          'Configure EMBEDDING_PROVIDER and EMBEDDING_API_KEY for production use.'
        );
      } else if (!config.embeddingApiKey) {
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
  }
}
