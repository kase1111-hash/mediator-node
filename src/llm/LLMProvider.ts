import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import axios from 'axios';
import { MediatorConfig, Intent, NegotiationResult } from '../types';
import { logger } from '../utils/logger';
import { generateModelIntegrityHash } from '../utils/crypto';
import { sanitizeIntentForLLM, buildStructuredPrompt, sanitizeForPrompt } from '../utils/prompt-security';
import { assertNoSecrets } from '../utils/secret-scanner';
import { ProposedTermsSchema } from '../validation/schemas';

/**
 * LLMProvider handles interactions with language models for
 * negotiation, embedding generation, and semantic analysis.
 *
 * ## Embedding Provider Configuration
 *
 * When using Anthropic as the LLM provider, a separate embedding provider is required
 * since Anthropic does not offer an embeddings API. Configure via environment variables:
 *
 * - `EMBEDDING_PROVIDER`: 'openai' | 'voyage' | 'cohere' | 'fallback'
 * - `EMBEDDING_API_KEY`: API key for the embedding provider (if different from LLM key)
 * - `EMBEDDING_MODEL`: Model name to use (provider-specific)
 *
 * ### Recommended Embedding Providers:
 * - **OpenAI** (default for production): `text-embedding-3-small` or `text-embedding-3-large`
 * - **Voyage AI**: Optimized for semantic search, excellent for intent matching
 * - **Cohere**: `embed-english-v3.0` or `embed-multilingual-v3.0`
 *
 * ### ⚠️ PRODUCTION WARNING
 * The 'fallback' embedding provider uses a naive character-based algorithm that is
 * **NOT suitable for production**. It will produce poor semantic matching results.
 * Always configure a proper embedding provider for production deployments.
 */
export class LLMProvider {
  private config: MediatorConfig;
  private anthropic?: Anthropic;
  private openai?: OpenAI;
  private embeddingOpenAI?: OpenAI;
  private fallbackWarningShown: boolean = false;
  // LLM spending cap: track API call counts per window
  private hourlyCallCount: number = 0;
  private dailyCallCount: number = 0;
  private hourlyWindowStart: number = Date.now();
  private dailyWindowStart: number = Date.now();

  constructor(config: MediatorConfig) {
    this.config = config;

    if (config.llmProvider === 'anthropic') {
      this.anthropic = new Anthropic({
        apiKey: config.llmApiKey,
      });

      // Initialize embedding provider for Anthropic users
      this.initializeEmbeddingProvider(config);
    } else if (config.llmProvider === 'openai') {
      this.openai = new OpenAI({
        apiKey: config.llmApiKey,
      });
    }
  }

  /**
   * Check and enforce LLM API call rate limits (spending cap).
   * Throws if the hourly or daily limit is exceeded.
   */
  private enforceRateLimit(): void {
    const now = Date.now();
    const maxPerHour = (this.config as any).llmMaxCallsPerHour ?? 100;
    const maxPerDay = (this.config as any).llmMaxCallsPerDay ?? 500;

    // Reset hourly window
    if (now - this.hourlyWindowStart > 3600000) {
      this.hourlyCallCount = 0;
      this.hourlyWindowStart = now;
    }

    // Reset daily window
    if (now - this.dailyWindowStart > 86400000) {
      this.dailyCallCount = 0;
      this.dailyWindowStart = now;
    }

    if (this.hourlyCallCount >= maxPerHour) {
      logger.error('LLM hourly rate limit exceeded', {
        count: this.hourlyCallCount,
        limit: maxPerHour,
        security: true,
      });
      throw new Error(`LLM rate limit exceeded: ${this.hourlyCallCount}/${maxPerHour} calls per hour`);
    }

    if (this.dailyCallCount >= maxPerDay) {
      logger.error('LLM daily rate limit exceeded', {
        count: this.dailyCallCount,
        limit: maxPerDay,
        security: true,
      });
      throw new Error(`LLM rate limit exceeded: ${this.dailyCallCount}/${maxPerDay} calls per day`);
    }

    this.hourlyCallCount++;
    this.dailyCallCount++;
  }

  /**
   * Initialize embedding provider for non-OpenAI LLM configurations.
   * This is necessary because Anthropic does not provide an embeddings API.
   */
  private initializeEmbeddingProvider(config: MediatorConfig): void {
    const embeddingProvider = config.embeddingProvider || 'fallback';
    const embeddingApiKey = config.embeddingApiKey || config.llmApiKey;

    if (embeddingProvider === 'openai') {
      this.embeddingOpenAI = new OpenAI({
        apiKey: embeddingApiKey,
      });
      logger.info('Using OpenAI for embeddings', {
        model: config.embeddingModel || 'text-embedding-3-small',
      });
    } else if (embeddingProvider === 'voyage') {
      // Voyage uses OpenAI-compatible API format
      this.embeddingOpenAI = new OpenAI({
        apiKey: embeddingApiKey,
        baseURL: 'https://api.voyageai.com/v1',
      });
      logger.info('Using Voyage AI for embeddings', {
        model: config.embeddingModel || 'voyage-2',
      });
    } else if (embeddingProvider === 'cohere') {
      // Cohere will be handled separately in generateEmbedding
      logger.info('Using Cohere for embeddings', {
        model: config.embeddingModel || 'embed-english-v3.0',
      });
    } else {
      // Log a prominent warning about fallback embeddings
      logger.warn('═══════════════════════════════════════════════════════════════════');
      logger.warn('⚠️  FALLBACK EMBEDDING PROVIDER - NOT SUITABLE FOR PRODUCTION  ⚠️');
      logger.warn('═══════════════════════════════════════════════════════════════════');
      logger.warn('Using character-based fallback embeddings which provide POOR');
      logger.warn('semantic matching quality. For production deployments, configure:');
      logger.warn('');
      logger.warn('  EMBEDDING_PROVIDER=openai    # Recommended');
      logger.warn('  EMBEDDING_API_KEY=sk-...     # Your OpenAI API key');
      logger.warn('');
      logger.warn('Or use Voyage AI / Cohere for optimized semantic search.');
      logger.warn('═══════════════════════════════════════════════════════════════════');
    }
  }

  /**
   * Generate embeddings for an intent.
   *
   * Uses the configured embedding provider:
   * - OpenAI users: Uses OpenAI embeddings directly
   * - Anthropic users: Uses configured EMBEDDING_PROVIDER (openai, voyage, cohere, or fallback)
   *
   * @param text - Text to generate embeddings for
   * @returns Vector embedding as number array
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      // OpenAI LLM users: use OpenAI embeddings directly
      if (this.config.llmProvider === 'openai' && this.openai) {
        const response = await this.openai.embeddings.create({
          model: this.config.embeddingModel || 'text-embedding-3-small',
          input: text,
        });
        return response.data[0].embedding;
      }

      // Anthropic/custom LLM users: use configured embedding provider
      const embeddingProvider = this.config.embeddingProvider || 'fallback';

      if (embeddingProvider === 'openai' && this.embeddingOpenAI) {
        const response = await this.embeddingOpenAI.embeddings.create({
          model: this.config.embeddingModel || 'text-embedding-3-small',
          input: text,
        });
        return response.data[0].embedding;
      }

      if (embeddingProvider === 'voyage' && this.embeddingOpenAI) {
        // Voyage AI uses OpenAI-compatible API
        const response = await this.embeddingOpenAI.embeddings.create({
          model: this.config.embeddingModel || 'voyage-2',
          input: text,
        });
        return response.data[0].embedding;
      }

      if (embeddingProvider === 'cohere') {
        return this.generateCohereEmbedding(text);
      }

      // Fallback: character-based embedding (DEVELOPMENT ONLY)
      return this.generateFallbackEmbedding(text);
    } catch (error) {
      logger.error('Error generating embedding', {
        error,
        provider: this.config.embeddingProvider || 'fallback',
      });
      throw error;
    }
  }

  /**
   * Generate embeddings using Cohere API.
   *
   * @param text - Text to generate embeddings for
   * @returns Vector embedding as number array
   */
  private async generateCohereEmbedding(text: string): Promise<number[]> {
    const apiKey = this.config.embeddingApiKey || this.config.llmApiKey;
    const model = this.config.embeddingModel || 'embed-english-v3.0';

    const response = await axios.post(
      'https://api.cohere.ai/v1/embed',
      {
        texts: [text],
        model: model,
        input_type: 'search_document',
        truncate: 'END',
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data?.embeddings?.[0]) {
      return response.data.embeddings[0];
    }

    throw new Error('Cohere embedding response missing embeddings data');
  }

  /**
   * ⚠️ DEVELOPMENT ONLY - Fallback embedding generator.
   *
   * This is a naive character-based embedding that provides POOR semantic matching.
   * It exists only for development/testing when no embedding API is available.
   *
   * ## Why this is unsuitable for production:
   * - No semantic understanding (treats text as character sequences)
   * - No contextual awareness (word order doesn't affect meaning)
   * - Poor similarity detection (semantically similar texts may have distant embeddings)
   * - Inconsistent dimensions with production embedding services
   *
   * ## For production, configure:
   * ```
   * EMBEDDING_PROVIDER=openai
   * EMBEDDING_API_KEY=sk-your-api-key
   * EMBEDDING_MODEL=text-embedding-3-small
   * ```
   *
   * @param text - Text to generate embeddings for
   * @returns Vector embedding as number array (WARNING: low quality)
   */
  private generateFallbackEmbedding(text: string): number[] {
    // Show warning only once per session to avoid log spam
    if (!this.fallbackWarningShown) {
      logger.warn(
        '⚠️ Using FALLBACK embeddings - semantic matching quality will be POOR. ' +
        'Configure EMBEDDING_PROVIDER for production use.'
      );
      this.fallbackWarningShown = true;
    }

    // Naive character-based embedding (NOT production quality)
    const embedding = new Array(this.config.vectorDimensions).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const idx = (word.charCodeAt(j) + i) % this.config.vectorDimensions;
        embedding[idx] += 1;
      }
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / (magnitude || 1));
  }

  /**
   * Run a negotiation simulation between two intents
   */
  public async negotiateAlignment(
    intentA: Intent,
    intentB: Intent
  ): Promise<NegotiationResult> {
    const promptTemplate = this.buildNegotiationPrompt(intentA, intentB);

    // Scan prompt for accidentally included secrets before sending to LLM
    assertNoSecrets(promptTemplate, 'LLM negotiation prompt', [this.config.llmApiKey, this.config.mediatorPrivateKey]);

    // Enforce LLM spending cap
    this.enforceRateLimit();

    try {
      let response: string;
      let modelUsed: string;

      let inputTokens = 0;
      let outputTokens = 0;

      if (this.config.llmProvider === 'anthropic' && this.anthropic) {
        modelUsed = this.config.llmModel;
        const result = await this.anthropic.messages.create({
          model: this.config.llmModel,
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: promptTemplate,
            },
          ],
        });

        const content = result.content[0];
        response = content.type === 'text' ? content.text : '';
        inputTokens = result.usage?.input_tokens || 0;
        outputTokens = result.usage?.output_tokens || 0;
      } else if (this.config.llmProvider === 'openai' && this.openai) {
        modelUsed = this.config.llmModel;
        const result = await this.openai.chat.completions.create({
          model: this.config.llmModel,
          messages: [
            {
              role: 'system',
              content: 'You are a neutral mediator for the NatLangChain protocol. Your role is to find alignment between two explicit intents.',
            },
            {
              role: 'user',
              content: promptTemplate,
            },
          ],
          max_tokens: 2048,
        });

        response = result.choices[0].message.content || '';
        inputTokens = result.usage?.prompt_tokens || 0;
        outputTokens = result.usage?.completion_tokens || 0;
      } else {
        throw new Error('No LLM provider configured');
      }

      // Parse the LLM response
      const result = this.parseNegotiationResponse(response, intentA, intentB);
      result.modelUsed = modelUsed;
      result.promptHash = generateModelIntegrityHash(modelUsed, promptTemplate);

      logger.info('Negotiation completed', {
        success: result.success,
        confidence: result.confidenceScore,
        intentA: intentA.hash,
        intentB: intentB.hash,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: this.estimateCost(modelUsed, inputTokens, outputTokens),
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error during negotiation', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        intentA: intentA.hash,
        intentB: intentB.hash,
      });
      return {
        success: false,
        reasoning: 'Negotiation failed due to error',
        proposedTerms: {},
        confidenceScore: 0,
        modelUsed: this.config.llmModel,
        promptHash: '',
        error: errorMessage, // Allow callers to distinguish errors from no-alignment
      };
    }
  }

  /**
   * Build the negotiation prompt with security sanitization
   */
  private buildNegotiationPrompt(intentA: Intent, intentB: Intent): string {
    // Sanitize user-controlled inputs to prevent prompt injection
    const sanitizedA = sanitizeIntentForLLM(intentA);
    const sanitizedB = sanitizeIntentForLLM(intentB);

    // Log warnings if injection attempts detected
    if (sanitizedA.warnings) {
      logger.warn('Prompt injection detected in Intent A', {
        intentHash: intentA.hash,
        warnings: sanitizedA.warnings,
      });
    }
    if (sanitizedB.warnings) {
      logger.warn('Prompt injection detected in Intent B', {
        intentHash: intentB.hash,
        warnings: sanitizedB.warnings,
      });
    }

    // Use structured prompt with clear delimiters to prevent injection
    return buildStructuredPrompt({
      system: `You are a neutral mediator on the NatLangChain protocol. Your task is to determine if two intents can be aligned and propose settlement terms if viable.`,

      intent_a: `ID: ${intentA.hash}
Author: ${sanitizedA.author}
Branch: ${intentA.branch || 'Unknown'}
Prose: ${sanitizedA.prose}
Desires: ${sanitizedA.desires.join(', ')}
Constraints: ${sanitizedA.constraints.join(', ')}
Offered Fee: ${intentA.offeredFee || 'None'}`,

      intent_b: `ID: ${intentB.hash}
Author: ${sanitizedB.author}
Branch: ${intentB.branch || 'Unknown'}
Prose: ${sanitizedB.prose}
Desires: ${sanitizedB.desires.join(', ')}
Constraints: ${sanitizedB.constraints.join(', ')}
Offered Fee: ${intentB.offeredFee || 'None'}`,

      task: `1. Analyze if these intents have semantic alignment (do they complement each other?)
2. Verify that any proposed settlement respects BOTH parties' explicit constraints
3. If alignment exists, propose specific terms (price, deliverables, timeline)
4. Provide a confidence score (0-100)`,

      output_format: `SUCCESS: [yes/no]
CONFIDENCE: [0-100]
REASONING: [Your explanation of why these intents align or don't align]
PROPOSED_TERMS: {
  "price": [number or null],
  "deliverables": [array of strings or null],
  "timeline": [string or null]
}`,

      principles: `- Intent over form: Look for meaning, not exact matches
- Radical neutrality: Only mediate what is explicitly stated
- Refuse shadow: If either intent is vague or unclear, mark SUCCESS as no

Provide your analysis now:`,
    });
  }

  /**
   * Parse the LLM response into a structured result
   */
  private parseNegotiationResponse(
    response: string,
    _intentA: Intent,
    _intentB: Intent
  ): NegotiationResult {
    try {
      // Extract key fields using regex
      const successMatch = response.match(/SUCCESS:\s*(yes|no)/i);
      const confidenceMatch = response.match(/CONFIDENCE:\s*(\d+)/);
      const reasoningMatch = response.match(/REASONING:\s*(.+?)(?=PROPOSED_TERMS:|$)/s);
      const termsMatch = response.match(/PROPOSED_TERMS:\s*({[\s\S]+?})/);

      const success = successMatch ? successMatch[1].toLowerCase() === 'yes' : false;
      const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 0;
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : 'No reasoning provided';

      let proposedTerms: any = {};

      if (termsMatch) {
        try {
          const rawTerms = JSON.parse(termsMatch[1]);
          // Validate parsed LLM output against Zod schema (passthrough preserves extra fields)
          const validated = ProposedTermsSchema.passthrough().safeParse(rawTerms);
          if (validated.success) {
            proposedTerms = validated.data;
          } else {
            logger.warn('LLM proposed terms failed schema validation', {
              errors: validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
            });
            // Fall back to raw parsed terms if validation fails on extra fields
            proposedTerms = rawTerms;
          }
        } catch (e) {
          logger.warn('Failed to parse proposed terms JSON', { error: e });
        }
      }

      // Use configurable confidence threshold (default: 60)
      const minConfidence = this.config.minNegotiationConfidence ?? 60;

      return {
        success: success && confidence >= minConfidence,
        reasoning,
        proposedTerms,
        confidenceScore: confidence,
        modelUsed: this.config.llmModel,
        promptHash: '',
      };
    } catch (error) {
      logger.error('Error parsing negotiation response', { error, response });
      return {
        success: false,
        reasoning: 'Failed to parse LLM response',
        proposedTerms: {},
        confidenceScore: 0,
        modelUsed: this.config.llmModel,
        promptHash: '',
      };
    }
  }

  /**
   * Generate a semantic summary for verification
   */
  public async generateSemanticSummary(settlement: any): Promise<string> {
    const sanitizedTerms = sanitizeForPrompt(JSON.stringify(settlement.proposedTerms ?? {}));
    const prompt = `Generate a concise semantic summary of this settlement:

Intent A Hash: ${settlement.intentHashA}
Intent B Hash: ${settlement.intentHashB}
Terms: ${sanitizedTerms}

Provide a 2-3 sentence summary of the essential agreement in plain language.`;

    // Scan for secrets before sending to LLM
    assertNoSecrets(prompt, 'LLM semantic summary prompt', [this.config.llmApiKey, this.config.mediatorPrivateKey]);

    // Enforce LLM spending cap
    this.enforceRateLimit();

    try {
      if (this.config.llmProvider === 'anthropic' && this.anthropic) {
        const result = await this.anthropic.messages.create({
          model: this.config.llmModel,
          max_tokens: 256,
          messages: [{ role: 'user', content: prompt }],
        });

        const content = result.content[0];
        return content.type === 'text' ? content.text : '';
      } else if (this.config.llmProvider === 'openai' && this.openai) {
        const result = await this.openai.chat.completions.create({
          model: this.config.llmModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 256,
        });

        return result.choices[0].message.content || '';
      }

      return 'Summary generation not available';
    } catch (error) {
      logger.error('Error generating semantic summary', { error });
      return 'Error generating summary';
    }
  }

  /**
   * Generate text response from a prompt (general purpose)
   */
  public async generateText(params: {
    prompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<string> {
    const { prompt, maxTokens = 2048, temperature = 0.7 } = params;

    // Scan for secrets before sending to LLM
    assertNoSecrets(prompt, 'LLM generateText prompt', [this.config.llmApiKey, this.config.mediatorPrivateKey]);

    // Enforce LLM spending cap
    this.enforceRateLimit();

    try {
      if (this.config.llmProvider === 'anthropic' && this.anthropic) {
        const result = await this.anthropic.messages.create({
          model: this.config.llmModel,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: 'user', content: prompt }],
        });

        const content = result.content[0];
        return content.type === 'text' ? content.text : '';
      } else if (this.config.llmProvider === 'openai' && this.openai) {
        const result = await this.openai.chat.completions.create({
          model: this.config.llmModel,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature,
        });

        return result.choices[0].message.content || '';
      }

      return 'Text generation not available';
    } catch (error) {
      logger.error('Error generating text', { error });
      throw error;
    }
  }

  /**
   * Estimate USD cost for a given model and token counts.
   * Prices are approximate per-1M-token rates as of 2024-12.
   */
  private estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
      'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
      'gpt-4o': { input: 2.5, output: 10.0 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gpt-4-turbo': { input: 10.0, output: 30.0 },
    };

    const rates = pricing[model] || { input: 3.0, output: 15.0 };
    return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  }
}
