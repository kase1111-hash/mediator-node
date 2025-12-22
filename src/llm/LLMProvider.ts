import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { MediatorConfig, Intent, NegotiationResult } from '../types';
import { logger } from '../utils/logger';
import { generateModelIntegrityHash } from '../utils/crypto';

/**
 * LLMProvider handles interactions with language models for
 * negotiation, embedding generation, and semantic analysis
 */
export class LLMProvider {
  private config: MediatorConfig;
  private anthropic?: Anthropic;
  private openai?: OpenAI;

  constructor(config: MediatorConfig) {
    this.config = config;

    if (config.llmProvider === 'anthropic') {
      this.anthropic = new Anthropic({
        apiKey: config.llmApiKey,
      });
    } else if (config.llmProvider === 'openai') {
      this.openai = new OpenAI({
        apiKey: config.llmApiKey,
      });
    }
  }

  /**
   * Generate embeddings for an intent
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      if (this.config.llmProvider === 'openai' && this.openai) {
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
        });

        return response.data[0].embedding;
      } else {
        // For Anthropic, we'll use a simple fallback (in production, use a dedicated embedding service)
        logger.warn('Anthropic does not provide embeddings API, using fallback');
        return this.generateFallbackEmbedding(text);
      }
    } catch (error) {
      logger.error('Error generating embedding', { error });
      throw error;
    }
  }

  /**
   * Simple fallback embedding generator (for development only)
   */
  private generateFallbackEmbedding(text: string): number[] {
    // This is a very basic embedding - in production, use a proper service
    const embedding = new Array(this.config.vectorDimensions).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const idx = (word.charCodeAt(j) + i) % this.config.vectorDimensions;
        embedding[idx] += 1;
      }
    }

    // Normalize
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

    try {
      let response: string;
      let modelUsed: string;

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
      });

      return result;
    } catch (error) {
      logger.error('Error during negotiation', { error });
      return {
        success: false,
        reasoning: 'Negotiation failed due to error',
        proposedTerms: {},
        confidenceScore: 0,
        modelUsed: this.config.llmModel,
        promptHash: '',
      };
    }
  }

  /**
   * Build the negotiation prompt
   */
  private buildNegotiationPrompt(intentA: Intent, intentB: Intent): string {
    return `You are a neutral mediator on the NatLangChain protocol. Your task is to determine if two intents can be aligned and propose settlement terms if viable.

**Intent A** (${intentA.hash}):
Author: ${intentA.author}
Branch: ${intentA.branch || 'Unknown'}
Prose: ${intentA.prose}
Desires: ${intentA.desires.join(', ')}
Constraints: ${intentA.constraints.join(', ')}
Offered Fee: ${intentA.offeredFee || 'None'}

**Intent B** (${intentB.hash}):
Author: ${intentB.author}
Branch: ${intentB.branch || 'Unknown'}
Prose: ${intentB.prose}
Desires: ${intentB.desires.join(', ')}
Constraints: ${intentB.constraints.join(', ')}
Offered Fee: ${intentB.offeredFee || 'None'}

**Your Task:**
1. Analyze if these intents have semantic alignment (do they complement each other?)
2. Verify that any proposed settlement respects BOTH parties' explicit constraints
3. If alignment exists, propose specific terms (price, deliverables, timeline)
4. Provide a confidence score (0-100)

**Output Format:**
SUCCESS: [yes/no]
CONFIDENCE: [0-100]
REASONING: [Your explanation of why these intents align or don't align]
PROPOSED_TERMS: {
  "price": [number or null],
  "deliverables": [array of strings or null],
  "timeline": [string or null]
}

**Principles:**
- Intent over form: Look for meaning, not exact matches
- Radical neutrality: Only mediate what is explicitly stated
- Refuse shadow: If either intent is vague or unclear, mark SUCCESS as no

Provide your analysis now:`;
  }

  /**
   * Parse the LLM response into a structured result
   */
  private parseNegotiationResponse(
    response: string,
    intentA: Intent,
    intentB: Intent
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
          proposedTerms = JSON.parse(termsMatch[1]);
        } catch (e) {
          logger.warn('Failed to parse proposed terms JSON', { error: e });
        }
      }

      return {
        success: success && confidence >= 60,
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
    const prompt = `Generate a concise semantic summary of this settlement:

Intent A Hash: ${settlement.intentHashA}
Intent B Hash: ${settlement.intentHashB}
Terms: ${JSON.stringify(settlement.proposedTerms)}

Provide a 2-3 sentence summary of the essential agreement in plain language.`;

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
}
