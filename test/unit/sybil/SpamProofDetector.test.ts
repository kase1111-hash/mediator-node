import { SpamProofDetector } from '../../../src/sybil/SpamProofDetector';
import { LLMProvider } from '../../../src/llm/LLMProvider';
import { MediatorConfig, Intent } from '../../../src/types';
import axios from 'axios';

jest.mock('axios');

describe('SpamProofDetector', () => {
  let detector: SpamProofDetector;
  let mockConfig: MediatorConfig;
  let mockLLMProvider: LLMProvider;
  let mockIntent: Intent;
  let mockAnthropicCreate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      chainEndpoint: 'http://localhost:8080',
      chainId: 'test-chain',
      consensusMode: 'permissionless',
      llmProvider: 'anthropic',
      llmApiKey: 'test-key',
      llmModel: 'claude-3-5-sonnet-20241022',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 1.0,
      vectorDbPath: './vector-db',
      vectorDimensions: 1536,
      maxIntentsCache: 10000,
      acceptanceWindowHours: 72,
      logLevel: 'info',
      enableSpamProofSubmission: true,
      minSpamConfidence: 0.9,
    };

    mockAnthropicCreate = jest.fn();

    const mockAnthropic = {
      messages: {
        create: mockAnthropicCreate,
      },
    };

    // Cast to any to bypass private property access restrictions in tests
    mockLLMProvider = {
      anthropic: mockAnthropic,
    } as any as LLMProvider;

    mockIntent = {
      hash: 'test-intent-hash',
      author: 'test-author',
      prose: 'I want to buy a laptop',
      desires: ['laptop', 'good price'],
      constraints: ['under $1000'],
      timestamp: Date.now(),
      status: 'pending',
    };

    detector = new SpamProofDetector(mockConfig, mockLLMProvider);
  });

  describe('analyzeIntent', () => {
    it('should return null if spam proof submission disabled', async () => {
      const config = { ...mockConfig, enableSpamProofSubmission: false };
      const disabledDetector = new SpamProofDetector(config, mockLLMProvider);

      const result = await disabledDetector.analyzeIntent(mockIntent);

      expect(result).toBeNull();
    });

    it('should detect spam with high confidence', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            isSpam: true,
            confidence: 0.95,
            evidence: 'Intent contains only gibberish and no meaningful request',
          }),
        }],
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const spamIntent = {
        ...mockIntent,
        prose: 'asdfasdf asdfasdf asdfasdf',
        desires: ['asdfasdf'],
        constraints: [],
      };

      const result = await detector.analyzeIntent(spamIntent);

      expect(result).not.toBeNull();
      expect(result?.isSpam).toBe(true);
      expect(result?.confidence).toBe(0.95);
      expect(result?.evidence).toContain('gibberish');
    });

    it('should not detect legitimate intent as spam', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            isSpam: false,
            confidence: 0.05,
            evidence: 'Intent is a legitimate request to purchase a laptop with clear constraints',
          }),
        }],
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await detector.analyzeIntent(mockIntent);

      expect(result).not.toBeNull();
      expect(result?.isSpam).toBe(false);
      expect(result?.confidence).toBe(0.05);
    });

    it('should work with OpenAI provider', async () => {
      const openaiConfig = {
        ...mockConfig,
        llmProvider: 'openai' as const,
      };

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    isSpam: false,
                    confidence: 0.1,
                    evidence: 'Legitimate request',
                  }),
                },
              }],
            }),
          },
        },
      };

      const openaiProvider = {
        openai: mockOpenAI,
      } as any;

      const openaiDetector = new SpamProofDetector(openaiConfig, openaiProvider);

      const result = await openaiDetector.analyzeIntent(mockIntent);

      expect(result).not.toBeNull();
      expect(result?.isSpam).toBe(false);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'This is not JSON',
        }],
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await detector.analyzeIntent(mockIntent);

      expect(result).toBeNull();
    });

    it('should handle LLM errors gracefully', async () => {
      mockAnthropicCreate.mockRejectedValue(
        new Error('LLM API error')
      );

      const result = await detector.analyzeIntent(mockIntent);

      expect(result).toBeNull();
    });

    it('should clamp confidence to 0-1 range', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: JSON.stringify({
            isSpam: true,
            confidence: 1.5, // Invalid confidence > 1
            evidence: 'Test evidence',
          }),
        }],
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await detector.analyzeIntent(mockIntent);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(1); // Clamped to 1
    });

    it('should extract JSON from text with extra content', async () => {
      const mockResponse = {
        content: [{
          type: 'text',
          text: 'Here is my analysis:\n{"isSpam": true, "confidence": 0.92, "evidence": "Test"}\nThank you!',
        }],
      };

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const result = await detector.analyzeIntent(mockIntent);

      expect(result).not.toBeNull();
      expect(result?.isSpam).toBe(true);
      expect(result?.confidence).toBe(0.92);
    });
  });

  describe('shouldSubmitProof', () => {
    it('should submit proof for high confidence spam', () => {
      const analysis = {
        isSpam: true,
        confidence: 0.95,
      };

      const shouldSubmit = detector.shouldSubmitProof(analysis);

      expect(shouldSubmit).toBe(true);
    });

    it('should not submit proof for low confidence spam', () => {
      const analysis = {
        isSpam: true,
        confidence: 0.7,
      };

      const shouldSubmit = detector.shouldSubmitProof(analysis);

      expect(shouldSubmit).toBe(false);
    });

    it('should not submit proof for non-spam', () => {
      const analysis = {
        isSpam: false,
        confidence: 0.95,
      };

      const shouldSubmit = detector.shouldSubmitProof(analysis);

      expect(shouldSubmit).toBe(false);
    });

    it('should respect custom minSpamConfidence', () => {
      const config = { ...mockConfig, minSpamConfidence: 0.8 };
      const customDetector = new SpamProofDetector(config, mockLLMProvider);

      const analysis = {
        isSpam: true,
        confidence: 0.85,
      };

      expect(customDetector.shouldSubmitProof(analysis)).toBe(true);
      expect(detector.shouldSubmitProof(analysis)).toBe(false); // Default 0.9
    });
  });

  describe('submitSpamProof', () => {
    it('should submit spam proof successfully', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { success: true },
      });

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'This intent is clearly spam',
      };

      const result = await detector.submitSpamProof(mockIntent, analysis);

      expect(result.success).toBe(true);
      expect(result.proofId).toBeDefined();
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/spam-proofs'),
        expect.objectContaining({
          type: 'spam_proof',
          proof: expect.objectContaining({
            targetIntentHash: 'test-intent-hash',
            targetAuthor: 'test-author',
            submitterId: 'test-public-key',
            evidence: 'This intent is clearly spam',
            confidence: 0.95,
            status: 'pending',
          }),
        })
      );
    });

    it('should format spam proof as prose', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { success: true },
      });

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'Test evidence',
      };

      await detector.submitSpamProof(mockIntent, analysis);

      const call = (axios.post as jest.Mock).mock.calls[0];
      const prose = call[1].prose;

      expect(prose).toContain('[SPAM PROOF]');
      expect(prose).toContain('test-intent-hash');
      expect(prose).toContain('test-author');
      expect(prose).toContain('95.0%'); // Confidence as percentage
      expect(prose).toContain('Test evidence');
      expect(prose).toContain(mockIntent.prose);
    });

    it('should handle submission errors', async () => {
      (axios.post as jest.Mock).mockRejectedValue(new Error('Network error'));

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'Test evidence',
      };

      const result = await detector.submitSpamProof(mockIntent, analysis);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should track submitted proofs', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { success: true },
      });

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'Test evidence',
      };

      await detector.submitSpamProof(mockIntent, analysis);

      const proofs = detector.getSubmittedProofs();

      expect(proofs.length).toBe(1);
      expect(proofs[0].targetIntentHash).toBe('test-intent-hash');
    });
  });

  describe('monitorSpamProofs', () => {
    it('should check status of pending proofs', async () => {
      // Submit a proof first
      (axios.post as jest.Mock).mockResolvedValue({
        data: { success: true },
      });

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'Test evidence',
      };

      const submitResult = await detector.submitSpamProof(mockIntent, analysis);

      // Mock status check
      (axios.get as jest.Mock).mockResolvedValue({
        data: {
          status: 'validated',
          depositForfeited: 100,
        },
      });

      await detector.monitorSpamProofs();

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/spam-proofs/${submitResult.proofId}/status`)
      );

      const proofs = detector.getSubmittedProofs();
      expect(proofs[0].status).toBe('validated');
      expect(proofs[0].depositForfeited).toBe(100);
    });

    it('should skip non-pending proofs', async () => {
      // Submit and validate a proof
      (axios.post as jest.Mock).mockResolvedValue({
        data: { success: true },
      });

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'Test evidence',
      };

      await detector.submitSpamProof(mockIntent, analysis);

      (axios.get as jest.Mock).mockResolvedValue({
        data: { status: 'validated' },
      });

      await detector.monitorSpamProofs();

      // Clear mocks
      (axios.get as jest.Mock).mockClear();

      // Monitor again
      await detector.monitorSpamProofs();

      // Should not check already validated proof
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('should handle rejected proofs', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { success: true },
      });

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'Test evidence',
      };

      await detector.submitSpamProof(mockIntent, analysis);

      (axios.get as jest.Mock).mockResolvedValue({
        data: { status: 'rejected' },
      });

      await detector.monitorSpamProofs();

      const proofs = detector.getSubmittedProofs();
      expect(proofs[0].status).toBe('rejected');
    });

    it('should do nothing if no proofs submitted', async () => {
      await detector.monitorSpamProofs();

      expect(axios.get).not.toHaveBeenCalled();
    });

    it('should handle status check errors', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { success: true },
      });

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'Test evidence',
      };

      await detector.submitSpamProof(mockIntent, analysis);

      (axios.get as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(detector.monitorSpamProofs()).resolves.not.toThrow();

      // Proof should still be pending
      const proofs = detector.getSubmittedProofs();
      expect(proofs[0].status).toBe('pending');
    });
  });

  describe('getSpamProofStats', () => {
    it('should return empty stats initially', () => {
      const stats = detector.getSpamProofStats();

      expect(stats.total).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.validated).toBe(0);
      expect(stats.rejected).toBe(0);
      expect(stats.totalForfeited).toBe(0);
    });

    it('should count proofs by status', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { success: true },
      });

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'Test evidence',
      };

      // Submit 3 proofs
      await detector.submitSpamProof(mockIntent, analysis);
      await detector.submitSpamProof({ ...mockIntent, hash: 'hash2' }, analysis);
      await detector.submitSpamProof({ ...mockIntent, hash: 'hash3' }, analysis);

      // Validate one
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({
          data: { status: 'validated', depositForfeited: 100 },
        })
        .mockResolvedValueOnce({
          data: { status: 'rejected' },
        })
        .mockResolvedValueOnce({
          data: { status: 'pending' },
        });

      await detector.monitorSpamProofs();

      const stats = detector.getSpamProofStats();

      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.validated).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.totalForfeited).toBe(100);
    });
  });

  describe('getSubmittedProofs', () => {
    it('should return all submitted proofs', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { success: true },
      });

      const analysis = {
        isSpam: true,
        confidence: 0.95,
        evidence: 'Test evidence',
      };

      await detector.submitSpamProof(mockIntent, analysis);
      await detector.submitSpamProof({ ...mockIntent, hash: 'hash2' }, analysis);

      const proofs = detector.getSubmittedProofs();

      expect(proofs.length).toBe(2);
      expect(proofs[0].targetIntentHash).toBe('test-intent-hash');
      expect(proofs[1].targetIntentHash).toBe('hash2');
    });
  });
});
