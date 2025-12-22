import { ClarificationManager } from '../../src/dispute/ClarificationManager';
import { MediatorConfig } from '../../src/types';
import { LLMProvider } from '../../src/llm/LLMProvider';
import * as fs from 'fs';

// Mock LLM Provider
class MockLLMProvider extends LLMProvider {
  constructor() {
    super({
      chainEndpoint: 'http://localhost:3000',
      llmProvider: 'openai',
      llmApiKey: 'test-key',
    } as any);
  }

  async generateText(params: {
    prompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<string> {
    // Return a mock analysis response
    return JSON.stringify({
      factualDisagreements: [
        {
          description: 'Delivery date',
          claimantPosition: 'Service was due on Jan 1',
          respondentPosition: 'Service was due on Jan 15',
        },
      ],
      interpretiveDisagreements: [
        {
          description: 'Service quality standard',
          claimantInterpretation: 'Professional grade required',
          respondentInterpretation: 'Standard grade acceptable',
        },
      ],
      ambiguities: [
        {
          description: 'Payment terms unclear',
          clarificationNeeded: 'Specify payment schedule',
        },
      ],
      scopeNarrowing: {
        suggestion: 'Focus on delivery date disagreement',
        rationale: 'This is the primary point of contention',
      },
      summary: 'Dispute centers on delivery date and service quality standards.',
    });
  }
}

describe('ClarificationManager', () => {
  let clarificationManager: ClarificationManager;
  let config: MediatorConfig;
  let llmProvider: LLMProvider;
  const testDataPath = './test-data/clarifications';

  beforeEach(() => {
    config = {
      chainEndpoint: 'http://localhost:3000',
      enableDisputeSystem: true,
      allowDisputeClarification: true,
      maxClarificationDays: 7,
    } as MediatorConfig;

    llmProvider = new MockLLMProvider();
    clarificationManager = new ClarificationManager(config, llmProvider, testDataPath);
  });

  afterEach(() => {
    // Clean up test data
    try {
      if (fs.existsSync('./test-data')) {
        fs.rmSync('./test-data', { recursive: true, force: true, maxRetries: 3 });
      }
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  });

  describe('initiateClarification', () => {
    it('should initiate clarification with consent from both parties', async () => {
      const result = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      expect(result.success).toBe(true);
      expect(result.clarificationId).toBeDefined();
      expect(result.error).toBeUndefined();

      const clarification = clarificationManager.getClarification(
        result.clarificationId!
      );
      expect(clarification).toBeDefined();
      expect(clarification!.disputeId).toBe('dispute-001');
      expect(clarification!.participationConsent.claimant).toBe(true);
      expect(clarification!.participationConsent.respondent).toBe(true);
    });

    it('should allow initiation even without full consent', async () => {
      const result = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: false,
      });

      expect(result.success).toBe(true);
      expect(result.clarificationId).toBeDefined();

      const clarification = clarificationManager.getClarification(
        result.clarificationId!
      );
      expect(clarification!.participationConsent.claimant).toBe(true);
      expect(clarification!.participationConsent.respondent).toBe(false);
    });

    it('should prevent duplicate clarifications for same dispute', async () => {
      const result1 = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      expect(result1.success).toBe(true);

      const result2 = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('already in progress');
    });

    it('should respect allowDisputeClarification config', async () => {
      const restrictedConfig = {
        ...config,
        allowDisputeClarification: false,
      };

      const restrictedManager = new ClarificationManager(
        restrictedConfig,
        llmProvider,
        testDataPath
      );

      const result = await restrictedManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
    });
  });

  describe('submitStatement', () => {
    it('should submit claim statement successfully', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      const statementResult = await clarificationManager.submitStatement({
        clarificationId: initResult.clarificationId!,
        submittedBy: 'user-001',
        statementType: 'claim',
        content: 'I ordered service to be delivered on Jan 1, but it was delayed.',
      });

      expect(statementResult.success).toBe(true);
      expect(statementResult.statementId).toBeDefined();

      const statements = clarificationManager.getStatements(
        initResult.clarificationId!
      );
      expect(statements).toHaveLength(1);
      expect(statements[0].statementType).toBe('claim');
      expect(statements[0].content).toContain('delayed');
    });

    it('should submit counterclaim statement successfully', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      const statementResult = await clarificationManager.submitStatement({
        clarificationId: initResult.clarificationId!,
        submittedBy: 'user-002',
        statementType: 'counterclaim',
        content: 'The service was delivered on time according to our agreement.',
      });

      expect(statementResult.success).toBe(true);

      const statements = clarificationManager.getStatements(
        initResult.clarificationId!
      );
      expect(statements).toHaveLength(1);
      expect(statements[0].statementType).toBe('counterclaim');
    });

    it('should handle statements with evidence references', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      const statementResult = await clarificationManager.submitStatement({
        clarificationId: initResult.clarificationId!,
        submittedBy: 'user-001',
        statementType: 'claim',
        content: 'Here is proof of the agreed delivery date.',
        references: ['evidence-001', 'evidence-002'],
      });

      expect(statementResult.success).toBe(true);

      const statements = clarificationManager.getStatements(
        initResult.clarificationId!
      );
      expect(statements[0].references).toEqual(['evidence-001', 'evidence-002']);
    });

    it('should prevent statements on completed clarifications', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      clarificationManager.completeClarification(initResult.clarificationId!);

      const statementResult = await clarificationManager.submitStatement({
        clarificationId: initResult.clarificationId!,
        submittedBy: 'user-001',
        statementType: 'claim',
        content: 'Too late to submit this.',
      });

      expect(statementResult.success).toBe(false);
      expect(statementResult.error).toContain('completed');
    });

    it('should handle non-existent clarification', async () => {
      const result = await clarificationManager.submitStatement({
        clarificationId: 'non-existent',
        submittedBy: 'user-001',
        statementType: 'claim',
        content: 'This should fail.',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('analyzeClarification', () => {
    it('should analyze clarification and identify disagreements', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      // Submit some statements
      await clarificationManager.submitStatement({
        clarificationId: initResult.clarificationId!,
        submittedBy: 'user-001',
        statementType: 'claim',
        content: 'Service was due on Jan 1.',
      });

      await clarificationManager.submitStatement({
        clarificationId: initResult.clarificationId!,
        submittedBy: 'user-002',
        statementType: 'counterclaim',
        content: 'Service was due on Jan 15 according to contract.',
      });

      const analysis = await clarificationManager.analyzeClarification(
        initResult.clarificationId!
      );

      expect(analysis).not.toBeNull();
      expect(analysis!.factualDisagreements).toBeDefined();
      expect(analysis!.interpretiveDisagreements).toBeDefined();
      expect(analysis!.ambiguities).toBeDefined();
      expect(analysis!.summary).toBeDefined();

      // Check that clarification record was updated
      const clarification = clarificationManager.getClarification(
        initResult.clarificationId!
      );
      expect(clarification!.factualDisagreements.length).toBeGreaterThan(0);
    });

    it('should return null for non-existent clarification', async () => {
      const analysis = await clarificationManager.analyzeClarification(
        'non-existent'
      );

      expect(analysis).toBeNull();
    });

    it('should return null when no statements exist', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      const analysis = await clarificationManager.analyzeClarification(
        initResult.clarificationId!
      );

      expect(analysis).toBeNull();
    });

    it('should store multiple analyses', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      await clarificationManager.submitStatement({
        clarificationId: initResult.clarificationId!,
        submittedBy: 'user-001',
        statementType: 'claim',
        content: 'First claim.',
      });

      // First analysis
      await clarificationManager.analyzeClarification(initResult.clarificationId!);

      // Add more statements
      await clarificationManager.submitStatement({
        clarificationId: initResult.clarificationId!,
        submittedBy: 'user-002',
        statementType: 'counterclaim',
        content: 'First counterclaim.',
      });

      // Second analysis
      await clarificationManager.analyzeClarification(initResult.clarificationId!);

      const analyses = clarificationManager.getAnalyses(initResult.clarificationId!);
      expect(analyses).toHaveLength(2);
    });
  });

  describe('completeClarification', () => {
    it('should complete clarification successfully', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      const result = clarificationManager.completeClarification(
        initResult.clarificationId!
      );

      expect(result.success).toBe(true);

      const clarification = clarificationManager.getClarification(
        initResult.clarificationId!
      );
      expect(clarification!.completedAt).toBeDefined();
    });

    it('should prevent duplicate completion', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      clarificationManager.completeClarification(initResult.clarificationId!);

      const result = clarificationManager.completeClarification(
        initResult.clarificationId!
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already completed');
    });

    it('should handle non-existent clarification', () => {
      const result = clarificationManager.completeClarification('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getters', () => {
    it('should get clarifications for dispute', async () => {
      await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      const clarifications = clarificationManager.getClarificationsForDispute(
        'dispute-001'
      );

      expect(clarifications).toHaveLength(1);
      expect(clarifications[0].disputeId).toBe('dispute-001');
    });

    it('should get participation status', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: false,
      });

      const status = clarificationManager.getParticipationStatus(
        initResult.clarificationId!
      );

      expect(status).not.toBeNull();
      expect(status!.claimant).toBe(true);
      expect(status!.respondent).toBe(false);
    });

    it('should return null for non-existent clarification participation', () => {
      const status = clarificationManager.getParticipationStatus('non-existent');
      expect(status).toBeNull();
    });
  });

  describe('updateParticipationConsent', () => {
    it('should update claimant consent', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: false,
        respondentConsent: true,
      });

      const updated = clarificationManager.updateParticipationConsent(
        initResult.clarificationId!,
        'claimant',
        true
      );

      expect(updated).toBe(true);

      const status = clarificationManager.getParticipationStatus(
        initResult.clarificationId!
      );
      expect(status!.claimant).toBe(true);
    });

    it('should update respondent consent', async () => {
      const initResult = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: false,
      });

      const updated = clarificationManager.updateParticipationConsent(
        initResult.clarificationId!,
        'respondent',
        true
      );

      expect(updated).toBe(true);

      const status = clarificationManager.getParticipationStatus(
        initResult.clarificationId!
      );
      expect(status!.respondent).toBe(true);
    });

    it('should handle non-existent clarification', () => {
      const updated = clarificationManager.updateParticipationConsent(
        'non-existent',
        'claimant',
        true
      );

      expect(updated).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      // Create two clarifications
      const result1 = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      const result2 = await clarificationManager.initiateClarification({
        disputeId: 'dispute-002',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      // Add statements
      await clarificationManager.submitStatement({
        clarificationId: result1.clarificationId!,
        submittedBy: 'user-001',
        statementType: 'claim',
        content: 'Claim 1',
      });

      await clarificationManager.submitStatement({
        clarificationId: result1.clarificationId!,
        submittedBy: 'user-002',
        statementType: 'counterclaim',
        content: 'Counterclaim 1',
      });

      await clarificationManager.submitStatement({
        clarificationId: result2.clarificationId!,
        submittedBy: 'user-003',
        statementType: 'claim',
        content: 'Claim 2',
      });

      // Complete one
      clarificationManager.completeClarification(result1.clarificationId!);

      // Run analysis
      await clarificationManager.analyzeClarification(result2.clarificationId!);

      const stats = clarificationManager.getStats();

      expect(stats.totalClarifications).toBe(2);
      expect(stats.activeClarifications).toBe(1);
      expect(stats.completedClarifications).toBe(1);
      expect(stats.totalStatements).toBe(3);
      expect(stats.totalAnalyses).toBe(1);
      expect(stats.averageStatementsPerClarification).toBe(1.5);
    });
  });

  describe('persistence', () => {
    it('should persist clarifications to disk and load them', async () => {
      const result = await clarificationManager.initiateClarification({
        disputeId: 'dispute-001',
        mediatorId: 'mediator-001',
        claimantConsent: true,
        respondentConsent: true,
      });

      await clarificationManager.submitStatement({
        clarificationId: result.clarificationId!,
        submittedBy: 'user-001',
        statementType: 'claim',
        content: 'Test claim',
      });

      // Create new instance to test loading
      const newManager = new ClarificationManager(config, llmProvider, testDataPath);

      const clarification = newManager.getClarification(result.clarificationId!);
      expect(clarification).toBeDefined();
      expect(clarification!.disputeId).toBe('dispute-001');

      const statements = newManager.getStatements(result.clarificationId!);
      expect(statements).toHaveLength(1);
      expect(statements[0].content).toBe('Test claim');
    });
  });
});
