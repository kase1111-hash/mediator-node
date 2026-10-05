/**
 * SettlementManager - remaining fee, signing and monitoring branches.
 */

import { SettlementManager } from '../../../src/settlement/SettlementManager';
import { ChainClient } from '../../../src/chain';
import { Intent, MediatorConfig, NegotiationResult, ProposedSettlement } from '../../../src/types';
import { createMockConfig, createMockIntent } from '../../utils/testUtils';

jest.mock('../../../src/chain', () => ({
  ChainClient: {
    fromConfig: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/utils/crypto', () => ({
  generateSignature: jest.fn(),
}));

import { generateSignature } from '../../../src/utils/crypto';
import { logger } from '../../../src/utils/logger';

describe('SettlementManager (extended)', () => {
  let chain: { submitSettlement: jest.Mock; getSettlementStatus: jest.Mock; submitPayout: jest.Mock };
  let negotiation: NegotiationResult;

  const withFees = (feeA?: number, feeB?: number): [Intent, Intent] => [
    { ...createMockIntent({ hash: 'intent_a', author: 'alice' }), offeredFee: feeA },
    { ...createMockIntent({ hash: 'intent_b', author: 'bob' }), offeredFee: feeB },
  ];

  const manager = (overrides: Partial<MediatorConfig> = {}) =>
    new SettlementManager(
      createMockConfig({
        mediatorPublicKey: 'mediator_pub',
        mediatorPrivateKey: 'mediator_priv',
        facilitationFeePercent: 10,
        ...overrides,
      }),
      chain as unknown as ChainClient
    );

  beforeEach(() => {
    chain = {
      submitSettlement: jest.fn().mockResolvedValue({ success: true }),
      getSettlementStatus: jest.fn().mockResolvedValue(null),
      submitPayout: jest.fn().mockResolvedValue({ success: true }),
    };
    (ChainClient.fromConfig as jest.Mock).mockReturnValue(chain);
    (generateSignature as jest.Mock).mockImplementation((_data: string, key: string) => `sig:${key}`);

    negotiation = {
      success: true,
      reasoning: 'aligned',
      proposedTerms: { price: 100 },
      confidenceScore: 0.9,
      modelUsed: 'model',
      promptHash: 'prompt_hash',
    };
  });

  describe('construction', () => {
    it('exposes the injected chain client', () => {
      expect(manager().getChainClient()).toBe(chain);
      expect(ChainClient.fromConfig).not.toHaveBeenCalled();
    });

    it('builds a chain client from config when none is injected', () => {
      const config = createMockConfig();
      const m = new SettlementManager(config);

      expect(ChainClient.fromConfig).toHaveBeenCalledWith(config);
      expect(m.getChainClient()).toBe(chain);
    });
  });

  describe('createSettlement fees and signatures', () => {
    it('charges no facilitation fee when neither intent offers one', () => {
      const [a, b] = withFees(undefined, undefined);

      expect(manager().createSettlement(a, b, negotiation).facilitationFee).toBe(0);
    });

    it('charges a fee on whichever side offers one', () => {
      const [a, b] = withFees(undefined, 20);
      expect(manager().createSettlement(a, b, negotiation).facilitationFee).toBeCloseTo(2);

      const [c, d] = withFees(30, undefined);
      expect(manager().createSettlement(c, d, negotiation).facilitationFee).toBeCloseTo(3);
    });

    it('signs PoA settlements with the mediator key when no authority key is configured', () => {
      const [a, b] = withFees(1, 1);

      const settlement = manager({ consensusMode: 'poa' }).createSettlement(a, b, negotiation);

      expect(generateSignature).toHaveBeenCalledWith(
        `${settlement.id}:intent_a:intent_b:${settlement.timestamp}`,
        'mediator_priv'
      );
      expect(settlement.authoritySignature).toBe('sig:mediator_priv');
      expect(settlement.stakeReference).toBeUndefined();
    });

    it('prefers the PoA authority key over the mediator key', () => {
      const [a, b] = withFees(1, 1);

      const settlement = manager({ consensusMode: 'poa', poaAuthorityKey: 'authority_priv' }).createSettlement(
        a,
        b,
        negotiation
      );

      expect(settlement.authoritySignature).toBe('sig:authority_priv');
    });

    it('does not sign permissionless settlements', () => {
      const [a, b] = withFees(1, 1);

      const settlement = manager({ consensusMode: 'permissionless' }).createSettlement(a, b, negotiation);

      expect(generateSignature).not.toHaveBeenCalled();
      expect(settlement.authoritySignature).toBeUndefined();
    });
  });

  describe('monitorSettlements', () => {
    const activeSettlement = async (
      m: SettlementManager,
      overrides: Partial<ProposedSettlement> = {}
    ): Promise<ProposedSettlement> => {
      const [a, b] = withFees(10, 10);
      const settlement = { ...m.createSettlement(a, b, negotiation), ...overrides };
      await expect(m.submitSettlement(settlement)).resolves.toBe(true);
      return settlement;
    };

    it('keeps waiting while the chain has no status for a live settlement', async () => {
      const m = manager();
      const settlement = await activeSettlement(m);
      chain.getSettlementStatus.mockResolvedValue(null);

      await m.monitorSettlements();

      expect(chain.getSettlementStatus).toHaveBeenCalledWith(settlement.id);
      expect(settlement.status).toBe('proposed');
      expect(settlement.partyAAccepted).toBe(false);
      expect(settlement.partyBAccepted).toBe(false);
      expect(chain.submitPayout).not.toHaveBeenCalled();
      expect(m.getActiveSettlements()).toEqual([settlement]);
    });

    it('records a single-party acceptance without closing the settlement', async () => {
      const m = manager();
      const settlement = await activeSettlement(m);
      chain.getSettlementStatus.mockResolvedValue({ partyAAccepted: false, partyBAccepted: true });

      await m.monitorSettlements();

      expect(settlement.partyAAccepted).toBe(false);
      expect(settlement.partyBAccepted).toBe(true);
      expect(settlement.status).toBe('proposed');
      expect(chain.submitPayout).not.toHaveBeenCalled();
      expect(m.getActiveSettlements()).toEqual([settlement]);
    });

    it('closes and claims the fee for an accepted settlement that has no challenges list', async () => {
      const m = manager();
      const settlement = await activeSettlement(m, { challenges: undefined });
      chain.getSettlementStatus.mockResolvedValue({ partyAAccepted: true, partyBAccepted: true });

      await m.monitorSettlements();

      expect(chain.submitPayout).toHaveBeenCalledWith(settlement.id, settlement.facilitationFee);
      expect(settlement.status).toBe('closed');
      expect(m.getActiveSettlements()).toEqual([]);
    });

    it('does not mark the settlement closed when the payout is refused', async () => {
      const m = manager();
      const settlement = await activeSettlement(m);
      chain.getSettlementStatus.mockResolvedValue({ partyAAccepted: true, partyBAccepted: true });
      chain.submitPayout.mockResolvedValue({ success: false, error: 'escrow locked' });

      await m.monitorSettlements();

      expect(chain.submitPayout).toHaveBeenCalledTimes(1);
      expect(settlement.status).not.toBe('closed');
      expect(logger.error).toHaveBeenCalledWith('Failed to submit payout', {
        settlementId: settlement.id,
        error: 'escrow locked',
      });
    });

    it('keeps a settlement whose payout was refused and retries the payout on the next pass', async () => {
      const m = manager();
      const settlement = await activeSettlement(m);
      chain.getSettlementStatus.mockResolvedValue({ partyAAccepted: true, partyBAccepted: true });
      chain.submitPayout.mockResolvedValueOnce({ success: false, error: 'escrow locked' });

      await m.monitorSettlements();
      expect(m.getActiveSettlements()).toEqual([settlement]);

      await m.monitorSettlements();

      expect(chain.submitPayout).toHaveBeenCalledTimes(2);
      expect(settlement.status).toBe('closed');
      expect(m.getActiveSettlements()).toEqual([]);
    });

    it('keeps an accepted settlement past its deadline when the payout throws, and retries it', async () => {
      const m = manager();
      const settlement = await activeSettlement(m, {
        partyAAccepted: true,
        partyBAccepted: true,
        acceptanceDeadline: Date.now() - 1,
      });
      chain.submitPayout.mockRejectedValueOnce(new Error('chain unavailable'));

      await m.monitorSettlements();
      expect(settlement.status).toBe('proposed');
      expect(m.getActiveSettlements()).toEqual([settlement]);

      await m.monitorSettlements();

      expect(settlement.status).toBe('closed');
      expect(m.getActiveSettlements()).toEqual([]);
    });
  });
});
