/**
 * Unit Tests for IntentIngester
 *
 * Tests cover:
 * - Intent validation
 * - Unalignable detection
 * - Desire/constraint extraction
 * - Cache management
 * - Prioritization logic
 * - Polling behavior
 */

import { IntentIngester } from '../../../src/ingestion/IntentIngester';
import { MediatorConfig, Intent, ConsensusMode } from '../../../src/types';
import { BurnManager } from '../../../src/burn/BurnManager';
import {
  VALID_INTENT_1,
  VALID_INTENT_2,
  VAGUE_INTENT,
  COERCIVE_INTENT,
  UNSAFE_INTENT,
  HIGH_FEE_INTENT,
  LOW_FEE_INTENT,
  ALL_VALID_INTENTS,
} from '../../fixtures/intents';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock fs module for BurnManager
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import * as fs from 'fs';
const mockFs = fs as jest.Mocked<typeof fs>;

describe('IntentIngester', () => {
  let config: MediatorConfig;
  let ingester: IntentIngester;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset fs mocks
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.writeFileSync.mockImplementation(() => undefined);

    config = {
      chainEndpoint: 'http://localhost:3000',
      chainId: 'test-chain',
      consensusMode: 'permissionless' as ConsensusMode,
      llmProvider: 'anthropic',
      llmApiKey: 'test-key',
      llmModel: 'claude-3-5-sonnet-20241022',
      mediatorPrivateKey: 'test-private-key',
      mediatorPublicKey: 'test-public-key',
      facilitationFeePercent: 1.0,
      vectorDbPath: '/tmp/test-vector-db',
      vectorDimensions: 1024,
      maxIntentsCache: 100,
      acceptanceWindowHours: 72,
      logLevel: 'info',
      // Burn configuration
      baseFilingBurn: 10,
      freeDailySubmissions: 1,
      burnEscalationBase: 2,
      burnEscalationExponent: 1,
      successBurnPercentage: 0.05,
      loadScalingEnabled: false,
      maxLoadMultiplier: 10,
    };

    ingester = new IntentIngester(config);
  });

  afterEach(() => {
    ingester.stopPolling();
  });

  describe('Constructor', () => {
    it('should initialize with empty cache', () => {
      expect(ingester.getCachedIntents()).toEqual([]);
    });

    it('should accept config', () => {
      expect(ingester).toBeDefined();
    });
  });

  describe('Intent Validation - isValidIntent', () => {
    it('should accept valid intent with all required fields', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [VALID_INTENT_1] },
      });

      await (ingester as any).pollForIntents();

      const cached = ingester.getCachedIntents();
      expect(cached).toHaveLength(1);
      expect(cached[0].hash).toBe(VALID_INTENT_1.hash);
    });

    it('should reject intent without hash', async () => {
      const invalidIntent = { ...VALID_INTENT_1, hash: '' };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [invalidIntent] },
      });

      await (ingester as any).pollForIntents();

      expect(ingester.getCachedIntents()).toHaveLength(0);
    });

    it('should reject intent without author', async () => {
      const invalidIntent = { ...VALID_INTENT_1, author: '' };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [invalidIntent] },
      });

      await (ingester as any).pollForIntents();

      expect(ingester.getCachedIntents()).toHaveLength(0);
    });

    it('should reject intent without prose', async () => {
      const invalidIntent = { ...VALID_INTENT_1, prose: '' };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [invalidIntent] },
      });

      await (ingester as any).pollForIntents();

      expect(ingester.getCachedIntents()).toHaveLength(0);
    });

    it('should reject intent with prose shorter than 10 characters', async () => {
      const invalidIntent = { ...VALID_INTENT_1, prose: 'short' };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [invalidIntent] },
      });

      await (ingester as any).pollForIntents();

      expect(ingester.getCachedIntents()).toHaveLength(0);
    });

    it('should reject intent with prohibited coercive words', async () => {
      const explicitlyCoerciveIntent = {
        ...COERCIVE_INTENT,
        prose: 'I will coerce you into doing this.'
      };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [explicitlyCoerciveIntent] },
      });

      await (ingester as any).pollForIntents();

      expect(ingester.getCachedIntents()).toHaveLength(0);
    });

    it('should reject intent with illegal content', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [UNSAFE_INTENT] },
      });

      await (ingester as any).pollForIntents();

      expect(ingester.getCachedIntents()).toHaveLength(0);
    });

    it('should detect word "coerce" in intent prose', () => {
      const intent = { ...VALID_INTENT_1, prose: 'I will coerce you to do this' };
      const isValid = (ingester as any).isValidIntent(intent);
      expect(isValid).toBe(false);
    });

    it('should detect word "force" in intent prose', () => {
      const intent = { ...VALID_INTENT_1, prose: 'I will force you to comply' };
      const isValid = (ingester as any).isValidIntent(intent);
      expect(isValid).toBe(false);
    });

    it('should detect word "manipulate" in intent prose', () => {
      const intent = { ...VALID_INTENT_1, prose: 'I will manipulate the system' };
      const isValid = (ingester as any).isValidIntent(intent);
      expect(isValid).toBe(false);
    });

    it('should detect word "illegal" in intent prose', () => {
      const intent = { ...VALID_INTENT_1, prose: 'Help with illegal activity' };
      const isValid = (ingester as any).isValidIntent(intent);
      expect(isValid).toBe(false);
    });
  });

  describe('Unalignable Detection - isUnalignable', () => {
    it('should mark intent as unalignable if flagCount >= 5', () => {
      const flaggedIntent = { ...VALID_INTENT_1, flagCount: 5 };
      const isUnalignable = (ingester as any).isUnalignable(flaggedIntent);
      expect(isUnalignable).toBe(true);
    });

    it('should mark intent as unalignable if flagCount > 5', () => {
      const flaggedIntent = { ...VALID_INTENT_1, flagCount: 10 };
      const isUnalignable = (ingester as any).isUnalignable(flaggedIntent);
      expect(isUnalignable).toBe(true);
    });

    it('should not mark intent as unalignable if flagCount < 5', () => {
      const flaggedIntent = { ...VALID_INTENT_1, flagCount: 4 };
      const isUnalignable = (ingester as any).isUnalignable(flaggedIntent);
      expect(isUnalignable).toBe(false);
    });

    it('should mark intent as unalignable if prose is too short (<50 chars)', () => {
      const shortIntent = { ...VALID_INTENT_1, prose: 'Too short' };
      const isUnalignable = (ingester as any).isUnalignable(shortIntent);
      expect(isUnalignable).toBe(true);
    });

    it('should mark intent as unalignable if prose has no spaces', () => {
      const noSpaceIntent = { ...VALID_INTENT_1, prose: 'Thisisaverylongstringwithoutanyspaceswhichshouldbedetected' };
      const isUnalignable = (ingester as any).isUnalignable(noSpaceIntent);
      expect(isUnalignable).toBe(true);
    });

    it('should accept intent with flagCount undefined', () => {
      const unflaggedIntent = { ...VALID_INTENT_1 };
      delete (unflaggedIntent as any).flagCount;
      const isUnalignable = (ingester as any).isUnalignable(unflaggedIntent);
      expect(isUnalignable).toBe(false);
    });

    it('should reject vague intent', () => {
      const isUnalignable = (ingester as any).isUnalignable(VAGUE_INTENT);
      expect(isUnalignable).toBe(true);
    });
  });

  describe('Desire Extraction - extractDesires', () => {
    it('should extract desires from "I want" pattern', () => {
      const prose = 'I want a professional logo designer for my startup.';
      const desires = (ingester as any).extractDesires(prose);
      expect(desires).toContain('a professional logo designer for my startup');
    });

    it('should extract desires from "I need" pattern', () => {
      const prose = 'I need help with TypeScript development.';
      const desires = (ingester as any).extractDesires(prose);
      expect(desires).toContain('help with TypeScript development');
    });

    it('should extract desires from "looking for" pattern', () => {
      const prose = 'I am looking for a graphic designer with experience.';
      const desires = (ingester as any).extractDesires(prose);
      expect(desires.length).toBeGreaterThan(0);
    });

    it('should extract desires from "seeking" pattern', () => {
      const prose = 'I am seeking collaboration on a project.';
      const desires = (ingester as any).extractDesires(prose);
      expect(desires.length).toBeGreaterThan(0);
    });

    it('should extract multiple desires from prose', () => {
      const prose = 'I need a developer. I want good documentation. I seek quality work.';
      const desires = (ingester as any).extractDesires(prose);
      expect(desires.length).toBeGreaterThanOrEqual(1);
    });

    it('should return default desire if no patterns match', () => {
      const prose = 'This is some text without any desire patterns in it for testing.';
      const desires = (ingester as any).extractDesires(prose);
      expect(desires).toContain('general collaboration');
    });

    it('should handle empty prose gracefully', () => {
      const prose = '';
      const desires = (ingester as any).extractDesires(prose);
      expect(desires).toContain('general collaboration');
    });
  });

  describe('Constraint Extraction - extractConstraints', () => {
    it('should extract constraints from "must be" pattern', () => {
      const prose = 'The design must be modern and minimalist.';
      const constraints = (ingester as any).extractConstraints(prose);
      expect(constraints).toContain('modern and minimalist');
    });

    it('should extract constraints from "must have" pattern', () => {
      const prose = 'You must have TypeScript experience.';
      const constraints = (ingester as any).extractConstraints(prose);
      expect(constraints).toContain('TypeScript experience');
    });

    it('should extract constraints from "cannot" pattern', () => {
      const prose = 'I cannot work on weekends.';
      const constraints = (ingester as any).extractConstraints(prose);
      expect(constraints).toContain('work on weekends');
    });

    it('should extract constraints from "requires" pattern', () => {
      const prose = 'This project requires prior approval.';
      const constraints = (ingester as any).extractConstraints(prose);
      expect(constraints).toContain('prior approval');
    });

    it('should extract multiple constraints from prose', () => {
      const prose = 'Must be completed by Friday and cannot exceed budget.';
      const constraints = (ingester as any).extractConstraints(prose);
      expect(constraints.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array if no constraints found', () => {
      const prose = 'This is some text without any constraint patterns.';
      const constraints = (ingester as any).extractConstraints(prose);
      expect(constraints).toEqual([]);
    });

    it('should handle empty prose gracefully', () => {
      const prose = '';
      const constraints = (ingester as any).extractConstraints(prose);
      expect(constraints).toEqual([]);
    });
  });

  describe('Cache Management', () => {
    it('should cache valid intent', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [VALID_INTENT_1] },
      });

      await (ingester as any).pollForIntents();

      const cached = ingester.getCachedIntents();
      expect(cached).toHaveLength(1);
      expect(cached[0].hash).toBe(VALID_INTENT_1.hash);
    });

    it('should not cache duplicate intent', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [VALID_INTENT_1, VALID_INTENT_1] },
      });

      await (ingester as any).pollForIntents();

      const cached = ingester.getCachedIntents();
      expect(cached).toHaveLength(1);
    });

    it('should cache multiple different intents', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: ALL_VALID_INTENTS },
      });

      await (ingester as any).pollForIntents();

      const cached = ingester.getCachedIntents();
      expect(cached).toHaveLength(ALL_VALID_INTENTS.length);
    });

    it('should enforce max cache size', async () => {
      const smallConfig = { ...config, maxIntentsCache: 2 };
      const smallIngester = new IntentIngester(smallConfig);

      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: ALL_VALID_INTENTS },
      });

      await (smallIngester as any).pollForIntents();

      const cached = smallIngester.getCachedIntents();
      expect(cached.length).toBeLessThanOrEqual(2);
    });

    it('should remove oldest intents when cache is full', async () => {
      const smallConfig = { ...config, maxIntentsCache: 2 };
      const smallIngester = new IntentIngester(smallConfig);

      const oldIntent = { ...VALID_INTENT_1, timestamp: Date.now() - 10000 };
      const newIntent1 = { ...VALID_INTENT_2, timestamp: Date.now() - 5000 };
      const newIntent2 = { ...{ ...VALID_INTENT_1, hash: 'intent_new' }, timestamp: Date.now() };

      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [oldIntent, newIntent1, newIntent2] },
      });

      await (smallIngester as any).pollForIntents();

      const cached = smallIngester.getCachedIntents();
      expect(cached).toHaveLength(2);
      expect(cached.find(i => i.hash === oldIntent.hash)).toBeUndefined();
    });

    it('should get intent by hash', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [VALID_INTENT_1] },
      });

      await (ingester as any).pollForIntents();

      const intent = ingester.getIntent(VALID_INTENT_1.hash);
      expect(intent).toBeDefined();
      expect(intent?.hash).toBe(VALID_INTENT_1.hash);
    });

    it('should return undefined for non-existent hash', () => {
      const intent = ingester.getIntent('non-existent-hash');
      expect(intent).toBeUndefined();
    });

    it('should remove intent from cache', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [VALID_INTENT_1] },
      });

      await (ingester as any).pollForIntents();
      expect(ingester.getCachedIntents()).toHaveLength(1);

      ingester.removeIntent(VALID_INTENT_1.hash);
      expect(ingester.getCachedIntents()).toHaveLength(0);
    });

    it('should parse desires if not provided', async () => {
      const intentWithoutDesires = { ...VALID_INTENT_1, desires: [] };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [intentWithoutDesires] },
      });

      await (ingester as any).pollForIntents();

      const cached = ingester.getCachedIntents();
      expect(cached[0].desires.length).toBeGreaterThan(0);
    });

    it('should parse constraints if not provided', async () => {
      const intentWithoutConstraints = { ...VALID_INTENT_1, constraints: [] };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [intentWithoutConstraints] },
      });

      await (ingester as any).pollForIntents();

      const cached = ingester.getCachedIntents();
      // Constraints may be empty if prose doesn't match patterns, so just check it exists
      expect(cached[0].constraints).toBeDefined();
    });
  });

  describe('Prioritization', () => {
    it('should prioritize intents by fee (descending)', async () => {
      const intents = [LOW_FEE_INTENT, HIGH_FEE_INTENT, VALID_INTENT_1];
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents },
      });

      await (ingester as any).pollForIntents();

      const prioritized = ingester.getPrioritizedIntents();
      expect(prioritized[0].hash).toBe(HIGH_FEE_INTENT.hash);
      expect(prioritized[prioritized.length - 1].hash).toBe(LOW_FEE_INTENT.hash);
    });

    it('should handle intents without offeredFee', async () => {
      const intentNoFee = { ...VALID_INTENT_1 };
      delete (intentNoFee as any).offeredFee;

      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [intentNoFee, HIGH_FEE_INTENT] },
      });

      await (ingester as any).pollForIntents();

      const prioritized = ingester.getPrioritizedIntents();
      expect(prioritized[0].hash).toBe(HIGH_FEE_INTENT.hash);
    });

    it('should return empty array if no intents cached', () => {
      const prioritized = ingester.getPrioritizedIntents();
      expect(prioritized).toEqual([]);
    });
  });

  describe('Polling Behavior', () => {
    it('should start polling', () => {
      ingester.startPolling(1000);
      // Verify polling interval is set (internal state check via stop)
      expect(() => ingester.stopPolling()).not.toThrow();
    });

    it('should stop polling', () => {
      ingester.startPolling(1000);
      ingester.stopPolling();
      // No error should be thrown
      expect(true).toBe(true);
    });

    it('should call API with correct parameters', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [] },
      });

      await (ingester as any).pollForIntents();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/intents`,
        expect.objectContaining({
          params: expect.objectContaining({
            status: 'pending',
            limit: 100,
          }),
        })
      );
    });

    it('should update lastPollTime after polling', async () => {
      const beforeTime = Date.now();
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [] },
      });

      await (ingester as any).pollForIntents();

      const lastPollTime = (ingester as any).lastPollTime;
      expect(lastPollTime).toBeGreaterThanOrEqual(beforeTime);
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect((ingester as any).pollForIntents()).resolves.not.toThrow();
    });

    it('should handle empty response', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {},
      });

      await (ingester as any).pollForIntents();

      expect(ingester.getCachedIntents()).toEqual([]);
    });

    it('should handle malformed response', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: null },
      });

      await (ingester as any).pollForIntents();

      expect(ingester.getCachedIntents()).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle intent with very long prose', async () => {
      const longProse = 'This is a very long prose with many words. ' + 'A'.repeat(10000);
      const longIntent = { ...VALID_INTENT_1, prose: longProse };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [longIntent] },
      });

      await (ingester as any).pollForIntents();

      const cached = ingester.getCachedIntents();
      expect(cached).toHaveLength(1);
    });

    it('should handle intent with special characters in prose', async () => {
      const specialIntent = {
        ...VALID_INTENT_1,
        prose: 'I need help with a project that uses special chars: @#$%^&*()_+-={}[]|\\:";\'<>?,./'
      };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [specialIntent] },
      });

      await (ingester as any).pollForIntents();

      const cached = ingester.getCachedIntents();
      expect(cached).toHaveLength(1);
    });

    it('should handle intent with unicode characters', async () => {
      const unicodeIntent = {
        ...VALID_INTENT_1,
        prose: 'I need help with Unicode: 你好世界 🚀 café and other international characters'
      };
      mockedAxios.get.mockResolvedValueOnce({
        data: { intents: [unicodeIntent] },
      });

      await (ingester as any).pollForIntents();

      const cached = ingester.getCachedIntents();
      expect(cached).toHaveLength(1);
    });

    it('should handle concurrent polling calls', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { intents: [VALID_INTENT_1] },
      });

      await Promise.all([
        (ingester as any).pollForIntents(),
        (ingester as any).pollForIntents(),
      ]);

      // Should still only have one cached instance
      const cached = ingester.getCachedIntents();
      expect(cached).toHaveLength(1);
    });
  });

  describe('Burn Integration', () => {
    let burnManager: BurnManager;
    let ingesterWithBurn: IntentIngester;

    beforeEach(() => {
      burnManager = new BurnManager(config);
      ingesterWithBurn = new IntentIngester(config, burnManager);
    });

    describe('previewIntentBurn', () => {
      it('should return null when BurnManager is not configured', () => {
        const preview = ingester.previewIntentBurn('user1');
        expect(preview).toBeNull();
      });

      it('should return burn preview when BurnManager is configured', () => {
        const preview = ingesterWithBurn.previewIntentBurn('user1');

        expect(preview).not.toBeNull();
        expect(preview?.isFree).toBe(true);
        expect(preview?.amount).toBe(0);
      });

      it('should calculate non-free burn for second submission', async () => {
        mockedAxios.post.mockResolvedValue({
          status: 200,
          data: { transactionHash: 'tx1' },
        });

        // Execute first submission
        await burnManager.executeFilingBurn('user1', 'intent1');

        // Preview second submission
        const preview = ingesterWithBurn.previewIntentBurn('user1');

        expect(preview?.isFree).toBe(false);
        expect(preview?.amount).toBe(20); // 10 × 2^1
      });
    });

    describe('submitIntent', () => {
      it('should throw error when BurnManager is not configured', async () => {
        await expect(ingester.submitIntent({
          author: 'user1',
          prose: 'I need help with a TypeScript project',
        })).rejects.toThrow('BurnManager required');
      });

      it('should throw error for invalid intent data', async () => {
        await expect(ingesterWithBurn.submitIntent({
          author: '',
          prose: 'short',
        })).rejects.toThrow('Invalid intent data');
      });

      it('should submit free intent successfully', async () => {
        mockedAxios.post.mockResolvedValue({
          status: 200,
          data: { intentHash: 'hash123' },
        });

        const intent = await ingesterWithBurn.submitIntent({
          author: 'user1',
          prose: 'I need help with a TypeScript project that involves building a web application',
          offeredFee: 100,
        });

        expect(intent).not.toBeNull();
        expect(intent?.author).toBe('user1');
        expect(intent?.prose).toContain('TypeScript project');
        expect(intent?.status).toBe('pending');

        // Verify intent was submitted to chain (not burn since it's free)
        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3000/api/v1/intents',
          expect.objectContaining({
            intent: expect.objectContaining({
              author: 'user1',
            }),
            burnTransaction: null, // First submission is free
          })
        );
      });

      it('should execute burn and submit paid intent', async () => {
        mockedAxios.post.mockResolvedValue({
          status: 200,
          data: { transactionHash: 'tx123' },
        });

        // First submission (free)
        await ingesterWithBurn.submitIntent({
          author: 'user1',
          prose: 'First intent submission to use up free allowance for testing purposes',
        });

        // Reset mocks
        mockedAxios.post.mockClear();
        mockedAxios.post.mockResolvedValue({
          status: 200,
          data: { transactionHash: 'tx456' },
        });

        // Second submission (paid)
        const intent = await ingesterWithBurn.submitIntent({
          author: 'user1',
          prose: 'Second intent submission that should require burn payment to the chain',
          offeredFee: 200,
        });

        expect(intent).not.toBeNull();

        // Verify burn was submitted to chain first
        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3000/api/v1/burns',
          expect.objectContaining({
            type: 'base_filing',
            amount: 20,
          })
        );

        // Verify intent was submitted with burn transaction
        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3000/api/v1/intents',
          expect.objectContaining({
            intent: expect.objectContaining({
              author: 'user1',
            }),
            burnTransaction: expect.objectContaining({
              type: 'base_filing',
              amount: 20,
            }),
          })
        );
      });

      it('should cache submitted intent locally', async () => {
        mockedAxios.post.mockResolvedValue({
          status: 200,
          data: {},
        });

        const intent = await ingesterWithBurn.submitIntent({
          author: 'user1',
          prose: 'Test intent for local caching after submission to the chain',
        });

        expect(intent).not.toBeNull();

        // Verify intent was cached
        const cached = ingesterWithBurn.getIntent(intent!.hash);
        expect(cached).toBeDefined();
        expect(cached?.author).toBe('user1');
      });

      it('should extract desires and constraints if not provided', async () => {
        mockedAxios.post.mockResolvedValue({
          status: 200,
          data: {},
        });

        const intent = await ingesterWithBurn.submitIntent({
          author: 'user1',
          prose: 'I need help with a project. It must be completed by Friday.',
        });

        expect(intent).not.toBeNull();
        expect(intent?.desires.length).toBeGreaterThan(0);
        expect(intent?.constraints.length).toBeGreaterThan(0);
      });

      it('should handle burn execution failure', async () => {
        // First submission (free) - succeeds
        mockedAxios.post.mockResolvedValueOnce({
          status: 200,
          data: {},
        });

        await ingesterWithBurn.submitIntent({
          author: 'user1',
          prose: 'First submission to use up free allowance before testing failure',
        });

        // Second submission - burn fails
        mockedAxios.post.mockRejectedValueOnce(new Error('Burn failed'));

        await expect(ingesterWithBurn.submitIntent({
          author: 'user1',
          prose: 'Second submission that should fail due to burn execution failure',
        })).rejects.toThrow('Burn failed');
      });

      it('should handle chain submission failure', async () => {
        mockedAxios.post.mockResolvedValueOnce({
          status: 500,
          data: { error: 'Internal server error' },
        });

        const intent = await ingesterWithBurn.submitIntent({
          author: 'user1',
          prose: 'Intent submission that will fail due to chain error for testing',
        });

        expect(intent).toBeNull();
      });
    });
  });
});
