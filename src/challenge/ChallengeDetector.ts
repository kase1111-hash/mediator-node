import {
  ProposedSettlement,
  Intent,
  ContradictionAnalysis,
  MediatorConfig,
} from '../types';
import { LLMProvider } from '../llm/LLMProvider';
import { logger } from '../utils/logger';
import { sanitizeForPrompt } from '../utils/prompt-security';

/**
 * ChallengeDetector analyzes proposed settlements for semantic contradictions
 * against the original intents, identifying constraint violations
 */
export class ChallengeDetector {
  private config: MediatorConfig;
  private llmProvider: LLMProvider;

  constructor(config: MediatorConfig, llmProvider: LLMProvider) {
    this.config = config;
    this.llmProvider = llmProvider;
  }

  /**
   * Analyze a settlement for semantic contradictions
   * Returns null if original intents cannot be loaded
   */
  public async analyzeSettlement(
    settlement: ProposedSettlement,
    intentA: Intent,
    intentB: Intent
  ): Promise<ContradictionAnalysis | null> {
    try {
      logger.debug('Analyzing settlement for contradictions', {
        settlementId: settlement.id,
        intentA: intentA.hash,
        intentB: intentB.hash,
      });

      // Build the analysis prompt
      const prompt = this.buildContradictionAnalysisPrompt(settlement, intentA, intentB);

      // Get LLM analysis
      const analysis = await this.performLLMAnalysis(prompt);

      logger.info('Contradiction analysis complete', {
        settlementId: settlement.id,
        hasContradiction: analysis.hasContradiction,
        confidence: analysis.confidence,
        severity: analysis.severity,
      });

      return analysis;
    } catch (error) {
      logger.error('Error analyzing settlement for contradictions', {
        error,
        settlementId: settlement.id,
      });
      return null;
    }
  }

  /**
   * Build the prompt for LLM contradiction analysis
   */
  private buildContradictionAnalysisPrompt(
    settlement: ProposedSettlement,
    intentA: Intent,
    intentB: Intent
  ): string {
    // Sanitize all user-controlled inputs before including in LLM prompt
    const safeProseA = sanitizeForPrompt(intentA.prose);
    const safeProseB = sanitizeForPrompt(intentB.prose);
    const safeDesiresA = intentA.desires.map(d => sanitizeForPrompt(d)).join(', ');
    const safeDesiresB = intentB.desires.map(d => sanitizeForPrompt(d)).join(', ');
    const safeConstraintsA = intentA.constraints.map(c => sanitizeForPrompt(c)).join(', ');
    const safeConstraintsB = intentB.constraints.map(c => sanitizeForPrompt(c)).join(', ');
    const safeReasoning = sanitizeForPrompt(settlement.reasoningTrace);

    return `You are a semantic analyzer for a mediation protocol. Your task is to identify if a proposed settlement violates any explicit constraints from the original intents.

**Intent A (from ${intentA.author}):**
Prose: ${safeProseA}
Desires: ${safeDesiresA}
Constraints: ${safeConstraintsA}

**Intent B (from ${intentB.author}):**
Prose: ${safeProseB}
Desires: ${safeDesiresB}
Constraints: ${safeConstraintsB}

**Proposed Settlement:**
Reasoning: ${safeReasoning}
Terms:
${JSON.stringify(settlement.proposedTerms, null, 2)}

**Your Task:**
Analyze if the proposed settlement violates ANY explicit constraints from either original intent. Focus on:
1. Hard constraints that were explicitly stated (e.g., "must not exceed $X", "cannot include Y", "requires Z")
2. Semantic contradictions where the settlement proposes something that directly contradicts a desire or constraint
3. Missing critical requirements that were marked as non-negotiable

Respond in the following JSON format:
{
  "hasContradiction": boolean,
  "confidence": number (0-1),
  "violatedConstraints": ["list", "of", "violated", "constraints"],
  "contradictionProof": "Detailed explanation of the contradiction",
  "paraphraseEvidence": "Rephrase the violation in clear terms, showing how the settlement contradicts the original intent",
  "affectedParty": "A" | "B" | "both",
  "severity": "minor" | "moderate" | "severe"
}

**Important Guidelines:**
- Only flag clear, unambiguous violations of explicit constraints
- Do not flag reasonable compromises or trade-offs
- Confidence should be HIGH (>0.8) only for obvious violations
- Be conservative - when in doubt, set hasContradiction to false
- Severity should be "severe" only for violations that completely undermine the intent's core purpose

Return ONLY the JSON object, no additional text.`;
  }

  /**
   * Perform the LLM analysis and parse the response
   */
  private async performLLMAnalysis(prompt: string): Promise<ContradictionAnalysis> {
    try {
      let responseText: string;

      // Use the same LLM provider as negotiation
      if (this.config.llmProvider === 'anthropic') {
        const anthropic = (this.llmProvider as any).anthropic;
        if (!anthropic) {
          throw new Error('Anthropic client not initialized');
        }

        const result = await anthropic.messages.create({
          model: this.config.llmModel,
          max_tokens: 2048,
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
          max_tokens: 2048,
        });

        responseText = result.choices[0].message.content || '';
      } else {
        throw new Error(`Unsupported LLM provider: ${this.config.llmProvider}`);
      }

      // Parse the JSON response
      const analysis = this.parseAnalysisResponse(responseText);
      return analysis;
    } catch (error) {
      logger.error('Error performing LLM analysis', { error });

      // Return a safe default on error
      return {
        hasContradiction: false,
        confidence: 0,
        violatedConstraints: [],
        contradictionProof: 'Analysis failed',
        paraphraseEvidence: 'Analysis failed',
        affectedParty: 'both',
        severity: 'minor',
      };
    }
  }

  /**
   * Parse the LLM response into a ContradictionAnalysis object
   */
  private parseAnalysisResponse(responseText: string): ContradictionAnalysis {
    try {
      // Extract JSON from response (handle cases where LLM adds extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate and sanitize the response
      return {
        hasContradiction: Boolean(parsed.hasContradiction),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        violatedConstraints: Array.isArray(parsed.violatedConstraints)
          ? parsed.violatedConstraints
          : [],
        contradictionProof: String(parsed.contradictionProof || ''),
        paraphraseEvidence: String(parsed.paraphraseEvidence || ''),
        affectedParty: ['A', 'B', 'both'].includes(parsed.affectedParty)
          ? parsed.affectedParty
          : 'both',
        severity: ['minor', 'moderate', 'severe'].includes(parsed.severity)
          ? parsed.severity
          : 'moderate',
      };
    } catch (error) {
      logger.error('Error parsing analysis response', { error, responseText });

      // Return safe default
      return {
        hasContradiction: false,
        confidence: 0,
        violatedConstraints: [],
        contradictionProof: 'Failed to parse analysis',
        paraphraseEvidence: 'Failed to parse analysis',
        affectedParty: 'both',
        severity: 'minor',
      };
    }
  }

  /**
   * Check if a contradiction analysis meets the threshold for challenge submission
   */
  public shouldChallenge(analysis: ContradictionAnalysis): boolean {
    const minConfidence = this.config.minConfidenceToChallenge || 0.8;

    return (
      analysis.hasContradiction &&
      analysis.confidence >= minConfidence &&
      analysis.violatedConstraints.length > 0
    );
  }
}
