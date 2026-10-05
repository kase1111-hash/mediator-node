/**
 * Extended transformer tests: optional/missing fields, defensive handling of
 * malformed input, status mapping and the prose extraction heuristics.
 */

import {
  NatLangChainContract,
  NatLangChainEntry,
  burnToEntry,
  challengeToEntry,
  contractToSettlement,
  entryToIntent,
  intentToEntry,
  parseIntentsFromResponse,
  settlementToContractProposal,
  settlementToEntry,
} from '../../../src/chain/transformers';
import { Challenge, Intent, ProposedSettlement } from '../../../src/types';
import { generateIntentHash } from '../../../src/utils/crypto';
import { logger } from '../../../src/utils/logger';

const HOURS_72 = 72 * 60 * 60 * 1000;

const SETTLEMENT: ProposedSettlement = {
  id: 'settlement-1',
  intentHashA: 'hash-a',
  intentHashB: 'hash-b',
  reasoningTrace: 'Both parties want a logo delivered within a week.',
  proposedTerms: { price: 400, deliverables: ['Logo'], timelines: '1 week' },
  facilitationFee: 20,
  facilitationFeePercent: 5,
  modelIntegrityHash: 'model-hash-1',
  mediatorId: 'mediator-1',
  timestamp: 1_700_000_000_000,
  status: 'proposed',
  acceptanceDeadline: Date.UTC(2023, 10, 17, 22, 13, 20),
};

describe('NatLangChain transformers (extended)', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ==========================================================================
  // entryToIntent
  // ==========================================================================

  describe('entryToIntent', () => {
    describe('intent hash', () => {
      const entry: NatLangChainEntry = {
        content: 'I need a bakery logo.',
        author: 'alice',
        intent: 'logo',
        timestamp: 1_700_000_000_000,
      };

      it('derives the hash from content, author and timestamp when metadata has none', () => {
        const intent = entryToIntent({ ...entry, metadata: { branch: 'Design' } });

        expect(intent.hash).toBe(generateIntentHash(entry.content, entry.author, 1_700_000_000_000));
        expect(intent.hash).toMatch(/^[0-9a-f]{64}$/);
      });

      it('is deterministic: the same entry maps to the same hash regardless of when it is read', () => {
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1);
        const first = entryToIntent({ ...entry }).hash;
        nowSpy.mockReturnValue(999_999_999);
        const second = entryToIntent(JSON.parse(JSON.stringify(entry))).hash;
        const third = entryToIntent({ ...entry }).hash;

        expect(second).toBe(first);
        expect(third).toBe(first);
      });

      it('gives different entries different hashes', () => {
        const base = entryToIntent(entry).hash;

        expect(entryToIntent({ ...entry, content: 'I need a cafe logo.' }).hash).not.toBe(base);
        expect(entryToIntent({ ...entry, author: 'bob' }).hash).not.toBe(base);
        expect(entryToIntent({ ...entry, timestamp: entry.timestamp! + 1 }).hash).not.toBe(base);
      });

      it('prefers the hash recorded in metadata', () => {
        expect(entryToIntent({ ...entry, metadata: { hash: 'on-chain-hash' } }).hash).toBe('on-chain-hash');
      });

      it('keeps the hash stable for an entry with no timestamp across reads', () => {
        const { timestamp: _omit, ...untimed } = entry;
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1);
        const first = entryToIntent({ ...untimed }).hash;
        nowSpy.mockReturnValue(999_999_999);

        expect(entryToIntent({ ...untimed }).hash).toBe(first);
      });
    });

    it('uses the current time when the entry has no timestamp', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_234_567);

      const intent = entryToIntent({
        content: 'Offering bookkeeping services.',
        author: 'carol',
        intent: 'offer',
        metadata: { hash: 'h-1' },
      });

      expect(intent.timestamp).toBe(1_234_567);
    });

    it('passes offered fee, branch and flag count through from metadata', () => {
      const intent = entryToIntent({
        content: 'Offering bookkeeping services.',
        author: 'carol',
        intent: 'offer',
        timestamp: 10,
        metadata: { hash: 'h-1', offered_fee: 7.5, branch: 'Finance/Accounting', flag_count: 3 },
      });

      expect(intent).toMatchObject({ offeredFee: 7.5, branch: 'Finance/Accounting', flagCount: 3 });
    });

    it('defaults optional fields when metadata is absent', () => {
      const intent = entryToIntent({ content: 'Offering bookkeeping.', author: 'carol', intent: 'offer', timestamp: 10 });

      expect(intent.offeredFee).toBeUndefined();
      expect(intent.branch).toBeUndefined();
      expect(intent.flagCount).toBe(0);
      expect(intent.status).toBe('pending');
    });

    describe('desires', () => {
      it('uses metadata desires verbatim, skipping extraction', () => {
        const intent = entryToIntent({
          content: 'I want a logo.',
          author: 'a',
          intent: 'logo',
          timestamp: 1,
          metadata: { desires: ['explicit desire'] },
        });

        expect(intent.desires).toEqual(['explicit desire']);
      });

      it('puts the trimmed intent field first, followed by phrases extracted from the prose in pattern order', () => {
        const intent = entryToIntent({
          content: 'I want a logo, we are looking for a mentor. Seeking a copywriter',
          author: 'a',
          intent: '  branding  ',
          timestamp: 1,
        });

        expect(intent.desires).toEqual(['branding', 'a logo', 'a mentor', 'a copywriter']);
      });

      it.each(['need', 'seek', 'require', 'am looking for'])('recognises "I %s ..." phrasing', verb => {
        const intent = entryToIntent({ content: `I ${verb} a translator.`, author: 'a', intent: '', timestamp: 1 });

        expect(intent.desires).toContain('a translator');
      });

      it('falls back to "general collaboration" when nothing can be extracted', () => {
        const intent = entryToIntent({ content: 'Hello chain.', author: 'a', intent: '   ', timestamp: 1 });

        expect(intent.desires).toEqual(['general collaboration']);
      });
    });

    describe('constraints', () => {
      it('uses metadata constraints verbatim, skipping extraction', () => {
        const intent = entryToIntent({
          content: 'It must be vector.',
          author: 'a',
          intent: 'logo',
          timestamp: 1,
          metadata: { constraints: ['explicit constraint'] },
        });

        expect(intent.constraints).toEqual(['explicit constraint']);
      });

      it('extracts must/cannot/requires phrases from the prose', () => {
        const intent = entryToIntent({
          content:
            'The logo must be vector, it must have a transparent background. We won\'t accept raster files. Requires a style guide.',
          author: 'a',
          intent: 'logo',
          timestamp: 1,
        });

        expect(intent.constraints).toEqual([
          'vector',
          'a transparent background',
          'accept raster files',
          'a style guide',
        ]);
      });

      it.each([
        ['must include', 'The bid must include tax.', 'tax'],
        ['cannot', 'We cannot travel.', 'travel'],
        ['will not', 'I will not sign an NDA.', 'sign an NDA'],
        ['require', 'Projects require approval.', 'approval'],
      ])('recognises "%s" phrasing', (_label, content, expected) => {
        expect(entryToIntent({ content, author: 'a', intent: 'x', timestamp: 1 }).constraints).toContain(expected);
      });

      it('returns no constraints when the prose has none', () => {
        expect(entryToIntent({ content: 'Offering design.', author: 'a', intent: 'x', timestamp: 1 }).constraints).toEqual([]);
      });
    });

    describe('status mapping', () => {
      it.each([
        ['valid', 'pending'],
        ['pending', 'pending'],
        ['invalid', 'rejected'],
        ['accepted', 'accepted'],
        ['rejected', 'rejected'],
        ['closed', 'closed'],
        ['unalignable', 'unalignable'],
        ['ACCEPTED', 'accepted'],
        ['Closed', 'closed'],
        ['archived', 'pending'],
        ['', 'pending'],
      ])('maps metadata.status "%s" to "%s"', (status, expected) => {
        const intent = entryToIntent({ content: 'x', author: 'a', intent: 'x', timestamp: 1, metadata: { status } });

        expect(intent.status).toBe(expected);
      });

      it('falls back to validation_status when status is absent', () => {
        const intent = entryToIntent({
          content: 'x',
          author: 'a',
          intent: 'x',
          timestamp: 1,
          metadata: { validation_status: 'invalid' },
        });

        expect(intent.status).toBe('rejected');
      });

      it('prefers metadata.status over validation_status', () => {
        const intent = entryToIntent({
          content: 'x',
          author: 'a',
          intent: 'x',
          timestamp: 1,
          metadata: { status: 'accepted', validation_status: 'invalid' },
        });

        expect(intent.status).toBe('accepted');
      });
    });

    describe('malformed entries', () => {
      it('logs a warning but still transforms an entry that fails validation', () => {
        const intent = entryToIntent({ content: '', author: 'alice', intent: 'logo', timestamp: 5, metadata: { hash: 'h' } });

        expect(intent).toMatchObject({ hash: 'h', author: 'alice', prose: '', desires: ['logo'], timestamp: 5 });
        expect(warnSpy).toHaveBeenCalledWith(
          'Malformed NatLangChain entry, processing defensively',
          expect.objectContaining({
            author: 'alice',
            errors: [expect.stringMatching(/^content: /)],
          })
        );
      });

      it('truncates long authors to 50 characters in the warning', () => {
        const longAuthor = 'x'.repeat(300);

        entryToIntent({ content: 'Offering design.', author: longAuthor, intent: 'x', timestamp: 1 });

        const [, meta] = warnSpy.mock.calls[0];
        expect(meta.author).toBe('x'.repeat(50));
        expect(meta.errors).toEqual([expect.stringMatching(/^author: /)]);
      });

      it('omits a non-string author from the warning', () => {
        entryToIntent({ content: 'Offering design.', author: 42 as unknown as string, intent: 'x', timestamp: 1 });

        expect(warnSpy).toHaveBeenCalledWith(
          'Malformed NatLangChain entry, processing defensively',
          expect.objectContaining({ author: undefined })
        );
      });

      it('does not warn about well-formed entries', () => {
        entryToIntent({ content: 'Offering design.', author: 'a', intent: 'x', timestamp: 1 });

        expect(warnSpy).not.toHaveBeenCalled();
      });
    });
  });

  // ==========================================================================
  // intentToEntry
  // ==========================================================================

  describe('intentToEntry', () => {
    const intent: Intent = {
      hash: 'intent-1',
      author: 'alice',
      prose: 'I need a bakery logo. It must be vector.',
      desires: ['bakery logo', 'fast turnaround'],
      constraints: ['vector'],
      offeredFee: 4,
      timestamp: 1_700_000_000_000,
      status: 'accepted',
      branch: 'Design/Branding',
      flagCount: 2,
    };

    it('records every intent field in metadata as a pending offer contract', () => {
      expect(intentToEntry(intent)).toEqual({
        content: intent.prose,
        author: 'alice',
        intent: 'bakery logo',
        timestamp: intent.timestamp,
        metadata: {
          hash: 'intent-1',
          desires: ['bakery logo', 'fast turnaround'],
          constraints: ['vector'],
          offered_fee: 4,
          branch: 'Design/Branding',
          flag_count: 2,
          status: 'accepted',
          is_contract: true,
          contract_type: 'offer',
          validation_status: 'pending',
        },
      });
    });

    it('round-trips through entryToIntent without losing information', () => {
      expect(entryToIntent(intentToEntry(intent))).toEqual(intent);
    });
  });

  // ==========================================================================
  // Settlements / contracts
  // ==========================================================================

  describe('contractToSettlement', () => {
    it('fills defaults for every missing optional field', () => {
      jest.spyOn(Date, 'now').mockReturnValue(5_000_000);

      expect(contractToSettlement({})).toEqual({
        id: '',
        intentHashA: '',
        intentHashB: '',
        reasoningTrace: '',
        proposedTerms: { customTerms: undefined },
        facilitationFee: 0,
        facilitationFeePercent: 0,
        modelIntegrityHash: '',
        mediatorId: '',
        timestamp: 5_000_000,
        status: 'proposed',
        acceptanceDeadline: 5_000_000 + HOURS_72,
        partyAAccepted: false,
        partyBAccepted: false,
        challenges: [],
      });
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['open', 'proposed'],
      ['proposed', 'proposed'],
      ['accepted', 'accepted'],
      ['rejected', 'rejected'],
      ['closed', 'closed'],
      ['challenged', 'challenged'],
      ['ACCEPTED', 'accepted'],
      ['Challenged', 'challenged'],
      ['disputed', 'proposed'],
    ])('maps contract status "%s" to settlement status "%s"', (status, expected) => {
      expect(contractToSettlement({ contract_id: 'c', status }).status).toBe(expected);
    });

    it('converts snake_case challenges from the chain', () => {
      const contract: NatLangChainContract = {
        contract_id: 'c1',
        challenges: [
          {
            challenge_id: 'ch-1',
            settlement_id: 'c1',
            challenger_id: 'bob',
            contradiction_proof: 'violates budget',
            paraphrase_evidence: 'max $300',
            timestamp: 42,
            status: 'upheld',
            validators: ['v1', 'v2'],
          },
        ],
      };

      expect(contractToSettlement(contract).challenges).toEqual([
        {
          id: 'ch-1',
          settlementId: 'c1',
          challengerId: 'bob',
          contradictionProof: 'violates budget',
          paraphraseEvidence: 'max $300',
          timestamp: 42,
          status: 'upheld',
          validators: ['v1', 'v2'],
        },
      ]);
    });

    it('accepts camelCase challenges and defaults missing challenge fields', () => {
      jest.spyOn(Date, 'now').mockReturnValue(777);
      const contract: NatLangChainContract = {
        contract_id: 'c1',
        challenges: [
          {
            id: 'ch-2',
            settlementId: 'c1',
            challengerId: 'carol',
            contradictionProof: 'wrong deliverable',
            paraphraseEvidence: 'asked for SVG',
            timestamp: 43,
            status: 'rejected',
          },
          {},
        ],
      };

      expect(contractToSettlement(contract).challenges).toEqual([
        {
          id: 'ch-2',
          settlementId: 'c1',
          challengerId: 'carol',
          contradictionProof: 'wrong deliverable',
          paraphraseEvidence: 'asked for SVG',
          timestamp: 43,
          status: 'rejected',
          validators: [],
        },
        {
          id: '',
          settlementId: '',
          challengerId: '',
          contradictionProof: '',
          paraphraseEvidence: '',
          timestamp: 777,
          status: 'pending',
          validators: [],
        },
      ]);
    });

    it('logs a warning but still converts a contract that fails validation', () => {
      const settlement = contractToSettlement({ contract_id: 'c-bad', status: 'x'.repeat(60), timestamp: -1 });

      expect(settlement.id).toBe('c-bad');
      expect(settlement.status).toBe('proposed');
      expect(warnSpy).toHaveBeenCalledWith(
        'Malformed NatLangChain contract, processing defensively',
        expect.objectContaining({
          contractId: 'c-bad',
          errors: expect.arrayContaining([expect.stringMatching(/^status: /), expect.stringMatching(/^timestamp: /)]),
        })
      );
    });

    it('omits a non-string contract id from the warning', () => {
      contractToSettlement({ contract_id: 99 as unknown as string });

      expect(warnSpy).toHaveBeenCalledWith(
        'Malformed NatLangChain contract, processing defensively',
        expect.objectContaining({ contractId: undefined })
      );
    });
  });

  describe('settlementToContractProposal', () => {
    it('defaults the match score to 0.85 and folds identifiers into the terms', () => {
      expect(settlementToContractProposal(SETTLEMENT)).toEqual({
        offer_ref: 'hash-a',
        seek_ref: 'hash-b',
        proposal_content: SETTLEMENT.reasoningTrace,
        match_score: 0.85,
        facilitation_fee: 5,
        terms: {
          price: 400,
          deliverables: ['Logo'],
          timelines: '1 week',
          settlement_id: 'settlement-1',
          model_integrity_hash: 'model-hash-1',
        },
        mediator_id: 'mediator-1',
        timestamp: SETTLEMENT.timestamp,
        acceptance_deadline: SETTLEMENT.acceptanceDeadline,
      });
    });
  });

  describe('settlementToEntry', () => {
    it('includes stake reference and authority signature lines when present', () => {
      const entry = settlementToEntry(
        { ...SETTLEMENT, stakeReference: 'stake-9', authoritySignature: 'auth-sig-9' },
        'mediator-1'
      );

      expect(entry.content).toContain('Stake Reference: stake-9');
      expect(entry.content).toContain('Authority Signature: auth-sig-9');
    });

    it('omits stake and authority lines when absent and records settlement metadata', () => {
      const entry = settlementToEntry(SETTLEMENT, 'mediator-1');

      expect(entry.content).not.toContain('Stake Reference');
      expect(entry.content).not.toContain('Authority Signature');
      expect(entry.content).toContain('Facilitation Fee: 5% (20 NLC) to Mediator mediator-1');
      expect(entry.content).toContain('Model Integrity Hash: model-hash-1');
      expect(entry.content).toContain('Acceptance Deadline: 2023-11-17T22:13:20.000Z');
      expect(entry.content).toContain('Reasoning: Both parties want a logo delivered within a week.');
      expect(entry.timestamp).toBe(SETTLEMENT.timestamp);
      expect(entry.metadata).toEqual({
        is_contract: true,
        contract_type: 'proposal',
        settlement_id: 'settlement-1',
        intent_hash_a: 'hash-a',
        intent_hash_b: 'hash-b',
        facilitation_fee: 20,
        facilitation_fee_percent: 5,
        acceptance_deadline: SETTLEMENT.acceptanceDeadline,
      });
    });
  });

  // ==========================================================================
  // Challenges / burns
  // ==========================================================================

  describe('challengeToEntry', () => {
    it('embeds the proof and evidence and records challenge metadata', () => {
      const challenge: Challenge = {
        id: 'ch-1',
        settlementId: 'settlement-1',
        challengerId: 'bob',
        contradictionProof: 'Settlement price exceeds the stated budget.',
        paraphraseEvidence: 'Alice: "max $300"',
        timestamp: Date.UTC(2024, 0, 2, 3, 4, 5),
        status: 'upheld',
      };

      const entry = challengeToEntry(challenge, 'mediator-1');

      expect(entry.content).toContain('Contradiction Proof:\nSettlement price exceeds the stated budget.');
      expect(entry.content).toContain('Paraphrase Evidence:\nAlice: "max $300"');
      expect(entry.content).toContain('Submitted: 2024-01-02T03:04:05.000Z');
      expect(entry.timestamp).toBe(challenge.timestamp);
      expect(entry.metadata).toEqual({
        challenge_id: 'ch-1',
        settlement_id: 'settlement-1',
        challenger_id: 'bob',
        status: 'upheld',
      });
    });
  });

  describe('burnToEntry', () => {
    it('omits optional lines and stamps the current time when only required fields are given', () => {
      jest.useFakeTimers({
        now: new Date('2026-01-02T03:04:05.000Z'),
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });

      const entry = burnToEntry({ type: 'escalated', author: 'dave', amount: 3 }, 'mediator-1');

      expect(entry.content).toContain('Type: escalated');
      expect(entry.content).toContain('Author: dave');
      expect(entry.content).toContain('Amount: 3 NLC');
      expect(entry.content).not.toContain('Intent:');
      expect(entry.content).not.toContain('Settlement:');
      expect(entry.content).not.toContain('Multiplier:');
      expect(entry.content).toContain('Timestamp: 2026-01-02T03:04:05.000Z');
      expect(entry.timestamp).toBe(Date.parse('2026-01-02T03:04:05.000Z'));
      expect(entry.author).toBe('mediator-1');
      expect(entry.metadata).toEqual({
        burn_type: 'escalated',
        burn_author: 'dave',
        burn_amount: 3,
        intent_hash: undefined,
        settlement_id: undefined,
        multiplier: undefined,
      });
    });

    it('includes the settlement reference when given', () => {
      const entry = burnToEntry({ type: 'success', author: 'dave', amount: 1, settlementId: 'settlement-1' }, 'm');

      expect(entry.content).toContain('Settlement: settlement-1');
      expect(entry.metadata?.settlement_id).toBe('settlement-1');
    });
  });

  // ==========================================================================
  // parseIntentsFromResponse
  // ==========================================================================

  describe('parseIntentsFromResponse', () => {
    const chainEntry = { content: 'I need a logo.', author: 'alice', intent: 'logo', timestamp: 1, metadata: { hash: 'h-entry' } };
    const intentShaped: Intent = {
      hash: 'h-intent',
      author: 'bob',
      prose: 'Offering logo design.',
      desires: ['clients'],
      constraints: [],
      timestamp: 2,
      status: 'pending',
    };

    it('parses a { results } envelope', () => {
      const intents = parseIntentsFromResponse({ results: [chainEntry] });

      expect(intents.map(i => i.hash)).toEqual(['h-entry']);
    });

    it('returns already Intent-shaped items unchanged', () => {
      const [intent] = parseIntentsFromResponse([intentShaped]);

      expect(intent).toBe(intentShaped);
    });

    it('skips unrecognised items with a warning and keeps the rest', () => {
      const intents = parseIntentsFromResponse({
        entries: [
          chainEntry,
          { foo: 'bar' },
          { content: 'content without author' },
          { hash: 'h-x', author: 'carol' }, // no prose
          intentShaped,
        ],
      });

      expect(intents.map(i => i.hash)).toEqual(['h-entry', 'h-intent']);
      expect(warnSpy).toHaveBeenCalledTimes(3);
      expect(warnSpy).toHaveBeenCalledWith('Skipping unrecognized item in response', {
        hasContent: true,
        hasAuthor: false,
        hasHash: false,
      });
      expect(warnSpy).toHaveBeenCalledWith('Skipping unrecognized item in response', {
        hasContent: false,
        hasAuthor: true,
        hasHash: true,
      });
    });

    it('treats an item with both entry and intent fields as a chain entry', () => {
      const [intent] = parseIntentsFromResponse([{ ...chainEntry, prose: 'ignored', hash: 'ignored' }]);

      expect(intent.prose).toBe('I need a logo.');
      expect(intent.hash).toBe('h-entry');
    });

    it('skips envelope keys whose value is not an array', () => {
      expect(parseIntentsFromResponse({ entries: 'oops', intents: [chainEntry] }).map(i => i.hash)).toEqual(['h-entry']);
      expect(parseIntentsFromResponse({ entries: {}, intents: null, results: [intentShaped] })).toEqual([intentShaped]);
      expect(parseIntentsFromResponse({ results: 'nope' })).toEqual([]);
    });
  });
});
