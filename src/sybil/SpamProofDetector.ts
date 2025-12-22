import axios from 'axios';
import { nanoid } from 'nanoid';
import { MediatorConfig, Intent, SpamProof } from '../types';
import { LLMProvider } from '../llm/LLMProvider';
import { logger } from '../utils/logger';
import { generateSignature } from '../utils/crypto';

/**
 * SpamProofDetector analyzes intents for spam patterns
 * and submits spam proofs to trigger deposit forfeitures
 */
export class SpamProofDetector {
  private config: MediatorConfig;
  private llmProvider: LLMProvider;
  private submittedProofs: Map<string, SpamProof> = new Map();

  constructor(config: MediatorConfig, llmProvider: LLMProvider) {
    this.config = config;
    this.llmProvider = llmProvider;
  }

  /**
   * Analyze an intent for spam characteristics
   */
  public async analyzeIntent(intent: Intent): Promise<{
    isSpam: boolean;
    confidence: number;
    evidence: string;
  } | null> {
    if (!this.config.enableSpamProofSubmission) {
      return null;
    }

    try {
      const prompt = `You are a spam detection system for a decentralized intent marketplace. Analyze the following intent for spam characteristics.

**Intent Details:**
Author: ${intent.author}
Prose: ${intent.prose}
Desires: ${intent.desires.join(', ')}
Constraints: ${intent.constraints.join(', ')}

**Spam Indicators to Check:**
1. **Vagueness**: Extremely vague or meaningless requests (e.g., "I want stuff")
2. **Repetition**: Excessive repetition of words or phrases
3. **Nonsense**: Random characters, gibberish, or incoherent text
4. **Off-topic**: Completely unrelated to any reasonable marketplace intent
5. **Malicious**: Attempts to exploit, manipulate, or harm others
6. **Advertising**: Unsolicited promotion or spam links
7. **Empty Content**: Intent with no meaningful information

**Analysis Task:**
Determine if this intent is spam and provide your confidence level.

Respond in JSON format:
{
  "isSpam": boolean,
  "confidence": number (0-1),
  "evidence": "Detailed explanation of why this is/isn't spam, citing specific indicators"
}

Return ONLY the JSON object, no additional text.`;

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

      // Parse JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON found in spam detection response', { intent: intent.hash });
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        isSpam: Boolean(parsed.isSpam),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        evidence: String(parsed.evidence || 'No evidence provided'),
      };
    } catch (error) {
      logger.error('Error analyzing intent for spam', { error, intentHash: intent.hash });
      return null;
    }
  }

  /**
   * Determine if we should submit a spam proof based on analysis
   */
  public shouldSubmitProof(analysis: { isSpam: boolean; confidence: number }): boolean {
    const minConfidence = this.config.minSpamConfidence || 0.9;
    return analysis.isSpam && analysis.confidence >= minConfidence;
  }

  /**
   * Submit a spam proof to the chain
   */
  public async submitSpamProof(
    intent: Intent,
    analysis: { isSpam: boolean; confidence: number; evidence: string }
  ): Promise<{ success: boolean; proofId?: string; error?: string }> {
    try {
      logger.info('Submitting spam proof', {
        intentHash: intent.hash,
        author: intent.author,
        confidence: analysis.confidence,
      });

      const proofId = nanoid();
      const spamProof: SpamProof = {
        proofId,
        targetIntentHash: intent.hash,
        targetAuthor: intent.author,
        submitterId: this.config.mediatorPublicKey,
        evidence: analysis.evidence,
        confidence: analysis.confidence,
        submittedAt: Date.now(),
        status: 'pending',
      };

      // Format as prose entry
      const proseEntry = this.formatSpamProofAsProse(spamProof, intent);

      // Sign and submit
      const signature = generateSignature(proseEntry, this.config.mediatorPrivateKey);

      await axios.post(`${this.config.chainEndpoint}/api/v1/spam-proofs`, {
        type: 'spam_proof',
        proof: spamProof,
        prose: proseEntry,
        signature,
      });

      this.submittedProofs.set(proofId, spamProof);

      logger.info('Spam proof submitted successfully', {
        proofId,
        intentHash: intent.hash,
      });

      return { success: true, proofId };
    } catch (error) {
      logger.error('Error submitting spam proof', { error, intentHash: intent.hash });
      return { success: false, error: String(error) };
    }
  }

  /**
   * Format spam proof as prose for chain entry
   */
  private formatSpamProofAsProse(proof: SpamProof, intent: Intent): string {
    return `[SPAM PROOF]

Proof ID: ${proof.proofId}
Target Intent: ${proof.targetIntentHash}
Target Author: ${proof.targetAuthor}
Submitted by: ${proof.submitterId}

Spam Detection Confidence: ${(proof.confidence * 100).toFixed(1)}%

Evidence:
${proof.evidence}

Original Intent Prose:
"${intent.prose}"

Desires: ${intent.desires.join(', ')}
Constraints: ${intent.constraints.join(', ')}

This intent has been flagged as spam and should result in deposit forfeiture if validated by consensus.
`;
  }

  /**
   * Monitor submitted spam proofs for validation results
   */
  public async monitorSpamProofs(): Promise<void> {
    if (this.submittedProofs.size === 0) {
      return;
    }

    logger.debug('Monitoring spam proofs', { count: this.submittedProofs.size });

    for (const [proofId, proof] of this.submittedProofs.entries()) {
      if (proof.status !== 'pending') {
        continue; // Already resolved
      }

      try {
        const response = await axios.get(
          `${this.config.chainEndpoint}/api/v1/spam-proofs/${proofId}/status`
        );

        if (response.data && response.data.status) {
          const newStatus = response.data.status;
          const oldStatus = proof.status;

          proof.status = newStatus;

          if (newStatus !== 'pending' && oldStatus === 'pending') {
            if (newStatus === 'validated') {
              proof.validatedAt = Date.now();
              proof.depositForfeited = response.data.depositForfeited || 0;

              logger.info('Spam proof validated', {
                proofId,
                intentHash: proof.targetIntentHash,
                depositForfeited: proof.depositForfeited,
              });
            } else if (newStatus === 'rejected') {
              logger.info('Spam proof rejected', {
                proofId,
                intentHash: proof.targetIntentHash,
              });
            }
          }
        }
      } catch (error) {
        logger.error('Error checking spam proof status', {
          error,
          proofId,
        });
      }
    }
  }

  /**
   * Get statistics on submitted spam proofs
   */
  public getSpamProofStats(): {
    total: number;
    pending: number;
    validated: number;
    rejected: number;
    totalForfeited: number;
  } {
    const proofs = Array.from(this.submittedProofs.values());

    return {
      total: proofs.length,
      pending: proofs.filter(p => p.status === 'pending').length,
      validated: proofs.filter(p => p.status === 'validated').length,
      rejected: proofs.filter(p => p.status === 'rejected').length,
      totalForfeited: proofs.reduce((sum, p) => sum + (p.depositForfeited || 0), 0),
    };
  }

  /**
   * Get submitted proofs
   */
  public getSubmittedProofs(): SpamProof[] {
    return Array.from(this.submittedProofs.values());
  }
}
