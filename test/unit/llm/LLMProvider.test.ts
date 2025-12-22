/**
 * Unit Tests for LLMProvider
 *
 * Tests cover:
 * - Provider initialization (Anthropic vs OpenAI)
 * - Embedding generation (OpenAI and fallback)
 * - Fallback embedding algorithm
 * - Negotiation between intents
 * - Prompt building
 * - Response parsing
 * - Semantic summary generation
 * - Error handling
 */

import { LLMProvider } from '../../../src/llm/LLMProvider';
import { MediatorConfig, Intent, NegotiationResult, ConsensusMode } from '../../../src/types';
import { VALID_INTENT_1, VALID_INTENT_2, VALID_INTENT_3 } from '../../fixtures/intents';
import { createMockConfig } from '../../utils/testUtils';

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk');
import Anthropic from '@anthropic-ai/sdk';
const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

// Mock OpenAI SDK
jest.mock('openai');
import OpenAI from 'openai';
const MockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock crypto utils
const mockGenerateHash = jest.fn((model: string, prompt: string) => `hash_${model}_${prompt.length}`);
jest.mock('../../../src/utils/crypto', () => ({
  generateModelIntegrityHash: (model: string, prompt: string) => mockGenerateHash(model, prompt),
}));

describe('LLMProvider', () => {
  let config: MediatorConfig;
  let anthropicInstance: any;
  let openaiInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock instances
    anthropicInstance = {
      messages: {
        create: jest.fn(),
      },
    };

    openaiInstance = {
      embeddings: {
        create: jest.fn(),
      },
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    // Mock constructors to return our instances
    MockedAnthropic.mockImplementation(() => anthropicInstance);
    MockedOpenAI.mockImplementation(() => openaiInstance);
  });

  describe('Constructor - Anthropic', () => {
    it('should initialize with Anthropic provider', () => {
      config = createMockConfig({ llmProvider: 'anthropic', llmApiKey: 'test-anthropic-key' });
      const provider = new LLMProvider(config);

      expect(provider).toBeDefined();
      expect(MockedAnthropic).toHaveBeenCalledWith({ apiKey: 'test-anthropic-key' });
    });

    it('should not initialize OpenAI when using Anthropic', () => {
      config = createMockConfig({ llmProvider: 'anthropic' });
      new LLMProvider(config);

      expect(MockedOpenAI).not.toHaveBeenCalled();
    });
  });

  describe('Constructor - OpenAI', () => {
    it('should initialize with OpenAI provider', () => {
      config = createMockConfig({ llmProvider: 'openai', llmApiKey: 'test-openai-key' });
      const provider = new LLMProvider(config);

      expect(provider).toBeDefined();
      expect(MockedOpenAI).toHaveBeenCalledWith({ apiKey: 'test-openai-key' });
    });

    it('should not initialize Anthropic when using OpenAI', () => {
      config = createMockConfig({ llmProvider: 'openai' });
      new LLMProvider(config);

      expect(MockedAnthropic).not.toHaveBeenCalled();
    });
  });

  describe('Embedding Generation - OpenAI', () => {
    beforeEach(() => {
      config = createMockConfig({ llmProvider: 'openai', vectorDimensions: 1024 });
    });

    it('should generate embedding using OpenAI', async () => {
      const provider = new LLMProvider(config);
      const mockEmbedding = new Array(1024).fill(0).map(() => Math.random());

      openaiInstance.embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      });

      const result = await provider.generateEmbedding('test text');

      expect(openaiInstance.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'test text',
      });
      expect(result).toEqual(mockEmbedding);
    });

    it('should handle OpenAI API errors', async () => {
      const provider = new LLMProvider(config);
      openaiInstance.embeddings.create.mockRejectedValue(new Error('API Error'));

      await expect(provider.generateEmbedding('test')).rejects.toThrow('API Error');
    });

    it('should generate embeddings for different texts', async () => {
      const provider = new LLMProvider(config);
      const embedding1 = new Array(1024).fill(1);
      const embedding2 = new Array(1024).fill(2);

      openaiInstance.embeddings.create
        .mockResolvedValueOnce({ data: [{ embedding: embedding1 }] })
        .mockResolvedValueOnce({ data: [{ embedding: embedding2 }] });

      const result1 = await provider.generateEmbedding('text one');
      const result2 = await provider.generateEmbedding('text two');

      expect(result1).toEqual(embedding1);
      expect(result2).toEqual(embedding2);
      expect(openaiInstance.embeddings.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('Embedding Generation - Anthropic Fallback', () => {
    beforeEach(() => {
      config = createMockConfig({ llmProvider: 'anthropic', vectorDimensions: 1024 });
    });

    it('should use fallback embedding for Anthropic', async () => {
      const provider = new LLMProvider(config);
      const result = await provider.generateEmbedding('test text');

      expect(result).toHaveLength(1024);
      expect(result.every(val => typeof val === 'number')).toBe(true);
    });

    it('should generate different embeddings for different texts', async () => {
      const provider = new LLMProvider(config);
      const embedding1 = await provider.generateEmbedding('hello world');
      const embedding2 = await provider.generateEmbedding('goodbye world');

      expect(embedding1).not.toEqual(embedding2);
    });

    it('should normalize fallback embeddings', async () => {
      const provider = new LLMProvider(config);
      const embedding = await provider.generateEmbedding('test');

      // Check that embedding is normalized (magnitude should be close to 1)
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });

    it('should handle empty text gracefully', async () => {
      const provider = new LLMProvider(config);
      const embedding = await provider.generateEmbedding('');

      expect(embedding).toHaveLength(1024);
      // Empty text should produce zero vector (normalized)
      expect(embedding.every(val => val === 0 || !isNaN(val))).toBe(true);
    });

    it('should respect vector dimensions from config', async () => {
      config = createMockConfig({ llmProvider: 'anthropic', vectorDimensions: 512 });
      const provider = new LLMProvider(config);
      const embedding = await provider.generateEmbedding('test');

      expect(embedding).toHaveLength(512);
    });
  });

  describe('Negotiation - Anthropic', () => {
    beforeEach(() => {
      config = createMockConfig({
        llmProvider: 'anthropic',
        llmModel: 'claude-3-5-sonnet-20241022',
      });
    });

    it('should negotiate alignment successfully', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = `SUCCESS: yes
CONFIDENCE: 85
REASONING: Both parties need logo design services and can provide them.
PROPOSED_TERMS: {
  "price": 500,
  "deliverables": ["Modern logo design", "Vector files"],
  "timeline": "1 week"
}`;

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: mockResponse }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(anthropicInstance.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('Intent A'),
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.confidenceScore).toBe(85);
      expect(result.proposedTerms.price).toBe(500);
      expect(result.reasoning).toContain('Both parties');
    });

    it('should handle unsuccessful negotiation', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = `SUCCESS: no
CONFIDENCE: 20
REASONING: These intents are not compatible.
PROPOSED_TERMS: {}`;

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: mockResponse }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_3);

      expect(result.success).toBe(false);
      expect(result.confidenceScore).toBe(20);
    });

    it('should filter low confidence results', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = `SUCCESS: yes
CONFIDENCE: 50
REASONING: Marginal alignment.
PROPOSED_TERMS: {}`;

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: mockResponse }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      // Success requires confidence >= 60
      expect(result.success).toBe(false);
      expect(result.confidenceScore).toBe(50);
    });

    it('should include model in result', async () => {
      const provider = new LLMProvider(config);
      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'SUCCESS: yes\nCONFIDENCE: 80\nREASONING: Good\nPROPOSED_TERMS: {}' }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.modelUsed).toBe('claude-3-5-sonnet-20241022');
      expect(result).toHaveProperty('promptHash');
    });

    it('should handle Anthropic API errors', async () => {
      const provider = new LLMProvider(config);
      anthropicInstance.messages.create.mockRejectedValue(new Error('API Error'));

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.success).toBe(false);
      expect(result.reasoning).toContain('failed due to error');
      expect(result.confidenceScore).toBe(0);
    });
  });

  describe('Negotiation - OpenAI', () => {
    beforeEach(() => {
      config = createMockConfig({
        llmProvider: 'openai',
        llmModel: 'gpt-4',
      });
    });

    it('should negotiate alignment successfully', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = `SUCCESS: yes
CONFIDENCE: 90
REASONING: Perfect match for services.
PROPOSED_TERMS: {
  "price": 1000,
  "deliverables": ["API development"],
  "timeline": "2 weeks"
}`;

      openaiInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: mockResponse } }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(openaiInstance.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('neutral mediator'),
          },
          {
            role: 'user',
            content: expect.stringContaining('Intent A'),
          },
        ],
        max_tokens: 2048,
      });

      expect(result.success).toBe(true);
      expect(result.confidenceScore).toBe(90);
    });

    it('should handle OpenAI API errors', async () => {
      const provider = new LLMProvider(config);
      openaiInstance.chat.completions.create.mockRejectedValue(new Error('OpenAI Error'));

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.success).toBe(false);
      expect(result.reasoning).toContain('failed due to error');
    });

    it('should handle null content in response', async () => {
      const provider = new LLMProvider(config);
      openaiInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.success).toBe(false);
      expect(result.confidenceScore).toBe(0);
    });
  });

  describe('Response Parsing', () => {
    beforeEach(() => {
      config = createMockConfig({ llmProvider: 'anthropic' });
    });

    it('should parse complete response correctly', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = `SUCCESS: yes
CONFIDENCE: 75
REASONING: Good alignment between needs and skills.
PROPOSED_TERMS: {
  "price": 750,
  "deliverables": ["Item 1", "Item 2"],
  "timelines": "3 days"
}`;

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: mockResponse }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.success).toBe(true);
      expect(result.confidenceScore).toBe(75);
      expect(result.reasoning).toContain('Good alignment');
      expect(result.proposedTerms.price).toBe(750);
      expect(result.proposedTerms.deliverables).toEqual(['Item 1', 'Item 2']);
      expect(result.proposedTerms.timelines).toBe('3 days');
    });

    it('should handle malformed JSON in proposed terms', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = `SUCCESS: yes
CONFIDENCE: 70
REASONING: Test
PROPOSED_TERMS: { invalid json }`;

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: mockResponse }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.success).toBe(true);
      expect(result.proposedTerms).toEqual({});
    });

    it('should handle missing SUCCESS field', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = `CONFIDENCE: 80
REASONING: Test
PROPOSED_TERMS: {}`;

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: mockResponse }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.success).toBe(false); // Defaults to false
      expect(result.confidenceScore).toBe(80);
    });

    it('should handle missing CONFIDENCE field', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = `SUCCESS: yes
REASONING: Test
PROPOSED_TERMS: {}`;

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: mockResponse }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.confidenceScore).toBe(0); // Defaults to 0
      expect(result.success).toBe(false); // False because confidence < 60
    });

    it('should handle missing REASONING field', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = `SUCCESS: yes
CONFIDENCE: 80
PROPOSED_TERMS: {}`;

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: mockResponse }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should handle completely malformed response', async () => {
      const provider = new LLMProvider(config);
      const mockResponse = 'This is not a valid response format at all';

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: mockResponse }],
      });

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.success).toBe(false);
      expect(result.confidenceScore).toBe(0);
      expect(result.proposedTerms).toEqual({});
    });
  });

  describe('Semantic Summary - Anthropic', () => {
    beforeEach(() => {
      config = createMockConfig({ llmProvider: 'anthropic' });
    });

    it('should generate semantic summary', async () => {
      const provider = new LLMProvider(config);
      const settlement = {
        intentHashA: 'hash1',
        intentHashB: 'hash2',
        proposedTerms: { price: 500, deliverables: ['Logo'], timeline: '1 week' },
      };

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'This is a logo design agreement for $500.' }],
      });

      const summary = await provider.generateSemanticSummary(settlement);

      expect(anthropicInstance.messages.create).toHaveBeenCalledWith({
        model: config.llmModel,
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('semantic summary'),
          },
        ],
      });

      expect(summary).toBe('This is a logo design agreement for $500.');
    });

    it('should handle Anthropic API errors in summary', async () => {
      const provider = new LLMProvider(config);
      anthropicInstance.messages.create.mockRejectedValue(new Error('API Error'));

      const summary = await provider.generateSemanticSummary({});

      expect(summary).toBe('Error generating summary');
    });

    it('should handle non-text content type', async () => {
      const provider = new LLMProvider(config);
      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'image', source: { data: 'base64data' } }],
      });

      const summary = await provider.generateSemanticSummary({});

      expect(summary).toBe('');
    });
  });

  describe('Semantic Summary - OpenAI', () => {
    beforeEach(() => {
      config = createMockConfig({ llmProvider: 'openai' });
    });

    it('should generate semantic summary', async () => {
      const provider = new LLMProvider(config);
      const settlement = {
        intentHashA: 'hash1',
        intentHashB: 'hash2',
        proposedTerms: { price: 1000 },
      };

      openaiInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Development agreement for $1000.' } }],
      });

      const summary = await provider.generateSemanticSummary(settlement);

      expect(openaiInstance.chat.completions.create).toHaveBeenCalledWith({
        model: config.llmModel,
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('semantic summary'),
          },
        ],
        max_tokens: 256,
      });

      expect(summary).toBe('Development agreement for $1000.');
    });

    it('should handle OpenAI API errors in summary', async () => {
      const provider = new LLMProvider(config);
      openaiInstance.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const summary = await provider.generateSemanticSummary({});

      expect(summary).toBe('Error generating summary');
    });

    it('should handle null content in summary response', async () => {
      const provider = new LLMProvider(config);
      openaiInstance.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const summary = await provider.generateSemanticSummary({});

      expect(summary).toBe('');
    });
  });

  describe('Prompt Building', () => {
    beforeEach(() => {
      config = createMockConfig({ llmProvider: 'anthropic' });
    });

    it('should build prompt with all intent fields', async () => {
      const provider = new LLMProvider(config);
      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'SUCCESS: no\nCONFIDENCE: 0\nREASONING: Test\nPROPOSED_TERMS: {}' }],
      });

      await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      const callArgs = anthropicInstance.messages.create.mock.calls[0][0];
      const prompt = callArgs.messages[0].content;

      expect(prompt).toContain(VALID_INTENT_1.hash);
      expect(prompt).toContain(VALID_INTENT_1.author);
      expect(prompt).toContain(VALID_INTENT_1.prose);
      expect(prompt).toContain(VALID_INTENT_2.hash);
      expect(prompt).toContain(VALID_INTENT_2.author);
      expect(prompt).toContain(VALID_INTENT_2.prose);
    });

    it('should include desires and constraints in prompt', async () => {
      const provider = new LLMProvider(config);
      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'SUCCESS: no\nCONFIDENCE: 0\nREASONING: Test\nPROPOSED_TERMS: {}' }],
      });

      await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      const callArgs = anthropicInstance.messages.create.mock.calls[0][0];
      const prompt = callArgs.messages[0].content;

      expect(prompt).toContain('Desires:');
      expect(prompt).toContain('Constraints:');
    });

    it('should include protocol principles in prompt', async () => {
      const provider = new LLMProvider(config);
      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'SUCCESS: no\nCONFIDENCE: 0\nREASONING: Test\nPROPOSED_TERMS: {}' }],
      });

      await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      const callArgs = anthropicInstance.messages.create.mock.calls[0][0];
      const prompt = callArgs.messages[0].content;

      expect(prompt).toContain('Intent over form');
      expect(prompt).toContain('Radical neutrality');
      expect(prompt).toContain('Refuse shadow');
    });
  });

  describe('Edge Cases', () => {
    it('should throw error when no provider configured', async () => {
      config = createMockConfig({ llmProvider: 'unsupported' as any });
      const provider = new LLMProvider(config);

      const result = await provider.negotiateAlignment(VALID_INTENT_1, VALID_INTENT_2);

      expect(result.success).toBe(false);
      expect(result.reasoning).toContain('failed due to error');
    });

    it('should handle intents with missing optional fields', async () => {
      config = createMockConfig({ llmProvider: 'anthropic' });
      const provider = new LLMProvider(config);

      const minimalIntent: Intent = {
        hash: 'test_hash',
        author: 'test_author',
        prose: 'test prose that is long enough to pass validation checks',
        timestamp: Date.now(),
        status: 'pending',
        offeredFee: 0,
        constraints: [],
        desires: [],
      };

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'SUCCESS: yes\nCONFIDENCE: 70\nREASONING: Test\nPROPOSED_TERMS: {}' }],
      });

      const result = await provider.negotiateAlignment(minimalIntent, VALID_INTENT_2);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it('should handle very long intent prose', async () => {
      config = createMockConfig({ llmProvider: 'anthropic' });
      const provider = new LLMProvider(config);

      const longIntent: Intent = {
        ...VALID_INTENT_1,
        prose: 'A'.repeat(10000),
      };

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'SUCCESS: yes\nCONFIDENCE: 60\nREASONING: Test\nPROPOSED_TERMS: {}' }],
      });

      const result = await provider.negotiateAlignment(longIntent, VALID_INTENT_2);

      expect(result).toBeDefined();
      const callArgs = anthropicInstance.messages.create.mock.calls[0][0];
      expect(callArgs.messages[0].content).toContain('A'.repeat(10000));
    });

    it('should handle special characters in intent data', async () => {
      config = createMockConfig({ llmProvider: 'anthropic' });
      const provider = new LLMProvider(config);

      const specialIntent: Intent = {
        ...VALID_INTENT_1,
        prose: 'Test with "quotes" and <tags> and {braces}',
      };

      anthropicInstance.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'SUCCESS: yes\nCONFIDENCE: 70\nREASONING: Test\nPROPOSED_TERMS: {}' }],
      });

      const result = await provider.negotiateAlignment(specialIntent, VALID_INTENT_2);

      expect(result).toBeDefined();
    });
  });
});
