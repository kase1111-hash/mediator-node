import {
  MediatorConfig,
  ClarificationRecord,
  DisputeDeclaration,
} from '../types';
import { LLMProvider } from '../llm/LLMProvider';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * Statement submitted during clarification
 */
export interface ClarificationStatement {
  statementId: string;
  disputeId: string;
  clarificationId: string;
  submittedBy: string; // Party ID
  submittedAt: number;
  statementType: 'claim' | 'counterclaim' | 'response';
  content: string;
  references?: string[]; // Evidence IDs referenced
}

/**
 * Analysis result from LLM
 */
export interface ClarificationAnalysis {
  analysisId: string;
  clarificationId: string;
  analyzedAt: number;
  factualDisagreements: Array<{
    description: string;
    claimantPosition: string;
    respondentPosition: string;
  }>;
  interpretiveDisagreements: Array<{
    description: string;
    claimantInterpretation: string;
    respondentInterpretation: string;
  }>;
  ambiguities: Array<{
    description: string;
    clarificationNeeded: string;
  }>;
  scopeNarrowing?: {
    suggestion: string;
    rationale: string;
  };
  summary: string;
}

/**
 * Manages clarification phase for disputes
 * Provides LLM-assisted analysis and structured claim/counterclaim handling
 */
export class ClarificationManager {
  private config: MediatorConfig;
  private llmProvider: LLMProvider;
  private clarifications: Map<string, ClarificationRecord> = new Map();
  private statements: Map<string, ClarificationStatement[]> = new Map(); // clarificationId -> statements
  private analyses: Map<string, ClarificationAnalysis[]> = new Map(); // clarificationId -> analyses
  private dataPath: string;

  constructor(
    config: MediatorConfig,
    llmProvider: LLMProvider,
    dataPath: string = './data/clarifications'
  ) {
    this.config = config;
    this.llmProvider = llmProvider;
    this.dataPath = dataPath;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load existing clarifications
    this.loadClarifications();

    logger.info('ClarificationManager initialized', {
      dataPath,
      clarificationsLoaded: this.clarifications.size,
    });
  }

  /**
   * Initiate clarification phase for a dispute
   */
  public async initiateClarification(params: {
    disputeId: string;
    mediatorId: string;
    claimantConsent: boolean;
    respondentConsent: boolean;
  }): Promise<{
    success: boolean;
    clarificationId?: string;
    error?: string;
  }> {
    try {
      const { disputeId, mediatorId, claimantConsent, respondentConsent } = params;

      // Check if clarification already exists for this dispute
      const existing = Array.from(this.clarifications.values()).find(
        (c) => c.disputeId === disputeId && !c.completedAt
      );

      if (existing) {
        return {
          success: false,
          error: 'Clarification already in progress for this dispute',
        };
      }

      // Check if clarification is allowed by config
      if (this.config.allowDisputeClarification === false) {
        return {
          success: false,
          error: 'Dispute clarification is not enabled',
        };
      }

      // Both parties must consent
      if (!claimantConsent || !respondentConsent) {
        logger.info('Clarification requires consent from both parties', {
          disputeId,
          claimantConsent,
          respondentConsent,
        });
      }

      const clarificationId = nanoid();
      const now = Date.now();

      const clarification: ClarificationRecord = {
        clarificationId,
        disputeId,
        mediatorId,
        startedAt: now,
        claimantStatements: [],
        respondentStatements: [],
        factualDisagreements: [],
        interpretiveDisagreements: [],
        ambiguities: [],
        participationConsent: {
          claimant: claimantConsent,
          respondent: respondentConsent,
        },
      };

      this.clarifications.set(clarificationId, clarification);
      this.statements.set(clarificationId, []);
      this.analyses.set(clarificationId, []);

      this.saveClarification(clarification);

      logger.info('Clarification initiated', {
        clarificationId,
        disputeId,
        claimantConsent,
        respondentConsent,
      });

      return {
        success: true,
        clarificationId,
      };
    } catch (error) {
      logger.error('Error initiating clarification', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Submit a statement during clarification
   */
  public async submitStatement(params: {
    clarificationId: string;
    submittedBy: string;
    statementType: 'claim' | 'counterclaim' | 'response';
    content: string;
    references?: string[];
  }): Promise<{
    success: boolean;
    statementId?: string;
    error?: string;
  }> {
    try {
      const clarification = this.clarifications.get(params.clarificationId);

      if (!clarification) {
        return {
          success: false,
          error: 'Clarification not found',
        };
      }

      if (clarification.completedAt) {
        return {
          success: false,
          error: 'Clarification has already been completed',
        };
      }

      // Check if max clarification period has passed
      if (this.config.maxClarificationDays) {
        const maxDuration = this.config.maxClarificationDays * 24 * 60 * 60 * 1000;
        if (Date.now() - clarification.startedAt > maxDuration) {
          return {
            success: false,
            error: 'Clarification period has expired',
          };
        }
      }

      const statementId = nanoid();
      const statement: ClarificationStatement = {
        statementId,
        disputeId: clarification.disputeId,
        clarificationId: params.clarificationId,
        submittedBy: params.submittedBy,
        submittedAt: Date.now(),
        statementType: params.statementType,
        content: params.content,
        references: params.references,
      };

      // Add to statements array
      const statements = this.statements.get(params.clarificationId) || [];
      statements.push(statement);
      this.statements.set(params.clarificationId, statements);

      // Update clarification record with structured statement
      if (params.statementType === 'claim') {
        clarification.claimantStatements.push(params.content);
      } else if (params.statementType === 'counterclaim') {
        clarification.respondentStatements.push(params.content);
      }

      this.saveClarification(clarification);
      this.saveStatement(statement);

      logger.info('Statement submitted', {
        statementId,
        clarificationId: params.clarificationId,
        statementType: params.statementType,
      });

      return {
        success: true,
        statementId,
      };
    } catch (error) {
      logger.error('Error submitting statement', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Analyze clarification progress using LLM
   */
  public async analyzeClarification(
    clarificationId: string
  ): Promise<ClarificationAnalysis | null> {
    try {
      const clarification = this.clarifications.get(clarificationId);

      if (!clarification) {
        logger.warn('Clarification not found for analysis', { clarificationId });
        return null;
      }

      const statements = this.statements.get(clarificationId) || [];

      if (statements.length === 0) {
        logger.warn('No statements to analyze', { clarificationId });
        return null;
      }

      // Prepare analysis prompt
      const prompt = this.buildAnalysisPrompt(clarification, statements);

      // Call LLM for analysis
      const response = await this.llmProvider.generateText({
        prompt,
        maxTokens: 2000,
        temperature: 0.3,
      });

      // Parse LLM response
      const analysis = this.parseAnalysisResponse(response, clarificationId);

      // Update clarification record with analysis results
      clarification.factualDisagreements = analysis.factualDisagreements.map(
        (d) => d.description
      );
      clarification.interpretiveDisagreements = analysis.interpretiveDisagreements.map(
        (d) => d.description
      );
      clarification.ambiguities = analysis.ambiguities.map((a) => a.description);
      clarification.scopeNarrowing = analysis.scopeNarrowing?.suggestion;

      // Store analysis
      const analyses = this.analyses.get(clarificationId) || [];
      analyses.push(analysis);
      this.analyses.set(clarificationId, analyses);

      this.saveClarification(clarification);
      this.saveAnalysis(analysis);

      logger.info('Clarification analyzed', {
        clarificationId,
        factualDisagreements: analysis.factualDisagreements.length,
        interpretiveDisagreements: analysis.interpretiveDisagreements.length,
        ambiguities: analysis.ambiguities.length,
      });

      return analysis;
    } catch (error) {
      logger.error('Error analyzing clarification', { error });
      return null;
    }
  }

  /**
   * Complete clarification phase
   */
  public completeClarification(
    clarificationId: string
  ): { success: boolean; error?: string } {
    try {
      const clarification = this.clarifications.get(clarificationId);

      if (!clarification) {
        return {
          success: false,
          error: 'Clarification not found',
        };
      }

      if (clarification.completedAt) {
        return {
          success: false,
          error: 'Clarification already completed',
        };
      }

      clarification.completedAt = Date.now();
      this.saveClarification(clarification);

      logger.info('Clarification completed', {
        clarificationId,
        duration: clarification.completedAt - clarification.startedAt,
      });

      return { success: true };
    } catch (error) {
      logger.error('Error completing clarification', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Get clarification by ID
   */
  public getClarification(clarificationId: string): ClarificationRecord | undefined {
    return this.clarifications.get(clarificationId);
  }

  /**
   * Get clarifications for a dispute
   */
  public getClarificationsForDispute(disputeId: string): ClarificationRecord[] {
    return Array.from(this.clarifications.values()).filter(
      (c) => c.disputeId === disputeId
    );
  }

  /**
   * Get statements for a clarification
   */
  public getStatements(clarificationId: string): ClarificationStatement[] {
    return this.statements.get(clarificationId) || [];
  }

  /**
   * Get analyses for a clarification
   */
  public getAnalyses(clarificationId: string): ClarificationAnalysis[] {
    return this.analyses.get(clarificationId) || [];
  }

  /**
   * Get participation status
   */
  public getParticipationStatus(clarificationId: string): {
    claimant: boolean;
    respondent: boolean;
  } | null {
    const clarification = this.clarifications.get(clarificationId);
    return clarification ? clarification.participationConsent : null;
  }

  /**
   * Update participation consent
   */
  public updateParticipationConsent(
    clarificationId: string,
    party: 'claimant' | 'respondent',
    consent: boolean
  ): boolean {
    const clarification = this.clarifications.get(clarificationId);

    if (!clarification) {
      return false;
    }

    clarification.participationConsent[party] = consent;
    this.saveClarification(clarification);

    logger.info('Participation consent updated', {
      clarificationId,
      party,
      consent,
    });

    return true;
  }

  /**
   * Build analysis prompt for LLM
   */
  private buildAnalysisPrompt(
    clarification: ClarificationRecord,
    statements: ClarificationStatement[]
  ): string {
    const claimStatements = statements
      .filter((s) => s.statementType === 'claim')
      .map((s, i) => `  ${i + 1}. ${s.content}`)
      .join('\n');

    const counterclaimStatements = statements
      .filter((s) => s.statementType === 'counterclaim')
      .map((s, i) => `  ${i + 1}. ${s.content}`)
      .join('\n');

    return `You are analyzing a dispute clarification to identify disagreements and ambiguities.

CLAIMS (by claimant):
${claimStatements || '  (none)'}

COUNTERCLAIMS (by respondent):
${counterclaimStatements || '  (none)'}

Please analyze these claims and counterclaims to identify:

1. FACTUAL DISAGREEMENTS - Objective facts that the parties disagree about
2. INTERPRETIVE DISAGREEMENTS - Different interpretations of the same facts
3. AMBIGUITIES - Unclear or ambiguous aspects that need clarification
4. SCOPE NARROWING - Suggestions for narrowing the dispute scope

Format your response as JSON with this structure:
{
  "factualDisagreements": [
    {
      "description": "Brief description",
      "claimantPosition": "What claimant asserts",
      "respondentPosition": "What respondent asserts"
    }
  ],
  "interpretiveDisagreements": [
    {
      "description": "Brief description",
      "claimantInterpretation": "How claimant interprets",
      "respondentInterpretation": "How respondent interprets"
    }
  ],
  "ambiguities": [
    {
      "description": "What is ambiguous",
      "clarificationNeeded": "What needs to be clarified"
    }
  ],
  "scopeNarrowing": {
    "suggestion": "Specific narrowed scope suggestion",
    "rationale": "Why this narrowing helps"
  },
  "summary": "2-3 sentence summary of the core dispute"
}`;
  }

  /**
   * Parse LLM analysis response
   */
  private parseAnalysisResponse(
    response: string,
    clarificationId: string
  ): ClarificationAnalysis {
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n/, '').replace(/\n```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n/, '').replace(/\n```$/, '');
      }

      const parsed = JSON.parse(jsonStr);

      return {
        analysisId: nanoid(),
        clarificationId,
        analyzedAt: Date.now(),
        factualDisagreements: parsed.factualDisagreements || [],
        interpretiveDisagreements: parsed.interpretiveDisagreements || [],
        ambiguities: parsed.ambiguities || [],
        scopeNarrowing: parsed.scopeNarrowing,
        summary: parsed.summary || '',
      };
    } catch (error) {
      logger.error('Error parsing analysis response', { error, response });

      // Return empty analysis on parse error
      return {
        analysisId: nanoid(),
        clarificationId,
        analyzedAt: Date.now(),
        factualDisagreements: [],
        interpretiveDisagreements: [],
        ambiguities: [],
        summary: 'Analysis parsing failed',
      };
    }
  }

  /**
   * Save clarification to disk
   */
  private saveClarification(clarification: ClarificationRecord): void {
    try {
      const filePath = path.join(
        this.dataPath,
        `${clarification.clarificationId}.json`
      );
      fs.writeFileSync(filePath, JSON.stringify(clarification, null, 2));
    } catch (error) {
      logger.error('Error saving clarification', {
        clarificationId: clarification.clarificationId,
        error,
      });
    }
  }

  /**
   * Save statement to disk
   */
  private saveStatement(statement: ClarificationStatement): void {
    try {
      const statementsDir = path.join(this.dataPath, 'statements');
      if (!fs.existsSync(statementsDir)) {
        fs.mkdirSync(statementsDir, { recursive: true });
      }

      const filePath = path.join(statementsDir, `${statement.statementId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(statement, null, 2));
    } catch (error) {
      logger.error('Error saving statement', {
        statementId: statement.statementId,
        error,
      });
    }
  }

  /**
   * Save analysis to disk
   */
  private saveAnalysis(analysis: ClarificationAnalysis): void {
    try {
      const analysesDir = path.join(this.dataPath, 'analyses');
      if (!fs.existsSync(analysesDir)) {
        fs.mkdirSync(analysesDir, { recursive: true });
      }

      const filePath = path.join(analysesDir, `${analysis.analysisId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2));
    } catch (error) {
      logger.error('Error saving analysis', {
        analysisId: analysis.analysisId,
        error,
      });
    }
  }

  /**
   * Load clarifications from disk
   */
  private loadClarifications(): void {
    try {
      if (!fs.existsSync(this.dataPath)) {
        return;
      }

      const files = fs.readdirSync(this.dataPath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(this.dataPath, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const clarification: ClarificationRecord = JSON.parse(data);
          this.clarifications.set(clarification.clarificationId, clarification);
        }
      }

      // Load statements
      const statementsDir = path.join(this.dataPath, 'statements');
      if (fs.existsSync(statementsDir)) {
        const statementFiles = fs.readdirSync(statementsDir);
        for (const file of statementFiles) {
          if (file.endsWith('.json')) {
            const filePath = path.join(statementsDir, file);
            const data = fs.readFileSync(filePath, 'utf-8');
            const statement: ClarificationStatement = JSON.parse(data);

            const statements = this.statements.get(statement.clarificationId) || [];
            statements.push(statement);
            this.statements.set(statement.clarificationId, statements);
          }
        }
      }

      // Load analyses
      const analysesDir = path.join(this.dataPath, 'analyses');
      if (fs.existsSync(analysesDir)) {
        const analysisFiles = fs.readdirSync(analysesDir);
        for (const file of analysisFiles) {
          if (file.endsWith('.json')) {
            const filePath = path.join(analysesDir, file);
            const data = fs.readFileSync(filePath, 'utf-8');
            const analysis: ClarificationAnalysis = JSON.parse(data);

            const analyses = this.analyses.get(analysis.clarificationId) || [];
            analyses.push(analysis);
            this.analyses.set(analysis.clarificationId, analyses);
          }
        }
      }

      logger.info('Clarifications loaded from disk', {
        count: this.clarifications.size,
      });
    } catch (error) {
      logger.error('Error loading clarifications', { error });
    }
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalClarifications: number;
    activeClarifications: number;
    completedClarifications: number;
    totalStatements: number;
    totalAnalyses: number;
    averageStatementsPerClarification: number;
  } {
    const active = Array.from(this.clarifications.values()).filter(
      (c) => !c.completedAt
    ).length;
    const completed = Array.from(this.clarifications.values()).filter(
      (c) => c.completedAt
    ).length;

    let totalStatements = 0;
    this.statements.forEach((statements) => {
      totalStatements += statements.length;
    });

    let totalAnalyses = 0;
    this.analyses.forEach((analyses) => {
      totalAnalyses += analyses.length;
    });

    return {
      totalClarifications: this.clarifications.size,
      activeClarifications: active,
      completedClarifications: completed,
      totalStatements,
      totalAnalyses,
      averageStatementsPerClarification:
        this.clarifications.size > 0
          ? Math.round((totalStatements / this.clarifications.size) * 10) / 10
          : 0,
    };
  }
}
