import axios from 'axios';
import crypto from 'crypto';
import {
  MediatorConfig,
  ProposedSettlement,
  Intent,
  VerificationRequest,
  VerificationResponse,
  SemanticVerification,
  SemanticEquivalenceResult,
} from '../types';
import { LLMProvider } from '../llm/LLMProvider';
import { ReputationTracker } from '../reputation/ReputationTracker';
import { logger } from '../utils/logger';
import { generateSignature } from '../utils/crypto';
import { withTimeout, TimeoutError, DEFAULT_TIMEOUTS } from '../utils/timeout';

/**
 * SemanticConsensusManager handles distributed verification of high-value settlements
 * through semantic consensus among randomly selected mediators
 */
export class SemanticConsensusManager {
  private config: MediatorConfig;
  private llmProvider: LLMProvider;
  private reputationTracker: ReputationTracker | null = null;
  private activeVerifications: Map<string, SemanticVerification> = new Map();
  private pendingRequests: Map<string, VerificationRequest> = new Map();

  constructor(
    config: MediatorConfig,
    llmProvider: LLMProvider,
    reputationTracker?: ReputationTracker
  ) {
    this.config = config;
    this.llmProvider = llmProvider;
    this.reputationTracker = reputationTracker || null;
  }

  /**
   * Determine if a settlement requires semantic consensus verification
   */
  public requiresVerification(settlement: ProposedSettlement): boolean {
    if (!this.config.enableSemanticConsensus) {
      return false;
    }

    const threshold = this.config.highValueThreshold || 10000;
    const settlementValue = this.calculateSettlementValue(settlement);

    return settlementValue >= threshold;
  }

  /**
   * Calculate the total value of a settlement
   */
  public calculateSettlementValue(settlement: ProposedSettlement): number {
    // Primary value source: proposed price
    if (settlement.proposedTerms.price) {
      return settlement.proposedTerms.price;
    }

    // Fallback: calculate from facilitation fee
    if (settlement.facilitationFeePercent > 0) {
      return settlement.facilitationFee / (settlement.facilitationFeePercent / 100);
    }

    return 0;
  }

  /**
   * Initiate verification request for a high-value settlement
   */
  public async initiateVerification(
    settlement: ProposedSettlement
  ): Promise<SemanticVerification> {
    try {
      logger.info('Initiating semantic consensus verification', {
        settlementId: settlement.id,
        value: this.calculateSettlementValue(settlement),
      });

      // Select verifiers using weighted random selection
      const selectedVerifiers = await this.selectVerifiers(settlement.mediatorId);

      if (selectedVerifiers.length < (this.config.requiredVerifiers || 5)) {
        throw new Error(
          `Insufficient verifiers available: ${selectedVerifiers.length} < ${
            this.config.requiredVerifiers || 5
          }`
        );
      }

      const deadlineHours = this.config.verificationDeadlineHours || 24;
      const request: VerificationRequest = {
        settlementId: settlement.id,
        requesterId: this.config.mediatorPublicKey,
        intentHashA: settlement.intentHashA,
        intentHashB: settlement.intentHashB,
        proposedTerms: settlement.proposedTerms,
        settlementValue: this.calculateSettlementValue(settlement),
        selectedVerifiers,
        requestedAt: Date.now(),
        responseDeadline: Date.now() + deadlineHours * 60 * 60 * 1000,
        signature: '',
      };

      // Sign the request
      request.signature = generateSignature(
        JSON.stringify({
          settlementId: request.settlementId,
          selectedVerifiers: request.selectedVerifiers,
          requestedAt: request.requestedAt,
        }),
        this.config.mediatorPrivateKey
      );

      // Submit verification request to chain
      await this.submitVerificationRequest(request);

      // Track the verification
      const verification: SemanticVerification = {
        settlementId: settlement.id,
        status: 'pending',
        request,
        responses: [],
        equivalenceResults: [],
        consensusReached: false,
        consensusCount: 0,
        requiredConsensus: this.config.requiredConsensus || 3,
      };

      this.activeVerifications.set(settlement.id, verification);

      logger.info('Verification request initiated', {
        settlementId: settlement.id,
        verifiers: selectedVerifiers.length,
        deadline: new Date(request.responseDeadline).toISOString(),
      });

      return verification;
    } catch (error) {
      logger.error('Error initiating verification', { error, settlementId: settlement.id });
      throw error;
    }
  }

  /**
   * Select verifiers using weighted random selection based on reputation
   */
  private async selectVerifiers(excludeMediatorId: string): Promise<string[]> {
    const timeoutMs = this.config.verifierSelectionTimeoutMs || DEFAULT_TIMEOUTS.apiRequest;

    try {
      // Fetch available mediators from chain with timeout
      const response = await withTimeout(
        () => axios.get(`${this.config.chainEndpoint}/api/v1/mediators/active`),
        timeoutMs,
        'Verifier selection'
      );

      if (!response.data || !Array.isArray(response.data.mediators)) {
        throw new Error('Failed to fetch mediator pool');
      }

      const mediators = response.data.mediators.filter(
        (m: any) => m.id !== excludeMediatorId && m.id !== this.config.mediatorPublicKey
      );

      if (mediators.length < (this.config.requiredVerifiers || 5)) {
        logger.warn('Insufficient mediators in pool', {
          available: mediators.length,
          required: this.config.requiredVerifiers || 5,
        });
        return mediators.slice(0, this.config.requiredVerifiers || 5).map((m: any) => m.id);
      }

      // Perform weighted random selection
      const selected = this.weightedRandomSelection(
        mediators,
        this.config.requiredVerifiers || 5
      );

      return selected.map((m: any) => m.id);
    } catch (error) {
      if (error instanceof TimeoutError) {
        logger.error('Verifier selection timed out', {
          timeoutMs,
          operation: error.operationName,
        });
      } else {
        logger.error('Error selecting verifiers', { error });
      }
      throw error;
    }
  }

  /**
   * Weighted random selection using reputation weights
   */
  private weightedRandomSelection(
    mediators: any[],
    count: number
  ): any[] {
    // Create a deterministic seed based on timestamp and settlement
    // In production, use block hash or other chain-provided randomness
    const seed = Date.now().toString();
    const selectedIndices = new Set<number>();
    const selected: any[] = [];

    // Calculate total weight
    const totalWeight = mediators.reduce((sum, m) => sum + (m.weight || 1), 0);

    // Create cumulative weight array
    const cumulativeWeights: number[] = [];
    let cumulative = 0;
    for (const mediator of mediators) {
      cumulative += mediator.weight || 1;
      cumulativeWeights.push(cumulative);
    }

    // Select `count` unique mediators
    for (let i = 0; i < count && selected.length < mediators.length; i++) {
      // Generate deterministic random number using seed
      const randomValue = this.seededRandom(seed + i.toString()) * totalWeight;

      // Find mediator index using binary search on cumulative weights
      let selectedIndex = 0;
      for (let j = 0; j < cumulativeWeights.length; j++) {
        if (randomValue <= cumulativeWeights[j]) {
          selectedIndex = j;
          break;
        }
      }

      // Ensure uniqueness
      while (selectedIndices.has(selectedIndex) && selectedIndices.size < mediators.length) {
        selectedIndex = (selectedIndex + 1) % mediators.length;
      }

      selectedIndices.add(selectedIndex);
      selected.push(mediators[selectedIndex]);
    }

    return selected;
  }

  /**
   * Generate deterministic pseudo-random number from seed (0-1)
   */
  private seededRandom(seed: string): number {
    const hash = crypto.createHash('sha256').update(seed).digest();
    const value = hash.readUInt32BE(0);
    return value / 0xffffffff;
  }

  /**
   * Submit verification request to chain
   */
  private async submitVerificationRequest(request: VerificationRequest): Promise<void> {
    const timeoutMs = this.config.chainRequestTimeoutMs || DEFAULT_TIMEOUTS.apiRequest;

    try {
      await withTimeout(
        () =>
          axios.post(`${this.config.chainEndpoint}/api/v1/verifications`, {
            request,
          }),
        timeoutMs,
        'Submit verification request'
      );

      logger.info('Verification request submitted to chain', {
        settlementId: request.settlementId,
      });
    } catch (error) {
      if (error instanceof TimeoutError) {
        logger.error('Verification request submission timed out', {
          settlementId: request.settlementId,
          timeoutMs,
        });
      } else {
        logger.error('Error submitting verification request', { error });
      }
      throw error;
    }
  }

  /**
   * Handle incoming verification request (when selected as verifier)
   */
  public async handleVerificationRequest(
    request: VerificationRequest,
    intentA: Intent,
    intentB: Intent
  ): Promise<VerificationResponse | null> {
    try {
      // Check if we're opted in to participate
      const participateInVerification = this.config.participateInVerification ?? true;
      if (!participateInVerification) {
        logger.info('Skipping verification - participation disabled', {
          settlementId: request.settlementId,
        });
        return null;
      }

      // Check if we're in the selected verifiers list
      if (!request.selectedVerifiers.includes(this.config.mediatorPublicKey)) {
        logger.debug('Not selected for this verification', {
          settlementId: request.settlementId,
        });
        return null;
      }

      logger.info('Generating verification response', {
        settlementId: request.settlementId,
      });

      // Generate semantic summary using LLM
      const summary = await this.generateSemanticSummary(
        intentA,
        intentB,
        request.proposedTerms
      );

      // Generate embedding for the summary
      const embedding = await this.llmProvider.generateEmbedding(summary.text);

      // Create response
      const response: VerificationResponse = {
        settlementId: request.settlementId,
        verifierId: this.config.mediatorPublicKey,
        semanticSummary: summary.text,
        summaryEmbedding: embedding,
        approves: summary.approves,
        confidence: summary.confidence,
        timestamp: Date.now(),
        signature: '',
      };

      // Sign the response
      response.signature = generateSignature(
        JSON.stringify({
          settlementId: response.settlementId,
          verifierId: response.verifierId,
          semanticSummary: response.semanticSummary,
        }),
        this.config.mediatorPrivateKey
      );

      // Submit response to chain
      await this.submitResponseToChain(response);

      logger.info('Verification response submitted', {
        settlementId: request.settlementId,
        approves: response.approves,
      });

      return response;
    } catch (error) {
      logger.error('Error handling verification request', {
        error,
        settlementId: request.settlementId,
      });
      return null;
    }
  }

  /**
   * Generate semantic summary of a settlement using LLM
   */
  private async generateSemanticSummary(
    intentA: Intent,
    intentB: Intent,
    proposedTerms: ProposedSettlement['proposedTerms']
  ): Promise<{ text: string; approves: boolean; confidence: number }> {
    const prompt = `You are a semantic verification agent for a mediation protocol. Your task is to generate a concise semantic summary of a proposed settlement between two intents.

**Intent A (from ${intentA.author}):**
Prose: ${intentA.prose}
Desires: ${intentA.desires.join(', ')}
Constraints: ${intentA.constraints.join(', ')}

**Intent B (from ${intentB.author}):**
Prose: ${intentB.prose}
Desires: ${intentB.desires.join(', ')}
Constraints: ${intentB.constraints.join(', ')}

**Proposed Settlement Terms:**
${JSON.stringify(proposedTerms, null, 2)}

**Your Task:**
Generate a semantic summary that captures the CORE MEANING of this settlement, focusing on:
1. What value is being exchanged
2. Key obligations of each party
3. Critical terms and conditions
4. Whether the settlement respects both parties' constraints

Respond in the following JSON format:
{
  "summary": "2-3 sentence summary capturing core semantics",
  "approves": boolean (true if settlement respects constraints),
  "confidence": number (0-1, your confidence in this assessment)
}

Return ONLY the JSON object, no additional text.`;

    try {
      let responseText: string;

      if (this.config.llmProvider === 'anthropic') {
        const anthropic = (this.llmProvider as any).anthropic;
        if (!anthropic) {
          throw new Error('Anthropic client not initialized');
        }

        const result = await anthropic.messages.create({
          model: this.config.llmModel,
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        });

        const content = result.content[0];
        responseText = content.type === 'text' ? content.text : '';
      } else if (this.config.llmProvider === 'openai') {
        const openai = (this.llmProvider as any).openai;
        if (!openai) {
          throw new Error('OpenAI client not initialized');
        }

        const result = await openai.chat.completions.create({
          model: this.config.llmModel,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 1024,
        });

        responseText = result.choices[0].message.content || '';
      } else {
        throw new Error(`Unsupported LLM provider: ${this.config.llmProvider}`);
      }

      // Parse response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        text: String(parsed.summary || ''),
        approves: Boolean(parsed.approves),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
      };
    } catch (error) {
      logger.error('Error generating semantic summary', { error });
      return {
        text: 'Summary generation failed',
        approves: false,
        confidence: 0,
      };
    }
  }

  /**
   * Submit verification response to chain
   */
  private async submitResponseToChain(response: VerificationResponse): Promise<void> {
    const timeoutMs = this.config.chainRequestTimeoutMs || DEFAULT_TIMEOUTS.apiRequest;

    try {
      await withTimeout(
        () =>
          axios.post(
            `${this.config.chainEndpoint}/api/v1/verifications/${response.settlementId}/responses`,
            {
              response,
            }
          ),
        timeoutMs,
        'Submit verification response'
      );

      logger.debug('Verification response submitted to chain', {
        settlementId: response.settlementId,
      });
    } catch (error) {
      if (error instanceof TimeoutError) {
        logger.error('Verification response submission timed out', {
          settlementId: response.settlementId,
          timeoutMs,
        });
      } else {
        logger.error('Error submitting verification response', { error });
      }
      throw error;
    }
  }

  /**
   * Check semantic equivalence between two summaries using cosine similarity
   */
  public checkSemanticEquivalence(
    summary1: string,
    embedding1: number[],
    summary2: string,
    embedding2: number[]
  ): SemanticEquivalenceResult {
    const threshold = this.config.semanticSimilarityThreshold || 0.85;

    // Calculate cosine similarity
    const cosineSimilarity = this.cosineSimilarity(embedding1, embedding2);

    return {
      summary1,
      summary2,
      cosineSimilarity,
      areEquivalent: cosineSimilarity >= threshold,
      threshold,
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      mag1 += vec1[i] * vec1[i];
      mag2 += vec2[i] * vec2[i];
    }

    mag1 = Math.sqrt(mag1);
    mag2 = Math.sqrt(mag2);

    if (mag1 === 0 || mag2 === 0) {
      return 0;
    }

    return dotProduct / (mag1 * mag2);
  }

  /**
   * Aggregate verification responses and determine consensus
   */
  public async aggregateConsensus(settlementId: string): Promise<SemanticVerification | null> {
    const verification = this.activeVerifications.get(settlementId);
    if (!verification) {
      logger.warn('No active verification found', { settlementId });
      return null;
    }

    const timeoutMs = this.config.chainRequestTimeoutMs || DEFAULT_TIMEOUTS.apiRequest;

    // Fetch latest responses from chain
    try {
      const response = await withTimeout(
        () =>
          axios.get(
            `${this.config.chainEndpoint}/api/v1/verifications/${settlementId}/responses`
          ),
        timeoutMs,
        'Fetch verification responses'
      );

      if (response.data && Array.isArray(response.data.responses)) {
        verification.responses = response.data.responses;
      }
    } catch (error) {
      if (error instanceof TimeoutError) {
        logger.error('Fetching verification responses timed out', { settlementId, timeoutMs });
      } else {
        logger.error('Error fetching verification responses', { error, settlementId });
      }
      // Continue with existing responses
    }

    // Check for timeout
    if (Date.now() > verification.request.responseDeadline) {
      verification.status = 'timeout';
      logger.warn('Verification timeout', {
        settlementId,
        responses: verification.responses.length,
      });
      return verification;
    }

    // Need at least requiredConsensus responses
    if (verification.responses.length < verification.requiredConsensus) {
      logger.debug('Waiting for more responses', {
        settlementId,
        current: verification.responses.length,
        required: verification.requiredConsensus,
      });
      return verification;
    }

    // Perform pairwise semantic equivalence checks
    const equivalenceResults: SemanticEquivalenceResult[] = [];
    const responses = verification.responses;

    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        const result = this.checkSemanticEquivalence(
          responses[i].semanticSummary,
          responses[i].summaryEmbedding,
          responses[j].semanticSummary,
          responses[j].summaryEmbedding
        );
        equivalenceResults.push(result);
      }
    }

    verification.equivalenceResults = equivalenceResults;

    // Find largest cluster of semantically equivalent summaries
    const clusters = this.findEquivalenceClusters(verification.responses, equivalenceResults);
    const largestCluster = clusters.reduce(
      (max, cluster) => (cluster.length > max.length ? cluster : max),
      [] as VerificationResponse[]
    );

    verification.consensusCount = largestCluster.length;
    verification.consensusReached =
      largestCluster.length >= verification.requiredConsensus;
    verification.status = verification.consensusReached
      ? 'consensus_reached'
      : 'consensus_failed';
    verification.completedAt = Date.now();

    logger.info('Consensus aggregation complete', {
      settlementId,
      consensusReached: verification.consensusReached,
      consensusCount: verification.consensusCount,
      totalResponses: verification.responses.length,
    });

    return verification;
  }

  /**
   * Find clusters of semantically equivalent summaries
   */
  private findEquivalenceClusters(
    responses: VerificationResponse[],
    equivalenceResults: SemanticEquivalenceResult[]
  ): VerificationResponse[][] {
    // Build adjacency list
    const adjacency: Map<number, Set<number>> = new Map();
    for (let i = 0; i < responses.length; i++) {
      adjacency.set(i, new Set([i])); // Each node connected to itself
    }

    // Add edges for equivalent pairs
    let edgeIndex = 0;
    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        if (equivalenceResults[edgeIndex]?.areEquivalent) {
          adjacency.get(i)!.add(j);
          adjacency.get(j)!.add(i);
        }
        edgeIndex++;
      }
    }

    // Find connected components (clusters)
    const visited = new Set<number>();
    const clusters: VerificationResponse[][] = [];

    for (let i = 0; i < responses.length; i++) {
      if (visited.has(i)) continue;

      // BFS to find cluster
      const cluster: VerificationResponse[] = [];
      const queue = [i];
      visited.add(i);

      while (queue.length > 0) {
        const node = queue.shift()!;
        cluster.push(responses[node]);

        for (const neighbor of adjacency.get(node)!) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Get verification status for a settlement
   */
  public getVerificationStatus(settlementId: string): SemanticVerification | null {
    return this.activeVerifications.get(settlementId) || null;
  }

  /**
   * Get verification for a settlement (alias for getVerificationStatus)
   */
  public getVerification(settlementId: string): SemanticVerification | null {
    return this.getVerificationStatus(settlementId);
  }

  /**
   * Submit verification response for a request (test-friendly wrapper)
   */
  public async submitVerificationResponse(
    request: VerificationRequest,
    _settlement: ProposedSettlement
  ): Promise<VerificationResponse> {
    const timeoutMs = this.config.chainRequestTimeoutMs || DEFAULT_TIMEOUTS.apiRequest;

    // Fetch the intents with timeout
    const [intentAResponse, intentBResponse] = await withTimeout(
      () =>
        Promise.all([
          axios.get(`${this.config.chainEndpoint}/api/v1/intents/${request.intentHashA}`),
          axios.get(`${this.config.chainEndpoint}/api/v1/intents/${request.intentHashB}`),
        ]),
      timeoutMs,
      'Fetch intents for verification'
    );

    const intentA = intentAResponse.data;
    const intentB = intentBResponse.data;

    const response = await this.handleVerificationRequest(request, intentA, intentB);

    if (!response) {
      throw new Error('Failed to generate verification response');
    }

    return response;
  }

  /**
   * Check if we have already responded to a verification request
   */
  public async hasResponded(settlementId: string): Promise<boolean> {
    return this.pendingRequests.has(settlementId);
  }

  /**
   * Get all active verifications
   */
  public getActiveVerifications(): SemanticVerification[] {
    return Array.from(this.activeVerifications.values());
  }

  /**
   * Get verification statistics
   */
  public getVerificationStats(): {
    total: number;
    pending: number;
    inProgress: number;
    consensusReached: number;
    consensusFailed: number;
    timedOut: number;
  } {
    const verifications = this.getActiveVerifications();

    return {
      total: verifications.length,
      pending: verifications.filter(v => v.status === 'pending').length,
      inProgress: verifications.filter(v => v.status === 'in_progress').length,
      consensusReached: verifications.filter(v => v.status === 'consensus_reached').length,
      consensusFailed: verifications.filter(v => v.status === 'consensus_failed').length,
      timedOut: verifications.filter(v => v.status === 'timeout').length,
    };
  }

  /**
   * Check for verification timeouts and mark expired verifications
   */
  public async checkVerificationTimeouts(): Promise<void> {
    const now = Date.now();

    for (const [settlementId, verification] of this.activeVerifications.entries()) {
      // Skip if already resolved
      if (
        verification.status === 'consensus_reached' ||
        verification.status === 'consensus_failed' ||
        verification.status === 'timeout'
      ) {
        continue;
      }

      // Check if deadline has passed
      if (verification.request.responseDeadline < now) {
        logger.warn('Verification deadline expired', {
          settlementId,
          deadline: new Date(verification.request.responseDeadline).toISOString(),
        });

        verification.status = 'timeout';
        verification.completedAt = now;
      }
    }
  }
}
