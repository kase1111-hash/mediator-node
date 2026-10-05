/**
 * ChallengeManager - submission edge cases, polling cadence, status
 * transitions, reputation updates and challenge prose formatting.
 */

import { ChallengeManager } from '../../../src/challenge/ChallengeManager';
import { ReputationTracker } from '../../../src/reputation/ReputationTracker';
import { ChainClient } from '../../../src/chain';
import {
  Challenge,
  ContradictionAnalysis,
  MediatorConfig,
  ProposedSettlement,
} from '../../../src/types';
import { createMockConfig } from '../../utils/testUtils';

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

import { logger } from '../../../src/utils/logger';

const T0 = new Date('2026-01-01T00:00:00.000Z').getTime();

describe('ChallengeManager (extended)', () => {
  let config: MediatorConfig;
  let chain: { submitChallenge: jest.Mock; getChallengeStatus: jest.Mock };
  let tracker: { recordFailedChallenge: jest.Mock };
  let settlement: ProposedSettlement;
  let analysis: ContradictionAnalysis;

  const managerWithTracker = (cfg: MediatorConfig = config) =>
    new ChallengeManager(
      cfg,
      tracker as unknown as ReputationTracker,
      chain as unknown as ChainClient
    );

  const managerWithoutTracker = (cfg: MediatorConfig = config) =>
    new ChallengeManager(cfg, undefined, chain as unknown as ChainClient);

  const submit = async (manager: ChallengeManager, settlementId = settlement.id) => {
    const result = await manager.submitChallenge({ ...settlement, id: settlementId }, analysis);
    expect(result.success).toBe(true);
    return result.challengeId!;
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });

    chain = {
      submitChallenge: jest.fn().mockResolvedValue({ success: true }),
      getChallengeStatus: jest.fn().mockResolvedValue(null),
    };
    tracker = { recordFailedChallenge: jest.fn().mockResolvedValue(undefined) };
    (ChainClient.fromConfig as jest.Mock).mockReturnValue(chain);

    config = createMockConfig({
      mediatorPublicKey: 'challenger-key',
      challengeCheckInterval: 30000,
    });

    settlement = {
      id: 'settlement-1',
      intentHashA: 'intent-a',
      intentHashB: 'intent-b',
      reasoningTrace: 'reasoning',
      proposedTerms: { price: 900 },
      facilitationFee: 9,
      facilitationFeePercent: 1,
      modelIntegrityHash: 'hash',
      mediatorId: 'target-mediator',
      timestamp: T0,
      status: 'proposed',
      acceptanceDeadline: T0 + 72 * 3600 * 1000,
      partyAAccepted: false,
      partyBAccepted: false,
      challenges: [],
    };

    analysis = {
      hasContradiction: true,
      confidence: 0.912,
      violatedConstraints: ['budget $500 maximum', 'delivery by Friday'],
      contradictionProof: 'Price of $900 exceeds the $500 budget',
      paraphraseEvidence: 'Alice capped spend at $500; the settlement asks $900',
      affectedParty: 'A',
      severity: 'severe',
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('uses an injected chain client instead of building one from config', async () => {
      const manager = managerWithTracker();
      await manager.submitChallenge(settlement, analysis);

      expect(ChainClient.fromConfig).not.toHaveBeenCalled();
      expect(chain.submitChallenge).toHaveBeenCalledTimes(1);
    });

    it('builds a chain client from config when none is injected', async () => {
      const manager = new ChallengeManager(config);
      await manager.submitChallenge(settlement, analysis);

      expect(ChainClient.fromConfig).toHaveBeenCalledWith(config);
      expect(chain.submitChallenge).toHaveBeenCalledTimes(1);
    });
  });

  describe('submitChallenge', () => {
    it('sends a pending challenge carrying the analysis evidence and tracks it', async () => {
      const manager = managerWithTracker();

      const result = await manager.submitChallenge(settlement, analysis);

      const sent: Challenge = chain.submitChallenge.mock.calls[0][0];
      expect(sent).toEqual({
        id: result.challengeId,
        settlementId: 'settlement-1',
        challengerId: 'challenger-key',
        contradictionProof: analysis.contradictionProof,
        paraphraseEvidence: analysis.paraphraseEvidence,
        timestamp: T0,
        status: 'pending',
      });
      expect(result).toEqual({ success: true, challengeId: sent.id, timestamp: T0 });
      expect(manager.getSubmittedChallenges()).toEqual([
        {
          challengeId: sent.id,
          settlementId: 'settlement-1',
          targetMediatorId: 'target-mediator',
          submittedAt: T0,
          status: 'pending',
          contradictionAnalysis: analysis,
          lastChecked: T0,
        },
      ]);
    });

    it('generates a distinct id for each challenge', async () => {
      const manager = managerWithTracker();

      const first = await submit(manager, 's-1');
      const second = await submit(manager, 's-2');

      expect(first).not.toBe(second);
      expect(manager.getSubmittedChallenges()).toHaveLength(2);
    });

    it('reports a generic error when the chain rejects without a reason', async () => {
      chain.submitChallenge.mockResolvedValue({ success: false });
      const manager = managerWithTracker();

      const result = await manager.submitChallenge(settlement, analysis);

      expect(result).toEqual({ success: false, error: 'Challenge submission failed', timestamp: T0 });
      expect(result.challengeId).toBeUndefined();
      expect(manager.getSubmittedChallenges()).toEqual([]);
    });

    it('passes through the chain error message on failure', async () => {
      chain.submitChallenge.mockResolvedValue({ success: false, error: 'Secret detected in challenge' });
      const manager = managerWithTracker();

      const result = await manager.submitChallenge(settlement, analysis);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Secret detected in challenge');
      expect(logger.warn).toHaveBeenCalledWith('Challenge submission failed', expect.any(Object));
    });

    it('reports "Unknown error" when the chain throws a non-Error value', async () => {
      chain.submitChallenge.mockRejectedValue('socket hang up');
      const manager = managerWithTracker();

      const result = await manager.submitChallenge(settlement, analysis);

      expect(result).toEqual({ success: false, error: 'Unknown error', timestamp: T0 });
      expect(manager.getSubmittedChallenges()).toEqual([]);
    });
  });

  describe('monitorChallenges polling cadence', () => {
    it('does not poll a challenge again before the check interval has elapsed', async () => {
      const manager = managerWithTracker();
      await submit(manager);

      jest.setSystemTime(T0 + 29999);
      await manager.monitorChallenges();
      expect(chain.getChallengeStatus).not.toHaveBeenCalled();

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();
      expect(chain.getChallengeStatus).toHaveBeenCalledTimes(1);
    });

    it('defaults the check interval to 60s when not configured', async () => {
      const cfg = createMockConfig();
      delete cfg.challengeCheckInterval;
      const manager = managerWithTracker(cfg);
      await submit(manager);

      jest.setSystemTime(T0 + 59999);
      await manager.monitorChallenges();
      expect(chain.getChallengeStatus).not.toHaveBeenCalled();

      jest.setSystemTime(T0 + 60000);
      await manager.monitorChallenges();
      expect(chain.getChallengeStatus).toHaveBeenCalledTimes(1);
    });

    it('keeps a still-pending challenge tracked and waits a full interval before re-polling', async () => {
      chain.getChallengeStatus.mockResolvedValue({ status: 'pending' });
      const manager = managerWithTracker();
      const id = await submit(manager);

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();

      expect(chain.getChallengeStatus).toHaveBeenCalledWith(id);
      expect(manager.getSubmittedChallenges()[0]).toMatchObject({
        status: 'pending',
        lastChecked: T0 + 30000,
      });
      expect(tracker.recordFailedChallenge).not.toHaveBeenCalled();

      jest.setSystemTime(T0 + 45000);
      await manager.monitorChallenges();
      expect(chain.getChallengeStatus).toHaveBeenCalledTimes(1);
    });

    it('leaves the challenge pending when the chain has no status for it', async () => {
      chain.getChallengeStatus.mockResolvedValue(null);
      const manager = managerWithTracker();
      await submit(manager);

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();

      expect(manager.getSubmittedChallenges()).toHaveLength(1);
      expect(manager.getSubmittedChallenges()[0].status).toBe('pending');
      expect(tracker.recordFailedChallenge).not.toHaveBeenCalled();
    });

    it('ignores a status payload without a status field', async () => {
      chain.getChallengeStatus.mockResolvedValue({});
      const manager = managerWithTracker();
      await submit(manager);

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();

      expect(manager.getSubmittedChallenges()[0].status).toBe('pending');
    });

    it('keeps monitoring the remaining challenges when one lookup fails', async () => {
      const manager = managerWithTracker();
      const failing = await submit(manager, 's-fail');
      const rejected = await submit(manager, 's-rejected');
      chain.getChallengeStatus.mockImplementation(async (id: string) => {
        if (id === failing) throw new Error('timeout');
        return { status: 'rejected' };
      });

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();

      expect(logger.error).toHaveBeenCalledWith(
        'Error monitoring challenge',
        expect.objectContaining({ challengeId: failing })
      );
      expect(tracker.recordFailedChallenge).toHaveBeenCalledWith(rejected);
      expect(manager.getSubmittedChallenges().map(c => c.challengeId)).toEqual([failing]);
    });
  });

  describe('resolution and reputation', () => {
    it('records a failed challenge against our reputation when rejected, then stops tracking it', async () => {
      chain.getChallengeStatus.mockResolvedValue({ status: 'rejected' });
      const manager = managerWithTracker();
      const id = await submit(manager);

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();

      expect(tracker.recordFailedChallenge).toHaveBeenCalledTimes(1);
      expect(tracker.recordFailedChallenge).toHaveBeenCalledWith(id);
      expect(manager.getChallengesForSettlement(settlement.id)).toEqual([]);

      // Not polled again once resolved
      jest.setSystemTime(T0 + 120000);
      await manager.monitorChallenges();
      expect(chain.getChallengeStatus).toHaveBeenCalledTimes(1);
    });

    it('does not penalise our reputation when the challenge is upheld', async () => {
      chain.getChallengeStatus.mockResolvedValue({ status: 'upheld' });
      const manager = managerWithTracker();
      await submit(manager);

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();

      expect(tracker.recordFailedChallenge).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Challenge upheld successfully',
        expect.objectContaining({ targetMediator: 'target-mediator' })
      );
      expect(manager.getSubmittedChallenges()).toEqual([]);
    });

    it('with a reputation tracker, still counts resolved challenges in stats after they stop being tracked', async () => {
      const manager = managerWithTracker();
      const upheld = await submit(manager, 's-upheld');
      const rejected = await submit(manager, 's-rejected');
      await submit(manager, 's-pending');
      chain.getChallengeStatus.mockImplementation(async (id: string) => {
        if (id === upheld) return { status: 'upheld' };
        if (id === rejected) return { status: 'rejected' };
        return { status: 'pending' };
      });

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();

      expect(manager.getSubmittedChallenges()).toHaveLength(1);
      expect(manager.getChallengeStats()).toEqual({
        total: 3,
        pending: 1,
        upheld: 1,
        rejected: 1,
        successRate: 50,
      });
    });

    it('without a reputation tracker, keeps resolved challenges tracked so stats reflect outcomes', async () => {
      const manager = managerWithoutTracker();
      const upheld = await submit(manager, 's-upheld');
      const rejected = await submit(manager, 's-rejected');
      await submit(manager, 's-pending');
      chain.getChallengeStatus.mockImplementation(async (id: string) => {
        if (id === upheld) return { status: 'upheld' };
        if (id === rejected) return { status: 'rejected' };
        return { status: 'pending' };
      });

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();

      expect(logger.warn).toHaveBeenCalledWith('No reputation tracker available for challenge resolution');
      expect(manager.getChallengeStats()).toEqual({
        total: 3,
        pending: 1,
        upheld: 1,
        rejected: 1,
        successRate: 50,
      });
    });

    it('handles a resolution only once (on the pending -> resolved transition)', async () => {
      const manager = managerWithoutTracker();
      await submit(manager);
      chain.getChallengeStatus.mockResolvedValue({ status: 'upheld' });

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();
      jest.setSystemTime(T0 + 60000);
      await manager.monitorChallenges();

      const transitions = (logger.info as jest.Mock).mock.calls.filter(
        ([msg]) => msg === 'Challenge status changed'
      );
      expect(transitions).toHaveLength(1);
      expect(transitions[0][1]).toMatchObject({ oldStatus: 'pending', newStatus: 'upheld' });
      expect(manager.getSubmittedChallenges()[0].status).toBe('upheld');
    });
  });

  describe('queries', () => {
    it('returns only the challenges for the requested settlement', async () => {
      const manager = managerWithTracker();
      await submit(manager, 's-1');
      await submit(manager, 's-2');
      await submit(manager, 's-1');

      expect(manager.getChallengesForSettlement('s-1')).toHaveLength(2);
      expect(manager.getChallengesForSettlement('s-2')).toHaveLength(1);
      expect(manager.getChallengesForSettlement('s-3')).toEqual([]);
    });

    it('reports a 100% success rate when every resolved challenge was upheld', async () => {
      const manager = managerWithoutTracker();
      await submit(manager, 's-1');
      await submit(manager, 's-2');
      chain.getChallengeStatus.mockResolvedValue({ status: 'upheld' });

      jest.setSystemTime(T0 + 30000);
      await manager.monitorChallenges();

      expect(manager.getChallengeStats()).toMatchObject({ total: 2, upheld: 2, rejected: 0, successRate: 100 });
    });
  });

  describe('formatChallengeAsProse', () => {
    // Private helper that renders a challenge as a chain prose entry.
    const format = (manager: ChallengeManager, a: ContradictionAnalysis) => {
      const challenge: Challenge = {
        id: 'challenge-xyz',
        settlementId: settlement.id,
        challengerId: 'challenger-key',
        contradictionProof: a.contradictionProof,
        paraphraseEvidence: a.paraphraseEvidence,
        timestamp: T0,
        status: 'pending',
      };
      return (manager as any).formatChallengeAsProse(challenge, settlement, a) as string;
    };

    it('renders identifiers, severity, confidence, numbered constraints and evidence', () => {
      const prose = format(managerWithTracker(), analysis);

      expect(prose.startsWith('[CHALLENGE SUBMISSION]')).toBe(true);
      expect(prose).toContain('Challenge ID: challenge-xyz');
      expect(prose).toContain('Settlement ID: settlement-1');
      expect(prose).toContain('Challenger: challenger-key');
      expect(prose).toContain('Target Mediator: target-mediator');
      expect(prose).toContain('Timestamp: 2026-01-01T00:00:00.000Z');
      expect(prose).toContain('SEVERITY: SEVERE');
      expect(prose).toContain('AFFECTED PARTY: Party A');
      expect(prose).toContain('CONFIDENCE: 91.2%');
      expect(prose).toContain('1. budget $500 maximum\n2. delivery by Friday\n');
      expect(prose).toContain(`CONTRADICTION PROOF:\n${analysis.contradictionProof}`);
      expect(prose).toContain(`PARAPHRASE EVIDENCE:\n${analysis.paraphraseEvidence}`);
    });

    it.each([
      ['B', 'Party B'],
      ['both', 'both parties'],
    ] as const)('describes affected party %s as "%s"', (party, label) => {
      const prose = format(managerWithTracker(), { ...analysis, affectedParty: party, severity: 'minor' });

      expect(prose).toContain(`AFFECTED PARTY: ${label}`);
      expect(prose).toContain('SEVERITY: MINOR');
    });
  });
});
