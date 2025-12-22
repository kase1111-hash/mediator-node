import { ChallengeDetector } from '../../../src/challenge/ChallengeDetector';
import { LLMProvider } from '../../../src/llm/LLMProvider';
import {
  MediatorConfig,
  ProposedSettlement,
  Intent,
  ContradictionAnalysis,
} from '../../../src/types';

// Mock LLMProvider
jest.mock('../../../src/llm/LLMProvider');

describe('ChallengeDetector', () => {
  let challengeDetector: ChallengeDetector;
  let mockConfig: MediatorConfig;
  let mockLLMProvider: jest.Mocked<LLMProvider>;
  let mockSettlement: ProposedSettlement;
  let mockIntentA: Intent;
  let mockIntentB: Intent;

  beforeEach(() => {
    mockConfig = {
      chainEndpoint: 'https://test-chain.example.com',
      chainId: 'test-chain',
      consensusMode: 'permissionless',
      llmProvider: 'anthropic',
      llmApiKey: 'test-api-key',
      llmModel: 'claude-3-5-sonnet-20241022',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 1.0,
      vectorDbPath: './test-vector-db',
      vectorDimensions: 1536,
      maxIntentsCache: 10000,
      acceptanceWindowHours: 72,
      logLevel: 'error' as const,
      minConfidenceToChallenge: 0.8,
    };

    mockLLMProvider = new LLMProvider(mockConfig) as jest.Mocked<LLMProvider>;
    challengeDetector = new ChallengeDetector(mockConfig, mockLLMProvider);

    mockIntentA = {
      hash: 'intent-a-hash',
      author: 'alice',
      prose: 'I need a logo design for my company. Budget is $500 maximum. Must be delivered by Friday.',
      desires: ['logo design', 'professional quality'],
      constraints: ['budget $500 maximum', 'delivery by Friday'],
      timestamp: Date.now(),
      status: 'pending',
    };

    mockIntentB = {
      hash: 'intent-b-hash',
      author: 'bob',
      prose: 'I offer professional logo design services. Typical turnaround is 1 week.',
      desires: ['logo design projects', 'fair compensation'],
      constraints: ['minimum budget $1000', '1 week turnaround'],
      timestamp: Date.now(),
      status: 'pending',
    };

    mockSettlement = {
      id: 'settlement-123',
      intentHashA: 'intent-a-hash',
      intentHashB: 'intent-b-hash',
      reasoningTrace: 'Both parties want logo design work',
      proposedTerms: {
        price: 750,
        deliverables: ['Logo design in vector format'],
        timelines: '5 business days',
      },
      facilitationFee: 7.5,
      facilitationFeePercent: 1.0,
      modelIntegrityHash: 'model-hash-123',
      mediatorId: 'mediator-xyz',
      timestamp: Date.now(),
      status: 'proposed',
      acceptanceDeadline: Date.now() + 72 * 60 * 60 * 1000,
      partyAAccepted: false,
      partyBAccepted: false,
      challenges: [],
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeSettlement', () => {
    it('should detect contradictions when settlement violates constraints', async () => {
      const mockAnalysis: ContradictionAnalysis = {
        hasContradiction: true,
        confidence: 0.9,
        violatedConstraints: ['budget $500 maximum', 'delivery by Friday'],
        contradictionProof:
          'The proposed settlement price of $750 exceeds Party A\'s explicit budget constraint of $500 maximum',
        paraphraseEvidence:
          'Alice stated a maximum budget of $500, but the settlement proposes $750',
        affectedParty: 'A',
        severity: 'severe',
      };

      // Mock the LLM response
      (mockLLMProvider as any).anthropic = {
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: JSON.stringify(mockAnalysis),
              },
            ],
          }),
        },
      };

      const result = await challengeDetector.analyzeSettlement(
        mockSettlement,
        mockIntentA,
        mockIntentB
      );

      expect(result).not.toBeNull();
      expect(result?.hasContradiction).toBe(true);
      expect(result?.confidence).toBe(0.9);
      expect(result?.violatedConstraints).toContain('budget $500 maximum');
      expect(result?.affectedParty).toBe('A');
      expect(result?.severity).toBe('severe');
    });

    it('should not flag reasonable compromises as contradictions', async () => {
      const mockAnalysis: ContradictionAnalysis = {
        hasContradiction: false,
        confidence: 0.3,
        violatedConstraints: [],
        contradictionProof: 'No explicit constraints were violated',
        paraphraseEvidence: 'The settlement represents a reasonable compromise',
        affectedParty: 'both',
        severity: 'minor',
      };

      (mockLLMProvider as any).anthropic = {
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: JSON.stringify(mockAnalysis),
              },
            ],
          }),
        },
      };

      // Create a reasonable settlement
      const reasonableSettlement = {
        ...mockSettlement,
        proposedTerms: {
          price: 475,
          deliverables: ['Logo design in vector format'],
          timelines: 'Thursday delivery',
        },
      };

      const result = await challengeDetector.analyzeSettlement(
        reasonableSettlement,
        mockIntentA,
        mockIntentB
      );

      expect(result).not.toBeNull();
      expect(result?.hasContradiction).toBe(false);
      expect(result?.confidence).toBeLessThan(0.8);
    });

    it('should handle LLM errors gracefully', async () => {
      (mockLLMProvider as any).anthropic = {
        messages: {
          create: jest.fn().mockRejectedValue(new Error('LLM API error')),
        },
      };

      const result = await challengeDetector.analyzeSettlement(
        mockSettlement,
        mockIntentA,
        mockIntentB
      );

      expect(result).not.toBeNull();
      expect(result?.hasContradiction).toBe(false);
      expect(result?.confidence).toBe(0);
      expect(result?.contradictionProof).toBe('Analysis failed');
    });

    it('should handle malformed LLM responses', async () => {
      (mockLLMProvider as any).anthropic = {
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: 'This is not JSON',
              },
            ],
          }),
        },
      };

      const result = await challengeDetector.analyzeSettlement(
        mockSettlement,
        mockIntentA,
        mockIntentB
      );

      expect(result).not.toBeNull();
      expect(result?.hasContradiction).toBe(false);
      expect(result?.confidence).toBe(0);
    });

    it('should sanitize confidence values to 0-1 range', async () => {
      const mockAnalysis = {
        hasContradiction: true,
        confidence: 1.5, // Invalid - should be clamped
        violatedConstraints: ['test'],
        contradictionProof: 'test',
        paraphraseEvidence: 'test',
        affectedParty: 'A',
        severity: 'moderate',
      };

      (mockLLMProvider as any).anthropic = {
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: JSON.stringify(mockAnalysis),
              },
            ],
          }),
        },
      };

      const result = await challengeDetector.analyzeSettlement(
        mockSettlement,
        mockIntentA,
        mockIntentB
      );

      expect(result).not.toBeNull();
      expect(result?.confidence).toBeLessThanOrEqual(1);
      expect(result?.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should validate affectedParty values', async () => {
      const mockAnalysis = {
        hasContradiction: true,
        confidence: 0.9,
        violatedConstraints: ['test'],
        contradictionProof: 'test',
        paraphraseEvidence: 'test',
        affectedParty: 'invalid', // Should default to 'both'
        severity: 'moderate',
      };

      (mockLLMProvider as any).anthropic = {
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: JSON.stringify(mockAnalysis),
              },
            ],
          }),
        },
      };

      const result = await challengeDetector.analyzeSettlement(
        mockSettlement,
        mockIntentA,
        mockIntentB
      );

      expect(result).not.toBeNull();
      expect(result?.affectedParty).toBe('both');
    });

    it('should validate severity values', async () => {
      const mockAnalysis = {
        hasContradiction: true,
        confidence: 0.9,
        violatedConstraints: ['test'],
        contradictionProof: 'test',
        paraphraseEvidence: 'test',
        affectedParty: 'A',
        severity: 'invalid', // Should default to 'moderate'
      };

      (mockLLMProvider as any).anthropic = {
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: JSON.stringify(mockAnalysis),
              },
            ],
          }),
        },
      };

      const result = await challengeDetector.analyzeSettlement(
        mockSettlement,
        mockIntentA,
        mockIntentB
      );

      expect(result).not.toBeNull();
      expect(result?.severity).toBe('moderate');
    });
  });

  describe('shouldChallenge', () => {
    it('should return true when confidence meets threshold', () => {
      const analysis: ContradictionAnalysis = {
        hasContradiction: true,
        confidence: 0.9,
        violatedConstraints: ['budget constraint'],
        contradictionProof: 'test proof',
        paraphraseEvidence: 'test evidence',
        affectedParty: 'A',
        severity: 'severe',
      };

      expect(challengeDetector.shouldChallenge(analysis)).toBe(true);
    });

    it('should return false when confidence below threshold', () => {
      const analysis: ContradictionAnalysis = {
        hasContradiction: true,
        confidence: 0.7, // Below default 0.8 threshold
        violatedConstraints: ['budget constraint'],
        contradictionProof: 'test proof',
        paraphraseEvidence: 'test evidence',
        affectedParty: 'A',
        severity: 'moderate',
      };

      expect(challengeDetector.shouldChallenge(analysis)).toBe(false);
    });

    it('should return false when no contradiction detected', () => {
      const analysis: ContradictionAnalysis = {
        hasContradiction: false,
        confidence: 0.9,
        violatedConstraints: [],
        contradictionProof: 'no violation',
        paraphraseEvidence: 'no evidence',
        affectedParty: 'both',
        severity: 'minor',
      };

      expect(challengeDetector.shouldChallenge(analysis)).toBe(false);
    });

    it('should return false when no constraints violated', () => {
      const analysis: ContradictionAnalysis = {
        hasContradiction: true,
        confidence: 0.9,
        violatedConstraints: [], // Empty
        contradictionProof: 'test proof',
        paraphraseEvidence: 'test evidence',
        affectedParty: 'A',
        severity: 'moderate',
      };

      expect(challengeDetector.shouldChallenge(analysis)).toBe(false);
    });

    it('should respect custom confidence threshold from config', () => {
      const customConfig = {
        ...mockConfig,
        minConfidenceToChallenge: 0.95,
      };

      const customDetector = new ChallengeDetector(customConfig, mockLLMProvider);

      const analysis: ContradictionAnalysis = {
        hasContradiction: true,
        confidence: 0.9, // Above default 0.8 but below custom 0.95
        violatedConstraints: ['test'],
        contradictionProof: 'test proof',
        paraphraseEvidence: 'test evidence',
        affectedParty: 'A',
        severity: 'severe',
      };

      expect(customDetector.shouldChallenge(analysis)).toBe(false);
    });
  });
});
