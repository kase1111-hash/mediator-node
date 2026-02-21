/**
 * ChainClient - Adapter for NatLangChain API
 *
 * This client provides a unified interface for mediator-node to communicate
 * with NatLangChain, handling endpoint translation and data transformation.
 *
 * NatLangChain API endpoints:
 * - POST /entry - Add natural language entry
 * - GET /pending - Get pending unmined entries
 * - GET /entries/search?intent=<keyword> - Search by intent
 * - GET /entries/author/<author> - Get entries by author
 * - POST /search/semantic - Meaning-based search
 * - GET /contract/list?status=open - Get open contracts (for mediators)
 * - POST /contract/propose - Submit contract proposal
 * - POST /contract/payout - Claim payout
 * - GET /chain - Get entire blockchain
 * - GET /health - Health check
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { Intent, ProposedSettlement, Challenge, MediatorConfig, BurnTransaction, AlignmentCandidate } from '../types';
import { logger } from '../utils/logger';
import { generateSignature } from '../utils/crypto';
import { CircuitBreaker, CircuitBreakerStats, CircuitOpenError } from '../utils/circuit-breaker';
import {
  NatLangChainEntry,
  NatLangChainContract,
  entryToIntent,
  intentToEntry,
  settlementToEntry,
  settlementToContractProposal,
  challengeToEntry,
  burnToEntry,
  contractToSettlement,
} from './transformers';
import { scanForSecrets, redactSecrets } from '../utils/secret-scanner';

export interface ChainClientConfig {
  chainEndpoint: string;
  mediatorPublicKey: string;
  mediatorPrivateKey: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface SubmitEntryOptions {
  type?: string;
  signature?: string;
  validate?: boolean;
  autoMine?: boolean;
}

export interface SearchOptions {
  intent?: string;
  author?: string;
  status?: string;
  since?: number;
  limit?: number;
  topK?: number;
  minScore?: number;
}

export class ChainClient {
  private config: ChainClientConfig;
  private client: AxiosInstance;
  private retryAttempts: number;
  private retryDelay: number;
  private circuitBreaker: CircuitBreaker;

  constructor(config: ChainClientConfig) {
    this.config = config;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;

    // Initialize circuit breaker for chain operations
    this.circuitBreaker = new CircuitBreaker({
      name: `chain-${new URL(config.chainEndpoint).host}`,
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      successThreshold: 2,
    });

    this.client = axios.create({
      baseURL: config.chainEndpoint,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        logger.error('Chain API error', {
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create ChainClient from MediatorConfig
   */
  static fromConfig(config: MediatorConfig): ChainClient {
    return new ChainClient({
      chainEndpoint: config.chainEndpoint,
      mediatorPublicKey: config.mediatorPublicKey,
      mediatorPrivateKey: config.mediatorPrivateKey,
    });
  }

  // ============================================================================
  // Health & Status
  // ============================================================================

  /**
   * Check chain health (includes circuit breaker status)
   */
  async checkHealth(): Promise<{
    healthy: boolean;
    status?: any;
    circuitBreaker: CircuitBreakerStats;
  }> {
    const circuitBreaker = this.circuitBreaker.getStats();

    // If circuit is open, report unhealthy without making request
    if (circuitBreaker.state === 'open') {
      return {
        healthy: false,
        status: { error: 'Circuit breaker open - chain unavailable' },
        circuitBreaker,
      };
    }

    try {
      const response = await this.withRetry(() => this.client.get('/health'));
      return {
        healthy: true,
        status: response.data,
        circuitBreaker: this.circuitBreaker.getStats(), // Get fresh stats after request
      };
    } catch (error) {
      return {
        healthy: false,
        status: error instanceof CircuitOpenError
          ? { error: 'Circuit breaker open' }
          : { error: error instanceof Error ? error.message : 'Unknown error' },
        circuitBreaker: this.circuitBreaker.getStats(),
      };
    }
  }

  /**
   * Get chain statistics
   */
  async getStats(): Promise<any> {
    const response = await this.withRetry(() => this.client.get('/stats'));
    return response.data;
  }

  // ============================================================================
  // Intent Operations
  // ============================================================================

  /**
   * Get pending intents (maps to /pending or /entries/search)
   */
  async getPendingIntents(options: SearchOptions = {}): Promise<Intent[]> {
    try {
      let entries: NatLangChainEntry[] = [];

      // Try /pending first for unmined entries
      try {
        const pendingResponse = await this.client.get('/pending');
        if (pendingResponse.data) {
          entries = Array.isArray(pendingResponse.data)
            ? pendingResponse.data
            : pendingResponse.data.entries || [];
        }
      } catch {
        // Fall back to search
        logger.debug('Falling back to /entries/search for pending intents');
      }

      // Also search for contract-type entries
      if (options.intent || entries.length === 0) {
        try {
          const searchParams = new URLSearchParams();
          if (options.intent) searchParams.append('intent', options.intent);
          if (options.status) searchParams.append('status', options.status);

          const searchResponse = await this.client.get(
            `/entries/search?${searchParams.toString()}`
          );

          if (searchResponse.data) {
            const searchEntries = Array.isArray(searchResponse.data)
              ? searchResponse.data
              : searchResponse.data.entries || searchResponse.data.results || [];
            entries = [...entries, ...searchEntries];
          }
        } catch {
          logger.debug('Search endpoint not available');
        }
      }

      // Filter by contract type (offers and seeks)
      const contractEntries = entries.filter(
        entry =>
          entry.metadata?.is_contract ||
          entry.metadata?.contract_type === 'offer' ||
          entry.metadata?.contract_type === 'seek'
      );

      // Transform to Intent objects
      const intents = contractEntries.map(entry => entryToIntent(entry));

      // Apply filters
      let filteredIntents = intents;

      if (options.since) {
        filteredIntents = filteredIntents.filter(i => i.timestamp > (options.since || 0));
      }

      if (options.limit) {
        filteredIntents = filteredIntents.slice(0, options.limit);
      }

      return filteredIntents;
    } catch (error) {
      logger.error('Error fetching pending intents', { error });
      return [];
    }
  }

  /**
   * Get intent by hash
   */
  async getIntent(hash: string): Promise<Intent | null> {
    try {
      // Try semantic search with the hash
      const response = await this.client.post('/search/semantic', {
        query: hash,
        top_k: 1,
        field: 'both',
      });

      if (response.data?.results?.length > 0) {
        const entry = response.data.results[0];
        if (entry.metadata?.hash === hash) {
          return entryToIntent(entry);
        }
      }

      // Fall back to searching all entries
      const chainResponse = await this.client.get('/chain');
      if (chainResponse.data?.blocks) {
        for (const block of chainResponse.data.blocks) {
          for (const entry of block.entries || []) {
            if (entry.metadata?.hash === hash) {
              return entryToIntent(entry);
            }
          }
        }
      }

      return null;
    } catch (error) {
      logger.error('Error fetching intent by hash', { hash, error });
      return null;
    }
  }

  /**
   * Submit a new intent
   */
  async submitIntent(
    intent: Intent,
    burnTransaction?: BurnTransaction
  ): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      const entry = intentToEntry(intent);

      // Add burn transaction to metadata if provided
      if (burnTransaction) {
        entry.metadata = {
          ...entry.metadata,
          burn_transaction: burnTransaction,
        };
      }

      const response = await this.client.post('/entry', {
        ...entry,
        validate: true,
        auto_mine: false,
      });

      if (response.status === 200 || response.status === 201) {
        return { success: true, hash: intent.hash };
      }

      return { success: false, error: 'Unexpected response status' };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.message || 'Failed to submit intent',
      };
    }
  }

  /**
   * Get intents by author
   */
  async getIntentsByAuthor(author: string): Promise<Intent[]> {
    try {
      const response = await this.client.get(`/entries/author/${encodeURIComponent(author)}`);

      const entries = Array.isArray(response.data)
        ? response.data
        : response.data.entries || [];

      return entries
        .filter((e: NatLangChainEntry) => e.metadata?.is_contract)
        .map((e: NatLangChainEntry) => entryToIntent(e));
    } catch (error) {
      logger.error('Error fetching intents by author', { author, error });
      return [];
    }
  }

  // ============================================================================
  // Settlement/Contract Operations
  // ============================================================================

  /**
   * Get open contracts for mediation
   */
  async getOpenContracts(): Promise<ProposedSettlement[]> {
    try {
      const response = await this.client.get('/contract/list', {
        params: { status: 'open' },
      });

      const contracts = Array.isArray(response.data)
        ? response.data
        : response.data.contracts || [];

      return contracts.map((c: NatLangChainContract) => contractToSettlement(c));
    } catch (error) {
      logger.error('Error fetching open contracts', { error });
      return [];
    }
  }

  /**
   * Get match candidates from the chain's autonomous matching
   * Uses POST /contract/match to find potential alignment pairs
   */
  async getMatchCandidates(
    content: string,
    topK: number = 5
  ): Promise<AlignmentCandidate[]> {
    try {
      const response = await this.client.post('/contract/match', {
        content,
        top_k: topK,
      });

      const matches: NatLangChainContract[] = response.data?.matches || [];
      const candidates: AlignmentCandidate[] = [];

      // Resolve intent pairs from contract references in parallel
      const resolvePromises = matches.map(async (match) => {
        if (!match.offer_ref || !match.seek_ref) return null;

        const [intentA, intentB] = await Promise.all([
          this.getIntent(match.offer_ref),
          this.getIntent(match.seek_ref),
        ]);

        if (!intentA || !intentB) return null;

        return {
          intentA,
          intentB,
          similarityScore: match.match_score || 0,
          estimatedValue: match.facilitation_fee || 0,
          priority: match.match_score || 0,
          reason: 'chain-sourced match',
        } as AlignmentCandidate;
      });

      const results = await Promise.all(resolvePromises);
      for (const result of results) {
        if (result) candidates.push(result);
      }

      return candidates;
    } catch (error) {
      logger.debug('Chain match candidates not available', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return [];
    }
  }

  /**
   * Submit a settlement proposal
   */
  async submitSettlement(
    settlement: ProposedSettlement
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Scan settlement data for secrets before chain submission
      const dataToScan = `${settlement.reasoningTrace} ${JSON.stringify(settlement.proposedTerms)}`;
      const settlementScan = scanForSecrets(dataToScan);
      if (settlementScan.found) {
        logger.warn('Secrets detected in settlement data — blocking submission', {
          settlementId: settlement.id,
          matchCount: settlementScan.matches.length,
          matchLabels: settlementScan.matches.map(m => m.label),
          security: true,
        });
        return { success: false, error: 'Settlement contains potential secrets — submission blocked' };
      }

      // First, try the /contract/propose endpoint
      try {
        const proposal = settlementToContractProposal(settlement);
        const response = await this.client.post('/contract/propose', proposal);

        if (response.status === 200 || response.status === 201) {
          return { success: true };
        }
      } catch {
        logger.debug('Contract propose endpoint not available, using /entry');
      }

      // Fall back to submitting as an entry with retry logic
      const entry = settlementToEntry(settlement, this.config.mediatorPublicKey);
      const signature = generateSignature(entry.content, this.config.mediatorPrivateKey);

      const response = await this.withRetry(() =>
        this.client.post('/entry', {
          ...entry,
          signature,
          validate: true,
        })
      );

      if (response.status === 200 || response.status === 201) {
        return { success: true };
      }

      return { success: false, error: 'Unexpected response status' };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.message || 'Failed to submit settlement',
      };
    }
  }

  /**
   * Get settlement status
   */
  async getSettlementStatus(settlementId: string): Promise<{
    partyAAccepted: boolean;
    partyBAccepted: boolean;
    challenges: Challenge[];
    status: string;
  } | null> {
    try {
      // Search for acceptance entries related to this settlement
      const response = await this.client.post('/search/semantic', {
        query: `settlement ${settlementId} accept`,
        top_k: 20,
        field: 'both',
      });

      const results = response.data?.results || [];

      let partyAAccepted = false;
      let partyBAccepted = false;
      const challenges: Challenge[] = [];

      for (const entry of results) {
        const metadata = entry.metadata || {};

        // Check for acceptance entries
        if (metadata.settlement_id === settlementId) {
          if (metadata.party === 'A' && metadata.accepted) {
            partyAAccepted = true;
          }
          if (metadata.party === 'B' && metadata.accepted) {
            partyBAccepted = true;
          }
        }

        // Check for challenge entries
        if (
          metadata.challenge_id &&
          metadata.settlement_id === settlementId
        ) {
          challenges.push({
            id: metadata.challenge_id,
            settlementId: metadata.settlement_id,
            challengerId: metadata.challenger_id || entry.author,
            contradictionProof: metadata.contradiction_proof || '',
            paraphraseEvidence: metadata.paraphrase_evidence || '',
            timestamp: entry.timestamp || Date.now(),
            status: metadata.status || 'pending',
          });
        }
      }

      // Determine overall status
      let status = 'proposed';
      if (challenges.some(c => c.status === 'upheld')) {
        status = 'challenged';
      } else if (partyAAccepted && partyBAccepted) {
        status = 'accepted';
      }

      return { partyAAccepted, partyBAccepted, challenges, status };
    } catch (error) {
      logger.error('Error fetching settlement status', { settlementId, error });
      return null;
    }
  }

  /**
   * Get recent settlements from the chain
   */
  async getRecentSettlements(limit: number = 20): Promise<ProposedSettlement[]> {
    try {
      // Try getting open contracts first (these are proposed settlements)
      try {
        const response = await this.client.get(`/contract/list?status=open&limit=${limit}`);
        const contracts = response.data?.contracts || response.data || [];
        if (Array.isArray(contracts) && contracts.length > 0) {
          return contracts.map((c: NatLangChainContract) => contractToSettlement(c));
        }
      } catch {
        // Fall through to semantic search
      }

      // Fall back to semantic search
      const response = await this.client.post('/search/semantic', {
        query: 'settlement proposed',
        top_k: limit,
        field: 'both',
      });

      const results = response.data?.results || [];
      return results
        .filter((entry: any) => entry.metadata?.type === 'settlement')
        .map((entry: any) => contractToSettlement(entry))
        .filter((s: ProposedSettlement | null): s is ProposedSettlement => s !== null);
    } catch (error) {
      logger.error('Error fetching recent settlements', { error });
      return [];
    }
  }

  /**
   * Submit settlement payout
   */
  async submitPayout(
    settlementId: string,
    amount: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Try /contract/payout endpoint
      try {
        const response = await this.client.post('/contract/payout', {
          settlement_ref: settlementId,
          mediator_id: this.config.mediatorPublicKey,
          fee_amount: amount,
        });

        if (response.status === 200 || response.status === 201) {
          return { success: true };
        }
      } catch {
        logger.debug('Contract payout endpoint not available, using /entry');
      }

      // Fall back to entry with retry logic
      const content = `[PAYOUT] Settlement ${settlementId} closed. Claiming fee: ${amount} NLC`;
      const signature = generateSignature(content, this.config.mediatorPrivateKey);

      const response = await this.withRetry(() =>
        this.client.post('/entry', {
          content,
          author: this.config.mediatorPublicKey,
          intent: 'payout_claim',
          metadata: {
            settlement_id: settlementId,
            mediator_id: this.config.mediatorPublicKey,
            amount,
            timestamp: Date.now(),
          },
          signature,
          validate: true,
        })
      );

      return { success: response.status === 200 || response.status === 201 };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.message || 'Failed to submit payout',
      };
    }
  }

  // ============================================================================
  // Challenge Operations
  // ============================================================================

  /**
   * Submit a challenge
   */
  async submitChallenge(
    challenge: Challenge
  ): Promise<{ success: boolean; challengeId?: string; error?: string }> {
    try {
      // Scan challenge data for secrets
      const challengeData = `${challenge.contradictionProof} ${challenge.paraphraseEvidence}`;
      const challengeScan = scanForSecrets(challengeData);
      if (challengeScan.found) {
        logger.warn('Secrets detected in challenge data — blocking submission', {
          challengeId: challenge.id,
          matchCount: challengeScan.matches.length,
          security: true,
        });
        return { success: false, error: 'Challenge contains potential secrets — submission blocked' };
      }

      const entry = challengeToEntry(challenge, this.config.mediatorPublicKey);
      const signature = generateSignature(entry.content, this.config.mediatorPrivateKey);

      const response = await this.client.post('/entry', {
        ...entry,
        signature,
        validate: true,
      });

      if (response.status === 200 || response.status === 201) {
        return { success: true, challengeId: challenge.id };
      }

      return { success: false, error: 'Unexpected response status' };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.message || 'Failed to submit challenge',
      };
    }
  }

  /**
   * Get challenge status
   */
  async getChallengeStatus(
    challengeId: string
  ): Promise<{ status: 'pending' | 'upheld' | 'rejected' } | null> {
    try {
      const response = await this.client.post('/search/semantic', {
        query: `challenge ${challengeId}`,
        top_k: 10,
      });

      const results = response.data?.results || [];
      for (const entry of results) {
        if (entry.metadata?.challenge_id === challengeId) {
          return { status: entry.metadata.status || 'pending' };
        }
      }

      return null;
    } catch (error) {
      logger.error('Error fetching challenge status', { challengeId, error });
      return null;
    }
  }

  // ============================================================================
  // Burn Operations
  // ============================================================================

  /**
   * Submit a burn transaction
   */
  async submitBurn(
    burnData: {
      type: string;
      author: string;
      amount: number;
      intentHash?: string;
      settlementId?: string;
      multiplier?: number;
    }
  ): Promise<{ success: boolean; transactionId?: string; error?: string }> {
    try {
      // Try burn-specific endpoint first
      try {
        const response = await this.client.post('/burn/execute', burnData);
        if (response.status === 200 || response.status === 201) {
          return {
            success: true,
            transactionId: response.data?.transaction_id || response.data?.id,
          };
        }
      } catch {
        logger.debug('Burn endpoint not available, using /entry');
      }

      // Fall back to entry
      const entry = burnToEntry(burnData, this.config.mediatorPublicKey);
      const signature = generateSignature(entry.content, this.config.mediatorPrivateKey);

      const response = await this.client.post('/entry', {
        ...entry,
        signature,
        validate: true,
      });

      return { success: response.status === 200 || response.status === 201 };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.message || 'Failed to submit burn',
      };
    }
  }

  // ============================================================================
  // Generic Entry Operations
  // ============================================================================

  /**
   * Submit a generic entry to the chain
   */
  async submitEntry(
    content: string,
    intent: string,
    metadata?: Record<string, any>,
    options?: SubmitEntryOptions
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Scan outbound content for secrets before chain submission
      const contentScan = scanForSecrets(content);
      if (contentScan.found) {
        logger.warn('Secrets detected in chain submission content — redacting', {
          matchCount: contentScan.matches.length,
          matchLabels: contentScan.matches.map(m => m.label),
          security: true,
        });
        content = redactSecrets(content);
      }

      const signature =
        options?.signature ||
        generateSignature(content, this.config.mediatorPrivateKey);

      const response = await this.client.post('/entry', {
        content,
        author: this.config.mediatorPublicKey,
        intent,
        metadata: {
          ...metadata,
          entry_type: options?.type,
        },
        signature,
        validate: options?.validate !== false,
        auto_mine: options?.autoMine || false,
      });

      return { success: response.status === 200 || response.status === 201 };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.message || 'Failed to submit entry',
      };
    }
  }

  /**
   * Search entries semantically
   */
  async searchSemantic(
    query: string,
    options: { topK?: number; minScore?: number; field?: string } = {}
  ): Promise<NatLangChainEntry[]> {
    try {
      const response = await this.client.post('/search/semantic', {
        query,
        top_k: options.topK || 10,
        min_score: options.minScore,
        field: options.field || 'both',
      });

      return response.data?.results || [];
    } catch (error) {
      logger.error('Semantic search failed', { query, error });
      return [];
    }
  }

  /**
   * Get full chain data
   */
  async getChain(): Promise<any> {
    try {
      const response = await this.client.get('/chain');
      return response.data;
    } catch (error) {
      logger.error('Error fetching chain', { error });
      return null;
    }
  }

  /**
   * Validate chain integrity
   */
  async validateChain(): Promise<{ valid: boolean; issues?: string[] }> {
    try {
      const response = await this.client.get('/validate/chain');
      return {
        valid: response.data?.valid !== false,
        issues: response.data?.issues,
      };
    } catch {
      return { valid: false, issues: ['Failed to validate chain'] };
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Retry a request with exponential backoff and circuit breaker protection
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    attempts: number = this.retryAttempts
  ): Promise<T> {
    // Use circuit breaker to wrap the entire retry logic
    return this.circuitBreaker.execute(async () => {
      let lastError: Error | undefined;

      for (let i = 0; i < attempts; i++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error as Error;
          if (i < attempts - 1) {
            const delay = this.retryDelay * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError;
    });
  }

  /**
   * Get circuit breaker statistics for monitoring
   */
  getCircuitBreakerStats(): CircuitBreakerStats {
    return this.circuitBreaker.getStats();
  }

  /**
   * Check if the chain client is available (circuit not open)
   */
  isAvailable(): boolean {
    return this.circuitBreaker.isAvailable();
  }

  /**
   * Manually reset the circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  /**
   * Get the base URL for the chain
   */
  getBaseUrl(): string {
    return this.config.chainEndpoint;
  }
}
