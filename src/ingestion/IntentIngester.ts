import axios from 'axios';
import { Intent, IntentStatus, MediatorConfig } from '../types';
import { logger } from '../utils/logger';
import { generateIntentHash } from '../utils/crypto';

/**
 * IntentIngester monitors the NatLangChain for new intents
 * and maintains a local cache of unclosed intents
 */
export class IntentIngester {
  private config: MediatorConfig;
  private intentCache: Map<string, Intent> = new Map();
  private lastPollTime: number = 0;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor(config: MediatorConfig) {
    this.config = config;
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
}
