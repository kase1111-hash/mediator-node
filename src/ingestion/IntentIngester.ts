import { Intent, IntentStatus, MediatorConfig } from '../types';
import { logger } from '../utils/logger';
import { generateIntentHash, verifySignature } from '../utils/crypto';
import { ChainClient } from '../chain';
import { detectPromptInjection, injectionRateLimiter } from '../utils/prompt-security';

/**
 * IntentIngester monitors the NatLangChain for new intents
 * and maintains a local cache of unclosed intents
 */
export class IntentIngester {
  private config: MediatorConfig;
  private intentCache: Map<string, Intent> = new Map();
  private lastPollTime: number = 0;
  private pollingInterval: NodeJS.Timeout | null = null;
  private chainClient: ChainClient;
  // Anomaly detection: track author submission frequency
  private authorFrequency: Map<string, number[]> = new Map();
  // Duplicate detection: track recent prose hashes
  private recentProseHashes: Map<string, number> = new Map();

  constructor(config: MediatorConfig, chainClient?: ChainClient) {
    this.config = config;
    this.chainClient = chainClient || ChainClient.fromConfig(config);
  }

  /**
   * Start polling for new intents
   */
  public startPolling(intervalMs: number = 10000): void {
    logger.info('Starting intent ingestion polling', { intervalMs });

    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollForIntents();
      } catch (error) {
        logger.error('Unhandled error in intent polling interval', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    }, intervalMs);

    // Initial poll with error handling (using same pattern as interval)
    (async () => {
      try {
        await this.pollForIntents();
      } catch (error) {
        logger.error('Error in initial intent poll', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    })();
  }

  /**
   * Stop polling
   */
  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      logger.info('Stopped intent ingestion polling');
    }
  }

  /**
   * Poll the chain for new intents
   * Uses ChainClient to fetch from NatLangChain API
   */
  private async pollForIntents(): Promise<void> {
    try {
      logger.debug('Polling for new intents', { endpoint: this.config.chainEndpoint });

      // Use ChainClient to get pending intents
      const intents = await this.chainClient.getPendingIntents({
        status: 'pending',
        since: this.lastPollTime,
        limit: 100,
      });

      for (const intent of intents) {
        await this.processIntent(intent);
      }

      this.lastPollTime = Date.now();

      logger.info('Intent polling complete', {
        newIntents: intents.length,
        cachedIntents: this.intentCache.size,
      });
    } catch (error) {
      logger.error('Error polling for intents', { error });
    }
  }

  /**
   * Process and validate a single intent
   */
  private async processIntent(intent: Intent): Promise<void> {
    // Skip if already cached
    if (this.intentCache.has(intent.hash)) {
      return;
    }

    // Validate intent
    if (!this.isValidIntent(intent)) {
      logger.warn('Invalid intent detected', { hash: intent.hash });
      return;
    }

    // Verify signature if present (permissive: unsigned intents are accepted)
    if (intent.signature) {
      const signatureValid = verifySignature(intent.prose, intent.signature, intent.author);
      if (!signatureValid) {
        logger.warn('Intent signature verification failed — skipping', {
          hash: intent.hash,
          author: intent.author,
          security: true,
        });
        return;
      }
    }

    // Check for prompt injection attempts
    if (detectPromptInjection(intent.prose)) {
      injectionRateLimiter.recordAttempt(intent.author);
      logger.warn('Prompt injection detected in intent prose', {
        hash: intent.hash,
        author: intent.author,
        security: true,
      });

      // If author is rate-limited, reject the intent entirely
      if (injectionRateLimiter.isLimited(intent.author)) {
        logger.warn('Author rate-limited due to repeated injection attempts — rejecting intent', {
          hash: intent.hash,
          author: intent.author,
          security: true,
        });
        return;
      }
      // Otherwise, continue processing (sanitization in LLMProvider will handle it)
    }

    // Anomaly detection: check author submission frequency
    const maxIntentsPerAuthorPerHour = (this.config as any).maxIntentsPerAuthorPerHour ?? 20;
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const authorTimestamps = this.authorFrequency.get(intent.author) || [];
    const recentTimestamps = authorTimestamps.filter(t => t > oneHourAgo);
    if (recentTimestamps.length >= maxIntentsPerAuthorPerHour) {
      logger.warn('Author exceeds intent submission rate limit', {
        hash: intent.hash,
        author: intent.author,
        count: recentTimestamps.length,
        security: true,
      });
      return;
    }
    recentTimestamps.push(now);
    this.authorFrequency.set(intent.author, recentTimestamps);

    // Duplicate detection: skip if same prose hash recently seen
    if (this.recentProseHashes.has(intent.hash)) {
      logger.debug('Duplicate intent prose hash detected — skipping', { hash: intent.hash });
      return;
    }
    this.recentProseHashes.set(intent.hash, now);
    // Cleanup old prose hash entries (older than 1 hour)
    for (const [hash, ts] of this.recentProseHashes.entries()) {
      if (ts < oneHourAgo) this.recentProseHashes.delete(hash);
    }

    // Check for "Unalignable" flags
    if (this.isUnalignable(intent)) {
      logger.info('Intent marked as unalignable', { hash: intent.hash });
      return;
    }

    // Parse desires and constraints if not already parsed
    if (!intent.desires || intent.desires.length === 0) {
      intent.desires = this.extractDesires(intent.prose);
    }

    if (!intent.constraints || intent.constraints.length === 0) {
      intent.constraints = this.extractConstraints(intent.prose);
    }

    // Cache the intent
    this.intentCache.set(intent.hash, intent);

    logger.info('New intent cached', {
      hash: intent.hash,
      author: intent.author,
      desires: intent.desires.length,
      constraints: intent.constraints.length,
    });

    // Enforce max cache size
    this.enforceMaxCacheSize();
  }

  /**
   * Validate intent structure and content
   */
  private isValidIntent(intent: Intent): boolean {
    if (!intent.hash || !intent.author || !intent.prose) {
      return false;
    }

    if (intent.prose.length < 10) {
      return false;
    }

    // Check for prohibited content (basic checks)
    const prohibitedPatterns = [
      /\b(coerce|force|manipulate)\b/i,
      /\b(illegal|unlawful|criminal)\b/i,
    ];

    for (const pattern of prohibitedPatterns) {
      if (pattern.test(intent.prose)) {
        logger.warn('Intent contains prohibited content', { hash: intent.hash });
        return false;
      }
    }

    return true;
  }

  /**
   * Check if intent should be marked as unalignable
   */
  private isUnalignable(intent: Intent): boolean {
    const flagCount = intent.flagCount || 0;
    // Use configurable max flags (default: 5 as per MP-01 spec)
    const maxFlags = this.config.maxIntentFlags ?? 5;

    if (flagCount >= maxFlags) {
      return true;
    }

    // Check for vagueness using configurable minimum prose length (default: 50)
    const minProseLength = this.config.minIntentProseLength ?? 50;
    if (intent.prose.length < minProseLength || !intent.prose.includes(' ')) {
      return true;
    }

    return false;
  }

  /**
   * Extract desires from prose (simple heuristic)
   * In production, this would use LLM
   */
  private extractDesires(prose: string): string[] {
    const desires: string[] = [];

    // Look for phrases indicating desires
    const desirePatterns = [
      /I (?:want|need|seek|require|am looking for) (.+?)(?:\.|,|$)/gi,
      /looking for (.+?)(?:\.|,|$)/gi,
      /seeking (.+?)(?:\.|,|$)/gi,
    ];

    for (const pattern of desirePatterns) {
      const matches = prose.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          desires.push(match[1].trim());
        }
      }
    }

    return desires.length > 0 ? desires : ['general collaboration'];
  }

  /**
   * Extract constraints from prose (simple heuristic)
   * In production, this would use LLM
   */
  private extractConstraints(prose: string): string[] {
    const constraints: string[] = [];

    // Look for phrases indicating constraints
    const constraintPatterns = [
      /must (?:be|have|include) (.+?)(?:\.|,|$)/gi,
      /(?:cannot|will not|won't) (.+?)(?:\.|,|$)/gi,
      /requires? (.+?)(?:\.|,|$)/gi,
    ];

    for (const pattern of constraintPatterns) {
      const matches = prose.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          constraints.push(match[1].trim());
        }
      }
    }

    return constraints;
  }

  /**
   * Enforce maximum cache size by removing oldest intents
   */
  private enforceMaxCacheSize(): void {
    if (this.intentCache.size <= this.config.maxIntentsCache) {
      return;
    }

    // Sort by timestamp and remove oldest
    const sortedIntents = Array.from(this.intentCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = sortedIntents.slice(0, this.intentCache.size - this.config.maxIntentsCache);

    for (const [hash] of toRemove) {
      this.intentCache.delete(hash);
    }

    logger.debug('Enforced max cache size', {
      removed: toRemove.length,
      remaining: this.intentCache.size,
    });
  }

  /**
   * Get all cached intents
   */
  public getCachedIntents(): Intent[] {
    return Array.from(this.intentCache.values());
  }

  /**
   * Get a specific intent by hash
   */
  public getIntent(hash: string): Intent | undefined {
    return this.intentCache.get(hash);
  }

  /**
   * Remove intent from cache (e.g., when closed)
   */
  public removeIntent(hash: string): void {
    this.intentCache.delete(hash);
  }

  /**
   * Get intents prioritized by offered fee
   */
  public getPrioritizedIntents(): Intent[] {
    return this.getCachedIntents().sort((a, b) => {
      const feeA = a.offeredFee || 0;
      const feeB = b.offeredFee || 0;
      return feeB - feeA; // Descending order
    });
  }

  /**
   * Submit an intent to the chain
   * Uses ChainClient to submit to NatLangChain API
   *
   * @param intentData - Intent data to submit
   * @returns The submitted intent with hash, or null if submission failed
   */
  public async submitIntent(intentData: {
    author: string;
    prose: string;
    desires?: string[];
    constraints?: string[];
    offeredFee?: number;
    branch?: string;
  }): Promise<Intent | null> {
    // Validate intent data
    if (!intentData.author || !intentData.prose || intentData.prose.length < 10) {
      logger.error('Invalid intent data', { author: intentData.author });
      throw new Error('Invalid intent data: author and prose (min 10 chars) required');
    }

    // Generate timestamp and intent hash
    const timestamp = Date.now();
    const intentHash = generateIntentHash(intentData.prose, intentData.author, timestamp);

    logger.info('Submitting intent', {
      author: intentData.author,
      intentHash,
    });

    try {
      // Construct intent object
      const intent: Intent = {
        hash: intentHash,
        author: intentData.author,
        prose: intentData.prose,
        desires: intentData.desires || this.extractDesires(intentData.prose),
        constraints: intentData.constraints || this.extractConstraints(intentData.prose),
        offeredFee: intentData.offeredFee,
        timestamp,
        status: 'pending' as IntentStatus,
        branch: intentData.branch,
        flagCount: 0,
      };

      // Submit to chain using ChainClient
      const result = await this.chainClient.submitIntent(intent);

      if (result.success) {
        logger.info('Intent submitted successfully', {
          hash: intentHash,
          author: intentData.author,
        });

        // Cache the intent locally
        this.intentCache.set(intentHash, intent);

        return intent;
      }

      logger.error('Intent submission failed', {
        error: result.error,
        hash: intentHash,
      });
      return null;
    } catch (error) {
      logger.error('Error submitting intent', {
        error,
        author: intentData.author,
        intentHash,
      });
      throw error;
    }
  }

  /**
   * Get the ChainClient instance
   */
  public getChainClient(): ChainClient {
    return this.chainClient;
  }
}
