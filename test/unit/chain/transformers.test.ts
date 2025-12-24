import {
  entryToIntent,
  intentToEntry,
  settlementToEntry,
  settlementToContractProposal,
  contractToSettlement,
  challengeToEntry,
  burnToEntry,
  parseIntentsFromResponse,
  NatLangChainEntry,
  NatLangChainContract,
} from '../../../src/chain/transformers';
import { Intent, ProposedSettlement, Challenge } from '../../../src/types';

describe('NatLangChain Transformers', () => {
  describe('entryToIntent', () => {
    it('should transform NatLangChain entry to Intent', () => {
      const entry: NatLangChainEntry = {
        content: 'I am looking for a skilled TypeScript developer to help with my project.',
        author: 'user123',
        intent: 'hire developer',
        timestamp: 1700000000000,
        metadata: {
          hash: 'abc123',
          offered_fee: 100,
          branch: 'Professional/Engineering',
          status: 'pending',
        },
      };

      const intent = entryToIntent(entry);

      expect(intent.hash).toBe('abc123');
      expect(intent.author).toBe('user123');
      expect(intent.prose).toBe('I am looking for a skilled TypeScript developer to help with my project.');
      expect(intent.timestamp).toBe(1700000000000);
      expect(intent.offeredFee).toBe(100);
      expect(intent.branch).toBe('Professional/Engineering');
      expect(intent.status).toBe('pending');
      expect(intent.desires).toContain('hire developer');
    });

    it('should extract desires from content when not in metadata', () => {
      const entry: NatLangChainEntry = {
        content: 'I am seeking a Python developer for a machine learning project.',
        author: 'user456',
        intent: 'find ML developer',
      };

      const intent = entryToIntent(entry);

      expect(intent.desires).toContain('find ML developer');
      expect(intent.desires.some(d => d.includes('Python developer'))).toBe(true);
    });

    it('should extract constraints from content', () => {
      const entry: NatLangChainEntry = {
        content: 'I need a developer. They must be available full-time. Cannot work remotely.',
        author: 'user789',
        intent: 'hire developer',
      };

      const intent = entryToIntent(entry);

      expect(intent.constraints.some(c => c.includes('available full-time'))).toBe(true);
    });

    it('should generate hash if not provided in metadata', () => {
      const entry: NatLangChainEntry = {
        content: 'This is a test entry with no metadata hash.',
        author: 'testuser',
        intent: 'test',
      };

      const intent = entryToIntent(entry);

      expect(intent.hash).toBeDefined();
      expect(intent.hash.length).toBeGreaterThan(0);
    });

    it('should map validation_status to IntentStatus', () => {
      const testCases = [
        { status: 'valid', expected: 'pending' },
        { status: 'pending', expected: 'pending' },
        { status: 'invalid', expected: 'rejected' },
        { status: 'accepted', expected: 'accepted' },
        { status: 'closed', expected: 'closed' },
      ];

      for (const { status, expected } of testCases) {
        const entry: NatLangChainEntry = {
          content: 'Test entry',
          author: 'test',
          intent: 'test',
          metadata: { validation_status: status as any },
        };

        const intent = entryToIntent(entry);
        expect(intent.status).toBe(expected);
      }
    });
  });

  describe('intentToEntry', () => {
    it('should transform Intent to NatLangChain entry', () => {
      const intent: Intent = {
        hash: 'xyz789',
        author: 'mediator1',
        prose: 'I want to collaborate on an open source project.',
        desires: ['collaborate on OSS', 'learn new skills'],
        constraints: ['must be in TypeScript'],
        offeredFee: 50,
        timestamp: 1700000000000,
        status: 'pending',
        branch: 'Technology/OpenSource',
        flagCount: 0,
      };

      const entry = intentToEntry(intent);

      expect(entry.content).toBe(intent.prose);
      expect(entry.author).toBe(intent.author);
      expect(entry.intent).toBe('collaborate on OSS');
      expect(entry.timestamp).toBe(intent.timestamp);
      expect(entry.metadata?.hash).toBe(intent.hash);
      expect(entry.metadata?.desires).toEqual(intent.desires);
      expect(entry.metadata?.constraints).toEqual(intent.constraints);
      expect(entry.metadata?.offered_fee).toBe(50);
      expect(entry.metadata?.is_contract).toBe(true);
      expect(entry.metadata?.contract_type).toBe('offer');
    });

    it('should handle intent with empty desires', () => {
      const intent: Intent = {
        hash: 'empty123',
        author: 'user',
        prose: 'A simple intent',
        desires: [],
        constraints: [],
        timestamp: Date.now(),
        status: 'pending',
      };

      const entry = intentToEntry(intent);

      expect(entry.intent).toBe('general intent');
    });
  });

  describe('settlementToEntry', () => {
    it('should transform ProposedSettlement to NatLangChain entry', () => {
      const settlement: ProposedSettlement = {
        id: 'settlement123',
        intentHashA: 'intentA',
        intentHashB: 'intentB',
        reasoningTrace: 'Both parties want to collaborate on a project',
        proposedTerms: {
          price: 1000,
          deliverables: ['Design doc', 'Implementation'],
        },
        facilitationFee: 50,
        facilitationFeePercent: 5,
        modelIntegrityHash: 'model123',
        mediatorId: 'mediator1',
        timestamp: 1700000000000,
        status: 'proposed',
        acceptanceDeadline: 1700086400000,
        partyAAccepted: false,
        partyBAccepted: false,
      };

      const entry = settlementToEntry(settlement, 'mediator1');

      expect(entry.content).toContain('[PROPOSED SETTLEMENT]');
      expect(entry.content).toContain('Settlement ID: settlement123');
      expect(entry.content).toContain('intentA');
      expect(entry.content).toContain('intentB');
      expect(entry.author).toBe('mediator1');
      expect(entry.intent).toBe('settlement_proposal');
      expect(entry.metadata?.settlement_id).toBe('settlement123');
      expect(entry.metadata?.is_contract).toBe(true);
      expect(entry.metadata?.contract_type).toBe('proposal');
    });
  });

  describe('settlementToContractProposal', () => {
    it('should transform settlement to NatLangChain contract proposal format', () => {
      const settlement: ProposedSettlement = {
        id: 'settlement456',
        intentHashA: 'offerA',
        intentHashB: 'seekB',
        reasoningTrace: 'Perfect match found',
        proposedTerms: { price: 500 },
        facilitationFee: 25,
        facilitationFeePercent: 5,
        modelIntegrityHash: 'hash456',
        mediatorId: 'med1',
        timestamp: 1700000000000,
        status: 'proposed',
        acceptanceDeadline: 1700100000000,
        partyAAccepted: false,
        partyBAccepted: false,
      };

      const proposal = settlementToContractProposal(settlement, 0.95);

      expect(proposal.offer_ref).toBe('offerA');
      expect(proposal.seek_ref).toBe('seekB');
      expect(proposal.proposal_content).toBe('Perfect match found');
      expect(proposal.match_score).toBe(0.95);
      expect(proposal.facilitation_fee).toBe(5);
      expect(proposal.mediator_id).toBe('med1');
      expect(proposal.terms.settlement_id).toBe('settlement456');
    });
  });

  describe('contractToSettlement', () => {
    it('should transform NatLangChain contract to ProposedSettlement', () => {
      const contract: NatLangChainContract = {
        contract_id: 'contract789',
        offer_ref: 'offer1',
        seek_ref: 'seek1',
        proposal_content: 'This settlement aligns both intents',
        facilitation_fee: 10,
        status: 'open',
        mediator_id: 'mediator2',
        timestamp: 1700000000000,
        acceptance_deadline: 1700200000000,
        party_a_accepted: true,
        party_b_accepted: false,
        terms: { custom: 'value' },
      };

      const settlement = contractToSettlement(contract);

      expect(settlement.id).toBe('contract789');
      expect(settlement.intentHashA).toBe('offer1');
      expect(settlement.intentHashB).toBe('seek1');
      expect(settlement.reasoningTrace).toBe('This settlement aligns both intents');
      expect(settlement.facilitationFee).toBe(10);
      expect(settlement.mediatorId).toBe('mediator2');
      expect(settlement.status).toBe('proposed');
      expect(settlement.partyAAccepted).toBe(true);
      expect(settlement.partyBAccepted).toBe(false);
      expect(settlement.proposedTerms.customTerms).toEqual({ custom: 'value' });
    });
  });

  describe('challengeToEntry', () => {
    it('should transform Challenge to NatLangChain entry', () => {
      const challenge: Challenge = {
        id: 'challenge123',
        settlementId: 'settlement123',
        challengerId: 'challenger1',
        contradictionProof: 'The settlement violates party A explicit constraint',
        paraphraseEvidence: 'Party A stated they cannot work weekends',
        timestamp: 1700000000000,
        status: 'pending',
      };

      const entry = challengeToEntry(challenge, 'mediator1');

      expect(entry.content).toContain('[CHALLENGE]');
      expect(entry.content).toContain('Challenge ID: challenge123');
      expect(entry.content).toContain('Settlement ID: settlement123');
      expect(entry.content).toContain('Challenger: challenger1');
      expect(entry.author).toBe('mediator1');
      expect(entry.intent).toBe('settlement_challenge');
      expect(entry.metadata?.challenge_id).toBe('challenge123');
    });
  });

  describe('burnToEntry', () => {
    it('should transform burn data to NatLangChain entry', () => {
      const burnData = {
        type: 'base_filing',
        author: 'user123',
        amount: 10,
        intentHash: 'intent123',
        multiplier: 2,
      };

      const entry = burnToEntry(burnData, 'mediator1');

      expect(entry.content).toContain('[BURN TRANSACTION]');
      expect(entry.content).toContain('Type: base_filing');
      expect(entry.content).toContain('Author: user123');
      expect(entry.content).toContain('Amount: 10 NLC');
      expect(entry.content).toContain('Intent: intent123');
      expect(entry.content).toContain('Multiplier: 2x');
      expect(entry.author).toBe('mediator1');
      expect(entry.intent).toBe('burn_transaction');
    });
  });

  describe('parseIntentsFromResponse', () => {
    it('should parse array response', () => {
      const response = [
        { content: 'Intent 1', author: 'user1', intent: 'test1' },
        { content: 'Intent 2', author: 'user2', intent: 'test2' },
      ];

      const intents = parseIntentsFromResponse(response);

      expect(intents.length).toBe(2);
      expect(intents[0].prose).toBe('Intent 1');
      expect(intents[1].prose).toBe('Intent 2');
    });

    it('should parse response with entries array', () => {
      const response = {
        entries: [
          { content: 'Entry 1', author: 'user1', intent: 'test1' },
        ],
      };

      const intents = parseIntentsFromResponse(response);

      expect(intents.length).toBe(1);
      expect(intents[0].prose).toBe('Entry 1');
    });

    it('should parse response with intents array', () => {
      const response = {
        intents: [
          { content: 'Intent content', author: 'user1', intent: 'seek' },
        ],
      };

      const intents = parseIntentsFromResponse(response);

      expect(intents.length).toBe(1);
    });

    it('should return empty array for invalid response', () => {
      const intents = parseIntentsFromResponse({});
      expect(intents).toEqual([]);
    });
  });
});
