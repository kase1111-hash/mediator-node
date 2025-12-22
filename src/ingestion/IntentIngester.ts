import axios from 'axios';
import { Intent, IntentStatus, MediatorConfig } from '../types';
import { logger } from '../utils/logger';
import { generateIntentHash } from '../utils/crypto';
import { BurnManager } from '../burn/BurnManager';

/**
 * IntentIngester monitors the NatLangChain for new intents
 * and maintains a local cache of unclosed intents
 */
export class IntentIngester {
  private config: MediatorConfig;
  private intentCache: Map<string, Intent> = new Map();
  private lastPollTime: number = 0;
  private pollingInterval: NodeJS.Timeout | null = null;
  private burnManager: BurnManager | null = null;

  constructor(config: MediatorConfig, burnManager?: BurnManager) {
    this.config = config;
    this.burnManager = burnManager || null;
  }

  /**
   * Start polling for new intents
   */
  public startPolling(intervalMs: number = 10000): void {
    logger.info('Starting intent ingestion polling', { intervalMs });

    this.pollingInterval = setInterval(async () => {
      await this.pollForIntents();
    }, intervalMs);

    // Initial poll
    this.pollForIntents();
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
   */
  private async pollForIntents(): Promise<void> {
    try {
      logger.debug('Polling for new intents', { endpoint: this.config.chainEndpoint });

      const response = await axios.get(`${this.config.chainEndpoint}/api/v1/intents`, {
        params: {
          status: 'pending',
          since: this.lastPollTime,
          limit: 100,
        },
      });

      const intents: Intent[] = response.data.intents || [];

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
    const maxFlags = 5; // As per spec

    if (flagCount >= maxFlags) {
      return true;
    }

    // Check for vagueness
    if (intent.prose.length < 50 || !intent.prose.includes(' ')) {
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
   * Preview burn amount required for intent submission
   * @param userId - User ID submitting the intent
   * @returns Burn calculation details
   */
  public previewIntentBurn(userId: string): {
    amount: number;
    isFree: boolean;
    breakdown: {
      baseBurn: number;
      escalationMultiplier: number;
      loadMultiplier: number;
      submissionCount: number;
    };
  } | null {
    if (!this.burnManager) {
      logger.warn('BurnManager not available for burn preview');
      return null;
    }

    return this.burnManager.calculateFilingBurn(userId);
  }

  /**
   * Submit an intent to the chain with burn validation
   * This method executes the required burn before submitting the intent
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
    // Validate burn manager is available
    if (!this.burnManager) {
      logger.error('Cannot submit intent: BurnManager not configured');
      throw new Error('BurnManager required for intent submission');
    }

    // Validate intent data
    if (!intentData.author || !intentData.prose || intentData.prose.length < 10) {
      logger.error('Invalid intent data', { author: intentData.author });
      throw new Error('Invalid intent data: author and prose (min 10 chars) required');
    }

    // Generate timestamp and intent hash
    const timestamp = Date.now();
    const intentHash = generateIntentHash(intentData.prose, intentData.author, timestamp);

    // Preview burn requirement
    const burnPreview = this.burnManager.calculateFilingBurn(intentData.author);

    logger.info('Submitting intent with burn requirement', {
      author: intentData.author,
      intentHash,
      burnRequired: burnPreview.amount,
      isFree: burnPreview.isFree,
    });

    try {
      // Execute burn (if required)
      const burnResult = await this.burnManager.executeFilingBurn(
        intentData.author,
        intentHash
      );

      if (!burnPreview.isFree && !burnResult) {
        logger.error('Burn execution failed', { intentHash });
        throw new Error('Burn execution failed');
      }

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

      // Submit to chain
      const response = await axios.post(
        `${this.config.chainEndpoint}/api/v1/intents`,
        {
          intent,
          burnTransaction: burnResult,
        }
      );

      if (response.status === 200 || response.status === 201) {
        logger.info('Intent submitted successfully', {
          hash: intentHash,
          author: intentData.author,
          burnAmount: burnPreview.amount,
        });

        // Cache the intent locally
        this.intentCache.set(intentHash, intent);

        return intent;
      }

      logger.error('Intent submission failed', {
        status: response.status,
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
}
