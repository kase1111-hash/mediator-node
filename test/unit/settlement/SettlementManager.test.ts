/**
 * Unit Tests for SettlementManager
 *
 * Tests cover:
 * - Settlement creation from negotiation results
 * - Facilitation fee calculation
 * - Consensus mode fields (DPoS, PoA, Hybrid, Permissionless)
 * - Settlement submission to chain
 * - Prose formatting
 * - Settlement monitoring and status updates
 * - Settlement closure and fee claiming
 * - Active settlement tracking
 * - Error handling
 */

import { SettlementManager } from '../../../src/settlement/SettlementManager';
import { BurnManager } from '../../../src/burn/BurnManager';
import { MediatorConfig, Intent, NegotiationResult, ProposedSettlement, ConsensusMode } from '../../../src/types';
import { VALID_INTENT_1, VALID_INTENT_2, VALID_INTENT_3, VALID_INTENT_4 } from '../../fixtures/intents';
import { createMockConfig } from '../../utils/testUtils';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Create mock axios instance that will be returned by axios.create
const mockAxiosInstance = {
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ status: 200, data: {} }),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
};

// Mock fs module for BurnManager
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import * as fs from 'fs';
const mockFs = fs as jest.Mocked<typeof fs>;

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
jest.mock('../../../src/utils/crypto', () => ({
  generateSignature: (data: string, key: string) => `sig_${key}_${data.length}`,
}));

// Mock nanoid
let nanoidCounter = { count: 0 };
jest.mock('nanoid', () => ({
  nanoid: () => `test_settlement_id_${nanoidCounter.count++}`,
}));

describe('SettlementManager', () => {
  let config: MediatorConfig;
  let manager: SettlementManager;
  let mockNegotiationResult: NegotiationResult;

  beforeEach(() => {
    jest.clearAllMocks();
    // Setup axios mock
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
    mockAxiosInstance.get.mockResolvedValue({ data: {} });
    mockAxiosInstance.post.mockResolvedValue({ status: 200, data: {} });
    nanoidCounter.count = 0; // Reset counter for each test

    config = createMockConfig({
      facilitationFeePercent: 2.0,
      acceptanceWindowHours: 72,
      mediatorPublicKey: 'mediator_public_key_123',
      mediatorPrivateKey: 'mediator_private_key_456',
    });

    manager = new SettlementManager(config);

    mockNegotiationResult = {
      success: true,
      reasoning: 'These intents align well for logo design services.',
      proposedTerms: {
        price: 500,
        deliverables: ['Modern logo design', 'Vector files'],
        timelines: '1 week',
      },
      confidenceScore: 85,
      modelUsed: 'claude-3-5-sonnet-20241022',
      promptHash: 'hash_model_prompt_12345',
    };
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(manager).toBeDefined();
      expect(manager.getActiveSettlements()).toEqual([]);
    });

    it('should start with empty active settlements', () => {
      const active = manager.getActiveSettlements();
      expect(active).toHaveLength(0);
    });
  });

  describe('Settlement Creation - Permissionless Mode', () => {
    beforeEach(() => {
      config = createMockConfig({ consensusMode: 'permissionless', facilitationFeePercent: 2.0 });
      manager = new SettlementManager(config);
    });

    it('should create basic settlement from negotiation result', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      expect(settlement).toBeDefined();
      expect(settlement.id).toBe('test_settlement_id_0');
      expect(settlement.intentHashA).toBe(VALID_INTENT_1.hash);
      expect(settlement.intentHashB).toBe(VALID_INTENT_2.hash);
      expect(settlement.reasoningTrace).toBe(mockNegotiationResult.reasoning);
      expect(settlement.proposedTerms).toEqual(mockNegotiationResult.proposedTerms);
      expect(settlement.modelIntegrityHash).toBe(mockNegotiationResult.promptHash);
      expect(settlement.mediatorId).toBe(config.mediatorPublicKey);
      expect(settlement.status).toBe('proposed');
    });

    it('should set acceptance deadline based on config', () => {
      const beforeCreation = Date.now();
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );
      const afterCreation = Date.now();

      const expectedMinDeadline = beforeCreation + (72 * 60 * 60 * 1000);
      const expectedMaxDeadline = afterCreation + (72 * 60 * 60 * 1000);

      expect(settlement.acceptanceDeadline).toBeGreaterThanOrEqual(expectedMinDeadline);
      expect(settlement.acceptanceDeadline).toBeLessThanOrEqual(expectedMaxDeadline);
    });

    it('should calculate facilitation fee correctly', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      const totalFees = (VALID_INTENT_1.offeredFee || 0) + (VALID_INTENT_2.offeredFee || 0);
      const expectedFee = totalFees * (config.facilitationFeePercent / 100);

      expect(settlement.facilitationFee).toBe(expectedFee);
      expect(settlement.facilitationFeePercent).toBe(config.facilitationFeePercent);
    });

    it('should handle intents with zero fees', () => {
      const zeroFeeIntent = { ...VALID_INTENT_1, offeredFee: 0 };
      const settlement = manager.createSettlement(
        zeroFeeIntent,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      const expectedFee = (VALID_INTENT_2.offeredFee || 0) * (config.facilitationFeePercent / 100);
      expect(settlement.facilitationFee).toBe(expectedFee);
    });

    it('should initialize acceptance flags as false', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      expect(settlement.partyAAccepted).toBe(false);
      expect(settlement.partyBAccepted).toBe(false);
    });

    it('should initialize empty challenges array', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      expect(settlement.challenges).toEqual([]);
    });

    it('should not add DPoS fields in permissionless mode', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      expect(settlement.effectiveStake).toBeUndefined();
      expect(settlement.stakeReference).toBeUndefined();
    });

    it('should not add PoA signature in permissionless mode', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      expect(settlement.authoritySignature).toBeUndefined();
    });
  });

  describe('Settlement Creation - DPoS Mode', () => {
    beforeEach(() => {
      config = createMockConfig({ consensusMode: 'dpos', facilitationFeePercent: 1.5 });
      manager = new SettlementManager(config);
    });

    it('should add DPoS fields when provided', () => {
      const effectiveStake = 1000;
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult,
        effectiveStake
      );

      expect(settlement.effectiveStake).toBe(effectiveStake);
      expect(settlement.stakeReference).toBeDefined();
      expect(settlement.stakeReference).toContain('stake:');
      expect(settlement.stakeReference).toContain(config.mediatorPublicKey);
    });

    it('should create stake reference with timestamp', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult,
        500
      );

      expect(settlement.stakeReference).toMatch(/^stake:test-public-key:\d+$/);
    });

    it('should not add PoA signature in DPoS mode', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult,
        1000
      );

      expect(settlement.authoritySignature).toBeUndefined();
    });
  });

  describe('Settlement Creation - PoA Mode', () => {
    beforeEach(() => {
      config = createMockConfig({
        consensusMode: 'poa',
        facilitationFeePercent: 1.0,
        poaAuthorityKey: 'authority_key_789',
      });
      manager = new SettlementManager(config);
    });

    it('should add authority signature in PoA mode', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      expect(settlement.authoritySignature).toBeDefined();
      expect(settlement.authoritySignature).toContain('sig_');
    });

    it('should use PoA authority key for signature', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      expect(settlement.authoritySignature).toContain('authority_key_789');
    });

    it('should not add DPoS fields in PoA mode', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      expect(settlement.effectiveStake).toBeUndefined();
      expect(settlement.stakeReference).toBeUndefined();
    });
  });

  describe('Settlement Creation - Hybrid Mode', () => {
    beforeEach(() => {
      config = createMockConfig({
        consensusMode: 'hybrid',
        facilitationFeePercent: 2.5,
        poaAuthorityKey: 'authority_key_hybrid',
      });
      manager = new SettlementManager(config);
    });

    it('should add both DPoS and PoA fields in hybrid mode', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult,
        2000
      );

      expect(settlement.effectiveStake).toBe(2000);
      expect(settlement.stakeReference).toBeDefined();
      expect(settlement.authoritySignature).toBeDefined();
    });

    it('should use both stake reference and authority signature', () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult,
        1500
      );

      expect(settlement.stakeReference).toContain('stake:');
      expect(settlement.authoritySignature).toContain('sig_');
      expect(settlement.authoritySignature).toContain('authority_key_hybrid');
    });
  });

  describe('Settlement Submission', () => {
    beforeEach(() => {
      config = createMockConfig({ consensusMode: 'permissionless' });
      manager = new SettlementManager(config);
    });

    it('should submit settlement successfully with 200 status', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      const result = await manager.submitSettlement(settlement);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/entries`,
        expect.objectContaining({
          type: 'settlement',
          author: config.mediatorPublicKey,
          content: expect.stringContaining('[PROPOSED SETTLEMENT]'),
          metadata: settlement,
          signature: expect.stringContaining('sig_'),
        })
      );
    });

    it('should submit settlement successfully with 201 status', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 201, data: {} });

      const result = await manager.submitSettlement(settlement);

      expect(result).toBe(true);
    });

    it('should add settlement to active settlements on successful submission', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await manager.submitSettlement(settlement);

      const active = manager.getActiveSettlements();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(settlement.id);
    });

    it('should return false on non-success status', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 400, data: {} });

      const result = await manager.submitSettlement(settlement);

      expect(result).toBe(false);
      expect(manager.getActiveSettlements()).toHaveLength(0);
    });

    it('should handle API errors gracefully', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await manager.submitSettlement(settlement);

      expect(result).toBe(false);
      expect(manager.getActiveSettlements()).toHaveLength(0);
    });

    it('should include signature in submission', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await manager.submitSettlement(settlement);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signature: expect.stringContaining('sig_'),
        })
      );
    });
  });

  describe('Prose Formatting', () => {
    beforeEach(() => {
      config = createMockConfig({ consensusMode: 'permissionless' });
      manager = new SettlementManager(config);
    });

    it('should format settlement as prose entry', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await manager.submitSettlement(settlement);

      const callArgs = mockedAxios.post.mock.calls[0][1] as any;
      const prose = callArgs.content;

      expect(prose).toContain('[PROPOSED SETTLEMENT]');
      expect(prose).toContain(`Settlement ID: ${settlement.id}`);
      expect(prose).toContain(settlement.intentHashA);
      expect(prose).toContain(settlement.intentHashB);
      expect(prose).toContain(settlement.reasoningTrace);
      expect(prose).toContain(`${settlement.facilitationFeePercent}%`);
      expect(prose).toContain(settlement.mediatorId);
    });

    it('should include proposed terms in prose', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await manager.submitSettlement(settlement);

      const callArgs = mockedAxios.post.mock.calls[0][1] as any;
      const prose = callArgs.content;

      expect(prose).toContain('Proposed Terms:');
      expect(prose).toContain('"price": 500');
    });

    it('should include stake reference in prose when present', async () => {
      config = createMockConfig({ consensusMode: 'dpos' });
      manager = new SettlementManager(config);

      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult,
        1000
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await manager.submitSettlement(settlement);

      const callArgs = mockedAxios.post.mock.calls[0][1] as any;
      const prose = callArgs.content;

      expect(prose).toContain('Stake Reference:');
      expect(prose).toContain(settlement.stakeReference);
    });

    it('should include authority signature in prose when present', async () => {
      config = createMockConfig({ consensusMode: 'poa', poaAuthorityKey: 'auth_key' });
      manager = new SettlementManager(config);

      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

      await manager.submitSettlement(settlement);

      const callArgs = mockedAxios.post.mock.calls[0][1] as any;
      const prose = callArgs.content;

      expect(prose).toContain('Authority Signature:');
      expect(prose).toContain(settlement.authoritySignature);
    });
  });

  describe('Settlement Monitoring', () => {
    beforeEach(() => {
      config = createMockConfig({ consensusMode: 'permissionless' });
      manager = new SettlementManager(config);
    });

    it('should check settlement status on chain', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: false,
          partyBAccepted: false,
          challenges: [],
        },
      });

      await manager.monitorSettlements();

      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${config.chainEndpoint}/api/v1/settlements/${settlement.id}/status`
      );
    });

    it('should update settlement when Party A accepts', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: false,
          challenges: [],
        },
      });

      await manager.monitorSettlements();

      const active = manager.getActiveSettlements();
      expect(active[0].partyAAccepted).toBe(true);
      expect(active[0].partyBAccepted).toBe(false);
    });

    it('should update settlement when Party B accepts', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: false,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await manager.monitorSettlements();

      const active = manager.getActiveSettlements();
      expect(active[0].partyAAccepted).toBe(false);
      expect(active[0].partyBAccepted).toBe(true);
    });

    it('should update challenges array', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      const mockChallenges = [
        {
          id: 'challenge_1',
          settlementId: settlement.id,
          challengerId: 'challenger_456',
          contradictionProof: 'proof_pending',
          paraphraseEvidence: 'evidence_pending',
          timestamp: Date.now(),
          status: 'pending' as const
        },
      ];

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: false,
          partyBAccepted: false,
          challenges: mockChallenges,
        },
      });

      await manager.monitorSettlements();

      const active = manager.getActiveSettlements();
      expect(active[0].challenges).toEqual(mockChallenges);
    });

    it('should close settlement when both parties accept', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await manager.monitorSettlements();

      expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Submit + payout
      expect(manager.getActiveSettlements()).toHaveLength(0);
    });

    it('should mark settlement as rejected if expired without acceptance', async () => {
      const pastDeadline = Date.now() - 1000; // 1 second ago
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );
      settlement.acceptanceDeadline = pastDeadline;

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      await manager.monitorSettlements();

      expect(manager.getActiveSettlements()).toHaveLength(0);
    });

    it('should close settlement even if deadline passed when both accepted', async () => {
      const pastDeadline = Date.now() - 1000;
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );
      settlement.acceptanceDeadline = pastDeadline;
      settlement.partyAAccepted = true;
      settlement.partyBAccepted = true;

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      await manager.monitorSettlements();

      expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Submit + payout
    });

    it('should handle monitoring errors gracefully', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(manager.monitorSettlements()).resolves.not.toThrow();
      expect(manager.getActiveSettlements()).toHaveLength(1); // Still active
    });
  });

  describe('Settlement Closure', () => {
    beforeEach(() => {
      config = createMockConfig({ consensusMode: 'permissionless' });
      manager = new SettlementManager(config);
    });

    it('should create payout entry when closing', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await manager.monitorSettlements();

      const payoutCall = mockedAxios.post.mock.calls[1];
      const payoutData = payoutCall[1] as any;
      expect(payoutData.type).toBe('payout');
      expect(payoutData.metadata.settlementId).toBe(settlement.id);
      expect(payoutData.metadata.amount).toBe(settlement.facilitationFee);
    });

    it('should forfeit fee if settlement has upheld challenges', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );
      settlement.challenges = [
        {
          id: 'challenge_1',
          settlementId: settlement.id,
          challengerId: 'challenger_123',
          contradictionProof: 'proof_data',
          paraphraseEvidence: 'evidence_data',
          timestamp: Date.now(),
          status: 'upheld' as const
        },
      ];

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [{ id: 'challenge_1', status: 'upheld', reason: 'Invalid terms' }],
        },
      });

      await manager.monitorSettlements();

      // Should not create payout entry
      expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Only submit, no payout
    });

    it('should proceed with closure if challenges are rejected', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [{
            id: 'challenge_1',
            settlementId: settlement.id,
            challengerId: 'challenger_789',
            contradictionProof: 'proof_rejected',
            paraphraseEvidence: 'evidence_rejected',
            timestamp: Date.now(),
            status: 'rejected' as const
          }],
        },
      });

      await manager.monitorSettlements();

      expect(mockedAxios.post).toHaveBeenCalledTimes(2); // Submit + payout
    });

    it('should handle closure errors gracefully', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValueOnce({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      mockedAxios.post.mockRejectedValueOnce(new Error('Payout failed'));

      await expect(manager.monitorSettlements()).resolves.not.toThrow();
    });
  });

  describe('Active Settlement Management', () => {
    beforeEach(() => {
      config = createMockConfig({ consensusMode: 'permissionless' });
      manager = new SettlementManager(config);
    });

    it('should track multiple active settlements', async () => {
      const settlement1 = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      const settlement2 = manager.createSettlement(
        VALID_INTENT_3,
        VALID_INTENT_4,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement1);
      await manager.submitSettlement(settlement2);

      const active = manager.getActiveSettlements();
      expect(active).toHaveLength(2);
      expect(active.map(s => s.id)).toContain(settlement1.id);
      expect(active.map(s => s.id)).toContain(settlement2.id);
    });

    it('should remove settlement from active when closed', async () => {
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await manager.submitSettlement(settlement);

      expect(manager.getActiveSettlements()).toHaveLength(1);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await manager.monitorSettlements();

      expect(manager.getActiveSettlements()).toHaveLength(0);
    });

    it('should return empty array when no active settlements', () => {
      const active = manager.getActiveSettlements();
      expect(active).toEqual([]);
      expect(Array.isArray(active)).toBe(true);
    });
  });

  describe('Burn Integration', () => {
    let burnManager: BurnManager;
    let managerWithBurn: SettlementManager;

    beforeEach(() => {
      // Reset fs mocks
      mockFs.existsSync.mockReturnValue(false);
      mockFs.mkdirSync.mockImplementation(() => undefined);
      mockFs.readFileSync.mockReturnValue('{}');
      mockFs.writeFileSync.mockImplementation(() => undefined);

      config = createMockConfig({
        consensusMode: 'permissionless',
        facilitationFeePercent: 2.0,
        successBurnPercentage: 0.0005, // 0.05% as decimal
      });

      burnManager = new BurnManager(config);
      managerWithBurn = new SettlementManager(config, burnManager);
    });

    it('should execute success burn when settlement closes', async () => {
      const settlement = managerWithBurn.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      // Calculate expected values
      // facilitationFee = totalFees × facilitationFeePercent
      // settlementValue = facilitationFee / (facilitationFeePercent / 100)
      const totalFees = (VALID_INTENT_1.offeredFee || 0) + (VALID_INTENT_2.offeredFee || 0);
      const expectedSettlementValue = totalFees;
      const expectedBurnAmount = expectedSettlementValue * (config.successBurnPercentage || 0.0005);

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await managerWithBurn.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await managerWithBurn.monitorSettlements();

      // Should have submit + burn + payout calls
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);

      // Verify burn was executed
      const burnCall = mockedAxios.post.mock.calls[1];
      expect(burnCall[0]).toContain('/burns');
      const burnData = burnCall[1] as any;
      expect(burnData.type).toBe('success');
      expect(burnData.amount).toBeCloseTo(expectedBurnAmount, 2);
      expect(burnData.settlementId).toBe(settlement.id);
    });

    it('should not execute burn when BurnManager is not provided', async () => {
      const managerNoBurn = new SettlementManager(config);
      const settlement = managerNoBurn.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await managerNoBurn.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await managerNoBurn.monitorSettlements();

      // Should only have submit + payout (no burn)
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
      const calls = mockedAxios.post.mock.calls;
      expect(calls[0][0]).toContain('/entries'); // Submit
      expect(calls[1][0]).toContain('/entries'); // Payout
    });

    it('should not fail settlement closure if burn execution fails', async () => {
      const settlement = managerWithBurn.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      // Mock burn to fail
      mockedAxios.post
        .mockResolvedValueOnce({ status: 200, data: {} })  // Submit settlement
        .mockRejectedValueOnce(new Error('Burn failed'))    // Burn fails
        .mockResolvedValueOnce({ status: 200, data: {} });  // Payout succeeds

      await managerWithBurn.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      // Should not throw
      await expect(managerWithBurn.monitorSettlements()).resolves.not.toThrow();

      // Settlement should still close (payout should be attempted)
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should not execute burn when settlement value is zero', async () => {
      const zeroFeeIntent1 = { ...VALID_INTENT_1, offeredFee: 0 };
      const zeroFeeIntent2 = { ...VALID_INTENT_2, offeredFee: 0 };

      const settlement = managerWithBurn.createSettlement(
        zeroFeeIntent1,
        zeroFeeIntent2,
        mockNegotiationResult
      );

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await managerWithBurn.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await managerWithBurn.monitorSettlements();

      // Should only have submit + payout (no burn for zero value)
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should not execute burn when settlement has upheld challenges', async () => {
      const settlement = managerWithBurn.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );
      settlement.challenges = [
        {
          id: 'challenge_1',
          settlementId: settlement.id,
          challengerId: 'challenger_123',
          contradictionProof: 'proof_data',
          paraphraseEvidence: 'evidence_data',
          timestamp: Date.now(),
          status: 'upheld' as const,
        },
      ];

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await managerWithBurn.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [{ id: 'challenge_1', status: 'upheld' }],
        },
      });

      await managerWithBurn.monitorSettlements();

      // Should only have submit (no burn, no payout)
      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    });

    it('should calculate settlement value correctly from facilitation fee', async () => {
      // Set specific fee percentage for clear calculation
      config.facilitationFeePercent = 10.0; // 10%
      const testManager = new SettlementManager(config, burnManager);

      const settlement = testManager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      // totalFees = 100 + 150 = 250
      // facilitationFee = 250 × 0.1 = 25
      // settlementValue = 25 / 0.1 = 250
      // burn = 250 × 0.0005 = 0.125

      mockedAxios.post.mockResolvedValue({ status: 200, data: {} });
      await testManager.submitSettlement(settlement);

      mockedAxios.get.mockResolvedValue({
        data: {
          partyAAccepted: true,
          partyBAccepted: true,
          challenges: [],
        },
      });

      await testManager.monitorSettlements();

      // Verify burn calculation
      const burnCall = mockedAxios.post.mock.calls[1];
      const burnData = burnCall[1] as any;
      const totalFees = (VALID_INTENT_1.offeredFee || 0) + (VALID_INTENT_2.offeredFee || 0);
      const expectedBurnAmount = totalFees * (config.successBurnPercentage || 0.0005);

      expect(burnData.amount).toBeCloseTo(expectedBurnAmount, 2);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      config = createMockConfig({ consensusMode: 'permissionless' });
      manager = new SettlementManager(config);
    });

    it('should handle very high facilitation fee percentage', () => {
      config = createMockConfig({ facilitationFeePercent: 50.0 });
      manager = new SettlementManager(config);

      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      const totalFees = (VALID_INTENT_1.offeredFee || 0) + (VALID_INTENT_2.offeredFee || 0);
      const expectedFee = totalFees * 0.5;

      expect(settlement.facilitationFee).toBe(expectedFee);
    });

    it('should handle zero facilitation fee percentage', () => {
      config = createMockConfig({ facilitationFeePercent: 0 });
      manager = new SettlementManager(config);

      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      expect(settlement.facilitationFee).toBe(0);
    });

    it('should handle very short acceptance window', () => {
      config = createMockConfig({ acceptanceWindowHours: 1 });
      manager = new SettlementManager(config);

      const beforeCreation = Date.now();
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      const expectedDeadline = beforeCreation + (1 * 60 * 60 * 1000);
      expect(settlement.acceptanceDeadline).toBeGreaterThanOrEqual(expectedDeadline);
      expect(settlement.acceptanceDeadline).toBeLessThan(expectedDeadline + 1000);
    });

    it('should handle very long acceptance window', () => {
      config = createMockConfig({ acceptanceWindowHours: 168 }); // 1 week
      manager = new SettlementManager(config);

      const beforeCreation = Date.now();
      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        mockNegotiationResult
      );

      const expectedDeadline = beforeCreation + (168 * 60 * 60 * 1000);
      expect(settlement.acceptanceDeadline).toBeGreaterThanOrEqual(expectedDeadline);
    });

    it('should handle empty proposed terms', () => {
      const emptyTermsResult = {
        ...mockNegotiationResult,
        proposedTerms: {},
      };

      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        emptyTermsResult
      );

      expect(settlement.proposedTerms).toEqual({});
    });

    it('should handle very long reasoning trace', () => {
      const longReasoningResult = {
        ...mockNegotiationResult,
        reasoning: 'A'.repeat(10000),
      };

      const settlement = manager.createSettlement(
        VALID_INTENT_1,
        VALID_INTENT_2,
        longReasoningResult
      );

      expect(settlement.reasoningTrace).toHaveLength(10000);
    });
  });
});
