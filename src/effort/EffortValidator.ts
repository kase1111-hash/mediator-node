import { EffortSegment, ValidationAssessment } from '../types';
import { LLMProvider } from '../llm/LLMProvider';
import { MediatorConfig } from '../types';
import { logger } from '../utils/logger';

/**
 * LLM-assisted validation of effort segments
 * Assesses coherence, progression, and consistency
 */
export class EffortValidator {
  private config: MediatorConfig;
  private llmProvider: LLMProvider;

  constructor(config: MediatorConfig, llmProvider: LLMProvider) {
    this.config = config;
    this.llmProvider = llmProvider;
  }

  /**
   * Validate an effort segment
   */
  public async validateSegment(
    segment: EffortSegment
  ): Promise<ValidationAssessment> {
    logger.info('Validating effort segment', {
      segmentId: segment.segmentId,
      signalCount: segment.signals.length,
      duration: segment.endTime - segment.startTime,
    });

    try {
      const prompt = this.buildValidationPrompt(segment);
      const response = await this.callLLM(prompt);
      const assessment = this.parseValidationResponse(response, segment);

      logger.info('Effort validation complete', {
        segmentId: segment.segmentId,
        coherenceScore: assessment.coherenceScore,
        progressionScore: assessment.progressionScore,
        synthesisScore: assessment.synthesisScore,
      });

      return assessment;
    } catch (error) {
      logger.error('Error validating effort segment', {
        segmentId: segment.segmentId,
        error,
      });

      // Return low-confidence assessment on error
      return this.createFallbackAssessment(segment, String(error));
    }
  }

  /**
   * Build validation prompt for LLM
   */
  private buildValidationPrompt(segment: EffortSegment): string {
    const duration = Math.round((segment.endTime - segment.startTime) / 1000 / 60);
    const signalSummary = this.summarizeSignals(segment);

    return `You are an effort validation system for the Proof-of-Effort Receipt Protocol (MP-02).
Your task is to analyze a segment of human intellectual effort and assess its characteristics.

**Segment Information:**
- Segment ID: ${segment.segmentId}
- Duration: ${duration} minutes
- Number of signals: ${segment.signals.length}
- Segmentation rule: ${segment.segmentationRule}
${segment.humanMarker ? `- Human marker: ${segment.humanMarker}` : ''}

**Signals:**
${signalSummary}

**Your Analysis:**
Assess this effort segment on the following dimensions:

1. **Linguistic Coherence** (0-1): Do the signals demonstrate coherent language use and communication?
   - 0 = Incoherent, random, nonsensical
   - 1 = Highly coherent, well-structured

2. **Conceptual Progression** (0-1): Is there evidence of intellectual progression over time?
   - 0 = No progression, static or repetitive
   - 1 = Clear conceptual development and evolution

3. **Internal Consistency** (0-1): Are the signals internally consistent with each other?
   - 0 = Contradictory, inconsistent
   - 1 = Highly consistent

4. **Synthesis vs Duplication** (0-1): Does the effort show synthesis/original thought vs copying?
   - 0 = Pure duplication/copy-paste
   - 1 = Original synthesis and creation

**Important Guidelines:**
- Preserve uncertainty - if unsure, note it explicitly
- Do NOT judge value or quality, only process characteristics
- Do NOT assert originality or ownership
- Do NOT collapse ambiguous signals into certainty
- Focus on observablecharacteristics of the effort process

**Response Format** (JSON):
{
  "coherenceScore": <number 0-1>,
  "progressionScore": <number 0-1>,
  "consistencyScore": <number 0-1>,
  "synthesisScore": <number 0-1>,
  "summary": "<deterministic 2-3 sentence summary of the effort>",
  "uncertaintyFlags": ["<flag1>", "<flag2>", ...],
  "evidence": "<specific evidence supporting your scores>"
}

Provide your assessment now:`;
  }

  /**
   * Summarize signals for prompt
   */
  private summarizeSignals(segment: EffortSegment): string {
    const maxSignalsToShow = 20;
    const maxContentLength = 500;

    const signals = segment.signals.slice(0, maxSignalsToShow);
    const summaries = signals.map((signal, index) => {
      const time = new Date(signal.timestamp).toISOString();
      let content = signal.content;

      // Truncate long content
      if (content.length > maxContentLength) {
        content = content.substring(0, maxContentLength) + '...[truncated]';
      }

      return `[Signal ${index + 1}] (${signal.modality} at ${time})\n${content}`;
    });

    if (segment.signals.length > maxSignalsToShow) {
      summaries.push(
        `... and ${segment.signals.length - maxSignalsToShow} more signals`
      );
    }

    return summaries.join('\n\n');
  }

  /**
   * Call LLM for validation
   */
  private async callLLM(prompt: string): Promise<string> {
    if (this.config.llmProvider === 'anthropic') {
      const anthropic = (this.llmProvider as any).anthropic;

      if (!anthropic) {
        throw new Error('Anthropic provider not initialized');
      }

      const result = await anthropic.messages.create({
        model: this.config.llmModel,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = result.content[0];
      return content.type === 'text' ? content.text : '';
    } else if (this.config.llmProvider === 'openai') {
      const openai = (this.llmProvider as any).openai;

      if (!openai) {
        throw new Error('OpenAI provider not initialized');
      }

      const result = await openai.chat.completions.create({
        model: this.config.llmModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      });

      return result.choices[0].message.content || '';
    }

    throw new Error(`Unsupported LLM provider: ${this.config.llmProvider}`);
  }

  /**
   * Parse LLM response into validation assessment
   */
  private parseValidationResponse(
    response: string,
    segment: EffortSegment
  ): ValidationAssessment {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const data = JSON.parse(jsonMatch[0]);

      // Validate and clamp scores
      const clamp = (value: number) => Math.max(0, Math.min(1, value || 0));

      const assessment: ValidationAssessment = {
        validatorId: this.config.llmModel,
        modelVersion: this.config.llmModel,
        timestamp: Date.now(),
        coherenceScore: clamp(data.coherenceScore),
        progressionScore: clamp(data.progressionScore),
        consistencyScore: clamp(data.consistencyScore),
        synthesisScore: clamp(data.synthesisScore),
        summary: data.summary || 'No summary provided',
        uncertaintyFlags: Array.isArray(data.uncertaintyFlags)
          ? data.uncertaintyFlags
          : [],
        evidence: data.evidence || 'No evidence provided',
      };

      return assessment;
    } catch (error) {
      logger.error('Error parsing validation response', { error, response });
      throw new Error(`Failed to parse validation response: ${error}`);
    }
  }

  /**
   * Create fallback assessment on error
   */
  private createFallbackAssessment(
    segment: EffortSegment,
    errorMessage: string
  ): ValidationAssessment {
    return {
      validatorId: this.config.llmModel,
      modelVersion: this.config.llmModel,
      timestamp: Date.now(),
      coherenceScore: 0,
      progressionScore: 0,
      consistencyScore: 0,
      synthesisScore: 0,
      summary: `Validation failed for segment ${segment.segmentId}`,
      uncertaintyFlags: ['validation_error', 'low_confidence'],
      evidence: `Error during validation: ${errorMessage}`,
    };
  }

  /**
   * Batch validate multiple segments
   */
  public async validateSegments(
    segments: EffortSegment[]
  ): Promise<Map<string, ValidationAssessment>> {
    const assessments = new Map<string, ValidationAssessment>();

    for (const segment of segments) {
      try {
        const assessment = await this.validateSegment(segment);
        assessments.set(segment.segmentId, assessment);
      } catch (error) {
        logger.error('Error validating segment in batch', {
          segmentId: segment.segmentId,
          error,
        });

        // Add fallback assessment
        const fallback = this.createFallbackAssessment(segment, String(error));
        assessments.set(segment.segmentId, fallback);
      }
    }

    logger.info('Batch validation complete', {
      totalSegments: segments.length,
      successfulValidations: assessments.size,
    });

    return assessments;
  }
}
